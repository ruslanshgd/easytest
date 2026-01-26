// Общие типы для всего приложения

export interface Study {
  id: string;
  title: string;
  status: "draft" | "published" | "stopped";
  folder_id: string | null;
  share_token: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  team_id: string;
  parent_id: string | null;
  created_at: string;
}

export interface FolderWithCount extends Folder {
  studiesCount: number;
  subFoldersCount: number;
}

export interface StudyBlock {
  id: string;
  study_id: string;
  type: string;
  order_index: number;
}

export interface StudyStats {
  blocks: StudyBlock[];
  sessionsCount: number;
}

export interface Session {
  id: string;
  started_at?: string;
  event_count?: number;
  last_event_at?: string;
  completed?: boolean;
  aborted?: boolean;
  prototype_id?: string;
  umux_lite_item1?: number | null;
  umux_lite_item2?: number | null;
  umux_lite_score?: number | null;
  umux_lite_sus_score?: number | null;
  feedback_text?: string | null;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  event_type: string;
  screen_id: string | null;
  hotspot_id: string | null;
  timestamp: string;
  x?: number;
  y?: number;
  scroll_x?: number;
  scroll_y?: number;
  scroll_depth_x?: number;
  scroll_depth_y?: number;
  scroll_direction?: string;
  scroll_type?: string;
  is_nested?: boolean;
  frame_id?: string;
}

export interface Proto {
  protoVersion: string;
  start: string;
  end: string;
  flowId?: string;
  screens: any[];
  hotspots: any[];
  edges: any[];
  targets: string[];
}

export interface Screen {
  id: string;
  name: string;
  width: number;
  height: number;
  image: string;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  member_user_id: string;
  role: "owner" | "member";
  joined_at: string;
  email?: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  status: string;
  token?: string;
  created_at: string;
  expires_at: string;
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
  | "tree_testing"
  | "first_click"
  | "matrix"
  | "agreement";
