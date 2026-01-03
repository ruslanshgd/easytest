/**
 * FigmaEmbedViewer - Использует публичный Figma embed iframe для точного canvas-based рендеринга
 * Обеспечивает корректное отображение дизайна из Figma, как у pthwy.ru
 * 
 * Особенности:
 * - Маскирует UI Figma (скрывает элементы управления)
 * - Показывает loading overlay с blur и затемнением во время загрузки
 * - Использует FigmaEventProxyService для перехвата событий через прозрачные overlay
 * - Поддерживает переходы между экранами через обновление nodeId
 */
import React, { useEffect, useRef, useState } from "react";
import type { Hotspot } from "../types/proto";
import { FigmaEventProxyService } from "../services/FigmaEventProxyService";

// НОВОЕ: Тип для экрана/сцены с figmaNodeId
type ScreenOrSceneWithFigmaNodeId = {
  id: string;
  figmaNodeId?: string;
};

// EMBED KIT 2.0: Типы для событий от Figma
interface FigmaPresentedNodeChangedEvent {
  type: "PRESENTED_NODE_CHANGED";
  data: {
    presentedNodeId: string;
    interactionType?: "ON_CLICK" | "AFTER_TIMEOUT" | "ON_HOVER" | "ON_PRESS" | "ON_DRAG" | "MOUSE_ENTER" | "MOUSE_LEAVE" | "MOUSE_UP" | "MOUSE_DOWN" | "KEY_DOWN";
    isStoredInHistory: boolean;
    stateMappings?: Record<string, string>;
  };
}

interface FigmaMousePressOrReleaseEvent {
  type: "MOUSE_PRESS_OR_RELEASE";
  data: {
    pressed: boolean; // true = press, false = release
    point?: { x: number; y: number }; // координаты клика
    targetNodeId?: string;
    targetNodeMousePosition?: { x: number; y: number };
    presentedNodeId?: string;
    nearestScrollingFrameId?: string | null;
    nearestScrollingFrameMousePosition?: { x: number; y: number } | null;
    nearestScrollingFrameOffset?: { x: number; y: number } | null;
  };
}

interface FigmaInitialLoadEvent {
  type: "INITIAL_LOAD";
  data: {
    presentedNodeId: string;
  };
}

interface FigmaNewStateEvent {
  type: "NEW_STATE";
  data: {
    stateMappings: Record<string, string>;
    currentPageId?: string;
    currentTopLevelFrameId?: string;
  };
}

// Alias для совместимости
type FigmaMousePressEvent = FigmaMousePressOrReleaseEvent;

type FigmaEmbedEvent = FigmaPresentedNodeChangedEvent | FigmaMousePressOrReleaseEvent | FigmaInitialLoadEvent | FigmaNewStateEvent;

interface FigmaEmbedViewerProps {
  fileId: string;
  nodeId: string; // starting-point-node-id (format: pageId:nodeId)
  fileName?: string;
  hotspots: Hotspot[];
  onHotspotClick: (hotspot: Hotspot, clickX?: number, clickY?: number, currentScreenId?: string | null) => void;
  // КРИТИЧНО: onHotspotHoverEnter/onHotspotHoverLeave НЕ используются для Figma embed для навигации
  // Но мы можем использовать их для обработки overlay actions (tooltip на hover) БЕЗ навигации
  onHotspotHoverEnter?: (hotspot: Hotspot) => void; // НОВОЕ: Для обработки overlay actions на hover (tooltip)
  onHotspotHoverLeave?: (hotspot: Hotspot) => void; // НОВОЕ: Для закрытия overlay на hover leave
  onScreenChange?: (figmaNodeId: string) => void; // КРИТИЧНО: Callback для обновления currentScreen при изменении экрана в Figma
  onEmptyAreaClick?: (clickX: number, clickY: number, screenId: string | null) => void; // НОВОЕ: Callback для кликов в пустую область
  protoEnd?: string; // НОВОЕ: ID финального экрана для проверки хотспотов, ведущих на финальный экран
  currentScreen?: string; // НОВОЕ: ID текущего экрана для фильтрации хотспотов
  allScreensOrScenes?: ScreenOrSceneWithFigmaNodeId[]; // НОВОЕ: Все экраны/сцены для поиска хотспота по figmaNodeId
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  debugOverlayEnabled?: boolean;
  // EMBED KIT 2.0: OAuth client-id для получения событий
  figmaClientId?: string; // OAuth client-id из Figma Developer Console
  embedHost?: string; // Идентификатор вашего приложения для Figma (default: "figma-analytics")
  // Опции для Figma embed
  hideUI?: boolean;
  hotspotHints?: boolean;
  scaling?: "scale-down" | "contain" | "min-zoom" | "scale-down-width" | "fit-width" | "free"; // EMBED KIT 2.0 scaling options
  bgColor?: string;
  fps?: number;
  footer?: boolean; // EMBED KIT 2.0: показывать footer Figma
  viewportControls?: boolean; // EMBED KIT 2.0: разрешить zoom/pan
  deviceFrame?: boolean; // EMBED KIT 2.0: показывать device frame
}

