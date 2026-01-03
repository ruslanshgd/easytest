/**
 * Animation Engine для SMART_ANIMATE между двумя сценами
 * Phase 1: Matching nodes по ID и интерполяция свойств
 */
import type { Scene, SceneNode, Transition } from "../types/proto";

export interface MatchedNodePair {
  fromNode: SceneNode;
  toNode: SceneNode;
  fromPath: string[]; // Path to node (для nested layers)
  toPath: string[]; // Path to node (для nested layers)
}

export interface AnimationProperties {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation?: number;
}

/**
 * Рекурсивно находит все узлы в сцене (включая nested)
 * Возвращает map: nodeId -> { node, path }
 */
function collectAllNodes(
  nodes: SceneNode[],
  parentPath: string[] = []
): Map<string, { node: SceneNode; path: string[] }> {
  const result = new Map<string, { node: SceneNode; path: string[] }>();
  
  for (const node of nodes) {
    const currentPath = [...parentPath, node.id];
    result.set(node.id, { node, path: currentPath });
    
    // Рекурсивно обрабатываем children
    if (node.children && node.children.length > 0) {
      const childNodes = collectAllNodes(node.children, currentPath);
      for (const [childId, childData] of childNodes.entries()) {
        result.set(childId, childData);
      }
    }
  }
  
  return result;
}

/**
 * Находит matching nodes между двумя сценами по nodeId
 * Поддерживает nested layers (рекурсивный поиск)
 */
export function matchNodes(fromScene: Scene, toScene: Scene): MatchedNodePair[] {
  // Собираем все узлы из обеих сцен (включая nested)
  const fromNodes = collectAllNodes(fromScene.nodes);
  const toNodes = collectAllNodes(toScene.nodes);
  
  const matched: MatchedNodePair[] = [];
  
  // Находим общие nodeId
  for (const [nodeId, fromData] of fromNodes.entries()) {
    const toData = toNodes.get(nodeId);
    if (toData) {
      matched.push({
        fromNode: fromData.node,
        toNode: toData.node,
        fromPath: fromData.path,
        toPath: toData.path,
      });
    }
  }
  
  return matched;
}

/**
 * Вычисляет промежуточные значения свойств для анимации
 * Интерполирует position (x, y), size (width, height), opacity, rotation
 */
export function interpolateProperties(
  from: AnimationProperties,
  to: AnimationProperties,
  progress: number // 0..1
): AnimationProperties {
  const t = progress; // progress от 0 до 1
  
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
    opacity: from.opacity + (to.opacity - from.opacity) * t,
    rotation: from.rotation !== undefined && to.rotation !== undefined
      ? from.rotation + (to.rotation - from.rotation) * t
      : undefined,
  };
}

/**
 * Преобразует SceneNode в AnimationProperties для интерполяции
 */
export function nodeToProperties(node: SceneNode): AnimationProperties {
  return {
    x: node.layout.x,
    y: node.layout.y,
    width: node.layout.width,
    height: node.layout.height,
    opacity: node.layout.opacity,
    rotation: node.layout.rotation,
  };
}

/**
 * Применяет easing функцию к progress (0..1)
 * Поддерживает основные типы easing из Figma
 */
export function applyEasing(
  progress: number,
  easing: Transition["easing"] = "EASE_IN_AND_OUT"
): number {
  switch (easing) {
    case "LINEAR":
      return progress;
    
    case "EASE_IN":
      return progress * progress;
    
    case "EASE_OUT":
      return 1 - (1 - progress) * (1 - progress);
    
    case "EASE_IN_AND_OUT":
      // Cubic ease-in-out
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    case "CUSTOM_CUBIC_BEZIER":
      // TODO: Phase 1 - поддержка custom cubic bezier (пока fallback на EASE_IN_AND_OUT)
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    case "CUSTOM_SPRING":
      // TODO: Phase 1 - поддержка custom spring (пока fallback на EASE_OUT)
      return 1 - (1 - progress) * (1 - progress);
    
    default:
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  }
}

/**
 * Получает duration из transition или использует дефолт
 */
export function getTransitionDuration(transition?: Transition): number {
  if (transition?.duration !== undefined) {
    return transition.duration;
  }
  // Дефолтная длительность для SMART_ANIMATE (мс)
  return 300;
}

