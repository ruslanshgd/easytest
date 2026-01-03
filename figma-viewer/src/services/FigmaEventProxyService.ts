/**
 * FigmaEventProxyService - Сервис для перехвата событий взаимодействия с Figma embed
 * 
 * Проблема: Figma embed не отправляет postMessage события родительскому окну напрямую.
 * Решение: Используем прозрачные overlay для hotspots, которые перехватывают клики
 * и отправляют события в аналитику, не блокируя навигацию Figma.
 * 
 * Архитектура:
 * 1. Рендерим прозрачные overlay для всех hotspots текущего экрана
 * 2. Перехватываем клики через capture phase
 * 3. Записываем событие в аналитику
 * 4. Позволяем событию пройти дальше к Figma iframe (не блокируем)
 */

import React from "react";
import type { Hotspot } from "../types/proto";

export interface EventProxyConfig {
  onHotspotClick: (hotspot: Hotspot, clickX: number, clickY: number, currentScreenId?: string | null) => void;
  onHotspotHoverEnter?: (hotspot: Hotspot) => void; // КРИТИЧНО: Для трекинга hover в аналитику (без навигации)
  onHotspotHoverLeave?: (hotspot: Hotspot) => void; // КРИТИЧНО: Для трекинга hover в аналитику (без навигации)
  onScreenChange?: (figmaNodeId: string) => void;
  debug?: boolean;
}

export class FigmaEventProxyService {
  private config: EventProxyConfig;
  // КРИТИЧНО: containerRef используется для позиционирования overlay относительно контейнера
  // ВАЖНО: В текущей реализации overlay рендерятся через React.createElement с абсолютным позиционированием,
  // поэтому containerRef не используется напрямую, но сохраняется для будущего использования
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private containerRef: React.RefObject<HTMLDivElement | null> | null = null;
  private currentScreen: string | null = null; // КРИТИЧНО: Текущий экран (screen ID из нашей системы)
  private currentFigmaNodeId: string | null = null; // КРИТИЧНО: Текущий figmaNodeId для синхронизации с Figma
  private hotspots: Hotspot[] = [];
  private hoveredHotspotRef: React.MutableRefObject<Hotspot | null>;
  private lastClickTimeRef: Map<string, number> = new Map(); // КРИТИЧНО: Для предотвращения дублирования кликов
  private lastClickHotspotIdRef: string | null = null; // КРИТИЧНО: Для предотвращения дублирования кликов одного hotspot
  
  constructor(config: EventProxyConfig) {
    this.config = config;
    this.hoveredHotspotRef = { current: null };
  }
  
  /**
   * Устанавливает контейнер для рендеринга overlay
   * ВАЖНО: В текущей реализации overlay рендерятся через React.createElement,
   * поэтому containerRef не используется напрямую, но может быть полезен в будущем
   */
  setContainer(containerRef: React.RefObject<HTMLDivElement | null>) {
    this.containerRef = containerRef;
  }
  
  /**
   * Обновляет текущий экран и hotspots для рендеринга overlay
   * КРИТИЧНО: currentScreen - это screen ID из нашей системы, а не figmaNodeId
   */
  updateScreenAndHotspots(currentScreen: string | null, hotspots: Hotspot[]) {
    const previousScreen = this.currentScreen;
    this.currentScreen = currentScreen;
    this.hotspots = hotspots;
    
    // КРИТИЧНО: Очищаем debounce при смене экрана
    if (previousScreen !== currentScreen) {
      this.lastClickTimeRef.clear();
      this.lastClickHotspotIdRef = null; // КРИТИЧНО: Очищаем последний кликнутый hotspot
      if (this.config.debug) {
        console.log("FigmaEventProxyService: Screen updated, cleared click debounce", {
          previousScreen,
          currentScreen,
          currentFigmaNodeId: this.currentFigmaNodeId,
          hotspotsCount: hotspots.length,
          screenHotspotsCount: hotspots.filter(h => h.frame === currentScreen).length
        });
      }
    } else if (this.config.debug) {
      // Логируем даже если экран не изменился, но hotspots обновились
      console.log("FigmaEventProxyService: Hotspots updated for same screen", {
        currentScreen,
        currentFigmaNodeId: this.currentFigmaNodeId,
        hotspotsCount: hotspots.length,
        screenHotspotsCount: hotspots.filter(h => h.frame === currentScreen).length
      });
    }
  }

