/**
 * FigmaCanvasViewer - Canvas-based renderer для точного отображения Figma прототипов
 * Использует canvas для рендеринга, как у pthwy.ru, для обеспечения корректного дизайна
 */
import React, { useEffect, useRef, useState } from "react";
import type { Screen, Scene, Hotspot, Proto } from "../types/proto";

interface FigmaCanvasViewerProps {
  proto: Proto;
  currentScreenId: string | null;
  hotspots: Hotspot[];
  onHotspotClick: (hotspot: Hotspot, clickX?: number, clickY?: number) => void;
  onHotspotHoverEnter?: (hotspot: Hotspot) => void;
  onHotspotHoverLeave?: (hotspot: Hotspot) => void;
  figmaAccessToken?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  debugOverlayEnabled?: boolean;
}

export function FigmaCanvasViewer({
  proto,
  currentScreenId,
  hotspots,
  onHotspotClick,
  onHotspotHoverEnter,
  onHotspotHoverLeave,
  figmaAccessToken: _figmaAccessToken, // TODO: Использовать для получения изображений через REST API
  width,
  height,
  style,
  debugOverlayEnabled = false,
}: FigmaCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentScreenImageRef = useRef<HTMLImageElement | null>(null);
  const hoveredHotspotRef = useRef<string | null>(null);

  // Получаем текущий экран/сцену
  const getCurrentScreen = (): Screen | Scene | null => {
    if (!currentScreenId || !proto) return null;
    
    if (proto.protoVersion === "v1") {
      return proto.screens.find(s => s.id === currentScreenId) || null;
    } else if (proto.protoVersion === "v2") {
      return proto.scenes.find(s => s.id === currentScreenId) || null;
    }
    return null;
  };

  // Загружаем изображение экрана
  const loadScreenImage = async (screen: Screen | Scene): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load screen image: ${screen.id}`));
      };

      // Для v1 используем base64 изображение
      if (proto.protoVersion === "v1" && "image" in screen) {
        img.src = screen.image;
      } else {
        // Для v2 нужно получить изображение через Figma REST API
        // Пока используем fallback - рендерим через Scene Graph на canvas
        reject(new Error("v2 canvas rendering not yet implemented - need Figma REST API"));
      }
    });
  };

  // Рендерим экран на canvas
  const renderScreen = async (screen: Screen | Scene) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      setIsLoading(true);
      setError(null);

      // Для v1: загружаем PNG изображение
      if (proto.protoVersion === "v1" && "image" in screen) {
        const screenV1 = screen as Screen;
        const img = await loadScreenImage(screenV1);
        currentScreenImageRef.current = img;

        // Устанавливаем размеры canvas
        const screenWidth = screenV1.width;
        const screenHeight = screenV1.height;
        canvas.width = screenWidth;
        canvas.height = screenHeight;

        // Очищаем canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Рендерим изображение
        ctx.drawImage(img, 0, 0, screenWidth, screenHeight);
      } else {
        // Для v2: нужно рендерить Scene Graph через canvas
        // TODO: Реализовать canvas рендеринг Scene Graph
        setError("v2 canvas rendering not yet implemented");
        return;
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Error rendering screen:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  };

  // Рендерим хотспоты поверх canvas (через DOM overlay)
  const renderHotspots = () => {
    if (!currentScreenId) return null;

    const currentScreenHotspots = hotspots.filter(h => h.frame === currentScreenId);

    return currentScreenHotspots.map((hotspot) => {
      const isHoverTrigger = hotspot.trigger === "ON_HOVER";
      const isHovered = hoveredHotspotRef.current === hotspot.id;

      return (
        <div
          key={hotspot.id}
          style={{
            position: "absolute",
            left: hotspot.x,
            top: hotspot.y,
            width: hotspot.w,
            height: hotspot.h,
            cursor: "pointer",
            zIndex: 10,
            pointerEvents: "auto",
            // Debug overlay
            ...(debugOverlayEnabled ? {
              border: "2px solid rgba(255, 0, 0, 0.5)",
              backgroundColor: isHovered ? "rgba(255, 0, 0, 0.2)" : "rgba(255, 0, 0, 0.1)",
              boxSizing: "border-box"
            } : {})
          }}
          onClick={(e) => {
            if (isHoverTrigger) return;
            e.stopPropagation();
            const rect = e.currentTarget.parentElement?.getBoundingClientRect();
            if (rect) {
              const clickX = e.clientX - rect.left;
              const clickY = e.clientY - rect.top;
              onHotspotClick(hotspot, clickX, clickY);
            } else {
              onHotspotClick(hotspot);
            }
          }}
          onMouseEnter={() => {
            if (isHoverTrigger) {
              hoveredHotspotRef.current = hotspot.id;
              onHotspotHoverEnter?.(hotspot);
            }
          }}
          onMouseLeave={() => {
            if (isHoverTrigger) {
              hoveredHotspotRef.current = null;
              onHotspotHoverLeave?.(hotspot);
            }
          }}
        />
      );
    });
  };

  // Эффект для рендеринга при изменении экрана
  useEffect(() => {
    const screen = getCurrentScreen();
    if (screen) {
      renderScreen(screen);
    }
  }, [currentScreenId, proto]);

  const screen = getCurrentScreen();
  if (!screen) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#999" }}>
        Screen not found: {currentScreenId}
      </div>
    );
  }

  // Для v1: screen.width/height, для v2: scene.size.width/height
  let screenWidth = 0;
  let screenHeight = 0;
  if (proto.protoVersion === "v1" && "width" in screen) {
    const screenV1 = screen as Screen;
    screenWidth = screenV1.width;
    screenHeight = screenV1.height;
  } else if (proto.protoVersion === "v2" && "size" in screen) {
    const sceneV2 = screen as Scene;
    screenWidth = sceneV2.size.width;
    screenHeight = sceneV2.size.height;
  }
  const canvasWidth = width || screenWidth;
  const canvasHeight = height || screenHeight;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: canvasWidth,
        height: canvasHeight,
        ...style
      }}
    >
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f5f5f5",
            zIndex: 1
          }}
        >
          <div style={{ color: "#999" }}>Loading...</div>
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffebee",
            color: "#d32f2f",
            padding: 20,
            zIndex: 2
          }}
        >
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: canvasWidth,
          height: canvasHeight,
          imageRendering: "crisp-edges", // Для точного рендеринга
        }}
        width={screenWidth}
        height={screenHeight}
      />

      {/* Хотспоты поверх canvas */}
      {!isLoading && !error && renderHotspots()}
    </div>
  );
}

