import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabaseClient";
import { useViewerStore } from "./store";
import { validateUUID } from "./utils/validation";
import type { EventContract } from "./types/events";
import type { Proto, Screen, Scene, Hotspot, OverlayAction, NestedFrame, Edge } from "./types/proto";
import type { Transition } from "./types/proto";
import { isProtoV1, isProtoV2 } from "./types/proto";
import { getRenderer } from "./utils/renderer";
import { SceneRenderer } from "./components/SceneRenderer";
import { AnimatedScene } from "./components/AnimatedScene";
import { FigmaEmbedViewer } from "./components/FigmaEmbedViewer";
import { getCSSTransitionStyle } from "./utils/cssTransitions";
import "./TestView.css";
import { createMediaRecordingController, type MediaRecordingController } from "./lib/mediaRecording";
import { ArrowRight, CircleCheck, MoveRight } from "lucide-react";

// WebGazer.js: https://github.com/brownhci/WebGazer — API: https://github.com/brownhci/WebGazer/wiki/Top-Level-API
declare global {
  interface Window {
    webgazer?: {
      begin: () => Promise<void> | void;
      pause: () => void;
      resume: () => void;
      end: () => void;
      setGazeListener: (cb: (data: { x: number; y: number } | null, elapsedTime: number) => void) => unknown;
      clearGazeListener?: () => unknown;
      getCurrentPrediction?: () => { x: number; y: number } | null;
      showVideo?: (show: boolean) => void;
      showPredictionPoints?: (show: boolean) => void;
      detectCompatibility?: () => boolean;
      saveDataAcrossSessions?: (save: boolean) => unknown;
      setStaticVideo?: (videoElement: HTMLVideoElement | null) => unknown;
      setVideoElementCanvas?: (canvas: HTMLCanvasElement | null) => unknown;
    };
  }
}

interface GazeSample {
  ts: number;
  xNorm: number;
  yNorm: number;
  screenId: string | null;
}

// EMBED KIT 2.0: OAuth client-id для получения postMessage событий от Figma
// Зарегистрирован в Figma Developer Console: https://www.figma.com/developers/apps
// Разрешенные origins: http://localhost:5173 (dev), ваш продакшн домен
const FIGMA_CLIENT_ID = "Uzc6or1XaH3KXTUBYmOsLG";
const FIGMA_EMBED_HOST = "figma-analytics"; // Идентификатор приложения для Figma

// Все типы импортируются из ./types/proto
// Proto interface: ProtoV1 | ProtoV2 (unified type)

interface TestViewProps {
  sessionId: string | null;
  prototypeIdOverride?: string | null; // НОВОЕ: Опциональный override для prototypeId (для StudyView)
  instructionsOverride?: string | null; // НОВОЕ: Опциональный override для instructions (для StudyView)
  onComplete?: () => void; // НОВОЕ: Callback при завершении прототипа (для StudyView)
  onPermissionsComplete?: () => void; // Callback при завершении настройки разрешений (для PrototypeBlockWrapper)
  runIdOverride?: string | null; // НОВОЕ: Для StudyRunView - run_id
  blockIdOverride?: string | null; // НОВОЕ: Для StudyRunView - block_id
  studyIdOverride?: string | null; // НОВОЕ: Для StudyRunView - study_id
  enableEyeTracking?: boolean; // НОВОЕ: Включить экспериментальное отслеживание движений глаз
  recordScreen?: boolean;
  recordCamera?: boolean;
  recordAudio?: boolean;
  /** Скрыть задание над прототипом (показывается в сайдбаре PrototypeBlockWrapper) */
  hideTaskAbove?: boolean;
  /** Скрыть кнопку «Сдаться» под прототипом (показывается в сайдбаре PrototypeBlockWrapper) */
  hideGiveUpBelow?: boolean;
  /** Запись запускать только когда true (после клика «Начать» в сайдбаре задания). Если не передано — запись стартует при клике «Далее» на шаге разрешений. */
  startRecordingWhenReady?: boolean;
}

