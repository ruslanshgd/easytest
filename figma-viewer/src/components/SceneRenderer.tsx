/**
 * SceneRenderer - DOM-based renderer for Scene Graph (Phase 0)
 * Рендерит Scene Graph в DOM, применяя layout и style к каждому узлу
 */
import React from "react";
import type { Scene, SceneNode } from "../types/proto";

interface SceneRendererProps {
  scene: Scene;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

export function SceneRenderer({ scene, width, height, style }: SceneRendererProps) {
  const sceneWidth = width || scene.size.width;
  const sceneHeight = height || scene.size.height;

  return (
    <div
      style={{
        position: "relative",
        width: sceneWidth,
        height: sceneHeight,
        background: scene.background,
        overflow: "hidden",
        ...style
      }}
      data-scene-id={scene.id}
    >
      {scene.nodes.map((node) => (
        <SceneNodeRenderer key={node.id} node={node} />
      ))}
    </div>
  );
}

interface SceneNodeRendererProps {
  node: SceneNode;
}

function SceneNodeRenderer({ node, parentIsAutoLayout = false }: SceneNodeRendererProps & { parentIsAutoLayout?: boolean }) {
  const { layout, style: nodeStyle, children } = node;

  // Применяем layout
  // ВАЖНО: Для AutoLayout используем flexbox, для остальных - absolute positioning
  const isAutoLayout = layout.layoutMode && layout.layoutMode !== "NONE";
  
  const layoutStyle: React.CSSProperties = {
    // КРИТИЧНО: Если родитель - AutoLayout, то children НЕ должны быть absolute
    // Они должны быть flex items (position: static по умолчанию)
    position: parentIsAutoLayout ? "static" : "absolute",
    left: parentIsAutoLayout ? undefined : layout.x,
    top: parentIsAutoLayout ? undefined : layout.y,
    width: layout.width,
    height: layout.height,
    opacity: layout.opacity,
    transform: layout.rotation ? `rotate(${layout.rotation}deg)` : undefined,
  };
  
  // НОВОЕ: Применяем AutoLayout свойства (flexbox для children)
  if (isAutoLayout) {
    layoutStyle.display = "flex";
    layoutStyle.flexDirection = layout.layoutMode === "HORIZONTAL" ? "row" : "column";
    
    // Padding
    if (layout.paddingLeft !== undefined) layoutStyle.paddingLeft = layout.paddingLeft;
    if (layout.paddingRight !== undefined) layoutStyle.paddingRight = layout.paddingRight;
    if (layout.paddingTop !== undefined) layoutStyle.paddingTop = layout.paddingTop;
    if (layout.paddingBottom !== undefined) layoutStyle.paddingBottom = layout.paddingBottom;
    
    // Gap (itemSpacing)
    if (layout.itemSpacing !== undefined) {
      layoutStyle.gap = layout.itemSpacing;
    }
    
    // Alignment
    if (layout.primaryAxisAlignItems) {
      const alignMap: Record<string, "flex-start" | "center" | "flex-end" | "space-between"> = {
        "MIN": "flex-start",
        "CENTER": "center",
        "MAX": "flex-end",
        "SPACE_BETWEEN": "space-between"
      };
      layoutStyle.justifyContent = alignMap[layout.primaryAxisAlignItems] || "flex-start";
    }
    if (layout.counterAxisAlignItems) {
      const alignMap: Record<string, "flex-start" | "center" | "flex-end"> = {
        "MIN": "flex-start",
        "CENTER": "center",
        "MAX": "flex-end"
      };
      layoutStyle.alignItems = alignMap[layout.counterAxisAlignItems] || "flex-start";
    }
  }

  // Применяем style
  const styleProps: React.CSSProperties = {};
  if (nodeStyle) {
    // ВАЖНО: Для TEXT узлов fill = color, для остальных = backgroundColor
    if (nodeStyle.fill) {
      if (node.type === "TEXT") {
        styleProps.color = nodeStyle.fill;
      } else {
        styleProps.backgroundColor = nodeStyle.fill;
      }
    }
    if (nodeStyle.stroke) {
      styleProps.borderColor = nodeStyle.stroke;
      // НОВОЕ: Используем strokeWeight если есть
      styleProps.borderWidth = nodeStyle.strokeWeight !== undefined 
        ? `${nodeStyle.strokeWeight}px` 
        : "1px";
      styleProps.borderStyle = "solid";
      
      // НОВОЕ: Применяем strokeAlign через box-sizing и border
      // NOTE: CSS не поддерживает strokeAlign напрямую, но можно использовать outline или корректировать размеры
    }
    
    // НОВОЕ: Corner radius - отдельные радиусы для каждого угла
    if (nodeStyle.topLeftRadius !== undefined || 
        nodeStyle.topRightRadius !== undefined || 
        nodeStyle.bottomLeftRadius !== undefined || 
        nodeStyle.bottomRightRadius !== undefined) {
      styleProps.borderRadius = [
        nodeStyle.topLeftRadius || 0,
        nodeStyle.topRightRadius || 0,
        nodeStyle.bottomRightRadius || 0,
        nodeStyle.bottomLeftRadius || 0
      ].map(r => `${r}px`).join(" ");
    } else if (nodeStyle.radius !== undefined) {
      styleProps.borderRadius = nodeStyle.radius;
    }
  }

  // Определяем тип узла для рендеринга
  const renderContent = () => {
    // Для текстовых узлов
    if (node.type === "TEXT") {
      const textStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
      };
      
      // Применяем textStyle, если есть
      if (nodeStyle?.textStyle) {
        textStyle.fontFamily = nodeStyle.textStyle.fontFamily || "system-ui, -apple-system, sans-serif";
        textStyle.fontSize = nodeStyle.textStyle.fontSize || 16;
        textStyle.fontWeight = nodeStyle.textStyle.fontWeight || 400;
        
        // НОВОЕ: Применяем lineHeight
        if (nodeStyle.textStyle.lineHeight !== undefined) {
          if (typeof nodeStyle.textStyle.lineHeight === "number") {
            textStyle.lineHeight = nodeStyle.textStyle.lineHeight;
          } else if (nodeStyle.textStyle.lineHeight.unit === "PIXELS") {
            textStyle.lineHeight = `${nodeStyle.textStyle.lineHeight.value}px`;
          } else if (nodeStyle.textStyle.lineHeight.unit === "PERCENT") {
            textStyle.lineHeight = `${nodeStyle.textStyle.lineHeight.value}%`;
          } else if (nodeStyle.textStyle.lineHeight.unit === "AUTO") {
            textStyle.lineHeight = "normal";
          }
        }
        
        // НОВОЕ: Применяем letterSpacing
        if (nodeStyle.textStyle.letterSpacing !== undefined) {
          if (nodeStyle.textStyle.letterSpacing.unit === "PIXELS") {
            textStyle.letterSpacing = `${nodeStyle.textStyle.letterSpacing.value}px`;
          } else if (nodeStyle.textStyle.letterSpacing.unit === "PERCENT") {
            textStyle.letterSpacing = `${nodeStyle.textStyle.letterSpacing.value}%`;
          }
        }
        
        // НОВОЕ: Применяем textAlignHorizontal
        if (nodeStyle.textStyle.textAlignHorizontal) {
          const alignMap: Record<string, "left" | "center" | "right" | "justify"> = {
            "LEFT": "left",
            "CENTER": "center",
            "RIGHT": "right",
            "JUSTIFIED": "justify"
          };
          textStyle.textAlign = alignMap[nodeStyle.textStyle.textAlignHorizontal] || "left";
        }
        
        // НОВОЕ: Применяем textAlignVertical (через flexbox)
        if (nodeStyle.textStyle.textAlignVertical) {
          textStyle.display = "flex";
          const verticalAlignMap: Record<string, string> = {
            "TOP": "flex-start",
            "CENTER": "center",
            "BOTTOM": "flex-end"
          };
          textStyle.alignItems = verticalAlignMap[nodeStyle.textStyle.textAlignVertical] || "flex-start";
        } else {
          textStyle.display = "flex";
          textStyle.alignItems = "center";
        }
        
        // НОВОЕ: Применяем textDecoration
        if (nodeStyle.textStyle.textDecoration) {
          const decorationMap: Record<string, string> = {
            "NONE": "none",
            "UNDERLINE": "underline",
            "STRIKETHROUGH": "line-through"
          };
          textStyle.textDecoration = decorationMap[nodeStyle.textStyle.textDecoration] || "none";
        }
        
        // НОВОЕ: Применяем textCase
        if (nodeStyle.textStyle.textCase) {
          const caseMap: Record<string, string> = {
            "ORIGINAL": "none",
            "UPPER": "uppercase",
            "LOWER": "lowercase",
            "TITLE": "capitalize"
          };
          textStyle.textTransform = caseMap[nodeStyle.textStyle.textCase] || "none";
        }
      }
      
      // Если не установлен display через textAlignVertical, используем flex по умолчанию
      if (!textStyle.display) {
        textStyle.display = "flex";
        textStyle.alignItems = "center";
      }
      
      return (
        <div style={textStyle}>
          {node.text_content || node.name}
        </div>
      );
    }

    // НОВОЕ: Для IMAGE узлов
    if ((node.type === "IMAGE" || node.imageHash) && node.image_url) {
      return (
        <img
          src={node.image_url}
          alt={node.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block"
          }}
        />
      );
    }
    
    // НОВОЕ: Для IMAGE узлов с imageHash (пока без URL - нужно получить через REST API)
    if ((node.type === "IMAGE" || node.imageHash) && !node.image_url && node.imageHash) {
      // TODO: Получить URL изображения через REST API используя imageHash и fileKey
      // Пока показываем placeholder
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: "12px"
          }}
        >
          [Image: {node.imageHash.substring(0, 8)}...]
        </div>
      );
    }

    // НОВОЕ: Для VECTOR узлов (SVG)
    // TODO: Добавить экспорт SVG данных для VECTOR узлов в плагине
    // Пока VECTOR узлы рендерятся через stroke/fill свойства

    // Для остальных узлов - просто div с фоном/границей
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
      {/* ВАЖНО: Для AutoLayout children должны быть flex items (не absolute) */}
      {children && children.map((child) => (
        <SceneNodeRenderer key={child.id} node={child} parentIsAutoLayout={isAutoLayout} />
      ))}
    </div>
  );
}

