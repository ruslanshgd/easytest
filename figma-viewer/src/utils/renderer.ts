/**
 * Renderer Selection (Feature Flag / Query Param)
 * Определяет какой renderer использовать: "screen" (PNG) или "scene" (Scene Graph)
 */
import type { Proto } from "../types/proto";

export type Renderer = "screen" | "scene";

/**
 * Определяет какой renderer использовать на основе protoVersion и query param
 * 
 * Приоритет:
 * 1. Query param ?renderer=screen|scene (высший приоритет)
 * 2. Автоматический выбор по protoVersion
 * 3. Fallback к "screen" (для обратной совместимости)
 */
export function getRenderer(proto: Proto | null, queryParams: URLSearchParams): Renderer {
  // 1. Проверяем query param (приоритет)
  const queryRenderer = queryParams.get("renderer");
  if (queryRenderer === "screen" || queryRenderer === "scene") {
    return queryRenderer;
  }
  
  // 2. Автоматический выбор по protoVersion
  if (!proto) {
    return "screen"; // Fallback для обратной совместимости
  }
  
  if (proto.protoVersion === "v1") {
    return "screen";
  }
  if (proto.protoVersion === "v2") {
    return "scene";
  }
  
  // 3. Fallback (для обратной совместимости)
  return "screen";
}

/**
 * Получает renderer из текущего URL query params
 */
export function getRendererFromURL(): Renderer | null {
  const params = new URLSearchParams(window.location.search);
  const renderer = params.get("renderer");
  if (renderer === "screen" || renderer === "scene") {
    return renderer;
  }
  return null;
}

/**
 * Проверяет, поддерживается ли указанный renderer для данного proto
 */
export function isRendererSupported(proto: Proto | null, renderer: Renderer): boolean {
  if (!proto) {
    return renderer === "screen"; // Только screen для null proto
  }
  
  if (proto.protoVersion === "v1") {
    return renderer === "screen"; // v1 поддерживает только screen
  }
  
  if (proto.protoVersion === "v2") {
    return renderer === "scene"; // v2 поддерживает только scene (пока)
  }
  
  return false;
}