export function FigmaEmbedViewer({
  fileId,
  nodeId,
  fileName = "fileName",
  hotspots: _hotspots, // НОВОЕ: Используются для трекинга аналитики
  onHotspotClick: _onHotspotClick, // НОВОЕ: Используется для трекинга кликов
  // КРИТИЧНО: onHotspotHoverEnter/onHotspotHoverLeave используются ТОЛЬКО для overlay actions (tooltip на hover)
  // НЕ для навигации - Figma embed сам обрабатывает hover и навигацию
  onHotspotHoverEnter: _onHotspotHoverEnter, // НОВОЕ: Для обработки overlay actions на hover (tooltip)
  onHotspotHoverLeave: _onHotspotHoverLeave, // НОВОЕ: Для закрытия overlay на hover leave
  onScreenChange, // КРИТИЧНО: Callback для обновления currentScreen
  onEmptyAreaClick: _onEmptyAreaClick, // НОВОЕ: Callback для кликов в пустую область
  protoEnd: _protoEnd, // НОВОЕ: ID финального экрана (может использоваться в будущем)
  currentScreen, // НОВОЕ: ID текущего экрана
  allScreensOrScenes = [], // НОВОЕ: Все экраны/сцены для поиска хотспота по figmaNodeId
  width,
  height,
  style,
  debugOverlayEnabled: _debugOverlayEnabled = false,
  // EMBED KIT 2.0: OAuth параметры
  figmaClientId, // OAuth client-id - если не указан, используется Embed Kit 1.0 (без событий)
  embedHost = "figma-analytics", // Идентификатор приложения
  // Опции для Figma embed
  hideUI = true,
  hotspotHints = false,
  scaling = "scale-down-width",
  bgColor = "000000",
  fps = 10,
  footer = false, // EMBED KIT 2.0: по умолчанию скрываем footer
  viewportControls = false, // EMBED KIT 2.0: по умолчанию отключаем zoom/pan
  deviceFrame = false, // EMBED KIT 2.0: по умолчанию без device frame
}: FigmaEmbedViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousNodeIdRef = useRef<string | null>(null);
  
  // КРИТИЧНО: Создаем экземпляр FigmaEventProxyService для перехвата событий
  const eventProxyServiceRef = useRef<FigmaEventProxyService | null>(null);
  
  // Инициализируем EventProxyService при монтировании компонента
  useEffect(() => {
    eventProxyServiceRef.current = new FigmaEventProxyService({
      onHotspotClick: (hotspot, clickX, clickY, currentScreenId) => {
        console.log("FigmaEmbedViewer: EventProxyService - Hotspot clicked", {
          hotspotId: hotspot.id,
          hotspotName: hotspot.name,
          target: hotspot.target,
          hotspotFrame: hotspot.frame,
          currentScreenId: currentScreenId, // КРИТИЧНО: Актуальный screen_id из EventProxyService
          coordinates: { x: clickX, y: clickY }
        });
        // КРИТИЧНО: Вызываем onHotspotClick только для записи в аналитику
        // НЕ вызываем навигацию - Figma embed сам обрабатывает клики и переходы
        // Передаем актуальный currentScreenId для правильного screen_id в аналитике
        _onHotspotClick(hotspot, clickX, clickY, currentScreenId);
      },
      // КРИТИЧНО: Добавляем трекинг hover для аналитики И обработку overlay actions (tooltip на hover)
      // Figma embed сам обрабатывает hover и навигацию, но мы трекаем hover для аналитики и обрабатываем overlay actions
      onHotspotHoverEnter: (hotspot) => {
        console.log("FigmaEmbedViewer: EventProxyService - Hotspot hover enter", {
          hotspotId: hotspot.id,
          hotspotName: hotspot.name,
          target: hotspot.target,
          hasOverlayAction: !!hotspot.overlayAction,
          overlayActionType: hotspot.overlayAction?.type,
          overlayActionOverlayId: hotspot.overlayAction?.overlayId
        });
        // КРИТИЧНО: Обрабатываем overlay actions на hover (например, tooltip) БЕЗ навигации
        // Это необходимо для правильной работы tooltip на hover
        // НЕ вызываем навигацию - Figma embed сам обрабатывает hover
        // Вызываем callback ТОЛЬКО для overlay actions с триггером ON_HOVER, не для ON_CLICK
        // ВАЖНО: Проверяем trigger, чтобы не открывать модалки на hover (они должны открываться только на клик)
        if (_onHotspotHoverEnter && hotspot.overlayAction && hotspot.overlayAction.type === "OPEN_OVERLAY" && hotspot.trigger === "ON_HOVER") {
          console.log("FigmaEmbedViewer: Calling onHotspotHoverEnter for overlay action (tooltip) - ON_HOVER trigger", {
            hotspotId: hotspot.id,
            overlayActionType: hotspot.overlayAction.type,
            overlayActionOverlayId: hotspot.overlayAction.overlayId,
            trigger: hotspot.trigger
          });
          _onHotspotHoverEnter(hotspot);
        } else if (hotspot.overlayAction && hotspot.overlayAction.type === "OPEN_OVERLAY" && hotspot.trigger !== "ON_HOVER") {
          console.log("FigmaEmbedViewer: Skipping onHotspotHoverEnter for overlay action - not ON_HOVER trigger", {
            hotspotId: hotspot.id,
            overlayActionType: hotspot.overlayAction.type,
            trigger: hotspot.trigger,
            note: "Overlay will open on click, not on hover"
          });
        }
      },
      onHotspotHoverLeave: (hotspot) => {
        console.log("FigmaEmbedViewer: EventProxyService - Hotspot hover leave", {
          hotspotId: hotspot.id,
          hotspotName: hotspot.name,
          target: hotspot.target,
          hasOverlayAction: !!hotspot.overlayAction,
          overlayActionType: hotspot.overlayAction?.type
        });
        // КРИТИЧНО: Закрываем overlay на hover leave (например, tooltip)
        // Вызываем callback ТОЛЬКО для overlay actions с триггером ON_HOVER, не для ON_CLICK
        // ВАЖНО: Проверяем trigger, чтобы не закрывать модалки на hover leave (они должны закрываться только по кнопке)
        if (_onHotspotHoverLeave && hotspot.overlayAction && hotspot.overlayAction.type === "OPEN_OVERLAY" && hotspot.trigger === "ON_HOVER") {
          console.log("FigmaEmbedViewer: Calling onHotspotHoverLeave for overlay action (tooltip) - ON_HOVER trigger", {
            hotspotId: hotspot.id,
            overlayActionType: hotspot.overlayAction.type,
            trigger: hotspot.trigger
          });
          _onHotspotHoverLeave(hotspot);
        } else if (hotspot.overlayAction && hotspot.overlayAction.type === "OPEN_OVERLAY" && hotspot.trigger !== "ON_HOVER") {
          console.log("FigmaEmbedViewer: Skipping onHotspotHoverLeave for overlay action - not ON_HOVER trigger", {
            hotspotId: hotspot.id,
            overlayActionType: hotspot.overlayAction.type,
            trigger: hotspot.trigger,
            note: "Overlay will close on button click, not on hover leave"
          });
        }
      },
      onScreenChange: (figmaNodeId) => {
        console.log("FigmaEmbedViewer: EventProxyService - Screen changed", {
          figmaNodeId
        });
        if (onScreenChange) {
          onScreenChange(figmaNodeId);
        }
      },
      debug: false // Отключено для production - убираем красную обводку hotspots
    });
    
    // Устанавливаем контейнер для рендеринга overlay
    eventProxyServiceRef.current.setContainer(containerRef);
    
    // Очистка при размонтировании
    return () => {
      if (eventProxyServiceRef.current) {
        eventProxyServiceRef.current.cleanup();
        eventProxyServiceRef.current = null;
      }
    };
  }, []); // Запускаем только при монтировании
  
  // EMBED KIT 2.0: Формируем URL для Figma embed
  // Документация: https://developers.figma.com/docs/embeds/embed-figma-prototype/
  // URL формат: embed.figma.com/proto/{fileId}?embed-host=...&client-id=...
  const getIframeUrl = (currentNodeId: string) => {
    // EMBED KIT 2.0: Новый формат URL
    const params = new URLSearchParams();
    
    // ОБЯЗАТЕЛЬНЫЕ параметры
    params.append("embed-host", embedHost); // Идентификатор вашего приложения
    
    // EMBED KIT 2.0: client-id ОБЯЗАТЕЛЕН для получения событий через Embed API
    if (figmaClientId) {
      params.append("client-id", figmaClientId);
    }
    
    // Параметры для указания стартового экрана
    if (currentNodeId) {
      params.append("node-id", currentNodeId); // Экран для отображения при загрузке
      params.append("starting-point-node-id", currentNodeId); // Стартовая точка для рестарта
    }
    
    // EMBED KIT 2.0: Параметры управления UI (используем 1/0 формат)
    params.append("hide-ui", hideUI ? "1" : "0"); // Скрывает все элементы UI
    params.append("footer", footer ? "1" : "0");
    params.append("viewport-controls", viewportControls ? "1" : "0");
    params.append("hotspot-hints", hotspotHints ? "1" : "0");
    params.append("device-frame", deviceFrame ? "1" : "0");
    params.append("disable-default-keyboard-nav", "1"); // Отключаем стандартную навигацию
    
    // Параметры масштабирования (EMBED KIT 2.0 поддерживает больше опций)
    params.append("scaling", scaling);
    
    // EMBED KIT 2.0: URL формат embed.figma.com/proto/{fileId}
    const embedUrl = `https://embed.figma.com/proto/${fileId}?${params.toString()}`;
    
    console.log("FigmaEmbedViewer: Generated Embed Kit 2.0 URL", {
      fileId,
      nodeId: currentNodeId,
      hasClientId: !!figmaClientId,
      embedHost,
      url: embedUrl.substring(0, 150) + "..."
    });
    
    return embedUrl;
  };
  
  const [iframeUrl, setIframeUrl] = useState<string>(getIframeUrl(nodeId));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // НОВОЕ: Логируем создание/обновление компонента для отладки (после инициализации всех переменных)
  console.log("FigmaEmbedViewer: Component render", { 
    fileId, 
    nodeId, 
    hotspotsCount: _hotspots.length,
    isLoading,
    iframeUrl: iframeUrl ? iframeUrl.substring(0, 100) + "..." : "empty"
  });

  // КРИТИЧНО: Загружаем iframe ОДИН РАЗ с начальным nodeId (figmaStartNodeId)
  // ВАЖНО: НЕ обновляем URL при изменении nodeId - позволяем Figma обрабатывать переходы через свои хотспоты
  // Это предотвращает повторные загрузки "Загрузка прототипа" при кликах
  useEffect(() => {
    // Инициализируем только один раз, если iframeUrl еще не установлен
    if (!iframeUrl && nodeId) {
      console.log("FigmaEmbedViewer: Initializing iframe with start nodeId (ONE TIME ONLY)", { 
        nodeId,
        fileId,
        fileName
      });
      previousNodeIdRef.current = nodeId;
      setIframeUrl(getIframeUrl(nodeId));
      setIsLoading(true);
    }
    // НЕ обновляем URL при изменении nodeId - Figma сам обрабатывает переходы
  }, [fileId, fileName, hideUI, hotspotHints, scaling, bgColor, fps]); // Убрали nodeId из зависимостей

  // КРИТИЧНО: Глобальный обработчик ошибок для перехвата SecurityError от Figma iframe
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // КРИТИЧНО: Игнорируем SecurityError от Figma iframe - это нормально для cross-origin iframe
      if (event.error && event.error.name === "SecurityError") {
        // Это нормально для cross-origin iframe - не логируем как ошибку
        event.preventDefault(); // Предотвращаем вывод ошибки в консоль
        return;
      }
      // Для других ошибок позволяем стандартную обработку
    };

    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("error", handleError);
    };
  }, []);

  // Обработка загрузки iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let loadTimeoutId: number | null = null;
    let fallbackTimeoutId: number | null = null;

    const handleLoad = () => {
      console.log("FigmaEmbedViewer: iframe loaded event fired, will hide overlay in 2 seconds");
      // НОВОЕ: Очищаем fallback таймаут, так как событие load сработало
      if (fallbackTimeoutId) {
        clearTimeout(fallbackTimeoutId);
        fallbackTimeoutId = null;
      }
      // Даем задержку для полной загрузки контента Figma (может потребоваться больше времени)
      loadTimeoutId = window.setTimeout(() => {
        console.log("FigmaEmbedViewer: Loading timeout completed, hiding overlay");
        setIsLoading(false);
      }, 2000); // НОВОЕ: Увеличиваем таймаут до 2 секунд для Figma embed
    };

    const handleError = () => {
      console.error("FigmaEmbedViewer: iframe load error");
      setLoadError("Ошибка загрузки прототипа Figma");
      setIsLoading(false);
      if (loadTimeoutId) clearTimeout(loadTimeoutId);
      if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
    };

    iframe.addEventListener("load", handleLoad);
    iframe.addEventListener("error", handleError);

    // НОВОЕ: Fallback таймаут на случай, если событие load не сработает (для cross-origin iframe)
    // Это критично для Figma embed, так как мы не можем проверить contentDocument из-за CORS
    fallbackTimeoutId = window.setTimeout(() => {
      console.log("FigmaEmbedViewer: Fallback timeout - hiding loading overlay (iframe may be loaded)");
      setIsLoading(false);
    }, 5000); // НОВОЕ: Fallback через 5 секунд

    // НОВОЕ: Убираем проверку contentDocument - она не работает для cross-origin iframe
    // if (iframe.contentDocument?.readyState === "complete") {
    //   handleLoad();
    // }

    return () => {
      iframe.removeEventListener("load", handleLoad);
      iframe.removeEventListener("error", handleError);
      if (loadTimeoutId) clearTimeout(loadTimeoutId);
      if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId); // НОВОЕ: Очищаем fallback таймаут
      if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
    };
  }, [iframeUrl]);

  // КРИТИЧНО: Внутреннее состояние для отслеживания текущего экрана через PRESENTED_NODE_CHANGED
  // Это позволяет рендерить overlay для хотспотов текущего экрана сразу после перехода
  const [internalCurrentScreen, setInternalCurrentScreen] = React.useState<string | undefined>(currentScreen);
  
  // КРИТИЧНО: Синхронизируем internalCurrentScreen с currentScreen из пропсов
  // Это нужно для начального состояния и когда currentScreen обновляется извне
  useEffect(() => {
    if (currentScreen) {
      setInternalCurrentScreen(currentScreen);
    }
    
    // КРИТИЧНО: Обновляем EventProxyService при изменении currentScreen или hotspots
    if (eventProxyServiceRef.current) {
      console.log("FigmaEmbedViewer: Updating EventProxyService with new screen/hotspots", {
        currentScreen,
        hotspotsCount: _hotspots.length,
        screenHotspotsCount: _hotspots.filter(h => h.frame === currentScreen).length
      });
      eventProxyServiceRef.current.updateScreenAndHotspots(currentScreen || null, _hotspots);
    }
  }, [currentScreen, _hotspots]);
  
  // EMBED KIT 2.0: Слушаем postMessage события от Figma embed
  // Документация: https://developers.figma.com/docs/embeds/embed-api/
  // События: PRESENTED_NODE_CHANGED, MOUSE_PRESS_OR_RELEASE, INITIAL_LOAD, NEW_STATE
  useEffect(() => {
    // EMBED KIT 2.0: Проверяем наличие client-id
    const hasEmbedKit2 = !!figmaClientId;
    console.log("FigmaEmbedViewer: ✅ Setting up postMessage listener", {
      embedKit: hasEmbedKit2 ? "2.0" : "1.0 (no events)",
      hasClientId: hasEmbedKit2,
      embedHost
    });
    
    if (!hasEmbedKit2) {
      console.warn("FigmaEmbedViewer: ⚠️ figmaClientId not provided - Embed Kit 2.0 events will NOT be received. Using fallback tracking.");
    }
    
    const handleMessage = (event: MessageEvent) => {
      // EMBED KIT 2.0: Проверяем origin от Figma
      const figmaOrigins = ["https://www.figma.com", "https://embed.figma.com"];
      if (!figmaOrigins.some(origin => event.origin.startsWith(origin.replace("https://", "https://")))) {
        // Игнорируем события не от Figma (но не блокируем - могут быть другие форматы origin)
        if (event.origin !== "null" && !event.origin.includes("figma")) {
          return; // Не от Figma - игнорируем
        }
      }
      
      // EMBED KIT 2.0: Проверяем структуру события
      const eventData = event.data as FigmaEmbedEvent | { type?: string; data?: unknown };
      if (!eventData || typeof eventData !== "object") {
        return;
      }
      
      // EMBED KIT 2.0: Извлекаем тип и данные события
      // Структура: { type: "EVENT_TYPE", data: {...} }
      const eventType = eventData.type;
      const data = "data" in eventData ? eventData.data : eventData;
      
      // Логируем все события от Figma для отладки
      console.log("FigmaEmbedViewer: 🔵 Figma postMessage received", {
        type: eventType || "UNKNOWN",
        origin: event.origin,
        hasData: !!data,
        embedKit: hasEmbedKit2 ? "2.0" : "1.0",
        dataPreview: JSON.stringify(data).substring(0, 200)
      });
      
      // EMBED KIT 2.0: Обрабатываем INITIAL_LOAD - прототип загружен
      if (eventType === "INITIAL_LOAD") {
        const initialData = data as FigmaInitialLoadEvent["data"];
        console.log("FigmaEmbedViewer: 🟢 INITIAL_LOAD - Prototype ready", {
          presentedNodeId: initialData?.presentedNodeId
        });
        
        if (initialData?.presentedNodeId && onScreenChange) {
          onScreenChange(initialData.presentedNodeId);
        }
        return;
      }
      
      // EMBED KIT 2.0: Обрабатываем PRESENTED_NODE_CHANGED - переход на новый экран
      const nodeChangedData = data as FigmaPresentedNodeChangedEvent["data"];
      const presentedNodeId = nodeChangedData?.presentedNodeId;
      if (eventType === "PRESENTED_NODE_CHANGED" && presentedNodeId) {
        const interactionType = nodeChangedData?.interactionType;
        const isStoredInHistory = nodeChangedData?.isStoredInHistory;
        
        console.log("FigmaEmbedViewer: 🟢 PRESENTED_NODE_CHANGED received (Embed Kit 2.0)", {
          presentedNodeId,
          interactionType,
          isStoredInHistory, // ВАЖНО: true = forward navigation, false = back action
          hasOnScreenChange: !!onScreenChange
        });
        
        // EMBED KIT 2.0: Определяем тип навигации
        // isStoredInHistory: true = forward, false = back
        const isBackNavigation = isStoredInHistory === false;
        
        if (isBackNavigation) {
          console.log("FigmaEmbedViewer: 🔙 Back navigation detected via isStoredInHistory=false");
        }
        
        // КРИТИЧНО: При переходе на новый экран пытаемся найти хотспот для аналитики
        const previousScreen = internalCurrentScreen || currentScreen;
        if (previousScreen && _hotspots && _hotspots.length > 0 && _onHotspotClick && allScreensOrScenes.length > 0) {
          // Находим экран по presentedNodeId
          const targetScreen = allScreensOrScenes.find(s => 
            s.figmaNodeId === presentedNodeId || s.id === presentedNodeId
          );
          
          if (targetScreen) {
            // Ищем хотспот, который привел к переходу
            let targetHotspot = _hotspots.find(h => 
              h.frame === previousScreen && h.target === targetScreen.id
            );
            
            // Если не найден и это back navigation, ищем hotspot с target: null
            if (!targetHotspot && isBackNavigation) {
              const backHotspots = _hotspots.filter(h => 
                h.frame === previousScreen && (!h.target || h.overlayAction?.type === "BACK")
              );
              if (backHotspots.length > 0) {
                targetHotspot = backHotspots[0];
                console.log("FigmaEmbedViewer: Using back hotspot for analytics", {
                  hotspotId: targetHotspot.id,
                  fromScreen: previousScreen,
                  toScreen: targetScreen.id
                });
              }
            }
            
            if (targetHotspot && _onHotspotClick) {
              const clickX = (targetHotspot.x || 0) + (targetHotspot.w || 100) / 2;
              const clickY = (targetHotspot.y || 0) + (targetHotspot.h || 50) / 2;
              _onHotspotClick(targetHotspot, clickX, clickY);
            }
          } else {
            console.log("FigmaEmbedViewer: Target screen not found for presentedNodeId", {
              presentedNodeId,
              totalScreens: allScreensOrScenes.length,
              availableFigmaNodeIds: allScreensOrScenes.map(s => s.figmaNodeId).filter(Boolean).slice(0, 5)
            });
          }
        }
        
        // EMBED KIT 2.0: Обновляем EventProxyService с новым figmaNodeId
        if (eventProxyServiceRef.current) {
          eventProxyServiceRef.current.updateCurrentFigmaNodeId(presentedNodeId);
        }
        
        // EMBED KIT 2.0: Вызываем callback для обновления currentScreen в TestView
        if (onScreenChange) {
          // Проверяем, является ли это финальным экраном
          const targetScreen = allScreensOrScenes.find(s => 
            s.figmaNodeId === presentedNodeId || s.id === presentedNodeId
          );
          const isFinalScreen = targetScreen && _protoEnd && (
            targetScreen.id === _protoEnd || targetScreen.figmaNodeId === _protoEnd
          );
          
          console.log("FigmaEmbedViewer: Calling onScreenChange", {
            presentedNodeId,
            targetScreenId: targetScreen?.id,
            isFinalScreen
          });
          
          onScreenChange(presentedNodeId);
          
          if (isFinalScreen) {
            console.log("FigmaEmbedViewer: 🎯 Final screen detected via PRESENTED_NODE_CHANGED!");
          }
        }
        return;
      }
      
      // EMBED KIT 2.0: Обрабатываем MOUSE_PRESS_OR_RELEASE для записи ВСЕХ кликов
      if (eventType === "MOUSE_PRESS_OR_RELEASE") {
        const mouseData = data as FigmaMousePressEvent["data"];
        
        // Обрабатываем только нажатия (pressed = true), не отпускания
        if (mouseData?.pressed) {
          const clickX = mouseData.targetNodeMousePosition?.x || mouseData.point?.x || 0;
          const clickY = mouseData.targetNodeMousePosition?.y || mouseData.point?.y || 0;
          const screenIdForClick = currentScreen || internalCurrentScreen || null;
          
          console.log("FigmaEmbedViewer: 🖱️ MOUSE_PRESS_OR_RELEASE (pressed)", {
            clickX,
            clickY,
            screenId: screenIdForClick,
            targetNodeId: mouseData.targetNodeId,
            presentedNodeId: mouseData.presentedNodeId
          });
          
          // Проверяем, попал ли клик в какой-либо hotspot
          const clickedHotspot = _hotspots.find((h: Hotspot) => {
            if (h.frame !== screenIdForClick) return false;
            return (
              clickX >= h.x &&
              clickX <= h.x + h.w &&
              clickY >= h.y &&
              clickY <= h.y + h.h
            );
          });
          
          if (clickedHotspot) {
            // Клик по hotspot - записываем в аналитику через callback
            console.log("FigmaEmbedViewer: Hotspot click detected via postMessage", {
              hotspotId: clickedHotspot.id,
              hotspotName: clickedHotspot.name,
              clickX,
              clickY,
              screenId: screenIdForClick
            });
            
            // КРИТИЧНО: Вызываем callback для записи клика по хотспоту
            _onHotspotClick(clickedHotspot, clickX, clickY, screenIdForClick);
          } else {
            // Клик в пустую область - записываем для хитмапа
            console.log("FigmaEmbedViewer: Empty area click detected via postMessage", {
              clickX,
              clickY,
              screenId: screenIdForClick
            });
            
            // КРИТИЧНО: Вызываем callback для записи клика в пустую область
            if (_onEmptyAreaClick) {
              _onEmptyAreaClick(clickX, clickY, screenIdForClick);
            }
          }
        }
        return;
      }
      
      // EMBED KIT 2.0: Обрабатываем NEW_STATE (история навигации)
      if (eventType === "NEW_STATE") {
        const stateData = data as FigmaNewStateEvent["data"];
        console.log("FigmaEmbedViewer: 🔄 NEW_STATE", {
          currentPageId: stateData?.currentPageId,
          currentTopLevelFrameId: stateData?.currentTopLevelFrameId
        });
        return;
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [onScreenChange, _hotspots, currentScreen, _onHotspotClick, _onEmptyAreaClick, internalCurrentScreen, figmaClientId, embedHost, allScreensOrScenes, _protoEnd]);

  // НОВОЕ: Вычисляем реальные размеры для iframe
  const iframeWidth = width || 375; // Дефолт для мобильных прототипов
  const iframeHeight = height || 812; // Дефолт для мобильных прототипов

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: iframeWidth,
        height: iframeHeight,
        overflow: "hidden",
        margin: "0 auto", // Центрируем iframe
        ...style
      }}
    >
      {/* НОВОЕ: Loading overlay с blur и затемнением (как у pthwy.ru) */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "opacity 0.3s ease-out"
          }}
        >
          <div
            style={{
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: 500,
              textAlign: "center"
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "4px solid rgba(255, 255, 255, 0.3)",
                borderTopColor: "#ffffff",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px"
              }}
            />
            Загрузка прототипа...
          </div>
        </div>
      )}

      {/* НОВОЕ: Error overlay */}
      {loadError && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            backgroundColor: "rgba(244, 67, 54, 0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: 500,
            textAlign: "center",
            padding: "20px"
          }}
        >
          {loadError}
        </div>
      )}

      {/* НОВОЕ: Wrapper для iframe с CSS маскировкой UI Figma */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: iframeWidth,
          height: iframeHeight,
          overflow: "hidden",
          backgroundColor: bgColor ? `#${bgColor}` : "#000000"
        }}
        // КРИТИЧНО: onMouseDownCapture перехватывает клики ДО iframe в capture phase
        // Это позволяет записать клик в аналитику, не блокируя навигацию Figma
        onMouseDownCapture={(e) => {
          // Получаем координаты клика относительно контейнера
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          
          // КРИТИЧНО: Определяем screen_id для клика
          const screenIdForClick = currentScreen || eventProxyServiceRef.current?.getCurrentScreen() || null;
          
          // Проверяем, попал ли клик в какой-либо hotspot
          const clickedHotspot = _hotspots.find((h: Hotspot) => {
            if (h.frame !== currentScreen) return false;
            return (
              clickX >= h.x &&
              clickX <= h.x + h.w &&
              clickY >= h.y &&
              clickY <= h.y + h.h
            );
          });
          
          if (clickedHotspot) {
            // Клик по hotspot - записываем в аналитику
            console.log("FigmaEmbedViewer: Hotspot click detected (capture phase)", {
              hotspotId: clickedHotspot.id,
              hotspotName: clickedHotspot.name,
              target: clickedHotspot.target,
              clickX,
              clickY,
              screenId: screenIdForClick
            });
            
            // Вызываем callback для записи в аналитику
            _onHotspotClick(clickedHotspot, clickX, clickY, screenIdForClick);
          } else {
            // Клик в пустую область
            console.log("FigmaEmbedViewer: Empty area click detected (capture phase)", {
              clickX,
              clickY,
              screenId: screenIdForClick
            });
            
            // Вызываем callback для записи в аналитику
            if (_onEmptyAreaClick) {
              _onEmptyAreaClick(clickX, clickY, screenIdForClick);
            }
          }
          
          // КРИТИЧНО: НЕ вызываем e.preventDefault() и e.stopPropagation()
          // Событие должно пройти дальше к iframe для навигации Figma
        }}
      >
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          style={{
            width: iframeWidth,
            height: iframeHeight,
            border: "none",
            display: "block",
            pointerEvents: "auto" // КРИТИЧНО: Разрешаем клики по iframe - Figma сам обрабатывает переходы через свои хотспоты
          }}
          allowFullScreen
          title="Figma Prototype"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
        
        {/* КРИТИЧНО: Рендерим прозрачные overlay для hotspots через EventProxyService */}
        {/* Эти overlay перехватывают клики для аналитики, но НЕ блокируют навигацию Figma */}
        {/* КРИТИЧНО: Используем key для принудительного перерисовывания при изменении currentScreen */}
        {!isLoading && !loadError && eventProxyServiceRef.current && (
          <div key={`hotspot-overlays-${currentScreen || 'none'}`}>
            {eventProxyServiceRef.current.renderHotspotOverlays()}
          </div>
        )}
        
        {/* КРИТИЧНО: Прозрачный overlay для визуализации hotspots (debug mode) */}
        {/* НЕ перехватывает клики - pointerEvents: none */}
        {/* Клики перехватываются через onMouseDownCapture на контейнере выше */}
        
        {/* НОВОЕ: Overlay для маскировки UI Figma (скрывает элементы управления) */}
        {/* ВАЖНО: Этот overlay блокирует клики по элементам управления Figma */}
        {/* НОВОЕ: Убираем overlay, так как он может блокировать клики по hotspots */}
        {/* {!isLoading && !loadError && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1,
              // Прозрачный overlay - пропускает клики по хотспотам, но блокирует клики по iframe
              pointerEvents: "none"
            }}
          />
        )} */}
        
        {/* НОВОЕ: CSS стили для анимации загрузки */}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>

    </div>
  );
}

