/**
 * Единый контракт событий для v1 (PNG) и v2 (Scene Graph) renderer
 * Обеспечивает совместимость аналитики между версиями
 */
export interface EventContract {
  // Обязательные поля (одинаковые для v1 и v2)
  event_type: string;
  session_id: string;
  timestamp: string;
  
  // Renderer-agnostic идентификаторы
  // Для v1: screen.id, для v2: scene.id (то же самое значение)
  screen_id: string | null;
  hotspot_id: string | null;
  
  // Координаты (одинаковые для v1 и v2)
  x?: number;
  y?: number;
  
  // Скролл (одинаковые для v1 и v2)
  scroll_x?: number;
  scroll_y?: number;
  scroll_depth_x?: number;
  scroll_depth_y?: number;
  scroll_direction?: string;
  scroll_type?: string;
  is_nested?: boolean;
  frame_id?: string;
  
  // Overlay данные
  overlay_id?: string;
  overlay_position?: string;
  overlay_close_method?: string;
  overlay_old_id?: string;
  overlay_new_id?: string;
  
  // Метаданные (расширяемые)
  // В БД хранится в поле metadata (JSONB)
  metadata?: {
    renderer?: "screen" | "scene";  // НОВОЕ: явно указываем renderer
    proto_version?: string;          // НОВОЕ: версия прототипа (v1 или v2)
    [key: string]: any;             // Другие метаданные (transition_type, transition_duration и т.д.)
  };
  
  // Legacy поля (для обратной совместимости)
  user_id?: string | null;
}

