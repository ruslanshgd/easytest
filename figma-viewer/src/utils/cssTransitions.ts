/**
 * CSS Transitions Utility
 * Реализует transitions для MVP (DISSOLVE, MOVE_IN, MOVE_OUT, PUSH, SLIDE_IN, SLIDE_OUT)
 * Без SMART_ANIMATE (который реализован через AnimatedScene)
 */
import React from "react";
import type { Transition } from "../types/proto";

export type TransitionState = "idle" | "transitioning" | "complete";

/**
 * Получает CSS transition свойства для указанного типа перехода
 */
export function getCSSTransitionStyle(
  transition: Transition,
  direction: "forward" | "backward" = "forward"
): React.CSSProperties {
  const duration = transition.duration || 300; // default 300ms
  const easing = getEasingFunction(transition);

  // Для обратного перехода меняем направление
  const effectiveDirection = direction === "backward" ? reverseDirection(transition.direction) : transition.direction;

  switch (transition.type) {
    case "INSTANT":
      return {
        transition: "none"
      };

    case "DISSOLVE":
      return {
        transition: `opacity ${duration}ms ${easing}`
      };

    case "MOVE_IN":
      return getMoveInStyle(duration, easing, effectiveDirection);

    case "MOVE_OUT":
      return getMoveOutStyle(duration, easing, effectiveDirection);

    case "PUSH":
      return getPushStyle(duration, easing, effectiveDirection);

    case "SLIDE_OVER":
      return getSlideOverStyle(duration, easing, effectiveDirection);

    case "SLIDE_UNDER":
      return getSlideUnderStyle(duration, easing, effectiveDirection);

    default:
      // Fallback на INSTANT
      return {
        transition: "none"
      };
  }
}

/**
 * Получает easing функцию для CSS
 */
function getEasingFunction(transition: Transition): string {
  if (!transition.easing) {
    return "ease-in-out";
  }

  switch (transition.easing) {
    case "LINEAR":
      return "linear";
    case "EASE_IN":
      return "ease-in";
    case "EASE_OUT":
      return "ease-out";
    case "EASE_IN_AND_OUT":
      return "ease-in-out";
    case "CUSTOM_CUBIC_BEZIER":
      if (transition.easingFunctionCubicBezier) {
        const { x1, y1, x2, y2 } = transition.easingFunctionCubicBezier;
        return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
      }
      return "ease-in-out";
    case "CUSTOM_SPRING":
      // Fallback на ease-out (как указано в плане)
      console.warn("CUSTOM_SPRING easing not supported in CSS, using ease-out fallback");
      return "ease-out";
    default:
      return "ease-in-out";
  }
}

/**
 * Меняет направление для обратного перехода
 */
function reverseDirection(direction?: "LEFT" | "RIGHT" | "UP" | "DOWN"): "LEFT" | "RIGHT" | "UP" | "DOWN" | undefined {
  if (!direction) return undefined;
  
  switch (direction) {
    case "LEFT":
      return "RIGHT";
    case "RIGHT":
      return "LEFT";
    case "UP":
      return "DOWN";
    case "DOWN":
      return "UP";
    default:
      return direction;
  }
}

/**
 * MOVE_IN: новый экран входит с указанного направления
 */
function getMoveInStyle(
  duration: number,
  easing: string,
  direction?: "LEFT" | "RIGHT" | "UP" | "DOWN"
): React.CSSProperties {
  const transform = getDirectionTransform(direction, true);
  
  return {
    transition: `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`,
    transform: transform.initial,
    opacity: 0
  };
}

/**
 * MOVE_OUT: старый экран выходит в указанном направлении
 */
function getMoveOutStyle(
  duration: number,
  easing: string,
  direction?: "LEFT" | "RIGHT" | "UP" | "DOWN"
): React.CSSProperties {
  const transform = getDirectionTransform(direction, false);
  
  return {
    transition: `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`,
    transform: transform.final,
    opacity: 0
  };
}

/**
 * PUSH: новый экран входит, старый выходит одновременно
 */
function getPushStyle(
  duration: number,
  easing: string,
  direction?: "LEFT" | "RIGHT" | "UP" | "DOWN"
): React.CSSProperties {
  const transform = getDirectionTransform(direction, true);
  
  return {
    transition: `transform ${duration}ms ${easing}`,
    transform: transform.initial
  };
}

/**
 * SLIDE_OVER: новый экран скользит поверх старого
 */
function getSlideOverStyle(
  duration: number,
  easing: string,
  direction?: "LEFT" | "RIGHT" | "UP" | "DOWN"
): React.CSSProperties {
  const transform = getDirectionTransform(direction, true);
  
  return {
    transition: `transform ${duration}ms ${easing}`,
    transform: transform.initial,
    zIndex: 100
  };
}

/**
 * SLIDE_UNDER: новый экран скользит под старым
 */
function getSlideUnderStyle(
  duration: number,
  easing: string,
  direction?: "LEFT" | "RIGHT" | "UP" | "DOWN"
): React.CSSProperties {
  const transform = getDirectionTransform(direction, true);
  
  return {
    transition: `transform ${duration}ms ${easing}`,
    transform: transform.initial,
    zIndex: -1
  };
}

/**
 * Получает transform для указанного направления
 */
function getDirectionTransform(
  direction?: "LEFT" | "RIGHT" | "UP" | "DOWN",
  isIncoming: boolean = true
): { initial: string; final: string } {
  const sign = isIncoming ? -1 : 1;
  const defaultDirection = "RIGHT";
  const dir = direction || defaultDirection;

  switch (dir) {
    case "LEFT":
      return {
        initial: `translateX(${sign * 100}%)`,
        final: "translateX(0)"
      };
    case "RIGHT":
      return {
        initial: `translateX(${sign * -100}%)`,
        final: "translateX(0)"
      };
    case "UP":
      return {
        initial: `translateY(${sign * 100}%)`,
        final: "translateY(0)"
      };
    case "DOWN":
      return {
        initial: `translateY(${sign * -100}%)`,
        final: "translateY(0)"
      };
    default:
      return {
        initial: `translateX(${sign * -100}%)`,
        final: "translateX(0)"
      };
  }
}

/**
 * Получает финальное состояние transform для анимации
 */
export function getFinalTransform(_transition: Transition): string {
  return "translateX(0) translateY(0)";
}