  /**
   * Обновляет текущий figmaNodeId (для синхронизации с Figma)
   * КРИТИЧНО: Вызывается при получении PRESENTED_NODE_CHANGED от Figma
   */
  updateCurrentFigmaNodeId(figmaNodeId: string | null) {
    const previousFigmaNodeId = this.currentFigmaNodeId;
    this.currentFigmaNodeId = figmaNodeId;
    
    if (this.config.debug && previousFigmaNodeId !== figmaNodeId) {
      console.log("FigmaEventProxyService: FigmaNodeId updated", {
        previousFigmaNodeId,
        currentFigmaNodeId: figmaNodeId,
        currentScreen: this.currentScreen
      });
    }
  }

  /**
   * Получает текущий экран (screen ID)
   * КРИТИЧНО: Используется для определения screen_id при клике на hotspot
   */
  getCurrentScreen(): string | null {
    return this.currentScreen;
  }
  
  /**
   * Рендерит прозрачные overlay для hotspots текущего экрана
   */
  renderHotspotOverlays(): React.ReactNode[] {
    // КРИТИЧНО: Проверяем наличие контейнера (для будущего использования)
    if (!this.containerRef) {
      if (this.config.debug) {
        console.warn("FigmaEventProxyService: Container ref not set");
      }
    }
    
    if (!this.currentScreen || !this.hotspots.length) {
      return [];
    }
    
    // Фильтруем hotspots для текущего экрана
    const screenHotspots = this.hotspots.filter(h => h.frame === this.currentScreen);
    
    if (this.config.debug) {
      console.log("FigmaEventProxyService: Rendering hotspot overlays", {
        currentScreen: this.currentScreen,
        totalHotspots: this.hotspots.length,
        screenHotspots: screenHotspots.length
      });
    }
    
    return screenHotspots.map((hotspot, index) => {
      const hotspotX = hotspot.x || 0;
      const hotspotY = hotspot.y || 0;
      const hotspotWidth = hotspot.w || 100;
      const hotspotHeight = hotspot.h || 50;
      
      return React.createElement(
        "div",
        {
          key: `hotspot-overlay-${hotspot.id}-${index}`,
          style: {
            position: "absolute",
            left: `${hotspotX}px`,
            top: `${hotspotY}px`,
            width: `${hotspotWidth}px`,
            height: `${hotspotHeight}px`,
            backgroundColor: this.config.debug ? "rgba(255, 0, 0, 0.1)" : "transparent",
            border: this.config.debug ? "1px solid rgba(255, 0, 0, 0.5)" : "none",
            zIndex: 100, // Выше iframe, но ниже loading overlay
            cursor: "pointer",
            // КРИТИЧНО: pointerEvents: "none" чтобы клики проходили к iframe
            // Клики перехватываются через onMouseDown на контейнере в FigmaEmbedViewer
            pointerEvents: "none" as const
          },
          // КРИТИЧНО: onMouseDown не будет вызываться, так как pointerEvents: "none"
          // Клики обрабатываются через handleContainerClick в FigmaEmbedViewer
          onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
            // КРИТИЧНО: Предотвращаем дублирование кликов
            // Проверяем, не был ли уже обработан этот клик
            const now = Date.now();
            const lastClickTime = this.lastClickTimeRef.get(hotspot.id) || 0;
            const CLICK_DEBOUNCE_MS = 1000; // 1000ms debounce для предотвращения дублирования (увеличено с 500ms)
            
            // КРИТИЧНО: Проверяем дублирование по двум критериям:
            // 1. Тот же hotspot ID
            // 2. Время с последнего клика меньше debounce
            const isSameHotspot = this.lastClickHotspotIdRef === hotspot.id;
            const isWithinDebounce = now - lastClickTime < CLICK_DEBOUNCE_MS;
            
            if (isSameHotspot && isWithinDebounce) {
              if (this.config.debug) {
                console.log("FigmaEventProxyService: Click ignored (debounce - same hotspot)", {
                  hotspotId: hotspot.id,
                  timeSinceLastClick: now - lastClickTime,
                  debounceMs: CLICK_DEBOUNCE_MS
                });
              }
              e.preventDefault(); // КРИТИЧНО: Предотвращаем дальнейшую обработку события
              e.stopPropagation(); // КРИТИЧНО: Останавливаем всплытие события
              return; // Игнорируем дублирующий клик
            }
            
            // КРИТИЧНО: Дополнительная проверка - если клик произошел очень быстро после последнего
            // (даже если это другой hotspot), это может быть двойной клик браузера
            if (isWithinDebounce && lastClickTime > 0) {
              if (this.config.debug) {
                console.log("FigmaEventProxyService: Click ignored (debounce - too fast)", {
                  hotspotId: hotspot.id,
                  lastHotspotId: this.lastClickHotspotIdRef,
                  timeSinceLastClick: now - lastClickTime,
                  debounceMs: CLICK_DEBOUNCE_MS
                });
              }
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            
            // Сохраняем время клика и ID hotspot
            this.lastClickTimeRef.set(hotspot.id, now);
            this.lastClickHotspotIdRef = hotspot.id;
            
            // КРИТИЧНО: Перехватываем клик для аналитики
            const clickX = hotspotX + hotspotWidth / 2;
            const clickY = hotspotY + hotspotHeight / 2;
            
            // КРИТИЧНО: Используем актуальный currentScreen для screen_id в аналитике
            // hotspot.frame может быть устаревшим, если экран уже сменился
            const screenIdForAnalytics = this.currentScreen || hotspot.frame;
            
            if (this.config.debug) {
              console.log("FigmaEventProxyService: Hotspot clicked", {
                hotspotId: hotspot.id,
                hotspotName: hotspot.name,
                target: hotspot.target,
                hotspotFrame: hotspot.frame, // Старый экран из hotspot
                currentScreen: this.currentScreen, // Актуальный экран из нашей системы
                screenIdForAnalytics: screenIdForAnalytics, // Финальный screen_id для аналитики
                currentFigmaNodeId: this.currentFigmaNodeId,
                coordinates: { x: clickX, y: clickY },
                event: e
              });
            }
            
            // КРИТИЧНО: Создаем hotspot с актуальным screen_id для аналитики
            // Передаем screen_id через дополнительный параметр в callback
            // Записываем событие в аналитику с актуальным currentScreen
            this.config.onHotspotClick(hotspot, clickX, clickY, screenIdForAnalytics);
            
            // КРИТИЧНО: НЕ вызываем e.preventDefault() и e.stopPropagation()
            // Это позволяет событию пройти дальше к Figma iframe
            // Временно отключаем pointerEvents на overlay, чтобы клик прошел к iframe
            const overlayElement = e.currentTarget;
            overlayElement.style.pointerEvents = "none";
            
            // Восстанавливаем pointerEvents через небольшую задержку
            setTimeout(() => {
              overlayElement.style.pointerEvents = "auto";
            }, 100);
            
            // КРИТИЧНО: Останавливаем всплытие события, чтобы overlay для пустой области не перехватил клик
            // Это необходимо для правильной регистрации кликов по hotspot'ам
            e.stopPropagation();
          },
          // КРИТИЧНО: Трекинг hover для аналитики (без навигации)
          // Figma сам обрабатывает hover и навигацию, но мы трекаем hover для аналитики
          onMouseEnter: () => {
            if (this.config.onHotspotHoverEnter) {
              if (this.config.debug) {
                console.log("FigmaEventProxyService: Hotspot hover enter", {
                  hotspotId: hotspot.id,
                  hotspotName: hotspot.name,
                  target: hotspot.target
                });
              }
              // КРИТИЧНО: Вызываем callback для трекинга hover в аналитику
              // НЕ вызываем навигацию - Figma embed сам обрабатывает hover
              this.config.onHotspotHoverEnter(hotspot);
            }
          },
          onMouseLeave: () => {
            if (this.config.onHotspotHoverLeave) {
              if (this.config.debug) {
                console.log("FigmaEventProxyService: Hotspot hover leave", {
                  hotspotId: hotspot.id,
                  hotspotName: hotspot.name,
                  target: hotspot.target
                });
              }
              // КРИТИЧНО: Вызываем callback для трекинга hover в аналитику
              // НЕ вызываем навигацию - Figma embed сам обрабатывает hover
              this.config.onHotspotHoverLeave(hotspot);
            }
          }
        }
      );
    });
  }
  