export default function TestView({ 
  sessionId: propSessionId, 
  prototypeIdOverride = null,
  instructionsOverride = null,
  onComplete = undefined,
  onPermissionsComplete = undefined,
  runIdOverride = null,
  blockIdOverride = null,
  studyIdOverride = null,
  enableEyeTracking = false,
  recordScreen = false,
  recordCamera = false,
  recordAudio = false,
  hideTaskAbove = false,
  hideGiveUpBelow = false,
  startRecordingWhenReady = false,
}: TestViewProps) {
  // sessionId используется через propSessionId
  const navigate = useNavigate();
  const params = useParams<{ prototypeId?: string; sessionId?: string }>();
  
  // Store selectors
  const {
    proto,
    currentScreen,
    testViewLoading,
    testViewError,
    isEmptyState,
    taskDescription,
    actualSessionId,
    debugOverlayEnabled,
    showSuccessPopup,
    setProto,
    setCurrentScreen,
    setTestViewLoading,
    setTestViewError,
    setIsEmptyState,
    setTaskDescription,
    setActualSessionId,
    setDebugOverlayEnabled,
    setShowSuccessPopup,
  } = useViewerStore();

  // Refs for functions without closure
  const currentScreenRef = useRef<string | null>(null);
  const screenHistoryRef = useRef<string[]>([]);
  const testCompleted = useRef<boolean>(false);
  
  // Local state for renderer (not shared)
  const [, setCurrentRenderer] = useState<"screen" | "scene">("screen");
  
  // ===== Запись экрана и камеры отдельно (два видео в отчёте) =====
  const [recordingCameraController, setRecordingCameraController] = useState<MediaRecordingController | null>(null);
  const [recordingScreenController, setRecordingScreenController] = useState<MediaRecordingController | null>(null);
  const recordingCameraControllerRef = useRef<MediaRecordingController | null>(null);
  const recordingScreenControllerRef = useRef<MediaRecordingController | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const uploadRecordingRef = useRef<(blob: Blob | null, type: "camera" | "screen") => Promise<void>>(() => Promise.resolve());
  recordingCameraControllerRef.current = recordingCameraController;
  recordingScreenControllerRef.current = recordingScreenController;

  // Остановка записей и треков при размонтировании (смена блока / закрытие)
  useEffect(() => {
    return () => {
      const camCtrl = recordingCameraControllerRef.current;
      const screenCtrl = recordingScreenControllerRef.current;
      const cam = cameraStreamRef.current;
      const screen = screenStreamRef.current;
      void (async () => {
        if (camCtrl) {
          const blob = await camCtrl.stop();
          if (blob) await uploadRecordingRef.current(blob, "camera");
        }
        if (screenCtrl) {
          const blob = await screenCtrl.stop();
          if (blob) await uploadRecordingRef.current(blob, "screen");
        }
      })();
      cam?.getTracks().forEach((t) => t.stop());
      screen?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Загрузка одной записи (камера или экран) в Supabase Storage
  const uploadRecording = useCallback(async (blob: Blob | null, type: "camera" | "screen") => {
    const currentSessionId = actualSessionId || propSessionId;
    if (!blob || !currentSessionId) return;
    try {
      const ts = Date.now();
      const filePath = `session-recordings/${currentSessionId}-${type}-${ts}.webm`;
      const { data, error } = await supabase.storage
        .from("recordings")
        .upload(filePath, blob, { contentType: "video/webm" });
      if (error) {
        console.error(`TestView: failed to upload ${type} recording`, {
          error,
          errorMessage: error.message,
          bucket: "recordings",
          filePath,
        });
        return;
      }
      if (!data) return;
      const { data: publicUrlData } = supabase.storage.from("recordings").getPublicUrl(data.path);
      const url = publicUrlData?.publicUrl;
      if (!url) return;
      const column = type === "camera" ? "recording_url" : "recording_screen_url";
      const { error: updateError } = await supabase.from("sessions").update({ [column]: url }).eq("id", currentSessionId);
      if (updateError) {
        console.error(`TestView: failed to update session with ${column}`, updateError);
      } else {
        console.log(`TestView: ${type} recording uploaded`, { sessionId: currentSessionId });
      }
    } catch (err) {
      console.error(`TestView: error saving ${type} recording`, err instanceof Error ? err.message : String(err));
    }
  }, [actualSessionId, propSessionId]);

  // ДИАГНОСТИКА: Логируем изменения showSuccessPopup
  useEffect(() => {
    console.log("TestView: showSuccessPopup changed", { showSuccessPopup, currentScreen, protoEnd: proto?.end });
  }, [showSuccessPopup, currentScreen, proto]);

  // Завершение прототипа: остановка обеих записей, загрузка, остановка треков, затем onComplete после 2s
  useEffect(() => {
    if (!showSuccessPopup || !testCompleted.current || !onComplete) return;
    let cancelled = false;
    void (async () => {
      console.log("TestView: Prototype completed, stopping recording and uploading");
      stopEyeTracking();
      if (recordingCameraController) {
        const blob = await recordingCameraController.stop();
        await uploadRecording(blob, "camera");
        if (cancelled) return;
      }
      if (recordingScreenController) {
        const blob = await recordingScreenController.stop();
        await uploadRecording(blob, "screen");
        if (cancelled) return;
      }
      setRecordingCameraController(null);
      setRecordingScreenController(null);
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (cameraPreviewPopupRef.current && !cameraPreviewPopupRef.current.closed) {
        cameraPreviewPopupRef.current.close();
        cameraPreviewPopupRef.current = null;
      }
      await new Promise((r) => setTimeout(r, 2000));
      if (cancelled) return;
      console.log("TestView: Calling onComplete callback");
      onComplete();
    })();
    return () => {
      cancelled = true;
    };
  }, [showSuccessPopup, onComplete, recordingCameraController, recordingScreenController, uploadRecording]);
  
  // Helper функции для работы с v1/v2 прототипами
  const getScreenOrScene = (proto: Proto | null, id: string): Screen | Scene | null => {
    if (!proto) return null;
    if (isProtoV1(proto)) {
      return proto.screens.find(s => s.id === id) || null;
    } else if (isProtoV2(proto)) {
      return proto.scenes.find(s => s.id === id) || null;
    }
    return null;
  };
  
  const getAllScreensOrScenes = (proto: Proto | null): (Screen | Scene)[] => {
    if (!proto) return [];
    if (isProtoV1(proto)) {
      return proto.screens;
    } else if (isProtoV2(proto)) {
      return proto.scenes;
    }
    return [];
  };
  
  const hasScreenOrScene = (proto: Proto | null, id: string): boolean => {
    if (!proto) return false;
    if (isProtoV1(proto)) {
      return proto.screens.some(s => s.id === id);
    } else if (isProtoV2(proto)) {
      return proto.scenes.some(s => s.id === id);
    }
    return false;
  };
  
  // НОВОЕ: State для overlay stack
  // Каждый элемент стека содержит screenId и overlay settings
  interface OverlayState {
    screenId: string;
    settings: OverlayAction;
    parentScreenId: string; // Экран, на котором был открыт overlay
    hotspotId?: string; // ID hotspot, который вызвал overlay (для MANUAL позиции)
  }
  const [overlayStack, setOverlayStack] = useState<OverlayState[]>([]);
  // Отслеживаем hover-overlay для правильного закрытия при уходе курсора
  const hoverOverlayRef = useRef<string | null>(null);
  // Задержка перед закрытием overlay при уходе курсора (для предотвращения мерцания)
  const hoverLeaveTimeoutRef = useRef<number | null>(null);
  // Отслеживаем, находится ли курсор над overlay (для предотвращения мерцания)
  const isHoveringOverlayRef = useRef<boolean>(false);
  
  const hasRecordedClosed = useRef<boolean>(false);
  // Таймаут неактивности сессии: используется для авто‑закрытия \"зависших\" прототипов
  const SESSION_INACTIVITY_TIMEOUT_MS = (Number(import.meta.env.VITE_SESSION_INACTIVITY_TIMEOUT_SECONDS || "60") || 60) * 1000;
  const INACTIVITY_CHECK_INTERVAL_MS = 30000; // 30s между проверками
  const lastActivityAtRef = useRef<number>(Date.now());
  const inactivityIntervalRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gazeBufferRef = useRef<GazeSample[]>([]);
  const gazeFlushIntervalRef = useRef<number | null>(null);

  // ===== Запись экрана/камеры/голоса =====
  const [permissionStep, setPermissionStep] = useState<0 | 1 | 2 | 3>(0); // 0 - не требуется, 1/2 - шаги, 3 - финальный экран
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [readyToStartTest, setReadyToStartTest] = useState<boolean>(false);

  // Превью камеры в отдельном окне, чтобы не попадать в запись экрана (getDisplayMedia захватывает только вкладку)
  const cameraPreviewPopupRef = useRef<Window | null>(null);
  // cameraPreviewVideoRef removed - not used

  cameraStreamRef.current = cameraStream;
  screenStreamRef.current = screenStream;
  uploadRecordingRef.current = uploadRecording;

  useEffect(() => {
    console.log("TestView: useEffect - checking recording requirements", { recordScreen, recordCamera, recordAudio, enableEyeTracking });
    // #region agent log
    // Для eye tracking также нужна камера, поэтому включаем в логику шагов
    const needsCamera = recordCamera || enableEyeTracking;
    const onlyScreen = recordScreen && !needsCamera && !recordAudio;
    const step = (recordScreen || needsCamera || recordAudio) ? (onlyScreen ? 2 : 1) : 0;
    fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:recording useEffect',message:'recording requirements',data:{recordScreen,recordCamera,recordAudio,enableEyeTracking,needsCamera,onlyScreen,stepSet:step},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H2'})}).catch(()=>{});
    // #endregion
    if (recordScreen || needsCamera || recordAudio) {
      // Если включена только запись экрана — сразу показываем шаг 2 (запрос экрана). Иначе — шаг 1 (камера/микрофон/eye tracking).
      setPermissionStep(onlyScreen ? 2 : 1);
      setReadyToStartTest(false);
    } else {
      setPermissionStep(0);
      setReadyToStartTest(true);
    }
  }, [recordScreen, recordCamera, recordAudio, enableEyeTracking]);

  // Превью камеры отображается в отдельном окне (CameraPreviewPopup), поток для записи остаётся в этой вкладке

  // Закрытие окна превью камеры при размонтировании
  useEffect(() => {
    return () => {
      if (cameraPreviewPopupRef.current && !cameraPreviewPopupRef.current.closed) {
        cameraPreviewPopupRef.current.close();
        cameraPreviewPopupRef.current = null;
      }
    };
  }, []);

  // Определяем prototypeId из URL или override
  // ВАЖНО: prototypeIdOverride имеет приоритет над URL (для StudyView)
  const urlPrototypeId = prototypeIdOverride || params.prototypeId || null;
  
  // Используем актуальный sessionId (из props или из state)
  // const sessionId = actualSessionId || propSessionId; // Не используется напрямую, используем actualSessionId или propSessionId

  // Загружаем прототип по prototypeId из URL
  useEffect(() => {
    if (urlPrototypeId) {
      // Если прототип еще не загружен, загружаем его по urlPrototypeId
      if (!proto && !testViewLoading) {
        console.log("TestView: Loading prototype from URL prototypeId:", urlPrototypeId);
        loadPrototypeByPrototypeId(urlPrototypeId);
      }
    } else {
      // Если нет prototypeId в URL, показываем дружелюбный empty state
      setIsEmptyState(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPrototypeId]);

  // ======== WebGazer.js eye-tracking (https://github.com/brownhci/WebGazer, https://webgazer.cs.brown.edu/#examples) ========
  // API: setGazeListener(callback), begin(), pause(), end(); callback(data, elapsedTime) — data.x/y в пикселях viewport.

  async function loadWebgazerScript(): Promise<typeof window.webgazer | null> {
    if (typeof window === "undefined") return null;
    if (window.webgazer) return window.webgazer;

    return new Promise((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-webgazer="true"]');
      if (existing) {
        if (window.webgazer) {
          resolve(window.webgazer);
          return;
        }
        existing.addEventListener("load", () => resolve(window.webgazer || null));
        existing.addEventListener("error", () => resolve(null));
        return;
      }

      const script = document.createElement("script");
      // Self-host WebGazer so MediaPipe assets load from same origin
      script.src = "/webgazer.js";
      script.async = true;
      script.defer = true;
      script.dataset.webgazer = "true";
      console.log("TestView: Loading WebGazer from", script.src, "page URL:", window.location.href);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:loadWebgazerScript',message:'loading webgazer',data:{src:script.src,pageUrl:window.location.href},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H9-webgazer-load'})}).catch(()=>{});
      // #endregion
      script.onload = () => {
        console.log("TestView: WebGazer loaded successfully");
        resolve(window.webgazer || null);
      };
      script.onerror = () => {
        console.error("TestView: Failed to load local webgazer.js, trying CDN fallback");
        // Fallback to CDN if local file not available
        const fallbackScript = document.createElement("script");
        fallbackScript.src = "https://webgazer.cs.brown.edu/webgazer.js";
        fallbackScript.async = true;
        fallbackScript.dataset.webgazer = "true";
        fallbackScript.onload = () => resolve(window.webgazer || null);
        fallbackScript.onerror = () => resolve(null);
        document.head.appendChild(fallbackScript);
      };
      document.head.appendChild(script);
    });
  }

  // Отслеживаем состояние WebGazer: 'none' | 'initializing' | 'running' | 'paused' | 'failed'
  const webgazerStateRef = useRef<'none' | 'initializing' | 'running' | 'paused' | 'failed'>('none');

  async function startEyeTracking() {
    // #region agent log
    const hasCamera = !!cameraStreamRef.current;
    fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:startEyeTracking entry',message:'eye tracking start',data:{hasCamera,state:webgazerStateRef.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4-H5'})}).catch(()=>{});
    // #endregion
    
    // Если уже работает — ничего не делаем
    if (webgazerStateRef.current === 'running' || webgazerStateRef.current === 'initializing') {
      console.log("TestView: WebGazer already running or initializing, skipping");
      return;
    }
    
    // Если был на паузе — возобновляем (без переинициализации MediaPipe)
    if (webgazerStateRef.current === 'paused' && window.webgazer) {
      console.log("TestView: Resuming paused WebGazer");
      try {
        // ВАЖНО: Перерегистрируем gaze listener перед resume
        // Он мог быть потерян или не работать после pause
        let gazeDataCount = 0;
        window.webgazer.setGazeListener((data: { x: number; y: number } | null, _elapsedTime: number) => {
          if (!data) return;
          const vw = window.innerWidth || 1;
          const vh = window.innerHeight || 1;
          const xNorm = Math.min(1, Math.max(0, data.x / vw));
          const yNorm = Math.min(1, Math.max(0, data.y / vh));

          gazeBufferRef.current.push({
            ts: Date.now(),
            xNorm,
            yNorm,
            screenId: currentScreenRef.current,
          });
          
          gazeDataCount++;
          if (gazeDataCount === 1 || gazeDataCount % 50 === 0) {
            console.log("TestView: Gaze data (resumed)", { count: gazeDataCount, xNorm, yNorm });
          }
        });
        
        window.webgazer.resume?.();
        webgazerStateRef.current = 'running';
        console.log("TestView: WebGazer resumed successfully");
        
        // Перезапускаем flush interval
        if (gazeFlushIntervalRef.current === null) {
          gazeFlushIntervalRef.current = window.setInterval(() => {
            flushGazeBuffer();
          }, 750);
        }
        return;
      } catch (err) {
        console.warn("TestView: Failed to resume WebGazer, will try full init", err);
        webgazerStateRef.current = 'failed'; // Помечаем как failed чтобы попробовать полную инициализацию
        // Продолжаем к полной инициализации
      }
    }
    
    // Если уже была ошибка — попробуем сбросить состояние и инициализировать заново
    if (webgazerStateRef.current === 'failed') {
      console.warn("TestView: WebGazer previously failed. Attempting fresh initialization...");
      // Пробуем очистить старый WebGazer если он есть
      try {
        if (window.webgazer) {
          window.webgazer.clearGazeListener?.();
          window.webgazer.end?.();
        }
      } catch (cleanupErr) {
        console.warn("TestView: Error cleaning up old WebGazer:", cleanupErr);
      }
      // Сбрасываем состояние для свежей инициализации
      webgazerStateRef.current = 'none';
    }
    
    webgazerStateRef.current = 'initializing';
    try {
      const webgazer = await loadWebgazerScript();
      if (!webgazer) {
        webgazerStateRef.current = 'failed';
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:startEyeTracking',message:'webgazer null',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        console.warn("TestView: WebGazer.js не загрузился. Трекинг глаз недоступен в этом браузере (экспериментальная функция).");
        return;
      }

      if (webgazer.detectCompatibility && !webgazer.detectCompatibility()) {
        webgazerStateRef.current = 'failed';
        console.warn("TestView: WebGazer.detectCompatibility() = false. Браузер не поддерживает трекинг глаз.");
        return;
      }

      // Каждая сессия теста — независимая калибровка (не подгружаем данные из IndexedDB предыдущих пользователей)
      if (webgazer.saveDataAcrossSessions) webgazer.saveDataAcrossSessions(false);
      if (webgazer.showVideo) webgazer.showVideo(false);
      if (webgazer.showPredictionPoints) webgazer.showPredictionPoints(false);

      // WebGazer сам получит поток с камеры через getUserMedia()
      // ВАЖНО: record_camera и eye_tracking_enabled взаимоисключающие в UI,
      // поэтому WebGazer получает эксклюзивный доступ к камере (нет конфликта потоков)
      console.log("TestView: WebGazer получает эксклюзивный доступ к камере (record_camera отключена)");
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:before webgazer.begin',message:'webgazer configured, calling begin()',data:{hasRecordCamera:recordCamera,hasExistingCameraStream:!!cameraStreamRef.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6-exclusive-camera'})}).catch(()=>{});
      // #endregion

      let gazeDataCount = 0;
      webgazer.setGazeListener((data, _elapsedTime) => {
        if (!data) return;
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;
        const xNorm = Math.min(1, Math.max(0, data.x / vw));
        const yNorm = Math.min(1, Math.max(0, data.y / vh));

        gazeBufferRef.current.push({
          ts: Date.now(),
          xNorm,
          yNorm,
          screenId: currentScreenRef.current,
        });
        
        gazeDataCount++;
        // Log every 50th gaze point to avoid flooding
        // #region agent log
        if (gazeDataCount === 1 || gazeDataCount % 50 === 0) {
          fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:gazeListener',message:'gaze data received',data:{count:gazeDataCount,xNorm,yNorm,bufferSize:gazeBufferRef.current.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6-gaze-capture'})}).catch(()=>{});
        }
        // #endregion
      });

      // Отложенный вызов begin() чтобы дать время MediaPipe/Emscripten полностью инициализироваться
      // Увеличенная задержка (2000ms) помогает избежать ошибки "Cannot read properties of undefined (reading 'buffer')"
      // которая возникает когда Module.HEAP ещё не инициализирован
      await new Promise<void>((resolve) => {
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(() => resolve(), { timeout: 2000 });
        } else {
          setTimeout(resolve, 1500);
        }
      });

      // Retry logic для webgazer.begin() - MediaPipe иногда не успевает инициализироваться
      const maxRetries = 3;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`TestView: webgazer.begin() attempt ${attempt}/${maxRetries}`);
          await webgazer.begin();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:after webgazer.begin',message:'webgazer.begin() SUCCESS',data:{attempt},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6-exclusive-camera'})}).catch(()=>{});
          // #endregion
          lastError = null;
          break; // Success - exit retry loop
        } catch (beginErr) {
          lastError = beginErr;
          console.warn(`TestView: webgazer.begin() attempt ${attempt} failed:`, beginErr);
          if (attempt < maxRetries) {
            // Ждём перед следующей попыткой
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      
      if (lastError) {
        throw lastError; // Re-throw last error if all retries failed
      }

      webgazerStateRef.current = 'running';
      if (gazeFlushIntervalRef.current === null) {
        gazeFlushIntervalRef.current = window.setInterval(() => {
          flushGazeBuffer();
        }, 750);
      }
    } catch (err) {
      webgazerStateRef.current = 'failed';
      // #region agent log
      const errMsg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : (err && typeof err === 'object' && 'constructor' in err ? (err as Error).constructor?.name : 'unknown');
      fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:startEyeTracking catch',message:'eye tracking error',data:{errMsg,errName,stack:err instanceof Error ? err.stack?.slice(0,200) : undefined},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4-H5'})}).catch(()=>{});
      // #endregion
      // WebGazer/MediaPipe может падать (404, Module.arguments, "No stream") — не ломаем тест, одно предупреждение
      console.warn("TestView: Трекинг глаз недоступен в этом браузере (экспериментальная функция). Ошибка:", errMsg);
    }
  }

  async function flushGazeBuffer() {
    if (!runIdOverride || !blockIdOverride || !studyIdOverride) return;
    const currentSessionId = actualSessionId || propSessionId;
    if (!currentSessionId) return;

    const buffer = gazeBufferRef.current;
    if (!buffer.length) return;
    gazeBufferRef.current = [];

    const payload = buffer.map((sample) => ({
      session_id: currentSessionId,
      run_id: runIdOverride,
      block_id: blockIdOverride,
      study_id: studyIdOverride,
      screen_id: sample.screenId,
      ts_ms: sample.ts,
      x_norm: sample.xNorm,
      y_norm: sample.yNorm,
    }));

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:flushGazeBuffer',message:'flushing gaze to supabase',data:{pointCount:payload.length,sessionId:currentSessionId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6-gaze-save'})}).catch(()=>{});
    // #endregion

    try {
      const { error } = await supabase.from("gaze_points").insert(payload);
      if (error) {
        console.error("TestView: Error inserting gaze_points batch", error);
      }
    } catch (err) {
      console.error("TestView: Unexpected error inserting gaze_points", err);
    }
  }

  function stopEyeTracking(fullStop = false) {
    try {
      if (typeof window !== "undefined" && window.webgazer) {
        // Только pause, не end — MediaPipe WASM нельзя переинициализировать
        // end() вызываем только при полном размонтировании
        window.webgazer.pause?.();
        if (fullStop) {
          window.webgazer.clearGazeListener?.();
          window.webgazer.end?.();
          webgazerStateRef.current = 'none';
        } else if (webgazerStateRef.current === 'running') {
          webgazerStateRef.current = 'paused';
        }
        console.log("TestView: WebGazer stopped", { fullStop, newState: webgazerStateRef.current });
      }
    } catch (err) {
      console.error("TestView: Error stopping WebGazer", err);
    }
    if (gazeFlushIntervalRef.current !== null) {
      clearInterval(gazeFlushIntervalRef.current);
      gazeFlushIntervalRef.current = null;
    }
    // Последний flush буфера
    void flushGazeBuffer();
  }

  // Управление жизненным циклом eye-tracking: старт только после «Далее» (в handleStart), здесь только остановка
  useEffect(() => {
    if (!enableEyeTracking) {
      // Просто пауза — можно возобновить если пользователь включит eye tracking снова
      stopEyeTracking(false);
      return;
    }
    return () => {
      // Полная остановка при unmount компонента
      stopEyeTracking(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableEyeTracking, runIdOverride, blockIdOverride, studyIdOverride]);
  
  // Обновляем actualSessionId когда propSessionId меняется (для аналитики)
  useEffect(() => {
    if (propSessionId && propSessionId !== actualSessionId) {
      console.log("TestView: SessionId updated from props:", propSessionId, "previous:", actualSessionId);
      setActualSessionId(propSessionId);
    } else if (!propSessionId && actualSessionId) {
      console.log("TestView: SessionId cleared (user signed out)");
      setActualSessionId(null);
    }
  }, [propSessionId, actualSessionId]);

  // Загружаем прототип напрямую по prototypeId (когда sessionId еще не создан или пользователь вышел)
  // КРИТИЧНО: Эта функция должна работать БЕЗ авторизации - прототип доступен всем
  async function loadPrototypeByPrototypeId(prototypeId: string) {
    setTestViewLoading(true);
    setTestViewError(null);

    try {
      // Валидация prototypeId перед запросом к БД
      validateUUID(prototypeId, "prototypeId");

      console.log("TestView: Loading prototype directly by prototypeId (always accessible):", prototypeId);

      // Получаем прототип по prototype_id (включая task_description)
      // КРИТИЧНО: Этот запрос должен работать БЕЗ авторизации (RLS политики должны разрешать чтение для всех)
      const { data: prototype, error: protoError } = await supabase
        .from("prototypes")
        .select("data, task_description")
        .eq("id", prototypeId)
        .maybeSingle();

      if (protoError) {
        console.error("TestView: Error loading prototype by prototypeId:", protoError);
        // Если ошибка связана с авторизацией, это проблема RLS политик
        if (protoError.message.includes("permission") || protoError.message.includes("policy")) {
          throw new Error(`Прототип недоступен: проверьте настройки доступа. Ошибка: ${protoError.message}`);
        }
        throw new Error(`Ошибка загрузки прототипа: ${protoError.message}`);
      }

      if (!prototype || !prototype.data) {
        throw new Error("Прототип не найден");
      }

      // Устанавливаем прототип и задание
      const protoData = prototype.data as Proto;
      
      // НОВОЕ: Определяем renderer после загрузки прототипа
      const queryParams = new URLSearchParams(window.location.search);
      const renderer = getRenderer(protoData, queryParams) || "screen";
      setCurrentRenderer(renderer);
      
      // КРИТИЧНО: Проверяем, что start существует (для v1 в screens, для v2 в scenes)
      const startScreenOrScene = getScreenOrScene(protoData, protoData.start);
      if (!startScreenOrScene) {
        const allScreensOrScenes = getAllScreensOrScenes(protoData);
        console.error("TestView: Start screen/scene not found in prototype", {
          start: protoData.start,
          availableScreensOrScenes: allScreensOrScenes.map(s => ({ id: s.id, name: s.name }))
        });
        throw new Error(`Стартовый экран/сцена не найден в прототипе. ID: ${protoData.start}`);
      }
      
      // Логирование в зависимости от версии
      if (isProtoV1(protoData)) {
        const startScreen = startScreenOrScene as Screen;
        console.log("TestView: Setting prototype (v1) and start screen", {
          start: protoData.start,
          startScreenName: startScreen.name,
          totalScreens: protoData.screens.length,
          screenIds: protoData.screens.map(s => s.id),
          renderer: renderer
        });
      } else if (isProtoV2(protoData)) {
        const startScene = startScreenOrScene as Scene;
        console.log("TestView: Setting prototype (v2) and start scene", {
          start: protoData.start,
          startSceneName: startScene.name,
          totalScenes: protoData.scenes.length,
          sceneIds: protoData.scenes.map(s => s.id),
          renderer: renderer
        });
      }
      
      console.log("TestView: Setting prototype", {
        start: protoData.start,
        startName: startScreenOrScene.name,
        total: isProtoV1(protoData) ? protoData.screens.length : protoData.scenes.length,
        ids: getAllScreensOrScenes(protoData).map(s => s.id),
        totalHotspots: protoData.hotspots?.length || 0,
        hotspotsWithOverlayAction: protoData.hotspots?.filter((h: Hotspot) => h.overlayAction).length || 0,
        sampleHotspots: protoData.hotspots?.slice(0, 5).map((h: Hotspot) => ({
          id: h.id,
          name: h.name,
          frame: h.frame,
          target: h.target,
          hasOverlayAction: !!h.overlayAction,
          overlayActionType: h.overlayAction?.type
        })) || [],
        // НОВОЕ: Логируем метаданные Figma для диагностики
        figmaMetadata: {
          hasFigmaFileId: !!protoData.figmaFileId,
          figmaFileId: protoData.figmaFileId,
          hasFigmaStartNodeId: !!protoData.figmaStartNodeId,
          figmaStartNodeId: protoData.figmaStartNodeId,
          hasFigmaFileName: !!protoData.figmaFileName,
          figmaFileName: protoData.figmaFileName,
          startScreenFigmaNodeId: "figmaNodeId" in startScreenOrScene ? startScreenOrScene.figmaNodeId : null
        }
      });
      
      setProto(protoData);
      setCurrentScreen(protoData.start);
      setTaskDescription(prototype.task_description || null);
      
      // КРИТИЧНО: Сбрасываем testCompleted при загрузке нового прототипа
      // Это необходимо, чтобы пользователь мог пройти прототип заново
      testCompleted.current = false;
      setShowSuccessPopup(false);
      // КРИТИЧНО: Сбрасываем историю переходов при загрузке нового прототипа
      screenHistoryRef.current = [];
      console.log("TestView: Reset testCompleted and screen history for new prototype", {
        prototypeId,
        startScreen: protoData.start,
        endScreen: protoData.end
      });
      
      console.log("TestView: Prototype loaded successfully by prototypeId (always accessible)", {
        currentScreen: protoData.start,
        protoSet: true
      });

    } catch (err) {
      console.error("Error loading prototype by prototypeId:", err);
      setTestViewError(err instanceof Error ? err.message : "Ошибка загрузки прототипа");
    } finally {
      setTestViewLoading(false);
    }
  }

  // ВАЖНО: Функция для определения активного screen ID
  // Если hotspot находится внутри overlay, возвращаем overlay screen ID
  // Иначе возвращаем currentScreen (основной экран)
  // КРИТИЧНО: Добавлены fallback'и для правильного определения экрана
  function getActiveScreenId(hotspot: Hotspot | null = null, screenId?: string): string | null {
    // КРИТИЧНО: Используем currentScreenRef для получения актуального значения currentScreen
    const actualCurrentScreen = currentScreenRef.current || currentScreen;
    
    // Если передан screenId (для кликов в пустую область или скролла), проверяем overlay
    if (screenId) {
      // Проверяем, является ли этот screenId overlay-экраном
      for (const overlay of overlayStack) {
        if (screenId === overlay.screenId) {
          // Это overlay screen
          return overlay.screenId;
        }
      }
      // Это основной экран - используем actualCurrentScreen с fallback на screenId
      return actualCurrentScreen || screenId;
    }
    
    // Если передан hotspot, проверяем, находится ли он внутри overlay
    if (hotspot) {
      for (const overlay of overlayStack) {
        if (hotspot.frame === overlay.screenId) {
          // Hotspot находится внутри этого overlay
          return overlay.screenId;
        }
      }
      // КРИТИЧНО: Fallback - если hotspot.frame не совпадает с overlay, проверяем currentScreen
      // Это необходимо для случаев, когда hotspot.frame устарел
      if (hotspot.frame && actualCurrentScreen) {
        // Если hotspot.frame совпадает с currentScreen, используем currentScreen
        if (hotspot.frame === actualCurrentScreen) {
          return actualCurrentScreen;
        }
      }
      // Fallback на hotspot.frame, если currentScreen не определен
      return hotspot.frame || actualCurrentScreen;
    }
    
    // Hotspot находится на основном экране или hotspot не передан
    // КРИТИЧНО: Используем actualCurrentScreen с fallback
    return actualCurrentScreen;
  }

  async function recordEvent(
    type: string, 
    screen: string | null, 
    hotspot: string | null = null, 
    useBeacon: boolean = false, 
    x?: number, 
    y?: number,
    scrollData?: { scrollX?: number; scrollY?: number; scrollDepthX?: number; scrollDepthY?: number; scrollDirection?: string; scrollType?: "vertical" | "horizontal" | "both" | null; isNested?: boolean; frameId?: string },
    overlayData?: { overlayId?: string; position?: string; closeMethod?: string; oldOverlayId?: string; newOverlayId?: string },
    transitionData?: { transitionRequested?: string; transitionEffective?: string; transitionDuration?: number }
  ) {
    // Любая запись события считается пользовательской активностью
    lastActivityAtRef.current = Date.now();
    // Используем актуальный sessionId из state
    const currentSessionId = actualSessionId || propSessionId;
    if (!currentSessionId) {
      console.warn("TestView: Cannot record event, sessionId is null");
      return;
    }
    // Не записываем новые события после завершения теста (кроме closed и completed)
    if (testCompleted.current && type !== "completed" && type !== "closed") {
      console.log("TestView: Test completed, ignoring event", { type });
      return;
    }
    console.log("TestView: Recording event", { type, screen, hotspot, sessionId: currentSessionId, useBeacon, x, y, scrollData });
    
    // НОВОЕ: Определяем renderer для metadata
    const queryParams = new URLSearchParams(window.location.search);
    const renderer = getRenderer(proto, queryParams);
    
    // КРИТИЧНО: Явно устанавливаем user_id = NULL для anonymous сессий
    // Это необходимо для работы RLS политик "Anonymous can insert events"
    const eventData: EventContract = {
      session_id: currentSessionId,
      event_type: type,
      timestamp: new Date().toISOString(),
      screen_id: screen,
      hotspot_id: hotspot,
      user_id: null, // Явно устанавливаем NULL для anonymous пользователей
      // НОВОЕ: Добавляем run_id, block_id, study_id для Study Runs (если переданы)
      run_id: runIdOverride || null,
      block_id: blockIdOverride || null,
      study_id: studyIdOverride || null,
      metadata: {
        renderer: renderer,
        proto_version: proto?.protoVersion || "v1"
      }
    };
    
    // Добавляем координаты, если они переданы (для кликов в пустую область)
    if (x !== undefined && y !== undefined) {
      eventData.x = x;
      eventData.y = y;
    }
    
    // Добавляем данные скролла, если они переданы
    if (scrollData) {
      if (scrollData.scrollX !== undefined) eventData.scroll_x = scrollData.scrollX;
      if (scrollData.scrollY !== undefined) eventData.scroll_y = scrollData.scrollY;
      if (scrollData.scrollDepthX !== undefined) eventData.scroll_depth_x = scrollData.scrollDepthX;
      if (scrollData.scrollDepthY !== undefined) eventData.scroll_depth_y = scrollData.scrollDepthY;
      if (scrollData.scrollDirection) eventData.scroll_direction = scrollData.scrollDirection;
      if (scrollData.scrollType) eventData.scroll_type = scrollData.scrollType; // Тип скролла: vertical, horizontal, both
      if (scrollData.isNested !== undefined) eventData.is_nested = scrollData.isNested;
      if (scrollData.frameId) eventData.frame_id = scrollData.frameId;
    }
    
    // НОВОЕ: Добавляем данные overlay, если они переданы
    if (overlayData) {
      if (overlayData.overlayId) eventData.overlay_id = overlayData.overlayId;
      if (overlayData.position) eventData.overlay_position = overlayData.position;
      if (overlayData.closeMethod) eventData.overlay_close_method = overlayData.closeMethod;
      if (overlayData.oldOverlayId) eventData.overlay_old_id = overlayData.oldOverlayId;
      if (overlayData.newOverlayId) eventData.overlay_new_id = overlayData.newOverlayId;
    }
    
    // НОВОЕ: Добавляем данные transition в metadata для screen_load событий
    if (transitionData && type === "screen_load") {
      if (!eventData.metadata) {
        eventData.metadata = {};
      }
      if (transitionData.transitionRequested) {
        eventData.metadata.transition_requested = transitionData.transitionRequested;
      }
      if (transitionData.transitionEffective) {
        eventData.metadata.transition_effective = transitionData.transitionEffective;
      }
      if (transitionData.transitionDuration !== undefined) {
        eventData.metadata.transition_duration_ms = transitionData.transitionDuration;
      }
    }

    // КРИТИЧНО: Логируем полные данные события перед отправкой
    console.log("TestView: recordEvent - Full event data before sending", {
      eventData,
      hasSessionId: !!eventData.session_id,
      sessionId: eventData.session_id,
      eventType: eventData.event_type,
      screenId: eventData.screen_id,
      hotspotId: eventData.hotspot_id,
      // КРИТИЧНО: Логируем координаты для кликов
      coordinates: { x: eventData.x, y: eventData.y },
      hasCoordinates: eventData.x !== undefined && eventData.y !== undefined,
      metadata: eventData.metadata,
      SUPABASE_URL: SUPABASE_URL ? "defined" : "undefined",
      SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? "defined" : "undefined"
    });
    
    // Если useBeacon = true, используем sendBeacon для надежной отправки при закрытии страницы
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      // Supabase поддерживает передачу API ключа через URL параметр apikey
      // Это позволяет использовать navigator.sendBeacon, который более надежен при закрытии страницы
      const url = `${SUPABASE_URL}/rest/v1/events?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}`;
      const payload = JSON.stringify(eventData);
      const payloadSize = new Blob([payload]).size;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:681',message:'recordEvent useBeacon entry',data:{useBeacon,hasSendBeacon:typeof navigator.sendBeacon === 'function',url,payloadSize,payloadLength:payload.length,hasSupabaseUrl:!!SUPABASE_URL,hasSupabaseKey:!!SUPABASE_ANON_KEY},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      console.log("TestView: recordEvent - Using sendBeacon", { url: url.replace(SUPABASE_ANON_KEY, '***'), payload });
      
      // Проверяем размер payload перед отправкой (sendBeacon имеет ограничение ~64KB)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:690',message:'Payload size check before sendBeacon',data:{payloadSize,payloadSizeKB:(payloadSize/1024).toFixed(2),exceeds64KB:payloadSize > 64*1024,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // Используем navigator.sendBeacon с Blob для отправки JSON данных
      // sendBeacon более надежен при закрытии страницы, чем fetch с keepalive
      const blob = new Blob([payload], { type: 'application/json' });
      const sendBeaconStartTime = Date.now();
      const beaconSent = navigator.sendBeacon(url, blob);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:697',message:'sendBeacon result',data:{type,beaconSent,elapsedMs:Date.now()-sendBeaconStartTime,url,payloadSize},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      if (beaconSent) {
        console.log("TestView: Event sent via sendBeacon:", type);
      } else {
        console.warn("TestView: sendBeacon returned false, event may not be sent:", type);
        
        // Fallback: пытаемся использовать fetch с keepalive, если sendBeacon не принял запрос
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:704',message:'sendBeacon failed, attempting fetch keepalive fallback',data:{type,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        const fallbackUrl = `${SUPABASE_URL}/rest/v1/events`;
        fetch(fallbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: payload,
          keepalive: true
        }).then(() => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:715',message:'Fallback fetch keepalive success',data:{type},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          console.log("TestView: Event sent via fallback fetch keepalive:", type);
        }).catch(fallbackErr => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:718',message:'Fallback fetch keepalive also failed',data:{type,errorName:fallbackErr.name,errorMessage:fallbackErr.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          console.error("TestView: Fallback fetch keepalive also failed:", fallbackErr);
        });
      }
      return;
    }

    // Обычная отправка через Supabase
    (async () => {
      try {
        // КРИТИЧНО: Проверяем наличие Supabase клиента и ключей
        if (!supabase) {
          console.error("TestView: ❌ Supabase client is not initialized!", { type, sessionId: currentSessionId });
          return;
        }
        
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
          console.error("TestView: ❌ Supabase credentials are missing!", {
            type,
            sessionId: currentSessionId,
            hasUrl: !!SUPABASE_URL,
            hasKey: !!SUPABASE_ANON_KEY
          });
          return;
        }
        
        // КРИТИЧНО: Логируем перед отправкой для диагностики
        console.log("TestView: 🔵 Attempting to insert event to Supabase", {
          type,
          sessionId: currentSessionId,
          screenId: eventData.screen_id,
          hotspotId: eventData.hotspot_id,
          // КРИТИЧНО: Логируем координаты для кликов
          coordinates: { x: eventData.x, y: eventData.y },
          hasCoordinates: eventData.x !== undefined && eventData.y !== undefined,
          supabaseUrl: SUPABASE_URL,
          hasAnonKey: !!SUPABASE_ANON_KEY
        });
        
        const { data, error } = await supabase
          .from("events")
          .insert([eventData])
          .select(); // КРИТИЧНО: Добавляем .select() чтобы получить вставленные данные
        
        if (error) {
          console.error("TestView: ❌ Error recording event to Supabase", {
            type,
            sessionId: currentSessionId,
            error: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            eventData
          });
        } else {
          console.log("TestView: ✅ Event recorded successfully in Supabase", {
            type,
            sessionId: currentSessionId,
            screenId: eventData.screen_id,
            hotspotId: eventData.hotspot_id,
            // КРИТИЧНО: Логируем координаты для кликов
            coordinates: { x: eventData.x, y: eventData.y },
            hasCoordinates: eventData.x !== undefined && eventData.y !== undefined,
            insertedCount: data ? data.length : 0,
            insertedData: data
          });
        }
      } catch (err) {
        console.error("TestView: ❌ Unexpected error recording event", {
          type,
          sessionId: currentSessionId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          eventData
        });
      }
    })();
  }

  // НОВОЕ: State для анимации между сценами (Phase 1)
  const [previousScreenId, setPreviousScreenId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentTransition, setCurrentTransition] = useState<Transition | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  
  // Cleanup для transition state при unmount
  useEffect(() => {
    return () => {
      setPreviousScreenId(null);
      setIsTransitioning(false);
      setCurrentTransition(null);
      if (transitionTimeoutRef.current !== null) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const goToScreen = (target: string, transition?: Transition) => {
    // Блокируем переходы после завершения теста
    if (testCompleted.current) {
      console.log("TestView: Test completed, blocking screen transition");
      return;
    }
    
    // Очищаем предыдущий timeout если есть
    if (transitionTimeoutRef.current !== null) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    
    // НОВОЕ: Phase 1 - сохраняем previous screen для анимации
    if (currentScreen) {
      setPreviousScreenId(currentScreen);
    }
    
    // Если есть transition и это SMART_ANIMATE, используем AnimatedScene
    if (transition && transition.type === "SMART_ANIMATE" && proto && isProtoV2(proto)) {
      // ВАЖНО: Сохраняем previous screen для анимации (уже установлен выше)
      // Устанавливаем currentScreen для рендеринга toScene, но сохраняем previousScreenId для анимации
      setIsTransitioning(true);
      setCurrentTransition(transition);
      setCurrentScreen(target);
      // recordEvent будет вызван в onAnimationComplete из AnimatedScene
    } else if (transition && transition.type !== "INSTANT" && transition.type !== "SMART_ANIMATE") {
      // CSS transitions: DISSOLVE, MOVE_IN, MOVE_OUT, PUSH, SLIDE_IN, SLIDE_OUT
      const duration = transition.duration || 300;
      setIsTransitioning(true);
      setCurrentTransition(transition);
      setCurrentScreen(target);
      
      // Записываем событие с transition metadata
      recordEvent("screen_load", target, null, false, undefined, undefined, undefined, undefined, {
        transitionRequested: transition.type,
        transitionEffective: transition.type,
        transitionDuration: duration
      });
      
      // После завершения анимации очищаем transition state
      transitionTimeoutRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
        setPreviousScreenId(null);
        setCurrentTransition(null);
        transitionTimeoutRef.current = null;
      }, duration);
    } else {
      // INSTANT или нет transition - мгновенная замена
      setIsTransitioning(false);
      setPreviousScreenId(null);
      setCurrentTransition(null);
      const effectiveTransition = transition?.type || "INSTANT";
      recordEvent("screen_load", target, null, false, undefined, undefined, undefined, undefined, {
        transitionRequested: effectiveTransition,
        transitionEffective: effectiveTransition,
        transitionDuration: 0
      });
      setCurrentScreen(target);
    }
  };

  // НОВОЕ: Функции для управления overlay
  const openOverlay = (overlayId: string, settings: OverlayAction, hotspotId?: string) => {
    if (!proto) return;
    
    // КРИТИЧНО: Используем currentScreenRef для получения актуального значения currentScreen
    // Это необходимо, так как currentScreen может быть устаревшим из-за замыкания
    const actualCurrentScreen = currentScreenRef.current || currentScreen;
    
    // ВАЖНО: currentScreen НЕ должен меняться при открытии overlay
    // Overlay открывается поверх текущего экрана, не заменяя его
    console.log("TestView: openOverlay called", {
      overlayId: overlayId,
      currentScreen: actualCurrentScreen,
      currentScreenFromState: currentScreen,
      currentScreenFromRef: currentScreenRef.current,
      willNotChangeCurrentScreen: true
    });
    
    // НОВОЕ: Поддержка v1/v2 - используем helper функцию
    const overlayScreenOrScene = getScreenOrScene(proto, overlayId);
    if (!overlayScreenOrScene) {
      console.warn("TestView: Overlay screen/scene not found:", overlayId);
      return;
    }
    
    // НОВОЕ: Для v2 прототипов тоже открываем оверлеи (используем FigmaEmbedViewer)
    // Проверяем, есть ли у overlay figmaNodeId для рендеринга через FigmaEmbedViewer
    const overlayFigmaNodeId = "figmaNodeId" in overlayScreenOrScene ? overlayScreenOrScene.figmaNodeId : null;
    if (isProtoV2(proto) && !overlayFigmaNodeId) {
      console.warn("TestView: Scene Graph overlays without figmaNodeId not yet implemented, falling back to DISSOLVE");
      // TODO: Phase 0 - реализовать Scene Renderer для overlays без figmaNodeId
      return;
    }
    
    // Для v1 используем существующую логику
    // overlayScreen используется ниже в коде
    
    // КРИТИЧНО: Проверяем, не открыт ли уже этот overlay (предотвращаем дублирование)
    // Это особенно важно для tooltip на hover, которые могут открываться несколько раз
    setOverlayStack(prev => {
      // Проверяем, не открыт ли уже этот overlay
      const isAlreadyOpen = prev.some(overlay => overlay.screenId === overlayId && overlay.hotspotId === hotspotId);
      if (isAlreadyOpen) {
        console.log("TestView: Overlay already open, skipping duplicate open", {
          overlayId: overlayId,
          hotspotId: hotspotId,
          currentStackSize: prev.length
        });
        return prev; // Не добавляем дубликат
      }
      
      // Добавляем overlay в стек
      // ВАЖНО: currentScreen остается прежним - overlay открывается поверх него
      // КРИТИЧНО: Используем actualCurrentScreen (из ref) для правильного parentScreenId
      const newOverlay: OverlayState = {
        screenId: overlayId,
        settings: settings,
        parentScreenId: actualCurrentScreen || "",
        hotspotId: hotspotId // Сохраняем hotspotId для MANUAL позиции
      };
      
      const newStack = [...prev, newOverlay];
      console.log("TestView: Overlay stack updated", {
        previousStackSize: prev.length,
        newStackSize: newStack.length,
        currentScreen: actualCurrentScreen,
        overlayScreenId: overlayId,
        parentScreenId: actualCurrentScreen,
        wasAlreadyOpen: isAlreadyOpen
      });
      return newStack;
    });
    
    // Записываем событие аналитики
    // КРИТИЧНО: Используем actualCurrentScreen для правильного screen_id в аналитике
    recordEvent("overlay_open", actualCurrentScreen, hotspotId || null, false, undefined, undefined, undefined, {
      overlayId: overlayId,
      position: settings.position,
      closeMethod: undefined
    });
    
    console.log("TestView: Opened overlay", {
      overlayId: overlayId,
      position: settings.position,
      background: settings.background,
      currentScreen: actualCurrentScreen,
      parentScreenId: actualCurrentScreen,
      stackSize: overlayStack.length + 1,
      note: "currentScreen should NOT change - overlay is on top of current screen"
    });
  };
  
  const closeOverlay = (closeMethod: "button" | "outside_click" | "hotspot_click" | "hover_leave") => {
    // КРИТИЧНО: Используем currentScreenRef для получения актуального значения currentScreen
    // Это необходимо, так как currentScreen может быть устаревшим из-за замыкания
    const actualCurrentScreen = currentScreenRef.current || currentScreen;
    
    // КРИТИЧНО: Используем функциональное обновление для получения актуального значения overlayStack
    setOverlayStack(prev => {
      if (prev.length === 0) {
        console.log("TestView: Overlay stack is empty, nothing to close");
        return prev;
      }
      
      const closedOverlay = prev[prev.length - 1];
      
      // Удаляем последний overlay из стека
      const newStack = prev.slice(0, -1);
      
      // Записываем событие аналитики
      // КРИТИЧНО: Используем actualCurrentScreen для правильного screen_id в аналитике
      recordEvent("overlay_close", actualCurrentScreen, null, false, undefined, undefined, undefined, {
        overlayId: closedOverlay.screenId,
        position: closedOverlay.settings.position,
        closeMethod: closeMethod
      });
      
      console.log("TestView: Closed overlay", {
        overlayId: closedOverlay.screenId,
        closeMethod: closeMethod,
        stackSize: newStack.length,
        currentScreen: actualCurrentScreen
      });
      
      // КРИТИЧНО: После закрытия overlay проверяем, не находимся ли мы на финальном экране
      // Это необходимо, так как после работы с overlay currentScreen может не обновляться правильно
      // и проверка финального экрана может не сработать
      if (actualCurrentScreen && proto && !testCompleted.current) {
        const currentScreenOrScene = getScreenOrScene(proto, actualCurrentScreen);
        const screenName = currentScreenOrScene ? ("name" in currentScreenOrScene ? currentScreenOrScene.name : null) : null;
        const hasFinalMarker = screenName ? (
          /\[final\]/i.test(screenName) || 
          /\[end\]/i.test(screenName) ||
          /\bfinal\b/i.test(screenName) ||
          /final$/i.test(screenName.trim()) ||
          /финал/i.test(screenName) ||
          /конец/i.test(screenName) ||
          /заверш/i.test(screenName)
        ) : false;
        const isEndScreen = actualCurrentScreen === proto.end;
        const isEndDifferentFromStart = proto.end !== proto.start;
        
        if ((isEndScreen || hasFinalMarker) && isEndDifferentFromStart) {
          console.log("TestView: 🎯 Final screen detected after closing overlay! Triggering completion check...", {
            currentScreen: actualCurrentScreen,
            screenName: screenName,
            isEndScreen: isEndScreen,
            hasFinalMarker: hasFinalMarker,
            protoEnd: proto.end,
            protoStart: proto.start,
            isEndDifferentFromStart: isEndDifferentFromStart,
            testCompleted: testCompleted.current
          });
          
          // КРИТИЧНО: Явно проверяем завершение теста после закрытия overlay
          // Это необходимо, так как useEffect может не сработать сразу
          testCompleted.current = true;
          const currentSessionId = actualSessionId || propSessionId;
          if (currentSessionId) {
            recordEvent("completed", actualCurrentScreen);
            setTimeout(() => {
              if (testCompleted.current) {
                console.log("TestView: Setting showSuccessPopup to true (after closing overlay)");
                setShowSuccessPopup(true);
                // НОВОЕ: Вызываем onComplete callback если передан (для StudyView)
                if (onComplete) {
                  console.log("TestView: Calling onComplete callback");
                  onComplete();
                }
              }
            }, 1000);
          } else {
            console.error("TestView: Cannot show success popup - sessionId is null", {
              actualSessionId,
              propSessionId,
              currentScreen: actualCurrentScreen
            });
          }
        }
      }
      
      return newStack;
    });
  };
  
  const swapOverlay = (newOverlayId: string) => {
    if (overlayStack.length === 0) return;
    if (!proto) return;
    
    // НОВОЕ: Поддержка v1/v2 - используем helper функцию
    const newOverlayScreenOrScene = getScreenOrScene(proto, newOverlayId);
    if (!newOverlayScreenOrScene) {
      console.warn("TestView: New overlay screen/scene not found:", newOverlayId);
      return;
    }
    
    // Для v2 пока используем fallback (Scene Renderer будет в Phase 0)
    if (isProtoV2(proto)) {
      console.warn("TestView: Scene Graph overlays not yet implemented");
      return;
    }
    
    // Для v1 используем существующую логику
    // newOverlayScreen проверен, используется в setOverlayStack
    
    const oldOverlay = overlayStack[overlayStack.length - 1];
    
    // Заменяем последний overlay в стеке, сохраняя настройки (background, position и т.д.)
    setOverlayStack(prev => {
      const newStack = [...prev];
      newStack[newStack.length - 1] = {
        screenId: newOverlayId,
        settings: oldOverlay.settings, // Сохраняем старые настройки
        parentScreenId: oldOverlay.parentScreenId,
        hotspotId: oldOverlay.hotspotId // Сохраняем hotspotId для MANUAL позиции
      };
      return newStack;
    });
    
    // КРИТИЧНО: Используем currentScreenRef для получения актуального значения currentScreen
    // Это необходимо, так как currentScreen может быть устаревшим из-за замыкания
    const actualCurrentScreen = currentScreenRef.current || currentScreen;
    
    // Записываем событие аналитики
    // КРИТИЧНО: Используем actualCurrentScreen для правильного screen_id в аналитике
    recordEvent("overlay_swap", actualCurrentScreen, null, false, undefined, undefined, undefined, {
      oldOverlayId: oldOverlay.screenId,
      newOverlayId: newOverlayId,
      position: oldOverlay.settings.position
    });
    
    console.log("TestView: Swapped overlay", {
      oldOverlayId: oldOverlay.screenId,
      newOverlayId: newOverlayId,
      stackSize: overlayStack.length,
      currentScreen: actualCurrentScreen
    });
  };

  const onHotspotClick = (h: Hotspot, clickX?: number, clickY?: number) => {
    // КРИТИЧНО: Проверяем состояние экрана и hotspot перед обработкой клика
    const actualCurrentScreen = currentScreenRef.current || currentScreen;
    const activeScreenId = getActiveScreenId(h);
    const currentScreenOrScene = actualCurrentScreen ? getScreenOrScene(proto, actualCurrentScreen) : null;
    const currentScreenName = currentScreenOrScene ? ("name" in currentScreenOrScene ? currentScreenOrScene.name : null) : null;
    const targetScreenOrScene = h.target ? getScreenOrScene(proto, h.target) : null;
    const targetScreenName = targetScreenOrScene ? ("name" in targetScreenOrScene ? targetScreenOrScene.name : null) : null;
    const previousScreenId = screenHistoryRef.current.length > 0 ? screenHistoryRef.current[screenHistoryRef.current.length - 1] : null;
    
    console.log("TestView: onHotspotClick called", {
      hotspotId: h.id,
      hotspotName: h.name,
      frame: h.frame,
      target: h.target,
      clickX,
      clickY,
      // КРИТИЧНО: Проверки состояния экрана
      currentScreen: actualCurrentScreen,
      currentScreenName: currentScreenName,
      activeScreenId: activeScreenId,
      targetScreen: h.target,
      targetScreenName: targetScreenName,
      previousScreenId: previousScreenId,
      overlayStackSize: overlayStack.length,
      hasProto: !!proto,
      // Проверяем, что hotspot находится на текущем экране
      isHotspotOnCurrentScreen: h.frame === actualCurrentScreen,
      // Проверяем, что target существует
      targetScreenExists: !!targetScreenOrScene
    });
    
    // Блокируем клики по хотспотам после завершения теста
    if (testCompleted.current) {
      console.log("TestView: Test completed, blocking hotspot click");
      return;
    }
    
    // НЕ проверяем финальный экран при клике на хотспот
    // Проверка происходит только в useEffect когда currentScreen обновляется на финальный экран
    
    // ОТЛАДКА: Логируем данные hotspot при клике
    console.log("TestView: Hotspot clicked - FULL DATA", {
      hotspotId: h.id,
      hotspotName: h.name,
      frame: h.frame,
      target: h.target,
      hasOverlayAction: !!h.overlayAction,
      overlayAction: h.overlayAction, // Полный объект overlayAction
      overlayActionType: h.overlayAction?.type,
      overlayActionOverlayId: h.overlayAction?.overlayId,
      currentScreen: actualCurrentScreen,
      currentScreenName: currentScreenName,
      targetScreen: h.target,
      targetScreenName: targetScreenName,
      previousScreenId: previousScreenId,
      hotspotFullObject: h // Полный объект hotspot для отладки
    });
    
    // ВАЖНО: Определяем правильный screen ID для трекинга
    // Если hotspot находится внутри overlay, используем overlay screen ID

    // Всегда отправлять x,y в аналитику: при отсутствии координат — центр хотспота (чтобы во вкладке «Клики» отображались все маркеры)
    const finalClickX = clickX != null ? clickX : (h.x ?? 0) + (h.w ?? 100) / 2;
    const finalClickY = clickY != null ? clickY : (h.y ?? 0) + (h.h ?? 50) / 2;

    // Сохраняем событие клика (всегда, независимо от типа действия)
    recordEvent("hotspot_click", activeScreenId, h.id, false, finalClickX, finalClickY);
    
    // НОВОЕ: Обработка overlay actions
    // ВАЖНО: Если есть overlayAction, мы НИКОГДА не переходим на h.target
    // Overlay должен открываться поверх текущего экрана, не заменяя его
    console.log("TestView: Checking overlayAction", {
      hasOverlayAction: !!h.overlayAction,
      overlayAction: h.overlayAction,
      overlayActionType: h.overlayAction?.type,
      overlayActionOverlayId: h.overlayAction?.overlayId
    });
    
    if (h.overlayAction && h.overlayAction.type) {
      const overlayAction = h.overlayAction;
      
      // КРИТИЧНО: Проверяем, что overlay существует перед открытием
      const overlayScreenOrScene = overlayAction.overlayId ? getScreenOrScene(proto, overlayAction.overlayId) : null;
      const overlayScreenName = overlayScreenOrScene ? ("name" in overlayScreenOrScene ? overlayScreenOrScene.name : null) : null;
      
      console.log("TestView: Processing overlayAction", {
        type: overlayAction.type,
        overlayId: overlayAction.overlayId,
        currentScreen: actualCurrentScreen,
        currentScreenName: currentScreenName,
        overlayScreenExists: !!overlayScreenOrScene,
        overlayScreenName: overlayScreenName,
        previousScreenId: previousScreenId,
        // Проверяем, что overlay не открыт уже
        isOverlayAlreadyOpen: overlayStack.some(o => o.screenId === overlayAction.overlayId)
      });
      
      if (overlayAction.type === "OPEN_OVERLAY") {
        // КРИТИЧНО: Проверяем, что overlay существует
        if (!overlayAction.overlayId) {
          console.warn("TestView: OPEN_OVERLAY action without overlayId", {
            hotspotId: h.id,
            overlayAction: overlayAction
          });
          return;
        }
        
        if (!overlayScreenOrScene) {
          console.warn("TestView: Overlay screen/scene not found", {
            overlayId: overlayAction.overlayId,
            hotspotId: h.id,
            currentScreen: actualCurrentScreen
          });
          return;
        }
        // КРИТИЧНО: Проверяем trigger - ON_CLICK overlays открываются на клик, ON_HOVER - на hover
        // ВАЖНО: Если trigger ON_HOVER, overlay уже должен быть открыт через onHotspotHoverEnter
        // НЕ открываем его снова на клик
        if (h.trigger === "ON_HOVER") {
          console.log("TestView: OPEN_OVERLAY with ON_HOVER trigger - overlay already open, skipping", {
            overlayId: overlayAction.overlayId,
            hotspotId: h.id,
            trigger: h.trigger,
            note: "Overlay should be opened on hover, not on click"
          });
          // НЕ возвращаемся - продолжаем обработку клика (может быть навигация)
        } else if (h.trigger === "ON_CLICK" || !h.trigger) {
          // ON_CLICK или trigger не указан (по умолчанию ON_CLICK) - открываем на клик
          console.log("TestView: OPEN_OVERLAY with ON_CLICK trigger - opening overlay", {
            overlayId: overlayAction.overlayId,
            hotspotId: h.id,
            trigger: h.trigger
          });
          openOverlay(overlayAction.overlayId, overlayAction, h.id);
          // Записываем событие overlay_open в аналитику
          recordEvent("overlay_open", activeScreenId, h.id, false, clickX, clickY, undefined, {
            overlayId: overlayAction.overlayId,
            position: overlayAction.position,
            closeMethod: undefined
          });
          return; // Не переходим на другой экран - overlay открывается поверх текущего
        }
      } else if (overlayAction.type === "CLOSE_OVERLAY") {
        closeOverlay("button");
        // Записываем событие overlay_close в аналитику
        recordEvent("overlay_close", activeScreenId, h.id, false, clickX, clickY, undefined, {
          overlayId: undefined,
          position: undefined,
          closeMethod: "button"
        });
        return; // Не переходим на другой экран
      } else if (overlayAction.type === "SWAP_OVERLAY") {
        // ВАЖНО: Если overlayId не определен, просто показываем предупреждение и не делаем ничего
        if (overlayAction.overlayId) {
          const oldOverlayId = overlayStack.length > 0 ? overlayStack[overlayStack.length - 1].screenId : undefined;
          swapOverlay(overlayAction.overlayId);
          // Записываем событие overlay_swap в аналитику
          recordEvent("overlay_swap", activeScreenId, h.id, false, clickX, clickY, undefined, {
            overlayId: undefined,
            position: undefined,
            closeMethod: undefined,
            oldOverlayId: oldOverlayId,
            newOverlayId: overlayAction.overlayId
          });
          return; // Не переходим на другой экран - overlay заменяется поверх текущего
        } else {
          console.warn("TestView: SWAP_OVERLAY action without overlayId, cannot swap overlay", h.id);
          return; // НЕ переходим на h.target, даже если он есть
        }
      } else if (overlayAction.type === "BACK") {
        // КРИТИЧНО: Обрабатываем Action "BACK" - возврат на предыдущий экран
        // ВАЖНО: Поскольку PRESENTED_NODE_CHANGED НЕ приходит от стандартного Figma embed,
        // мы используем историю переходов как fallback с минимальным timeout
        console.log("TestView: BACK action (overlayAction) detected - using history fallback", {
          hotspotId: h.id,
          hotspotName: h.name,
          currentScreen: currentScreen,
          historyLength: screenHistoryRef.current.length,
          history: [...screenHistoryRef.current],
          note: "PRESENTED_NODE_CHANGED not available from standard Figma embed, using immediate fallback"
        });
        
        if (screenHistoryRef.current.length > 0) {
          const previousScreen = screenHistoryRef.current[screenHistoryRef.current.length - 1]; // НЕ удаляем из истории пока
          
          // КРИТИЧНО: Уменьшен timeout с 500ms до 100ms
          // Поскольку PRESENTED_NODE_CHANGED НЕ приходит от стандартного Figma embed,
          // нет смысла ждать долго - сразу используем fallback
          setTimeout(() => {
            // КРИТИЧНО: Получаем актуальное значение currentScreen через функциональное обновление
            // Это необходимо, так как currentScreen может быть устаревшим из-за замыкания
            const currentScreenValue = currentScreen;
            if (previousScreen && proto && hasScreenOrScene(proto, previousScreen)) {
              // Проверяем, не обновился ли currentScreen через другой механизм
              // Если нет, обновляем вручную
              if (currentScreenValue !== previousScreen) {
                setCurrentScreen(previousScreen);
              }
            } else {
              // Fallback: используем start screen
              if (proto?.start) {
                setCurrentScreen(proto.start);
              }
            }
          }, 100); // Уменьшено с 500ms до 100ms - PRESENTED_NODE_CHANGED не приходит
        } else {
          console.warn("TestView: BACK action detected but no screen history", {
            hotspotId: h.id,
            hotspotName: h.name,
            currentScreen: currentScreen,
            historyLength: screenHistoryRef.current.length,
            note: "Cannot return to previous screen - no history"
          });
        }
        return; // НЕ переходим на h.target, даже если он есть
      } else {
        // Неизвестный тип overlayAction - не делаем ничего
        console.warn("TestView: Unknown overlayAction type, ignoring", {
          hotspotId: h.id,
          overlayActionType: overlayAction.type
        });
        return; // НЕ переходим на h.target, даже если он есть
      }
    }
    
    // Обычная обработка клика (переход на другой экран)
    // ВАЖНО: Выполняется ТОЛЬКО если overlayAction нет
    if (h.target) {
      // КРИТИЧНО: Проверяем, что target существует
      if (!targetScreenOrScene) {
        console.warn("TestView: Target screen/scene not found for navigation", {
          hotspotId: h.id,
          target: h.target,
          currentScreen: actualCurrentScreen,
          availableScreens: proto ? getAllScreensOrScenes(proto).map(s => ({ id: s.id, name: s.name })) : []
        });
        return;
      }
      
      if (h.target === actualCurrentScreen) {
        // ВАЖНО: Если hotspot ведет на текущий экран, закрываем overlay (если он открыт)
        // Это обычно означает, что hotspot находится внутри overlay и должен закрывать его
        if (overlayStack.length > 0) {
          console.log("TestView: Hotspot target is same as current screen, closing overlay", {
            hotspotId: h.id,
            hotspotName: h.name,
            target: h.target,
            currentScreen: currentScreen,
            overlayStackSize: overlayStack.length
          });
          closeOverlay("hotspot_click");
          return;
        }
        console.warn("TestView: Hotspot target is same as current screen, skipping navigation", {
          hotspotId: h.id,
          hotspotName: h.name,
          target: h.target,
          currentScreen: currentScreen
        });
        return; // Не навигируем на тот же экран, если overlay не открыт
      }
      // КРИТИЧНО: Figma сам обрабатывает переходы через свои хотспоты
      // Мы трекаем клик для аналитики и обновляем состояние
      // ИСПРАВЛЕНИЕ: Поскольку PRESENTED_NODE_CHANGED не приходит от стандартного Figma embed,
      // мы должны обновить currentScreen и историю самостоятельно с небольшим timeout
      console.log("TestView: Hotspot clicked - Figma handles navigation, we update state", {
        from: currentScreen,
        to: h.target,
        hotspotId: h.id,
        hasOverlayAction: false,
        protoEnd: proto?.end,
        protoStart: proto?.start,
        isTargetEndScreen: h.target === proto?.end,
        isTargetStartScreen: h.target === proto?.start,
        note: "PRESENTED_NODE_CHANGED unavailable, updating state via fallback"
      });
      
      // ИСПРАВЛЕНИЕ: Добавляем fallback обновление состояния, поскольку PRESENTED_NODE_CHANGED не приходит
      // Сохраняем target в локальную переменную для использования в setTimeout
      const targetScreen = h.target;
      
      // Добавляем текущий экран в историю СИНХРОННО (до setTimeout)
      if (actualCurrentScreen && actualCurrentScreen !== targetScreen) {
        if (screenHistoryRef.current.length === 0 || 
            screenHistoryRef.current[screenHistoryRef.current.length - 1] !== actualCurrentScreen) {
          screenHistoryRef.current.push(actualCurrentScreen);
          console.log("TestView: Added current screen to history before forward navigation", {
            screen: actualCurrentScreen,
            targetScreen: targetScreen,
            historyLength: screenHistoryRef.current.length,
            history: [...screenHistoryRef.current]
          });
        }
      }
      
      // Fallback: обновляем currentScreen через небольшой timeout
      setTimeout(() => {
        // Используем currentScreenRef.current для актуального значения (избегаем stale closure)
        const currentActualScreen = currentScreenRef.current;
        
        // Проверяем, не обновился ли currentScreen через другой механизм
        if (currentActualScreen !== targetScreen && proto && hasScreenOrScene(proto, targetScreen)) {
          console.log("TestView: Forward navigation - updating currentScreen via fallback", {
            staleCurrentScreen: currentScreen,
            actualCurrentScreen: currentActualScreen,
            targetScreen: targetScreen,
            note: "PRESENTED_NODE_CHANGED not received, using fallback"
          });
          
          // Обновляем currentScreen и currentScreenRef
          setCurrentScreen(targetScreen);
          currentScreenRef.current = targetScreen;
          
          // Записываем событие screen_load
          recordEvent("screen_load", targetScreen, null);
          
          // КРИТИЧНО: Проверяем, не является ли целевой экран финальным
          const targetScreenOrSceneLocal = getScreenOrScene(proto, targetScreen);
          const targetScreenNameLocal = targetScreenOrSceneLocal ? ("name" in targetScreenOrSceneLocal ? targetScreenOrSceneLocal.name : null) : null;
          const hasFinalMarker = targetScreenNameLocal ? (
            /\[final\]/i.test(targetScreenNameLocal) || 
            /\[end\]/i.test(targetScreenNameLocal) ||
            /\bfinal\b/i.test(targetScreenNameLocal)
          ) : false;
          const isTargetFinal = targetScreen === proto.end || hasFinalMarker;
          
          if (isTargetFinal && !testCompleted.current) {
            console.log("TestView: 🎯 Target screen is final screen (forward navigation fallback)!", {
              targetScreen,
              protoEnd: proto.end,
              targetScreenNameLocal,
              note: "Will trigger completion via useEffect or explicit check"
            });
            
            // КРИТИЧНО: Явно проверяем завершение теста
            const isEndDifferentFromStart = proto.end !== proto.start;
            if (isEndDifferentFromStart) {
              console.log("TestView: 🎉 Triggering completion via forward navigation fallback!", {
                targetScreen,
                protoEnd: proto.end,
                protoStart: proto.start,
                testCompletedBefore: testCompleted.current
              });
              
              testCompleted.current = true;
              const currentSessionId = actualSessionId || propSessionId;
              if (currentSessionId) {
                recordEvent("completed", targetScreen);
                setTimeout(() => {
                  if (testCompleted.current) {
                    console.log("TestView: Setting showSuccessPopup to true (via forward navigation fallback)");
                    setShowSuccessPopup(true);
                  }
                }, 1000);
              }
            }
          }
        } else if (currentActualScreen === targetScreen) {
          console.log("TestView: Forward navigation - currentScreen already updated", {
            currentActualScreen,
            targetScreen
          });
        }
      }, 100); // Небольшой timeout для синхронизации с Figma
      
      // НЕ вызываем goToScreen - Figma сам обработает переход
    } else {
      // КРИТИЧНО: Обрабатываем Action "BACK" - возврат на предыдущий экран
      // BACK действие может быть определено как:
      // 1. overlayAction.type === "BACK" (из плагина, когда action.type === "BACK")
      // 2. target = null (fallback, если overlayAction не установлен)
      // ВАЖНО: Figma сам обрабатывает BACK через requestBack, поэтому мы НЕ обновляем currentScreen сразу
      // Вместо этого ждем PRESENTED_NODE_CHANGED от Figma, который обновит currentScreen через onScreenChange
      // НО если PRESENTED_NODE_CHANGED не приходит, используем историю переходов как fallback
      const isBackAction = h.overlayAction?.type === "BACK" || (!h.target && !h.overlayAction);
      
      if (isBackAction && screenHistoryRef.current.length > 0) {
        const previousScreen = screenHistoryRef.current[screenHistoryRef.current.length - 1]; // НЕ удаляем из истории пока
        console.log("TestView: BACK action detected - Figma will handle navigation, waiting for PRESENTED_NODE_CHANGED", {
          hotspotId: h.id,
          hotspotName: h.name,
          currentScreen: currentScreen,
          previousScreen: previousScreen,
          historyLength: screenHistoryRef.current.length,
          history: [...screenHistoryRef.current],
          note: "Figma will send PRESENTED_NODE_CHANGED after BACK, we will update currentScreen then"
        });
        
        // КРИТИЧНО: Поскольку PRESENTED_NODE_CHANGED не приходит от стандартного Figma embed,
        // мы должны обновить currentScreen сразу через fallback из истории навигации
        // ИСПРАВЛЕНИЕ: Используем currentScreenRef.current для актуального значения (избегаем stale closure)
        // Уменьшаем timeout до 100ms - это достаточно для обработки синхронных операций,
        // но не блокирует UX при отсутствии postMessage
        setTimeout(() => {
          if (previousScreen && proto && hasScreenOrScene(proto, previousScreen)) {
            // ИСПРАВЛЕНИЕ: Используем currentScreenRef.current вместо currentScreen (stale closure fix)
            const actualCurrentScreen = currentScreenRef.current;
            
            // Проверяем, не обновился ли currentScreen через PRESENTED_NODE_CHANGED
            // Если нет, обновляем вручную
            if (actualCurrentScreen !== previousScreen) {
              console.log("TestView: BACK action - PRESENTED_NODE_CHANGED not received, using fallback", {
                hotspotId: h.id,
                staleCurrentScreen: currentScreen, // Старое значение из closure (для отладки)
                actualCurrentScreen: actualCurrentScreen, // Актуальное значение из ref
                previousScreen: previousScreen,
                willUpdate: true,
                note: "Using currentScreenRef.current to avoid stale closure"
              });
              
              // Удаляем предыдущий экран из истории (так как мы на него вернулись)
              screenHistoryRef.current.pop();
              
              // Обновляем currentScreen на предыдущий экран
              setCurrentScreen(previousScreen);
              // ИСПРАВЛЕНИЕ: Также обновляем currentScreenRef сразу для следующих проверок
              currentScreenRef.current = previousScreen;
              
              recordEvent("screen_load", previousScreen, null);
              
              // КРИТИЧНО: Проверяем, не является ли предыдущий экран финальным
              const previousScreenOrScene = getScreenOrScene(proto, previousScreen);
              const previousScreenName = previousScreenOrScene ? ("name" in previousScreenOrScene ? previousScreenOrScene.name : null) : null;
              const isPreviousScreenFinal = previousScreen === proto.end || 
                (previousScreenName && /\[final\]/i.test(previousScreenName));
              
              if (isPreviousScreenFinal && !testCompleted.current) {
                console.log("TestView: 🎯 Previous screen is final screen after BACK action (fallback)!", {
                  previousScreen,
                  protoEnd: proto.end,
                  previousScreenName,
                  note: "Will trigger completion via useEffect"
                });
                // Финальный экран будет обработан в useEffect при обновлении currentScreen
              }
            } else {
              // currentScreen уже обновлен (либо через PRESENTED_NODE_CHANGED, либо через другой механизм)
              console.log("TestView: BACK action - currentScreen already updated", {
                hotspotId: h.id,
                actualCurrentScreen: actualCurrentScreen,
                previousScreen: previousScreen,
                note: "No update needed"
              });
              // Удаляем предыдущий экран из истории (так как мы на него вернулись)
              screenHistoryRef.current.pop();
            }
          }
        }, 100); // Уменьшено с 500ms до 100ms - PRESENTED_NODE_CHANGED не приходит, поэтому ждать долго нет смысла
        
        // Сохраняем timeout для очистки, если PRESENTED_NODE_CHANGED придет раньше
        // (но мы не можем сохранить его в ref, так как это одноразовая операция)
        // Вместо этого просто ждем и проверяем
      } else {
        console.warn("TestView: BACK action detected but no screen history", {
          hotspotId: h.id,
          hotspotName: h.name,
          currentScreen: currentScreen,
          historyLength: screenHistoryRef.current.length,
          note: "Cannot return to previous screen - no history"
        });
      }
    }
  };

  // Обработка hover-взаимодействий (ON_HOVER триггер)
  // По документации Figma, ON_HOVER reverts navigation when trigger is finished
  // Это значит: onMouseEnter -> открыть overlay/перейти, onMouseLeave -> закрыть overlay/вернуться
  const onHotspotHoverEnter = (h: Hotspot) => {
    // Блокируем hover после завершения теста
    if (testCompleted.current) {
      return;
    }
    
    // КРИТИЧНО: Проверяем состояние экрана и hotspot перед обработкой hover
    const actualCurrentScreen = currentScreenRef.current || currentScreen;
    const activeScreenId = getActiveScreenId(h);
    const currentScreenOrScene = actualCurrentScreen ? getScreenOrScene(proto, actualCurrentScreen) : null;
    const currentScreenName = currentScreenOrScene ? ("name" in currentScreenOrScene ? currentScreenOrScene.name : null) : null;
    const targetScreenOrScene = h.target ? getScreenOrScene(proto, h.target) : null;
    const targetScreenName = targetScreenOrScene ? ("name" in targetScreenOrScene ? targetScreenOrScene.name : null) : null;
    const previousScreenId = screenHistoryRef.current.length > 0 ? screenHistoryRef.current[screenHistoryRef.current.length - 1] : null;
    
    console.log("TestView: Hotspot hover enter", {
      hotspotId: h.id,
      hotspotName: h.name,
      trigger: h.trigger,
      frame: h.frame,
      target: h.target,
      hasOverlayAction: !!h.overlayAction,
      // КРИТИЧНО: Проверки состояния экрана
      currentScreen: actualCurrentScreen,
      currentScreenName: currentScreenName,
      activeScreenId: activeScreenId,
      targetScreen: h.target,
      targetScreenName: targetScreenName,
      previousScreenId: previousScreenId,
      overlayStackSize: overlayStack.length,
      // Проверяем, что hotspot находится на текущем экране
      isHotspotOnCurrentScreen: h.frame === actualCurrentScreen,
      // Проверяем, что target существует
      targetScreenExists: !!targetScreenOrScene
    });
    
    // КРИТИЧНО: Проверяем, что hotspot находится на текущем экране
    if (h.frame !== actualCurrentScreen && h.frame !== activeScreenId) {
      console.warn("TestView: Hotspot hover enter - hotspot not on current screen", {
        hotspotId: h.id,
        hotspotFrame: h.frame,
        currentScreen: actualCurrentScreen,
        activeScreenId: activeScreenId,
        note: "Hotspot may be on overlay screen or wrong screen"
      });
      // НЕ возвращаемся - продолжаем обработку, так как hotspot может быть на overlay
    }
    
    // КРИТИЧНО: Обрабатываем overlay actions ТОЛЬКО если триггер ON_HOVER
    // Согласно Figma API: ON_HOVER trigger "reverts the navigation when the trigger is finished"
    // Это значит, что overlay должен открываться на hover и закрываться при уходе курсора
    if (h.trigger === "ON_HOVER" && h.overlayAction && h.overlayAction.type === "OPEN_OVERLAY" && h.overlayAction.overlayId) {
      // КРИТИЧНО: Проверяем, что overlay существует
      const overlayScreenOrScene = getScreenOrScene(proto, h.overlayAction.overlayId);
      if (!overlayScreenOrScene) {
        console.warn("TestView: Overlay screen/scene not found for hover", {
          overlayId: h.overlayAction.overlayId,
          hotspotId: h.id
        });
        return;
      }
      
      console.log("TestView: Opening overlay on hover (ON_HOVER trigger)", {
        overlayId: h.overlayAction.overlayId,
        hotspotId: h.id,
        trigger: h.trigger,
        currentScreen: actualCurrentScreen,
        currentScreenName: currentScreenName,
        overlayScreenName: "name" in overlayScreenOrScene ? overlayScreenOrScene.name : null
      });
      openOverlay(h.overlayAction.overlayId, h.overlayAction, h.id);
      // Запоминаем, что этот overlay был открыт по hover
      hoverOverlayRef.current = h.overlayAction.overlayId;
      return;
    } else if (h.overlayAction && h.overlayAction.type === "OPEN_OVERLAY" && h.trigger !== "ON_HOVER") {
      console.log("TestView: Skipping overlay open on hover - not ON_HOVER trigger", {
        hotspotId: h.id,
        overlayActionType: h.overlayAction.type,
        trigger: h.trigger,
        note: "Overlay will open on click, not on hover"
      });
      // НЕ открываем overlay на hover, если trigger не ON_HOVER
      // Overlay откроется на клик через onHotspotClick
    }
    
    // Обычная навигация на hover
    if (h.target) {
      // КРИТИЧНО: Проверяем, что target существует
      if (!targetScreenOrScene) {
        console.warn("TestView: Target screen/scene not found for hover navigation", {
          hotspotId: h.id,
          target: h.target,
          currentScreen: actualCurrentScreen
        });
        return;
      }
      
      console.log("TestView: Navigating to screen on hover", {
        from: actualCurrentScreen,
        fromScreenName: currentScreenName,
        to: h.target,
        toScreenName: targetScreenName,
        hotspotId: h.id,
        previousScreenId: previousScreenId
      });
      // НОВОЕ: Phase 1 - находим edge с transition для этого hotspot
      let edge: Edge | undefined;
      if (proto && proto.edges) {
        edge = proto.edges.find((e: Edge) => e.from === actualCurrentScreen && e.to === h.target && e.id === h.id);
      }
      
      const transition = edge?.transition;
      
      goToScreen(h.target, transition);
      // Запоминаем, что мы перешли на hover
      hoverOverlayRef.current = "navigation"; // Специальный маркер для навигации
    }
  };

  const onHotspotHoverLeave = (h: Hotspot) => {
    // Блокируем hover после завершения теста
    if (testCompleted.current) {
      return;
    }
    
    console.log("TestView: Hotspot hover leave", {
      hotspotId: h.id,
      hoverOverlayId: hoverOverlayRef.current,
      isHoveringOverlay: isHoveringOverlayRef.current
    });
    
    // КРИТИЧНО: Закрываем overlay ТОЛЬКО если триггер ON_HOVER
    // Согласно документации Figma API (https://developers.figma.com/docs/plugins/api/Trigger/):
    // "ON_HOVER" trigger type "reverts the navigation when the trigger is finished"
    // Это значит, что когда курсор уходит с hotspot (onMouseLeave срабатывает), overlay должен закрываться
    // НО мы даем небольшой таймаут, чтобы дать время курсору переместиться на overlay (если он находится рядом)
    // Если курсор переходит на overlay, isHoveringOverlayRef.current будет true, и мы не закроем overlay
    // ВАЖНО: Проверяем trigger, чтобы не закрывать ON_CLICK overlays на hover leave
    if (h.trigger === "ON_HOVER" && hoverOverlayRef.current && hoverOverlayRef.current !== "navigation") {
      // Очищаем предыдущий таймаут, если он был
      if (hoverLeaveTimeoutRef.current !== null) {
        clearTimeout(hoverLeaveTimeoutRef.current);
      }
      
      // Устанавливаем задержку перед закрытием (100ms достаточно для перехода курсора на overlay, если он рядом)
      // Согласно документации Figma API, ON_HOVER должен revert navigation when trigger is finished
      // Но мы даем небольшой таймаут, чтобы курсор мог переместиться на overlay (если он находится рядом)
      hoverLeaveTimeoutRef.current = window.setTimeout(() => {
        // Проверяем, не находится ли курсор над overlay
        if (isHoveringOverlayRef.current) {
          console.log("TestView: Cursor moved to overlay, canceling close");
          hoverLeaveTimeoutRef.current = null;
          return;
        }
        
        // КРИТИЧНО: Используем функциональное обновление для получения актуального значения overlayStack
        // Это необходимо, так как overlayStack - это state, и в setTimeout мы можем получить старое значение
        setOverlayStack(prev => {
          // Закрываем overlay, так как курсор ушел с hotspot и не попал на overlay
          // Согласно документации Figma API: ON_HOVER reverts navigation when trigger is finished
          if (prev.length > 0) {
            const lastOverlay = prev[prev.length - 1];
            if (lastOverlay.screenId === hoverOverlayRef.current) {
              console.log("TestView: Closing overlay on hotspot hover leave (ON_HOVER reverts when trigger finished)", {
                overlayId: hoverOverlayRef.current,
                overlayScreenId: lastOverlay.screenId,
                stackSize: prev.length
              });
              // Удаляем последний overlay из стека
              const newStack = prev.slice(0, -1);
              // КРИТИЧНО: Используем currentScreenRef для получения актуального значения currentScreen
              // Это необходимо, так как currentScreen может быть устаревшим из-за замыкания
              const actualCurrentScreen = currentScreenRef.current || currentScreen;
              // Записываем событие аналитики
              // КРИТИЧНО: Используем actualCurrentScreen для правильного screen_id в аналитике
              recordEvent("overlay_close", actualCurrentScreen, null, false, undefined, undefined, undefined, {
                overlayId: lastOverlay.screenId,
                position: lastOverlay.settings.position,
                closeMethod: "hover_leave"
              });
              console.log("TestView: Closed overlay on hover leave", {
                overlayId: lastOverlay.screenId,
                closeMethod: "hover_leave",
                stackSize: newStack.length,
                currentScreen: actualCurrentScreen
              });
              hoverOverlayRef.current = null;
              return newStack;
            } else {
              console.log("TestView: Overlay ID mismatch, not closing", {
                hoverOverlayRef: hoverOverlayRef.current,
                lastOverlayScreenId: lastOverlay.screenId,
                stackSize: prev.length
              });
            }
          } else {
            console.log("TestView: Overlay stack is empty, nothing to close", {
              hoverOverlayRef: hoverOverlayRef.current
            });
          }
          return prev; // Не изменяем стек, если не нашли нужный overlay
        });
        hoverLeaveTimeoutRef.current = null;
      }, 100);
      
      return;
    }
    
    // Если была навигация по hover, возвращаемся назад
    // ВАЖНО: Это сложнее, так как нужно знать, на какой экран возвращаться
    // Для простоты пока не реализуем возврат навигации - это требует хранения истории
    if (hoverOverlayRef.current === "navigation") {
      console.log("TestView: Hover navigation leave - navigation revert not implemented");
      hoverOverlayRef.current = null;
    }
  };

  // Обработчик скролла с дебаунсом
  const handleScroll = (e: React.UIEvent<HTMLDivElement>, frameId: string, isNested: boolean = false) => {
    if (testCompleted.current || !currentScreen) {
      return;
    }

    const target = e.currentTarget;
    const scrollX = target.scrollLeft;
    const scrollY = target.scrollTop;
    const scrollWidth = target.scrollWidth;
    const scrollHeight = target.scrollHeight;
    const clientWidth = target.clientWidth;
    const clientHeight = target.clientHeight;
    
    // Вычисляем глубину скролла (0-100%)
    const scrollDepthX = scrollWidth > clientWidth ? (scrollX / (scrollWidth - clientWidth)) * 100 : 0;
    const scrollDepthY = scrollHeight > clientHeight ? (scrollY / (scrollHeight - clientHeight)) * 100 : 0;
    
    // Определяем направление скролла
    let scrollDirection = "";
    if (scrollY > 0) scrollDirection = "down";
    else if (scrollY < 0) scrollDirection = "up";
    else if (scrollX > 0) scrollDirection = "right";
    else if (scrollX < 0) scrollDirection = "left";
    
    // Определяем тип скролла (вертикальный/горизонтальный/оба)
    // Находим экран или вложенный фрейм для определения overflowDirection
    let scrollType: "vertical" | "horizontal" | "both" | null = null;
    
    if (!proto) {
      console.warn("TestView: proto is null, cannot determine scroll type");
    } else {
      // НОВОЕ: Поддержка v1/v2 - используем helper функцию
      const currentScreenOrScene = getScreenOrScene(proto, currentScreen);
      
      if (isNested) {
        // Для вложенного фрейма ищем его в nestedFrames текущего экрана (только для v1)
        if (isProtoV1(proto) && currentScreenOrScene) {
          const screen = currentScreenOrScene as Screen;
          if (screen.nestedFrames) {
            const nestedFrame = screen.nestedFrames.find((n: NestedFrame) => n.id === frameId);
            if (nestedFrame) {
              if (nestedFrame.overflowDirection === "VERTICAL") scrollType = "vertical";
              else if (nestedFrame.overflowDirection === "HORIZONTAL") scrollType = "horizontal";
              else if (nestedFrame.overflowDirection === "BOTH") scrollType = "both";
            }
          }
        }
        // Для v2 nested frames будут обрабатываться в Phase 0
      } else {
        // Для основного экрана используем overflowDirection (только для v1)
        if (isProtoV1(proto) && currentScreenOrScene) {
          const screen = currentScreenOrScene as Screen;
          if (screen.overflowDirection === "VERTICAL") scrollType = "vertical";
          else if (screen.overflowDirection === "HORIZONTAL") scrollType = "horizontal";
          else if (screen.overflowDirection === "BOTH") scrollType = "both";
        }
        // Для v2 scroll будет обрабатываться в Phase 0
      }
    }
    
    // Дебаунс для избежания слишком частых событий
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      // ВАЖНО: Определяем правильный screen ID для трекинга скролла
      // Если frameId принадлежит overlay, используем overlay screen ID
      const activeScreenId = getActiveScreenId(null, frameId);
      recordEvent("scroll", activeScreenId, frameId, false, undefined, undefined, {
        scrollX,
        scrollY,
        scrollDepthX,
        scrollDepthY,
        scrollDirection,
        scrollType, // Добавляем тип скролла
        isNested,
        frameId: isNested ? frameId : undefined
      });
    }, 100);
  };

  // КРИТИЧНО: Обновляем currentScreenRef при каждом изменении currentScreen
  // Это необходимо для получения актуального значения currentScreen в функциях без замыкания
  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  // КРИТИЧНО: Проверяем финальный экран при изменении currentScreen
  // Это работает независимо от postMessage от Figma
  useEffect(() => {
    // КРИТИЧНО: Логируем вход в useEffect для отладки
    if (currentScreen && proto) {
      console.log("TestView: useEffect - final screen check entry", {
        currentScreen,
        protoEnd: proto.end,
        testCompleted: testCompleted.current,
        willCheck: !testCompleted.current
      });
    }
    
    if (currentScreen && proto && !testCompleted.current) {
      // НОВОЕ: Проверяем не только по proto.end, но и по маркеру [final] в названии экрана
      const currentScreenOrScene = getScreenOrScene(proto, currentScreen);
      const screenName = currentScreenOrScene ? ("name" in currentScreenOrScene ? currentScreenOrScene.name : null) : null;
      // КРИТИЧНО: Улучшаем проверку финального экрана - ищем [final], [end], или "final" в конце имени
      // ВАЖНО: Проверяем различные варианты написания маркера финального экрана
      const hasFinalMarker = screenName ? (
        /\[final\]/i.test(screenName) || 
        /\[end\]/i.test(screenName) ||
        /\bfinal\b/i.test(screenName) || // Слово "final" в любом месте
        /final$/i.test(screenName.trim()) || // "final" в конце имени (без скобок)
        /финал/i.test(screenName) || // Русское слово "финал"
        /конец/i.test(screenName) || // Русское слово "конец"
        /заверш/i.test(screenName) // Русское слово "заверш" (завершение)
      ) : false;
      const isEndScreen = currentScreen === proto.end;
      
      // Отладочная информация
              // КРИТИЧНО: Получаем детальную информацию о всех экранах для отладки
              const allScreensOrScenes = getAllScreensOrScenes(proto);
              const screensInfo = allScreensOrScenes.map(s => ({
                id: s.id,
                name: "name" in s ? s.name : null,
                figmaNodeId: "figmaNodeId" in s ? s.figmaNodeId : null,
                isCurrentScreen: s.id === currentScreen,
                isStartScreen: s.id === proto.start,
                isEndScreen: s.id === proto.end,
                hasFinalMarker: "name" in s && s.name ? /\[final\]/i.test(s.name) : false
              }));
              
              // КРИТИЧНО: Получаем информацию о hotspots на текущем экране
              const currentScreenHotspots = proto.hotspots ? proto.hotspots.filter(h => h.frame === currentScreen) : [];
              const hotspotsInfo = currentScreenHotspots.map(h => ({
                id: h.id,
                name: h.name,
                target: h.target,
                targetScreenName: h.target ? (() => {
                  const targetScreen = getScreenOrScene(proto, h.target);
                  return targetScreen ? ("name" in targetScreen ? targetScreen.name : null) : null;
                })() : null,
                trigger: h.trigger
              }));
              
              console.log("TestView: useEffect - currentScreen check", {
                currentScreen,
                screenName,
                hasFinalMarker,
                protoEnd: proto.end,
                protoStart: proto.start,
                isEndScreen,
                isEndDifferentFromStart: proto.end !== proto.start,
                match: isEndScreen || hasFinalMarker,
                testCompleted: testCompleted.current,
                screenExists: currentScreen ? hasScreenOrScene(proto, currentScreen) : false,
                availableScreens: allScreensOrScenes.map(s => s.id),
                // КРИТИЧНО: Детальная информация для отладки
                willCheckFinalScreen: !testCompleted.current && (isEndScreen || hasFinalMarker) && proto.end !== proto.start,
                blockingReason: testCompleted.current ? "testCompleted is true" : 
                               (!isEndScreen && !hasFinalMarker) ? "not final screen" :
                               (proto.end === proto.start) ? "end === start" : "none",
                // НОВОЕ: Детальная информация о всех экранах
                screensInfo: screensInfo,
                // НОВОЕ: Детальная информация о hotspots на текущем экране
                currentScreenHotspotsCount: currentScreenHotspots.length,
                hotspotsInfo: hotspotsInfo
              });
      
      // НОВОЕ: Завершаем тест если достигли proto.end ИЛИ экран с маркером [final]
      // КРИТИЧНО: Показываем попап только когда пользователь УЖЕ НА финальном экране
      // ВАЖНО: Проверяем, что proto.end !== proto.start (избегаем случая, когда плагин установил endFrame = startFrame)
      const isEndDifferentFromStart = proto.end !== proto.start;
      
      if ((isEndScreen || hasFinalMarker) && isEndDifferentFromStart) {
        console.log("TestView: 🎉 Reached final screen in useEffect! Showing success popup...", {
          isEndScreen,
          hasFinalMarker,
          screenName,
          currentScreen,
          protoEnd: proto.end,
          protoStart: proto.start,
          isEndDifferentFromStart,
          testCompletedBefore: testCompleted.current,
          actualSessionId,
          propSessionId
        });
        
        // КРИТИЧНО: Проверяем, не завершен ли тест уже (может быть завершен через fallback)
        if (testCompleted.current) {
          console.log("TestView: ⚠️ Test already completed, skipping duplicate completion", {
            currentScreen,
            protoEnd: proto.end
          });
          return;
        }
        
        testCompleted.current = true; // Помечаем, что тест завершен
        // Используем актуальный sessionId из state
        const currentSessionId = actualSessionId || propSessionId;
        if (currentSessionId) {
          recordEvent("completed", currentScreen);
          // НОВОЕ: Показываем попап "Вы успешно прошли задачу" через небольшую задержку
          // чтобы пользователь увидел финальный экран перед попапом
          setTimeout(() => {
            if (!testCompleted.current) {
              console.log("TestView: ⚠️ Test completion was cancelled, not showing popup");
              return;
            }
            console.log("TestView: Setting showSuccessPopup to true (after delay)");
            setShowSuccessPopup(true);
          }, 1000); // 1 секунда задержки, чтобы пользователь увидел финальный экран
        } else {
          console.error("TestView: Cannot show success popup - sessionId is null", {
            actualSessionId,
            propSessionId,
            currentScreen
          });
        }
      } else {
        // КРИТИЧНО: Логируем, почему проверка не прошла
        if (isEndScreen || hasFinalMarker) {
          console.log("TestView: ⚠️ Final screen detected but completion check failed", {
            isEndScreen,
            hasFinalMarker,
            screenName,
            currentScreen,
            protoEnd: proto.end,
            protoStart: proto.start,
            isEndDifferentFromStart,
            reason: !isEndDifferentFromStart ? "end === start" : 
                   (!isEndScreen && !hasFinalMarker) ? "not final screen" : "unknown"
          });
        }
      }
      
      if (isEndScreen && !isEndDifferentFromStart) {
        // КРИТИЧНО: Если proto.end === proto.start, это означает, что плагин не смог определить финальный экран
        // В этом случае НЕ завершаем прототип, чтобы пользователь мог пройти весь flow
        console.warn("TestView: ⚠️ proto.end === proto.start, skipping completion check to allow full flow navigation", {
          currentScreen,
          protoEnd: proto.end,
          protoStart: proto.start,
          screenName
        });
      }
    }
  }, [currentScreen, proto, actualSessionId, propSessionId]);
  

  // Отслеживание закрытия вкладки/браузера и авто‑закрытие по неактивности
  useEffect(() => {
    // Используем актуальный sessionId из state
    const currentSessionId = actualSessionId || propSessionId;
    if (!currentSessionId || !proto) {
      return;
    }

    const maybeSendClosed = () => {
      // Не записываем closed, если тест уже завершен (completed отправлен)
      // Проверяем, не на финальном экране ли мы (если да, то тест завершен или завершается)
      if (!hasRecordedClosed.current && currentScreen !== proto.end && !testCompleted.current) {
        hasRecordedClosed.current = true;
        recordEvent("closed", currentScreen, null, true); // useBeacon = true для надежной отправки
      }
    };

    const handleBeforeUnload = () => {
      maybeSendClosed();
    };

    const handlePageHide = () => {
      maybeSendClosed();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        maybeSendClosed();
      }
    };

    // Периодически проверяем неактивность для авто‑закрытия
    const startInactivityInterval = () => {
      if (inactivityIntervalRef.current !== null) {
        return;
      }
      inactivityIntervalRef.current = window.setInterval(() => {
        // Если уже есть терминальное событие — ничего не делаем
        if (testCompleted.current || hasRecordedClosed.current) {
          return;
        }
        const now = Date.now();
        const inactivityMs = now - lastActivityAtRef.current;
        if (inactivityMs >= SESSION_INACTIVITY_TIMEOUT_MS) {
          maybeSendClosed();
        }
      }, INACTIVITY_CHECK_INTERVAL_MS);
    };

    const stopInactivityInterval = () => {
      if (inactivityIntervalRef.current !== null) {
        clearInterval(inactivityIntervalRef.current);
        inactivityIntervalRef.current = null;
      }
    };

    // Стартуем отслеживание
    startInactivityInterval();
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Очистка при размонтировании
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopInactivityInterval();
    };
  }, [actualSessionId, propSessionId, proto, currentScreen]);

  // НОВОЕ: Keyboard shortcut для debug overlay (Press 'D')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Проверяем, что не в input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // 'D' или 'd' для toggle debug overlay
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setDebugOverlayEnabled(!debugOverlayEnabled);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Мастер разрешений и запуск записи - показываем сайдбар и оверлей поверх прототипа
  const showPermissionsUI = (recordScreen || recordCamera || recordAudio) && permissionStep > 0 && !readyToStartTest;
  const showStep2 = ((permissionStep === 2) || (permissionStep === 1 && recordScreen && !(recordCamera || recordAudio))) && recordScreen;
  // #region agent log
  if (showPermissionsUI && (recordScreen || recordCamera || recordAudio)) {
    fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:Permissions UI state',message:'step visibility',data:{recordScreen,recordCamera,recordAudio,permissionStep,showStep2,showPermissionsUI},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
  }
  // #endregion
  console.log("TestView: Permissions UI state", {
    recordScreen,
    recordCamera,
    recordAudio,
    permissionStep,
    readyToStartTest,
    showPermissionsUI,
    hasProto: !!proto
  });
  const micEnabled = !!cameraStream && (recordAudio || recordCamera);
  // Камера считается включённой для записи ИЛИ для eye tracking
  const cameraEnabled = !!cameraStream && recordCamera;
  const eyeTrackingCameraEnabled = !!cameraStream && enableEyeTracking && !recordCamera;
  const screenEnabled = !!screenStream && recordScreen;

  const handleRequestCameraAndMic = async () => {
    try {
      // Запрашиваем видео если recordCamera ИЛИ enableEyeTracking
      const needsVideo = recordCamera || enableEyeTracking;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: recordAudio || recordCamera,
        video: needsVideo,
      });
      setCameraStream(stream);
      console.log("TestView: Camera/mic stream obtained", { needsVideo, enableEyeTracking, recordCamera, recordAudio });
    } catch (err) {
      console.warn("TestView: getUserMedia failed", err);
    } finally {
      // Если запись экрана не нужна — сразу на финальный экран (шаг 3), иначе — шаг 2 (запрос экрана)
      const nextStep = recordScreen ? 2 : 3;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:after camera/mic',message:'permissionStep after step 1',data:{recordScreen,nextStep,enableEyeTracking},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      setPermissionStep(nextStep);
    }
  };

  const handleRequestScreen = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TestView.tsx:handleRequestScreen',message:'getDisplayMedia requested',data:{recordScreen},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: recordScreen,
        audio: false,
      } as MediaStreamConstraints);
      
      // КРИТИЧНО: Добавляем обработчик события ended для треков экрана
      // Когда пользователь останавливает запись экрана через браузер, трек завершается
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          console.log("TestView: Screen recording track ended by user");
          setScreenStream(null);
          if (recordingScreenController) {
            recordingScreenController.stop();
            setRecordingScreenController(null);
          }
        };
      });
      
      setScreenStream(stream);
      console.log("TestView: Screen stream obtained", { 
        hasVideoTracks: stream.getVideoTracks().length > 0,
        trackLabel: stream.getVideoTracks()[0]?.label 
      });
    } catch (err) {
      console.warn("TestView: getDisplayMedia failed", err);
    } finally {
      setPermissionStep(3);
    }
  };

  const handleStart = () => {
    console.log("TestView: handleStart called", {
      cameraStream: !!cameraStream,
      screenStream: !!screenStream,
      hasProto: !!proto,
      currentScreen,
      showPermissionsUI,
      startRecordingWhenReadyDefined: startRecordingWhenReady !== undefined
    });
    // Если запись запускается по сигналу родителя (после «Начать» в сайдбаре задания) — не стартуем запись здесь
    const deferRecordingToParent = typeof onPermissionsComplete === "function";
    if (!deferRecordingToParent) {
      // ВАЖНО: recordCamera проверяем явно, т.к. cameraStream может содержать только аудио
      if (cameraStream && recordCamera) {
        const cameraCtrl = createMediaRecordingController({ streams: [cameraStream] });
        cameraCtrl.start();
        setRecordingCameraController(cameraCtrl);
      }
      if (screenStream && recordScreen) {
        // Если recordAudio=true но recordCamera=false, добавляем аудио-треки к записи экрана
        let streamForRecording: MediaStream = screenStream;
        if (recordAudio && !recordCamera && cameraStream) {
          streamForRecording = new MediaStream([
            ...screenStream.getVideoTracks(),
            ...cameraStream.getAudioTracks(),
          ]);
          console.log("TestView: Adding microphone audio to screen recording (handleStart)", { 
            videoTracks: streamForRecording.getVideoTracks().length,
            audioTracks: streamForRecording.getAudioTracks().length 
          });
        }
        const screenCtrl = createMediaRecordingController({ streams: [streamForRecording] });
        screenCtrl.start();
        setRecordingScreenController(screenCtrl);
      }
      console.log("TestView: Recording started", { camera: recordCamera && !!cameraStream, screen: recordScreen && !!screenStream, audioInScreen: recordAudio && !recordCamera });
      if (enableEyeTracking && runIdOverride && blockIdOverride && studyIdOverride) {
        void startEyeTracking();
      }
    }
    console.log("TestView: Setting readyToStartTest to true - sidebar should hide now");
    setReadyToStartTest(true);
    if (recordCamera && typeof window !== "undefined") {
      if (cameraPreviewPopupRef.current && !cameraPreviewPopupRef.current.closed) {
        cameraPreviewPopupRef.current.close();
      }
      const url = `${window.location.origin}/camera-preview`;
      const popup = window.open(url, "camera-preview", "width=140,height=160,left=100,top=100,noopener,noreferrer");
      cameraPreviewPopupRef.current = popup ?? null;
    }
    onPermissionsComplete?.();
    setTimeout(() => {
      console.log("TestView: After handleStart - checking visibility", {
        readyToStartTest,
        showPermissionsUI: (recordScreen || recordCamera || recordAudio) && permissionStep > 0 && !readyToStartTest,
        hasProto: !!proto,
        currentScreen
      });
    }, 100);
  };

  // Запуск записи по сигналу родителя (после клика «Начать» в сайдбаре задания)
  useEffect(() => {
    if (!startRecordingWhenReady) return;
    // КРИТИЧНО: после завершения теста не запускаем запись снова (контроллеры обнуляются → эффект перезапускается → MediaRecorder на остановленных треках даёт NotSupportedError)
    if (testCompleted.current) return;
    // ВАЖНО: recordCamera/recordScreen проверяем явно, т.к. cameraStream может содержать только аудио
    if (cameraStream && recordCamera && !recordingCameraController) {
      const cameraCtrl = createMediaRecordingController({ streams: [cameraStream] });
      cameraCtrl.start();
      setRecordingCameraController(cameraCtrl);
    }
    if (screenStream && recordScreen && !recordingScreenController) {
      // Если recordAudio=true но recordCamera=false, добавляем аудио-треки к записи экрана
      // cameraStream содержит только аудио в этом случае
      const streamsForScreenRecording: MediaStream[] = [screenStream];
      if (recordAudio && !recordCamera && cameraStream) {
        // Создаём новый комбинированный stream с видео экрана + аудио микрофона
        const combinedStream = new MediaStream([
          ...screenStream.getVideoTracks(),
          ...cameraStream.getAudioTracks(),
        ]);
        streamsForScreenRecording[0] = combinedStream;
        console.log("TestView: Adding microphone audio to screen recording", { 
          videoTracks: combinedStream.getVideoTracks().length,
          audioTracks: combinedStream.getAudioTracks().length 
        });
      }
      const screenCtrl = createMediaRecordingController({ streams: streamsForScreenRecording });
      screenCtrl.start();
      setRecordingScreenController(screenCtrl);
    }
    if (startRecordingWhenReady && ((cameraStream && recordCamera) || (screenStream && recordScreen))) {
      console.log("TestView: Recording started (after Начать)", { camera: recordCamera && !!cameraStream, screen: recordScreen && !!screenStream });
    }
    if (startRecordingWhenReady && enableEyeTracking && runIdOverride && blockIdOverride && studyIdOverride) {
      void startEyeTracking();
    }
  }, [startRecordingWhenReady, cameraStream, screenStream, recordingCameraController, recordingScreenController, recordCamera, recordScreen, recordAudio]);

  // Функция-обертка для рендеринга сайдбара и оверлея поверх прототипа
  // КРИТИЧНО: Всегда возвращаем одинаковую структуру DOM для предотвращения пересоздания компонентов
  // Скрываем sidebar и overlay через CSS (display: none), а не условным рендерингом
  const renderWithPermissionsUI = (children: React.ReactNode) => {
    console.log("TestView: renderWithPermissionsUI called", { 
      showPermissionsUI, 
      permissionStep, 
      readyToStartTest,
      recordScreen,
      recordCamera,
      recordAudio,
      hasChildren: !!children
    });

    return (
      <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
        {/* Основной контент прототипа (на всю ширину, по центру) */}
        <div style={{ 
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1 // КРИТИЧНО: Убеждаемся, что прототип виден поверх overlay
        }}>
          {children}
        </div>

        {/* Overlay с темным фоном и blur на области контента (справа от sidebar) */}
        {/* КРИТИЧНО: Скрываем через display: none вместо условного рендеринга для стабильности DOM */}
        <div style={{
          position: "absolute",
          top: 0,
          left: "400px", // Начинается справа от sidebar
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          zIndex: 999,
          pointerEvents: "none",
          display: showPermissionsUI ? "block" : "none"
        }} />

        {/* Сайдбар слева с разрешениями (overlay поверх всего, абсолютно позиционирован) */}
        {/* КРИТИЧНО: Скрываем через display: none вместо условного рендеринга для стабильности DOM */}
        {/* Это предотвращает пересоздание компонентов при изменении showPermissionsUI */}
        <div style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "400px",
          minWidth: "320px",
          background: "#ffffff",
          zIndex: 1001,
          boxShadow: "2px 0 8px rgba(0,0,0,0.1)",
          overflowY: "auto",
          padding: "24px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: showPermissionsUI ? "flex" : "none",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: "20px",
        }}>
          {permissionStep === 1 && (recordCamera || recordAudio || enableEyeTracking) && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Шаг 1</h2>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Настройка разрешений для задания</p>
                  <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
                    Следующая задача потребует некоторых дополнительных разрешений.
                  </p>
                  {/* Разные тексты для eye tracking vs записи камеры */}
                  {enableEyeTracking && !recordCamera ? (
                    <div style={{ padding: 12, borderRadius: 8, background: "#f5f5f7" }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Анализ взгляда</div>
                      <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
                        Для анализа движений глаз нужен доступ к камере. Видео не записывается — камера используется только для отслеживания взгляда.
                      </p>
                    </div>
                  ) : (
                    <div style={{ padding: 12, borderRadius: 8, background: "#f5f5f7" }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Разрешить запись аудио и видео</div>
                      <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
                        Это поможет нам захватить ваши реальные реакции и мысли. Когда вас попросят, просто нажмите
                        «Разрешить», чтобы предоставить разрешения.
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setPermissionStep(recordScreen ? 2 : 3)}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      background: "#f5f5f5",
                      cursor: "pointer",
                    }}
                  >
                    Пропустить
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestCameraAndMic}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "#007AFF",
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Продолжить
                  </button>
                </div>
              </>
            )}

            {/* Шаг 2: запрос записи экрана. Показываем при permissionStep === 2 ИЛИ когда включена только запись экрана (тогда шаг 1 не показывается) */}
            {showStep2 && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Шаг 2</h2>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Настройка разрешений для задания</p>
                  <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
                    Следующая задача потребует некоторых дополнительных разрешений.
                  </p>
                  <div style={{ padding: 12, borderRadius: 8, background: "#f5f5f7" }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>Разрешить запись экрана</div>
                    <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
                      Выберите <strong>вкладку</strong> браузера (не окно и не весь экран), чтобы превью камеры не попало в запись.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  {/* При включённой записи экрана не показываем «Пропустить» — иначе экран не будет зелёным на шаге 3 */}
                  {!recordScreen && (
                    <button
                      type="button"
                      onClick={() => setPermissionStep(3)}
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#f5f5f5",
                        cursor: "pointer",
                      }}
                    >
                      Пропустить
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRequestScreen}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "#007AFF",
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Продолжить
                  </button>
                </div>
              </>
            )}

            {permissionStep === 3 && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Вы все настроили</h2>
                  <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
                    Перед началом задания проверьте, какие разрешения активны.
                  </p>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          marginRight: 8,
                          background: micEnabled ? "#0f9d58" : "#ccc",
                        }}
                      />
                      <span style={{ fontSize: 14 }}>Микрофон</span>
                    </div>
                    {/* Показываем "Анализ взгляда" вместо "Камера" если включен eye tracking без записи камеры */}
                    {enableEyeTracking && !recordCamera ? (
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            marginRight: 8,
                            background: eyeTrackingCameraEnabled ? "#0f9d58" : "#ccc",
                          }}
                        />
                        <span style={{ fontSize: 14 }}>Анализ взгляда</span>
                      </div>
                    ) : recordCamera ? (
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            marginRight: 8,
                            background: cameraEnabled ? "#0f9d58" : "#ccc",
                          }}
                        />
                        <span style={{ fontSize: 14 }}>Камера</span>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          marginRight: 8,
                          background: screenEnabled ? "#0f9d58" : "#ccc",
                        }}
                      />
                      <span style={{ fontSize: 14 }}>Экран</span>
                      {recordScreen && !screenEnabled && (
                        <button
                          type="button"
                          onClick={() => setPermissionStep(2)}
                          style={{
                            marginLeft: 12,
                            padding: "4px 10px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: "1px solid #007AFF",
                            background: "transparent",
                            color: "#007AFF",
                            cursor: "pointer",
                          }}
                        >
                          Разрешить запись экрана
                        </button>
                      )}
                    </div>
                  </div>

                  {!micEnabled && !cameraEnabled && !eyeTrackingCameraEnabled && !screenEnabled && (
                    <p style={{ margin: 0, fontSize: 13, color: "#777" }}>
                      Некоторые разрешения заблокированы. Если вы хотите включить эти разрешения, вы можете сделать это в
                      настройках вашего браузера.
                    </p>
                  )}

                  {/* Показываем задание, если есть (скрыто в StudyRunView — задание в сайдбаре) */}
                  {!hideTaskAbove && instructionsOverride && (
                    <div style={{
                      padding: 16,
                      background: "#f5f5f7",
                      borderRadius: 8,
                    }}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 600 }}>Задание</h3>
                      <p style={{ margin: 0, fontSize: 14, color: "#333", whiteSpace: "pre-wrap" }}>
                        {instructionsOverride}
                      </p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleStart}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: "#007AFF",
                    color: "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  Далее
                  <ArrowRight size={18} />
                </button>
              </>
            )}
        </div>
      </div>
    );
  };

  // Функция-обертка для рендеринга сайдбара успешного завершения поверх прототипа
  const renderWithSuccessSidebar = (children: React.ReactNode) => {
    if (!showSuccessPopup) {
      return children;
    }

    return (
      <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
        {/* Основной контент прототипа (на всю ширину, по центру) */}
        <div style={{ 
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1 // КРИТИЧНО: Убеждаемся, что прототип виден поверх overlay
        }}>
          {children}
        </div>

        {/* Overlay с темным фоном и blur на области контента (справа от sidebar) */}
        {showSuccessPopup && (
          <div style={{
            position: "absolute",
            top: 0,
            left: "400px", // Начинается справа от sidebar
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            zIndex: 999,
            pointerEvents: "none"
          }} />
        )}

        {/* Сайдбар слева с сообщением об успехе (overlay поверх всего, абсолютно позиционирован) */}
        {showSuccessPopup && (
          <div style={{
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            width: "400px",
            minWidth: "320px",
            background: "#ffffff",
            zIndex: 1001,
            boxShadow: "2px 0 8px rgba(0,0,0,0.1)",
            overflowY: "auto",
            padding: "24px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}>
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
            }}>
              <CircleCheck 
                size={64} 
                color="#0f9d58" 
                style={{ marginBottom: 24 }}
              />
              <h2 style={{ 
                margin: 0, 
                fontSize: 24, 
                fontWeight: 600,
                color: "#333",
                textAlign: "center"
              }}>
                Поздравляем, вы справились с заданием
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSuccessPopup(false);
                // НОВОЕ: Если есть onComplete callback (для StudyView), вызываем его вместо навигации
                if (onComplete) {
                  console.log("TestView: Calling onComplete callback (from success sidebar button)");
                  onComplete();
                  return;
                }
                // Иначе переходим на опрос (legacy режим)
                const currentSessionId = actualSessionId || propSessionId;
                if (currentSessionId) {
                  navigate(`/finished/${currentSessionId}`, { state: { aborted: false, sessionId: currentSessionId } });
                }
              }}
              style={{
                width: "100%",
                marginTop: 24,
                padding: "12px 16px",
                borderRadius: 8,
                border: "none",
                background: "#007AFF",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: 16
              }}
            >
              Далее
              <MoveRight size={20} />
            </button>
          </div>
        )}
      </div>
    );
  };

  if (!proto) {
    // Empty state - когда нет prototypeId в URL
    if (isEmptyState) {
      return (
        <div style={{ 
          display: "flex", 
          flexDirection: "column",
          justifyContent: "center", 
          alignItems: "center", 
          minHeight: "100vh",
          padding: "40px 20px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}>
          <p style={{
            fontSize: "16px",
            color: "#666",
            margin: 0,
            lineHeight: "1.6",
            textAlign: "center"
          }}>
            Здесь скоро появится прототип для тестирования.<br />
            Ожидайте ссылку от организатора исследования.
          </p>
        </div>
      );
    }
    
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        /* Убрали minHeight: "100vh" чтобы не создавать лишние скроллы */
        background: "#f5f5f7",
        padding: "20px"
      }}>
        {testViewLoading && (
          <div style={{ marginBottom: "20px", color: "#666" }}>
            Загрузка прототипа...
          </div>
        )}
        {testViewError && (
          <div style={{ 
            marginBottom: "20px", 
            color: "#d32f2f", 
            padding: "12px", 
            background: "#ffebee", 
            borderRadius: "4px",
            maxWidth: "400px"
          }}>
            {testViewError}
          </div>
        )}
      </div>
    );
  }

  // НОВОЕ: Поддержка v1/v2 - используем helper функцию
  if (!currentScreen) {
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        background: "#f5f5f7",
        padding: "20px"
      }}>
        <div style={{ 
          marginBottom: "20px", 
          color: "#d32f2f", 
          padding: "12px", 
          background: "#ffebee", 
          borderRadius: "4px",
          maxWidth: "400px"
        }}>
          Current screen is null
        </div>
      </div>
    );
  }
  
  const screenOrScene = getScreenOrScene(proto, currentScreen);
  const isFinalScreen = currentScreen === proto.end;
  
  // НОВОЕ: Получаем начальный экран/сцену для стабильных размеров
  const startScreenOrScene = proto ? getScreenOrScene(proto, proto.start) : null;
  
  // НОВОЕ: Проверяем наличие метаданных Figma для canvas-based рендеринга
  // ВАЖНО: Используем FigmaEmbedViewer если есть хотя бы figmaFileId и figmaNodeId для текущего экрана
  // Это позволяет использовать Figma embed даже для старых прототипов, если есть базовые метаданные
  const currentScreenOrScene = screenOrScene;
  const currentFigmaNodeId = currentScreenOrScene 
    ? ("figmaNodeId" in currentScreenOrScene ? currentScreenOrScene.figmaNodeId : null)
    : null;
  
  // ВАЖНО: Для использования FigmaEmbedViewer нужны:
  // 1. figmaFileId (обязательно)
  // 2. figmaNodeId для текущего экрана (обязательно)
  // 3. figmaFileName или figmaStartNodeId (опционально, можно использовать дефолтные значения)
  const canUseFigmaEmbed = proto.figmaFileId && currentFigmaNodeId && currentScreen;
  
  // НОВОЕ: Логируем проверку метаданных для диагностики
  console.log("TestView: Checking Figma metadata for canvas rendering", {
    canUseFigmaEmbed,
    figmaFileId: proto.figmaFileId,
    figmaStartNodeId: proto.figmaStartNodeId,
    figmaFileName: proto.figmaFileName,
    currentScreen,
    currentFigmaNodeId,
    currentScreenOrSceneName: currentScreenOrScene?.name,
    willUseFigmaEmbedViewer: canUseFigmaEmbed
  });
  
  // КРИТИЧНО: Если нет метаданных Figma - показываем предупреждение и НЕ используем DOM-рендеринг
  // Пользователь должен переэкспортировать прототип через исправленный плагин
  if (!proto.figmaFileId || !currentFigmaNodeId) {
    console.warn("TestView: ⚠️ Figma metadata missing - prototype must be re-exported through fixed plugin", {
      missingFigmaFileId: !proto.figmaFileId,
      missingFigmaNodeId: !currentFigmaNodeId,
      currentScreen,
      currentScreenOrSceneName: currentScreenOrScene?.name
    });
    
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        background: "#f5f5f7",
        width: "100%",
        padding: "20px",
        minHeight: "100vh"
      }}>
        <div style={{
          maxWidth: "600px",
          padding: "24px",
          background: "#fff3cd",
          border: "2px solid #ffc107",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
        }}>
          <h2 style={{
            margin: "0 0 16px 0",
            fontSize: "20px",
            fontWeight: 600,
            color: "#856404"
          }}>
            ⚠️ Прототип требует переэкспорта
          </h2>
          <p style={{
            margin: "0 0 16px 0",
            fontSize: "14px",
            color: "#856404",
            lineHeight: "1.6"
          }}>
            {!proto.figmaFileId && currentFigmaNodeId 
              ? (
                <>
                  У прототипа отсутствует <strong>figmaFileId</strong> (ID файла Figma), но есть <strong>figmaNodeId</strong> для экранов. 
                  Это означает, что плагин работает, но не смог получить ID файла при экспорте. 
                  Это может произойти, если файл был локальным или не был сохранен в облаке Figma.
                  <br /><br />
                  <strong>Решение:</strong> Откройте файл из веб-версии Figma (figma.com) и переэкспортируйте прототип.
                </>
              )
              : "Этот прототип был создан до добавления поддержки Figma embed. Для использования canvas-based рендеринга необходимо переэкспортировать прототип через обновленный плагин Figma."
            }
          </p>
          <div style={{
            marginTop: "16px",
            padding: "12px",
            background: "#e7f3ff",
            borderRadius: "4px",
            fontSize: "13px",
            color: "#004085",
            lineHeight: "1.6"
          }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>📋 Инструкции по переэкспорту:</div>
            <ol style={{ margin: "0", paddingLeft: "20px" }}>
              <li>Убедитесь, что файл открыт из веб-версии Figma (figma.com), а не локальный файл</li>
              <li>Убедитесь, что файл сохранен в облаке Figma (не локальный)</li>
              <li>Откройте плагин в Figma и выберите нужный flow</li>
              <li>Экспортируйте прототип через плагин</li>
              <li>Проверьте консоль плагина (Developer → Console) на наличие сообщения "✅ Figma metadata saved successfully"</li>
            </ol>
          </div>
          <div style={{
            marginTop: "16px",
            padding: "12px",
            background: "#f8f9fa",
            borderRadius: "4px",
            fontSize: "12px",
            color: "#495057",
            fontFamily: "monospace"
          }}>
            <div><strong>Статус метаданных:</strong></div>
            <div>• figmaFileId: {proto.figmaFileId ? "✅" : "❌"} {proto.figmaFileId || "(отсутствует)"}</div>
            <div>• figmaNodeId для экрана "{currentScreenOrScene?.name || currentScreen}": {currentFigmaNodeId ? "✅" : "❌"} {currentFigmaNodeId || "(отсутствует)"}</div>
            {proto.figmaStartNodeId && (
              <div>• figmaStartNodeId: ✅ {proto.figmaStartNodeId}</div>
            )}
            {proto.figmaFileName && (
              <div>• figmaFileName: ✅ {proto.figmaFileName}</div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // НОВОЕ: Если есть figmaFileId и figmaNodeId для текущего экрана - используем FigmaEmbedViewer
  // ВАЖНО: Это основной способ рендеринга - используем Figma embed вместо DOM
  if (canUseFigmaEmbed) {
    console.log("TestView: ✅ Using FigmaEmbedViewer for canvas-based rendering", {
      fileId: proto.figmaFileId,
      nodeId: proto.figmaStartNodeId, // НОВОЕ: Логируем figmaStartNodeId, который используется для iframe
      currentFigmaNodeId: currentFigmaNodeId, // Текущий nodeId экрана (для справки)
      fileName: proto.figmaFileName,
      currentScreen: currentScreen,
      hotspotsForCurrentScreen: proto.hotspots.filter((h: Hotspot) => h.frame === currentScreen).length
    });
    
    const content = (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        background: "#f5f5f7",
        width: "100%",
        padding: "20px"
      }}>
        {/* Отображение задания над прототипом (скрыто в StudyRunView — задание в сайдбаре) */}
        {!hideTaskAbove && taskDescription && (() => {
          // КРИТИЧНО: Поддержка v1 (Screen) и v2 (Scene) прототипов для taskDescription
          // ВАЖНО: Используем startScreenOrScene для стабильных размеров, не зависящих от currentScreen
          let maxTaskWidth: number;
          if (isProtoV2(proto) && startScreenOrScene && "size" in startScreenOrScene) {
            const scene = startScreenOrScene as Scene;
            maxTaskWidth = scene.size?.width || 375;
          } else if (startScreenOrScene) {
            const screen = startScreenOrScene as Screen;
            maxTaskWidth = screen.viewportWidth || screen.width || 375;
          } else {
            maxTaskWidth = 375; // Fallback если startScreenOrScene не найден
          }
          
          return (
          <div style={{
            width: "100%",
            maxWidth: maxTaskWidth,
            marginBottom: 20,
            padding: 16,
            background: "#ffffff",
            borderRadius: 8,
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <h3 style={{
              margin: "0 0 8px 0",
              fontSize: 16,
              fontWeight: 600,
              color: "#333"
            }}>
              Задание:
            </h3>
            <p style={{
              margin: 0,
              fontSize: 14,
              color: "#666",
              lineHeight: 1.5
            }}>
              {taskDescription}
            </p>
          </div>
          );
        })()}
        
        {/* НОВОЕ: FigmaEmbedViewer для canvas-based рендеринга */}
        {/* ВАЖНО: Используем Figma embed для точного рендеринга прототипа */}
        {/* КРИТИЧНО: Загружаем iframe ОДИН РАЗ с figmaStartNodeId, позволяем Figma обрабатывать все переходы */}
        {/* ВАЖНО: key стабильный, чтобы React НЕ пересоздавал компонент при переходах */}
        {(() => {
          // КРИТИЧНО: Поддержка v1 (Screen) и v2 (Scene) прототипов
          // ВАЖНО: Используем startScreenOrScene для стабильных размеров iframe, не зависящих от currentScreen
          // Размеры должны оставаться постоянными на протяжении всего взаимодействия с прототипом
          let screenWidth: number;
          let screenHeight: number;
          
          if (isProtoV2(proto) && startScreenOrScene && "size" in startScreenOrScene) {
            // Для v2 прототипов используем size из начальной Scene
            const scene = startScreenOrScene as Scene;
            screenWidth = scene.size?.width || 375; // Fallback на стандартную ширину мобильного экрана
            screenHeight = scene.size?.height || 812; // Fallback на стандартную высоту мобильного экрана
          } else if (startScreenOrScene) {
            // Для v1 прототипов используем Screen свойства начального экрана
            const screen = startScreenOrScene as Screen;
            screenWidth = screen.viewportWidth || screen.width || 375;
            screenHeight = screen.viewportHeight || screen.height || 812;
          } else {
            // Fallback если startScreenOrScene не найден
            screenWidth = 375;
            screenHeight = 812;
          }
          
          // КРИТИЧНО: Проверяем, что размеры валидны (не NaN, не 0, не отрицательные)
          if (!screenWidth || !screenHeight || isNaN(screenWidth) || isNaN(screenHeight) || screenWidth <= 0 || screenHeight <= 0) {
            console.warn("TestView: Invalid screen dimensions, using fallback", {
              screenWidth,
              screenHeight,
              startScreenOrScene,
              currentScreen,
              isProtoV2: isProtoV2(proto),
              note: "Using startScreenOrScene for stable dimensions"
            });
            screenWidth = 375;
            screenHeight = 812;
          }
          
          // Вычисляем максимальные размеры с учетом viewport и padding
          const availableWidth = window.innerWidth - 40; // 40px для padding
          const availableHeight = window.innerHeight - 200; // 200px для taskDescription и padding
          
          const maxWidth = Math.min(screenWidth, availableWidth);
          const maxHeight = Math.min(screenHeight, availableHeight);
          
          // Вычисляем масштаб с сохранением соотношения сторон
          const scaleByWidth = maxWidth / screenWidth;
          const scaleByHeight = maxHeight / screenHeight;
          const scale = Math.min(scaleByWidth, scaleByHeight, 1); // Не увеличиваем больше оригинала
          
          const scaledWidth = screenWidth * scale;
          const scaledHeight = screenHeight * scale;
          
          // Логируем вычисленные размеры для отладки
          console.log("TestView: Calculated prototype dimensions", {
            originalWidth: screenWidth,
            originalHeight: screenHeight,
            scaledWidth,
            scaledHeight,
            scale,
            availableWidth: window.innerWidth - 40,
            availableHeight: window.innerHeight - 200,
            isProtoV2: isProtoV2(proto),
            startScreenOrSceneType: startScreenOrScene ? ("size" in startScreenOrScene ? "Scene" : "Screen") : "null",
            startScreenId: proto.start,
            currentScreenId: currentScreen,
            note: "Dimensions based on startScreenOrScene for stable iframe size"
          });
          
          // КРИТИЧНО: Финальная проверка на валидность вычисленных размеров
          if (isNaN(scaledWidth) || isNaN(scaledHeight) || scaledWidth <= 0 || scaledHeight <= 0) {
            console.error("TestView: Calculated dimensions are invalid", {
              scaledWidth,
              scaledHeight,
              screenWidth,
              screenHeight,
              scale,
              scaleByWidth,
              scaleByHeight,
              maxWidth,
              maxHeight
            });
            // Fallback на исходные размеры экрана
            return (
              <div style={{
                width: screenWidth,
                height: screenHeight,
                margin: "0 auto",
                position: "relative"
              }}>
                <div style={{ padding: "20px", color: "#d32f2f" }}>
                  Ошибка: не удалось вычислить размеры прототипа
                </div>
              </div>
            );
          }
          
          return (
            <div style={{
              width: scaledWidth,
              height: scaledHeight,
              margin: "0 auto",
              position: "relative"
            }}>
              <FigmaEmbedViewer
                key={`figma-embed-${proto.figmaFileId}`} // КРИТИЧНО: Стабильный key - iframe загружается один раз
                fileId={proto.figmaFileId!}
                nodeId={proto.figmaStartNodeId!} // КРИТИЧНО: Всегда используем figmaStartNodeId - iframe загружается один раз
                fileName={proto.figmaFileName || "fileName"} // Fallback на "fileName" если не указано
                hotspots={proto.hotspots} // Передаем ВСЕ хотспоты, фильтруем по currentScreen внутри компонента
                width={scaledWidth}
                height={scaledHeight}
          onHotspotClick={(hotspot, clickX, clickY, currentScreenIdFromProxy) => {
            // КРИТИЧНО: Вызываем основную функцию onHotspotClick для обработки всех событий
            // onHotspotClick уже записывает hotspot_click, overlay_open/close/swap и обрабатывает BACK action
            // НЕ дублируем обработку здесь
            console.log("TestView: FigmaEmbedViewer - Hotspot clicked (delegating to onHotspotClick)", {
              hotspotId: hotspot.id,
              hotspotName: hotspot.name,
              target: hotspot.target,
              currentScreenIdFromProxy,
              hasOverlayAction: !!hotspot.overlayAction,
              overlayActionType: hotspot.overlayAction?.type
            });
            
            // КРИТИЧНО: Проверяем, имеет ли hotspot overlayAction перед вызовом onHotspotClick
            // Если hotspot открывает overlay, мы не должны обновлять currentScreen для hotspot.target
            const hasOverlayAction = hotspot.overlayAction?.type === "OPEN_OVERLAY";
            
            onHotspotClick(hotspot, clickX, clickY);
            
            // КРИТИЧНО: Если hotspot.target указывает на другой экран, обновляем currentScreen
            // Это альтернативный способ отслеживания изменений экрана, если PRESENTED_NODE_CHANGED не приходит
            // ВАЖНО: НЕ обновляем currentScreen если hotspot открывает overlay (даже если overlayAction обработан в onHotspotClick)
            if (hotspot.target && hotspot.target !== currentScreen && !hasOverlayAction) {
              const targetScreenOrScene = getScreenOrScene(proto, hotspot.target);
              if (targetScreenOrScene) {
                // КРИТИЧНО: Проверяем, является ли это overlay-экраном
                // Если это overlay, НЕ обновляем currentScreen - overlay не должен менять размеры основного iframe
                // Проверяем двумя способами:
                // 1. Если overlay уже открыт (в overlayStack)
                // 2. Если какой-либо hotspot имеет overlayAction, который ссылается на этот экран
                const isOverlayInStack = overlayStack.some(o => o.screenId === targetScreenOrScene.id);
                const isOverlayReferenced = proto && proto.hotspots?.some(h => 
                  h.overlayAction?.type === "OPEN_OVERLAY" && h.overlayAction.overlayId === targetScreenOrScene.id
                );
                const isOverlayScreen = isOverlayInStack || isOverlayReferenced;
                
                if (isOverlayScreen) {
                  console.log("TestView: hotspot.target points to overlay screen - skipping currentScreen update", {
                    target: hotspot.target,
                    overlayScreenId: targetScreenOrScene.id,
                    overlayScreenName: "name" in targetScreenOrScene ? targetScreenOrScene.name : null,
                    currentScreen,
                    isOverlayInStack,
                    isOverlayReferenced,
                    hotspotId: hotspot.id,
                    hotspotName: hotspot.name,
                    note: "Overlay screens should not change main iframe dimensions"
                  });
                  return; // НЕ обновляем currentScreen для overlay - это предотвращает изменение размеров iframe
                }
                
                const targetScreenName = "name" in targetScreenOrScene ? targetScreenOrScene.name : null;
                const isTargetFinalScreen = hotspot.target === proto.end || 
                  (targetScreenName && /\[final\]/i.test(targetScreenName));
                
                console.log("TestView: Updating currentScreen via hotspot.target (fallback if PRESENTED_NODE_CHANGED not received)", {
                  fromScreen: currentScreen,
                  toScreen: hotspot.target,
                  targetScreenName,
                  isTargetFinalScreen,
                  protoEnd: proto.end,
                  hotspotId: hotspot.id,
                  hotspotName: hotspot.name
                });
                
                // КРИТИЧНО: Добавляем текущий экран в историю СИНХРОННО, ДО setTimeout
                // Это необходимо для обработки Action "BACK" - если пользователь сразу кликнет BACK,
                // история уже будет заполнена
                // ВАЖНО: Захватываем текущее значение currentScreen в замыкании
                const currentScreenBeforeUpdate = currentScreen;
                if (currentScreenBeforeUpdate && currentScreenBeforeUpdate !== hotspot.target) {
                  if (screenHistoryRef.current.length === 0 || 
                      screenHistoryRef.current[screenHistoryRef.current.length - 1] !== currentScreenBeforeUpdate) {
                    screenHistoryRef.current.push(currentScreenBeforeUpdate);
                    console.log("TestView: Added to screen history via hotspot.target fallback (SYNC, before setTimeout)", {
                      screen: currentScreenBeforeUpdate,
                      historyLength: screenHistoryRef.current.length,
                      history: [...screenHistoryRef.current]
                    });
                  }
                }
                
                // КРИТИЧНО: Сохраняем target в локальную переменную для использования в setTimeout
                // TypeScript не может отследить что hotspot.target не null внутри замыкания
                const targetScreen = hotspot.target;
                
                // КРИТИЧНО: Обновляем currentScreen с небольшой задержкой, чтобы дать Figma время на навигацию
                // ВАЖНО: Для финального экрана это критично, так как PRESENTED_NODE_CHANGED может не прийти
                setTimeout(() => {
                  console.log("TestView: Setting currentScreen via hotspot.target fallback", {
                    target: targetScreen,
                    isFinalScreen: isTargetFinalScreen,
                    protoEnd: proto.end,
                    targetScreenName,
                    willTriggerFinalScreenCheck: isTargetFinalScreen,
                    historyLength: screenHistoryRef.current.length,
                    history: [...screenHistoryRef.current]
                  });
                  
                  setCurrentScreen(targetScreen);
                  recordEvent("screen_load", targetScreen, null);
                  
                  // КРИТИЧНО: Если это финальный экран, сразу проверяем завершение теста
                  // Это нужно, так как useEffect может не сработать сразу
                  // ВАЖНО: Улучшаем проверку финального экрана - ищем [final], [end], или "final" в конце имени
                  const targetScreenOrSceneForCheck = getScreenOrScene(proto, targetScreen);
                  const targetScreenNameForCheck = targetScreenOrSceneForCheck ? ("name" in targetScreenOrSceneForCheck ? targetScreenOrSceneForCheck.name : null) : null;
                  const hasFinalMarkerForTarget = targetScreenNameForCheck ? (
                    /\[final\]/i.test(targetScreenNameForCheck) || 
                    /\[end\]/i.test(targetScreenNameForCheck) ||
                    /\bfinal\b/i.test(targetScreenNameForCheck) ||
                    /final$/i.test(targetScreenNameForCheck.trim()) ||
                    /финал/i.test(targetScreenNameForCheck) ||
                    /конец/i.test(targetScreenNameForCheck) ||
                    /заверш/i.test(targetScreenNameForCheck)
                  ) : false;
                  const isTargetFinalScreenImproved = targetScreen === proto.end || hasFinalMarkerForTarget;
                  
                  if (isTargetFinalScreenImproved && !testCompleted.current) {
                    console.log("TestView: 🎯 Final screen detected via hotspot.target fallback! Triggering completion check...", {
                      target: targetScreen,
                      targetScreenName: targetScreenNameForCheck,
                      hasFinalMarker: hasFinalMarkerForTarget,
                      protoEnd: proto.end,
                      protoStart: proto.start,
                      isEndScreen: targetScreen === proto.end,
                      testCompleted: testCompleted.current,
                      willTriggerCompletion: !testCompleted.current
                    });
                    
                    // КРИТИЧНО: Явно проверяем завершение теста здесь, так как useEffect может не сработать
                    // или сработать с задержкой
                    const isEndDifferentFromStart = proto.end !== proto.start;
                    if (isEndDifferentFromStart) {
                      console.log("TestView: 🎉 Triggering completion via hotspot.target fallback!", {
                        target: targetScreen,
                        targetScreenName: targetScreenNameForCheck,
                        protoEnd: proto.end,
                        protoStart: proto.start,
                        isEndDifferentFromStart
                      });
                      testCompleted.current = true;
                      const currentSessionId = actualSessionId || propSessionId;
                      if (currentSessionId) {
                        recordEvent("completed", targetScreen);
                        setTimeout(() => {
                          if (testCompleted.current) {
                            console.log("TestView: Setting showSuccessPopup to true (via fallback)");
                            setShowSuccessPopup(true);
                          }
                        }, 1000);
                      }
                    }
                  }
                }, 100);
              } else {
                console.warn("TestView: Target screen not found for hotspot.target", {
                  hotspotId: hotspot.id,
                  hotspotTarget: hotspot.target,
                  currentScreen,
                  availableScreens: getAllScreensOrScenes(proto).map(s => s.id)
                });
              }
            }
            // НЕ вызываем goToScreen - Figma embed сам обрабатывает навигацию
          }}
          // КРИТИЧНО: Передаем onHotspotHoverEnter/onHotspotHoverLeave ТОЛЬКО для overlay actions (tooltip на hover)
          // НЕ для навигации - Figma embed сам обрабатывает hover и навигацию
          // Эти callbacks будут вызываться ТОЛЬКО для overlay actions, не для навигации
          onHotspotHoverEnter={(hotspot) => {
            // КРИТИЧНО: Вызываем onHotspotHoverEnter ТОЛЬКО для overlay actions с триггером ON_HOVER (tooltip на hover)
            // НЕ для ON_CLICK (модалки должны открываться только на клик)
            // НЕ для навигации - Figma embed сам обрабатывает hover и навигацию
            if (hotspot.overlayAction && hotspot.overlayAction.type === "OPEN_OVERLAY" && hotspot.trigger === "ON_HOVER") {
              console.log("TestView: FigmaEmbedViewer - Calling onHotspotHoverEnter for overlay action (tooltip) - ON_HOVER trigger", {
                hotspotId: hotspot.id,
                overlayActionType: hotspot.overlayAction.type,
                overlayActionOverlayId: hotspot.overlayAction.overlayId,
                trigger: hotspot.trigger
              });
              onHotspotHoverEnter(hotspot);
            } else if (hotspot.overlayAction && hotspot.overlayAction.type === "OPEN_OVERLAY" && hotspot.trigger !== "ON_HOVER") {
              console.log("TestView: FigmaEmbedViewer - Skipping onHotspotHoverEnter for overlay action - not ON_HOVER trigger", {
                hotspotId: hotspot.id,
                overlayActionType: hotspot.overlayAction.type,
                trigger: hotspot.trigger,
                note: "Overlay will open on click, not on hover"
              });
            }
          }}
          onHotspotHoverLeave={(hotspot) => {
            // КРИТИЧНО: Вызываем onHotspotHoverLeave ТОЛЬКО для overlay actions с триггером ON_HOVER (tooltip на hover)
            // НЕ для ON_CLICK (модалки должны закрываться только по кнопке)
            // НЕ для навигации - Figma embed сам обрабатывает hover и навигацию
            if (hotspot.overlayAction && hotspot.overlayAction.type === "OPEN_OVERLAY" && hotspot.trigger === "ON_HOVER") {
              console.log("TestView: FigmaEmbedViewer - Calling onHotspotHoverLeave for overlay action (tooltip) - ON_HOVER trigger", {
                hotspotId: hotspot.id,
                overlayActionType: hotspot.overlayAction.type,
                trigger: hotspot.trigger
              });
              onHotspotHoverLeave(hotspot);
            } else if (hotspot.overlayAction && hotspot.overlayAction.type === "OPEN_OVERLAY" && hotspot.trigger !== "ON_HOVER") {
              console.log("TestView: FigmaEmbedViewer - Skipping onHotspotHoverLeave for overlay action - not ON_HOVER trigger", {
                hotspotId: hotspot.id,
                overlayActionType: hotspot.overlayAction.type,
                trigger: hotspot.trigger,
                note: "Overlay will close on button click, not on hover leave"
              });
            }
          }}
          protoEnd={proto.end}
          currentScreen={currentScreen}
          allScreensOrScenes={getAllScreensOrScenes(proto).map(s => ({
            id: s.id,
            figmaNodeId: "figmaNodeId" in s ? s.figmaNodeId : undefined
          }))} // НОВОЕ: Передаем все экраны/сцены для поиска хотспота по figmaNodeId
          onEmptyAreaClick={(clickX: number, clickY: number, screenId: string | null) => {
            // КРИТИЧНО: Регистрируем клики в пустую область для аналитики
            // ВАЖНО: Определяем правильный screen_id с fallback
            const actualCurrentScreen = currentScreenRef.current || currentScreen;
            const activeScreenId = screenId || actualCurrentScreen || getActiveScreenId(null, actualCurrentScreen || undefined);
            
            console.log("TestView: FigmaEmbedViewer - Empty area clicked", {
              clickX,
              clickY,
              screenId: activeScreenId,
              currentScreen: actualCurrentScreen,
              screenIdFromCallback: screenId,
              overlayStackSize: overlayStack.length,
              // КРИТИЧНО: Проверяем, не находимся ли мы внутри overlay
              isInsideOverlay: overlayStack.length > 0,
              overlayScreenId: overlayStack.length > 0 ? overlayStack[overlayStack.length - 1].screenId : null
            });
            
            // КРИТИЧНО: Регистрируем клик в пустую область с правильным screen_id
            recordEvent("click", activeScreenId, null, false, clickX, clickY);
          }}
          onScreenChange={(figmaNodeId: string) => {
            // КРИТИЧНО: Обновляем currentScreen при изменении экрана в Figma embed
            // Находим экран/сцену по figmaNodeId
            const allScreensOrScenes = getAllScreensOrScenes(proto);
            
            // КРИТИЧНО: Нормализуем figmaNodeId для сравнения (убираем пробелы, приводим к нижнему регистру)
            const normalizedFigmaNodeId = figmaNodeId?.trim().toLowerCase();
            
            // Ищем экран по figmaNodeId, но также проверяем по id (на случай если figmaNodeId === id)
            // КРИТИЧНО: Добавляем более гибкое сопоставление - проверяем точное совпадение и нормализованное
            const screenOrScene = allScreensOrScenes.find(s => {
              // Вариант 1: Точное совпадение figmaNodeId
              if ("figmaNodeId" in s && s.figmaNodeId) {
                if (s.figmaNodeId === figmaNodeId) return true;
                // Нормализованное сравнение
                if (s.figmaNodeId.trim().toLowerCase() === normalizedFigmaNodeId) return true;
              }
              // Вариант 2: Fallback - если figmaNodeId совпадает с id экрана
              if (s.id === figmaNodeId) return true;
              // Вариант 3: Нормализованное сравнение id
              if (s.id.trim().toLowerCase() === normalizedFigmaNodeId) return true;
              return false;
            });
            
            // КРИТИЧНО: Проверяем, является ли это overlay-экраном
            // Если это overlay, НЕ обновляем currentScreen - overlay не должен менять размеры основного iframe
            // Проверяем двумя способами:
            // 1. Если overlay уже открыт (в overlayStack)
            // 2. Если какой-либо hotspot имеет overlayAction, который ссылается на этот экран
            const isOverlayInStack = screenOrScene && overlayStack.some(o => o.screenId === screenOrScene.id);
            const isOverlayReferenced = screenOrScene && proto && proto.hotspots?.some(h => 
              h.overlayAction?.type === "OPEN_OVERLAY" && h.overlayAction.overlayId === screenOrScene.id
            );
            const isOverlayScreen = isOverlayInStack || isOverlayReferenced;
            
            if (isOverlayScreen) {
              console.log("TestView: PRESENTED_NODE_CHANGED for overlay screen - ignoring to prevent dimension change", {
                figmaNodeId,
                overlayScreenId: screenOrScene.id,
                overlayScreenName: "name" in screenOrScene ? screenOrScene.name : null,
                currentScreen,
                isOverlayInStack,
                isOverlayReferenced,
                note: "Overlay screens should not change main iframe dimensions"
              });
              return; // НЕ обновляем currentScreen для overlay - это предотвращает изменение размеров iframe
            }
            
            if (screenOrScene) {
              const screenName = "name" in screenOrScene ? screenOrScene.name : null;
              // КРИТИЧНО: Улучшаем проверку финального экрана - ищем [final], [end], или "final" в конце имени
              // ВАЖНО: Проверяем различные варианты написания маркера финального экрана
              const hasFinalMarker = screenName ? (
                /\[final\]/i.test(screenName) || 
                /\[end\]/i.test(screenName) ||
                /\bfinal\b/i.test(screenName) || // Слово "final" в любом месте
                /final$/i.test(screenName.trim()) || // "final" в конце имени (без скобок)
                /финал/i.test(screenName) || // Русское слово "финал"
                /конец/i.test(screenName) || // Русское слово "конец"
                /заверш/i.test(screenName) // Русское слово "заверш" (завершение)
              ) : false;
              const isFinalScreen = screenOrScene.id === proto.end || hasFinalMarker;
              
              console.log("TestView: Screen changed via Figma postMessage", {
                figmaNodeId,
                screenId: screenOrScene.id,
                screenName,
                isFinalScreen,
                protoEnd: proto.end,
                protoStart: proto.start,
                foundByFigmaNodeId: "figmaNodeId" in screenOrScene && screenOrScene.figmaNodeId === figmaNodeId,
                foundByIdFallback: screenOrScene.id === figmaNodeId,
                previousCurrentScreen: currentScreen,
                willSetCurrentScreen: screenOrScene.id
              });
              
              // КРИТИЧНО: Обновляем историю переходов перед обновлением currentScreen
              // Это необходимо для обработки Action "BACK"
              // ВАЖНО: Если мы возвращаемся на предыдущий экран (BACK action), НЕ добавляем его в историю
              // Вместо этого удаляем его из истории, так как мы вернулись назад
              // КРИТИЧНО: Определяем isBackAction ДО обновления currentScreen, чтобы использовать его в проверке финального экрана
              let isBackAction = false;
              if (currentScreen && currentScreen !== screenOrScene.id) {
                // Проверяем, не является ли это возвратом на предыдущий экран (BACK action)
                isBackAction = screenHistoryRef.current.length > 0 && 
                               screenHistoryRef.current[screenHistoryRef.current.length - 1] === screenOrScene.id;
                
                if (isBackAction) {
                  // Это BACK action - удаляем предыдущий экран из истории
                  const removedScreen = screenHistoryRef.current.pop();
                  console.log("TestView: BACK action detected via onScreenChange - removed from history", {
                    removedScreen: removedScreen,
                    newCurrentScreen: screenOrScene.id,
                    historyLength: screenHistoryRef.current.length,
                    history: [...screenHistoryRef.current],
                    note: "Will check final screen after BACK action"
                  });
                } else {
                  // Обычный переход вперед - добавляем текущий экран в историю
                  if (screenHistoryRef.current.length === 0 || 
                      screenHistoryRef.current[screenHistoryRef.current.length - 1] !== currentScreen) {
                    screenHistoryRef.current.push(currentScreen);
                    console.log("TestView: Added to screen history via onScreenChange", {
                      screen: currentScreen,
                      historyLength: screenHistoryRef.current.length,
                      history: [...screenHistoryRef.current]
                    });
                  }
                }
              }
              
              // КРИТИЧНО: Обновляем currentScreen для аналитики и определения финального экрана
              // ВАЖНО: setCurrentScreen вызовет useEffect, который обновит EventProxyService и проверит финальный экран
              setCurrentScreen(screenOrScene.id);
              // Записываем событие screen_load
              recordEvent("screen_load", screenOrScene.id, null);
              
              // КРИТИЧНО: Для финального экрана логируем дополнительную информацию
              // ВАЖНО: Проверяем финальный экран ПОСЛЕ обновления currentScreen, чтобы useEffect тоже сработал
              if (isFinalScreen) {
                console.log("TestView: 🎯 Final screen detected via PRESENTED_NODE_CHANGED!", {
                  screenId: screenOrScene.id,
                  screenName,
                  figmaNodeId,
                  protoEnd: proto.end,
                  isBackAction: isBackAction,
                  historyLength: screenHistoryRef.current.length,
                  history: [...screenHistoryRef.current]
                });
                
                // КРИТИЧНО: Явно проверяем завершение теста здесь, так как useEffect может не сработать сразу
                // Это необходимо для случаев, когда пользователь переходит через overlay или меню
                // ВАЖНО: Проверяем завершение теста даже после BACK action, если мы на финальном экране
                const isEndDifferentFromStart = proto.end !== proto.start;
                if (isEndDifferentFromStart && !testCompleted.current) {
                  console.log("TestView: 🎉 Triggering completion via PRESENTED_NODE_CHANGED!", {
                    screenId: screenOrScene.id,
                    screenName,
                    figmaNodeId,
                    protoEnd: proto.end,
                    protoStart: proto.start,
                    isEndDifferentFromStart,
                    testCompletedBefore: testCompleted.current,
                    isBackAction: isBackAction,
                    note: "Completion check after BACK action or normal navigation"
                  });
                  
                  testCompleted.current = true;
                  const currentSessionId = actualSessionId || propSessionId;
                  if (currentSessionId) {
                    recordEvent("completed", screenOrScene.id);
                    setTimeout(() => {
                      if (testCompleted.current) {
                        console.log("TestView: Setting showSuccessPopup to true (via PRESENTED_NODE_CHANGED)");
                        setShowSuccessPopup(true);
                      }
                    }, 1000);
                  } else {
                    console.error("TestView: Cannot show success popup - sessionId is null", {
                      actualSessionId,
                      propSessionId,
                      screenId: screenOrScene.id
                    });
                  }
                } else if (testCompleted.current) {
                  console.log("TestView: ⚠️ Test already completed, skipping duplicate completion", {
                    screenId: screenOrScene.id,
                    protoEnd: proto.end
                  });
                } else if (!isEndDifferentFromStart) {
                  console.log("TestView: ⚠️ Final screen check failed - end === start", {
                    screenId: screenOrScene.id,
                    protoEnd: proto.end,
                    protoStart: proto.start
                  });
                }
              }
            } else {
              console.warn("TestView: Screen not found for figmaNodeId", {
                figmaNodeId,
                normalizedFigmaNodeId,
                currentScreen,
                availableScreens: allScreensOrScenes.map(s => ({
                  id: s.id,
                  name: "name" in s ? s.name : null,
                  figmaNodeId: "figmaNodeId" in s ? s.figmaNodeId : null,
                  figmaNodeIdMatches: "figmaNodeId" in s && s.figmaNodeId ? 
                    (s.figmaNodeId === figmaNodeId || s.figmaNodeId.trim().toLowerCase() === normalizedFigmaNodeId) : false,
                  idMatches: s.id === figmaNodeId || s.id.trim().toLowerCase() === normalizedFigmaNodeId
                }))
              });
              
              // КРИТИЧНО: Если экран не найден, но figmaNodeId совпадает с текущим currentScreen,
              // не обновляем currentScreen (возможно, это тот же экран)
              // Но если currentScreen не установлен, попробуем использовать figmaNodeId напрямую
              if (!currentScreen) {
                console.log("TestView: currentScreen not set, using figmaNodeId as fallback", { figmaNodeId });
                setCurrentScreen(figmaNodeId);
              }
            }
          }}
          debugOverlayEnabled={debugOverlayEnabled}
          hideUI={true}
          hotspotHints={false}
          scaling="scale-down-width"
          bgColor="000000" // Черный фон как у pthwy.ru
          // EMBED KIT 2.0: OAuth client-id для получения postMessage событий
          figmaClientId={FIGMA_CLIENT_ID}
          embedHost={FIGMA_EMBED_HOST}
        />
        
        {/* КРИТИЧНО: Рендерим overlay поверх FigmaEmbedViewer */}
        {/* Overlay должны отображаться поверх iframe для tooltip и модалок */}
        {overlayStack.length > 0 && overlayStack.map((overlay, index) => {
          // НОВОЕ: Поддержка v1/v2 - используем helper функцию
          const overlayScreenOrScene = getScreenOrScene(proto, overlay.screenId);
          if (!overlayScreenOrScene) {
            console.warn("TestView: Overlay screen/scene not found for FigmaEmbedViewer:", overlay.screenId);
            return null;
          }
          
          // Для v2 пока используем fallback (Scene Renderer будет в Phase 0)
          if (isProtoV2(proto)) {
            console.warn("TestView: Scene Graph overlays not yet implemented for FigmaEmbedViewer");
            return null;
          }
          
          // Для v1 используем существующую логику
          const overlayScreen = overlayScreenOrScene as Screen;
          
          const settings = overlay.settings;
          
          // ВАЖНО: Позиционируем overlay относительно контейнера FigmaEmbedViewer
          // Используем размеры iframe для ограничения затемнения
          const iframeWidth = isProtoV1(proto) && startScreenOrScene 
            ? (startScreenOrScene as Screen).width 
            : startScreenOrScene && "size" in startScreenOrScene
            ? startScreenOrScene.size.width
            : 375;
          const iframeHeight = isProtoV1(proto) && startScreenOrScene 
            ? (startScreenOrScene as Screen).height 
            : startScreenOrScene && "size" in startScreenOrScene
            ? startScreenOrScene.size.height
            : 812;
          
          // Вычисляем стили позиционирования (position: absolute относительно контейнера)
          let overlayPositionStyle: React.CSSProperties = {};
          switch (settings.position) {
            case "CENTERED":
              overlayPositionStyle = {
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)"
              };
              break;
            case "TOP_LEFT":
              overlayPositionStyle = {
                position: "absolute",
                top: 0,
                left: 0
              };
              break;
            case "TOP_CENTER":
              overlayPositionStyle = {
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)"
              };
              break;
            case "TOP_RIGHT":
              overlayPositionStyle = {
                position: "absolute",
                top: 0,
                right: 0
              };
              break;
            case "BOTTOM_LEFT":
              overlayPositionStyle = {
                position: "absolute",
                bottom: 0,
                left: 0
              };
              break;
            case "BOTTOM_CENTER":
              overlayPositionStyle = {
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)"
              };
              break;
            case "BOTTOM_RIGHT":
              overlayPositionStyle = {
                position: "absolute",
                bottom: 0,
                right: 0
              };
              break;
            case "MANUAL":
              // ВАЖНО: Для MANUAL позиции координаты относительны к hotspot, который вызвал overlay
              let manualLeft = "50%";
              let manualTop = "50%";
              let manualTransform = "translate(-50%, -50%)";
              
              if (settings.positionX !== undefined && settings.positionY !== undefined && overlay.hotspotId) {
                // Находим hotspot, который вызвал overlay
                const triggerHotspot = proto && proto.hotspots ? proto.hotspots.find((h: Hotspot) => h.id === overlay.hotspotId && h.frame === overlay.parentScreenId) : null;
                if (triggerHotspot) {
                  // Координаты overlay = координаты hotspot + offset (positionX, positionY)
                  manualLeft = `${triggerHotspot.x + settings.positionX}px`;
                  manualTop = `${triggerHotspot.y + settings.positionY}px`;
                  manualTransform = "none";
                  console.log("TestView: MANUAL overlay position calculated for FigmaEmbedViewer", {
                    hotspotId: overlay.hotspotId,
                    hotspotX: triggerHotspot.x,
                    hotspotY: triggerHotspot.y,
                    positionX: settings.positionX,
                    positionY: settings.positionY,
                    finalLeft: manualLeft,
                    finalTop: manualTop
                  });
                } else {
                  console.warn("TestView: MANUAL overlay position - hotspot not found for FigmaEmbedViewer", {
                    hotspotId: overlay.hotspotId,
                    parentScreenId: overlay.parentScreenId
                  });
                }
              }
              
              overlayPositionStyle = {
                position: "absolute",
                left: manualLeft,
                top: manualTop,
                transform: manualTransform
              };
              break;
            default:
              overlayPositionStyle = {
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)"
              };
          }
          
          return (
            <div key={`overlay-figma-${overlay.screenId}-${index}`} style={{ 
              position: "absolute", 
              top: 0, 
              left: 0, 
              width: iframeWidth, 
              height: iframeHeight, 
              zIndex: 1000 + index,
              pointerEvents: "none"
            }}>
              {/* Background overlay (если включен) */}
              {settings.background === true && (() => {
                const bgColor = settings.backgroundColor || "000000";
                const bgOpacity = settings.backgroundOpacity !== undefined ? settings.backgroundOpacity : 70;
                const r = parseInt(bgColor.substring(0, 2), 16);
                const g = parseInt(bgColor.substring(2, 4), 16);
                const b = parseInt(bgColor.substring(4, 6), 16);
                const rgbaBackground = `rgba(${r}, ${g}, ${b}, ${bgOpacity / 100})`;
                
                return (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: iframeWidth,
                      height: iframeHeight,
                      backgroundColor: rgbaBackground,
                      cursor: settings.closeOnOutsideClick ? "pointer" : "default"
                    }}
                    onClick={(e) => {
                      if (settings.closeOnOutsideClick && e.target === e.currentTarget) {
                        closeOverlay("outside_click");
                      }
                    }}
                  />
                );
              })()}
              
              {/* Overlay screen */}
              <div
                style={{
                  ...overlayPositionStyle,
                  zIndex: 1001 + index,
                  pointerEvents: "auto",
                  maxWidth: `${iframeWidth}px`,
                  maxHeight: `${iframeHeight}px`
                }}
                onMouseEnter={() => {
                  isHoveringOverlayRef.current = true;
                  if (hoverLeaveTimeoutRef.current !== null) {
                    clearTimeout(hoverLeaveTimeoutRef.current);
                    hoverLeaveTimeoutRef.current = null;
                    console.log("TestView: Canceled overlay close - cursor moved to overlay (FigmaEmbedViewer)");
                  }
                }}
                onMouseLeave={() => {
                  isHoveringOverlayRef.current = false;
                  if (hoverOverlayRef.current && hoverOverlayRef.current === overlay.screenId) {
                    console.log("TestView: Cursor left overlay, closing overlay (FigmaEmbedViewer)", {
                      overlayId: overlay.screenId
                    });
                    closeOverlay("hover_leave");
                    hoverOverlayRef.current = null;
                    if (hoverLeaveTimeoutRef.current !== null) {
                      clearTimeout(hoverLeaveTimeoutRef.current);
                      hoverLeaveTimeoutRef.current = null;
                    }
                  }
                }}
                onClick={(e) => {
                  // КРИТИЧНО: Регистрируем клики в пустую область внутри overlay для FigmaEmbedViewer
                  // Проверяем, что клик не попал в hotspot или изображение
                  if (e.target === e.currentTarget) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const clickY = e.clientY - rect.top;
                    
                    // Проверяем, не попал ли клик в какой-либо hotspot внутри overlay
                    const clickedHotspot = proto && proto.hotspots ? proto.hotspots.find((h: Hotspot) => {
                      if (h.frame !== overlay.screenId) return false;
                      return (
                        clickX >= h.x &&
                        clickX <= h.x + h.w &&
                        clickY >= h.y &&
                        clickY <= h.y + h.h
                      );
                    }) : null;
                    
                    // Если клик не попал в hotspot, регистрируем как клик в пустую область внутри overlay
                    if (!clickedHotspot) {
                      // КРИТИЧНО: Используем overlay screen ID для кликов внутри overlay
                      const activeScreenId = getActiveScreenId(null, overlay.screenId);
                      
                      console.log("TestView: Click in empty area inside overlay div (FigmaEmbedViewer)", {
                        clickX,
                        clickY,
                        overlayScreenId: overlay.screenId,
                        activeScreenId: activeScreenId,
                        overlayStackSize: overlayStack.length,
                        overlayIndex: index
                      });
                      
                      recordEvent("click", activeScreenId, null, false, clickX, clickY);
                    }
                  }
                }}
              >
                <img 
                  src={overlayScreen.image} 
                  width={overlayScreen.width} 
                  alt={overlayScreen.name}
                  style={{ 
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "100%"
                  }}
                  onClick={(e) => {
                    // КРИТИЧНО: Регистрируем клики в пустую область внутри overlay для FigmaEmbedViewer
                    // Проверяем, что клик не попал в hotspot
                    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                    if (rect) {
                      const clickX = e.clientX - rect.left;
                      const clickY = e.clientY - rect.top;
                      
                      // Проверяем, не попал ли клик в какой-либо hotspot внутри overlay
                      const clickedHotspot = proto && proto.hotspots ? proto.hotspots.find((h: Hotspot) => {
                        if (h.frame !== overlay.screenId) return false;
                        return (
                          clickX >= h.x &&
                          clickX <= h.x + h.w &&
                          clickY >= h.y &&
                          clickY <= h.y + h.h
                        );
                      }) : null;
                      
                      // Если клик не попал в hotspot, регистрируем как клик в пустую область внутри overlay
                      if (!clickedHotspot) {
                        // КРИТИЧНО: Используем overlay screen ID для кликов внутри overlay
                        const activeScreenId = getActiveScreenId(null, overlay.screenId);
                        
                        console.log("TestView: Click in empty area inside overlay (FigmaEmbedViewer)", {
                          clickX,
                          clickY,
                          overlayScreenId: overlay.screenId,
                          activeScreenId: activeScreenId,
                          overlayStackSize: overlayStack.length,
                          overlayIndex: index
                        });
                        
                        recordEvent("click", activeScreenId, null, false, clickX, clickY);
                      }
                    }
                  }}
                />
                
                {/* Hotspots для overlay screen */}
                {proto && proto.hotspots && proto.hotspots
                  .filter((h: Hotspot) => h.frame === overlay.screenId)
                  .map((h: Hotspot) => {
                    const isHoverTrigger = h.trigger === "ON_HOVER";
                    
                    return (
                      <div
                        key={h.id}
                        style={{
                          position: "absolute",
                          left: h.x,
                          top: h.y,
                          width: h.w,
                          height: h.h,
                          cursor: "pointer",
                          zIndex: 1002 + index
                        }}
                        onClick={(e) => {
                          if (isHoverTrigger) {
                            return;
                          }
                          e.stopPropagation();
                          const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                          if (rect) {
                            const clickX = e.clientX - rect.left;
                            const clickY = e.clientY - rect.top;
                            onHotspotClick(h, clickX, clickY);
                          } else {
                            onHotspotClick(h);
                          }
                        }}
                        onMouseEnter={() => {
                          if (isHoverTrigger) {
                            onHotspotHoverEnter(h);
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (isHoverTrigger) {
                            const relatedTarget = e.relatedTarget as HTMLElement | null;
                            if (relatedTarget) {
                              const relatedZIndex = window.getComputedStyle(relatedTarget).zIndex;
                              const relatedZIndexNum = parseInt(relatedZIndex, 10);
                              
                              if (relatedZIndexNum >= 1000) {
                                return;
                              }
                              
                              let parent = relatedTarget.parentElement;
                              while (parent) {
                                const parentZIndex = window.getComputedStyle(parent).zIndex;
                                const parentZIndexNum = parseInt(parentZIndex, 10);
                                if (parentZIndexNum >= 1000) {
                                  return;
                                }
                                parent = parent.parentElement;
                              }
                            }
                            
                            onHotspotHoverLeave(h);
                          }
                        }}
                      />
                    );
                  })}
              </div>
            </div>
          );
        })}
        
        {/* КРИТИЧНО: НЕ создаем отдельные iframe для оверлеев */}
        {/* Figma сам обрабатывает оверлеи внутри одного прототипа через свои внутренние хотспоты */}
        {/* Оверлеи должны быть частью одного Figma прототипа, а не отдельными iframe */}
        
        {/* Кнопка "Сдаться" под прототипом (скрыта в StudyRunView — кнопка в сайдбаре) */}
        {!hideGiveUpBelow && !testCompleted.current && (
          <button
            style={{
              width: isProtoV1(proto) && startScreenOrScene 
                ? (startScreenOrScene as Screen).width 
                : startScreenOrScene && "size" in startScreenOrScene
                ? startScreenOrScene.size.width
                : 375,
              marginTop: 20,
              padding: "12px 24px",
              background: "#e0e0e0",
              color: "#000000",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "center"
            }}
            onClick={async () => {
              // Используем актуальный sessionId из state
              const currentSessionId = actualSessionId || propSessionId;
              // Записываем событие о прерывании теста
              if (currentSessionId) {
                recordEvent("aborted", currentScreen);
                
                // Сохраняем записи при прерывании теста
                try {
                  if (recordingCameraController) {
                    const blob = await recordingCameraController.stop();
                    await uploadRecording(blob, "camera");
                    setRecordingCameraController(null);
                  }
                  if (recordingScreenController) {
                    const blob = await recordingScreenController.stop();
                    await uploadRecording(blob, "screen");
                    setRecordingScreenController(null);
                  }
                } catch (err) {
                  console.error("TestView: Error saving recording on abort", err);
                }
                
                // Если есть runIdOverride (используется в StudyRunView), обновляем статус сессии
                if (runIdOverride && blockIdOverride) {
                  try {
                    const { error: updateError } = await supabase
                      .from("sessions")
                      .update({ completed: false, aborted: true })
                      .eq("id", currentSessionId);
                    if (updateError) {
                      console.error("Error updating session status:", updateError);
                    }
                  } catch (err) {
                    console.error("Error updating session:", err);
                  }
                }
                
                // Если есть onComplete callback (используется в StudyRunView), вызываем его вместо навигации
                if (onComplete) {
                  console.log("TestView: User gave up, calling onComplete callback to continue test");
                  onComplete();
                } else {
                  // Если нет onComplete, переходим на страницу завершения (старое поведение)
                  navigate(`/finished/${currentSessionId}`, { state: { aborted: true, sessionId: currentSessionId } });
                }
              } else {
                console.error("TestView: Cannot handle give up - sessionId is null");
              }
            }}
          >
            Сдаться
          </button>
        )}
        
      </div>
    );
        })()}
      </div>
    );
    
    return renderWithSuccessSidebar(renderWithPermissionsUI(content));
  }
  
  // НОВОЕ: Phase 0 - поддержка v2 proto с Scene Graph
  if (isProtoV2(proto)) {
    const scene = screenOrScene as Scene;
    if (!scene) {
      console.error("TestView: Scene not found for v2 proto", currentScreen);
      const errorContent = (
        <div style={{ 
          display: "flex", 
          flexDirection: "column",
          justifyContent: "center", 
          alignItems: "center", 
          background: "#f5f5f7",
          padding: "20px"
        }}>
          <div style={{ 
            marginBottom: "20px", 
            color: "#d32f2f", 
            padding: "12px", 
            background: "#ffebee", 
            borderRadius: "4px",
            maxWidth: "400px"
          }}>
            Scene not found: {currentScreen}
          </div>
        </div>
      );
      return renderWithSuccessSidebar(renderWithPermissionsUI(errorContent));
    }
    
    // НОВОЕ: Phase 1 - используем AnimatedScene для SMART_ANIMATE transitions
    let fromScene: Scene | null = null;
    if (isTransitioning && previousScreenId && proto) {
      const prevScene = getScreenOrScene(proto, previousScreenId);
      if (prevScene && isProtoV2(proto)) {
        fromScene = prevScene as Scene;
      }
    }
    
    // Находим transition для текущего перехода
    let currentTransition: Transition | undefined;
    if (previousScreenId && proto && proto.edges) {
      const edge = proto.edges.find((e: Edge) => e.from === previousScreenId && e.to === currentScreen);
      currentTransition = edge?.transition;
      
      // SMART_ANIMATE fallback: если тип SMART_ANIMATE, используем его
      if (currentTransition?.type !== "SMART_ANIMATE") {
        // Для других типов transitions пока используем обычный рендеринг
        currentTransition = undefined;
      }
    }
    
    const v2Content = (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        background: "#f5f5f7",
        width: "100%",
        minHeight: "100vh",
        padding: 0,
        margin: 0
      }}>
        {!hideTaskAbove && taskDescription && (
          <div style={{
            width: "100%",
            maxWidth: scene.size.width,
            marginBottom: 20,
            padding: 16,
            background: "#ffffff",
            borderRadius: 8,
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <h3 style={{
              margin: "0 0 8px 0",
              fontSize: 16,
              fontWeight: 600,
              color: "#333"
            }}>
              Задание:
            </h3>
            <p style={{
              margin: 0,
              fontSize: 14,
              color: "#666",
              lineHeight: 1.5
            }}>
              {taskDescription}
            </p>
          </div>
        )}
        
        <div style={{ 
          position: "relative", 
          width: scene.size.width, 
          height: scene.size.height
        }}>
          {/* Phase 1: Используем AnimatedScene для SMART_ANIMATE */}
          {currentTransition?.type === "SMART_ANIMATE" && fromScene ? (
            <AnimatedScene
              fromScene={fromScene}
              toScene={scene}
              transition={currentTransition}
              onAnimationComplete={() => {
                setIsTransitioning(false);
                setPreviousScreenId(null);
                recordEvent("screen_load", currentScreen || "");
              }}
            />
          ) : (
            <SceneRenderer scene={scene} />
          )}
          
          {/* Hotspots для v2 proto */}
          {proto && proto.hotspots && proto.hotspots
            .filter((h: Hotspot) => h.frame === scene.id)
            .map((h: Hotspot) => {
              const isHoverTrigger = h.trigger === "ON_HOVER";
              
              return (
                <div
                  key={h.id}
                  style={{
                    position: "absolute",
                    left: h.x,
                    top: h.y,
                    width: h.w,
                    height: h.h,
                    cursor: "pointer",
                    zIndex: 1,
                    pointerEvents: "auto",
                    // НОВОЕ: Debug overlay - видимые границы hotspots
                    ...(debugOverlayEnabled ? {
                      border: "2px solid rgba(255, 0, 0, 0.5)",
                      backgroundColor: "rgba(255, 0, 0, 0.1)",
                      boxSizing: "border-box"
                    } : {})
                  }}
                  onClick={(e) => {
                    if (testCompleted.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    e.stopPropagation();
                    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                    if (rect) {
                      const clickX = e.clientX - rect.left;
                      const clickY = e.clientY - rect.top;
                      onHotspotClick(h, clickX, clickY);
                    } else {
                      onHotspotClick(h);
                    }
                  }}
                  onMouseEnter={() => {
                    if (isHoverTrigger) {
                      onHotspotHoverEnter(h);
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isHoverTrigger) {
                      const relatedTarget = e.relatedTarget as HTMLElement | null;
                      if (!relatedTarget || !relatedTarget.closest(`[data-scene-id="${scene.id}"]`)) {
                        onHotspotHoverLeave(h);
                      }
                    }
                  }}
                />
              );
            })}
        </div>
      </div>
    );
    
    return renderWithSuccessSidebar(renderWithPermissionsUI(v2Content));
  }
  
  // Для v1 используем существующую логику
  const screen = screenOrScene as Screen;
  
  // ОТЛАДКА: Логируем состояние overlay и currentScreen
  console.log("TestView: Render state", {
    currentScreen: currentScreen,
    screenName: screen?.name,
    overlayStackSize: overlayStack.length,
    overlayStack: overlayStack.map(o => ({ screenId: o.screenId, parentScreenId: o.parentScreenId })),
    note: "Overlay should be on top of currentScreen, currentScreen should NOT change when overlay opens"
  });
  
  // Логируем данные скролла для отладки (только если screen существует)
  if (screen) {
    try {
      console.log("TestView: Screen scroll data", {
        screenName: screen.name,
        canScroll: screen.canScroll,
        overflowDirection: screen.overflowDirection,
        clipsContent: screen.clipsContent,
        viewportWidth: screen.viewportWidth,
        viewportHeight: screen.viewportHeight,
        contentWidth: screen.contentWidth,
        contentHeight: screen.contentHeight,
        hasNestedFrames: screen.nestedFrames && screen.nestedFrames.length > 0,
        nestedFramesCount: screen.nestedFrames ? screen.nestedFrames.length : 0
      });
    } catch (error) {
      console.warn("TestView: Error logging screen scroll data:", error);
    }
  }
  
  if (!screen) {
    console.error("TestView: Screen not found!", {
      currentScreen,
      availableScreens: proto.screens.map(s => ({ id: s.id, name: s.name })),
      protoStart: proto.start,
      protoEnd: proto.end
    });
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        /* Убрали minHeight: "100vh" чтобы не создавать лишние скроллы */
        background: "#f5f5f7",
        padding: "20px"
      }}>
        <div style={{ 
          background: "#ffebee", 
          padding: "16px", 
          borderRadius: "8px",
          color: "#d32f2f",
          maxWidth: "500px"
        }}>
          <h3 style={{ marginTop: 0 }}>Ошибка: Экран не найден</h3>
          <p>Текущий экран: <code>{currentScreen}</code></p>
          <p>Доступные экраны:</p>
          <ul>
            {getAllScreensOrScenes(proto).map(s => (
              <li key={s.id}><code>{s.id}</code> - {s.name}</li>
            ))}
          </ul>
          <p>Стартовый экран прототипа: <code>{proto.start}</code></p>
        </div>
      </div>
    );
  }

  const mainContent = (
    <div style={{ 
      display: "flex", 
      flexDirection: "column",
      justifyContent: "center", 
      alignItems: "center", 
      /* Убрали minHeight: "100vh" чтобы не создавать лишние скроллы */
      background: "#f5f5f7",
      width: "100%",
      padding: "20px"
    }}>
      {/* Отображение задания над прототипом */}
      {!hideTaskAbove && taskDescription && (
        <div style={{
          width: "100%",
          maxWidth: screen.width,
          marginBottom: 20,
          padding: 16,
          background: "#ffffff",
          borderRadius: 8,
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h3 style={{
            margin: "0 0 8px 0",
            fontSize: 16,
            fontWeight: 600,
            color: "#333"
          }}>
            Задание:
          </h3>
          <p style={{
            margin: 0,
            fontSize: 14,
            color: "#666",
            lineHeight: 1.5
          }}>
            {taskDescription}
          </p>
        </div>
      )}
      
      {/* Определяем, нужен ли скролл для этого экрана */}
      {/* ВАЖНО: Проверяем и canScroll, и overflowDirection напрямую для обратной совместимости */}
      {/* ВАЖНО: Обертываем экран в контейнер с position: relative для правильного позиционирования overlay */}
      {/* ВАЖНО: overflow: visible позволяет overlay выходить за границы контейнера, если нужно (для MANUAL позиции) */}
      {/* НОВОЕ: Масштабируем контейнер с сохранением соотношения сторон, чтобы прототип помещался в viewport */}
      {(() => {
        const screenWidth = screen.viewportWidth || screen.width;
        const screenHeight = screen.viewportHeight || screen.height;
        
        // Вычисляем максимальные размеры с учетом viewport и padding
        const maxWidth = Math.min(screenWidth, window.innerWidth - 40); // 40px для padding
        const maxHeight = Math.min(screenHeight, window.innerHeight - 200); // 200px для taskDescription и padding
        
        // Вычисляем масштаб с сохранением соотношения сторон
        const scaleByWidth = maxWidth / screenWidth;
        const scaleByHeight = maxHeight / screenHeight;
        const scale = Math.min(scaleByWidth, scaleByHeight, 1); // Не увеличиваем больше оригинала
        
        const scaledWidth = screenWidth * scale;
        const scaledHeight = screenHeight * scale;
        
        return (
          <div style={{ 
            position: "relative", 
            width: scaledWidth,
            height: scaledHeight,
            overflow: "visible", // Позволяем overlay выходить за границы, если нужно (для MANUAL позиции)
            margin: "0 auto" // Центрируем прототип
          }}>
      {(screen.canScroll || (screen.overflowDirection && screen.overflowDirection !== "NONE")) ? (
        // Скроллируемый экран - используем только CSS overflow, без дополнительных элементов
        <div 
          style={{ 
            position: "relative", 
            width: scaledWidth,
            height: scaledHeight,
            // ВАЖНО: clipsContent: false означает, что контент не обрезается, но скролл все равно должен работать
            // Используем только overflow для скролла, без дополнительных элементов
            overflowX: (screen.overflowDirection === "HORIZONTAL" || screen.overflowDirection === "BOTH") && (screen.contentWidth || screen.width) > (screen.viewportWidth || screen.width)
              ? "auto" 
              : screen.clipsContent === false ? "visible" : "hidden",
            overflowY: (screen.overflowDirection === "VERTICAL" || screen.overflowDirection === "BOTH") && (screen.contentHeight || screen.height) > (screen.viewportHeight || screen.height)
              ? "auto" 
              : screen.clipsContent === false ? "visible" : "hidden",
            // Скрываем scrollbar, но сохраняем функциональность скролла
            scrollbarWidth: "none", // Firefox
            msOverflowStyle: "none", // IE и Edge
            // Для WebKit браузеров (Chrome, Safari) используем CSS класс
            // Блокируем взаимодействие с основным экраном, если открыт overlay
            pointerEvents: overlayStack.length > 0 ? "none" : "auto",
            opacity: overlayStack.length > 0 ? 1 : 1 // Основной экран остается видимым
          }}
          className="hide-scrollbar"
          onScroll={(e) => handleScroll(e, screen.id, false)}
          onClick={(e) => {
          // Блокируем все клики после завершения теста или если открыт overlay
          if (testCompleted.current || overlayStack.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // Проверяем, что клик не был по хотспоту (хотспоты обрабатывают свои клики и вызывают stopPropagation)
          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") {
            // Получаем координаты клика относительно контейнера
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Проверяем, не попал ли клик в какой-либо хотспот (дополнительная проверка)
            const clickedHotspot = proto && proto.hotspots ? proto.hotspots.find((h: Hotspot) => {
              if (h.frame !== screen.id) return false;
              return (
                clickX >= h.x &&
                clickX <= h.x + h.w &&
                clickY >= h.y &&
                clickY <= h.y + h.h
              );
            }) : null;
            
            // Если клик не попал в хотспот, регистрируем как клик в пустую область
            // ВАЖНО: Используем правильный screen ID с fallback для определения экрана
            if (!clickedHotspot) {
              // КРИТИЧНО: Определяем screen_id с fallback - проверяем overlay, currentScreen, screen.id
              const actualCurrentScreen = currentScreenRef.current || currentScreen;
              const activeScreenId = getActiveScreenId(null, screen.id) || actualCurrentScreen || screen.id;
              
              console.log("TestView: Click in empty area on main screen", {
                clickX,
                clickY,
                screenId: screen.id,
                currentScreen: actualCurrentScreen,
                activeScreenId: activeScreenId,
                overlayStackSize: overlayStack.length
              });
              
              recordEvent("click", activeScreenId, null, false, clickX, clickY);
            }
          }
        }}
      >
          <img 
            src={screen.image} 
            style={{ 
              width: (screen.contentWidth || screen.width) * scale,
              height: (screen.contentHeight || screen.height) * scale,
              display: "block",
              // Применяем отступы только если они положительные (контент начинается внутри viewport)
              // Если offset отрицательный, контент начинается выше/левее viewport, но мы не применяем отрицательный margin
              marginLeft: (screen.contentOffsetX && screen.contentOffsetX > 0) ? screen.contentOffsetX : 0,
              marginTop: (screen.contentOffsetY && screen.contentOffsetY > 0) ? screen.contentOffsetY : 0,
              // НОВОЕ: Применяем CSS transitions, если активен transition
              ...(isTransitioning && currentTransition && currentTransition.type !== "INSTANT" && currentTransition.type !== "SMART_ANIMATE"
                ? getCSSTransitionStyle(currentTransition, "forward")
                : {})
            }} 
          />
      
      {isFinalScreen && (
        <div style={{
          position: "absolute",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(76, 175, 80, 0.9)",
          color: "white",
          padding: "15px 30px",
          borderRadius: 8,
          fontSize: 18,
          fontWeight: "bold",
          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
          zIndex: 1000,
          animation: "fadeIn 0.5s ease-in"
        }}>
          🎉 Вы достигли финального экрана!
        </div>
      )}

      {proto && proto.hotspots && proto.hotspots
        .filter((h: Hotspot) => h.frame === screen.id)
        .map((h: Hotspot) => {
          // Определяем, является ли это hover-триггером
          const isHoverTrigger = h.trigger === "ON_HOVER";
          // ВАЖНО: Для hover-триггеров НЕ блокируем pointerEvents, даже если overlay открыт
          // (hover должен работать независимо от overlay, так как overlay может быть открыт по hover)
          // Также НЕ блокируем pointerEvents для hotspots на основном экране, если открыт overlay, открытый по hover
          // Это позволяет курсору оставаться над hotspot, даже когда overlay открыт
          // ВАЖНО: НЕ блокируем pointerEvents для hotspots на основном экране (screen.id === currentScreen),
          // даже если открыт overlay, открытый по клику, так как пользователь должен иметь возможность кликать на hotspots основного экрана
          const isHoverOverlayOpen = hoverOverlayRef.current && hoverOverlayRef.current !== "navigation";
          const isMainScreen = screen.id === currentScreen;
          // Блокируем pointerEvents только если:
          // 1. Это не hover-триггер
          // 2. Не открыт hover-overlay
          // 3. Тест завершен ИЛИ открыт overlay (но только если это НЕ основной экран)
          const shouldBlockPointerEvents = !isHoverTrigger && !isHoverOverlayOpen && (testCompleted.current || (overlayStack.length > 0 && !isMainScreen));
          
          return (
            <div
              key={h.id}
              style={{
                position: "absolute",
                left: h.x,
                top: h.y,
                width: h.w,
                height: h.h,
                cursor: shouldBlockPointerEvents ? "default" : "pointer",
                zIndex: 1,
                // Для hover-триггеров не блокируем pointerEvents
                pointerEvents: shouldBlockPointerEvents ? "none" : "auto",
                // НОВОЕ: Debug overlay - видимые границы hotspots
                ...(debugOverlayEnabled ? {
                  border: "2px solid rgba(255, 0, 0, 0.5)",
                  backgroundColor: "rgba(255, 0, 0, 0.1)",
                  boxSizing: "border-box"
                } : {})
              }}
              onClick={(e) => {
                // Для hover-триггеров не обрабатываем клики (только hover)
                if (isHoverTrigger) {
                  return;
                }
                // ВАЖНО: НЕ блокируем клики на основном экране (screen.id === currentScreen),
                // даже если открыт overlay, открытый по клику, так как пользователь должен иметь возможность кликать на hotspots основного экрана
                // Но блокируем клики на overlay-экранах, если открыт другой overlay
                const isMainScreen = screen.id === currentScreen;
                if (testCompleted.current || (overlayStack.length > 0 && !isHoverOverlayOpen && !isMainScreen)) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал обработчик пустой области
                // Получаем координаты клика относительно контейнера экрана
                const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                if (rect) {
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;
                  onHotspotClick(h, clickX, clickY);
                } else {
                  onHotspotClick(h);
                }
              }}
              onMouseEnter={() => {
                // Обрабатываем hover только для hover-триггеров
                if (isHoverTrigger) {
                  // ВАЖНО: Если overlay уже открыт по hover, отменяем таймаут закрытия
                  // Это позволяет overlay оставаться видимым, пока курсор находится в границах hotspot
                  if (hoverOverlayRef.current === h.overlayAction?.overlayId && hoverLeaveTimeoutRef.current !== null) {
                    clearTimeout(hoverLeaveTimeoutRef.current);
                    hoverLeaveTimeoutRef.current = null;
                    console.log("TestView: Cursor returned to hotspot, canceling overlay close");
                  } else {
                    onHotspotHoverEnter(h);
                  }
                }
              }}
              onMouseLeave={(e) => {
                // Обрабатываем hover только для hover-триггеров
                // Согласно документации Figma API: ON_HOVER reverts navigation when trigger is finished
                if (isHoverTrigger) {
                  // ВАЖНО: Проверяем relatedTarget - элемент, на который перешел курсор
                  // Если курсор переходит на overlay элемент (или его потомка), не закрываем overlay
                  const relatedTarget = e.relatedTarget as HTMLElement | null;
                  if (relatedTarget) {
                    // Проверяем, является ли relatedTarget overlay элементом или его потомком
                    // Overlay имеет zIndex 1000+, hotspot имеет zIndex 1
                    // Если курсор переходит на элемент с высоким zIndex, это может быть overlay
                    const relatedZIndex = window.getComputedStyle(relatedTarget).zIndex;
                    const relatedZIndexNum = parseInt(relatedZIndex, 10);
                    
                    // Если relatedTarget имеет zIndex >= 1000, это overlay элемент
                    if (relatedZIndexNum >= 1000) {
                      console.log("TestView: Cursor moved from hotspot to overlay element, not closing overlay", {
                        hotspotId: h.id,
                        relatedTargetZIndex: relatedZIndexNum
                      });
                      return; // Не закрываем overlay, курсор перешел на overlay
                    }
                    
                    // Также проверяем родительские элементы relatedTarget
                    let parent = relatedTarget.parentElement;
                    while (parent) {
                      const parentZIndex = window.getComputedStyle(parent).zIndex;
                      const parentZIndexNum = parseInt(parentZIndex, 10);
                      if (parentZIndexNum >= 1000) {
                        console.log("TestView: Cursor moved from hotspot to overlay parent element, not closing overlay", {
                          hotspotId: h.id,
                          parentZIndex: parentZIndexNum
                        });
                        return; // Не закрываем overlay, курсор перешел на overlay элемент
                      }
                      parent = parent.parentElement;
                    }
                  }
                  
                  onHotspotHoverLeave(h);
                }
              }}
            />
          );
        })}

      {/* Блокирующий оверлей после завершения теста */}
      {testCompleted.current && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            zIndex: 9999,
            pointerEvents: "auto",
            cursor: "default"
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}
          
          {/* Вложенные скроллируемые фреймы */}
      {screen.nestedFrames && screen.nestedFrames.length > 0 && screen.nestedFrames.map((nested) => {
        try {
          console.log("TestView: Rendering nested frame", {
            nestedName: nested.name,
            overflowDirection: nested.overflowDirection,
            clipsContent: nested.clipsContent,
            x: nested.x,
            y: nested.y,
            viewportWidth: nested.viewportWidth,
            viewportHeight: nested.viewportHeight,
            contentWidth: nested.contentWidth,
            contentHeight: nested.contentHeight,
            contentOffsetX: nested.contentOffsetX,
            contentOffsetY: nested.contentOffsetY,
            canScrollHorizontal: nested.contentWidth > nested.viewportWidth,
            canScrollVertical: nested.contentHeight > nested.viewportHeight
          });
        } catch (error) {
          console.warn("TestView: Error logging nested frame:", error);
        }
        // Вычисляем overflow стили для отладки
        const needsHorizontalScroll = (nested.overflowDirection === "HORIZONTAL" || nested.overflowDirection === "BOTH") && nested.contentWidth > nested.viewportWidth;
        const needsVerticalScroll = (nested.overflowDirection === "VERTICAL" || nested.overflowDirection === "BOTH") && nested.contentHeight > nested.viewportHeight;
        
        const overflowXValue = needsHorizontalScroll 
          ? "auto" 
          : nested.clipsContent === false ? "visible" : "hidden";
        const overflowYValue = needsVerticalScroll 
          ? "auto" 
          : nested.clipsContent === false ? "visible" : "hidden";
        
        console.log("TestView: Nested frame overflow calculation", {
          nestedName: nested.name,
          overflowDirection: nested.overflowDirection,
          clipsContent: nested.clipsContent,
          contentWidth: nested.contentWidth,
          viewportWidth: nested.viewportWidth,
          contentHeight: nested.contentHeight,
          viewportHeight: nested.viewportHeight,
          needsHorizontalScroll,
          needsVerticalScroll,
          overflowXValue,
          overflowYValue,
          hasImage: !!nested.image,
          imageLength: nested.image ? nested.image.length : 0
        });
        
        return (
            <div
              key={nested.id}
              style={{
                position: "absolute",
                left: nested.x,
                top: nested.y,
                width: nested.viewportWidth,
                height: nested.viewportHeight,
                // ВАЖНО: Для горизонтального скролла нужно, чтобы contentWidth > viewportWidth
                // ВАЖНО: clipsContent: false означает, что контент не обрезается, но скролл все равно должен работать
                // Используем только overflow для скролла, без дополнительных элементов
                overflowX: overflowXValue,
                overflowY: overflowYValue,
                zIndex: 10,
                // ВАЖНО: Используем фон родительского фрейма под scroll-block
                // Это нужно для того, чтобы под scroll-block был фон фрейма, а не дизайн основного экрана
                backgroundColor: nested.parentBackground || undefined,
                // Скрываем scrollbar, но сохраняем функциональность скролла
                scrollbarWidth: "none", // Firefox
                msOverflowStyle: "none", // IE и Edge
                // Блокируем взаимодействие с nested frames, если открыт overlay
                pointerEvents: overlayStack.length > 0 ? "none" : "auto"
              }}
              className="hide-scrollbar-nested"
              onScroll={(e) => handleScroll(e, nested.id, true)}
            >
              {nested.image ? (
                <img 
                  src={nested.image.startsWith("data:") ? nested.image : `data:image/png;base64,${nested.image}`}
                  alt={nested.name}
                  style={{ 
                    width: nested.contentWidth,
                    height: nested.contentHeight,
                    display: "block",
                    // Применяем отступы только если они положительные
                    marginLeft: (nested.contentOffsetX && nested.contentOffsetX > 0) ? nested.contentOffsetX : 0,
                    marginTop: (nested.contentOffsetY && nested.contentOffsetY > 0) ? nested.contentOffsetY : 0
                  }} 
                  onError={(e) => {
                    console.error("TestView: Failed to load nested frame image", {
                      nestedName: nested.name,
                      nestedId: nested.id,
                      imageSrc: nested.image ? nested.image.substring(0, 50) + "..." : "null",
                      hasDataPrefix: nested.image ? nested.image.startsWith("data:") : false,
                      imageLength: nested.image ? nested.image.length : 0
                    });
                    // Скрываем битое изображение и показываем красный блок
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) {
                      parent.style.backgroundColor = 'red';
                      parent.style.display = 'flex';
                      parent.style.alignItems = 'center';
                      parent.style.justifyContent = 'center';
                      parent.style.color = 'white';
                      parent.textContent = `Ошибка загрузки: ${nested.name}`;
                    }
                  }}
                />
              ) : (
                <div style={{ 
                  width: nested.contentWidth, 
                  height: nested.contentHeight, 
                  background: "#ff0000", 
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  ERROR: No image for {nested.name}
                </div>
              )}
            </div>
          );
        })}
        </div>
      ) : (
        // Статичный экран (без скролла) - текущая реализация
        <div 
          style={{ 
            position: "relative", 
            width: scaledWidth,
            // Блокируем взаимодействие с основным экраном, если открыт overlay
            pointerEvents: overlayStack.length > 0 ? "none" : "auto",
            opacity: overlayStack.length > 0 ? 1 : 1 // Основной экран остается видимым
          }}
          onClick={(e) => {
            // Блокируем все клики после завершения теста или если открыт overlay
            if (testCompleted.current || overlayStack.length > 0) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // Проверяем, что клик не был по хотспоту
            if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const clickY = e.clientY - rect.top;
              
              const clickedHotspot = proto && proto.hotspots ? proto.hotspots.find((h: Hotspot) => {
                if (h.frame !== screen.id) return false;
                return (
                  clickX >= h.x &&
                  clickX <= h.x + h.w &&
                  clickY >= h.y &&
                  clickY <= h.y + h.h
                );
              }) : null;
              
              if (!clickedHotspot) {
                // ВАЖНО: Используем правильный screen ID с fallback для определения экрана
                const actualCurrentScreen = currentScreenRef.current || currentScreen;
                const activeScreenId = getActiveScreenId(null, screen.id) || actualCurrentScreen || screen.id;
                
                console.log("TestView: Click in empty area on static screen", {
                  clickX,
                  clickY,
                  screenId: screen.id,
                  currentScreen: actualCurrentScreen,
                  activeScreenId: activeScreenId,
                  overlayStackSize: overlayStack.length
                });
                
                recordEvent("click", activeScreenId, null, false, clickX, clickY);
              }
            }
          }}
        >
          <img src={screen.image} width={scaledWidth} style={{ height: "auto" }} />
          
          {isFinalScreen && (
            <div style={{
              position: "absolute",
              top: 20,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(76, 175, 80, 0.9)",
              color: "white",
              padding: "15px 30px",
              borderRadius: 8,
              fontSize: 18,
              fontWeight: "bold",
              boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
              zIndex: 1000,
              animation: "fadeIn 0.5s ease-in"
            }}>
              🎉 Вы достигли финального экрана!
            </div>
          )}

          {proto && proto.hotspots && proto.hotspots
            .filter((h: Hotspot) => h.frame === screen.id)
            .map((h: Hotspot) => (
              <div
                key={h.id}
                style={{
                  position: "absolute",
                  left: h.x,
                  top: h.y,
                  width: h.w,
                  height: h.h,
                  cursor: (testCompleted.current || overlayStack.length > 0) ? "default" : "pointer",
                  zIndex: 1,
                  // Блокируем hotspots на основном экране, если открыт overlay
                  pointerEvents: (testCompleted.current || overlayStack.length > 0) ? "none" : "auto"
                }}
                onClick={(e) => {
                  // Блокируем клики после завершения теста или если открыт overlay
                  if (testCompleted.current || overlayStack.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  e.stopPropagation();
                  const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                  if (rect) {
                    const clickX = e.clientX - rect.left;
                    const clickY = e.clientY - rect.top;
                    onHotspotClick(h, clickX, clickY);
                  } else {
                    onHotspotClick(h);
                  }
                }}
              />
            ))}

          {testCompleted.current && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.1)",
                zIndex: 9999,
                pointerEvents: "auto",
                cursor: "default"
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          )}
        </div>
      )}
          </div>
        );
      })()}
      
      {/* НОВОЕ: Рендеринг overlay поверх экрана (внутри контейнера экрана) */}
      {/* ВАЖНО: Overlay рендерится как абсолютно позиционированный элемент поверх основного экрана,
          не блокируя его полностью - только background может блокировать клики, если включен */}
      {overlayStack.length > 0 && overlayStack.map((overlay, index) => {
        // НОВОЕ: Поддержка v1/v2 - используем helper функцию
        const overlayScreenOrScene = getScreenOrScene(proto, overlay.screenId);
        if (!overlayScreenOrScene) {
          console.warn("TestView: Overlay screen/scene not found:", overlay.screenId);
          return null;
        }
        
        // Для v2 пока используем fallback (Scene Renderer будет в Phase 0)
        if (isProtoV2(proto)) {
          console.warn("TestView: Scene Graph overlays not yet implemented");
          return null;
        }
        
        // Для v1 используем существующую логику
        const overlayScreen = overlayScreenOrScene as Screen;
        
        const settings = overlay.settings;
        
        // ВАЖНО: Позиционируем overlay относительно родительского экрана, а не viewport
        // Используем размеры родительского экрана для ограничения затемнения
        const parentScreenWidth = screen.viewportWidth || screen.width;
        const parentScreenHeight = screen.viewportHeight || screen.height;
        
        // Вычисляем стили позиционирования (position: absolute относительно родительского экрана)
        let overlayPositionStyle: React.CSSProperties = {};
        switch (settings.position) {
          case "CENTERED":
            overlayPositionStyle = {
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)"
            };
            break;
          case "TOP_LEFT":
            overlayPositionStyle = {
              position: "absolute",
              top: 0,
              left: 0
            };
            break;
          case "TOP_CENTER":
            overlayPositionStyle = {
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)"
            };
            break;
          case "TOP_RIGHT":
            overlayPositionStyle = {
              position: "absolute",
              top: 0,
              right: 0
            };
            break;
          case "BOTTOM_LEFT":
            overlayPositionStyle = {
              position: "absolute",
              bottom: 0,
              left: 0
            };
            break;
          case "BOTTOM_CENTER":
            overlayPositionStyle = {
              position: "absolute",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)"
            };
            break;
          case "BOTTOM_RIGHT":
            overlayPositionStyle = {
              position: "absolute",
              bottom: 0,
              right: 0
            };
            break;
          case "MANUAL":
            // ВАЖНО: Для MANUAL позиции координаты относительны к hotspot, который вызвал overlay
            // Согласно документации Figma: "The exception is MANUAL, which is relative to the element that triggered the overlay"
            // См. https://developers.figma.com/docs/plugins/api/Overlay/#overlay-position-type
            let manualLeft = "50%";
            let manualTop = "50%";
            let manualTransform = "translate(-50%, -50%)";
            
            if (settings.positionX !== undefined && settings.positionY !== undefined && overlay.hotspotId) {
              // Находим hotspot, который вызвал overlay
              const triggerHotspot = proto && proto.hotspots ? proto.hotspots.find((h: Hotspot) => h.id === overlay.hotspotId && h.frame === overlay.parentScreenId) : null;
              if (triggerHotspot) {
                // Координаты overlay = координаты hotspot + offset (positionX, positionY)
                // positionX и positionY - это смещение относительно hotspot
                manualLeft = `${triggerHotspot.x + settings.positionX}px`;
                manualTop = `${triggerHotspot.y + settings.positionY}px`;
                manualTransform = "none";
                console.log("TestView: MANUAL overlay position calculated", {
                  hotspotId: overlay.hotspotId,
                  hotspotX: triggerHotspot.x,
                  hotspotY: triggerHotspot.y,
                  positionX: settings.positionX,
                  positionY: settings.positionY,
                  finalLeft: manualLeft,
                  finalTop: manualTop
                });
              } else {
                console.warn("TestView: MANUAL overlay position - hotspot not found", {
                  hotspotId: overlay.hotspotId,
                  parentScreenId: overlay.parentScreenId
                });
              }
            }
            
            overlayPositionStyle = {
              position: "absolute",
              left: manualLeft,
              top: manualTop,
              transform: manualTransform
            };
            break;
          default:
            overlayPositionStyle = {
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)"
            };
        }
        
        // ВАЖНО: Background показывается ТОЛЬКО если settings.background === true
        // Согласно документации Figma, overlayBackground.type === "NONE" означает, что фона нет
        // См. https://developers.figma.com/docs/plugins/api/Overlay/#overlay-background
        
        return (
          <div key={`overlay-${overlay.screenId}-${index}`} style={{ 
            position: "absolute", 
            top: 0, 
            left: 0, 
            width: parentScreenWidth, 
            height: parentScreenHeight, 
            zIndex: 1000 + index,
            // ВАЖНО: pointer-events: none для container, чтобы он не блокировал события для hotspot
            // pointer-events: auto будет установлен для overlay screen внутри, чтобы он мог получать события
            pointerEvents: "none"
          }}>
            {/* Background overlay (если включен) - ограничен размерами родительского экрана */}
            {/* ВАЖНО: Проверяем settings.background === true (строгое сравнение) */}
            {settings.background === true && (() => {
              // Конвертируем hex цвет и opacity в rgba только если background включен
              const bgColor = settings.backgroundColor || "000000";
              const bgOpacity = settings.backgroundOpacity !== undefined ? settings.backgroundOpacity : 70;
              const r = parseInt(bgColor.substring(0, 2), 16);
              const g = parseInt(bgColor.substring(2, 4), 16);
              const b = parseInt(bgColor.substring(4, 6), 16);
              const rgbaBackground = `rgba(${r}, ${g}, ${b}, ${bgOpacity / 100})`;
              
              return (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: parentScreenWidth,
                  height: parentScreenHeight,
                  backgroundColor: rgbaBackground,
                  cursor: settings.closeOnOutsideClick ? "pointer" : "default"
                }}
                onClick={(e) => {
                  // Закрываем overlay при клике на background, если closeOnOutsideClick = true
                  if (settings.closeOnOutsideClick && e.target === e.currentTarget) {
                    closeOverlay("outside_click");
                  }
                }}
              />
              );
            })()}
            
            {/* Overlay screen */}
            <div
              style={{
                ...overlayPositionStyle,
                zIndex: 1001 + index,
                pointerEvents: "auto",
                // ВАЖНО: Ограничиваем overlay размерами родительского экрана
                // Используем maxWidth и maxHeight, чтобы overlay не выходил за границы
                maxWidth: `${parentScreenWidth}px`,
                maxHeight: `${parentScreenHeight}px`,
                // Для MANUAL позиции добавляем проверку, чтобы overlay не выходил за границы
                ...(settings.position === "MANUAL" && {
                  // Ограничиваем позицию, чтобы overlay не выходил за правую и нижнюю границы
                  // left и top уже установлены в overlayPositionStyle
                  // Добавляем проверку через CSS, чтобы overlay не выходил за границы
                })
              }}
              onMouseEnter={() => {
                // ВАЖНО: Отмечаем, что курсор находится над overlay
                // Это предотвращает закрытие overlay при уходе курсора от hotspot
                isHoveringOverlayRef.current = true;
                // Отменяем закрытие overlay, если оно было запланировано
                if (hoverLeaveTimeoutRef.current !== null) {
                  clearTimeout(hoverLeaveTimeoutRef.current);
                  hoverLeaveTimeoutRef.current = null;
                  console.log("TestView: Canceled overlay close - cursor moved to overlay");
                }
              }}
              onMouseLeave={() => {
                // Когда курсор уходит с overlay, закрываем его (если он был открыт по hover)
                isHoveringOverlayRef.current = false;
                if (hoverOverlayRef.current && hoverOverlayRef.current === overlay.screenId) {
                  console.log("TestView: Cursor left overlay, closing overlay", {
                    overlayId: overlay.screenId
                  });
                  // Закрываем overlay сразу, так как курсор ушел и от hotspot, и от overlay
                  closeOverlay("hover_leave");
                  hoverOverlayRef.current = null;
                  // Очищаем таймаут, если он был установлен
                  if (hoverLeaveTimeoutRef.current !== null) {
                    clearTimeout(hoverLeaveTimeoutRef.current);
                    hoverLeaveTimeoutRef.current = null;
                  }
                }
              }}
              onClick={(e) => {
                // Предотвращаем закрытие overlay при клике внутри overlay screen
                e.stopPropagation();
                
                // ВАЖНО: Трекаем клики в пустую область внутри overlay
                // Проверяем, что клик не попал в hotspot
                if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;
                  
                  // Проверяем, не попал ли клик в какой-либо hotspot внутри overlay
                  const clickedHotspot = proto && proto.hotspots ? proto.hotspots.find((h: Hotspot) => {
                    if (h.frame !== overlay.screenId) return false;
                    return (
                      clickX >= h.x &&
                      clickX <= h.x + h.w &&
                      clickY >= h.y &&
                      clickY <= h.y + h.h
                    );
                  }) : null;
                  
                  // Если клик не попал в hotspot, регистрируем как клик в пустую область внутри overlay
                  if (!clickedHotspot) {
                    // КРИТИЧНО: Используем overlay screen ID для кликов внутри overlay
                    const activeScreenId = getActiveScreenId(null, overlay.screenId);
                    
                    console.log("TestView: Click in empty area inside overlay", {
                      clickX,
                      clickY,
                      overlayScreenId: overlay.screenId,
                      activeScreenId: activeScreenId,
                      overlayStackSize: overlayStack.length,
                      overlayIndex: index
                    });
                    
                    recordEvent("click", activeScreenId, null, false, clickX, clickY);
                  }
                }
              }}
            >
              <img 
                src={overlayScreen.image} 
                width={overlayScreen.width} 
                alt={overlayScreen.name}
                style={{ 
                  display: "block",
                  // Ограничиваем размер изображения, чтобы оно не выходило за границы контейнера
                  maxWidth: "100%",
                  maxHeight: "100%"
                }}
              />
              
              {/* Hotspots для overlay screen */}
              {proto && proto.hotspots && proto.hotspots
                .filter((h: Hotspot) => h.frame === overlay.screenId)
                .map((h: Hotspot) => {
                  // Определяем, является ли это hover-триггером
                  const isHoverTrigger = h.trigger === "ON_HOVER";
                  
                  return (
                    <div
                      key={h.id}
                      style={{
                        position: "absolute",
                        left: h.x,
                        top: h.y,
                        width: h.w,
                        height: h.h,
                        cursor: "pointer",
                        zIndex: 1002 + index
                      }}
                      onClick={(e) => {
                        // Для hover-триггеров не обрабатываем клики (только hover)
                        if (isHoverTrigger) {
                          return;
                        }
                        e.stopPropagation();
                        const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                        if (rect) {
                          const clickX = e.clientX - rect.left;
                          const clickY = e.clientY - rect.top;
                          onHotspotClick(h, clickX, clickY);
                        } else {
                          onHotspotClick(h);
                        }
                      }}
                      onMouseEnter={() => {
                        // Обрабатываем hover только для hover-триггеров
                        if (isHoverTrigger) {
                          onHotspotHoverEnter(h);
                        }
                      }}
                      onMouseLeave={(e) => {
                        // Обрабатываем hover только для hover-триггеров
                        if (isHoverTrigger) {
                          // ВАЖНО: Проверяем relatedTarget - элемент, на который перешел курсор
                          // Если курсор переходит на overlay элемент (или его потомка), не закрываем overlay
                          const relatedTarget = e.relatedTarget as HTMLElement | null;
                          if (relatedTarget) {
                            const relatedZIndex = window.getComputedStyle(relatedTarget).zIndex;
                            const relatedZIndexNum = parseInt(relatedZIndex, 10);
                            
                            if (relatedZIndexNum >= 1000) {
                              console.log("TestView: Cursor moved from overlay hotspot to overlay element, not closing", {
                                hotspotId: h.id,
                                relatedTargetZIndex: relatedZIndexNum
                              });
                              return;
                            }
                            
                            let parent = relatedTarget.parentElement;
                            while (parent) {
                              const parentZIndex = window.getComputedStyle(parent).zIndex;
                              const parentZIndexNum = parseInt(parentZIndex, 10);
                              if (parentZIndexNum >= 1000) {
                                console.log("TestView: Cursor moved from overlay hotspot to overlay parent, not closing", {
                                  hotspotId: h.id,
                                  parentZIndex: parentZIndexNum
                                });
                                return;
                              }
                              parent = parent.parentElement;
                            }
                          }
                          
                          onHotspotHoverLeave(h);
                        }
                      }}
                    />
                  );
                })}
            </div>
          </div>
        );
      })}
      
      {/* Кнопка "Сдаться" под прототипом */}
      {!hideGiveUpBelow && !testCompleted.current && (
        <button
          style={{
            marginTop: 20,
            padding: "12px 24px",
            background: "#e0e0e0",
            color: "#000000",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "center"
          }}
          onClick={async () => {
            const currentSessionId = actualSessionId || propSessionId;
            if (currentSessionId) {
              recordEvent("aborted", currentScreen);
              if (runIdOverride && blockIdOverride) {
                try {
                  await supabase
                    .from("sessions")
                    .update({ completed: false, aborted: true })
                    .eq("id", currentSessionId);
                } catch (err) {
                  console.error("Error updating session:", err);
                }
              }
              if (onComplete) {
                onComplete();
              } else {
                navigate(`/finished/${currentSessionId}`, { state: { aborted: true, sessionId: currentSessionId } });
              }
            }
          }}
        >
          Сдаться
        </button>
      )}
    </div>
    );
  
  return renderWithSuccessSidebar(renderWithPermissionsUI(mainContent));
}