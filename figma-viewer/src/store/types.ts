// Общие типы для figma-viewer

export interface Session {
  id: string;
  started_at?: string;
  prototype_id?: string;
  user_id?: string | null;
}

export interface Study {
  id: string;
  title: string;
  status: string;
}

export interface StudyBlock {
  id: string;
  study_id: string;
  type: string;
  order_index: number;
  prototype_id: string | null;
  instructions: string | null;
  config: any;
  eye_tracking_enabled?: boolean;
}

export type BlockType = 
  | "prototype" 
  | "open_question" 
  | "umux_lite" 
  | "choice" 
  | "context" 
  | "scale" 
  | "preference" 
  | "five_seconds" 
  | "card_sorting" 
  | "tree_testing";
