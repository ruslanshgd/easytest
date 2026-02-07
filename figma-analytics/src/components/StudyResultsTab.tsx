import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabaseClient";
import { getBlockTypeConfig, getBlockDisplayName, type BlockType } from "../lib/block-icons";
import { cn } from "../lib/utils";
import { chartColors, styleColors } from "../lib/styleUtils";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { 
  UserRoundCheck, 
  UserRoundX, 
  UserRoundMinus, 
  UserCheck,
  UserMinus,
  UserX,
  Clock, 
  CircleCheck, 
  CircleMinus,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Info,
  Map as MapIcon,
  Play,
  Pause,
  Flag,
  Trash2,
  MessageSquare,
  CirclePlay,
  Minimize2,
  Maximize2,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
} from "lucide-react";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { 
  ReactFlow,
  Background, 
  Controls, 
  MarkerType,
  Handle,
  Position,
  BaseEdge
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { HeatmapRenderer } from "./HeatmapRenderer";

interface Screen {
  id: string;
  name: string;
  width: number;
  height: number;
  image: string;
}

interface Edge {
  from: string;
  to: string;
  id: string;
  trigger: string | null;
}

interface Proto {
  protoVersion: string;
  start: string;
  end: string;
  flowId?: string;
  screens: Screen[];
  hotspots: any[];
  edges: Edge[];
  targets: string[];
}

interface StudyRun {
  id: string;
  study_id: string;
  share_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: "started" | "finished" | "abandoned";
  client_meta: any;
}

interface StudyBlock {
  id: string;
  study_id: string;
  type: BlockType;
  order_index: number;
  prototype_id: string | null;
  instructions: string | null;
  config: any;
  eye_tracking_enabled?: boolean;
  deleted_at?: string | null;
}

interface GazePointRow {
  id?: string;
  session_id: string;
  run_id: string;
  study_id: string;
  block_id: string;
  screen_id: string | null;
  ts_ms: number;
  x_norm: number;
  y_norm: number;
}

interface Session {
  id: string;
  run_id: string;
  block_id: string;
  study_id: string;
  prototype_id: string | null;
  started_at: string;
  event_count?: number;
  completed?: boolean;
  aborted?: boolean;
  recording_url?: string | null;
  recording_screen_url?: string | null;
  recording_deleted_at?: string | null;
}

export type RecordingModalUrls = { camera: string | null; screen: string | null };

export type RecordingModalData = {
  urls: RecordingModalUrls;
  sessionId: string;
  sessionStartedAt?: string;
  sessionGazePoints?: GazePointRow[];
};

function extractStoragePathFromPublicUrl(publicUrl: string, bucketId: string): string | null {
  try {
    const urlWithoutQuery = publicUrl.split("?")[0];
    const match = urlWithoutQuery.match(new RegExp(`/object/public/${bucketId}/(.+)$`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function getGazeAtTime(
  gazePoints: GazePointRow[],
  tMs: number
): { xNorm: number; yNorm: number } | null {
  if (!gazePoints.length) return null;
  const sorted = [...gazePoints].sort((a, b) => a.ts_ms - b.ts_ms);
  if (tMs <= sorted[0].ts_ms) return { xNorm: sorted[0].x_norm, yNorm: sorted[0].y_norm };
  if (tMs >= sorted[sorted.length - 1].ts_ms) return { xNorm: sorted[sorted.length - 1].x_norm, yNorm: sorted[sorted.length - 1].y_norm };
  let i = 0;
  while (i < sorted.length - 1 && sorted[i + 1].ts_ms < tMs) i++;
  const a = sorted[i];
  const b = sorted[i + 1];
  const d = b.ts_ms - a.ts_ms;
  const f = d > 0 ? (tMs - a.ts_ms) / d : 0;
  return {
    xNorm: a.x_norm + (b.x_norm - a.x_norm) * f,
    yNorm: a.y_norm + (b.y_norm - a.y_norm) * f
  };
}

function RecordingModalContent({
  recordingModalUrls,
  sessionId,
  sessionStartedAt,
  sessionGazePoints = [],
  onClose,
  onDeleted,
}: {
  recordingModalUrls: RecordingModalUrls;
  sessionId: string | null;
  sessionStartedAt?: string;
  sessionGazePoints?: GazePointRow[];
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pipSize, setPipSize] = useState<"normal" | "small">("normal");
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [voiceVolumeOpen, setVoiceVolumeOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTab, setActiveTab] = useState<"video" | "gaze">("video");
  const durationSyncedRef = useRef(false);

  const hasGazeData = sessionGazePoints.length > 0 && sessionStartedAt;
  const tMs = sessionStartedAt ? new Date(sessionStartedAt).getTime() + currentTime * 1000 : 0;
  const gazeAtTime = hasGazeData ? getGazeAtTime(sessionGazePoints, tMs) : null;
  const showTabs = true;

  const pipW = pipSize === "small" ? 64 : 120;
  const pipH = pipW;
  // Показываем регулятор громкости если есть камера ИЛИ экран (т.к. аудио микрофона может быть встроено в запись экрана)
  const hasVoiceTrack = Boolean(recordingModalUrls.camera) || Boolean(recordingModalUrls.screen);

  useEffect(() => {
    // Применяем громкость к основному видео (экран или камера)
    // Если есть и экран, и камера — громкость применяем к камере (там голос), экран беззвучный
    // Если только экран — громкость к экрану (там может быть встроенный голос)
    const primaryVideoEl = screenVideoRef.current;
    const pipVideoEl = cameraVideoRef.current;
    
    if (recordingModalUrls.screen && recordingModalUrls.camera) {
      // Экран + камера: звук из камеры, экран muted
      if (pipVideoEl) pipVideoEl.volume = voiceVolume;
      if (primaryVideoEl) primaryVideoEl.muted = true;
    } else if (recordingModalUrls.screen) {
      // Только экран: звук может быть встроен в экран
      if (primaryVideoEl) {
        primaryVideoEl.volume = voiceVolume;
        primaryVideoEl.muted = false;
      }
    } else if (recordingModalUrls.camera) {
      // Только камера: звук из камеры
      if (primaryVideoEl) primaryVideoEl.volume = voiceVolume;
    }
  }, [voiceVolume, recordingModalUrls.screen, recordingModalUrls.camera]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = videoContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    const v = screenVideoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
      cameraVideoRef.current?.play().catch(() => {});
    } else {
      v.pause();
      cameraVideoRef.current?.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const v = screenVideoRef.current;
    if (v) {
      setCurrentTime(v.currentTime);
      // Handle Infinity duration in timeupdate as well
      if (v.duration === Infinity && !durationSyncedRef.current) {
        // Use current time as a fallback for duration while playing
        // This gives us at least a moving timeline
        if (v.currentTime > 0) {
          // Don't set duration yet, but log it
          console.log("RecordingModal: handleTimeUpdate - duration is Infinity, currentTime:", v.currentTime);
        }
      } else if (Number.isFinite(v.duration) && v.duration > 0) {
        if (!durationSyncedRef.current) {
          console.log("RecordingModal: duration synced from handleTimeUpdate:", v.duration);
        }
        setDuration(v.duration);
        durationSyncedRef.current = true;
      }
    }
  }, []);

  // Синхронизация duration при открытии модалки и когда видео готово
  // Supabase Storage и некоторые CDN отдают duration только после частичной буферизации
  useEffect(() => {
    const videoUrl = recordingModalUrls.screen || recordingModalUrls.camera;
    if (!videoUrl) {
      durationSyncedRef.current = false;
      setDuration(0);
      setCurrentTime(0);
      return;
    }
    durationSyncedRef.current = false;
    console.log("RecordingModal: video URL changed, starting duration sync:", videoUrl.slice(0, 80));
    
    const syncFromVideo = () => {
      const v = screenVideoRef.current;
      if (!v) return false;
      
      // Log video state for debugging
      console.log("RecordingModal: syncFromVideo check", {
        readyState: v.readyState,
        duration: v.duration,
        networkState: v.networkState,
        paused: v.paused,
        currentTime: v.currentTime,
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1d0d01a-cd1c-4f04-b0f8-08b8e8524021',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StudyResultsTab.tsx:RecordingModal:syncFromVideo',message:'Video sync check',data:{readyState:v.readyState,duration:v.duration,networkState:v.networkState,paused:v.paused,currentTime:v.currentTime,isInfinity:v.duration===Infinity,isNaN:Number.isNaN(v.duration),videoSrc:v.src?.slice(0,100)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      
      // Handle Infinity duration (common for WebM streams from MediaRecorder)
      // In this case, we need to seek to the end to get the actual duration
      if (v.duration === Infinity && v.readyState >= 1) {
        console.log("RecordingModal: duration is Infinity, attempting workaround");
        // Try seeking to a large value to force the browser to determine actual duration
        const originalTime = Number.isFinite(v.currentTime) ? v.currentTime : 0;
        v.currentTime = Number.MAX_SAFE_INTEGER;
        // Wait for seeked event to get real duration
        const onSeeked = () => {
          v.removeEventListener('seeked', onSeeked);
          const realDuration = v.currentTime;
          console.log("RecordingModal: Infinity workaround - real duration:", realDuration);
          // Восстанавливаем позицию только если это конечное число
          if (Number.isFinite(originalTime)) {
            v.currentTime = originalTime;
          } else {
            v.currentTime = 0;
          }
          if (Number.isFinite(realDuration) && realDuration > 0) {
            setDuration(realDuration);
            durationSyncedRef.current = true;
          }
        };
        v.addEventListener('seeked', onSeeked);
        return false; // Will be resolved by the seeked event
      }
      
      if (Number.isFinite(v.duration) && v.duration > 0) {
        console.log("RecordingModal: duration synced from polling:", v.duration);
        setDuration(v.duration);
        setCurrentTime(v.currentTime);
        durationSyncedRef.current = true;
        return true;
      }
      return false;
    };
    
    // Aggressive polling: try multiple times with increasing intervals
    const timers: number[] = [];
    const pollIntervals = [100, 300, 500, 1000, 2000, 3000, 5000];
    pollIntervals.forEach((delay) => {
      timers.push(window.setTimeout(() => {
        if (!durationSyncedRef.current) syncFromVideo();
      }, delay));
    });
    
    return () => timers.forEach(clearTimeout);
  }, [recordingModalUrls.screen, recordingModalUrls.camera]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = screenVideoRef.current;
    const c = cameraVideoRef.current;
    const t = Number(e.target.value);
    if (v) v.currentTime = t;
    if (c) c.currentTime = t;
    setCurrentTime(t);
  }, []);

  const formatTime = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const syncCameraToScreen = useCallback(() => {
    const screen = screenVideoRef.current;
    const camera = cameraVideoRef.current;
    if (!screen || !camera) return;
    camera.currentTime = screen.currentTime;
    if (!screen.paused) camera.play().catch(() => {});
    else camera.pause();
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!sessionId || deleting) return;
    setDeleting(true);
    try {
      const paths: string[] = [];
      if (recordingModalUrls.screen) {
        const p = extractStoragePathFromPublicUrl(recordingModalUrls.screen, "recordings");
        if (p) paths.push(p);
      }
      if (recordingModalUrls.camera) {
        const p = extractStoragePathFromPublicUrl(recordingModalUrls.camera, "recordings");
        if (p) paths.push(p);
      }
      if (paths.length > 0) {
        const { error: removeError } = await supabase.storage.from("recordings").remove(paths);
        if (removeError) throw removeError;
      }
      const { error: updateError } = await supabase
        .from("sessions")
        .update({
          recording_url: null,
          recording_screen_url: null,
        })
        .eq("id", sessionId);
      if (updateError) throw updateError;
      setDeleteDialogOpen(false);
      onDeleted?.();
      onClose();
    } catch (err) {
      console.error("RecordingModalContent: delete failed", err);
      alert("Не удалось удалить записи. Проверьте политики RLS для Storage (DELETE) и таблицы sessions.");
    } finally {
      setDeleting(false);
    }
  }, [sessionId, recordingModalUrls, deleting, onClose, onDeleted]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Запись сессии</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded">
            <X className="h-5 w-5" />
          </button>
        </div>
        {showTabs && (
          <div className="flex gap-1 mb-3 border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("video")}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-t-md transition-colors",
                activeTab === "video" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Видео
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("gaze")}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-t-md transition-colors",
                activeTab === "gaze" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Движение глаз
            </button>
          </div>
        )}
        <div
          ref={videoContainerRef}
          className="relative w-full bg-black rounded-lg overflow-hidden"
          style={{ aspectRatio: "16/10" }}
        >
          {recordingModalUrls.screen ? (
            <video
              ref={screenVideoRef}
              src={recordingModalUrls.screen}
              crossOrigin="anonymous"
              preload="metadata"
              className="w-full h-full object-contain"
              onPlay={() => { setIsPlaying(true); syncCameraToScreen(); }}
              onPause={() => { setIsPlaying(false); syncCameraToScreen(); }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => { console.log("RecordingModal: onLoadedMetadata fired"); handleTimeUpdate(); }}
              onDurationChange={() => { console.log("RecordingModal: onDurationChange fired"); handleTimeUpdate(); }}
              onCanPlay={() => { console.log("RecordingModal: onCanPlay fired"); handleTimeUpdate(); }}
              onCanPlayThrough={() => { console.log("RecordingModal: onCanPlayThrough fired"); handleTimeUpdate(); }}
              onLoadedData={() => { console.log("RecordingModal: onLoadedData fired"); handleTimeUpdate(); syncCameraToScreen(); }}
              onSeeked={() => { handleTimeUpdate(); syncCameraToScreen(); }}
              onError={(e) => console.error("RecordingModal: video error", e)}
            />
          ) : recordingModalUrls.camera ? (
            <video
              ref={screenVideoRef}
              src={recordingModalUrls.camera}
              crossOrigin="anonymous"
              preload="metadata"
              className="w-full h-full object-contain"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => { console.log("RecordingModal: onLoadedMetadata fired (camera)"); handleTimeUpdate(); }}
              onDurationChange={() => { console.log("RecordingModal: onDurationChange fired (camera)"); handleTimeUpdate(); }}
              onCanPlay={() => { console.log("RecordingModal: onCanPlay fired (camera)"); handleTimeUpdate(); }}
              onCanPlayThrough={() => { console.log("RecordingModal: onCanPlayThrough fired (camera)"); handleTimeUpdate(); }}
              onLoadedData={() => { console.log("RecordingModal: onLoadedData fired (camera)"); handleTimeUpdate(); }}
              onError={(e) => console.error("RecordingModal: video error (camera)", e)}
            />
          ) : null}
          {recordingModalUrls.camera && recordingModalUrls.screen && (
            <div
              className="group absolute left-3 bottom-14 z-10 overflow-hidden border-2 border-white/80 shadow-lg rounded-[20px] bg-black"
              style={{ width: pipW, height: pipH, borderRadius: pipSize === "small" ? 12 : 20 }}
            >
              <video
                ref={cameraVideoRef}
                src={recordingModalUrls.camera}
                className="w-full h-full object-cover"
                playsInline
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPipSize((s) => s === "normal" ? "small" : "normal"); }}
                className="absolute top-1 right-1 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-white text-black shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/90"
                aria-label={pipSize === "normal" ? "Уменьшить веб-камеру" : "Вернуть размер веб-камеры"}
              >
                {pipSize === "normal" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          )}
          {activeTab === "gaze" && hasGazeData && gazeAtTime && (
            <div
              className="absolute inset-0 z-[15] pointer-events-none"
              aria-hidden
            >
              <div
                className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500/80 shadow-lg"
                style={{
                  left: `${gazeAtTime.xNorm * 100}%`,
                  top: `${gazeAtTime.yNorm * 100}%`
                }}
              />
            </div>
          )}
          {activeTab === "gaze" && !hasGazeData && (
            <div className="absolute inset-0 z-[15] flex items-center justify-center bg-black/50 pointer-events-none">
              <p className="text-white/90 text-sm text-center px-4 max-w-md">
                Нет данных о движении глаз для этой сессии. Возможные причины: браузер не поддерживает экспериментальную функцию, скрипт WebGazer не загрузился (проверьте консоль), не было выдано разрешение на камеру или запись не сохранилась. Функция экспериментальная.
              </p>
            </div>
          )}
          {/* Единая панель управления: Play/Pause, таймлайн, громкость, полноэкран */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-1 bg-black/70 px-2 py-2 pointer-events-auto">
            <input
              type="range"
              min={0}
              max={duration > 0 && Number.isFinite(duration) ? duration : 1}
              step={0.1}
              value={Math.min(currentTime, duration > 0 && Number.isFinite(duration) ? duration : 1)}
              onChange={handleSeek}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-1.5 accent-white cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
                className="p-1.5 rounded text-white hover:bg-white/20 transition-colors"
                aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <span className="text-white text-sm tabular-nums min-w-[4.5rem]">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <div className="flex-1" />
              {hasVoiceTrack && (
                <div
                  className="flex items-center gap-1"
                  onMouseEnter={() => setVoiceVolumeOpen(true)}
                  onMouseLeave={() => setVoiceVolumeOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => setVoiceVolumeOpen((v) => !v)}
                    className="p-1.5 rounded text-white hover:bg-white/20 transition-colors"
                    aria-label="Громкость голоса"
                  >
                    {voiceVolume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </button>
                  {voiceVolumeOpen && (
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={voiceVolume}
                      onChange={(e) => setVoiceVolume(Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-20 h-1.5 accent-white"
                    />
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                className="p-1.5 rounded text-white hover:bg-white/20 transition-colors"
                aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "На весь экран"}
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {sessionId && (
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deleting}
              className="text-sm border border-destructive/50 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
            >
              Удалить видео
            </button>
          )}
        </div>
      </div>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить записи из хранилища?</AlertDialogTitle>
            <AlertDialogDescription>
              Это освободит место и в отчёте будет показано «Удалено» в колонке «Запись».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Нет, оставить</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteConfirm(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Удаление…" : "Да, удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface StudyBlockResponse {
  id: string;
  run_id: string;
  block_id: string;
  answer: any;
  duration_ms: number | null;
  created_at: string;
}

interface StudyResultsTabProps {
  studyId: string;
  blocks: StudyBlock[];
  studyStatus?: "draft" | "published" | "stopped";
  onBlockDeleted?: (blockId: string) => void;
}

type ReportViewMode = "summary" | "responses";
type CardSortingView = "matrix" | "categories" | "cards";
type TreeTestingView = "common_paths" | "first_clicks" | "final_points";
type HeatmapView = "heatmap" | "clicks" | "image";
type HeatmapTab = "by_screens" | "by_respondents";

export default function StudyResultsTab({ studyId, blocks, studyStatus, onBlockDeleted }: StudyResultsTabProps) {
  const [runs, setRuns] = useState<StudyRun[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [responses, setResponses] = useState<StudyBlockResponse[]>([]);
  const [prototypes, setPrototypes] = useState<Record<string, Proto>>({});
  const [gazePoints, setGazePoints] = useState<GazePointRow[]>([]);
  
  // UI State
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ReportViewMode>("summary");
  const [cardSortingView, setCardSortingView] = useState<CardSortingView>("matrix");
  const [treeTestingView, setTreeTestingView] = useState<TreeTestingView>("common_paths");
  const [heatmapView, setHeatmapView] = useState<HeatmapView>("heatmap");
  const [heatmapTab, setHeatmapTab] = useState<HeatmapTab>("by_screens");
  const [respondentHeatmapView, setRespondentHeatmapView] = useState<HeatmapView>("heatmap");
  const [selectedHeatmapScreen, setSelectedHeatmapScreen] = useState<{ 
    screen: Screen; 
    proto: Proto; 
    blockId: string;
    screenIndex: number;
    totalScreens: number;
  } | null>(null);
  const [selectedRespondentScreen, setSelectedRespondentScreen] = useState<{
    screen: Screen;
    proto: Proto;
    session: Session;
    screenIndex: number;
    totalScreens: number;
  } | null>(null);
  const [modalJustOpened, setModalJustOpened] = useState(false);
  const [useGazeHeatmap, setUseGazeHeatmap] = useState(false);
  const [useRespondentGazeHeatmap, setUseRespondentGazeHeatmap] = useState(false);
  
  // Reset modalJustOpened flag after a short delay to prevent immediate backdrop clicks
  useEffect(() => {
    if (selectedRespondentScreen && modalJustOpened) {
      const timer = setTimeout(() => {
        setModalJustOpened(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedRespondentScreen, modalJustOpened]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [searchCategoryQuery, setSearchCategoryQuery] = useState("");
  const [searchCardQuery, setSearchCardQuery] = useState("");
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);
  const [onlyFirstClicks, setOnlyFirstClicks] = useState(false);
  const [showClickOrder, setShowClickOrder] = useState(false);
  const [recordingModal, setRecordingModal] = useState<RecordingModalData | null>(null);
  const [deleteRespondentRunId, setDeleteRespondentRunId] = useState<string | null>(null);
  const [deletingRespondent, setDeletingRespondent] = useState(false);
  /** Модалка подтверждения удаления сессий prototype-блока (вместо системного confirm) */
  const [deleteSessionsDialog, setDeleteSessionsDialog] = useState<{
    blockId: string;
    runIdOrSessionId: string | null;
    targetRunIds: string[];
    sessionsInDB: number;
    runIdsText: string;
  } | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: runsData, error: runsError } = await supabase
        .from("study_runs")
        .select("*")
        .eq("study_id", studyId)
        .order("started_at", { ascending: false });

      if (runsError) {
        console.error("Error loading runs:", runsError);
        setError(runsError.message);
        setLoading(false);
        return;
      }

      setRuns(runsData || []);
      
      // Auto-select all runs
      if (runsData && runsData.length > 0) {
        setSelectedRuns(new Set(runsData.map(r => r.id)));
      }
    } catch (err) {
      console.error("Unexpected error loading runs:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  const loadSessionsAndEvents = useCallback(async () => {
    if (selectedRuns.size === 0) return;

    const runIds = Array.from(selectedRuns);
    const BATCH_SIZE = 25; // избегаем 400 из‑за слишком длинного URL (run_id=in.(...))
    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    try {
      let sessionsData: any[] = [];
      for (const batch of chunk(runIds, BATCH_SIZE)) {
        const { data, error: sessionsError } = await supabase
          .from("sessions")
          .select("id, run_id, block_id, study_id, prototype_id, started_at, completed, aborted, recording_url, recording_screen_url")
          /* omit recording_deleted_at until migration is run: ADD COLUMN recording_deleted_at timestamptz */
          .in("run_id", batch);
        if (sessionsError) {
          console.error("Error loading sessions:", sessionsError);
          return;
        }
        sessionsData = sessionsData.concat(data || []);
      }

      let eventsData: any[] = [];
      for (const batch of chunk(runIds, BATCH_SIZE)) {
        const { data, error: eventsError } = await supabase
          .from("events")
          .select("*")
          .in("run_id", batch);
        if (eventsError) {
          console.error("Error loading events:", eventsError);
          return;
        }
        eventsData = eventsData.concat(data || []);
      }

      // Calculate metrics for sessions
      const sessionsWithMetrics = (sessionsData || []).map(session => {
        const sessionEvents = (eventsData || []).filter(e => e.session_id === session.id);
        
        const sortedEvents = [...sessionEvents].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const hasCompletedEvent = sortedEvents.some(e => e.event_type === "completed");
        const hasAbortedEvent = sortedEvents.some(e => e.event_type === "aborted");
        const hasClosedEvent = sortedEvents.some(e => e.event_type === "closed");
        
        let isCompleted = false;
        let isAborted = false;
        
        if (hasCompletedEvent) {
          const completedIdx = sortedEvents.findIndex(e => e.event_type === "completed");
          const abortedIdx = sortedEvents.findIndex(e => e.event_type === "aborted");
          const closedIdx = sortedEvents.findIndex(e => e.event_type === "closed");
          
          const completedTime = completedIdx >= 0 ? new Date(sortedEvents[completedIdx].timestamp).getTime() : 0;
          const abortedTime = abortedIdx >= 0 ? new Date(sortedEvents[abortedIdx].timestamp).getTime() : 0;
          const closedTime = closedIdx >= 0 ? new Date(sortedEvents[closedIdx].timestamp).getTime() : 0;
          
          isCompleted = completedTime >= abortedTime && completedTime >= closedTime;
          // «Сдался» только при событии aborted; «Закрыл прототип» — при closed (не смешиваем)
          isAborted = !isCompleted && hasAbortedEvent;
        } else if (hasAbortedEvent) {
          isAborted = true;
        } else if (hasClosedEvent) {
          // Только closed, без aborted — не ставим aborted, чтобы closedCount и карточка «Закрыли прототип» считали корректно
          isAborted = false;
        } else {
          isCompleted = session.completed === true;
          isAborted = session.aborted === true;
        }
        
        return {
          ...session,
          event_count: sessionEvents.length,
          completed: isCompleted,
          aborted: isAborted
        };
      });

      // Sort sessions by started_at descending (newest first)
      const sortedSessions = [...sessionsWithMetrics].sort((a, b) => 
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      );
      
      setSessions(sortedSessions);
      setEvents(eventsData || []);

      // Логирование для диагностики
      const eventsCount = eventsData?.length || 0;
      const sessionsCount = sessionsWithMetrics.length;
      console.log("StudyResultsTab: Loaded sessions and events:", {
        sessions_count: sessionsCount,
        events_count: eventsCount,
        sessions_with_block_id: sessionsWithMetrics.filter(s => s.block_id).length,
        sessions_without_block_id: sessionsWithMetrics.filter(s => !s.block_id).length,
        events_with_block_id: (eventsData || []).filter(e => e.block_id).length,
        events_without_block_id: (eventsData || []).filter(e => !e.block_id).length,
        unique_block_ids_in_sessions: [...new Set(sessionsWithMetrics.map(s => s.block_id).filter(Boolean))],
        unique_block_ids_in_events: [...new Set((eventsData || []).map(e => e.block_id).filter(Boolean))],
        sample_session: sessionsWithMetrics[0] ? {
          id: sessionsWithMetrics[0].id,
          run_id: sessionsWithMetrics[0].run_id,
          block_id: sessionsWithMetrics[0].block_id,
          study_id: sessionsWithMetrics[0].study_id
        } : null
      });
      if (sessionsCount > 0 && eventsCount === 0) {
        console.warn("StudyResultsTab: Есть сессии, но событий 0. Проверьте RLS на таблице events и что у событий заполнен run_id.");
      }

      // Load prototypes
      const prototypeIdsFromBlocks = Array.from(new Set(
        blocks
          .filter(b => b.type === "prototype" && b.prototype_id)
          .map(b => b.prototype_id!)
      ));
      
      const prototypeIdsFromSessions = Array.from(new Set(
        (sessionsData || [])
          .filter(s => s.prototype_id)
          .map(s => s.prototype_id!)
      ));
      
      const allPrototypeIds = Array.from(new Set([...prototypeIdsFromBlocks, ...prototypeIdsFromSessions]));

      if (allPrototypeIds.length > 0) {
        const { data: prototypesData } = await supabase
          .from("prototypes")
          .select("id, data")
          .in("id", allPrototypeIds);

        if (prototypesData) {
          const prototypesMap: Record<string, any> = {};
          prototypesData.forEach(p => {
            if (p.data) {
              prototypesMap[p.id] = p.data;
            }
          });
          setPrototypes(prev => ({ ...prev, ...prototypesMap }));
        }
      }
    } catch (err) {
      console.error("Unexpected error loading sessions/events:", err);
    }
  }, [selectedRuns, studyId, blocks]);

  const loadGazePoints = useCallback(async () => {
    if (selectedRuns.size === 0) return;

    const hasEyeTrackingBlocks = blocks.some(
      (b) => b.type === "prototype" && (b.config?.eye_tracking_enabled || b.eye_tracking_enabled)
    );
    if (!hasEyeTrackingBlocks) {
      setGazePoints([]);
      return;
    }

    const runIds = Array.from(selectedRuns);
    const batchSize = 25;
    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    try {
      let all: any[] = [];
      for (const batch of chunk(runIds, batchSize)) {
        const { data, error } = await supabase
          .from("gaze_points")
          .select("*")
          .in("run_id", batch);
        if (error) {
          console.error("StudyResultsTab: Error loading gaze_points (table may not exist yet):", error);
          setGazePoints([]);
          return;
        }
        all = all.concat(data || []);
      }
      setGazePoints(all as GazePointRow[]);
    } catch (err) {
      console.error("StudyResultsTab: Unexpected error loading gaze_points:", err);
      setGazePoints([]);
    }
  }, [blocks, selectedRuns]);

  const loadResponses = useCallback(async () => {
    if (selectedRuns.size === 0) return;

    const runIds = Array.from(selectedRuns);
    const batchSize = 25;
    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    try {
      let responsesData: any[] = [];
      for (const batch of chunk(runIds, batchSize)) {
        const { data, error: responsesError } = await supabase
          .from("study_block_responses")
          .select("*")
          .in("run_id", batch);
        if (responsesError) {
          console.error("StudyResultsTab: Error loading responses:", responsesError);
          return;
        }
        responsesData = responsesData.concat(data || []);
      }

      const uniqueBlockIds = [...new Set(responsesData.map(r => r.block_id).filter(Boolean))];
      console.log("StudyResultsTab: Loaded responses:", {
        count: responsesData.length,
        runIds: runIds.length,
        sample: responsesData.slice(0, 3).map(r => ({
          id: r.id,
          run_id: r.run_id,
          block_id: r.block_id,
          has_answer: !!r.answer,
          duration_ms: r.duration_ms
        })),
        blockIds: uniqueBlockIds,
        blockIdsCount: uniqueBlockIds.length,
        responsesWithoutBlockId: responsesData.filter(r => !r.block_id).length,
        responsesByBlock: uniqueBlockIds.reduce((acc, bid) => {
          acc[bid] = responsesData.filter(r => r.block_id === bid).length;
          return acc;
        }, {} as Record<string, number>)
      });

      setResponses(responsesData);
    } catch (err) {
      console.error("StudyResultsTab: Unexpected error loading responses:", err);
    }
  }, [selectedRuns]);

  const deleteBlockResponses = useCallback(async (blockId: string, runIdOrSessionId?: string | null) => {
    // Определить тип блока
    const block = blocks.find(b => b.id === blockId);
    const blockType = block?.type || "unknown";
    
    // КРИТИЧНО: Определяем runId для удаления
    // Если передан runIdOrSessionId - удаляем только для этого run/сессии
    // Иначе удаляем для всех выбранных runs (режим summary)
    let targetRunIds: string[] = [];
    
    if (runIdOrSessionId) {
      // Проверяем, это sessionId или runId
      const session = sessions.find(s => s.id === runIdOrSessionId);
      if (session) {
        // Это sessionId - используем run_id из сессии
        targetRunIds = [session.run_id];
      } else if (selectedRuns.has(runIdOrSessionId)) {
        // Это runId - используем его
        targetRunIds = [runIdOrSessionId];
      } else {
        alert("Не найден run или сессия для удаления");
        return;
      }
    } else {
      // Режим summary - удаляем для всех выбранных runs
      if (selectedRuns.size === 0) {
        alert("Не выбраны runs для удаления");
        return;
      }
      targetRunIds = Array.from(selectedRuns);
    }
    
    console.log("=== deleteBlockResponses called ===", {
      blockId,
      blockType,
      runIdOrSessionId,
      targetRunIds,
      selectedRunsCount: selectedRuns.size,
      totalResponsesCount: responses.length,
      totalSessionsCount: sessions.length,
      allBlockIdsInResponses: [...new Set(responses.map(r => r.block_id).filter(Boolean))],
      responsesForThisBlock: responses.filter(r => r.block_id === blockId && targetRunIds.includes(r.run_id)).length,
      sessionsForThisBlock: sessions.filter(s => s.block_id === blockId && targetRunIds.includes(s.run_id)).length
    });

    const runIdsText = targetRunIds.length === 1 ? "1 run" : `${targetRunIds.length} runs`;
    
    try {
      // Для prototype блоков удаляем сессии, для остальных - ответы из study_block_responses
      if (blockType === "prototype") {
        // Проверить сессии в БД
        const { data: checkSessions, error: checkSessionsError } = await supabase
          .from("sessions")
          .select("id, run_id, block_id")
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        if (checkSessionsError) {
          console.error("Error checking sessions before delete:", checkSessionsError);
          alert("Ошибка при проверке сессий: " + checkSessionsError.message);
          return;
        }
        
        const sessionsInDB = checkSessions?.length || 0;
        const sessionsInLocal = sessions.filter(s => s.block_id === blockId && targetRunIds.includes(s.run_id)).length;
        
        console.log(`Found ${sessionsInDB} sessions in DB for prototype block ${blockId} in ${targetRunIds.length} runs`, {
          sessionsInLocal,
          checkSessionsSample: checkSessions?.slice(0, 3)
        });
        
        if (sessionsInDB === 0) {
          const isDraft = studyStatus === "draft";
          if (isDraft && onBlockDeleted) {
            if (confirm("В выбранных runs нет данных по этому prototype блоку. Удалить блок из теста?")) {
              onBlockDeleted(blockId);
            }
          } else {
            alert("В выбранных runs нет данных по этому prototype блоку. " + (isDraft ? "Для удаления блока используйте вкладку «Конструктор»." : "Блок можно удалить только в режиме черновика."));
          }
          return;
        }
        
        // Показать модалку подтверждения вместо системного confirm
        setDeleteSessionsDialog({
          blockId,
          runIdOrSessionId: runIdOrSessionId ?? null,
          targetRunIds,
          sessionsInDB,
          runIdsText,
        });
        return;
      } else {
        // Для не-prototype блоков удаляем ответы из study_block_responses
        const { data: checkData, error: checkError } = await supabase
          .from("study_block_responses")
          .select("id, run_id, block_id")
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        if (checkError) {
          console.error("Error checking responses before delete:", checkError);
          alert("Ошибка при проверке ответов: " + checkError.message);
          return;
        }
        
        const responsesInDB = checkData?.length || 0;
        const responsesInLocal = responses.filter(r => r.block_id === blockId && targetRunIds.includes(r.run_id)).length;
        
        console.log(`Found ${responsesInDB} responses in DB for block ${blockId} in ${targetRunIds.length} runs`, {
          responsesInLocal,
          checkDataSample: checkData?.slice(0, 3)
        });
        
        if (responsesInDB === 0) {
          const isDraft = studyStatus === "draft";
          if (isDraft && onBlockDeleted) {
            if (confirm("В выбранных runs нет данных по этому блоку. Удалить блок из теста?")) {
              onBlockDeleted(blockId);
            }
          } else {
            alert("В выбранных runs нет данных по этому блоку. " + (isDraft ? "Для удаления блока используйте вкладку «Конструктор»." : "Блок можно удалить только в режиме черновика."));
          }
          return;
        }
        
        const confirmText = runIdOrSessionId
          ? `Удалить ${responsesInDB} ответов для этого блока для выбранного респондента?`
          : `Удалить ${responsesInDB} ответов для этого блока в выбранных ${runIdsText}?`;
        
        if (!confirm(confirmText)) return;
        
        // Выполнить удаление
        const { error } = await supabase
          .from("study_block_responses")
          .delete()
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        if (error) {
          console.error("Error deleting responses:", error);
          alert("Ошибка при удалении ответов: " + error.message);
          return;
        }
        
        // Проверить результат удаления
        const { data: verifyData, error: verifyError } = await supabase
          .from("study_block_responses")
          .select("id")
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        const remainingCount = verifyData?.length || 0;
        const actuallyDeleted = responsesInDB - remainingCount;
        
        console.log(`Delete result: found ${responsesInDB} before, ${remainingCount} after, deleted ${actuallyDeleted} responses`);
        
        if (actuallyDeleted > 0) {
          console.log(`Successfully deleted ${actuallyDeleted} responses for block ${blockId}`);
          // Обновить локальное состояние
          setResponses(prev => prev.filter(r => !(r.block_id === blockId && targetRunIds.includes(r.run_id))));
          // Перезагрузить данные для пересчета аналитики
          await loadResponses();
          // КРИТИЧНО: Перезагрузить сессии и события для пересчета аналитики в сводном отчете
          await loadSessionsAndEvents();
        } else {
          alert("Ответы не были удалены. Возможно, проблема с правами доступа (RLS политика).");
        }
      }
    } catch (err) {
      console.error("Error deleting responses:", err);
      alert("Ошибка при удалении: " + (err instanceof Error ? err.message : String(err)));
    }
  }, [selectedRuns, loadResponses, loadSessionsAndEvents, responses, sessions, blocks, studyStatus, onBlockDeleted]);

  const performDeleteRespondent = useCallback(async (runId: string) => {
    if (!runId) return;
    setDeletingRespondent(true);
    try {
      // 1. Удаляем gaze_points (ссылаются на sessions через session_id)
      const { error: gazeError } = await supabase
        .from("gaze_points")
        .delete()
        .eq("run_id", runId);
      if (gazeError) {
        console.error("Error deleting gaze_points:", gazeError);
        // Не блокируем — gaze_points может не быть
      }
      // 2. Удаляем events (ссылаются на sessions через session_id)
      const { error: eventsError } = await supabase
        .from("events")
        .delete()
        .eq("run_id", runId);
      if (eventsError) {
        console.error("Error deleting events:", eventsError);
        // Не блокируем — events может не быть
      }
      // 3. Удаляем sessions (теперь безопасно — дочерние записи удалены)
      const { error: sessionsError } = await supabase
        .from("sessions")
        .delete()
        .eq("run_id", runId);
      if (sessionsError) {
        console.error("Error deleting sessions:", sessionsError);
        alert("Ошибка при удалении сессий: " + sessionsError.message);
        setDeletingRespondent(false);
        return;
      }
      // 4. Удаляем ответы на блоки
      const { error: responsesError } = await supabase
        .from("study_block_responses")
        .delete()
        .eq("run_id", runId);
      if (responsesError) {
        console.error("Error deleting responses:", responsesError);
        alert("Ошибка при удалении ответов: " + responsesError.message);
        setDeletingRespondent(false);
        return;
      }
      // 5. Удаляем сам run
      const { error: runsError } = await supabase
        .from("study_runs")
        .delete()
        .eq("id", runId);
      if (runsError) {
        console.error("Error deleting run:", runsError);
        alert("Ошибка при удалении записи респондента: " + runsError.message);
        setDeletingRespondent(false);
        return;
      }
      setSessions(prev => prev.filter(s => s.run_id !== runId));
      setEvents(prev => prev.filter(e => e.run_id !== runId));
      setResponses(prev => prev.filter(r => r.run_id !== runId));
      if (selectedSessionId) {
        const session = sessions.find(s => s.id === selectedSessionId);
        if (session?.run_id === runId) setSelectedSessionId(null);
      }
      await loadRuns();
      await loadSessionsAndEvents();
      await loadResponses();
      setDeleteRespondentRunId(null);
    } catch (err) {
      console.error("Error deleting run responses:", err);
      alert("Ошибка при удалении: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingRespondent(false);
    }
  }, [loadRuns, loadSessionsAndEvents, loadResponses, sessions, selectedSessionId]);

  const deleteAllResponsesForRun = useCallback((runId: string) => {
    if (!runId) return;
    setDeleteRespondentRunId(runId);
  }, []);

  /** Выполнить удаление сессий prototype-блока после подтверждения в модалке */
  const confirmDeleteSessionsForBlock = useCallback(async (payload: { blockId: string; targetRunIds: string[] }) => {
    const { blockId, targetRunIds } = payload;
    setDeleteSessionsDialog(null);
    try {
      // 1. Удаляем gaze_points (ссылаются на sessions через session_id)
      const { error: gazeError } = await supabase
        .from("gaze_points")
        .delete()
        .eq("block_id", blockId)
        .in("run_id", targetRunIds);
      if (gazeError) console.error("Error deleting gaze_points:", gazeError);

      // 2. Удаляем events (ссылаются на sessions через session_id)
      const { error: eventsError } = await supabase
        .from("events")
        .delete()
        .eq("block_id", blockId)
        .in("run_id", targetRunIds);
      if (eventsError) console.error("Error deleting events:", eventsError);

      // 3. Удаляем sessions (теперь безопасно)
      const { error: deleteSessionsError } = await supabase
        .from("sessions")
        .delete()
        .eq("block_id", blockId)
        .in("run_id", targetRunIds);

      if (deleteSessionsError) {
        console.error("Error deleting sessions:", deleteSessionsError);
        alert("Ошибка при удалении сессий: " + deleteSessionsError.message);
        return;
      }

      const { data: verifySessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("block_id", blockId)
        .in("run_id", targetRunIds);

      const remainingSessions = verifySessions?.length || 0;

      setSessions(prev => prev.filter(s => !(s.block_id === blockId && targetRunIds.includes(s.run_id))));
      setEvents(prev => prev.filter(e => !(e.block_id === blockId && targetRunIds.includes(e.run_id))));
      await loadSessionsAndEvents();
      await loadResponses();

      if (remainingSessions > 0) {
        alert("Сессии не были удалены. Возможно, проблема с правами доступа (RLS политика).");
      }
    } catch (err) {
      console.error("Error deleting sessions:", err);
      alert("Ошибка при удалении: " + (err instanceof Error ? err.message : String(err)));
    }
  }, [loadSessionsAndEvents, loadResponses]);

  // При открытии вкладки «Результаты» загружаем runs для этого теста
  useEffect(() => {
    if (studyId) {
      loadRuns();
    }
  }, [studyId, loadRuns]);

  useEffect(() => {
    if (selectedRuns.size > 0) {
      loadSessionsAndEvents();
      loadResponses();
      loadGazePoints();
    } else {
      setSessions([]);
      setEvents([]);
      setResponses([]);
      setGazePoints([]);
    }
  }, [selectedRuns, loadSessionsAndEvents, loadResponses, loadGazePoints]);

  // Auto-select first block or first session
  useEffect(() => {
    if (viewMode === "summary") {
      const visible = blocks.filter(b => !b.deleted_at);
      if (visible.length > 0 && !selectedBlockId) {
        setSelectedBlockId(visible[0].id);
      }
    } else if (viewMode === "responses") {
      if (sessions.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sessions[0].id);
      } else if (sessions.length === 0 && responses.length > 0 && selectedRuns.size > 0 && !selectedSessionId) {
        // Если нет сессий, но есть ответы - выбираем первый run с ответами
        const selectedRunIds = Array.from(selectedRuns);
        const firstRunWithResponses = selectedRunIds.find(runId => 
          responses.some(r => r.run_id === runId)
        );
        if (firstRunWithResponses) {
          setSelectedSessionId(firstRunWithResponses);
        }
      }
    }
  }, [blocks, selectedBlockId, sessions, selectedSessionId, viewMode]);

  // Calculate total respondents count (not responses count)
  // КРИТИЧНО: Показываем количество респондентов (людей), а не количество ответов.
  // Должно совпадать со списком слева: только люди с сессиями или ответами.
  // НЕ используем runs.length: после удаления всех ответов/сессий список пуст — и счётчик должен быть 0.
  const totalResponsesCount = (() => {
    if (sessions.length > 0) {
      return sessions.length;
    }
    if (responses.length > 0) {
      const uniqueRunIds = new Set(responses.map(r => r.run_id));
      return uniqueRunIds.size;
    }
    return 0;
  })();

  const visibleBlocks = useMemo(() => blocks.filter(b => !b.deleted_at), [blocks]);
  const selectedBlock = visibleBlocks.find(b => b.id === selectedBlockId) || visibleBlocks[0] || null;
  useEffect(() => {
    if (selectedBlockId && !visibleBlocks.some(b => b.id === selectedBlockId)) {
      setSelectedBlockId(visibleBlocks[0]?.id ?? null);
    }
  }, [visibleBlocks, selectedBlockId]);
  const selectedRun = runs.find(r => r.id === selectedRunId) || null;

  // Parse user agent to get OS and browser
  const parseUserAgent = (userAgent: string | null | undefined) => {
    if (!userAgent) return { os: "Неизвестно", browser: "Неизвестно" };
    
    let os = "Неизвестно";
    let browser = "Неизвестно";
    
    // Parse OS
    if (userAgent.includes("Mac OS X") || userAgent.includes("Macintosh")) {
      os = "Mac OS";
    } else if (userAgent.includes("Windows")) {
      os = "Windows";
    } else if (userAgent.includes("Linux")) {
      os = "Linux";
    } else if (userAgent.includes("Android")) {
      os = "Android";
    } else if (userAgent.includes("iOS")) {
      os = "iOS";
    }
    
    // Parse Browser
    if (userAgent.includes("Chrome") && !userAgent.includes("Edg") && !userAgent.includes("OPR")) {
      browser = "Chrome";
    } else if (userAgent.includes("Firefox")) {
      browser = "Firefox";
    } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
      browser = "Safari";
    } else if (userAgent.includes("Edg")) {
      browser = "Edge";
    } else if (userAgent.includes("OPR")) {
      browser = "Opera";
    } else if (userAgent.includes("MSIE") || userAgent.includes("Trident")) {
      browser = "Internet Explorer";
    }
    
    return { os, browser };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
        <h1 className="m-0 text-2xl font-semibold text-foreground">Загрузка результатов...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-destructive">Ошибка: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Left Sidebar - Block List or Sessions List */}
      <div className="w-80 bg-muted flex flex-col relative">
        {/* Full height border */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-border" />
        
        {/* Tabs */}
        <div className="px-3 pt-3 pb-3 flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setViewMode("summary");
                if (blocks.length > 0 && !selectedBlockId) {
                  setSelectedBlockId(blocks[0].id);
                }
              }}
              className={cn(
                "flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                viewMode === "summary"
                  ? "bg-primary text-white"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              Сводный
            </button>
            <button
              onClick={() => {
                setViewMode("responses");
                if (sessions.length > 0 && !selectedSessionId) {
                  setSelectedSessionId(sessions[0].id);
                } else if (runs.length > 0 && !selectedRunId) {
                  setSelectedRunId(runs[0].id);
                }
              }}
              className={cn(
                "flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                viewMode === "responses"
                  ? "bg-primary text-white"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              Ответы {totalResponsesCount}
            </button>
          </div>
        </div>

        {/* Block List or Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
          {viewMode === "summary" ? (
            // Show blocks in summary mode (filter out soft-deleted)
            visibleBlocks.map((block, index) => {
              const blockConfig = getBlockTypeConfig(block.type);
              const IconComponent = blockConfig.icon;
              const isSelected = selectedBlockId === block.id;
              
              return (
                <div
                  key={block.id}
                  className={cn(
                    "group w-full flex items-center gap-2 p-2 rounded-xl transition-all",
                    isSelected
                      ? "bg-primary text-white shadow-md"
                      : "bg-card border border-border hover:border-primary/30"
                  )}
                >
                  <button
                    onClick={() => setSelectedBlockId(block.id)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <span className="text-sm font-medium">{index + 1}.</span>
                    <div className={cn(
                      "w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
                      isSelected ? "bg-white/20" : "bg-muted"
                    )}>
                      <IconComponent size={14} className={isSelected ? "text-white" : "text-muted-foreground"} />
                    </div>
                    <span className="flex-1 text-sm font-medium truncate">
                      {getBlockDisplayName(block)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteBlockResponses(block.id); }}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/10 transition-opacity",
                      isSelected ? "text-white hover:text-white/90" : "text-muted-foreground hover:text-destructive"
                    )}
                    title="Удалить отчёт по блоку"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          ) : (
            // Show sessions in responses mode, or runs if no sessions but responses exist
            (() => {
              // Если есть сессии - показываем их
              if (sessions.length > 0) {
                return sessions.map((session) => {
                  const isSelected = selectedSessionId === session.id;
                  const sessionResponses = responses.filter(r => r.run_id === session.run_id);
                  const responsesCount = sessionResponses.length;
                  
                  // Find run for this session to get client_meta
                  const run = runs.find(r => r.id === session.run_id);
                  let userAgent: string | null = null;
                  
                  if (run) {
                    try {
                      const clientMeta = run.client_meta;
                      if (typeof clientMeta === "string") {
                        const parsed = JSON.parse(clientMeta);
                        userAgent = parsed.user_agent || null;
                      } else if (clientMeta && typeof clientMeta === "object") {
                        userAgent = (clientMeta as any).user_agent || null;
                      }
                    } catch (e) {
                      console.error("Error parsing client_meta:", e);
                    }
                  }
                  
                  const { os, browser } = parseUserAgent(userAgent);
                  const date = new Date(session.started_at);
                  
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "group w-full flex items-center gap-2 p-3 rounded-xl transition-all",
                        isSelected
                          ? "bg-primary text-white shadow-md"
                          : "bg-card border border-border hover:border-primary/30"
                      )}
                    >
                      <button
                        onClick={() => setSelectedSessionId(session.id)}
                        className="flex-1 flex flex-col gap-1 text-left min-w-0"
                      >
                        <div className={cn("text-sm font-medium", isSelected ? "text-white" : "text-foreground")}>
                          {date.toLocaleDateString("ru-RU", { 
                            day: "2-digit", 
                            month: "short", 
                            hour: "2-digit",
                            minute: "2-digit"
                          }).replace(" г.,", ",")}
                        </div>
                        <div className={cn("flex items-center gap-1 text-xs", isSelected ? "text-white/80" : "text-muted-foreground")}>
                          <span>{os}</span>
                          <span>*</span>
                          <span>{browser}</span>
                          {responsesCount > 0 && (
                            <>
                              <span>•</span>
                              <span>{responsesCount} {responsesCount === 1 ? "ответ" : responsesCount < 5 ? "ответа" : "ответов"}</span>
                            </>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteAllResponsesForRun(session.run_id); }}
                        className={cn(
                          "opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/10 transition-opacity",
                          isSelected ? "text-white hover:text-white/90" : "text-muted-foreground hover:text-destructive"
                        )}
                        title="Удалить все ответы респондента"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                });
              }
              
              // Если нет сессий, но есть ответы - показываем список runs на основе ответов
              if (responses.length > 0 && selectedRuns.size > 0) {
                const selectedRunIds = Array.from(selectedRuns);
                const runsWithResponses = selectedRunIds
                  .map(runId => {
                    const run = runs.find(r => r.id === runId);
                    const runResponses = responses.filter(r => r.run_id === runId);
                    return { runId, run, responsesCount: runResponses.length };
                  })
                  .filter(item => item.responsesCount > 0)
                  .sort((a, b) => {
                    // Сортируем по дате создания run (если есть) или по количеству ответов
                    if (a.run && b.run) {
                      return new Date(b.run.started_at).getTime() - new Date(a.run.started_at).getTime();
                    }
                    return b.responsesCount - a.responsesCount;
                  });
                
                return runsWithResponses.map(({ runId, run, responsesCount }) => {
                  const isSelected = selectedSessionId === runId;
                  
                  let userAgent: string | null = null;
                  if (run) {
                    try {
                      const clientMeta = run.client_meta;
                      if (typeof clientMeta === "string") {
                        const parsed = JSON.parse(clientMeta);
                        userAgent = parsed.user_agent || null;
                      } else if (clientMeta && typeof clientMeta === "object") {
                        userAgent = (clientMeta as any).user_agent || null;
                      }
                    } catch (e) {
                      console.error("Error parsing client_meta:", e);
                    }
                  }
                  
                  const { os, browser } = parseUserAgent(userAgent);
                  const date = run ? new Date(run.started_at) : new Date();
                  
                  return (
                    <div
                      key={runId}
                      className={cn(
                        "group w-full flex items-center gap-2 p-3 rounded-xl transition-all",
                        isSelected
                          ? "bg-primary text-white shadow-md"
                          : "bg-card border border-border hover:border-primary/30"
                      )}
                    >
                      <button
                        onClick={() => setSelectedSessionId(runId)}
                        className="flex-1 flex flex-col gap-1 text-left min-w-0"
                      >
                        <div className={cn("text-sm font-medium", isSelected ? "text-white" : "text-foreground")}>
                          {date.toLocaleDateString("ru-RU", { 
                            day: "2-digit", 
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit"
                          }).replace(" г.,", ",")}
                        </div>
                        <div className={cn("flex items-center gap-1 text-xs", isSelected ? "text-white/80" : "text-muted-foreground")}>
                          <span>{os}</span>
                          <span>*</span>
                          <span>{browser}</span>
                          {responsesCount > 0 && (
                            <>
                              <span>•</span>
                              <span>{responsesCount} {responsesCount === 1 ? "ответ" : responsesCount < 5 ? "ответа" : "ответов"}</span>
                            </>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteAllResponsesForRun(runId); }}
                        className={cn(
                          "opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/10 transition-opacity",
                          isSelected ? "text-white hover:text-white/90" : "text-muted-foreground hover:text-destructive"
                        )}
                        title="Удалить все ответы респондента"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                });
              }
              
              return (
                <div className="text-center text-muted-foreground text-sm py-4">
                  Нет данных для отображения
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted">
        <div className="flex-1 overflow-y-auto bg-muted">
          <div className="max-w-3xl mx-auto pt-6">
          {viewMode === "summary" && selectedBlock && (() => {
            // КРИТИЧНО: Для prototype блоков — сессии по block_id, fallback по prototype_id
            let filteredSessions = sessions.filter(s => s.block_id === selectedBlock!.id);
            if (selectedBlock.type === "prototype" && filteredSessions.length === 0 && selectedBlock.prototype_id) {
              const runIds = new Set(selectedRuns);
              filteredSessions = sessions.filter(
                s => s.prototype_id === selectedBlock.prototype_id && runIds.has(s.run_id)
              );
            }

            // Для prototype: события по session_id + fallback по run_id+block_id, чтобы тепловые карты/клики включали все события по блоку.
            const runIdsFromSessions = new Set(filteredSessions.map(s => s.run_id));
            // Доп. fallback: если сессий нет по block_id, но есть события по выбранным runs — включаем их по run_id + block_id
            const runIdsForEvents =
              runIdsFromSessions.size > 0 ? runIdsFromSessions : new Set(selectedRuns);
            const filteredEvents = selectedBlock.type === "prototype"
              ? events.filter(e =>
                  filteredSessions.some(s => s.id === e.session_id) ||
                  (e.run_id && runIdsForEvents.has(e.run_id) && (e.block_id === selectedBlock.id || !e.block_id))
                )
              : events.filter(e => e.block_id === selectedBlock.id);

            // КРИТИЧНО: Для prototype блоков ответы могут не иметь прямого block_id
            let filteredResponses: typeof responses = [];
            if (selectedBlock.type === "prototype") {
              const blockSessions = filteredSessions;
              const sessionIds = new Set(blockSessions.map(s => s.id));
              if (sessionIds.size > 0) {
                const runIdsFromSessions = new Set(blockSessions.map(s => s.run_id));
                filteredResponses = responses.filter(r => r.run_id && runIdsFromSessions.has(r.run_id));
              } else {
                const selectedRunIds = Array.from(selectedRuns);
                filteredResponses = responses.filter(r =>
                  selectedRunIds.includes(r.run_id) &&
                  (!r.block_id || r.block_id === selectedBlock.id)
                );
              }
            } else {
              filteredResponses = responses.filter(r => r.block_id === selectedBlock.id);
            }

            // Логирование для диагностики фильтрации
            const allBlockIdsInResponses = [...new Set(responses.map(r => r.block_id).filter(Boolean))];
            const sampleResponses = responses.slice(0, 5).map(r => ({
              id: r.id,
              run_id: r.run_id,
              block_id: r.block_id
            }));
            const byBlockId = sessions.filter(s => s.block_id === selectedBlock.id).length;
            const usedFallback = selectedBlock.type === "prototype" && byBlockId === 0 && filteredSessions.length > 0;
            console.log("StudyResultsTab: Filtering data for block:", {
              block_id: selectedBlock.id,
              block_type: selectedBlock.type,
              total_responses: responses.length,
              filtered_responses: filteredResponses.length,
              total_sessions: sessions.length,
              filtered_sessions: filteredSessions.length,
              total_events: events.length,
              filtered_events: filteredEvents.length,
              all_block_ids_in_responses: allBlockIdsInResponses,
              sample_responses: sampleResponses,
              sample_filtered_response: filteredResponses[0] ? {
                id: filteredResponses[0].id,
                run_id: filteredResponses[0].run_id,
                block_id: filteredResponses[0].block_id
              } : null,
              selected_runs_count: selectedRuns.size,
              prototype_filtering_method: selectedBlock.type === "prototype"
                ? (byBlockId > 0 ? "by_block_id" : usedFallback ? "by_prototype_id_fallback" : "by_run_id_without_block_id")
                : "by_block_id"
            });
            
            // КРИТИЧНО: Для prototype блоков PrototypeView не использует responses,
            // но мы все равно передаем их для совместимости
            // Данные для prototype блоков хранятся в sessions и events
            return (
              <BlockReportView
                block={selectedBlock}
                blocks={blocks}
                responses={filteredResponses}
                sessions={filteredSessions}
                events={filteredEvents}
              prototypes={prototypes}
              viewMode={viewMode}
              cardSortingView={cardSortingView}
              setCardSortingView={setCardSortingView}
              treeTestingView={treeTestingView}
              setTreeTestingView={setTreeTestingView}
              heatmapView={heatmapView}
              setHeatmapView={setHeatmapView}
              heatmapTab={heatmapTab}
              setHeatmapTab={setHeatmapTab}
              selectedHeatmapScreen={selectedHeatmapScreen}
              setSelectedHeatmapScreen={setSelectedHeatmapScreen}
              selectedRespondentScreen={selectedRespondentScreen}
              setSelectedRespondentScreen={setSelectedRespondentScreen}
              respondentHeatmapView={respondentHeatmapView}
              setRespondentHeatmapView={setRespondentHeatmapView}
              expandedCategories={expandedCategories}
              setExpandedCategories={setExpandedCategories}
              expandedCards={expandedCards}
              setExpandedCards={setExpandedCards}
              searchCategoryQuery={searchCategoryQuery}
              setSearchCategoryQuery={setSearchCategoryQuery}
              searchCardQuery={searchCardQuery}
              setSearchCardQuery={setSearchCardQuery}
              showHiddenCategories={showHiddenCategories}
              setShowHiddenCategories={setShowHiddenCategories}
              onlyFirstClicks={onlyFirstClicks}
              setOnlyFirstClicks={setOnlyFirstClicks}
              showClickOrder={showClickOrder}
              setShowClickOrder={setShowClickOrder}
              setModalJustOpened={setModalJustOpened}
              recordingModal={recordingModal ?? null}
              setRecordingModal={setRecordingModal ?? (() => {})}
              gazePoints={gazePoints}
              onDeleteResponses={(viewMode as string) === "responses" ? (blockId: string) => {
                // КРИТИЧНО: В режиме "ответы" передаем runId/sessionId для удаления только конкретного респондента
                const runIdOrSessionId = selectedSessionId;
                return deleteBlockResponses(blockId, runIdOrSessionId);
              } : undefined}
              />
            );
          })()}
          {viewMode === "responses" && (() => {
            // КРИТИЧНО: Если есть selectedSessionId - показываем данные для этой сессии или run
            if (selectedSessionId) {
              // Сначала проверяем, это сессия или run
              const selectedSession = sessions.find(s => s.id === selectedSessionId);
              
              if (selectedSession) {
                // Это сессия - показываем данные для этой сессии
                const sessionRunId = selectedSession.run_id;
                return (
                  <AllBlocksReportView
                    blocks={blocks}
                    sessionId={selectedSession.id}
                    runId={sessionRunId}
                    responses={responses.filter(r => r.run_id === sessionRunId)}
                    sessions={sessions.filter(s => s.run_id === sessionRunId)}
                    events={events.filter(e => e.run_id === sessionRunId)}
                    prototypes={prototypes}
                    gazePoints={gazePoints}
                    onDeleteResponses={(blockId: string) => {
                      return deleteBlockResponses(blockId, sessionRunId);
                    }}
                    onRecordingDeleted={loadSessionsAndEvents}
                  />
                );
              } else if (selectedRuns.has(selectedSessionId)) {
                // Это run - показываем данные для этого run
                const runId = selectedSessionId;
                const runResponses = responses.filter(r => r.run_id === runId);
                
                if (runResponses.length > 0) {
                  return (
                    <AllBlocksReportView
                      blocks={blocks}
                      sessionId={undefined}
                      runId={runId}
                      responses={runResponses}
                      sessions={[]}
                      events={events.filter(e => e.run_id === runId)}
                      prototypes={prototypes}
                      gazePoints={gazePoints}
                      onDeleteResponses={(blockId: string) => {
                        return deleteBlockResponses(blockId, runId);
                      }}
                      onRecordingDeleted={loadSessionsAndEvents}
                    />
                  );
                }
              }
            }
            
            return (
              <div className="text-center text-muted-foreground py-8">
                Выберите респондента из списка слева для просмотра ответов
              </div>
            );
          })()}
          </div>
        </div>
      </div>

      {/* Modal: экран — основной плеер, камера — PiP слева внизу */}
      {recordingModal && (recordingModal.urls.camera || recordingModal.urls.screen) && createPortal(
        <RecordingModalContent
          recordingModalUrls={recordingModal.urls}
          sessionId={recordingModal.sessionId}
          sessionStartedAt={recordingModal.sessionStartedAt}
          sessionGazePoints={recordingModal.sessionGazePoints}
          onClose={() => setRecordingModal(null)}
          onDeleted={loadSessionsAndEvents}
        />,
        document.body
      )}

      {/* Модальное окно: удалить все ответы респондента */}
      <AlertDialog open={deleteRespondentRunId !== null} onOpenChange={(open) => !open && setDeleteRespondentRunId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить все ответы этого респондента?</AlertDialogTitle>
            <AlertDialogDescription>
              Сессии и ответы будут удалены безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRespondent}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteRespondentRunId) performDeleteRespondent(deleteRespondentRunId);
              }}
              disabled={deletingRespondent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingRespondent ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Модальное окно: удалить сессии prototype-блока (вместо системного confirm) */}
      <AlertDialog open={deleteSessionsDialog !== null} onOpenChange={(open) => !open && setDeleteSessionsDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteSessionsDialog
                ? deleteSessionsDialog.runIdOrSessionId
                  ? `Удалить ${deleteSessionsDialog.sessionsInDB} сессий для этого prototype блока для выбранного респондента?`
                  : `Удалить ${deleteSessionsDialog.sessionsInDB} сессий для этого prototype блока в выбранных ${deleteSessionsDialog.runIdsText}?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Это также удалит связанные события и данные.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет, оставить</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteSessionsDialog) {
                  confirmDeleteSessionsForBlock({
                    blockId: deleteSessionsDialog.blockId,
                    targetRunIds: deleteSessionsDialog.targetRunIds,
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Да, удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Component for rendering block-specific report views
interface BlockReportViewProps {
  block: StudyBlock;
  blocks: StudyBlock[];
  responses: StudyBlockResponse[];
  sessions: Session[];
  events: any[];
  prototypes: Record<string, Proto>;
  viewMode: ReportViewMode;
  cardSortingView: CardSortingView;
  setCardSortingView: (view: CardSortingView) => void;
  treeTestingView: TreeTestingView;
  setTreeTestingView: (view: TreeTestingView) => void;
  heatmapView: HeatmapView;
  setHeatmapView: (view: HeatmapView) => void;
  heatmapTab: HeatmapTab;
  setHeatmapTab: (tab: HeatmapTab) => void;
  selectedHeatmapScreen: { screen: Screen; proto: Proto; blockId: string; screenIndex: number; totalScreens: number } | null;
  setSelectedHeatmapScreen: (screen: { screen: Screen; proto: Proto; blockId: string; screenIndex: number; totalScreens: number } | null) => void;
  selectedRespondentScreen: { screen: Screen; proto: Proto; session: Session; screenIndex: number; totalScreens: number } | null;
  setSelectedRespondentScreen: (screen: { screen: Screen; proto: Proto; session: Session; screenIndex: number; totalScreens: number } | null) => void;
  respondentHeatmapView: HeatmapView;
  setRespondentHeatmapView: (view: HeatmapView) => void;
  expandedCategories: Set<string>;
  setExpandedCategories: (set: Set<string>) => void;
  expandedCards: Set<string>;
  setExpandedCards: (set: Set<string>) => void;
  searchCategoryQuery: string;
  setSearchCategoryQuery: (query: string) => void;
  searchCardQuery: string;
  setSearchCardQuery: (query: string) => void;
  showHiddenCategories: boolean;
  setShowHiddenCategories: (show: boolean) => void;
  onlyFirstClicks: boolean;
  setOnlyFirstClicks: (only: boolean) => void;
  showClickOrder: boolean;
  setShowClickOrder: (show: boolean) => void;
  setModalJustOpened: (value: boolean) => void;
  recordingModal?: RecordingModalData | null;
  setRecordingModal?: (data: RecordingModalData | null) => void;
  gazePoints?: GazePointRow[];
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function BlockReportView({
  block,
  blocks,
  responses,
  sessions,
  events,
  prototypes,
  gazePoints = [],
  viewMode,
  cardSortingView,
  setCardSortingView,
  treeTestingView,
  setTreeTestingView,
  heatmapView,
  setHeatmapView,
  heatmapTab,
  setHeatmapTab,
  selectedHeatmapScreen,
  setSelectedHeatmapScreen,
  selectedRespondentScreen,
  setSelectedRespondentScreen,
  respondentHeatmapView,
  setRespondentHeatmapView,
  expandedCategories,
  setExpandedCategories,
  expandedCards,
  setExpandedCards,
  searchCategoryQuery,
  setSearchCategoryQuery,
  searchCardQuery,
  setSearchCardQuery,
  showHiddenCategories,
  setShowHiddenCategories,
  onlyFirstClicks,
  setOnlyFirstClicks,
  showClickOrder,
  setShowClickOrder,
  setModalJustOpened,
  recordingModal,
  setRecordingModal,
  onDeleteResponses
}: BlockReportViewProps) {
  // Вычисляем индекс блока
  const blockIndex = blocks.findIndex(b => b.id === block.id);
  
  // Render based on block type
  switch (block.type) {
    case "open_question":
      return <OpenQuestionView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "scale":
      return <ScaleView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "choice":
      return <ChoiceView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "preference":
      return <PreferenceView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "matrix":
      return <MatrixView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "agreement":
      return <AgreementView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "card_sorting":
      return (
        <CardSortingViewComponent
          block={block}
          blockIndex={blockIndex}
          responses={responses}
          viewMode={viewMode}
          cardSortingView={cardSortingView}
          setCardSortingView={setCardSortingView}
          expandedCategories={expandedCategories}
          setExpandedCategories={setExpandedCategories}
          expandedCards={expandedCards}
          setExpandedCards={setExpandedCards}
          searchCategoryQuery={searchCategoryQuery}
          setSearchCategoryQuery={setSearchCategoryQuery}
          searchCardQuery={searchCardQuery}
          setSearchCardQuery={setSearchCardQuery}
          showHiddenCategories={showHiddenCategories}
          setShowHiddenCategories={setShowHiddenCategories}
          onDeleteResponses={onDeleteResponses}
        />
      );
    case "tree_testing":
      return (
        <TreeTestingView
          block={block}
          blockIndex={blockIndex}
          responses={responses}
          viewMode={viewMode}
          treeTestingView={treeTestingView}
          setTreeTestingView={setTreeTestingView}
          onDeleteResponses={onDeleteResponses}
        />
      );
    case "prototype":
      return (
        <PrototypeView
          block={block}
          blockIndex={blockIndex}
          sessions={sessions}
          events={events}
          prototypes={prototypes}
          viewMode={viewMode}
          heatmapView={heatmapView}
          setHeatmapView={setHeatmapView}
          heatmapTab={heatmapTab}
          setHeatmapTab={setHeatmapTab}
          selectedHeatmapScreen={selectedHeatmapScreen}
          setSelectedHeatmapScreen={setSelectedHeatmapScreen}
          selectedRespondentScreen={selectedRespondentScreen}
          setSelectedRespondentScreen={setSelectedRespondentScreen}
          respondentHeatmapView={respondentHeatmapView}
          setRespondentHeatmapView={setRespondentHeatmapView}
          onlyFirstClicks={onlyFirstClicks}
          setOnlyFirstClicks={setOnlyFirstClicks}
          showClickOrder={showClickOrder}
          setShowClickOrder={setShowClickOrder}
          setModalJustOpened={setModalJustOpened}
          recordingModal={recordingModal ?? null}
          setRecordingModal={setRecordingModal ?? (() => {})}
          gazePoints={gazePoints}
          responses={responses}
          onDeleteResponses={onDeleteResponses}
        />
      );
    case "umux_lite":
      return <UmuxLiteView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "context":
      return <ContextView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "five_seconds":
      return <FiveSecondsView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "first_click":
      return <FirstClickView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    default:
      return (
        <div className="max-w-full">
          <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none" : ""}`}>
            <div className="text-lg font-semibold mb-4">
              {getBlockDisplayName(block)}
            </div>
            <div className="text-muted-foreground">
              Визуализация для этого типа блока пока не реализована.
            </div>
          </Card>
        </div>
      );
  }
}

// Open Question View
interface OpenQuestionViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

// Helper function to format date as "26 янв., 19:53"
function formatResponseDate(date: Date): string {
  const day = date.getDate();
  const monthNames = ["янв.", "фев.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сен.", "окт.", "ноя.", "дек."];
  const month = monthNames[date.getMonth()];
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${day} ${month}, ${hours}:${minutes}`;
}

function OpenQuestionView({ block, blockIndex, responses, viewMode, onDeleteResponses }: OpenQuestionViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  return (
    <div className="max-w-full">
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <CardContent className="p-0">
          {/* Заголовок блока */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
              <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                <IconComponent size={14} className="text-muted-foreground" />
              </div>
              <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
            </div>
            {viewMode === "responses" && onDeleteResponses && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                  onClick={() => onDeleteResponses(block.id)}
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Поля контента */}
          <div className="space-y-3 p-5">
            {imageUrl && (
              <div className="mb-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}

            {/* Results Section - показываем в обоих режимах */}
            <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4">Ответы ({responses.length})</h3>
            <div className="space-y-3">
              {responses.map((response, idx) => {
                const raw = typeof response.answer === "string"
                  ? response.answer
                  : (response.answer as { text?: string } | null)?.text;
                const answerText = (raw != null && String(raw).trim() !== "") ? raw : "—";
                const date = new Date(response.created_at);
                const formattedDate = formatResponseDate(date);
                
                return (
                  <div 
                    key={response.id || idx} 
                    className="p-3 bg-muted/30 border border-border rounded-lg"
                  >
                    <div className="text-xs text-muted-foreground mb-1.5">
                      {formattedDate}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{answerText}</div>
                  </div>
                );
              })}
              {responses.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}
            </div>
          </div>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Scale View
interface ScaleViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ScaleView({ block, blockIndex, responses, viewMode, onDeleteResponses }: ScaleViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  const scaleType = block.config?.scaleType || "numeric";
  const minValue = block.config?.minValue || 1;
  const maxValue = block.config?.maxValue || 5;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Calculate statistics
  const scaleValues: Record<number, number> = {};
  responses.forEach(r => {
    const value = typeof r.answer === "object" ? r.answer?.value : r.answer;
    if (typeof value === "number" && value >= minValue && value <= maxValue) {
      scaleValues[value] = (scaleValues[value] || 0) + 1;
    }
  });

  const totalResponses = responses.length;
  const maxCount = Math.max(...Object.values(scaleValues), 1);

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {imageUrl && (
              <div className="mb-4 px-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            {viewMode === "responses" ? (
              <>
                {totalResponses === 0 ? (
                  <div className="text-center text-muted-foreground py-8">Нет ответов</div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {responses.map((r, idx) => {
                      const value = typeof r.answer === "object" ? r.answer?.value : r.answer;
                      const num = typeof value === "number" && value >= minValue && value <= maxValue ? value : null;
                      return (
                        <div key={r.id || idx}>
                          {num != null ? (
                            <span className="inline-flex items-center justify-center min-w-[48px] h-12 px-4 rounded-lg bg-primary/10 text-primary font-semibold text-lg border border-primary/20">
                              {num}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-4">Результаты</h3>
                {totalResponses === 0 ? (
                  <div className="text-center text-muted-foreground py-8">Нет ответов</div>
                ) : (
                  <div className="space-y-4">
                    {/* Средняя оценка */}
                    {(() => {
                      let sum = 0;
                      let cnt = 0;
                      Object.entries(scaleValues).forEach(([v, c]) => {
                        sum += Number(v) * c;
                        cnt += c;
                      });
                      const avg = cnt > 0 ? sum / cnt : 0;
                      return (
                        <div className="mb-6">
                          <div className="text-sm text-muted-foreground mb-1">Средняя оценка</div>
                          <div className="text-3xl font-bold tabular-nums">{avg.toFixed(1)}</div>
                        </div>
                      );
                    })()}
                    {/* Вертикальные бары: бар, под ним шкала, под ним процент (количество) */}
                    <div className="flex gap-4 items-end justify-start flex-wrap" style={{ minHeight: 160 }}>
                      {Array.from({ length: maxValue - minValue + 1 }, (_, i) => minValue + i).map(value => {
                        const count = scaleValues[value] || 0;
                        const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                        const barHeightPercent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                        return (
                          <div key={value} className="flex flex-col items-center gap-2" style={{ flex: "1 1 0", minWidth: 48 }}>
                            <div className="w-full flex flex-col justify-end rounded-t-md overflow-hidden bg-[var(--color-progress-bg)]" style={{ height: 120 }}>
                              <div
                                className="w-full bg-primary transition-all rounded-t-md"
                                style={{ height: `${barHeightPercent}%`, minHeight: count > 0 ? 4 : 0 }}
                              />
                            </div>
                            <span className="text-sm font-medium">{value}</span>
                            <span className="text-xs text-muted-foreground">
                              {percentage.toFixed(0)}% ({count})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Choice View
interface ChoiceViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ChoiceView({ block, blockIndex, responses, viewMode, onDeleteResponses }: ChoiceViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  const options = block.config?.options || [];
  const allowMultiple = block.config?.allowMultiple || false;
  const allowOther = block.config?.allowOther || false;
  const allowNone = block.config?.allowNone || false;
  const noneText = block.config?.noneText?.trim() || "Ничего из вышеперечисленного";
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Calculate statistics
  const { optionCounts, otherAnswers, noneCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    const others: string[] = [];
    let none = 0;

    responses.forEach(r => {
      const answer = r.answer;
      if (typeof answer === "object") {
        if (answer.selected && Array.isArray(answer.selected)) {
          answer.selected.forEach((opt: string) => {
            counts[opt] = (counts[opt] || 0) + 1;
          });
        }
        if (answer.other) {
          others.push(answer.other);
        }
        if (answer.none === true) {
          none += 1;
        }
      }
    });

    return { optionCounts: counts, otherAnswers: others, noneCount: none };
  }, [responses]);

  const totalResponses = responses.length;
  const maxCount = Math.max(...Object.values(optionCounts), noneCount, 1);

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
            {imageUrl && (
              <div className="mb-4 px-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4">Результаты</h3>
            <div className="space-y-4">
              {options.map((option: string, idx: number) => {
                const count = optionCounts[option] || 0;
                const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                
                return (
                  <div key={`option-${block.id}-${idx}-${option}`} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{option}</span>
                      <span className="text-muted-foreground">
                        ответы {count}
                      </span>
                    </div>
                    <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              
              {allowNone && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{noneText}</span>
                    <span className="text-muted-foreground">
                      ответы {noneCount}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all"
                      style={{ width: totalResponses > 0 ? `${(noneCount / totalResponses) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              )}
              
              {allowOther && otherAnswers.length > 0 && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-sm font-semibold mb-3">Другое ({otherAnswers.length})</h4>
                  <div className="space-y-2">
                    {otherAnswers.map((answer, idx) => (
                      <div key={`other-${block.id}-${idx}-${answer}`} className="text-sm text-muted-foreground">
                        • {answer}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {totalResponses === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Preference Summary Row (сводный: картинка + прогресс-бар + % в одну строку, клик по картинке — модалка)
function PreferenceSummaryRow({
  imageUrl,
  letter,
  percentage,
  count
}: { imageUrl: string; letter: string; percentage: number; count: number }) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-4 w-full">
        {imageUrl && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-border hover:opacity-90 transition-opacity"
          >
            <img src={imageUrl} alt={letter} className="w-full h-full object-cover" />
          </button>
        )}
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">{letter}</span>
        <div className="flex-1 min-w-0 bg-[var(--color-progress-bg)] rounded-full h-2 overflow-hidden">
          <div className="bg-primary h-full transition-all" style={{ width: `${percentage}%` }} />
        </div>
        <span className="flex-shrink-0 text-sm text-muted-foreground">{percentage.toFixed(0)}% ({count})</span>
      </div>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">Просмотр варианта {letter}</DialogTitle>
          <img src={imageUrl} alt={letter} className="w-full h-auto max-h-[80vh] object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

// Preference Respondent Answers (только вопрос + превью выбранного, клик — модалка)
function PreferenceRespondentAnswers({
  question,
  responses,
  optionImages
}: { question: string; responses: StudyBlockResponse[]; optionImages: string[] }) {
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {responses.map((r, idx) => {
        const answer = r.answer;
        const selectedIdx = typeof answer === "object" && answer.selectedIndex !== undefined ? answer.selectedIndex : null;
        const raw = selectedIdx != null ? optionImages[selectedIdx] : null;
        const imgUrl = raw != null ? (typeof raw === "string" ? raw : (raw as { url?: string })?.url) : null;
        const letter = selectedIdx != null ? String.fromCharCode(65 + selectedIdx) : "—";
        return (
          <div key={r.id || idx} className="flex items-center gap-3">
            {imgUrl ? (
              <button
                type="button"
                onClick={() => setModalImageUrl(imgUrl)}
                className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border hover:opacity-90 transition-opacity"
              >
                <img src={imgUrl} alt={letter} className="w-full h-full object-cover" />
              </button>
            ) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
          </div>
        );
      })}
      <Dialog open={!!modalImageUrl} onOpenChange={(open) => !open && setModalImageUrl(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">Просмотр выбранного варианта</DialogTitle>
          {modalImageUrl && <img src={modalImageUrl} alt="" className="w-full h-auto max-h-[80vh] object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Preference View
interface PreferenceViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function PreferenceView({ block, blockIndex, responses, viewMode, onDeleteResponses }: PreferenceViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  // Используем images из конфига (как в PreferenceBlock)
  const images = block.config?.images || [];
  const options = block.config?.options || [];
  const optionImages = block.config?.optionImages || images; // Fallback на images если optionImages нет
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Calculate statistics
  const optionCounts = useMemo(() => {
    const counts: Record<number, number> = {};

    responses.forEach(r => {
      const answer = r.answer;
      if (typeof answer === "object") {
        if (answer.selectedIndex !== undefined) {
          const idx = answer.selectedIndex;
          counts[idx] = (counts[idx] || 0) + 1;
        } else if (answer.wins && typeof answer.wins === "object") {
          // For pairwise comparison, count wins
          Object.entries(answer.wins).forEach(([idx, wins]) => {
            counts[parseInt(idx)] = (counts[parseInt(idx)] || 0) + (wins as number);
          });
        }
      }
    });

    return counts;
  }, [responses]);

  const totalResponses = responses.length;
  const maxCount = Math.max(...Object.values(optionCounts), 1);

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
            {imageUrl && (
              <div className="mb-4 px-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>

          {/* Results Section */}
          {(viewMode === "summary" || viewMode === "responses") && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold mb-4">Результаты</h3>
              {viewMode === "responses" ? (
                /* Ответы респондента: только вопрос + превью выбранного */
                responses.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">Нет ответов</div>
                ) : (
                  <PreferenceRespondentAnswers
                    question={question}
                    responses={responses}
                    optionImages={optionImages.length > 0 ? optionImages : images}
                  />
                )
              ) : (
                /* Сводный: горизонтально картинка + прогресс-бар + % */
                <div className="space-y-4">
                  {(optionImages.length > 0 ? optionImages : images).map((img: string | { url?: string }, idx: number) => {
                    const imgUrl = typeof img === "string" ? img : img?.url || "";
                    const count = optionCounts[idx] || 0;
                    const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                    const letter = String.fromCharCode(65 + idx);
                    return (
                      <PreferenceSummaryRow
                        key={`pref-${block.id}-${idx}-${imgUrl}`}
                        imageUrl={imgUrl}
                        letter={letter}
                        percentage={percentage}
                        count={count}
                      />
                    );
                  })}
                
                {(optionImages.length === 0 && images.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    Нет изображений для отображения
                  </div>
                )}
                {totalResponses === 0 && (optionImages.length > 0 || images.length > 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    Нет ответов
                  </div>
                )}
              </div>
            )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Matrix View
interface MatrixViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function MatrixView({ block, blockIndex, responses, viewMode, onDeleteResponses }: MatrixViewProps) {
  const question = block.config?.question || "Вопрос";
  const description = block.config?.description;
  const imageUrl = block.config?.imageUrl;
  const rows = block.config?.rows || [];
  const columns = block.config?.columns || [];
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Подсчитываем количество выборов для каждой пары (rowId, columnId)
  const cellCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    
    responses.forEach(r => {
      const answer = r.answer;
      if (typeof answer === "object" && answer.selections) {
        Object.entries(answer.selections).forEach(([rowId, columnIds]) => {
          if (Array.isArray(columnIds)) {
            if (!counts[rowId]) {
              counts[rowId] = {};
            }
            columnIds.forEach((columnId: string) => {
              counts[rowId][columnId] = (counts[rowId][columnId] || 0) + 1;
            });
          }
        });
      }
    });
    
    return counts;
  }, [responses, rows, columns]);

  const totalResponses = responses.length;

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
            {description && (
              <p className="text-sm text-muted-foreground px-4 pb-3">{description}</p>
            )}
            {imageUrl && (
              <div className="mb-4 px-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>

          {/* Results Section - Matrix View */}
          {(viewMode === "summary" || viewMode === "responses") && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold mb-4">Результаты</h3>
              {rows.length > 0 && columns.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="border border-border p-2 text-left font-medium"></th>
                        {columns.map((column: any, idx: number) => (
                          <th key={`col-header-${block.id}-${idx}-${column.id}`} className="border border-border p-2 text-center font-medium">
                            {column.title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any, rowIdx: number) => (
                        <tr key={`row-${block.id}-${rowIdx}-${row.id}`}>
                          <td className="border border-border p-2 font-medium">{row.title}</td>
                          {columns.map((column: any, colIdx: number) => {
                            const count = cellCounts[row.id]?.[column.id] || 0;
                            const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                            return (
                              <td key={`cell-${block.id}-${rowIdx}-${colIdx}-${row.id}-${column.id}`} className="border border-border p-2 text-center">
                                {count > 0 ? (
                                  viewMode === "responses" ? (
                                    <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-green-100 text-green-800">
                                      <Check className="h-4 w-4" />
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center justify-center px-2 py-1 rounded text-sm font-medium" style={{ 
                                      background: `color-mix(in srgb, ${chartColors.accent} 10%, transparent)`, 
                                      color: chartColors.accent 
                                    }}>
                                      {percentage.toFixed(0)}% ({count})
                                    </div>
                                  )
                                ) : (
                                  <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-muted"></div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Нет данных для отображения
                </div>
              )}
              
              {totalResponses === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Agreement View
interface AgreementViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function AgreementView({ block, blockIndex, responses, viewMode, onDeleteResponses }: AgreementViewProps) {
  const title = block.config?.title || "Соглашение";
  const agreementType = block.config?.agreementType || "standard";
  const customPdfUrl = block.config?.customPdfUrl;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Подсчет статистики
  const totalResponses = responses.length;
  const acceptedCount = responses.filter(r => {
    const answer = r.answer;
    return typeof answer === "object" && answer.accepted === true;
  }).length;
  const notAcceptedCount = totalResponses - acceptedCount;
  const acceptanceRate = totalResponses > 0 ? (acceptedCount / totalResponses) * 100 : 0;

  // Используем существующую функцию formatResponseDate для единообразия

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{title}</p>
            <div className="text-sm text-muted-foreground mb-2">
              Тип: {agreementType === "standard" ? "Стандартное соглашение" : "Пользовательское соглашение"}
            </div>
            {agreementType === "custom" && customPdfUrl && (
              <div className="mb-4">
                <a
                  href={customPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Открыть PDF соглашения
                </a>
              </div>
            )}
          </div>

          {/* Results Section */}
          {(viewMode === "summary" || viewMode === "responses") && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold mb-4">Результаты</h3>
              
              {totalResponses > 0 ? (
                <>
                  {/* Статистика */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 border border-border rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Всего ответов</div>
                      <div className="text-2xl font-semibold">{totalResponses}</div>
                    </div>
                    <div className="p-4 border border-border rounded-lg bg-success-bg">
                      <div className="text-sm text-[var(--color-success-on-bg)] mb-1">Принято</div>
                      <div className="text-2xl font-semibold text-[var(--color-success-on-bg)]">{acceptedCount}</div>
                      <div className="text-xs text-[var(--color-success-on-bg)]/80 mt-1">
                        {acceptanceRate.toFixed(1)}%
                      </div>
                    </div>
                    {notAcceptedCount > 0 && (
                      <div className="p-4 border border-border rounded-lg bg-destructive-bg">
                        <div className="text-sm text-foreground mb-1">Не принято</div>
                        <div className="text-2xl font-semibold text-foreground">
                          {notAcceptedCount}
                        </div>
                        <div className="text-xs text-foreground/80 mt-1">
                          {((notAcceptedCount / totalResponses) * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Таблица по респондентам */}
                  {viewMode === "responses" && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="border border-border p-2 text-left font-medium">Дата</th>
                            <th className="border border-border p-2 text-center font-medium">Статус</th>
                            <th className="border border-border p-2 text-center font-medium">Время принятия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {responses.map((response, idx) => {
                            const answer = response.answer;
                            const accepted = typeof answer === "object" && answer.accepted === true;
                            const acceptedAt = typeof answer === "object" && answer.acceptedAt 
                              ? formatResponseDate(new Date(answer.acceptedAt))
                              : "-";
                            const responseDate = formatResponseDate(new Date(response.created_at));

                            return (
                              <tr key={response.id || idx}>
                                <td className="border border-border p-2">{responseDate}</td>
                                <td className="border border-border p-2 text-center">
                                  {accepted ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded bg-success-bg text-[var(--color-success-on-bg)] text-sm font-medium">
                                      Принято
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded bg-destructive-bg text-[var(--color-destructive-on-bg)] text-sm font-medium">
                                      Не принято
                                    </span>
                                  )}
                                </td>
                                <td className="border border-border p-2 text-center text-sm text-muted-foreground">
                                  {acceptedAt}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Card Sorting View
interface CardSortingViewComponentProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  cardSortingView: CardSortingView;
  setCardSortingView: (view: CardSortingView) => void;
  expandedCategories: Set<string>;
  setExpandedCategories: (set: Set<string>) => void;
  expandedCards: Set<string>;
  setExpandedCards: (set: Set<string>) => void;
  searchCategoryQuery: string;
  setSearchCategoryQuery: (query: string) => void;
  searchCardQuery: string;
  setSearchCardQuery: (query: string) => void;
  showHiddenCategories: boolean;
  setShowHiddenCategories: (show: boolean) => void;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function CardSortingViewComponent({
  block,
  blockIndex,
  responses,
  viewMode,
  cardSortingView,
  setCardSortingView,
  expandedCategories,
  setExpandedCategories,
  expandedCards,
  setExpandedCards,
  searchCategoryQuery,
  setSearchCategoryQuery,
  searchCardQuery,
  setSearchCardQuery,
  showHiddenCategories,
  setShowHiddenCategories,
  onDeleteResponses
}: CardSortingViewComponentProps) {
  const task = block.config?.task || "Задание";
  const cards = block.config?.cards || [];
  const categories = block.config?.categories || [];
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Helper function to get card identifier (string) from card object or string
  // ВАЖНО: Карточки сохраняются по title, поэтому используем title для сопоставления
  const getCardId = (card: any): string => {
    if (typeof card === "string") return card;
    if (typeof card === "object" && card !== null) {
      // Card can be {id, title, imageUrl, description} or {value, ...}
      // Приоритет: title (так как сохраняется по title), затем id, value
      return card.title || card.id || card.value || String(card);
    }
    return String(card);
  };

  // Helper function to get card display name
  const getCardName = (card: any): string => {
    if (typeof card === "string") return card;
    if (typeof card === "object" && card !== null) {
      return card.title || card.value || card.id || String(card);
    }
    return String(card);
  };

  // Функция для поиска карточки по title (так как в ответах карточки сохраняются как строки title)
  const findCardByTitle = (title: string): any => {
    return cards.find((c: any) => {
      const cardTitle = typeof c === "string" ? c : (c.title || c.value || c.id || String(c));
      return cardTitle === title;
    });
  };

  // Process responses
  const categoryCardMap: Record<string, Record<string, number>> = {};
  const cardCategoryMap: Record<string, Record<string, number>> = {};
  const unsortedCardMap: Record<string, number> = {}; // Карточки, которые не отсортированы

  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object" && answer.categories) {
      // Собираем все карточки, которые отсортированы в категории
      // В ответах карточки приходят как строки (title), поэтому используем title как ключ
      const sortedCardTitles = new Set<string>();
      
      Object.entries(answer.categories).forEach(([catName, cardList]) => {
        const cardArray = Array.isArray(cardList) ? cardList : [];
        if (!categoryCardMap[catName]) categoryCardMap[catName] = {};
        cardArray.forEach((cardTitle: any) => {
          // cardTitle - это строка (title карточки) из ответа
          const title = typeof cardTitle === "string" ? cardTitle : String(cardTitle);
          sortedCardTitles.add(title);
          categoryCardMap[catName][title] = (categoryCardMap[catName][title] || 0) + 1;
          
          if (!cardCategoryMap[title]) cardCategoryMap[title] = {};
          cardCategoryMap[title][catName] = (cardCategoryMap[title][catName] || 0) + 1;
        });
      });
      
      // Определяем неотсортированные карточки
      // Сравниваем title карточек из конфига с отсортированными title
      const allCardTitles = new Set(cards.map((c: any) => {
        const cardTitle: string = typeof c === "string" ? c : (c.title || c.value || c.id || String(c));
        return cardTitle;
      }));
      
      (Array.from(allCardTitles) as string[]).forEach((cardTitle) => {
        if (!sortedCardTitles.has(cardTitle)) {
          unsortedCardMap[cardTitle] = (unsortedCardMap[cardTitle] || 0) + 1;
        }
      });
      
      // Также проверяем unsortedCount из ответа
      if (typeof answer.unsortedCount === "number" && answer.unsortedCount > 0) {
        // Если есть unsortedCount, но мы не знаем какие именно карточки - помечаем все как потенциально неотсортированные
        // В этом случае мы не можем точно определить, но можем показать колонку
      }
    }
  });

  const totalResponses = responses.length;
  const hasUnsorted = Object.keys(unsortedCardMap).length > 0 || responses.some(r => {
    const answer = r.answer;
    return typeof answer === "object" && typeof answer.unsortedCount === "number" && answer.unsortedCount > 0;
  });

  // Matrix view
  const renderMatrixView = () => {
    const configCategoryNames = categories.map((c: any) =>
      typeof c === "string" ? c : (c.name || c)
    );
    const responseCategoryNames = Object.keys(categoryCardMap);
    // В режиме "ответы" всегда показываем все категории из конфига (включая пустые колонки)
    const categoryNames =
      viewMode === "responses"
        ? [
            ...configCategoryNames,
            ...responseCategoryNames.filter((c: string) => !configCategoryNames.includes(c))
          ]
        : responseCategoryNames.length > 0
          ? responseCategoryNames
          : configCategoryNames;

    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-border p-2 text-left"></th>
                {categoryNames.map((cat: string, idx: number) => (
                  <th key={`cat-header-${block.id}-${idx}-${cat}`} className="border border-border p-2 text-center font-medium">
                    {cat}
                  </th>
                ))}
                {hasUnsorted && (
                  <th className="border border-border p-2 text-center font-medium">
                    Неотсортированные
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {cards.map((card: any, cardIdx: number) => {
                const cardTitle = typeof card === "string" ? card : (card.title || card.value || card.id || String(card));
                const cardName = getCardName(card);
                return (
                  <tr key={cardIdx}>
                    <td className="border border-border p-2 font-medium">{cardName}</td>
                    {categoryNames.map((cat: string, catIdx: number) => {
                      const count = categoryCardMap[cat]?.[cardTitle] || 0;
                      const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                      return (
                        <td key={`cell-${block.id}-${cardIdx}-${catIdx}-${cat}`} className="border border-border p-2 text-center">
                          {count > 0 ? (
                            viewMode === "responses" ? (
                              <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-green-100 text-green-800">
                                <Check className="h-4 w-4" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center px-2 py-1 rounded bg-green-100 text-green-800 text-sm font-medium">
                                {percentage.toFixed(0)}%
                              </div>
                            )
                          ) : (
                            <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-muted"></div>
                          )}
                        </td>
                      );
                    })}
                    {hasUnsorted && (
                      <td className="border border-border p-2 text-center">
                        {(() => {
                          const unsortedCount = unsortedCardMap[cardTitle] || 0;
                          const unsortedPercentage = totalResponses > 0 ? (unsortedCount / totalResponses) * 100 : 0;
                          return unsortedCount > 0 ? (
                            viewMode === "responses" ? (
                              <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-green-100 text-green-800">
                                <Check className="h-4 w-4" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center px-2 py-1 rounded bg-green-100 text-green-800 text-sm font-medium">
                                {unsortedPercentage.toFixed(0)}%
                              </div>
                            )
                          ) : (
                            <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-muted"></div>
                          );
                        })()}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Categories view
  const renderCategoriesView = () => {
    const categoryNames = Object.keys(categoryCardMap).length > 0 
      ? Object.keys(categoryCardMap) 
      : categories.map((c: any) => c.name || c);
    
    const filteredCategories = categoryNames.filter((cat: string) => {
      if (searchCategoryQuery) {
        return cat.toLowerCase().includes(searchCategoryQuery.toLowerCase());
      }
      return true;
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск категорий"
              value={searchCategoryQuery}
              onChange={(e) => setSearchCategoryQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-hidden"
              checked={showHiddenCategories}
              onCheckedChange={(checked) => setShowHiddenCategories(checked === true)}
            />
            <Label htmlFor="show-hidden" className="text-sm">Показать скрытые</Label>
          </div>
        </div>

        <div className="space-y-2">
          {filteredCategories.map((cat: string, idx: number) => {
            const cardsInCategory = Object.keys(categoryCardMap[cat] || {});
            const isExpanded = expandedCategories.has(cat);
            
            return (
              <div key={`category-${cat}-${idx}`} className="border border-border rounded-lg">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const newSet = new Set(expandedCategories);
                    if (newSet.has(cat)) {
                      newSet.delete(cat);
                    } else {
                      newSet.add(cat);
                    }
                    setExpandedCategories(newSet);
                  }}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-base">{cat}</span>
                    <span className="text-sm text-muted-foreground">
                      ({cardsInCategory.length} карточки)
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {isExpanded && cardsInCategory.length > 0 && (
                  <div className="p-3 pt-0 space-y-3">
                    {cardsInCategory.map((cardTitle, cardIdx) => {
                      const count = categoryCardMap[cat][cardTitle];
                      const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                      // Find original card by title (так как в ответах карточки сохраняются по title)
                      const originalCard = findCardByTitle(cardTitle);
                      const cardName = originalCard ? getCardName(originalCard) : cardTitle;
                      return (
                        <div key={`card-in-cat-${block.id}-${cat}-${cardIdx}-${cardTitle}`} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{cardName}</span>
                            <span className="text-sm text-muted-foreground">
                              {percentage.toFixed(0)}% ({count})
                            </span>
                          </div>
                          <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-success h-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Cards view
  const renderCardsView = () => {
    // Используем title как ключ, так как карточки сохраняются по title
    const allCards = cards.map((c: any) => {
      const cardTitle = typeof c === "string" ? c : (c.title || c.value || c.id || String(c));
      return {
        original: c,
        title: cardTitle, // Используем title как ключ
        name: getCardName(c)
      };
    });
    const filteredCards = allCards.filter((card: { original: any; title: string; name: string }) => {
      if (searchCardQuery) {
        return card.name.toLowerCase().includes(searchCardQuery.toLowerCase());
      }
      return true;
    });

    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск карточек"
            value={searchCardQuery}
            onChange={(e) => setSearchCardQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="space-y-4">
          {filteredCards.map((card: { original: any; title: string; name: string }, idx: number) => {
            const categoriesForCard = cardCategoryMap[card.title] || {}; // Используем title как ключ
            const totalCount = Object.values(categoriesForCard).reduce((sum: number, count: number) => sum + count, 0);
            const isExpanded = expandedCards.has(card.title);
            
            // Сортируем категории по количеству (от большего к меньшему)
            const sortedCategories = Object.entries(categoriesForCard)
              .sort((a, b) => (b[1] as number) - (a[1] as number));
            
            const categoryCount = sortedCategories.length;
            const categoryLabel = categoryCount === 0
              ? "нет категорий"
              : categoryCount === 1
                ? "1 категория"
                : categoryCount >= 2 && categoryCount <= 4
                  ? `${categoryCount} категории`
                  : `${categoryCount} категорий`;

            return (
              <div key={`card-view-${block.id}-${idx}-${card.title}`} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-semibold">{card.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground font-normal">{categoryLabel}</span>
                    <button
                    onClick={() => {
                      const newSet = new Set(expandedCards);
                      if (isExpanded) {
                        newSet.delete(card.title);
                      } else {
                        newSet.add(card.title);
                      }
                      setExpandedCards(newSet);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  </span>
                </div>
                
                {isExpanded && (
                  <div className="space-y-3">
                    {sortedCategories.map(([cat, count]) => {
                      const percentage = totalResponses > 0 ? ((count as number) / totalResponses) * 100 : 0;
                      return (
                        <div key={cat} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{cat}</span>
                            <span className="text-muted-foreground">
                              {percentage.toFixed(0)}% ({count})
                            </span>
                          </div>
                          <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-4 overflow-hidden relative">
                            <div
                              className="bg-success h-full transition-all flex items-center justify-start px-2"
                              style={{ width: `${percentage}%`, minWidth: percentage > 0 ? '20px' : '0' }}
                            >
                              {percentage > 5 && (
                                <span className="text-xs text-white font-medium whitespace-nowrap">{cat}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {sortedCategories.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-2">
                        Карточка не была отсортирована
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Task Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{task}</p>
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            {/* В режиме "ответы" показываем только матрицу, без вкладок */}
            {viewMode === "responses" ? (
              renderMatrixView()
            ) : (
              <>
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setCardSortingView("matrix")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                      cardSortingView === "matrix"
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Матрица
                  </button>
                  <button
                    onClick={() => setCardSortingView("categories")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                      cardSortingView === "categories"
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Категории
                  </button>
                  <button
                    onClick={() => setCardSortingView("cards")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                      cardSortingView === "cards"
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Карточки
                  </button>
                </div>

                {cardSortingView === "matrix" && renderMatrixView()}
                {cardSortingView === "categories" && renderCategoriesView()}
                {cardSortingView === "cards" && renderCardsView()}
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Tree Testing Respondent Table (путь, длительность, клики — без прогресс-бара)
function TreeTestingRespondentTable({
  question,
  responses
}: { question: string; responses: StudyBlockResponse[] }) {
  return (
    <div className="space-y-4">
      {responses.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Нет ответов</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-border p-2 text-left font-medium">Путь</th>
                <th className="border border-border p-2 text-left font-medium">Длительность, с</th>
                <th className="border border-border p-2 text-left font-medium">Клики</th>
              </tr>
            </thead>
            <tbody>
              {responses.map((r, idx) => {
                const answer = r.answer;
                const clickHistoryNames = (typeof answer === "object" && answer.clickHistoryNames && Array.isArray(answer.clickHistoryNames)) 
                  ? answer.clickHistoryNames as string[] 
                  : [];
                const pathNames = (typeof answer === "object" && answer.pathNames && Array.isArray(answer.pathNames)) 
                  ? answer.pathNames as string[] 
                  : [];
                const pathText = clickHistoryNames.length > 0 
                  ? clickHistoryNames.join(" › ") 
                  : pathNames.join(" › ") || (typeof answer === "object" && (answer as { dontKnow?: boolean }).dontKnow ? "Не знаю" : "—");
                const durationSec = r.duration_ms != null ? (r.duration_ms / 1000).toFixed(1) : "—";
                const clickHistory = (typeof answer === "object" && answer.clickHistory && Array.isArray(answer.clickHistory)) 
                  ? answer.clickHistory as unknown[] 
                  : [];
                const clicks = clickHistory.length > 0 ? clickHistory.length : pathNames.length;
                return (
                  <tr key={r.id || idx}>
                    <td className="border border-border p-2">
                      <div className="flex items-center gap-2 text-sm">
                        {(typeof answer === "object" && (answer as { isCorrect?: boolean }).isCorrect) && (
                          <CircleCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                        )}
                        <span>{pathText || (answer?.dontKnow ? "Не знаю" : "—")}</span>
                      </div>
                    </td>
                    <td className="border border-border p-2 text-sm">{durationSec}</td>
                    <td className="border border-border p-2 text-sm">{clicks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Tree Testing View
interface TreeTestingViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  treeTestingView: TreeTestingView;
  setTreeTestingView: (view: TreeTestingView) => void;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function TreeTestingView({
  block,
  blockIndex,
  responses,
  viewMode,
  treeTestingView,
  setTreeTestingView,
  onDeleteResponses
}: TreeTestingViewProps) {
  const question = block.config?.question || block.config?.task || "Вопрос";
  const correctAnswers = block.config?.correctAnswers || block.config?.correctPath || [];
  const tree = block.config?.tree || [];
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  const findPathToNode = (nodes: { id: string; name: string; children?: unknown[] }[], targetId: string, currentPath: string[] = []): string[] | null => {
    for (const node of nodes) {
      const newPath = [...currentPath, node.id];
      if (node.id === targetId) return newPath;
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        const found = findPathToNode(node.children as { id: string; name: string; children?: unknown[] }[], targetId, newPath);
        if (found) return found;
      }
    }
    return null;
  };
  const correctFirstClickIds = new Set<string>();
  correctAnswers.forEach((correctId: string) => {
    const path = findPathToNode(tree as { id: string; name: string; children?: unknown[] }[], correctId);
    if (path && path.length >= 1) correctFirstClickIds.add(path[0]);
  });

  // Calculate metrics
  let successCount = 0;
  let directnessCount = 0;
  const pathTimes: number[] = [];
  const paths: Array<{ path: string[]; count: number; isCorrect: boolean }> = [];
  const firstClicks: Array<{ path: string[]; count: number; isCorrect: boolean }> = [];
  const finalPoints: Array<{ path: string[]; count: number; isCorrect: boolean; isUnsuccessful?: boolean }> = [];

  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object") {
      if (answer.isCorrect) successCount++;
      if (answer.isDirect) directnessCount++;
      
      // Получаем duration_ms из ответа или вычисляем из created_at
      if (answer.duration_ms && typeof answer.duration_ms === "number") {
        pathTimes.push(answer.duration_ms);
      } else if (r.duration_ms && typeof r.duration_ms === "number") {
        // Если duration_ms в самом response
        pathTimes.push(r.duration_ms);
      } else if (r.created_at) {
        // Если duration_ms нет, пытаемся вычислить из времени создания (но это не очень точно)
        // Для точности лучше использовать duration_ms из ответа
        // Пока пропускаем такие случаи
      }
      
      const clickHistoryNames = (typeof answer === "object" && answer.clickHistoryNames && Array.isArray(answer.clickHistoryNames)) 
        ? answer.clickHistoryNames as string[] 
        : [];
      const pathNames = (typeof answer === "object" && answer.pathNames && Array.isArray(answer.pathNames)) 
        ? answer.pathNames as string[] 
        : [];
      const pathArray = clickHistoryNames.length > 0 ? clickHistoryNames : pathNames;
      
      // Самые частые пути — полный путь (история кликов) или путь к финалу
      if (pathArray.length > 0) {
        const pathStr = pathArray.join(" › ");
        const existing = paths.find(p => p.path.join(" › ") === pathStr);
        if (existing) {
          existing.count++;
        } else {
          paths.push({
            path: pathArray,
            count: 1,
            isCorrect: answer.isCorrect || false
          });
        }
      }
      
      // Первый клик — первый узел, по которому кликнул пользователь (из истории)
      const clickHistoryIds = (typeof answer === "object" && answer.clickHistory && Array.isArray(answer.clickHistory)) 
        ? answer.clickHistory as string[] 
        : [];
      if (pathArray.length > 0) {
        const firstClickPath = [pathArray[0]];
        const firstClickStr = firstClickPath.join(" › ");
        const existingFirstClick = firstClicks.find(fc => fc.path.join(" › ") === firstClickStr);
        if (existingFirstClick) {
          existingFirstClick.count++;
        } else {
          const firstClickId = clickHistoryIds[0];
          const isCorrect = correctFirstClickIds.size > 0 && firstClickId != null && correctFirstClickIds.has(firstClickId);
          firstClicks.push({
            path: firstClickPath,
            count: 1,
            isCorrect
          });
        }
      }
      
      // Финальная точка — путь к финальному узлу (pathNames)
      if (pathNames.length > 0) {
        const finalPointPath = pathNames;
        const finalPointStr = finalPointPath.join(" › ");
        const existingFinalPoint = finalPoints.find(fp => fp.path.join(" › ") === finalPointStr);
        if (existingFinalPoint) {
          existingFinalPoint.count++;
        } else {
          // Проверяем, был ли ответ "не знаю" (isCorrect === false и возможно есть флаг)
          const isUnsuccessful = !answer.isCorrect && (answer.dontKnow === true || answer.isUnsuccessful === true);
          finalPoints.push({
            path: finalPointPath,
            count: 1,
            isCorrect: answer.isCorrect || false,
            isUnsuccessful
          });
        }
      } else if (answer.dontKnow === true || answer.isUnsuccessful === true) {
        // Если нет пути, но есть флаг "не знаю" - добавляем в категорию "Неуспешно"
        const existingUnsuccessful = finalPoints.find(fp => fp.isUnsuccessful && fp.path.length === 0);
        if (existingUnsuccessful) {
          existingUnsuccessful.count++;
        } else {
          finalPoints.push({
            path: [],
            count: 1,
            isCorrect: false,
            isUnsuccessful: true
          });
        }
      }
    }
  });

  const totalResponses = responses.length;
  const successRate = totalResponses > 0 ? (successCount / totalResponses) * 100 : 0;
  const directnessRate = totalResponses > 0 ? (directnessCount / totalResponses) * 100 : 0;
  const avgTime = pathTimes.length > 0 
    ? pathTimes.reduce((a, b) => a + b, 0) / pathTimes.length / 1000 
    : 0;
  const medianTime = pathTimes.length > 0
    ? [...pathTimes].sort((a, b) => a - b)[Math.floor(pathTimes.length / 2)] / 1000
    : 0;

  const sortedPaths = [...paths].sort((a, b) => b.count - a.count);
  const sortedFirstClicks = [...firstClicks].sort((a, b) => b.count - a.count);
  const sortedFinalPoints = [...finalPoints].sort((a, b) => b.count - a.count);

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            {viewMode === "responses" ? (
              /* Ответы респондента: вопрос + таблица (путь, длительность, клики) */
              <TreeTestingRespondentTable
                question={question}
                responses={responses}
              />
            ) : (
              <>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setTreeTestingView("common_paths")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  treeTestingView === "common_paths"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Самые частые пути
              </button>
              <button
                onClick={() => setTreeTestingView("first_clicks")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  treeTestingView === "first_clicks"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Первые клики
              </button>
              <button
                onClick={() => setTreeTestingView("final_points")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  treeTestingView === "final_points"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Финальные точки
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Процент успеха</div>
            <div className="text-2xl font-bold">{successRate.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              Прямота
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-64">
                    Измерять, насколько эффективно респонденты добирались до цели. Больше процент означает, что респонденты сделали меньше ненужных шагов
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-2xl font-bold">{directnessRate.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Среднее время</div>
            <div className="text-2xl font-bold">{avgTime.toFixed(2)} с</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Медианное время</div>
            <div className="text-2xl font-bold">{medianTime.toFixed(2)} с</div>
          </div>
        </div>

        <div className="space-y-4">
              {(() => {
                const data = treeTestingView === "common_paths" ? sortedPaths 
                  : treeTestingView === "first_clicks" ? sortedFirstClicks 
                  : sortedFinalPoints;
                return data.map((pathData: { path: string[]; count: number; isCorrect?: boolean; isUnsuccessful?: boolean }, idx: number) => {
                  const percentage = totalResponses > 0 ? (pathData.count / totalResponses) * 100 : 0;
                  const pathText = pathData.path.length > 0 ? pathData.path.join(" › ") : (pathData as { isUnsuccessful?: boolean }).isUnsuccessful ? "Неуспешно" : "—";
                  return (
                    <div key={`${treeTestingView}-${block.id}-${idx}-${pathText}`} className="space-y-2">
                      <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-2 overflow-hidden">
                        <div
                          className={`${pathData.isCorrect ? "bg-success" : (pathData as { isUnsuccessful?: boolean }).isUnsuccessful ? "bg-destructive/50" : "bg-primary"} h-full transition-all`}
                          style={{ 
                            width: `${Math.max(percentage, 0)}%`, 
                            minWidth: percentage > 0 ? '2px' : '0'
                          }}
                        />
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            {pathData.isCorrect && (
                              <CircleCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                            )}
                            <span className="font-medium text-sm">{pathText}</span>
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {percentage.toFixed(0)}% ({pathData.count})
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}

          {totalResponses === 0 && (
            <div className="text-center text-muted-foreground py-8">
              Нет ответов
            </div>
          )}
        </div>
            </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// UMUX Lite View
interface UmuxLiteViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function UmuxLiteView({ block, blockIndex, responses, viewMode, onDeleteResponses }: UmuxLiteViewProps) {
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;
  // Calculate statistics
  const scores: number[] = [];
  const susScores: number[] = [];
  const feedbacks: string[] = [];

  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object") {
      if (typeof answer.umux_lite_score === "number") {
        scores.push(answer.umux_lite_score);
      }
      if (typeof answer.sus_score === "number") {
        susScores.push(answer.sus_score);
      }
      if (typeof answer.feedback === "string" && answer.feedback.trim()) {
        feedbacks.push(answer.feedback);
      }
    }
  });

  const totalResponses = responses.length;
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const avgSusScore = susScores.length > 0 ? susScores.reduce((a, b) => a + b, 0) / susScores.length : 0;
  const medianScore = scores.length > 0
    ? [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)]
    : 0;

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3 text-muted-foreground">
              Метрика удобства использования интерфейса
            </p>
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4">Результаты</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Средний UMUX Lite</div>
            <div className="text-2xl font-bold">{avgScore.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Медианный UMUX Lite</div>
            <div className="text-2xl font-bold">{medianScore.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Средний SUS Score</div>
            <div className="text-2xl font-bold">{avgSusScore.toFixed(1)}</div>
          </div>
        </div>

        {/* Individual Results */}
        <div className="border-t border-border pt-6 mt-6">
          <h3 className="text-lg font-semibold mb-4">Результаты по респондентам</h3>
          <div className="space-y-3">
            {responses.map((response, idx) => {
              const answer = response.answer;
              const umuxScore = typeof answer === "object" && typeof answer.umux_lite_score === "number" 
                ? answer.umux_lite_score 
                : null;
              const susScore = typeof answer === "object" && typeof answer.sus_score === "number"
                ? answer.sus_score
                : null;
              const feedback = typeof answer === "object" && typeof answer.feedback === "string"
                ? answer.feedback
                : null;
              const date = new Date(response.created_at);
              const formattedDate = formatResponseDate(date);
              
              return (
                <div key={response.id || idx} className="p-4 bg-muted/30 border border-border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-xs text-muted-foreground">{formattedDate}</div>
                    <div className="flex gap-4 text-sm">
                      {umuxScore !== null && (
                        <div>
                          <span className="text-muted-foreground">UMUX Lite: </span>
                          <span className="font-medium">{umuxScore.toFixed(1)}</span>
                        </div>
                      )}
                      {susScore !== null && (
                        <div>
                          <span className="text-muted-foreground">SUS Score: </span>
                          <span className="font-medium">{susScore.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {feedback && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      <span className="font-medium">Отзыв: </span>
                      {feedback}
                    </div>
                  )}
                </div>
              );
            })}
            {responses.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                Нет ответов
              </div>
            )}
          </div>
        </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Context View
interface ContextViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ContextView({ block, blockIndex, responses, viewMode, onDeleteResponses }: ContextViewProps) {
  const title = block.config?.title || "Контекст";
  const description = block.config?.description;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none" : ""}`}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
              <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                <IconComponent size={14} className="text-muted-foreground" />
              </div>
              <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="text-base mb-2">{title}</p>
            {description && (
              <p className="text-base text-muted-foreground mb-4">{description}</p>
            )}
            <div className="text-sm text-muted-foreground">
              Блок контекста не собирает ответы. Он используется для отображения информации респондентам.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Five Seconds View
interface FiveSecondsViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function FiveSecondsView({ block, blockIndex, responses, viewMode, onDeleteResponses }: FiveSecondsViewProps) {
  const instruction = block.config?.instruction || "Инструкция";
  const imageUrl = block.config?.imageUrl;
  const duration = block.config?.duration || 5;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  const totalResponses = responses.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
              <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                <IconComponent size={14} className="text-muted-foreground" />
              </div>
              <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
            </div>
            {viewMode === "responses" && onDeleteResponses && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                  onClick={() => onDeleteResponses(block.id)}
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-base mb-4">{instruction}</p>
            {imageUrl && (
              <div className="mb-4">
                <img 
                  src={imageUrl} 
                  alt="Test image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {viewMode === "responses" && (
        <Card className="p-6 border-0 shadow-none">
          <h3 className="text-lg font-semibold mb-4">Ответы ({totalResponses})</h3>
          <div className="space-y-4">
            {responses.map((response, idx) => {
              const a = response.answer;
              const raw = typeof a === "string" ? a : (a as { text?: string; answer?: string } | null)?.text ?? (a as { answer?: string } | null)?.answer;
              const answerText = (raw != null && String(raw).trim() !== "") ? raw : "—";
              const date = new Date(response.created_at);
              
              return (
                <div key={response.id || idx} className="border-b border-border pb-4 last:border-0">
                  <div className="text-sm text-muted-foreground mb-2">
                    {date.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-base whitespace-pre-wrap">{answerText}</div>
                </div>
              );
            })}
            {totalResponses === 0 && (
              <div className="text-center text-muted-foreground py-8">
                Нет ответов
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

const MEDIAN_TOOLTIP = "Медиана — это значение, разделяющее верхнюю половину от нижней половины ответов. На неё не влияют ответы с очень длинным или коротким временем.";

// First Click View
interface FirstClickViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function FirstClickView({ block, blockIndex, responses, viewMode, onDeleteResponses }: FirstClickViewProps) {
  const [clickMapOpen, setClickMapOpen] = useState(false);
  const [clickMapTab, setClickMapTab] = useState<"heatmap" | "clicks" | "image">("image");

  const instruction = block.config?.instruction || "Задание";
  const imageUrl = block.config?.imageUrl;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;
  const durations = responses
    .map((r) => (r.duration_ms != null ? r.duration_ms / 1000 : null))
    .filter((d): d is number => d != null);
  const n = durations.length;
  const avgTime = n > 0 ? durations.reduce((a, b) => a + b, 0) / n : 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const medianTime = n > 0 ? sorted[Math.floor(n / 2)]! : 0;

  const clicks = responses
    .map((r) => {
      const a = r.answer;
      if (a && typeof a === "object" && typeof a.x === "number" && typeof a.y === "number") {
        return { x: a.x, y: a.y };
      }
      return null;
    })
    .filter((c): c is { x: number; y: number } => c != null);

  return (
    <div className="max-w-full">
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <CardContent className="p-0">
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {viewMode !== "responses" && (
              <div className="px-4 py-3">
                <p className="text-base mb-4">{instruction}</p>
              </div>
            )}
          </div>
          <div className="px-0 pb-4">
          {viewMode === "responses" ? (
            <div className="space-y-6 px-4">
              {responses.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">Нет ответов</div>
              ) : (
                responses.map((r, idx) => {
                  const durationSec = r.duration_ms != null ? r.duration_ms / 1000 : null;
                  const a = r.answer;
                  const x = a && typeof a === "object" && typeof (a as { x?: number }).x === "number" ? (a as { x: number }).x : null;
                  const y = a && typeof a === "object" && typeof (a as { y?: number }).y === "number" ? (a as { y: number }).y : null;
                  return (
                    <div key={r.id || idx} className="space-y-2">
                      {durationSec != null && (
                        <div className="text-sm font-medium">
                          Время до клика: {durationSec.toFixed(2)} с
                        </div>
                      )}
                      {imageUrl && (
                        <div className="relative rounded-lg border border-border overflow-hidden bg-muted/30 inline-block max-w-full">
                          <img src={imageUrl} alt="" className="block max-w-full h-auto" />
                          {x != null && y != null && (
                            <div
                              className="absolute w-3 h-3 rounded-full bg-primary border-2 border-white shadow"
                              style={{
                                left: `${x <= 1 ? x * 100 : 0}%`,
                                top: `${y <= 1 ? y * 100 : 0}%`,
                                transform: "translate(-50%, -50%)",
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : imageUrl ? (
            <div className="relative w-full overflow-hidden rounded-b-lg" style={{ aspectRatio: "16/10", minHeight: 200 }}>
              <img
                src={imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover blur-md"
              />
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-0 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-6 sm:gap-8 p-6 text-white">
                <div className="flex flex-col items-center sm:items-start">
                  <span className="text-sm opacity-90">Среднее время</span>
                  <span className="text-2xl font-bold tabular-nums">{avgTime.toFixed(2)} с</span>
                </div>
                <div className="flex flex-col items-center sm:items-start">
                  <span className="text-sm opacity-90 flex items-center gap-1">
                    Медианное время
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex text-white/80 hover:text-white cursor-help">
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-sm whitespace-pre-line">{MEDIAN_TOOLTIP}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                  <span className="text-2xl font-bold tabular-nums">{medianTime.toFixed(2)} с</span>
                </div>
                <Button size="sm" variant="secondary" className="bg-white text-black hover:bg-white/90" onClick={() => setClickMapOpen(true)}>
                  <MapIcon className="h-4 w-4 mr-2" />
                  Открыть карту кликов
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-4 flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Среднее время:</span>
                <span className="font-medium">{avgTime.toFixed(2)} с</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Медианное время:</span>
                <span className="font-medium">{medianTime.toFixed(2)} с</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex text-muted-foreground hover:text-foreground cursor-help">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px]">
                      <p className="text-sm whitespace-pre-line">{MEDIAN_TOOLTIP}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button size="sm" variant="outline" onClick={() => setClickMapOpen(true)}>
                <MapIcon className="h-4 w-4 mr-2" />
                Открыть карту кликов
              </Button>
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={clickMapOpen} onOpenChange={setClickMapOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate pr-8" title={instruction}>
              {instruction}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-4">
            {(["heatmap", "clicks", "image"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setClickMapTab(tab)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  clickMapTab === tab
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {tab === "heatmap" ? "Тепловая карта" : tab === "clicks" ? "Клики" : "Изображение"}
              </button>
            ))}
          </div>
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              {imageUrl && (
                <div className="relative rounded-lg border border-border overflow-hidden bg-muted/30">
                  <img
                    src={imageUrl}
                    alt=""
                    className="w-full h-auto max-h-[50vh] object-contain"
                  />
                  {clickMapTab === "clicks" &&
                    clicks.map((c, i) => (
                      <div
                        key={`click-${c.x}-${c.y}-${i}`}
                        className="absolute w-3 h-3 rounded-full bg-success border-2 border-white shadow"
                        style={{
                          left: `${typeof c.x === "number" && c.x <= 1 ? c.x * 100 : 0}%`,
                          top: `${typeof c.y === "number" && c.y <= 1 ? c.y * 100 : 0}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    ))}
                </div>
              )}
              {!imageUrl && (
                <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
                  Нет изображения
                </div>
              )}
            </div>
            <div className="w-48 flex-shrink-0 space-y-3">
              <div>
                <div className="text-sm text-muted-foreground">Респонденты</div>
                <div className="text-lg font-semibold">{n}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Среднее время</div>
                <div className="text-lg font-semibold">{avgTime.toFixed(2)} с</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Медианное время</div>
                <div className="text-lg font-semibold">{medianTime.toFixed(2)} с</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Prototype View
interface PrototypeViewProps {
  block: StudyBlock;
  blockIndex?: number;
  sessions: Session[];
  events: any[];
  prototypes: Record<string, Proto>;
  viewMode: ReportViewMode;
  heatmapView: HeatmapView;
  setHeatmapView: (view: HeatmapView) => void;
  heatmapTab: HeatmapTab;
  setHeatmapTab: (tab: HeatmapTab) => void;
  selectedHeatmapScreen: { screen: Screen; proto: Proto; blockId: string; screenIndex: number; totalScreens: number } | null;
  setSelectedHeatmapScreen: (screen: { screen: Screen; proto: Proto; blockId: string; screenIndex: number; totalScreens: number } | null) => void;
  selectedRespondentScreen: { screen: Screen; proto: Proto; session: Session; screenIndex: number; totalScreens: number } | null;
  setSelectedRespondentScreen: (screen: { screen: Screen; proto: Proto; session: Session; screenIndex: number; totalScreens: number } | null) => void;
  respondentHeatmapView: HeatmapView;
  setRespondentHeatmapView: (view: HeatmapView) => void;
  onlyFirstClicks: boolean;
  setOnlyFirstClicks: (only: boolean) => void;
  showClickOrder: boolean;
  setShowClickOrder: (show: boolean) => void;
  setModalJustOpened: (value: boolean) => void;
  recordingModal: RecordingModalData | null;
  setRecordingModal: (data: RecordingModalData | null) => void;
  gazePoints?: GazePointRow[];
  responses?: StudyBlockResponse[];
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function PrototypeView({
  block,
  blockIndex = 0,
  sessions,
  events,
  prototypes,
  viewMode,
  heatmapView,
  setHeatmapView,
  heatmapTab,
  setHeatmapTab,
  selectedHeatmapScreen,
  setSelectedHeatmapScreen,
  selectedRespondentScreen,
  setSelectedRespondentScreen,
  respondentHeatmapView,
  setRespondentHeatmapView,
  onlyFirstClicks,
  setOnlyFirstClicks,
  showClickOrder,
  setShowClickOrder,
  setModalJustOpened,
  recordingModal,
  setRecordingModal,
  gazePoints = [],
  responses = [],
  onDeleteResponses
}: PrototypeViewProps) {
  const [localModalJustOpened, setLocalModalJustOpened] = useState(false);
  
  // Используем локальное состояние для modalJustOpened
  const handleModalOpen = () => {
    setLocalModalJustOpened(true);
    setModalJustOpened(true);
    setTimeout(() => {
      setLocalModalJustOpened(false);
    }, 100);
  };
  
  const handleModalClose = () => {
    setLocalModalJustOpened(false);
    setModalJustOpened(false);
  };
  const protoId = block.prototype_id;
  const proto = protoId ? prototypes[protoId] : null;
  const taskDescription = block.config?.task || block.instructions || "Задание";
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;
  
  // Состояние для попапа с информацией о ноде
  const [selectedNode, setSelectedNode] = useState<{ screen: Screen; stepNumber: number; visitorsCount: number; totalSessions: number; position: { x: number; y: number } } | null>(null);

  // Константа таймаута неактивности (в мс), синхронизирована с figma-viewer. После этого времени без событий считаем «Закрыл прототип».
  const SESSION_INACTIVITY_TIMEOUT_MS =
    (Number(import.meta.env.VITE_SESSION_INACTIVITY_TIMEOUT_SECONDS || "60") || 60) * 1000;

  // Calculate metrics
  const completedCount = sessions.filter(s => s.completed).length;
  const abortedCount = sessions.filter(s => s.aborted).length;
  const closedCount = sessions.filter(s => {
    if (s.completed || s.aborted) return false;
    const sessionEvents = events.filter(e => e.session_id === s.id);
    if (sessionEvents.some(e => e.event_type === "closed")) return true;
    if (sessionEvents.length === 0) return false;
    const sorted = [...sessionEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const lastTime = new Date(sorted[sorted.length - 1].timestamp).getTime();
    return (Date.now() - lastTime) >= SESSION_INACTIVITY_TIMEOUT_MS;
  }).length;

  // Среднее и медианное время: для prototype блоков вычисляем из sessions/events,
  // так как prototype блоки НЕ создают записи в study_block_responses
  const sessionDurationsSec = sessions
    .filter(s => s.completed) // Только завершенные сессии
    .map(session => {
      const sessionEvents = events
        .filter(e => e.session_id === session.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      if (sessionEvents.length === 0) return null;
      
      // Ищем первый screen_load и событие completed
      const firstScreenLoad = sessionEvents.find(e => e.event_type === "screen_load");
      const completedEvent = sessionEvents.find(e => e.event_type === "completed");
      
      if (!firstScreenLoad) return null;
      
      // Используем completed event или последний event как конец
      const endEvent = completedEvent || sessionEvents[sessionEvents.length - 1];
      
      const startTime = new Date(firstScreenLoad.timestamp).getTime();
      const endTime = new Date(endEvent.timestamp).getTime();
      const durationMs = endTime - startTime;
      
      return durationMs > 0 ? durationMs / 1000 : null;
    })
    .filter((d): d is number => d != null);
  
  const nDurations = sessionDurationsSec.length;
  const avgTime = nDurations > 0
    ? sessionDurationsSec.reduce((a, b) => a + b, 0) / nDurations
    : 0;
  const medianTime = nDurations > 0
    ? [...sessionDurationsSec].sort((a, b) => a - b)[Math.floor(nDurations / 2)]!
    : 0;

  // Get screens for prototype
  const screens = proto?.screens || [];
  const screenMap = new Map(screens.map(s => [s.id, s]));

  // Определяем стартовые и финальные экраны
  const getStartAndEndScreens = () => {
    const startScreens = new Set<string>();
    const endScreens = new Set<string>();
    
    sessions.forEach(session => {
      const sessionEvents = events
        .filter(e => e.session_id === session.id && e.event_type === "screen_load")
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      if (sessionEvents.length > 0) {
        startScreens.add(sessionEvents[0].screen_id);
        endScreens.add(sessionEvents[sessionEvents.length - 1].screen_id);
      }
      
      // Также проверяем события completed
      const completedEvents = events.filter(e => 
        e.session_id === session.id && e.event_type === "completed"
      );
      completedEvents.forEach(e => {
        if (e.screen_id) endScreens.add(e.screen_id);
      });
    });
    
    return { startScreens, endScreens };
  };

  const { startScreens, endScreens } = getStartAndEndScreens();

  // Кастомный edge компонент в стиле Sankey (изогнутые ленты с переменной шириной)
  const SankeyEdge = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps & { data?: { count?: number; maxCount?: number } }) => {
    const count = data?.count || 0;
    const maxCount = data?.maxCount || 1;
    
    // Вычисляем ширину ленты на основе количества переходов
    const minWidth = 2;
    const maxWidth = 40;
    const width = count > 0 ? Math.max(minWidth, (count / maxCount) * maxWidth) : minWidth;
    const halfWidth = width / 2;
    
    // Вычисляем контрольные точки для кривой Безье (Sankey-стиль)
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const curvature = 0.3; // Коэффициент кривизны
    
    // Создаем путь для верхней и нижней границы ленты
    const controlPoint1X = sourceX + dx * curvature;
    const controlPoint1Y = sourceY;
    const controlPoint2X = targetX - dx * curvature;
    const controlPoint2Y = targetY;
    
    // Создаем path для ленты (замкнутый путь)
    const path = `
      M ${sourceX},${sourceY - halfWidth}
      C ${controlPoint1X},${sourceY - halfWidth} ${controlPoint2X},${targetY - halfWidth} ${targetX},${targetY - halfWidth}
      L ${targetX},${targetY + halfWidth}
      C ${controlPoint2X},${targetY + halfWidth} ${controlPoint1X},${sourceY + halfWidth} ${sourceX},${sourceY + halfWidth}
      Z
    `;
    
    // Цвет зависит от интенсивности
    const opacity = count > 0 ? Math.min(0.8, 0.3 + (count / maxCount) * 0.5) : 0.2;
    const edgeColor = count > 0 ? chartColors.primary : chartColors.muted;
    
    return (
      <g>
        <path
          d={path}
          fill={edgeColor}
          fillOpacity={opacity}
          stroke="none"
        />
        {count > 0 && (
          <text
            x={(sourceX + targetX) / 2}
            y={(sourceY + targetY) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-foreground)"
            fontSize="11"
            fontWeight="500"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {count}
          </text>
        )}
      </g>
    );
  };

  // Кастомный узел для отображения изображений экранов
  const ScreenNode = ({ data }: { data: any }) => {
    const isStart = startScreens.has(data.screenId);
    const finalStatuses = data.finalStatuses || {
      completed: false,
      aborted: false,
      closed: false,
      in_progress: false
    };
    const isFinal = finalStatuses.completed || finalStatuses.aborted || finalStatuses.closed;
    const displayLabel = data.label && data.label.length > 20 
      ? data.label.substring(0, 20) + '...' 
      : data.label;
    
    return (
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {/* Название экрана выше ноды (4px отступ) */}
        <div style={{
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: finalStatuses.aborted ? styleColors.destructive : styleColors.mutedText,
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: (isStart || finalStatuses.completed || finalStatuses.aborted || finalStatuses.closed) ? '4px 8px' : '0',
          borderRadius: (isStart || finalStatuses.completed || finalStatuses.aborted || finalStatuses.closed) ? '6px' : '0',
          backgroundColor: finalStatuses.completed 
            ? 'var(--color-success-bg)' // Пастельный зеленый для completed
            : finalStatuses.aborted 
            ? 'var(--color-destructive-bg)' // Пастельный красный для aborted
            : finalStatuses.closed 
            ? 'var(--color-warning-bg)' // Пастельный оранжевый для closed
            : isStart
            ? 'var(--color-muted)' // Подложка для стартового экрана
            : 'transparent'
        }}>
          {isStart && !finalStatuses.aborted && !finalStatuses.closed && <Play className="h-3 w-3 flex-shrink-0" />}
          {isFinal && (
            <>
              {finalStatuses.completed && <UserRoundCheck className="h-3 w-3 flex-shrink-0 text-success" />}
              {finalStatuses.aborted && <UserRoundX className="h-3 w-3 flex-shrink-0" style={{ color: styleColors.destructive }} />}
              {finalStatuses.closed && <UserRoundMinus className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
            </>
          )}
          {!isStart && !isFinal && endScreens.has(data.screenId) && <Flag className="h-3 w-3 flex-shrink-0" />}
          <span style={{ color: finalStatuses.aborted ? styleColors.destructive : 'inherit' }}>{displayLabel}</span>
        </div>
        
        {/* Нода с изображением */}
        <div style={{ 
          width: '200px', 
          height: '150px',
          border: `2px solid ${styleColors.inputBorder}`,
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
          background: styleColors.sidebar
        }}>
          {/* Handle для входящих соединений */}
          <Handle type="target" position={Position.Left} />
          
          {data.image ? (
            <img 
              src={data.image} 
              alt={data.label}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain' // Пропорциональное отображение
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: styleColors.sidebar,
              color: styleColors.mutedText,
              fontSize: '12px',
              textAlign: 'center',
              padding: '8px'
            }}>
              {data.label}
            </div>
          )}
          
          {/* Handle для исходящих соединений */}
          <Handle type="source" position={Position.Right} />
        </div>
      </div>
    );
  };

  // Мемоизируем nodeTypes и edgeTypes чтобы избежать пересоздания при каждом рендере
  const nodeTypes = useMemo(() => ({
    screen: ScreenNode
  }), []);

  const edgeTypes = useMemo(() => ({
    sankey: SankeyEdge
  }), []);

  // Calculate flow data for xyflow
  const getFlowData = () => {
    if (!proto) return { nodes: [], edges: [] };

    // Отслеживаем пути респондентов и их финальные статусы
    interface RespondentPath {
      sessionId: string;
      screens: string[];
      finalScreen: string | null;
      status: 'completed' | 'aborted' | 'closed' | 'in_progress';
      finalEventType?: 'completed' | 'aborted' | 'closed';
    }

    const respondentPaths: RespondentPath[] = [];
    const transitionCounts: Record<string, number> = {};
    const finalScreensByStatus: Record<string, Set<string>> = {
      completed: new Set(),
      aborted: new Set(),
      closed: new Set(),
      in_progress: new Set()
    };

    sessions.forEach(session => {
      const sessionEvents = events
        .filter(e => e.session_id === session.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const screenLoads = sessionEvents.filter(e => e.event_type === "screen_load");
      const completedEvent = sessionEvents.find(e => e.event_type === "completed");
      const abortedEvent = sessionEvents.find(e => e.event_type === "aborted");
      const closedEvent = sessionEvents.find(e => e.event_type === "closed");
      const lastEventTime = sessionEvents.length > 0 ? new Date(sessionEvents[sessionEvents.length - 1].timestamp).getTime() : 0;
      const inactiveForMs = lastEventTime > 0 ? Date.now() - lastEventTime : 0;
      const isInactiveClosed = !completedEvent && !abortedEvent && !closedEvent && sessionEvents.length > 0 && inactiveForMs >= SESSION_INACTIVITY_TIMEOUT_MS;

      let status: 'completed' | 'aborted' | 'closed' | 'in_progress' = 'in_progress';
      let finalEventType: 'completed' | 'aborted' | 'closed' | undefined = undefined;
      let finalScreen: string | null = null;

      if (completedEvent) {
        const completedTime = new Date(completedEvent.timestamp).getTime();
        const abortedTime = abortedEvent ? new Date(abortedEvent.timestamp).getTime() : 0;
        const closedTime = closedEvent ? new Date(closedEvent.timestamp).getTime() : 0;

        if (completedTime >= abortedTime && completedTime >= closedTime) {
          status = 'completed';
          finalEventType = 'completed';
        } else if (abortedTime > closedTime) {
          status = 'aborted';
          finalEventType = 'aborted';
        } else {
          status = 'closed';
          finalEventType = 'closed';
        }
      } else if (abortedEvent) {
        status = 'aborted';
        finalEventType = 'aborted';
      } else if (closedEvent) {
        status = 'closed';
        finalEventType = 'closed';
      } else if (isInactiveClosed) {
        status = 'closed';
        finalEventType = 'closed';
      }
      
      // Определяем финальный экран (последний screen_load перед финальным событием или последний screen_load)
      const screens = screenLoads.map(e => e.screen_id).filter(Boolean) as string[];
      
      // Если нет экранов, но есть событие aborted/closed, используем общий стартовый экран
      // (будет определен позже, но нужно сохранить статус)
      if (screens.length > 0) {
        finalScreen = screens[screens.length - 1];
        finalScreensByStatus[status].add(finalScreen);
      } else if (status !== 'in_progress') {
        // Если респондент сдался/закрыл без загрузки экранов, финальный экран будет определен позже
        // как общий стартовый экран
        finalScreen = null;
      }
      
      // Сохраняем путь респондента (даже если screens пустой)
      respondentPaths.push({
        sessionId: session.id,
        screens,
        finalScreen,
        status,
        finalEventType
      });
      
      // Подсчитываем частоту переходов
      for (let i = 0; i < screens.length - 1; i++) {
        const from = screens[i];
        const to = screens[i + 1];
        if (from && to) {
          const key = `${from}->${to}`;
          transitionCounts[key] = (transitionCounts[key] || 0) + 1;
        }
      }
    });

    // Определяем общий стартовый экран для всех респондентов
    const startScreenCounts = new Map<string, number>();
    respondentPaths.forEach(path => {
      if (path.screens.length > 0) {
        const startScreen = path.screens[0];
        startScreenCounts.set(startScreen, (startScreenCounts.get(startScreen) || 0) + 1);
      }
    });
    
    // Находим самый частый стартовый экран
    let commonStartScreen: string | null = null;
    let maxCount = 0;
    startScreenCounts.forEach((count, screenId) => {
      if (count > maxCount) {
        maxCount = count;
        commonStartScreen = screenId;
      }
    });
    
    // Функция для удаления дубликатов экранов, оставляя только первое вхождение
    const removeDuplicates = (screenArray: string[]): string[] => {
      const seen = new Set<string>();
      const result: string[] = [];
      screenArray.forEach(screenId => {
        if (!seen.has(screenId)) {
          seen.add(screenId);
          result.push(screenId);
        }
      });
      return result;
    };
    
    // Функция для получения цвета по статусу
    const getColorByStatus = (status: string) => {
      switch (status) {
        case 'completed':
          return chartColors.primary;
        case 'aborted':
          return chartColors.destructive;
        case 'closed':
          return chartColors.muted;
        default:
          return chartColors.muted;
      }
    };

    // Создаем ноды и edges для каждого респондента на отдельной горизонтальной линии
    const nodes: any[] = [];
    const edges: any[] = [];
    const nodeIdMap = new Map<string, string>(); // Маппинг (sessionId, screenId) -> nodeId
    
    // Константы для позиционирования
    const stepWidth = 250; // Ширина шага по горизонтали
    const rowHeight = 200; // Высота строки для каждого респондента
    const startY = 40; // Начальная позиция Y
    const startScreenX = 0; // Позиция X для стартового экрана (общий столбец слева)

    // Создаем одну ноду для общего стартового экрана (если он определен)
    // Позиционируем его на первой строке (на той же высоте, что и первый респондент)
    if (commonStartScreen) {
      const startScreen = screens.find(s => s.id === commonStartScreen);
      if (startScreen) {
        const startNodeId = `start-${commonStartScreen}`;
        nodeIdMap.set(`start-${commonStartScreen}`, startNodeId);
        
        nodes.push({
          id: startNodeId,
          type: 'screen',
          position: { x: startScreenX, y: startY },
          data: {
            label: startScreen.name,
            image: startScreen.image,
            screenId: startScreen.id,
            finalStatuses: {
              completed: false,
              aborted: false,
              closed: false,
              in_progress: false
            },
            sessionId: 'common-start'
          }
        });
      }
    }

    respondentPaths.forEach((path, respondentIndex) => {
      const y = startY + respondentIndex * rowHeight;
      
      // Если у респондента нет экранов, но он сдался/закрыл, используем общий стартовый экран
      let uniqueScreens = removeDuplicates(path.screens);
      if (uniqueScreens.length === 0 && commonStartScreen && path.status !== ('in_progress' as const)) {
        uniqueScreens = [commonStartScreen];
        // Обновляем finalScreen для этого пути
        path.finalScreen = commonStartScreen;
      }
      
      // Если первый экран - это общий стартовый экран, пропускаем его (уже создан)
      const screensToRender = commonStartScreen && uniqueScreens[0] === commonStartScreen
        ? uniqueScreens.slice(1)
        : uniqueScreens;
      
      // Определяем финальный экран из уникального пути
      const finalScreenInUniquePath = uniqueScreens.length > 0 
        ? uniqueScreens[uniqueScreens.length - 1] 
        : null;
      
      // Если screensToRender пустой, но есть общий стартовый экран и респондент сдался на нем,
      // создаем новую ноду на следующей позиции с индикатором статуса и соединяем с общим стартовым экраном
      if (screensToRender.length === 0 && commonStartScreen && uniqueScreens[0] === commonStartScreen && path.status !== ('in_progress' as const)) {
        const startScreen = screens.find(s => s.id === commonStartScreen);
        if (startScreen) {
          const nodeId = `${path.sessionId}-${commonStartScreen}-final`;
          nodeIdMap.set(`${path.sessionId}-${commonStartScreen}`, nodeId);
          
          const finalStatuses = {
            completed: path.status === 'completed',
            aborted: path.status === 'aborted',
            closed: path.status === 'closed',
            in_progress: (path.status as string) === 'in_progress'
          };
          
          // Создаем ноду на следующей позиции после стартового экрана
          nodes.push({
            id: nodeId,
            type: 'screen',
            position: { x: stepWidth, y },
            data: {
              label: startScreen.name,
              image: startScreen.image,
              screenId: startScreen.id,
              finalStatuses,
              sessionId: path.sessionId
            }
          });
          
          // Создаем edge от общего стартового экрана к этой ноде
          const startNodeId = nodeIdMap.get(`start-${commonStartScreen}`);
          if (startNodeId) {
            edges.push({
              id: `edge-${path.sessionId}-from-start`,
              source: startNodeId,
              target: nodeId,
              type: 'bezier',
              style: {
                strokeWidth: 36,
                stroke: getColorByStatus(path.status),
                opacity: 0.35
              },
              animated: false
            });
          }
          
          // Не создаем дополнительные edges, так как это единственный переход
          return; // Пропускаем создание дополнительных edges для этого респондента
        }
      }
      
      // Создаем ноды для каждого уникального экрана в пути респондента
      screensToRender.forEach((screenId, stepIndex) => {
        const screen = screens.find(s => s.id === screenId);
        if (!screen) return;
        
        // Создаем уникальный ID ноды для каждого респондента и экрана
        const nodeId = `${path.sessionId}-${screenId}-${stepIndex}`;
        nodeIdMap.set(`${path.sessionId}-${screenId}`, nodeId);
        
        // Позиционируем: если это первый экран и он не общий стартовый, то x=0, иначе stepIndex+1 (т.к. стартовый уже на позиции 0)
        const x = (commonStartScreen && uniqueScreens[0] === commonStartScreen) 
          ? (stepIndex + 1) * stepWidth 
          : stepIndex * stepWidth;
        
        // Определяем финальные статусы для этого экрана
        const isFinalScreen = path.finalScreen === screenId && finalScreenInUniquePath === screenId;
        const finalStatuses = {
          completed: isFinalScreen && path.status === 'completed',
          aborted: isFinalScreen && path.status === 'aborted',
          closed: isFinalScreen && path.status === 'closed',
          in_progress: isFinalScreen && path.status === 'in_progress'
        };
        
        nodes.push({
          id: nodeId,
          type: 'screen',
          position: { x, y },
          data: {
            label: screen.name,
            image: screen.image,
            screenId: screen.id,
            finalStatuses,
            sessionId: path.sessionId
          }
        });
      });
      
      // Создаем edges между последовательными экранами в уникальном пути респондента
      const pathForEdges = uniqueScreens;
      for (let i = 0; i < pathForEdges.length - 1; i++) {
        const fromScreenId = pathForEdges[i];
        const toScreenId = pathForEdges[i + 1];
        
        // Определяем ID нод для source и target
        let fromNodeId: string | undefined;
        let toNodeId: string | undefined;
        
        // Если это первый экран и он общий стартовый
        if (i === 0 && commonStartScreen && fromScreenId === commonStartScreen) {
          fromNodeId = nodeIdMap.get(`start-${commonStartScreen}`);
        } else {
          fromNodeId = nodeIdMap.get(`${path.sessionId}-${fromScreenId}`);
        }
        
        toNodeId = nodeIdMap.get(`${path.sessionId}-${toScreenId}`);
        
        if (fromNodeId && toNodeId) {
          edges.push({
            id: `edge-${path.sessionId}-${i}`,
            source: fromNodeId,
            target: toNodeId,
            type: 'bezier',
            style: {
              strokeWidth: 36,
              stroke: getColorByStatus(path.status),
              opacity: 0.35
            },
            animated: false
          });
        }
      }
    });

    return { nodes, edges };
  };

  const { nodes, edges } = getFlowData();
  
  // Обработчик клика на ноду
  const handleNodeClick = (event: React.MouseEvent, node: any) => {
    // Извлекаем screenId из данных ноды (новый формат ID: sessionId-screenId-stepIndex)
    const screenId = node.data?.screenId || node.id.split('-')[1] || node.id;
    const screen = screens.find(s => s.id === screenId);
    if (!screen) return;
    
    // Подсчитываем количество людей, посетивших экран
    const screenEvents = events.filter(e => e.screen_id === screen.id && e.event_type === "screen_load");
    const visitorsCount = new Set(screenEvents.map(e => e.session_id)).size;
    const totalSessions = sessions.length;
    
    // Определяем номер шага (позицию в среднем пути)
    // Для упрощения используем индекс в массиве screens
    const stepNumber = screens.findIndex(s => s.id === screen.id) + 1;
    
    // Получаем позицию клика для размещения попапа рядом
    const clickX = event.clientX;
    const clickY = event.clientY;
    
    setSelectedNode({
      screen,
      stepNumber,
      visitorsCount,
      totalSessions,
      position: { x: clickX, y: clickY }
    });
  };

  // Calculate click-based heatmap data
  const getHeatmapData = (screenId: string) => {
    const screenEvents = events.filter(e => 
      e.screen_id === screenId && 
      (e.event_type === "click" || e.event_type === "hotspot_click") &&
      e.x !== undefined && e.y !== undefined
    );

    const clickMap: Record<string, { x: number; y: number; count: number }> = {};
    const sessionFirstClicks = new Set<string>();
    screenEvents.forEach(e => {
      if (onlyFirstClicks) {
        const sessionId = e.session_id ?? e.run_id ?? "";
        if (sessionFirstClicks.has(sessionId)) return;
        sessionFirstClicks.add(sessionId);
      }
      const key = `${Math.floor(e.x! / 10) * 10}_${Math.floor(e.y! / 10) * 10}`;
      if (!clickMap[key]) {
        clickMap[key] = { x: e.x!, y: e.y!, count: 0 };
      }
      clickMap[key].count += 1;
    });

    return Object.values(clickMap);
  };

  // Сырые клики по экрану: по одной точке на каждый клик (для вкладки «Клики» в сводном отчёте).
  // События без x/y (старые записи) получают fallback — центр экрана, чтобы число маркеров совпадало с «Всего кликов».
  const getRawClicksForScreen = (screenId: string): Array<{ x: number; y: number; count: number; isFallback?: boolean }> => {
    const screenEvents = events.filter(e =>
      e.screen_id === screenId &&
      (e.event_type === "click" || e.event_type === "hotspot_click")
    );
    const screenMeta = screenMap.get(screenId);
    const fallbackX = screenMeta ? (screenMeta.width ?? 375) / 2 : 200;
    const fallbackY = screenMeta ? (screenMeta.height ?? 812) / 2 : 200;

    const toPoint = (e: (typeof events)[0]) => {
      const hasCoords = e.x !== undefined && e.y !== undefined;
      return {
        x: hasCoords ? e.x! : fallbackX,
        y: hasCoords ? e.y! : fallbackY,
        count: 1,
        ...(hasCoords ? {} : { isFallback: true as const }),
      };
    };

    if (onlyFirstClicks) {
      const seen = new Set<string>();
      return screenEvents
        .filter(e => {
          const id = e.session_id ?? e.run_id ?? "";
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map(toPoint);
    }
    return screenEvents.map(toPoint);
  };

  // Calculate gaze-based heatmap data (using normalized coordinates)
  const getGazeHeatmapData = (blockId: string, screenId: string, runIdFilter?: string | null) => {
    const samples = gazePoints.filter(p => 
      p.block_id === blockId &&
      p.screen_id === screenId &&
      (runIdFilter ? p.run_id === runIdFilter : true)
    );

    const clickMap: Record<string, { x: number; y: number; count: number }> = {};
    samples.forEach(sample => {
      const proto = Object.values(prototypes)[0] as Proto | undefined;
      // Для координат используем нормализованные значения, умноженные на размеры экрана,
      // сами размеры передаются в HeatmapRenderer через props
      const x = sample.x_norm;
      const y = sample.y_norm;
      const key = `${Math.floor(x * 100)}_${Math.floor(y * 100)}`;
      if (!clickMap[key]) {
        clickMap[key] = { x, y, count: 0 };
      }
      clickMap[key].count += 1;
    });

    return Object.values(clickMap);
  };

  // Get screen statistics
  const getScreenStats = (screenId: string) => {
    const screenEvents = events.filter(e => e.screen_id === screenId);
    const screenSessions = new Set(screenEvents.map(e => e.session_id));
    const clicks = screenEvents.filter(e => 
      e.event_type === "click" || e.event_type === "hotspot_click"
    );
    const misses = clicks.filter(e => !e.hotspot_id).length;
    
    // Calculate time on screen
    const screenLoads = screenEvents.filter(e => e.event_type === "screen_load");
    let totalTime = 0;
    screenLoads.forEach(load => {
      // Ищем следующее событие ТОЛЬКО в той же сессии
      const sessionEvents = screenEvents.filter(e => e.session_id === load.session_id);
      const nextEvent = sessionEvents.find(e => 
        e.timestamp > load.timestamp && 
        (e.event_type === "screen_load" || e.event_type === "completed" || e.event_type === "aborted")
      );
      if (nextEvent) {
        totalTime += new Date(nextEvent.timestamp).getTime() - new Date(load.timestamp).getTime();
      }
    });
    const avgTimeOnScreen = screenSessions.size > 0 ? (totalTime / screenSessions.size) / 1000 : 0;
    const medianTimeOnScreen = avgTimeOnScreen; // Simplified

    return {
      respondents: screenSessions.size,
      totalClicks: clicks.length,
      misses,
      avgTime: avgTimeOnScreen,
      medianTime: medianTimeOnScreen
    };
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with task number and response count */}
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
              <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                <IconComponent size={14} className="text-muted-foreground" />
              </div>
              <span className="text-[15px] font-medium leading-6">{getBlockDisplayName(block)}</span>
            </div>
            {viewMode === "responses" && onDeleteResponses && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                  onClick={() => onDeleteResponses(block.id)}
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="px-4 pb-4">
            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <UserRoundCheck className="h-6 w-6 text-green-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Справились</div>
                  <div className="text-2xl font-bold">{completedCount}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <UserRoundX className="h-6 w-6 text-orange-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Сдался</div>
                  <div className="text-2xl font-bold">{abortedCount}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <UserRoundMinus className="h-6 w-6 text-gray-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Закрыли прототип</div>
                  <div className="text-2xl font-bold">{closedCount}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Clock className="h-6 w-6 text-blue-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Среднее время</div>
                  <div className="text-2xl font-bold">{avgTime.toFixed(1)} с</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Clock className="h-6 w-6 text-blue-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Медианное время</div>
                  <div className="text-2xl font-bold">{medianTime.toFixed(1)} с</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flow visualization - только в режиме "Сводный" */}
      {proto && viewMode === "summary" && (
        <Card className="p-6 relative">
          <h3 className="text-lg font-semibold mb-4">Пути</h3>
          <div style={{ height: '400px', width: '100%', position: 'relative' }}>
            <ReactFlow 
              nodes={nodes} 
              edges={edges} 
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={handleNodeClick}
              onPaneClick={() => setSelectedNode(null)}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
          
          {/* Попап с информацией о ноде - рядом с нодой */}
          {selectedNode && selectedNode.position && (
            <div 
              className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-4"
              style={{
                width: '240px',
                height: '308px',
                left: `${selectedNode.position.x + 20}px`,
                top: `${selectedNode.position.y + 20}px`,
                pointerEvents: 'auto',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedNode(null)}
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
              <div className="space-y-3 h-full overflow-y-auto">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Номер шага</div>
                  <div className="text-sm font-semibold">{selectedNode.stepNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Название экрана</div>
                  <div className="text-sm font-medium">{selectedNode.screen.name}</div>
                </div>
                {selectedNode.screen.image && (
                  <div>
                    <img 
                      src={selectedNode.screen.image} 
                      alt={selectedNode.screen.name}
                      className="w-full h-auto rounded-lg border border-border"
                    />
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Посетили экран</div>
                  <div className="text-sm font-medium">
                    {selectedNode.visitorsCount} из {selectedNode.totalSessions} ({selectedNode.totalSessions > 0 ? Math.round((selectedNode.visitorsCount / selectedNode.totalSessions) * 100) : 0}%)
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </Card>
      )}

      {/* Heatmaps and clicks или таблица респондентов */}
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none" : ""}`}>
        {viewMode === "summary" ? (
          <>
            <h3 className="text-lg font-semibold mb-4">
              Тепловые карты и клики
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Смотрите тепловые карты и клики для каждого экрана или отдельных ответов
            </p>

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setHeatmapTab("by_screens")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapTab === "by_screens"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                По экранам
              </button>
              <button
                onClick={() => setHeatmapTab("by_respondents")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapTab === "by_respondents"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                По респондентам
              </button>
            </div>
          </>
        ) : viewMode !== "responses" ? (
          <h3 className="text-lg font-semibold mb-4">
            Респонденты
          </h3>
        ) : null}

        {viewMode === "summary" && heatmapTab === "by_screens" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {screens.map((screen, idx) => (
              <button
                key={screen.id}
                onClick={() => setSelectedHeatmapScreen({
                  screen,
                  proto: proto!,
                  blockId: block.id,
                  screenIndex: idx + 1,
                  totalScreens: screens.length
                })}
                className="text-left space-y-2"
                type="button"
              >
                <img
                  src={screen.image}
                  alt={screen.name}
                  className="w-full h-auto rounded border border-border pointer-events-none"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="text-sm font-medium">{screen.name}</div>
              </button>
            ))}
          </div>
        )}

        {viewMode === "summary" && heatmapTab === "by_respondents" && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-sm">Дата</th>
                  <th className="text-left p-3 font-medium text-sm">Статус</th>
                  <th className="text-left p-3 font-medium text-sm">Время</th>
                  <th className="text-left p-3 font-medium text-sm">Запись</th>
                  <th className="text-left p-3 font-medium text-sm">Путь</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const sessionAllEvents = events
                    .filter(e => e.session_id === session.id)
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                  const sessionEvents = sessionAllEvents.filter(e => e.event_type === "screen_load");
                  const screenIds = sessionEvents.map(e => e.screen_id).filter(Boolean);

                  let sessionTime = 0;
                  let status: string = "В процессе";
                  if (sessionAllEvents.length > 0) {
                    // Время считаем с момента нажатия «Начать» (started_at обновляется в viewer при клике)
                    const startTime = session.started_at
                      ? new Date(session.started_at).getTime()
                      : new Date(sessionAllEvents[0].timestamp).getTime();
                    const lastEventTime = new Date(sessionAllEvents[sessionAllEvents.length - 1].timestamp).getTime();
                    const now = Date.now();
                    const inactiveForMs = now - lastEventTime;
                    const hasClosed = sessionAllEvents.some(e => e.event_type === "closed");

                    if (session.completed) {
                      status = "Успешно";
                    } else if (session.aborted) {
                      status = "Сдался";
                    } else if (hasClosed) {
                      status = "Закрыл прототип";
                    } else if (inactiveForMs >= SESSION_INACTIVITY_TIMEOUT_MS) {
                      status = "Закрыл прототип";
                    } else {
                      status = "В процессе";
                    }

                    const isTerminal =
                      status === "Успешно" ||
                      status === "Сдался" ||
                      status === "Закрыл прототип";
                    const endTime = isTerminal ? lastEventTime : now;
                    sessionTime = (endTime - startTime) / 1000;
                  }

                  const statusIcon = status === "Успешно"
                    ? <UserRoundCheck className="h-4 w-4 text-success inline-block mr-1" />
                    : status === "Сдался"
                      ? <UserRoundX className="h-4 w-4 text-destructive inline-block mr-1" />
                      : status === "Закрыл прототип"
                        ? <UserRoundMinus className="h-4 w-4 text-muted-foreground inline-block mr-1" />
                        : null;
                  const statusColor =
                    status === "Успешно"
                      ? "text-success"
                      : status === "Сдался"
                        ? "text-destructive"
                        : "";
                  const date = new Date(session.started_at);
                  const formattedDate = formatResponseDate(date);
                  
                  return (
                    <tr key={session.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 text-sm">{formattedDate}</td>
                      <td className={`p-3 text-sm ${statusColor}`}>
                        {statusIcon}
                        {status}
                      </td>
                      <td className="p-3 text-sm">{sessionTime.toFixed(1)} с</td>
                      <td className="p-3 text-sm">
                        {session.recording_deleted_at ? (
                          <span className="text-xs text-muted-foreground">Удалено</span>
                        ) : (session.recording_url || session.recording_screen_url) ? (
                            <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (setRecordingModal) {
                                setRecordingModal({
                                  urls: {
                                    camera: session.recording_url ?? null,
                                    screen: session.recording_screen_url ?? null
                                  },
                                  sessionId: session.id,
                                  sessionStartedAt: session.started_at,
                                  sessionGazePoints: gazePoints.filter((p) => p.session_id === session.id)
                                });
                              }
                            }}
                            className="text-xs border border-border bg-muted/60 hover:bg-muted text-foreground rounded px-2 py-1 flex items-center gap-1 font-medium"
                          >
                            <CirclePlay className="h-3 w-3 shrink-0" />
                            Да
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Нет</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2 flex-wrap items-center">
                          {screenIds.length === 0 && (status === "Закрыл прототип" || status === "Сдался") ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            screenIds.map((screenId, screenIdx) => {
                              const screen = screenMap.get(screenId);
                              if (!screen || !proto) return null;
                              return (
                                <button
                                  key={screenIdx}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const screenData = {
                                      screen,
                                      proto,
                                      session,
                                      screenIndex: screenIdx + 1,
                                      totalScreens: screenIds.length
                                    };
                                    setSelectedRespondentScreen(screenData);
                                  }}
                                  className="relative border-0 bg-transparent p-0 cursor-pointer"
                                  type="button"
                                >
                                  <img
                                    src={screen.image}
                                    alt={screen.name}
                                    className="w-16 h-12 object-cover rounded border pointer-events-none transition-colors border-border hover:border-primary"
                                    draggable="false"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </button>
                              );
                            })
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Таблица для режима "ответы" */}
        {viewMode === "responses" && (
          <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-sm">Дата</th>
                    <th className="text-left p-3 font-medium text-sm">Статус</th>
                    <th className="text-left p-3 font-medium text-sm">Время</th>
                    <th className="text-left p-3 font-medium text-sm">Запись</th>
                    <th className="text-left p-3 font-medium text-sm">Путь</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => {
                    const sessionAllEventsForProto = events
                      .filter(e => e.session_id === session.id)
                      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    const sessionEvents = sessionAllEventsForProto.filter(e => e.event_type === "screen_load");
                    const screenIds = sessionEvents.map(e => e.screen_id).filter(Boolean);

                    let sessionTime = 0;
                    let status: string = "В процессе";
                    if (sessionAllEventsForProto.length > 0) {
                      const startTime = session.started_at
                        ? new Date(session.started_at).getTime()
                        : new Date(sessionAllEventsForProto[0].timestamp).getTime();
                      const lastEventTime = new Date(sessionAllEventsForProto[sessionAllEventsForProto.length - 1].timestamp).getTime();
                      const now = Date.now();
                      const inactiveForMs = now - lastEventTime;
                      const hasClosedForProto = sessionAllEventsForProto.some(e => e.event_type === "closed");

                      if (session.completed) {
                        status = "Успешно";
                      } else if (session.aborted) {
                        status = "Сдался";
                      } else if (hasClosedForProto) {
                        status = "Закрыл прототип";
                      } else if (inactiveForMs >= SESSION_INACTIVITY_TIMEOUT_MS) {
                        status = "Закрыл прототип";
                      } else {
                        status = "В процессе";
                      }

                      const isTerminal =
                        status === "Успешно" ||
                        status === "Сдался" ||
                        status === "Закрыл прототип";
                      const endTime = isTerminal ? lastEventTime : now;
                      sessionTime = (endTime - startTime) / 1000;
                    }

                    const statusIcon = status === "Успешно"
                      ? <UserRoundCheck className="h-4 w-4 text-success inline-block mr-1" />
                      : status === "Сдался"
                        ? <UserRoundX className="h-4 w-4 text-destructive inline-block mr-1" />
                        : status === "Закрыл прототип"
                          ? <UserRoundMinus className="h-4 w-4 text-muted-foreground inline-block mr-1" />
                          : null;
                    const statusColor =
                      status === "Успешно"
                        ? "text-success"
                        : status === "Сдался"
                          ? "text-destructive"
                          : "";
                    const date = new Date(session.started_at);
                    const formattedDate = formatResponseDate(date);
                    
                    return (
                      <tr key={session.id} className="border-b border-border hover:bg-muted/30">
                        <td className="p-3 text-sm">{formattedDate}</td>
                        <td className={`p-3 text-sm ${statusColor}`}>
                          {statusIcon}
                          {status}
                        </td>
                        <td className="p-3 text-sm">{sessionTime.toFixed(1)} с</td>
                        <td className="p-3 text-sm">
                          {session.recording_deleted_at ? (
                            <span className="text-xs text-muted-foreground">Удалено</span>
                          ) : (session.recording_url || session.recording_screen_url) ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (setRecordingModal) {
                                  setRecordingModal({
                                    urls: {
                                      camera: session.recording_url ?? null,
                                      screen: session.recording_screen_url ?? null
                                    },
                                    sessionId: session.id,
                                    sessionStartedAt: session.started_at,
                                    sessionGazePoints: gazePoints.filter((p) => p.session_id === session.id)
                                  });
                                }
                              }}
                              className="text-xs border border-border bg-muted/60 hover:bg-muted text-foreground rounded px-2 py-1 flex items-center gap-1 font-medium"
                            >
                              <CirclePlay className="h-3 w-3 shrink-0" />
                              Да
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Нет</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2 flex-wrap items-center">
                            {screenIds.length === 0 && (status === "Закрыл прототип" || status === "Сдался") ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              screenIds.map((screenId, screenIdx) => {
                                const screen = screenMap.get(screenId);
                                if (!screen || !proto) return null;
                                return (
                                  <button
                                    key={screenIdx}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const screenData = {
                                        screen,
                                        proto,
                                        session,
                                        screenIndex: screenIdx + 1,
                                        totalScreens: screenIds.length
                                      };
                                      handleModalOpen();
                                      setSelectedRespondentScreen(screenData);
                                    }}
                                    className="relative border-0 bg-transparent p-0 cursor-pointer"
                                    type="button"
                                  >
                                    <img
                                      src={screen.image}
                                      alt={screen.name}
                                      className="w-16 h-12 object-cover rounded border pointer-events-none transition-colors border-border hover:border-primary"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </button>
                              );
                            })
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        )}
      </Card>

      {/* Modal for heatmap screen */}
      {selectedHeatmapScreen && createPortal(
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
          onClick={() => setSelectedHeatmapScreen(null)}
        >
          <div
            className="bg-card rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-xl font-semibold">
                {selectedHeatmapScreen.screen.name} ({selectedHeatmapScreen.screenIndex} из {selectedHeatmapScreen.totalScreens})
              </h3>
              <button
                onClick={() => setSelectedHeatmapScreen(null)}
                className="p-2 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-4 flex-shrink-0">
              <button
                onClick={() => setHeatmapView("heatmap")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapView === "heatmap"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Тепловая карта
              </button>
              <button
                onClick={() => setHeatmapView("clicks")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapView === "clicks"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Клики
              </button>
              <button
                onClick={() => setHeatmapView("image")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapView === "image"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Изображение
              </button>
            </div>

            <div className="flex gap-6 flex-1 min-h-0">
              <div className="flex-1 min-h-0 min-w-0 flex items-center justify-center">
                <div
                  className="relative rounded-lg overflow-hidden bg-black border border-border max-h-full max-w-full"
                  style={{ aspectRatio: `${selectedHeatmapScreen.screen.width} / ${selectedHeatmapScreen.screen.height}` }}
                >
                  {heatmapView === "image" && (
                    <img
                      src={selectedHeatmapScreen.screen.image}
                      alt={selectedHeatmapScreen.screen.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'flex items-center justify-center h-64 text-white';
                        errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                        target.parentElement?.appendChild(errorDiv);
                      }}
                    />
                  )}
                  {heatmapView === "heatmap" && (() => {
                    const heatmapData = getHeatmapData(selectedHeatmapScreen.screen.id);
                    const maxCount = Math.max(...heatmapData.map(c => c.count), 1);
                    return (
                      <div className="w-full h-full">
                        <HeatmapRenderer
                          data={heatmapData}
                          width={selectedHeatmapScreen.screen.width}
                          height={selectedHeatmapScreen.screen.height}
                          imageUrl={selectedHeatmapScreen.screen.image}
                          max={maxCount}
                        />
                      </div>
                    );
                  })()}
                  {heatmapView === "clicks" && (
                    <>
                      <img
                        src={selectedHeatmapScreen.screen.image}
                        alt={selectedHeatmapScreen.screen.name}
                        className="w-full h-full object-contain block"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'flex items-center justify-center h-64 text-white';
                          errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                          target.parentElement?.appendChild(errorDiv);
                        }}
                      />
                      <div className="absolute inset-0 pointer-events-none">
                        {getRawClicksForScreen(selectedHeatmapScreen.screen.id).map((click, idx) => (
                          <div
                            key={`summary-click-${click.x}-${click.y}-${idx}`}
                            className="absolute rounded-full bg-red-500 border-2 border-white"
                            style={{
                              left: `${(click.x / selectedHeatmapScreen.screen.width) * 100}%`,
                              top: `${(click.y / selectedHeatmapScreen.screen.height) * 100}%`,
                              width: '16px',
                              height: '16px',
                              transform: 'translate(-50%, -50%)',
                              opacity: click.isFallback ? 0.5 : 0.9
                            }}
                            title={click.isFallback ? 'Координаты не записаны' : (click.count > 1 ? `${click.count} кликов` : 'Клик')}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="w-64 space-y-4 flex-shrink-0 overflow-auto">
                {(() => {
                  const stats = getScreenStats(selectedHeatmapScreen.screen.id);
                  return (
                    <>
                      <div>
                        <div className="text-sm text-muted-foreground">Респонденты</div>
                        <div className="text-lg font-semibold">{stats.respondents}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Всего кликов</div>
                        <div className="text-lg font-semibold">{stats.totalClicks}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Промахи</div>
                        <div className="text-lg font-semibold">{stats.misses}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Среднее время</div>
                        <div className="text-lg font-semibold">{stats.avgTime.toFixed(2)} с</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Медианное время</div>
                        <div className="text-lg font-semibold">{stats.medianTime.toFixed(2)} с</div>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <div className="text-sm font-medium mb-2">Настройки</div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="only-first-clicks"
                            checked={onlyFirstClicks}
                            onCheckedChange={(checked) => setOnlyFirstClicks(checked === true)}
                          />
                          <Label htmlFor="only-first-clicks" className="text-sm">
                            Только первые клики
                          </Label>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal for respondent screen */}
      {(() => {
        if (!selectedRespondentScreen) {
          return null;
        }
        return createPortal(
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
          onClick={(e) => {
            // Prevent closing if modal was just opened (prevents click event from button bubbling)
            if (localModalJustOpened) {
              e.stopPropagation();
              return;
            }
            setSelectedRespondentScreen(null);
            handleModalClose();
          }}
        >
          <div
            className="bg-card rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-xl font-semibold">
                {selectedRespondentScreen.screen.name} ({selectedRespondentScreen.screenIndex} из {selectedRespondentScreen.totalScreens})
              </h3>
              <button
                onClick={() => {
                  setSelectedRespondentScreen(null);
                  handleModalClose();
                }}
                className="p-2 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-4 flex-shrink-0">
              <button
                onClick={() => setRespondentHeatmapView("heatmap")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "heatmap"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Тепловая карта
              </button>
              <button
                onClick={() => setRespondentHeatmapView("clicks")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "clicks"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Клики
              </button>
              <button
                onClick={() => setRespondentHeatmapView("image")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "image"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Изображение
              </button>
            </div>

            <div className="flex gap-6 flex-1 min-h-0">
              <div className="flex-1 min-h-0 min-w-0 flex items-center justify-center">
                <div
                  className="relative rounded-lg overflow-hidden bg-black border border-border max-h-full max-w-full"
                  style={{ aspectRatio: `${selectedRespondentScreen.screen.width} / ${selectedRespondentScreen.screen.height}` }}
                >
                  {respondentHeatmapView === "image" && (
                    <img
                      src={selectedRespondentScreen.screen.image}
                      alt={selectedRespondentScreen.screen.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'flex items-center justify-center h-64 text-white';
                        errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                        target.parentElement?.appendChild(errorDiv);
                      }}
                    />
                  )}
                  {respondentHeatmapView === "heatmap" && (() => {
                    const sessionClicks = events
                      .filter(e => 
                        e.session_id === selectedRespondentScreen.session.id &&
                        e.screen_id === selectedRespondentScreen.screen.id &&
                        (e.event_type === "click" || e.event_type === "hotspot_click") &&
                        e.x !== undefined && e.y !== undefined
                      );
                    
                    // Преобразуем в формат для тепловой карты (группируем по координатам)
                    const clickMap: Record<string, { x: number; y: number; count: number }> = {};
                    sessionClicks.forEach(e => {
                      const key = `${Math.floor(e.x! / 10) * 10}_${Math.floor(e.y! / 10) * 10}`;
                      if (!clickMap[key]) {
                        clickMap[key] = { x: e.x!, y: e.y!, count: 0 };
                      }
                      clickMap[key].count += 1;
                    });
                    
                    const heatmapData = Object.values(clickMap);
                    const maxCount = Math.max(...heatmapData.map(c => c.count), 1);
                    
                    return (
                      <div className="w-full h-full">
                        <HeatmapRenderer
                          data={heatmapData}
                          width={selectedRespondentScreen.screen.width}
                          height={selectedRespondentScreen.screen.height}
                          imageUrl={selectedRespondentScreen.screen.image}
                          max={maxCount}
                        />
                      </div>
                    );
                  })()}
                  {respondentHeatmapView === "clicks" && (
                    <>
                      <img
                        src={selectedRespondentScreen.screen.image}
                        alt={selectedRespondentScreen.screen.name}
                        className="w-full h-full object-contain block"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'flex items-center justify-center h-64 text-white';
                          errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                          target.parentElement?.appendChild(errorDiv);
                        }}
                      />
                      {(() => {
                        const sessionClicks = events
                          .filter(e => 
                            e.session_id === selectedRespondentScreen.session.id &&
                            e.screen_id === selectedRespondentScreen.screen.id &&
                            (e.event_type === "click" || e.event_type === "hotspot_click") &&
                            e.x !== undefined && e.y !== undefined
                          )
                          .map((e, idx) => ({ ...e, clickOrder: idx + 1 }));
                        
                        return (
                          <div className="absolute inset-0 pointer-events-none">
                            {sessionClicks.map((click, idx) => (
                              <div
                                key={`session-click-${click.x}-${click.y}-${idx}`}
                                className="absolute rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                                style={{
                                  left: `${(click.x! / selectedRespondentScreen.screen.width) * 100}%`,
                                  top: `${(click.y! / selectedRespondentScreen.screen.height) * 100}%`,
                                  width: '24px',
                                  height: '24px',
                                  transform: 'translate(-50%, -50%)'
                                }}
                                title={`Клик ${click.clickOrder}`}
                              >
                                {showClickOrder && click.clickOrder}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>

              <div className="w-64 space-y-4 flex-shrink-0 overflow-auto">
                {(() => {
                  const sessionEvents = events.filter(e => 
                    e.session_id === selectedRespondentScreen.session.id &&
                    e.screen_id === selectedRespondentScreen.screen.id
                  );
                  const clicks = sessionEvents.filter(e => 
                    e.event_type === "click" || e.event_type === "hotspot_click"
                  );
                  const misses = clicks.filter(e => !e.hotspot_id).length;
                  
                  // Calculate time on screen
                  const screenLoad = sessionEvents.find(e => e.event_type === "screen_load");
                  const nextScreenLoad = events.find(e => 
                    e.session_id === selectedRespondentScreen.session.id &&
                    e.timestamp > (screenLoad?.timestamp || '') &&
                    e.event_type === "screen_load"
                  );
                  const timeOnScreen = screenLoad && nextScreenLoad
                    ? (new Date(nextScreenLoad.timestamp).getTime() - new Date(screenLoad.timestamp).getTime()) / 1000
                    : 0;

                  return (
                    <>
                      <div>
                        <div className="text-sm text-muted-foreground">Всего кликов</div>
                        <div className="text-lg font-semibold">{clicks.length}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Промахов</div>
                        <div className="text-lg font-semibold">{misses}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Время на экране</div>
                        <div className="text-lg font-semibold">{timeOnScreen.toFixed(2)} с</div>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <div className="text-sm font-medium mb-2">Настройки</div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="click-order"
                            checked={showClickOrder}
                            onCheckedChange={(checked) => setShowClickOrder(checked === true)}
                          />
                          <Label htmlFor="click-order" className="text-sm">
                            Порядок кликов
                          </Label>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
        );
      })()}
    </div>
  );
}

// All Blocks Report View - shows all blocks in one card with 1px borders
interface AllBlocksReportViewProps {
  blocks: StudyBlock[];
  sessionId: string | undefined;
  runId: string;
  responses: StudyBlockResponse[];
  sessions: Session[];
  events: any[];
  prototypes: Record<string, Proto>;
  gazePoints?: GazePointRow[];
  onDeleteResponses?: (blockId: string) => Promise<void>;
  onRecordingDeleted?: () => void;
}

function AllBlocksReportView({
  blocks,
  sessionId: _sessionId,
  runId,
  responses,
  sessions,
  events,
  prototypes,
  gazePoints = [],
  onDeleteResponses,
  onRecordingDeleted
}: AllBlocksReportViewProps) {
  // State for modal
  const [selectedRespondentScreen, setSelectedRespondentScreen] = useState<{
    screen: Screen;
    proto: Proto;
    session: Session;
    screenIndex: number;
    totalScreens: number;
  } | null>(null);
  const [modalJustOpened, setModalJustOpened] = useState(false);
  const [localModalJustOpened, setLocalModalJustOpened] = useState(false);
  const [respondentHeatmapView, setRespondentHeatmapView] = useState<HeatmapView>("heatmap");
  const [showClickOrder, setShowClickOrder] = useState(false);
  const [recordingModal, setRecordingModal] = useState<RecordingModalData | null>(null);

  // Используем локальное состояние для modalJustOpened
  const handleModalOpen = () => {
    setLocalModalJustOpened(true);
    setModalJustOpened(true);
    setTimeout(() => {
      setLocalModalJustOpened(false);
    }, 100);
  };
  
  const handleModalClose = () => {
    setLocalModalJustOpened(false);
    setModalJustOpened(false);
  };

  // Reset modalJustOpened flag after a short delay to prevent immediate backdrop clicks
  useEffect(() => {
    if (selectedRespondentScreen && modalJustOpened) {
      const timer = setTimeout(() => {
        setModalJustOpened(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedRespondentScreen, modalJustOpened]);

  // Фильтруем блоки, у которых есть ответы (исключаем soft-deleted)
  // Для блока "Прототип" проверяем наличие sessions, для остальных - responses
  const blocksWithResponses = useMemo(() => {
    return blocks.filter(block => !block.deleted_at && (
      block.type === "prototype"
        ? sessions.some(s => s.block_id === block.id)
        : responses.some(r => r.block_id === block.id)
    ));
  }, [blocks, sessions, responses]);
  
  return (
    <div className="max-w-full">
      <Card className="p-0 overflow-hidden">
        <div className="space-y-0">
          {blocksWithResponses.map((block, index) => {
            const blockResponses = responses.filter(r => r.block_id === block.id);
            const blockSessions = sessions.filter(s => s.block_id === block.id);
            const blockEvents = events.filter(e => e.block_id === block.id);
            
            return (
              <div key={block.id} className="relative">
                {index > 0 && <div className="absolute top-0 left-0 right-0 h-px bg-border" />}
                <div className="p-4">
                  <BlockReportView
                    block={block}
                    blocks={blocks}
                    responses={blockResponses}
                    sessions={blockSessions}
                    events={blockEvents}
                    prototypes={prototypes}
                    viewMode="responses"
                    cardSortingView="matrix"
                    setCardSortingView={() => {}}
                    treeTestingView="common_paths"
                    setTreeTestingView={() => {}}
                    heatmapView="heatmap"
                    setHeatmapView={() => {}}
                    heatmapTab="by_screens"
                    setHeatmapTab={() => {}}
                    selectedHeatmapScreen={null}
                    setSelectedHeatmapScreen={() => {}}
                    selectedRespondentScreen={selectedRespondentScreen}
                    setSelectedRespondentScreen={setSelectedRespondentScreen}
                    respondentHeatmapView={respondentHeatmapView}
                    setRespondentHeatmapView={setRespondentHeatmapView}
                    expandedCategories={new Set()}
                    setExpandedCategories={() => {}}
                    expandedCards={new Set()}
                    setExpandedCards={() => {}}
                    searchCategoryQuery=""
                    setSearchCategoryQuery={() => {}}
                    searchCardQuery=""
                    setSearchCardQuery={() => {}}
                    showHiddenCategories={false}
                    setShowHiddenCategories={() => {}}
                    onlyFirstClicks={false}
                    setOnlyFirstClicks={() => {}}
                    showClickOrder={false}
                    setShowClickOrder={() => {}}
                    setModalJustOpened={setModalJustOpened}
                    recordingModal={recordingModal}
                    setRecordingModal={setRecordingModal}
                    gazePoints={gazePoints}
                    onDeleteResponses={onDeleteResponses}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Modal for respondent screen */}
      {(() => {
        if (!selectedRespondentScreen) {
          return null;
        }
        return createPortal(
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
          onClick={(e) => {
            // Prevent closing if modal was just opened (prevents click event from button bubbling)
            if (localModalJustOpened) {
              e.stopPropagation();
              return;
            }
            setSelectedRespondentScreen(null);
            handleModalClose();
          }}
        >
          <div
            className="bg-card rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-xl font-semibold">
                {selectedRespondentScreen.screen.name} ({selectedRespondentScreen.screenIndex} из {selectedRespondentScreen.totalScreens})
              </h3>
              <button
                onClick={() => {
                  setSelectedRespondentScreen(null);
                  handleModalClose();
                }}
                className="p-2 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-4 flex-shrink-0">
              <button
                onClick={() => setRespondentHeatmapView("heatmap")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "heatmap"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Тепловая карта
              </button>
              <button
                onClick={() => setRespondentHeatmapView("clicks")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "clicks"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Клики
              </button>
              <button
                onClick={() => setRespondentHeatmapView("image")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "image"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Изображение
              </button>
            </div>

            <div className="flex gap-6 flex-1 min-h-0">
              <div className="flex-1 min-h-0 min-w-0 flex items-center justify-center">
                <div
                  className="relative rounded-lg overflow-hidden bg-black border border-border max-h-full max-w-full"
                  style={{ aspectRatio: `${selectedRespondentScreen.screen.width} / ${selectedRespondentScreen.screen.height}` }}
                >
                  {respondentHeatmapView === "image" && (
                    <img
                      src={selectedRespondentScreen.screen.image}
                      alt={selectedRespondentScreen.screen.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'flex items-center justify-center h-64 text-white';
                        errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                        target.parentElement?.appendChild(errorDiv);
                      }}
                    />
                  )}
                  {respondentHeatmapView === "heatmap" && (() => {
                    const sessionClicks = events
                      .filter(e => 
                        e.session_id === selectedRespondentScreen.session.id &&
                        e.screen_id === selectedRespondentScreen.screen.id &&
                        (e.event_type === "click" || e.event_type === "hotspot_click") &&
                        e.x !== undefined && e.y !== undefined
                      );
                    
                    // Преобразуем в формат для тепловой карты (группируем по координатам)
                    const clickMap: Record<string, { x: number; y: number; count: number }> = {};
                    sessionClicks.forEach(e => {
                      const key = `${Math.floor(e.x! / 10) * 10}_${Math.floor(e.y! / 10) * 10}`;
                      if (!clickMap[key]) {
                        clickMap[key] = { x: e.x!, y: e.y!, count: 0 };
                      }
                      clickMap[key].count += 1;
                    });
                    
                    const heatmapData = Object.values(clickMap);
                    const maxCount = Math.max(...heatmapData.map(c => c.count), 1);
                    
                    return (
                      <div className="w-full h-full">
                        <HeatmapRenderer
                          data={heatmapData}
                          width={selectedRespondentScreen.screen.width}
                          height={selectedRespondentScreen.screen.height}
                          imageUrl={selectedRespondentScreen.screen.image}
                          max={maxCount}
                        />
                      </div>
                    );
                  })()}
                  {respondentHeatmapView === "clicks" && (
                    <>
                      <img
                        src={selectedRespondentScreen.screen.image}
                        alt={selectedRespondentScreen.screen.name}
                        className="w-full h-full object-contain block"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'flex items-center justify-center h-64 text-white';
                          errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                          target.parentElement?.appendChild(errorDiv);
                        }}
                      />
                      {(() => {
                        const sessionClicks = events
                          .filter(e => 
                            e.session_id === selectedRespondentScreen.session.id &&
                            e.screen_id === selectedRespondentScreen.screen.id &&
                            (e.event_type === "click" || e.event_type === "hotspot_click") &&
                            e.x !== undefined && e.y !== undefined
                          )
                          .map((e, idx) => ({ ...e, clickOrder: idx + 1 }));
                        
                        return (
                          <div className="absolute inset-0 pointer-events-none">
                            {sessionClicks.map((click, idx) => (
                              <div
                                key={`session-click-${click.x}-${click.y}-${idx}`}
                                className="absolute rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                                style={{
                                  left: `${(click.x! / selectedRespondentScreen.screen.width) * 100}%`,
                                  top: `${(click.y! / selectedRespondentScreen.screen.height) * 100}%`,
                                  width: '24px',
                                  height: '24px',
                                  transform: 'translate(-50%, -50%)'
                                }}
                                title={`Клик ${click.clickOrder}`}
                              >
                                {showClickOrder && click.clickOrder}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>

              <div className="w-64 space-y-4 flex-shrink-0 overflow-auto">
                {(() => {
                  const sessionEvents = events.filter(e => 
                    e.session_id === selectedRespondentScreen.session.id &&
                    e.screen_id === selectedRespondentScreen.screen.id
                  );
                  const clicks = sessionEvents.filter(e => 
                    e.event_type === "click" || e.event_type === "hotspot_click"
                  );
                  const misses = clicks.filter(e => !e.hotspot_id).length;
                  
                  // Calculate time on screen
                  const screenLoad = sessionEvents.find(e => e.event_type === "screen_load");
                  const nextScreenLoad = events.find(e => 
                    e.session_id === selectedRespondentScreen.session.id &&
                    e.timestamp > (screenLoad?.timestamp || '') &&
                    e.event_type === "screen_load"
                  );
                  const timeOnScreen = screenLoad && nextScreenLoad
                    ? (new Date(nextScreenLoad.timestamp).getTime() - new Date(screenLoad.timestamp).getTime()) / 1000
                    : 0;

                  return (
                    <>
                      <div>
                        <div className="text-sm text-muted-foreground">Всего кликов</div>
                        <div className="text-lg font-semibold">{clicks.length}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Промахов</div>
                        <div className="text-lg font-semibold">{misses}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Время на экране</div>
                        <div className="text-lg font-semibold">{timeOnScreen.toFixed(2)} с</div>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <div className="text-sm font-medium mb-2">Настройки</div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="click-order"
                            checked={showClickOrder}
                            onCheckedChange={(checked) => setShowClickOrder(checked === true)}
                          />
                          <Label htmlFor="click-order" className="text-sm">
                            Порядок кликов
                          </Label>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
        );
      })()}

      {/* Modal: экран — основной плеер, камера — PiP слева внизу */}
      {recordingModal && (recordingModal.urls.camera || recordingModal.urls.screen) && createPortal(
        <RecordingModalContent
          recordingModalUrls={recordingModal.urls}
          sessionId={recordingModal.sessionId}
          sessionStartedAt={recordingModal.sessionStartedAt}
          sessionGazePoints={recordingModal.sessionGazePoints}
          onClose={() => setRecordingModal(null)}
          onDeleted={onRecordingDeleted}
        />,
        document.body
      )}
    </div>
  );
}
