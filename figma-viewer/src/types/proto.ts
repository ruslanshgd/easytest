/**
 * Proto Schema Versioning
 * v1: Legacy PNG-based (screens с image: base64)
 * v2: Scene Graph (scenes с nodes)
 */

// Legacy Screen (для v1)
export interface NestedFrame {
  id: string;
  name: string;
  parentFrameId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
  overflowDirection: "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH";
  clipsContent: boolean;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  contentOffsetX: number;
  contentOffsetY: number;
  parentBackground?: string | null;
}

// Fixed child element (элемент, который фиксирован при скролле)
export interface FixedChild {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Screen {
  id: string;
  name: string;
  width: number;
  height: number;
  image: string;  // base64 PNG
  overflowDirection?: "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH";
  clipsContent?: boolean;
  canScroll?: boolean;
  isTopLevel?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  contentWidth?: number;
  contentHeight?: number;
  contentOffsetX?: number;
  contentOffsetY?: number;
  nestedFrames?: NestedFrame[];
  // НОВОЕ: Fixed children (элементы, которые фиксированы при скролле)
  numberOfFixedChildren?: number;
  fixedChildren?: FixedChild[];
  // НОВОЕ: Figma node ID для этого экрана (format: pageId:nodeId)
  // Используется для canvas-based рендеринга через Figma embed
  figmaNodeId?: string;
}

// Scene Graph types (для v2)
export interface SceneNode {
  id: string;
  parentId?: string;
  type: string;
  name: string;
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    // AutoLayout свойства (для FrameNode с layoutMode)
    layoutMode?: "HORIZONTAL" | "VERTICAL" | "NONE";
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    itemSpacing?: number; // gap между элементами
    primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
    counterAxisAlignItems?: "MIN" | "CENTER" | "MAX";
  };
  style?: {
    fill?: string;
    stroke?: string;
    strokeWeight?: number;
    strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
    radius?: number;
    topLeftRadius?: number;
    topRightRadius?: number;
    bottomLeftRadius?: number;
    bottomRightRadius?: number;
    textStyle?: {
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: number | string;
      lineHeight?: number | { value: number; unit: "PIXELS" | "PERCENT" | "AUTO" };
      letterSpacing?: { value: number; unit: "PIXELS" | "PERCENT" };
      textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
      textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
      textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
      textCase?: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE";
    };
  };
  children?: SceneNode[];
  text_content?: string; // Для TEXT узлов - реальный текстовый контент
  image_url?: string; // Для IMAGE узлов - URL изображения (TODO: Phase 1)
  imageHash?: string; // Для IMAGE узлов - hash изображения из Figma (для получения URL через REST API)
}

export interface Scene {
  id: string;
  name: string;
  size: { width: number; height: number };
  background: string;
  nodes: SceneNode[];
  // НОВОЕ: Figma node ID для этой сцены (format: pageId:nodeId)
  // Используется для canvas-based рендеринга через Figma embed
  figmaNodeId?: string;
}

// Common types
export interface Hotspot {
  id: string;
  name?: string;
  frame: string;
  trigger: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  target: string | null;
  overlayAction?: OverlayAction;
}

export interface OverlayAction {
  type: "OPEN_OVERLAY" | "CLOSE_OVERLAY" | "SWAP_OVERLAY" | "BACK";
  overlayId?: string;
  position?: "CENTERED" | "TOP_LEFT" | "TOP_CENTER" | "TOP_RIGHT" | 
             "BOTTOM_LEFT" | "BOTTOM_CENTER" | "BOTTOM_RIGHT" | "MANUAL";
  positionX?: number;
  positionY?: number;
  background?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  closeOnOutsideClick?: boolean;
}

export interface Edge {
  from: string;
  to: string;
  id: string;
  trigger: string | null;
  transition?: Transition;
}

export interface Transition {
  type: "INSTANT" | "DISSOLVE" | "SMART_ANIMATE" | "MOVE_IN" | "MOVE_OUT" | "PUSH" | "SLIDE_OVER" | "SLIDE_UNDER";
  duration?: number;
  direction?: "LEFT" | "RIGHT" | "UP" | "DOWN";
  easing?: "EASE_IN" | "EASE_OUT" | "EASE_IN_AND_OUT" | "LINEAR" | "CUSTOM_CUBIC_BEZIER" | "CUSTOM_SPRING";
  easingFunctionCubicBezier?: { x1: number; y1: number; x2: number; y2: number };
  easingFunctionSpring?: { mass: number; stiffness: number; damping: number };
  matchLayers?: boolean;
}

// v1 (Legacy - PNG-based)
export interface ProtoV1 {
  protoVersion: "v1";
  start: string;
  end: string;
  screens: Screen[];
  hotspots: Hotspot[];
  edges: Edge[];
  targets: string[];
  flowId?: string;
  // НОВОЕ: Метаданные Figma для canvas-based рендеринга
  figmaFileId?: string;        // ID Figma файла (fileKey)
  figmaStartNodeId?: string;   // ID начального узла (pageId:nodeId)
  figmaFileName?: string;      // Имя файла в Figma
}

// v2 (Scene Graph)
export interface ProtoV2 {
  protoVersion: "v2";
  start: string;
  end: string;
  scenes: Scene[];
  hotspots: Hotspot[];
  edges: Edge[];
  targets: string[];
  flowId?: string;
  // НОВОЕ: Метаданные Figma для canvas-based рендеринга
  figmaFileId?: string;        // ID Figma файла (fileKey)
  figmaStartNodeId?: string;   // ID начального узла (pageId:nodeId)
  figmaFileName?: string;      // Имя файла в Figma
}

// Unified Proto Interface (для совместимости)
export type Proto = ProtoV1 | ProtoV2;

// Type guards
export function isProtoV1(proto: Proto): proto is ProtoV1 {
  return proto.protoVersion === "v1";
}

export function isProtoV2(proto: Proto): proto is ProtoV2 {
  return proto.protoVersion === "v2";
}

// Helper functions
export function getSceneId(_proto: Proto, screenId: string): string {
  // Для v1: screen.id === scene.id (то же самое)
  // Для v2: scene.id
  // ID остаются теми же между версиями
  return screenId;
}

export function getStartSceneId(proto: Proto): string {
  return proto.start;
}

export function getEndSceneId(proto: Proto): string {
  return proto.end;
}

