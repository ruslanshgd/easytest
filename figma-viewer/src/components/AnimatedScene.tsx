/**
 * AnimatedScene - Компонент для анимации между двумя сценами (SMART_ANIMATE)
 * Phase 1: Интерполяция свойств matching nodes
 */
import React, { useEffect, useState, useRef } from "react";
import type { Scene, SceneNode, Transition } from "../types/proto";
import { SceneRenderer } from "./SceneRenderer";
import {
  matchNodes,
  interpolateProperties,
  nodeToProperties,
  applyEasing,
  getTransitionDuration,
  type AnimationProperties,
} from "../utils/animationEngine";

interface AnimatedSceneProps {
  fromScene: Scene | null;
  toScene: Scene;
  transition?: Transition;
  onAnimationComplete?: () => void;
  style?: React.CSSProperties;
}

export function AnimatedScene({
  fromScene,
  toScene,
  transition,
  onAnimationComplete,
  style,
}: AnimatedSceneProps) {
  const [animatedNodes, setAnimatedNodes] = useState<Map<string, AnimationProperties>>(new Map());
  const [isAnimating, setIsAnimating] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!fromScene) {
      // Нет fromScene - просто показываем toScene без анимации
      setAnimatedNodes(new Map());
      setIsAnimating(false);
      return;
    }

    // SMART_ANIMATE: находим matching nodes
    const matched = matchNodes(fromScene, toScene);
    
    if (matched.length === 0) {
      // Нет matching nodes - fallback на DISSOLVE (crossfade)
      console.log("AnimatedScene: No matching nodes, using DISSOLVE fallback");
      setIsAnimating(false);
      setAnimatedNodes(new Map());
      return;
    }

    console.log(`AnimatedScene: Found ${matched.length} matching nodes for SMART_ANIMATE`);

    // Инициализируем animated nodes с начальными значениями
    const initialNodes = new Map<string, AnimationProperties>();
    for (const pair of matched) {
      initialNodes.set(pair.fromNode.id, nodeToProperties(pair.fromNode));
    }
    setAnimatedNodes(initialNodes);

    // Начинаем анимацию
    setIsAnimating(true);
    startTimeRef.current = Date.now();
    const duration = getTransitionDuration(transition);

    const animate = () => {
      if (!startTimeRef.current) return;

      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // Применяем easing
      const easedProgress = applyEasing(progress, transition?.easing);

      // Интерполируем свойства для каждого matching node
      const newAnimatedNodes = new Map<string, AnimationProperties>();
      for (const pair of matched) {
        const fromProps = nodeToProperties(pair.fromNode);
        const toProps = nodeToProperties(pair.toNode);
        const interpolated = interpolateProperties(fromProps, toProps, easedProgress);
        newAnimatedNodes.set(pair.fromNode.id, interpolated);
      }

      setAnimatedNodes(newAnimatedNodes);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Анимация завершена
        setIsAnimating(false);
        setAnimatedNodes(new Map());
        onAnimationComplete?.();
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [fromScene, toScene, transition, onAnimationComplete]);

  // Рендерим toScene с применением анимированных свойств
  return (
    <AnimatedSceneRenderer
      scene={toScene}
      animatedNodes={animatedNodes}
      isAnimating={isAnimating}
      style={style}
    />
  );
}

interface AnimatedSceneRendererProps {
  scene: Scene;
  animatedNodes: Map<string, AnimationProperties>;
  isAnimating: boolean;
  style?: React.CSSProperties;
}

function AnimatedSceneRenderer({
  scene,
  animatedNodes,
  isAnimating,
  style,
}: AnimatedSceneRendererProps) {
  // Если нет анимации, рендерим обычный SceneRenderer
  if (!isAnimating || animatedNodes.size === 0) {
    return <SceneRenderer scene={scene} style={style} />;
  }

  // Рендерим сцену с применением анимированных свойств
  return (
    <div
      style={{
        position: "relative",
        width: scene.size.width,
        height: scene.size.height,
        background: scene.background,
        ...style,
      }}
      data-scene-id={scene.id}
    >
      {scene.nodes.map((node) => (
        <AnimatedNodeRenderer
          key={node.id}
          node={node}
          animatedNodes={animatedNodes}
          parentPath={[]}
        />
      ))}
    </div>
  );
}

interface AnimatedNodeRendererProps {
  node: SceneNode;
  animatedNodes: Map<string, AnimationProperties>;
  parentPath: string[];
}

function AnimatedNodeRenderer({
  node,
  animatedNodes,
  parentPath,
}: AnimatedNodeRendererProps) {
  const animatedProps = animatedNodes.get(node.id);
  const { layout, style: nodeStyle, children } = node;

  // Используем анимированные свойства, если они есть, иначе обычные
  const currentX = animatedProps?.x ?? layout.x;
  const currentY = animatedProps?.y ?? layout.y;
  const currentWidth = animatedProps?.width ?? layout.width;
  const currentHeight = animatedProps?.height ?? layout.height;
  const currentOpacity = animatedProps?.opacity ?? layout.opacity;
  const currentRotation = animatedProps?.rotation ?? layout.rotation;

  const layoutStyle: React.CSSProperties = {
    position: "absolute",
    left: currentX,
    top: currentY,
    width: currentWidth,
    height: currentHeight,
    opacity: currentOpacity,
    transform: currentRotation ? `rotate(${currentRotation}deg)` : undefined,
    transition: animatedProps ? "none" : undefined, // Отключаем CSS transitions во время анимации
  };

  const styleProps: React.CSSProperties = {};
  if (nodeStyle) {
    if (nodeStyle.fill) {
      styleProps.backgroundColor = nodeStyle.fill;
    }
    if (nodeStyle.stroke) {
      styleProps.borderColor = nodeStyle.stroke;
      styleProps.borderWidth = "1px";
      styleProps.borderStyle = "solid";
    }
    if (nodeStyle.radius !== undefined) {
      styleProps.borderRadius = nodeStyle.radius;
    }
  }

  const renderContent = () => {
    if (node.type === "TEXT" && nodeStyle?.textStyle) {
      return (
        <div
          style={{
            fontFamily: nodeStyle.textStyle.fontFamily,
            fontSize: nodeStyle.textStyle.fontSize,
            fontWeight: nodeStyle.textStyle.fontWeight,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {node.text_content || node.name}
        </div>
      );
    }
    return null;
  };

  const combinedStyle: React.CSSProperties = {
    ...layoutStyle,
    ...styleProps,
  };

  return (
    <div
      style={combinedStyle}
      data-node-id={node.id}
      data-node-type={node.type}
      data-node-name={node.name}
    >
      {renderContent()}
      {/* Рекурсивно рендерим children */}
      {children && children.map((child) => (
        <AnimatedNodeRenderer
          key={child.id}
          node={child}
          animatedNodes={animatedNodes}
          parentPath={[...parentPath, node.id]}
        />
      ))}
    </div>
  );
}

