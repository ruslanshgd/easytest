import { 
  Layers, 
  MessageSquare, 
  ListChecks, 
  BarChart3, 
  Images, 
  FileText, 
  Timer, 
  ClipboardList,
  type LucideIcon
} from "lucide-react";

export type BlockType = "prototype" | "open_question" | "umux_lite" | "choice" | "context" | "scale" | "preference" | "five_seconds";

interface BlockTypeConfig {
  value: BlockType;
  label: string;
  icon: LucideIcon;
}

export const BLOCK_TYPE_CONFIG: Record<BlockType, BlockTypeConfig> = {
  prototype: { value: "prototype", label: "Прототип", icon: Layers },
  open_question: { value: "open_question", label: "Открытый вопрос", icon: MessageSquare },
  choice: { value: "choice", label: "Выбор", icon: ListChecks },
  scale: { value: "scale", label: "Шкала", icon: BarChart3 },
  preference: { value: "preference", label: "Предпочтение", icon: Images },
  context: { value: "context", label: "Контекст", icon: FileText },
  five_seconds: { value: "five_seconds", label: "5 секунд", icon: Timer },
  umux_lite: { value: "umux_lite", label: "UMUX Lite", icon: ClipboardList },
};

export const BLOCK_TYPES_LIST = Object.values(BLOCK_TYPE_CONFIG);

export function getBlockTypeConfig(type: BlockType): BlockTypeConfig {
  return BLOCK_TYPE_CONFIG[type] || BLOCK_TYPE_CONFIG.prototype;
}

// Helper component for rendering block type icon
export function BlockTypeIcon({ 
  type, 
  className = "h-4 w-4" 
}: { 
  type: BlockType; 
  className?: string;
}) {
  const config = getBlockTypeConfig(type);
  const Icon = config.icon;
  return <Icon className={className} />;
}