  /**
   * Обрабатывает postMessage события от Figma (если они приходят)
   */
  handlePostMessage(event: MessageEvent) {
    // Логируем все события для отладки
    if (this.config.debug) {
      console.log("FigmaEventProxyService: postMessage received", {
        origin: event.origin,
        data: event.data
      });
    }
    
    // Проверяем структуру данных (может быть вложенной)
    let data = event.data;
    if (data?.data && typeof data.data === 'object') {
      data = data.data;
    }
    
    // Обрабатываем PRESENTED_NODE_CHANGED
    if (data?.type === "PRESENTED_NODE_CHANGED") {
      const presentedNodeId = data.presentedNodeId || data.data?.presentedNodeId;
      if (presentedNodeId && this.config.onScreenChange) {
        if (this.config.debug) {
          console.log("FigmaEventProxyService: Screen changed", {
            presentedNodeId,
            previousNodeId: data.previousNodeId
          });
        }
        this.config.onScreenChange(presentedNodeId);
      }
    }
    
    // Обрабатываем MOUSE_PRESS_OR_RELEASE (если приходит)
    if (data?.type === "MOUSE_PRESS_OR_RELEASE") {
      // Извлекаем координаты из разных возможных структур
      let clickX: number | undefined;
      let clickY: number | undefined;
      let isPressed = false;
      
      if (data.clickData) {
        clickX = data.clickData.targetNodeMousePosition?.x || data.clickData.x;
        clickY = data.clickData.targetNodeMousePosition?.y || data.clickData.y;
        isPressed = data.clickData.handled === true || data.clickData.interactionType === "ON_CLICK";
      } else {
        clickX = data.x;
        clickY = data.y;
        isPressed = data.pressed === true;
      }
      
      if (isPressed && clickX !== undefined && clickY !== undefined && this.currentScreen) {
        // Находим hotspot по координатам
        const screenHotspots = this.hotspots.filter(h => h.frame === this.currentScreen);
        const clickedHotspot = screenHotspots.find(h => {
          const hotspotX = h.x || 0;
          const hotspotY = h.y || 0;
          const hotspotWidth = h.w || 100;
          const hotspotHeight = h.h || 50;
          
          return clickX! >= hotspotX && 
                 clickX! <= hotspotX + hotspotWidth &&
                 clickY! >= hotspotY && 
                 clickY! <= hotspotY + hotspotHeight;
        });
        
        if (clickedHotspot) {
          if (this.config.debug) {
            console.log("FigmaEventProxyService: Hotspot clicked via postMessage", {
              hotspotId: clickedHotspot.id,
              coordinates: { x: clickX, y: clickY }
            });
          }
          this.config.onHotspotClick(clickedHotspot, clickX, clickY);
        }
      }
    }
  }
  
  /**
   * Очищает ресурсы
   */
  cleanup(): void {
    this.containerRef = null;
    this.currentScreen = null;
    this.hotspots = [];
    this.hoveredHotspotRef.current = null;
    this.lastClickTimeRef.clear();
    this.lastClickHotspotIdRef = null;
  }
}

