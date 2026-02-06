import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useAppStore } from "./store";
import { isValidUUID } from "./utils/validation";
import StudyResultsTab from "./components/StudyResultsTab";
import StudyShareTab from "./components/StudyShareTab";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FloatingInput } from "@/components/ui/floating-input";
import { FloatingTextarea } from "@/components/ui/floating-textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AlertBox, FormField, FormSelect, FormTextarea } from "@/components/forms";
import { PrototypeSelect } from "@/components/PrototypeSelect";
import { 
  Layers, 
  MessageSquare, 
  ListChecks, 
  BarChart3, 
  Images, 
  FileText, 
  Timer, 
  ClipboardList,
  ArrowLeft,
  Pencil,
  Copy,
  Trash2,
  Rocket,
  StopCircle,
  Plus,
  GripVertical,
  X,
  Check,
  Settings,
  LayoutGrid,
  GitBranch,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Image as ImageIcon,
  ImagePlus,
  CircleAlert,
  MousePointerClick,
  Table,
  Workflow,
  Link2,
  Eye,
  EyeOff,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";

// Все типы блоков
type BlockType = "prototype" | "open_question" | "umux_lite" | "choice" | "context" | "scale" | "preference" | "five_seconds" | "card_sorting" | "tree_testing" | "first_click" | "matrix" | "agreement";

interface Study {
  id: string;
  title: string;
  status: "draft" | "published" | "stopped";
  folder_id: string | null;
  share_token: string;
  created_at: string;
}

interface StudyBlock {
  id: string;
  study_id: string;
  type: BlockType;
  order_index: number;
  prototype_id: string | null;
  instructions: string | null;
  config: any;
  created_at: string;
  deleted_at?: string | null;
}

interface Prototype {
  id: string;
  task_description: string | null;
}

// Конфиг для типа "Выбор"
interface ChoiceConfig {
  question: string;
  description?: string;
  options: string[];
  allowMultiple: boolean;
  maxSelections?: number;
  shuffle: boolean;
  allowOther: boolean;
  allowNone: boolean;
  noneText?: string;
  optional: boolean;
}

// Конфиг для типа "Контекст"
interface ContextConfig {
  title: string;
  description?: string;
}

// Конфиг для типа "Шкала"
interface ScaleConfig {
  question: string;
  description?: string;
  scaleType: "numeric" | "emoji" | "stars";
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  emojiCount?: 3 | 5;
  optional: boolean;
}

// Конфиг для типа "Предпочтение"
interface PreferenceConfig {
  question: string;
  comparisonType: "all" | "pairwise";
  images: string[];
  shuffle: boolean;
}

// Конфиг для типа "5 секунд"
interface FiveSecondsConfig {
  instruction: string;
  duration: number; // 5-60 секунд
  imageUrl: string;
}

// Конфиг для типа "Тест первого клика"
interface FirstClickConfig {
  instruction: string;
  imageUrl: string;
}

// Конфиг для типа "Карточная сортировка"
interface CardSortingCard {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

interface CardSortingCategory {
  id: string;
  name: string;
}

interface CardSortingConfig {
  task: string;
  sortingType: "open" | "closed"; // открытая или закрытая сортировка
  cards: CardSortingCard[];
  categories: CardSortingCategory[];
  shuffleCards: boolean;
  shuffleCategories: boolean;
  allowPartialSort: boolean; // разрешить не сортировать все карточки
  showImages: boolean;
  showDescriptions: boolean;
}

// Конфиг для типа "Тестирование дерева"
interface TreeTestingNode {
  id: string;
  name: string;
  children: TreeTestingNode[];
  isCorrect?: boolean; // отмечен как верный ответ
}

interface TreeTestingConfig {
  task: string;
  description?: string;
  tree: TreeTestingNode[];
  correctAnswers: string[]; // массив ID узлов, которые являются верными ответами
  allowSkip: boolean; // разрешить пропуск
}

// Конфиг для типа "Матрица"
interface MatrixRow {
  id: string;
  title: string;
}

interface MatrixColumn {
  id: string;
  title: string;
}

interface MatrixConfig {
  question: string;
  description?: string;
  imageUrl?: string;
  rows: MatrixRow[];
  columns: MatrixColumn[];
  shuffleRows: boolean;
  shuffleColumns: boolean;
  allowMultiple: boolean; // Разрешить выбор нескольких вариантов в строке
  optional: boolean;
}

// Конфиг для типа "Соглашение"
interface AgreementConfig {
  title: string; // Заголовок соглашения
  agreementType: "standard" | "custom"; // Тип соглашения
  customPdfUrl?: string; // URL загруженного PDF (если agreementType === "custom")
}

// Конфиг для логики блока
interface LogicCondition {
  blockId: string; // ID блока, ответ на который проверяется
  operator: "contains" | "not_contains" | "equals" | "not_equals" | "completed_on" | "not_completed_on" | "less_than" | "greater_than" | "has_answer";
  value?: string; // Значение для сравнения (для contains, equals, less_than, greater_than); не используется для has_answer
  screenName?: string; // Для прототипов: название финального экрана
}

interface ConditionalLogicRule {
  conditions: LogicCondition[];
  combinators?: ("and" | "or")[]; // Между соседними условиями; length = conditions.length - 1
  goToBlockId: string;
}

interface ConditionalLogic {
  rules: ConditionalLogicRule[];
  elseGoToBlockId?: string; // "Всегда переходить к" при rules.length === 0; "Если ничего не подошло" при rules.length > 0
}

interface ShowOnCondition {
  enabled: boolean;
  action: "show" | "hide";
  conditions: LogicCondition[];
  combinators?: ("and" | "or")[]; // Между соседними условиями; length = conditions.length - 1
}

interface BlockLogic {
  conditionalLogic?: ConditionalLogic; // Логический переход
  showOnCondition?: ShowOnCondition; // Показать при условии
}

const BLOCK_TYPES: { value: BlockType; label: string; Icon: LucideIcon }[] = [
  { value: "prototype", label: "Figma прототип", Icon: Layers },
  { value: "open_question", label: "Открытый вопрос", Icon: MessageSquare },
  { value: "choice", label: "Выбор", Icon: ListChecks },
  { value: "scale", label: "Шкала", Icon: BarChart3 },
  { value: "preference", label: "Предпочтение", Icon: Images },
  { value: "context", label: "Контекст", Icon: FileText },
  { value: "five_seconds", label: "5 секунд", Icon: Timer },
  { value: "card_sorting", label: "Сортировка карточек", Icon: LayoutGrid },
  { value: "matrix", label: "Матрица", Icon: Table },
  { value: "agreement", label: "Соглашение", Icon: ShieldCheck },
  { value: "tree_testing", label: "Тестирование дерева", Icon: GitBranch },
  { value: "umux_lite", label: "UMUX Lite", Icon: ClipboardList },
  { value: "first_click", label: "Тест первого клика", Icon: MousePointerClick },
];

/** Блоки для "Начать с нуля": колонки с иконкой, названием и коротким описанием */
const START_FROM_SCRATCH_COLUMNS: { title: string; blocks: { type: BlockType; label: string; description: string }[] }[] = [
  {
    title: "Базовые блоки",
    blocks: [
      { type: "open_question", label: "Вопрос", description: "Свободный ответ на ваш вопрос. Собирайте обратную связь и идеи." },
      { type: "choice", label: "Выбор", description: "Один или несколько вариантов из списка. Опросы и выбор сценариев." },
      { type: "scale", label: "Шкала", description: "Оценка по шкале (числа, эмодзи или звёзды). Согласие, удобство, NPS." },
      { type: "preference", label: "Предпочтение", description: "Сравнение вариантов. Узнайте, какой вариант нравится больше." },
      { type: "card_sorting", label: "Сортировка карточек", description: "Раскладка карточек по категориям. Изучайте ментальные модели." },
      { type: "matrix", label: "Матрица", description: "Выбор столбцов для каждой строки. Оценка нескольких критериев одновременно." },
      { type: "five_seconds", label: "5 секунд", description: "Показ изображения 5 секунд, затем вопросы. Первое впечатление." },
    ],
  },
  {
    title: "UX‑исследования",
    blocks: [
      { type: "prototype", label: "Протестируйте прототип Figma", description: "Респондент выполняет задание в прототипе. Оцените юзабилити." },
      { type: "first_click", label: "Тест первого клика", description: "Выясните, насколько легко найти функцию. Клик по изображению + время." },
      { type: "tree_testing", label: "Тестирование дерева", description: "Поиск пунктов в иерархии. Проверьте навигацию и структуру." },
    ],
  },
  {
    title: "Другое",
    blocks: [
      { type: "context", label: "Контекст", description: "Текст или описание перед блоками. Даёт респонденту контекст." },
      { type: "agreement", label: "Соглашение", description: "Попросите респондентов принять условия перед участием в исследовании." },
    ],
  },
];

export default function StudyDetail() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const studyId = params.id || null;

  // Store selectors
  const {
    activeTab,
    showAddBlockModal,
    editingBlockId,
    draggedBlockId,
    savingCount,
    isEditingTitle,
    editedTitle,
    newBlockType,
    selectedPrototypeId,
    newBlockInstructions,
    newBlockEyeTrackingEnabled,
    prototypeRecordScreen,
    prototypeRecordCamera,
    prototypeRecordAudio,
    setActiveTab,
    setShowAddBlockModal,
    setEditingBlockId,
    setDraggedBlockId,
    incrementSaving,
    decrementSaving,
    setIsEditingTitle,
    setEditedTitle,
    setNewBlockType,
    setSelectedPrototypeId,
    setNewBlockInstructions,
    setNewBlockEyeTrackingEnabled,
    setPrototypeRecordScreen,
    setPrototypeRecordCamera,
    setPrototypeRecordAudio,
    resetBlockForm,
  } = useAppStore();

  // Local state for study data (specific to this component instance)
  const [study, setStudy] = useState<Study | null>(null);
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [originalBlocksSnapshot, setOriginalBlocksSnapshot] = useState<string>("");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blockIdToDelete, setBlockIdToDelete] = useState<string | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  
  const isSaving = savingCount > 0;
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Блоки без пометки удаления — только для конструктора (сайдбар, список, DnD)
  const constructorBlocks = useMemo(
    () => blocks.filter(b => !b.deleted_at).sort((a, b) => a.order_index - b.order_index),
    [blocks]
  );
  
  // Error handling from UI store
  const { setError: setUIError } = useAppStore();

  // Form states - keeping these local as they're component-specific
  // These can be moved to store if needed for sharing across components
  const [openQuestionText, setOpenQuestionText] = useState("");
  const [openQuestionOptional, setOpenQuestionOptional] = useState(false);
  const [openQuestionImage, setOpenQuestionImage] = useState<{ file: File | null; url: string }>({ file: null, url: "" });
  
  // Choice form
  const [choiceImage, setChoiceImage] = useState<{ file: File | null; url: string }>({ file: null, url: "" });
  const [choiceQuestion, setChoiceQuestion] = useState("");
  const [choiceDescription, setChoiceDescription] = useState("");
  const [choiceOptions, setChoiceOptions] = useState<string[]>(["", ""]);
  const [choiceAllowMultiple, setChoiceAllowMultiple] = useState(false);
  const [choiceMaxSelections, setChoiceMaxSelections] = useState<number>(2);
  const [choiceLimitSelections, setChoiceLimitSelections] = useState(false);
  const [choiceShuffle, setChoiceShuffle] = useState(false);
  const [choiceAllowOther, setChoiceAllowOther] = useState(false);
  const [choiceAllowNone, setChoiceAllowNone] = useState(false);
  const [choiceNoneText, setChoiceNoneText] = useState("Ничего из вышеперечисленного");
  const [choiceOptional, setChoiceOptional] = useState(false);
  
  // Context form
  const [contextTitle, setContextTitle] = useState("");
  const [contextDescription, setContextDescription] = useState("");
  
  // Scale form
  const [scaleImage, setScaleImage] = useState<{ file: File | null; url: string }>({ file: null, url: "" });
  const [scaleQuestion, setScaleQuestion] = useState("");
  const [scaleDescription, setScaleDescription] = useState("");
  const [scaleType, setScaleType] = useState<"numeric" | "emoji" | "stars">("numeric");
  const [scaleMin, setScaleMin] = useState(1);
  const [scaleMax, setScaleMax] = useState(5);
  const [scaleMinLabel, setScaleMinLabel] = useState("");
  const [scaleMaxLabel, setScaleMaxLabel] = useState("");
  const [scaleEmojiCount, setScaleEmojiCount] = useState<3 | 5>(5);
  const [scaleOptional, setScaleOptional] = useState(false);
  
  // Preference form
  const [preferenceQuestion, setPreferenceQuestion] = useState("");
  const [preferenceComparisonType, setPreferenceComparisonType] = useState<"all" | "pairwise">("all");
  const [preferenceImages, setPreferenceImages] = useState<Array<{ file: File | null; url: string; uploading: boolean }>>([
    { file: null, url: "", uploading: false },
    { file: null, url: "", uploading: false }
  ]);
  const [preferenceShuffle, setPreferenceShuffle] = useState(false);
  
  // Five seconds form
  const [fiveSecondsInstruction, setFiveSecondsInstruction] = useState("");
  const [fiveSecondsDuration, setFiveSecondsDuration] = useState(5);
  const [fiveSecondsImage, setFiveSecondsImage] = useState<{ file: File | null; url: string; uploading: boolean }>({ file: null, url: "", uploading: false });

  // First click form
  const [firstClickInstruction, setFirstClickInstruction] = useState("");
  const [firstClickImage, setFirstClickImage] = useState<{ file: File | null; url: string; uploading: boolean }>({ file: null, url: "", uploading: false });
  
  // Card sorting form
  const [cardSortingTask, setCardSortingTask] = useState("");
  const [cardSortingType, setCardSortingType] = useState<"open" | "closed">("open");
  const [cardSortingCards, setCardSortingCards] = useState<Array<{ id: string; title: string; description: string; imageUrl: string; imageFile: File | null }>>([
    { id: crypto.randomUUID(), title: "", description: "", imageUrl: "", imageFile: null }
  ]);
  const [cardSortingCategories, setCardSortingCategories] = useState<Array<{ id: string; name: string }>>([
    { id: crypto.randomUUID(), name: "" }
  ]);
  const [cardSortingShuffleCards, setCardSortingShuffleCards] = useState(true);
  const [cardSortingShuffleCategories, setCardSortingShuffleCategories] = useState(true);
  const [cardSortingAllowPartialSort, setCardSortingAllowPartialSort] = useState(false);
  const [cardSortingShowImages, setCardSortingShowImages] = useState(false);
  const [cardSortingShowDescriptions, setCardSortingShowDescriptions] = useState(false);
  const [showCardSortingCardsModal, setShowCardSortingCardsModal] = useState(false);
  const [showCardSortingCategoriesModal, setShowCardSortingCategoriesModal] = useState(false);
  
  // Tree Testing form
  const [treeTestingTask, setTreeTestingTask] = useState("");
  const [treeTestingDescription, setTreeTestingDescription] = useState("");
  const [treeTestingTree, setTreeTestingTree] = useState<TreeTestingNode[]>([
    { id: crypto.randomUUID(), name: "", children: [] }
  ]);
  const [treeTestingCorrectAnswers, setTreeTestingCorrectAnswers] = useState<string[]>([]);
  const [treeTestingAllowSkip, setTreeTestingAllowSkip] = useState(false);
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Set<string>>(new Set());
  
  // Matrix form
  const [matrixQuestion, setMatrixQuestion] = useState("");
  const [matrixDescription, setMatrixDescription] = useState("");
  const [matrixImage, setMatrixImage] = useState<{ file: File | null; url: string }>({ file: null, url: "" });
  const [matrixRows, setMatrixRows] = useState<Array<{ id: string; title: string }>>([
    { id: crypto.randomUUID(), title: "" }
  ]);
  const [matrixColumns, setMatrixColumns] = useState<Array<{ id: string; title: string }>>([
    { id: crypto.randomUUID(), title: "" }
  ]);
  const [matrixShuffleRows, setMatrixShuffleRows] = useState(false);
  const [matrixShuffleColumns, setMatrixShuffleColumns] = useState(false);
  const [matrixAllowMultiple, setMatrixAllowMultiple] = useState(false);
  const [matrixOptional, setMatrixOptional] = useState(false);
  
  // Agreement form
  const [agreementTitle, setAgreementTitle] = useState("Пожалуйста, ознакомьтесь и примите условия участия в исследовании");
  const [agreementType, setAgreementType] = useState<"standard" | "custom">("standard");
  const [agreementPdfFile, setAgreementPdfFile] = useState<{ file: File | null; url: string }>({ file: null, url: "" });


  const resetAllBlockForms = () => {
    resetBlockForm();
    // Reset all form states
    setOpenQuestionText("");
    setOpenQuestionOptional(false);
    setOpenQuestionImage({ file: null, url: "" });
    setChoiceImage({ file: null, url: "" });
    setChoiceQuestion("");
    setChoiceDescription("");
    setChoiceOptions(["", ""]);
    setChoiceAllowMultiple(false);
    setChoiceMaxSelections(2);
    setChoiceLimitSelections(false);
    setChoiceShuffle(false);
    setChoiceAllowOther(false);
    setChoiceAllowNone(false);
    setChoiceNoneText("Ничего из вышеперечисленного");
    setChoiceOptional(false);
    setContextTitle("");
    setContextDescription("");
    setScaleImage({ file: null, url: "" });
    setScaleQuestion("");
    setScaleDescription("");
    setScaleType("numeric");
    setScaleMin(1);
    setScaleMax(5);
    setScaleMinLabel("");
    setScaleMaxLabel("");
    setScaleEmojiCount(5);
    setScaleOptional(false);
    setPreferenceQuestion("");
    setPreferenceComparisonType("all");
    setPreferenceImages([
      { file: null, url: "", uploading: false },
      { file: null, url: "", uploading: false }
    ]);
    setPreferenceShuffle(false);
    setFiveSecondsInstruction("");
    setFiveSecondsDuration(5);
    setFiveSecondsImage({ file: null, url: "", uploading: false });
    setFirstClickInstruction("");
    setFirstClickImage({ file: null, url: "", uploading: false });
    // Card Sorting
    setCardSortingTask("");
    setCardSortingType("open");
    setCardSortingCards([{ id: crypto.randomUUID(), title: "", description: "", imageUrl: "", imageFile: null }]);
    setCardSortingCategories([{ id: crypto.randomUUID(), name: "" }]);
    setCardSortingShuffleCards(true);
    setCardSortingShuffleCategories(true);
    setCardSortingAllowPartialSort(false);
    setCardSortingShowImages(false);
    setCardSortingShowDescriptions(false);
    // Tree Testing
    setTreeTestingTask("");
    setTreeTestingDescription("");
    setTreeTestingTree([{ id: crypto.randomUUID(), name: "", children: [] }]);
    setTreeTestingCorrectAnswers([]);
    setTreeTestingAllowSkip(false);
    setExpandedTreeNodes(new Set());
    // Matrix
    setMatrixQuestion("");
    setMatrixDescription("");
    setMatrixImage({ file: null, url: "" });
    setMatrixRows([{ id: crypto.randomUUID(), title: "" }]);
    setMatrixColumns([{ id: crypto.randomUUID(), title: "" }]);
    setMatrixShuffleRows(false);
    setMatrixShuffleColumns(false);
    setMatrixAllowMultiple(false);
    setMatrixOptional(false);
    // Agreement
    setAgreementTitle("Пожалуйста, ознакомьтесь и примите условия участия в исследовании");
    setAgreementType("standard");
    setAgreementPdfFile({ file: null, url: "" });
    setNewBlockEyeTrackingEnabled(false);
    setPrototypeRecordScreen(false);
    setPrototypeRecordCamera(false);
    setPrototypeRecordAudio(false);
    setEditingBlockId(null);
  };

  // Загрузка данных блока в форму для редактирования
  const loadBlockForEdit = (block: StudyBlock) => {
    setNewBlockType(block.type);
    setEditingBlockId(block.id);

    switch (block.type) {
      case "prototype":
        setSelectedPrototypeId(block.prototype_id || "");
        setNewBlockInstructions(block.instructions || "");
        setNewBlockEyeTrackingEnabled(!!block.config?.eye_tracking_enabled);
        setPrototypeRecordScreen(!!block.config?.record_screen);
        setPrototypeRecordCamera(!!block.config?.record_camera);
        setPrototypeRecordAudio(!!block.config?.record_audio);
        break;

      case "open_question":
        setOpenQuestionText(block.config?.question || "");
        setOpenQuestionOptional(block.config?.optional || false);
        setOpenQuestionImage({ file: null, url: block.config?.imageUrl || "" });
        break;

      case "choice":
        setChoiceQuestion(block.config?.question || "");
        setChoiceDescription(block.config?.description || "");
        setChoiceOptions(block.config?.options?.length > 0 ? block.config.options : ["", ""]);
        setChoiceAllowMultiple(block.config?.allowMultiple || false);
        setChoiceMaxSelections(block.config?.maxSelections || 2);
        setChoiceLimitSelections(!!block.config?.maxSelections);
        setChoiceShuffle(block.config?.shuffle || false);
        setChoiceAllowOther(block.config?.allowOther || false);
        setChoiceAllowNone(block.config?.allowNone || false);
        setChoiceNoneText(block.config?.noneText || "Ничего из вышеперечисленного");
        setChoiceOptional(block.config?.optional || false);
        setChoiceImage({ file: null, url: block.config?.imageUrl || "" });
        break;

      case "context":
        setContextTitle(block.config?.title || "");
        setContextDescription(block.config?.description || "");
        break;

      case "scale":
        setScaleQuestion(block.config?.question || "");
        setScaleDescription(block.config?.description || "");
        setScaleType(block.config?.scaleType || "numeric");
        setScaleMin(block.config?.min || 1);
        setScaleMax(block.config?.max || 5);
        setScaleMinLabel(block.config?.minLabel || "");
        setScaleMaxLabel(block.config?.maxLabel || "");
        setScaleEmojiCount(block.config?.emojiCount || 5);
        setScaleOptional(block.config?.optional || false);
        setScaleImage({ file: null, url: block.config?.imageUrl || "" });
        break;

      case "preference":
        setPreferenceQuestion(block.config?.question || "");
        setPreferenceComparisonType(block.config?.comparisonType || "all");
        const prefImages = block.config?.images || [];
        setPreferenceImages(
          prefImages.length > 0
            ? prefImages.map((url: string) => ({ file: null, url, uploading: false }))
            : [{ file: null, url: "", uploading: false }, { file: null, url: "", uploading: false }]
        );
        setPreferenceShuffle(block.config?.shuffle || false);
        break;

      case "five_seconds":
        setFiveSecondsInstruction(block.config?.instruction || "");
        setFiveSecondsDuration(block.config?.duration || 5);
        setFiveSecondsImage({ file: null, url: block.config?.imageUrl || "", uploading: false });
        break;

      case "first_click":
        setFirstClickInstruction(block.config?.instruction || "");
        setFirstClickImage({ file: null, url: block.config?.imageUrl || "", uploading: false });
        break;

      case "card_sorting":
        setCardSortingTask(block.config?.task || "");
        setCardSortingType(block.config?.sortingType || "open");
        setCardSortingCards(
          block.config?.cards?.length > 0
            ? block.config.cards.map((c: any) => ({ ...c, imageFile: null }))
            : [{ id: crypto.randomUUID(), title: "", description: "", imageUrl: "", imageFile: null }]
        );
        setCardSortingCategories(
          block.config?.categories?.length > 0
            ? block.config.categories
            : [{ id: crypto.randomUUID(), name: "" }]
        );
        setCardSortingShuffleCards(block.config?.shuffleCards ?? true);
        setCardSortingShuffleCategories(block.config?.shuffleCategories ?? true);
        setCardSortingAllowPartialSort(block.config?.allowPartialSort || false);
        setCardSortingShowImages(block.config?.showImages || false);
        setCardSortingShowDescriptions(block.config?.showDescriptions || false);
        break;

      case "tree_testing":
        setTreeTestingTask(block.config?.task || "");
        setTreeTestingDescription(block.config?.description || "");
        setTreeTestingTree(
          block.config?.tree?.length > 0
            ? block.config.tree
            : [{ id: crypto.randomUUID(), name: "", children: [] }]
        );
        setTreeTestingCorrectAnswers(block.config?.correctAnswers || []);
        setTreeTestingAllowSkip(block.config?.allowSkip || false);
        // Развернуть все узлы по умолчанию при редактировании
        const allNodeIds = new Set<string>();
        const collectIds = (nodes: TreeTestingNode[]) => {
          nodes.forEach(node => {
            if (node.children.length > 0) {
              allNodeIds.add(node.id);
              collectIds(node.children);
            }
          });
        };
        collectIds(block.config?.tree || []);
        setExpandedTreeNodes(allNodeIds);
        break;

      case "matrix":
        setMatrixQuestion(block.config?.question || "");
        setMatrixDescription(block.config?.description || "");
        setMatrixImage({ file: null, url: block.config?.imageUrl || "" });
        setMatrixRows(
          block.config?.rows?.length > 0
            ? block.config.rows
            : [{ id: crypto.randomUUID(), title: "" }]
        );
        setMatrixColumns(
          block.config?.columns?.length > 0
            ? block.config.columns
            : [{ id: crypto.randomUUID(), title: "" }]
        );
        setMatrixShuffleRows(block.config?.shuffleRows || false);
        setMatrixShuffleColumns(block.config?.shuffleColumns || false);
        setMatrixAllowMultiple(block.config?.allowMultiple || false);
        setMatrixOptional(block.config?.optional || false);
        break;

      case "agreement":
        setAgreementTitle(block.config?.title || "Пожалуйста, ознакомьтесь и примите условия участия в исследовании");
        setAgreementType(block.config?.agreementType || "standard");
        setAgreementPdfFile({ file: null, url: block.config?.customPdfUrl || "" });
        break;
    }
  };

  // Функция загрузки изображения в Supabase Storage
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация для загрузки файлов");
        return null;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("study-images")
        .upload(fileName, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        setError(`Ошибка загрузки файла: ${uploadError.message}`);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("study-images")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (err) {
      console.error("Upload error:", err);
      setError(`Ошибка загрузки: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  // Функция загрузки PDF файла в Supabase Storage
  const uploadPdf = async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация для загрузки файлов");
        return null;
      }

      if (file.type !== "application/pdf") {
        setError("Файл должен быть в формате PDF");
        return null;
      }

      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("study-images")
        .upload(fileName, file, {
          contentType: "application/pdf"
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        setError(`Ошибка загрузки файла: ${uploadError.message}`);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("study-images")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (err) {
      console.error("Upload error:", err);
      setError(`Ошибка загрузки: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  const loadStudy = async () => {
    if (!studyId || !isValidUUID(studyId)) {
      setError("Неверный ID теста");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        setLoading(false);
        return;
      }

      const { data: studyData, error: studyError } = await supabase
        .from("studies")
        .select("*")
        .eq("id", studyId)
        .single();

      if (studyError) {
        setError(studyError.message);
        setLoading(false);
        return;
      }

      setStudy(studyData as Study);

      const { data: blocksData, error: blocksError } = await supabase
        .from("study_blocks")
        .select("*")
        .eq("study_id", studyId)
        .order("order_index", { ascending: true });

      if (blocksError) {
        setError(blocksError.message);
        setLoading(false);
        return;
      }

      setBlocks(blocksData || []);

      // Прототипы: свои (user_id) + привязанные к блокам текущего теста (для членов команды, просматривающих чужой тест)
      const prototypeIdsInStudy = (blocksData || [])
        .filter((b: StudyBlock) => b.prototype_id)
        .map((b: StudyBlock) => b.prototype_id) as string[];
      const uniqueIds = [...new Set(prototypeIdsInStudy)];

      const { data: userPrototypes } = await supabase
        .from("prototypes")
        .select("id, task_description")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      let prototypesData = userPrototypes || [];
      if (uniqueIds.length > 0) {
        const { data: studyPrototypes } = await supabase
          .from("prototypes")
          .select("id, task_description")
          .in("id", uniqueIds);
        const merged = [...prototypesData];
        for (const p of studyPrototypes || []) {
          if (!merged.some((m) => m.id === p.id)) merged.push(p);
        }
        prototypesData = merged;
      }

      setPrototypes(prototypesData);
      
      // Сохраняем snapshot блоков для отслеживания изменений
      if (studyData.status === "published") {
        setOriginalBlocksSnapshot(JSON.stringify(blocksData || []));
        setHasUnpublishedChanges(false);
      } else {
        setOriginalBlocksSnapshot("");
        setHasUnpublishedChanges(false);
      }
    } catch (err) {
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudy();
  }, [studyId]);

  // Автоматически выбираем первый блок при загрузке блоков (только из видимых в конструкторе)
  useEffect(() => {
    if (constructorBlocks.length > 0 && !selectedBlockId) {
      setSelectedBlockId(constructorBlocks[0].id);
    }
  }, [constructorBlocks, selectedBlockId]);

  // Оптимистичное обновление блока в локальном state + сохранение в БД в фоне
  const updateBlockInState = useCallback(async (blockId: string, updates: Partial<StudyBlock>) => {
    // 1. Оптимистично обновляем локальный state сразу
    setBlocks(prevBlocks => 
      prevBlocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
    );
    
    // 2. Сохраняем в БД в фоне
    incrementSaving();
    try {
      const { error } = await supabase
        .from("study_blocks")
        .update(updates)
        .eq("id", blockId);
      
      if (error) {
        console.error("Ошибка сохранения блока:", error);
        // При ошибке можно откатить изменения, но пока просто логируем
      }
    } finally {
      decrementSaving();
    }
  }, []);

  const handlePrototypeDeleted = useCallback((id: string) => {
    setPrototypes((prev) => prev.filter((p) => p.id !== id));
    setBlocks((prev) =>
      prev.map((b) =>
        b.prototype_id === id ? { ...b, prototype_id: null } : b
      )
    );
  }, []);

  // Фокус на инпут при начале редактирования названия
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Синхронизация editedTitle с study.title
  useEffect(() => {
    if (study) {
      if (study) {
        setEditedTitle(study.title);
      }
    }
  }, [study?.title]);

  // Отслеживание изменений в опубликованном тесте
  useEffect(() => {
    if (study?.status === "published" && originalBlocksSnapshot) {
      const currentSnapshot = JSON.stringify(blocks);
      setHasUnpublishedChanges(currentSnapshot !== originalBlocksSnapshot);
    } else {
      setHasUnpublishedChanges(false);
    }
  }, [blocks, study?.status, originalBlocksSnapshot]);

  // Закрыть модалку «Добавить/Редактировать блок» при переходе в статус «Опубликован»
  useEffect(() => {
    if (study?.status === "published" && showAddBlockModal) {
      setShowAddBlockModal(false);
    }
  }, [study?.status, showAddBlockModal, setShowAddBlockModal]);

  const handlePublishClick = () => {
    if (!study || !studyId) return;
    if (constructorBlocks.length === 0) {
      setError("Добавьте хотя бы один блок перед публикацией");
      return;
    }
    setShowPublishDialog(true);
  };

  const handlePublishConfirm = async () => {
    if (!study || !studyId) return;

    // Снимок блоков на момент публикации — респонденты видят только его, а не последующие правки
    const { data: blocksForSnapshot, error: blocksErr } = await supabase
      .from("study_blocks")
      .select("id, study_id, type, order_index, prototype_id, instructions, config")
      .eq("study_id", studyId)
      .is("deleted_at", null)
      .order("order_index", { ascending: true });

    if (blocksErr || !blocksForSnapshot?.length) {
      setError(blocksErr?.message ?? "Нет блоков для публикации");
      return;
    }

    const { error: updateError } = await supabase
      .from("studies")
      .update({
        status: "published",
        published_blocks_snapshot: blocksForSnapshot,
      })
      .eq("id", studyId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setShowPublishDialog(false);
    await loadStudy();
  };

  const handleStopClick = () => {
    if (!study || !studyId) return;
    setShowStopDialog(true);
  };

  const handleStopConfirm = async () => {
    if (!study || !studyId) return;
    // Остановка теста: статус "stopped", редактирование снова доступно; в списке папки отображается "Остановлен".
    const { error: updateError } = await supabase
      .from("studies")
      .update({ status: "stopped" })
      .eq("id", studyId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setShowStopDialog(false);
    await loadStudy();
  };

  /** @deprecated Используйте handleStopClick. Оставлен для обратной совместимости. */
  const handleStop = handleStopClick;

  const handleDuplicate = () => {
    if (!study || !studyId) return;
    setShowDuplicateDialog(true);
  };

  const handleDuplicateConfirm = async () => {
    if (!study || !studyId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: newStudy, error: createError } = await supabase
      .from("studies")
      .insert([{ title: `${study?.title || "Тест"} (копия)`, user_id: user.id, status: "draft" }])
      .select()
      .single();

    if (createError || !newStudy) {
      setError(createError?.message || "Ошибка создания копии");
      return;
    }

    if (constructorBlocks.length > 0) {
      const newBlocks = constructorBlocks.map(block => ({
        study_id: newStudy.id,
        type: block.type,
        order_index: block.order_index,
        prototype_id: block.prototype_id,
        instructions: block.instructions,
        config: block.config
      }));
      await supabase.from("study_blocks").insert(newBlocks);
    }

    setShowDuplicateDialog(false);
    navigate(`/studies/${newStudy.id}`);
  };

  const handleDelete = async () => {
    if (!study || !studyId) return;
    if (!confirm(`Удалить тест "${study?.title || "Тест"}"? Все блоки, прохождения и ответы будут удалены.`)) return;

    const { error: deleteError } = await supabase
      .from("studies")
      .delete()
      .eq("id", studyId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    navigate("/studies");
  };

  const handleAddBlock = async () => {
    if (!studyId || study?.status !== "draft") return;

    const isEditing = editingBlockId !== null;
    const blockData: any = {
      type: newBlockType,
    };

    // При создании нового блока добавляем order_index (после последнего видимого в конструкторе)
    if (!isEditing) {
      const maxOrderIndex = constructorBlocks.length > 0 ? Math.max(...constructorBlocks.map(b => b.order_index)) : -1;
      blockData.study_id = studyId;
      blockData.order_index = maxOrderIndex + 1;
    }

    // Валидация и конфиг по типу
    switch (newBlockType) {
      case "prototype":
        if (!selectedPrototypeId) {
          setError("Выберите прототип");
          return;
        }
        blockData.prototype_id = selectedPrototypeId;
        blockData.instructions = newBlockInstructions.trim() || null;
        blockData.config = {
          ...(blockData.config || {}),
          eye_tracking_enabled: newBlockEyeTrackingEnabled,
          record_screen: prototypeRecordScreen,
          record_camera: prototypeRecordCamera,
          record_audio: prototypeRecordAudio,
        };
        break;

      case "open_question":
        if (!openQuestionText.trim()) {
          setError("Введите текст вопроса");
          return;
        }
        let openQuestionImageUrl: string | undefined;
        if (openQuestionImage.file) {
          const uploaded = await uploadImage(openQuestionImage.file);
          if (!uploaded) return;
          openQuestionImageUrl = uploaded;
        } else if (openQuestionImage.url) {
          openQuestionImageUrl = openQuestionImage.url;
        }
        blockData.config = { 
          question: openQuestionText.trim(),
          optional: openQuestionOptional,
          imageUrl: openQuestionImageUrl
        };
        break;

      case "umux_lite":
        blockData.config = {};
        break;

      case "choice":
        if (!choiceQuestion.trim()) {
          setError("Введите текст вопроса");
          return;
        }
        const validOptions = choiceOptions.filter(o => o.trim());
        if (validOptions.length < 2) {
          setError("Добавьте минимум 2 варианта ответа");
          return;
        }
        let choiceImageUrl: string | undefined;
        if (choiceImage.file) {
          const uploaded = await uploadImage(choiceImage.file);
          if (!uploaded) return;
          choiceImageUrl = uploaded;
        } else if (choiceImage.url) {
          choiceImageUrl = choiceImage.url;
        }
        blockData.config = {
          question: choiceQuestion.trim(),
          description: choiceDescription.trim() || undefined,
          options: validOptions,
          allowMultiple: choiceAllowMultiple,
          maxSelections: choiceAllowMultiple && choiceLimitSelections ? choiceMaxSelections : undefined,
          shuffle: choiceShuffle,
          allowOther: choiceAllowOther,
          allowNone: choiceAllowNone,
          noneText: choiceAllowNone ? choiceNoneText : undefined,
          optional: choiceOptional,
          imageUrl: choiceImageUrl
        } as ChoiceConfig;
        break;

      case "context":
        if (!contextTitle.trim()) {
          setError("Введите заголовок");
          return;
        }
        blockData.config = {
          title: contextTitle.trim(),
          description: contextDescription.trim() || undefined
        } as ContextConfig;
        break;

      case "scale":
        if (!scaleQuestion.trim()) {
          setError("Введите текст вопроса");
          return;
        }
        let scaleImageUrl: string | undefined;
        if (scaleImage.file) {
          const uploaded = await uploadImage(scaleImage.file);
          if (!uploaded) return;
          scaleImageUrl = uploaded;
        } else if (scaleImage.url) {
          scaleImageUrl = scaleImage.url;
        }
        blockData.config = {
          question: scaleQuestion.trim(),
          description: scaleDescription.trim() || undefined,
          scaleType: scaleType,
          min: scaleType === "numeric" ? scaleMin : undefined,
          max: scaleType === "numeric" ? scaleMax : undefined,
          minLabel: scaleMinLabel.trim() || undefined,
          maxLabel: scaleMaxLabel.trim() || undefined,
          emojiCount: scaleType === "emoji" ? scaleEmojiCount : undefined,
          optional: scaleOptional,
          imageUrl: scaleImageUrl
        } as ScaleConfig;
        break;

      case "preference":
        if (!preferenceQuestion.trim()) {
          setError("Введите текст вопроса");
          return;
        }
        const validPrefImages = preferenceImages.filter(i => i.url || i.file);
        if (validPrefImages.length < 2) {
          setError("Добавьте минимум 2 изображения");
          return;
        }
        // Загружаем файлы если есть
        const uploadedPrefUrls: string[] = [];
        for (const img of preferenceImages) {
          if (img.file) {
            const uploadedUrl = await uploadImage(img.file);
            if (!uploadedUrl) return; // Ошибка уже показана
            uploadedPrefUrls.push(uploadedUrl);
          } else if (img.url) {
            uploadedPrefUrls.push(img.url);
          }
        }
        if (uploadedPrefUrls.length < 2) {
          setError("Не удалось загрузить изображения");
          return;
        }
        blockData.config = {
          question: preferenceQuestion.trim(),
          comparisonType: preferenceComparisonType,
          images: uploadedPrefUrls,
          shuffle: preferenceComparisonType === "all" ? preferenceShuffle : false
        } as PreferenceConfig;
        break;

      case "five_seconds":
        if (!fiveSecondsInstruction.trim()) {
          setError("Введите инструкцию");
          return;
        }
        if (!fiveSecondsImage.file && !fiveSecondsImage.url) {
          setError("Добавьте изображение");
          return;
        }
        let fiveSecondsImageUrl = fiveSecondsImage.url;
        if (fiveSecondsImage.file) {
          const uploadedUrl = await uploadImage(fiveSecondsImage.file);
          if (!uploadedUrl) return;
          fiveSecondsImageUrl = uploadedUrl;
        }
        blockData.config = {
          instruction: fiveSecondsInstruction.trim(),
          duration: fiveSecondsDuration,
          imageUrl: fiveSecondsImageUrl
        } as FiveSecondsConfig;
        break;

      case "first_click":
        if (!firstClickInstruction.trim()) {
          setError("Введите инструкцию");
          return;
        }
        if (!firstClickImage.file && !firstClickImage.url) {
          setError("Добавьте изображение");
          return;
        }
        let firstClickImageUrl = firstClickImage.url;
        if (firstClickImage.file) {
          const uploadedUrl = await uploadImage(firstClickImage.file);
          if (!uploadedUrl) return;
          firstClickImageUrl = uploadedUrl;
        }
        blockData.config = {
          instruction: firstClickInstruction.trim(),
          imageUrl: firstClickImageUrl
        } as FirstClickConfig;
        break;

      case "card_sorting":
        if (!cardSortingTask.trim()) {
          setError("Введите текст задания");
          return;
        }
        const validCards = cardSortingCards.filter(c => c.title.trim());
        if (validCards.length < 2) {
          setError("Добавьте минимум 2 карточки с названиями");
          return;
        }
        // Для закрытой сортировки нужны категории
        if (cardSortingType === "closed") {
          const validCategories = cardSortingCategories.filter(c => c.name.trim());
          if (validCategories.length < 2) {
            setError("Для закрытой сортировки добавьте минимум 2 категории");
            return;
          }
        }
        // Загружаем изображения карточек если они есть
        const uploadedCards: CardSortingCard[] = [];
        for (const card of cardSortingCards) {
          if (!card.title.trim()) continue;
          let cardImageUrl = card.imageUrl;
          if (card.imageFile) {
            const uploadedUrl = await uploadImage(card.imageFile);
            if (!uploadedUrl) return;
            cardImageUrl = uploadedUrl;
          }
          uploadedCards.push({
            id: card.id,
            title: card.title.trim(),
            description: card.description?.trim() || undefined,
            imageUrl: cardImageUrl || undefined
          });
        }
        const validCategoriesForConfig = cardSortingCategories.filter(c => c.name.trim()).map(c => ({
          id: c.id,
          name: c.name.trim()
        }));
        blockData.config = {
          task: cardSortingTask.trim(),
          sortingType: cardSortingType,
          cards: uploadedCards,
          categories: validCategoriesForConfig,
          shuffleCards: cardSortingShuffleCards,
          shuffleCategories: cardSortingShuffleCategories,
          allowPartialSort: cardSortingAllowPartialSort,
          showImages: cardSortingShowImages,
          showDescriptions: cardSortingShowDescriptions
        } as CardSortingConfig;
        break;

      case "matrix":
        if (!matrixQuestion.trim()) {
          setError("Введите текст вопроса");
          return;
        }
        const validRows = matrixRows.filter(r => r.title.trim());
        if (validRows.length < 1) {
          setError("Добавьте минимум 1 строку с названием");
          return;
        }
        const validColumns = matrixColumns.filter(c => c.title.trim());
        if (validColumns.length < 1) {
          setError("Добавьте минимум 1 столбец с названием");
          return;
        }
        let matrixImageUrl: string | undefined;
        if (matrixImage.file) {
          const uploaded = await uploadImage(matrixImage.file);
          if (!uploaded) return;
          matrixImageUrl = uploaded;
        } else if (matrixImage.url) {
          matrixImageUrl = matrixImage.url;
        }
        blockData.config = {
          question: matrixQuestion.trim(),
          description: matrixDescription.trim() || undefined,
          imageUrl: matrixImageUrl,
          rows: validRows.map(r => ({ id: r.id, title: r.title.trim() })),
          columns: validColumns.map(c => ({ id: c.id, title: c.title.trim() })),
          shuffleRows: matrixShuffleRows,
          shuffleColumns: matrixShuffleColumns,
          allowMultiple: matrixAllowMultiple,
          optional: matrixOptional
        } as MatrixConfig;
        break;

      case "agreement":
        if (!agreementTitle.trim()) {
          setError("Введите заголовок соглашения");
          return;
        }
        let agreementPdfUrl: string | undefined;
        if (agreementType === "custom") {
          if (!agreementPdfFile.file && !agreementPdfFile.url) {
            setError("Загрузите файл соглашения");
            return;
          }
          if (agreementPdfFile.file) {
            const uploaded = await uploadPdf(agreementPdfFile.file);
            if (!uploaded) return;
            agreementPdfUrl = uploaded;
          } else if (agreementPdfFile.url) {
            agreementPdfUrl = agreementPdfFile.url;
          }
        }
        blockData.config = {
          title: agreementTitle.trim(),
          agreementType: agreementType,
          customPdfUrl: agreementPdfUrl
        } as AgreementConfig;
        break;

      case "tree_testing":
        if (!treeTestingTask.trim()) {
          setError("Введите текст задания");
          return;
        }
        // Рекурсивно подсчитываем количество узлов с названиями
        const countValidNodes = (nodes: TreeTestingNode[]): number => {
          return nodes.reduce((acc, node) => {
            const selfCount = node.name.trim() ? 1 : 0;
            return acc + selfCount + countValidNodes(node.children);
          }, 0);
        };
        if (countValidNodes(treeTestingTree) < 2) {
          setError("Добавьте минимум 2 категории с названиями");
          return;
        }
        // Рекурсивно очищаем дерево от пустых узлов
        const cleanTree = (nodes: TreeTestingNode[]): TreeTestingNode[] => {
          return nodes
            .filter(node => node.name.trim())
            .map(node => ({
              id: node.id,
              name: node.name.trim(),
              children: cleanTree(node.children)
            }));
        };
        blockData.config = {
          task: treeTestingTask.trim(),
          description: treeTestingDescription.trim() || undefined,
          tree: cleanTree(treeTestingTree),
          correctAnswers: treeTestingCorrectAnswers,
          allowSkip: treeTestingAllowSkip
        } as TreeTestingConfig;
        break;

      default:
        // Если тип блока не обработан, устанавливаем пустой config
        // чтобы избежать ошибки NOT NULL constraint
        if (!blockData.config) {
          blockData.config = {};
        }
        break;
    }

    // Защита: убеждаемся, что config всегда установлен перед вставкой/обновлением
    if (!blockData.config) {
      console.error("Block config is missing for type:", newBlockType);
      setError("Ошибка: конфигурация блока не установлена");
      return;
    }

    if (isEditing) {
      const { error: updateError } = await supabase
        .from("study_blocks")
        .update(blockData)
        .eq("id", editingBlockId);

      if (updateError) {
        setError(updateError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("study_blocks")
        .insert([blockData]);

      if (insertError) {
        setError(insertError.message);
        return;
      }
    }

    setShowAddBlockModal(false);
    resetBlockForm();
    resetBlockForm();
    await loadStudy();
  };

  const requestDeleteBlock = (blockId: string) => {
    if (study?.status !== "draft") return;
    setBlockIdToDelete(blockId);
  };

  const performDeleteBlock = async (blockId: string) => {
    const now = new Date().toISOString();
    const remainingConstructorBlocks = blocks.filter(b => !b.deleted_at && b.id !== blockId);

    if (selectedBlockId === blockId) {
      if (remainingConstructorBlocks.length > 0) {
        const currentBlockIndex = blocks.filter(b => !b.deleted_at).findIndex(b => b.id === blockId);
        const nextBlockIndex = currentBlockIndex < remainingConstructorBlocks.length
          ? currentBlockIndex
          : currentBlockIndex - 1;
        setSelectedBlockId(remainingConstructorBlocks[nextBlockIndex]?.id ?? null);
      } else {
        setSelectedBlockId(null);
      }
    }

    setBlocks(prevBlocks =>
      prevBlocks.map(b => (b.id === blockId ? { ...b, deleted_at: now } : b))
    );

    incrementSaving();
    try {
      const { error: updateError } = await supabase
        .from("study_blocks")
        .update({ deleted_at: now })
        .eq("id", blockId);

      if (updateError) {
        await loadStudy();
        setError(updateError.message);
      }
    } finally {
      decrementSaving();
    }
  };

  const handleDeleteBlock = (blockId: string) => {
    requestDeleteBlock(blockId);
  };

  const handleDuplicateBlock = async (blockId: string) => {
    if (!studyId || study?.status !== "draft") return;

    const blockToDuplicate = blocks.find(b => b.id === blockId);
    if (!blockToDuplicate) return;

    const maxOrderIndex = constructorBlocks.length > 0 ? Math.max(...constructorBlocks.map(b => b.order_index)) : -1;

    const blockData: any = {
      study_id: studyId,
      type: blockToDuplicate.type,
      order_index: maxOrderIndex + 1,
      prototype_id: blockToDuplicate.prototype_id,
      instructions: blockToDuplicate.instructions,
      config: blockToDuplicate.config
    };

    incrementSaving();
    try {
      const { data: newBlock, error: insertError } = await supabase
        .from("study_blocks")
        .insert([blockData])
        .select()
        .single();

      if (insertError || !newBlock) {
        setError(insertError?.message || "Ошибка дублирования блока");
        return;
      }

      // Добавляем новый блок в локальный state
      setBlocks(prevBlocks => [...prevBlocks, newBlock as StudyBlock].sort((a, b) => a.order_index - b.order_index));
    } finally {
      decrementSaving();
    }
  };

  // Быстрое добавление блока с дефолтными значениями
  const handleQuickAddBlock = async (blockType: BlockType) => {
    if (!studyId || (study?.status !== "draft" && study?.status !== "stopped")) return;

    const maxOrderIndex = constructorBlocks.length > 0 ? Math.max(...constructorBlocks.map(b => b.order_index)) : -1;
    
    // Дефолтные конфиги для разных типов блоков
    const defaultConfigs: Record<BlockType, any> = {
      prototype: {},
      open_question: { question: "Введите ваш вопрос", optional: false },
      umux_lite: {},
      choice: { 
        question: "Введите вопрос", 
        options: ["Вариант 1", "Вариант 2"], 
        allowMultiple: false, 
        shuffle: false, 
        allowOther: false, 
        allowNone: false, 
        optional: false 
      },
      context: { title: "Заголовок", description: "" },
      scale: { 
        question: "Введите вопрос", 
        scaleType: "numeric", 
        min: 1, 
        max: 5, 
        optional: false 
      },
      preference: { 
        question: "Какой вариант вам нравится больше?", 
        comparisonType: "all", 
        images: [], 
        shuffle: false 
      },
      five_seconds: { instruction: "Посмотрите на изображение", duration: 5, imageUrl: "" },
      first_click: { instruction: "Введите задание для респондента", imageUrl: "" },
      card_sorting: { 
        task: "Разложите карточки по категориям", 
        sortingType: "open", 
        cards: [], 
        categories: [], 
        shuffleCards: true, 
        shuffleCategories: true, 
        allowPartialSort: false, 
        showImages: false, 
        showDescriptions: false 
      },
      tree_testing: { 
        task: "Найдите нужную категорию", 
        tree: [{ id: crypto.randomUUID(), name: "Категория 1", children: [] }], 
        correctAnswers: [], 
        allowSkip: false 
      },
      matrix: {
        question: "Введите вопрос",
        description: "",
        imageUrl: undefined,
        rows: [{ id: crypto.randomUUID(), title: "" }],
        columns: [{ id: crypto.randomUUID(), title: "" }],
        shuffleRows: false,
        shuffleColumns: false,
        allowMultiple: false,
        optional: false
      },
      agreement: {
        title: "Соглашение",
        agreementType: "standard" as const,
        customPdfUrl: undefined
      }
    };

    // Защита: убеждаемся, что config всегда установлен
    const config = defaultConfigs[blockType];
    if (!config) {
      console.error("Block config is missing for type:", blockType);
      setError("Ошибка: конфигурация блока не установлена");
      return;
    }

    const blockData: any = {
      study_id: studyId,
      type: blockType,
      order_index: maxOrderIndex + 1,
      config: config
    };

    incrementSaving();
    try {
      const { data: newBlock, error: insertError } = await supabase
        .from("study_blocks")
        .insert([blockData])
        .select()
        .single();

      if (insertError || !newBlock) {
        setError(insertError?.message || "Ошибка добавления блока");
        return;
      }

      // Добавляем новый блок в локальный state
      setBlocks(prevBlocks => [...prevBlocks, newBlock as StudyBlock].sort((a, b) => a.order_index - b.order_index));
    } finally {
      decrementSaving();
    }
  };

  const handleDragStart = (blockId: string) => {
    if (study?.status !== "draft") return;
    setDraggedBlockId(blockId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetBlockId: string) => {
    if (study?.status !== "draft" || !draggedBlockId || draggedBlockId === targetBlockId) {
      setDraggedBlockId(null);
      return;
    }

    const draggedBlock = constructorBlocks.find(b => b.id === draggedBlockId);
    const targetBlock = constructorBlocks.find(b => b.id === targetBlockId);
    if (!draggedBlock || !targetBlock) {
      setDraggedBlockId(null);
      return;
    }

    const draggedIndex = draggedBlock.order_index;
    const targetIndex = targetBlock.order_index;
    const updates: Array<{ id: string; order_index: number }> = [];

    if (draggedIndex < targetIndex) {
      for (const block of constructorBlocks) {
        if (block.id === draggedBlockId) {
          updates.push({ id: block.id, order_index: targetIndex });
        } else if (block.order_index > draggedIndex && block.order_index <= targetIndex) {
          updates.push({ id: block.id, order_index: block.order_index - 1 });
        }
      }
    } else {
      for (const block of constructorBlocks) {
        if (block.id === draggedBlockId) {
          updates.push({ id: block.id, order_index: targetIndex });
        } else if (block.order_index >= targetIndex && block.order_index < draggedIndex) {
          updates.push({ id: block.id, order_index: block.order_index + 1 });
        }
      }
    }

    setBlocks(prevBlocks => {
      const updatesMap = new Map(updates.map(u => [u.id, u.order_index]));
      return prevBlocks
        .map(b => updatesMap.has(b.id) ? { ...b, order_index: updatesMap.get(b.id)! } : b)
        .sort((a, b) => a.order_index - b.order_index);
    });
    setDraggedBlockId(null);

    incrementSaving();
    try {
      for (const update of updates) {
        await supabase.from("study_blocks").update({ order_index: update.order_index }).eq("id", update.id);
      }
    } finally {
      decrementSaving();
    }
  };

  const getBlockTypeInfo = (type: BlockType) => {
    return BLOCK_TYPES.find(t => t.value === type) || BLOCK_TYPES[0];
  };

  const getBlockDescription = (block: StudyBlock): string => {
    switch (block.type) {
      case "prototype":
        const proto = prototypes.find(p => p.id === block.prototype_id);
        return proto?.task_description || block.prototype_id?.substring(0, 8) || "Не выбран";
      case "open_question":
        return block.config?.question || "Нет текста";
      case "umux_lite":
        return "Оценка удобства использования (2 вопроса)";
      case "choice":
        return `${block.config?.question || "Вопрос"} (${block.config?.options?.length || 0} вариантов)`;
      case "context":
        return block.config?.title || "Без заголовка";
      case "scale":
        const scaleTypes = { numeric: "Числовая", emoji: "Эмодзи", stars: "Звезды" };
        return `${block.config?.question || "Вопрос"} (${scaleTypes[block.config?.scaleType as keyof typeof scaleTypes] || "Шкала"})`;
      case "preference":
        const compTypes = { all: "Выбор из всех", pairwise: "Попарное" };
        return `${block.config?.question || "Вопрос"} (${compTypes[block.config?.comparisonType as keyof typeof compTypes] || ""})`;
      case "five_seconds":
        return `${block.config?.instruction || "Инструкция"} (${block.config?.duration || 5} сек)`;
      case "first_click": {
        const instr = String(block.config?.instruction ?? "Инструкция");
        return instr.length > 40 ? `${instr.substring(0, 40)}…` : instr;
      }
      case "card_sorting":
        const sortTypes = { open: "Открытая", closed: "Закрытая" };
        return `${block.config?.task?.substring(0, 30) || "Задание"} (${sortTypes[block.config?.sortingType as keyof typeof sortTypes] || "Сортировка"}, ${block.config?.cards?.length || 0} карточек)`;
      case "tree_testing":
        const countTreeNodes = (nodes: any[]): number => {
          if (!nodes) return 0;
          return nodes.reduce((acc, node) => acc + 1 + countTreeNodes(node.children || []), 0);
        };
        const nodeCount = countTreeNodes(block.config?.tree || []);
        const correctCount = block.config?.correctAnswers?.length || 0;
        return `${block.config?.task?.substring(0, 30) || "Задание"} (${nodeCount} категорий, ${correctCount} верных)`;
      default:
        return "";
    }
  };

  const countValidTreeNodes = (nodes: any[]): number => {
    if (!Array.isArray(nodes)) return 0;
    return nodes.reduce((acc, node) => {
      const self = (node?.name && String(node.name).trim()) ? 1 : 0;
      return acc + self + countValidTreeNodes(node?.children || []);
    }, 0);
  };

  const isBlockInvalid = (block: StudyBlock): boolean => {
    const c = block.config || {};
    switch (block.type) {
      case "open_question":
        return !String(c.question ?? "").trim();
      case "choice":
        const opts = (c.options as string[]) || [];
        return !String(c.question ?? "").trim() || opts.filter((o: string) => String(o ?? "").trim()).length < 2;
      case "scale":
        return !String(c.question ?? "").trim();
      case "preference":
        const imgs = (c.images as string[]) || [];
        return !String(c.question ?? "").trim() || imgs.length < 2;
      case "context":
        return !String(c.title ?? "").trim();
      case "five_seconds":
        return !String(c.instruction ?? "").trim() || !c.imageUrl;
      case "first_click":
        return !String(c.instruction ?? "").trim() || !c.imageUrl;
      case "card_sorting":
        const cards = (c.cards as any[]) || [];
        const cats = (c.categories as any[]) || [];
        const validCards = cards.filter((x: any) => String(x?.title ?? "").trim()).length;
        const validCats = cats.filter((x: any) => String(x?.name ?? "").trim()).length;
        if (!String(c.task ?? "").trim()) return true;
        if (validCards < 1) return true;
        if (c.sortingType === "closed" && validCats < 2) return true;
        return false;
      case "tree_testing":
        const tree = c.tree || [];
        const correct = (c.correctAnswers as string[]) || [];
        return !String(c.task ?? "").trim() || countValidTreeNodes(tree) < 1 || correct.length < 1;
      case "agreement":
        return !String(c.title ?? "").trim() || (c.agreementType === "custom" && !c.customPdfUrl);
      case "prototype":
        return !block.prototype_id || !String(block.instructions ?? "").trim();
      case "umux_lite":
        return false;
      default:
        return false;
    }
  };

  const getBlockValidationMessage = (block: StudyBlock): string => {
    switch (block.type) {
      case "open_question":
        return "Текст вопроса не может быть пустым.";
      case "choice":
        return "Пожалуйста, введите вопрос и заполните значения ответов.";
      case "scale":
        return "Пожалуйста, введите вопрос.";
      case "preference":
        return "Пожалуйста, введите вопрос. У всех ответов должна быть картинка.";
      case "context":
        return "Пожалуйста, введите заголовок.";
      case "five_seconds":
        return "Пожалуйста, добавьте картинку и введите текст инструкции.";
      case "first_click":
        return "Пожалуйста, добавьте картинку и введите текст инструкции.";
      case "card_sorting":
        return "Пожалуйста, введите задание и добавьте хотя бы 1 карточку, а также хотя бы 2 категории.";
      case "matrix":
        return "Пожалуйста, введите вопрос, добавьте строки и столбцы.";
      case "agreement":
        return "Пожалуйста, введите заголовок" + (block.config?.agreementType === "custom" ? " и загрузите PDF файл" : ".");
      case "tree_testing":
        return "Пожалуйста, укажите хотя бы один пункт дерева, хотя бы один верный путь и заполните задание.";
      case "prototype":
        return "Пожалуйста, выберите прототип и введите текст задания.";
      default:
        return "Заполните обязательные поля.";
    }
  };

  const isEditable = study?.status === "draft" || study?.status === "stopped";

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
        <h1 className="m-0 text-2xl font-semibold text-foreground">Загрузка...</h1>
      </div>
    );
  }

  if (!study && !loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1 style={{ margin: 0, marginBottom: 8, fontSize: "24px", fontWeight: 600, color: "var(--text-primary, #1f1f1f)" }}>
          Страница не найдена
        </h1>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary, #6b6b6b)" }}>
          Простите, здесь ничего нет
        </p>
      </div>
    );
  }

  const statusConfig = {
    draft: { label: "Черновик", variant: "secondary" as const },
    published: { label: "Опубликован", variant: "success" as const },
    stopped: { label: "Остановлен", variant: "secondary" as const }
  };
  const status = study ? statusConfig[study.status] : statusConfig.draft;

  // Сохранение нового названия (инлайн редактирование)
  const saveTitle = async () => {
    if (!study) return;
    const newTitle = editedTitle.trim();
    if (newTitle && newTitle !== study.title) {
      // 1. Оптимистично обновляем локальный state
      setStudy(prev => prev ? { ...prev, title: newTitle } : prev);
      setIsEditingTitle(false);
      
      // 2. Сохраняем в БД в фоне
      incrementSaving();
      try {
        await supabase
          .from("studies")
          .update({ title: newTitle })
          .eq("id", studyId);
      } finally {
        decrementSaving();
      }
    } else {
      if (study) {
        if (study) {
        setEditedTitle(study.title);
      }
      }
      setIsEditingTitle(false);
    }
  };

  // Получить краткое название блока для сайдбара
  const getBlockShortName = (block: StudyBlock, index: number): string => {
    switch (block.type) {
      case "prototype":
        return block.instructions?.substring(0, 30) || "Figma прототип";
      case "open_question":
        return block.config?.question?.substring(0, 30) || "Открытый вопрос";
      case "umux_lite":
        return "UMUX Lite";
      case "choice":
        return block.config?.question?.substring(0, 30) || "Выбор";
      case "context":
        return block.config?.title?.substring(0, 30) || "Контекст";
      case "scale":
        return block.config?.question?.substring(0, 30) || "Шкала";
      case "preference":
        return block.config?.question?.substring(0, 30) || "Предпочтение";
      case "five_seconds":
        return block.config?.instruction?.substring(0, 30) || "5 секунд";
      case "first_click":
        return block.config?.instruction?.substring(0, 30) || "Тест первого клика";
      case "card_sorting":
        return block.config?.task?.substring(0, 30) || "Сортировка карточек";
      case "matrix":
        return block.config?.question?.substring(0, 30) || "Матрица";
      case "agreement":
        return block.config?.title?.substring(0, 30) || "Соглашение";
      case "tree_testing":
        return block.config?.task?.substring(0, 30) || "Тестирование дерева";
      default:
        return `Блок ${index + 1}`;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-muted">
      {/* Top Header */}
      <div className="border-b border-border bg-muted px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Назад
            </Button>
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <Input
                  ref={titleInputRef}
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") {
                      if (study) {
                        if (study) {
        setEditedTitle(study.title);
      }
                      }
                      setIsEditingTitle(false);
                    }
                  }}
                  className="h-8 text-base font-medium w-64"
                />
              ) : (
                <h1 
                  className="text-[15px] font-medium leading-6 cursor-pointer hover:bg-muted px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    if (study) {
                      if (study) {
        setEditedTitle(study.title);
      }
                      setIsEditingTitle(true);
                    }
                  }}
                >
                  {study?.title || ""}
                </h1>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        study?.status === "published" 
                          ? (hasUnpublishedChanges ? "bg-orange-500 cursor-help" : "bg-green-500")
                          : "bg-gray-400"
                      )}
                    />
                  </TooltipTrigger>
                  {study?.status === "published" && hasUnpublishedChanges && (
                    <TooltipContent>
                      <p>В вашем тесте есть неопубликованные изменения</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              {isSaving && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  Сохранение...
                </span>
              )}
            </div>
          </div>

          {/* Center: Tabs */}
          <div className="flex gap-2">
            {[
              { key: "builder", label: "Тест" },
              { key: "share", label: "Пригласить респондентов" },
              { key: "results", label: "Отчет" }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={cn(
                  "px-4 py-1.5 text-[13px] font-extrabold leading-5 rounded-xl transition-colors",
                  activeTab === tab.key 
                    ? "bg-primary text-white" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        
          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleDuplicate}>
              <Copy className="h-4 w-4" />
            </Button>
            {(study?.status === "draft" || study?.status === "stopped") && (
              <Button size="sm" onClick={handlePublishClick}>
                <Rocket className="h-4 w-4 mr-2" />
                Опубликовать
              </Button>
            )}
            {study?.status === "published" && (
              <Button variant="destructive" size="sm" onClick={handleStopClick}>
                <StopCircle className="h-4 w-4 mr-2" />
                Остановить
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 text-sm flex justify-between items-center">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Block List (only on builder tab when there are blocks) */}
        {activeTab === "builder" && constructorBlocks.length > 0 && (
          <div className="w-80 border-r border-border bg-muted flex flex-col">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {constructorBlocks.map((block, index) => {
              const typeInfo = getBlockTypeInfo(block.type);
              const IconComponent = typeInfo.Icon;
              const fullBlockName = getBlockShortName(block, index);
              const invalid = isBlockInvalid(block);
              const validationMsg = getBlockValidationMessage(block);
              const isSelected = selectedBlockId === block.id;
              
              return (
                <div
                  key={block.id}
                  draggable={isEditable}
                  onDragStart={() => handleDragStart(block.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(block.id)}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-xl transition-all group",
                    isSelected
                      ? "bg-primary text-white shadow-md"
                      : "bg-card border border-border hover:border-primary/30",
                    invalid && !isSelected && "border-destructive/40 bg-destructive/10 hover:border-destructive/60 dark:border-destructive/50 dark:bg-destructive/15 dark:hover:border-destructive/70",
                    draggedBlockId === block.id && "opacity-50 border-dashed border-primary"
                  )}
                >
                  {isEditable && (
                    <GripVertical className={cn(
                      "h-4 w-4 cursor-move",
                      isSelected ? "text-white/80" : "text-muted-foreground",
                      invalid && !isSelected && "dark:text-foreground/80"
                    )} />
                  )}
                  <span className={cn(
                    "text-[15px] font-medium leading-6",
                    isSelected && "text-white",
                    invalid && !isSelected && "dark:text-foreground"
                  )}>{index + 1}.</span>
                  <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
                    isSelected ? "bg-white/20" : "bg-muted",
                    invalid && !isSelected && "dark:bg-foreground/10"
                  )}>
                    <IconComponent size={14} className={cn(
                      isSelected ? "text-white" : "text-muted-foreground",
                      invalid && !isSelected && "dark:text-foreground"
                    )} />
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBlockId(block.id);
                            const blockElement = document.getElementById(`block-${block.id}`);
                            if (blockElement) {
                              blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }}
                        >
                          <div className={cn(
                            "text-[15px] font-medium leading-6 truncate",
                            isSelected && "text-white",
                            invalid && !isSelected && "dark:text-foreground"
                          )}>
                            {fullBlockName}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{fullBlockName}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {isEditable && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {invalid && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn(
                                "inline-flex cursor-help",
                                isSelected ? "text-white/80 hover:text-white" : "text-destructive/80 hover:text-destructive"
                              )}>
                                <CircleAlert className="h-4 w-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[240px]">
                              <p className="text-sm">{validationMsg}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6",
                          isSelected && "text-white hover:text-white/80 hover:bg-white/10"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateBlock(block.id);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6",
                          isSelected 
                            ? "text-white hover:text-white/80 hover:bg-white/10" 
                            : "text-destructive hover:text-destructive"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBlock(block.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Add Block Button with Dropdown */}
            {isEditable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className="flex items-center gap-2 w-full p-2 rounded-xl transition-colors text-primary hover:text-[var(--color-primary-hover)] active:text-[var(--color-primary-active)]"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-[15px] font-medium leading-6">Блок</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {BLOCK_TYPES.map(type => {
                    const IconComponent = type.Icon;
                    return (
                      <DropdownMenuItem 
                        key={type.value}
                        onClick={() => handleQuickAddBlock(type.value)}
                        className="gap-2 cursor-pointer"
                      >
                        <IconComponent size={16} className="text-muted-foreground" />
                        <span>{type.label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-muted">
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto bg-muted">
            {/* Builder Tab */}
            {activeTab === "builder" && constructorBlocks.length === 0 && (
              <div className="flex flex-col items-center pt-12 pb-16 px-6">
                <h2 className="text-xl font-semibold text-center mb-8">Начать с нуля</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                  {START_FROM_SCRATCH_COLUMNS.map((col) => (
                    <div key={col.title} className="space-y-3">
                      <h3 className="text-[15px] font-semibold text-foreground">{col.title}</h3>
                      <div className="space-y-2">
                        {col.blocks.map((b) => {
                          const typeInfo = BLOCK_TYPES.find((t) => t.value === b.type) ?? BLOCK_TYPES[0];
                          const IconComponent = typeInfo.Icon;
                          return (
                            <button
                              key={b.type}
                              type="button"
                              onClick={() => isEditable && handleQuickAddBlock(b.type)}
                              disabled={!isEditable}
                              className="w-full text-left rounded-[12px] border border-border bg-card text-card-foreground p-4 transition-all hover:border-primary/40 hover:shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <IconComponent className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[15px] font-medium text-foreground mb-1">{b.label}</div>
                                  <div className="text-[13px] text-muted-foreground leading-snug">{b.description}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "builder" && constructorBlocks.length > 0 && (
              <div className="max-w-3xl mx-auto pt-6 space-y-4">
                {!isEditable && (
                  <Card className="mb-4 border-warning/30 bg-warning/5">
                    <CardContent className="p-4 text-sm text-warning">
                      Редактирование заблокировано — тест опубликован.
                    </CardContent>
                  </Card>
                )}

                {constructorBlocks.map((block, index) => (
                  <div key={block.id} id={`block-${block.id}`}>
                    <InlineBlockEditor
                      block={block}
                      index={index}
                      isEditable={isEditable}
                      prototypes={prototypes}
                      allBlocks={blocks}
                      onDelete={() => handleDeleteBlock(block.id)}
                      onUpdateBlock={updateBlockInState}
                      onPrototypeDeleted={handlePrototypeDeleted}
                      onDragStart={() => handleDragStart(block.id)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(block.id)}
                      isDragging={draggedBlockId === block.id}
                      onSetError={setError}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === "results" && studyId && (
              <StudyResultsTab
                studyId={studyId}
                blocks={blocks}
                studyStatus={study?.status}
                onBlockDeleted={study?.status === "draft" || study?.status === "stopped" ? performDeleteBlock : undefined}
              />
            )}
            {activeTab === "share" && (
              <div className="max-w-3xl mx-auto pt-6">
                <StudyShareTab studyId={studyId || ""} studyStatus={study?.status || "draft"} shareToken={study?.share_token || ""} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Publish Confirmation */}
      <AlertDialog open={showPublishDialog} onOpenChange={(open) => !open && setShowPublishDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Опубликовать тест?</AlertDialogTitle>
            <AlertDialogDescription>
              После публикации редактирование блоков будет заблокировано.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowPublishDialog(false)}>Нет, не публиковать</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handlePublishConfirm(); }}>
              Да, опубликовать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stop Confirmation */}
      <AlertDialog open={showStopDialog} onOpenChange={(open) => !open && setShowStopDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Остановить тестирование?</AlertDialogTitle>
            <AlertDialogDescription>
              Ссылка перестанет работать.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowStopDialog(false)}>Нет, не останавливать</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleStopConfirm(); }}
            >
              Да, остановить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Confirmation */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={(open) => !open && setShowDuplicateDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Продублировать тест "{study?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет создана копия теста со всеми блоками, настройками и логикой переходов.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDuplicateDialog(false)}>Нет, копия не нужна</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDuplicateConfirm(); }}
            >
              Да, создать копию
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Block Confirmation */}
      <AlertDialog open={!!blockIdToDelete} onOpenChange={(open) => !open && setBlockIdToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить блок?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить этот блок? Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBlockIdToDelete(null)}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (blockIdToDelete) {
                  performDeleteBlock(blockIdToDelete);
                  setBlockIdToDelete(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Block Modal — не открывать при опубликованном тесте; все поля disabled при !isEditable */}
      <Dialog
        open={showAddBlockModal}
        onOpenChange={(open) => {
          if (open && !isEditable) return;
          setShowAddBlockModal(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBlockId ? "Редактировать блок" : "Добавить блок"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Тип блока */}
            <div className="space-y-3">
              <Label>Тип блока</Label>
              <div className="grid grid-cols-2 gap-2">
                {BLOCK_TYPES.map(type => {
                  const isSelected = newBlockType === type.value;
                  const IconComponent = type.Icon;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      disabled={!isEditable}
                      onClick={() => { setNewBlockType(type.value); resetBlockForm(); }}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                        isSelected 
                          ? "border-primary bg-primary/5 text-primary" 
                          : "border-border hover:border-primary/50",
                        !isEditable && "opacity-60 pointer-events-none"
                      )}
                    >
                      <IconComponent size={18} className={isSelected ? "text-primary" : "text-muted-foreground"} />
                      <span className={cn("text-sm", isSelected && "font-medium")}>{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-6">
              {/* Figma прототип */}
              {newBlockType === "prototype" && (
                <>
                  <FormField label="Figma прототип:" className="mb-4">
                    {prototypes.length === 0 ? (
                      <AlertBox variant="warning">
                        Нет доступных прототипов. Создайте через Figma плагин.
                      </AlertBox>
                    ) : (
                      <PrototypeSelect
                        value={selectedPrototypeId}
                        onChange={setSelectedPrototypeId}
                        prototypes={prototypes}
                        onPrototypeDeleted={(id) => {
                          handlePrototypeDeleted(id);
                          if (id === selectedPrototypeId) setSelectedPrototypeId("");
                        }}
                        disabled={!isEditable}
                      />
                    )}
                  </FormField>
                  <FormField label="Инструкции" optional className="mb-4">
                    <FormTextarea value={newBlockInstructions} onChange={e => setNewBlockInstructions(e.target.value)} placeholder="Введите инструкции" rows={3} disabled={!isEditable} />
                  </FormField>
                  <div className="mb-2 p-3 bg-muted rounded-lg space-y-3">
                    <div className="text-sm font-medium">Дополнительные настройки</div>
                    <ToggleSwitch
                      label="Включить отслеживание движений глаз (экспериментально)"
                      checked={newBlockEyeTrackingEnabled}
                      onChange={setNewBlockEyeTrackingEnabled}
                      disabled={!isEditable}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <ToggleSwitch
                        label="Запись экрана"
                        checked={prototypeRecordScreen}
                        onChange={setPrototypeRecordScreen}
                        disabled={!isEditable}
                      />
                      <ToggleSwitch
                        label="Запись камеры"
                        checked={prototypeRecordCamera}
                        onChange={setPrototypeRecordCamera}
                        disabled={!isEditable}
                      />
                      <ToggleSwitch
                        label="Запись голоса"
                        checked={prototypeRecordAudio}
                        onChange={setPrototypeRecordAudio}
                        disabled={!isEditable}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Эти настройки включают запросы разрешений у респондента перед началом задания и запись выбранных потоков во время работы с прототипом.
                    </p>
                  </div>
                </>
              )}

              {/* Открытый вопрос */}
              {newBlockType === "open_question" && (
                <>
                  <ImageUploader
                    label="Изображение (опционально)"
                    image={openQuestionImage}
                    onImageChange={setOpenQuestionImage}
                    disabled={!isEditable}
                  />
                  <FormField label="Текст вопроса:" className="mb-4">
                    <FormTextarea value={openQuestionText} onChange={e => setOpenQuestionText(e.target.value)} placeholder="Введите текст вопроса" rows={3} disabled={!isEditable} />
                  </FormField>
                  <ToggleSwitch label="Необязательный вопрос" checked={openQuestionOptional} onChange={setOpenQuestionOptional} disabled={!isEditable} />
                </>
              )}

              {/* UMUX Lite */}
              {newBlockType === "umux_lite" && (
                <AlertBox variant="warning" className="p-4">
                  <div className="text-sm font-semibold mb-2">📋 UMUX Lite опрос</div>
                  <p className="m-0 text-sm text-muted-foreground">Стандартный опрос из 2 вопросов по шкале 1-7.</p>
                </AlertBox>
              )}

              {/* Выбор */}
              {newBlockType === "choice" && (
                <>
                  <ImageUploader label="Изображение (опционально)" image={choiceImage} onImageChange={setChoiceImage} disabled={!isEditable} />
                  <FormField label="Вопрос:" className="mb-4">
                    <Input type="text" value={choiceQuestion} onChange={e => setChoiceQuestion(e.target.value)} placeholder="Введите текст вопроса" disabled={!isEditable} />
                  </FormField>
                  <FormField label="Описание" optional className="mb-4">
                    <FormTextarea value={choiceDescription} onChange={e => setChoiceDescription(e.target.value)} placeholder="Введите дополнительные детали" rows={2} disabled={!isEditable} />
                  </FormField>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Варианты ответа:</label>
                    {choiceOptions.map((opt, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <span className="px-3 py-2 bg-muted rounded-md text-sm font-medium">{String.fromCharCode(65 + i)}</span>
                        <Input type="text" value={opt} onChange={e => { const newOpts = [...choiceOptions]; newOpts[i] = e.target.value; setChoiceOptions(newOpts); }} placeholder="Введите вариант ответа" className="flex-1" disabled={!isEditable} />
                        {choiceOptions.length > 2 && (
                          <Button variant="destructive" size="sm" onClick={() => setChoiceOptions(choiceOptions.filter((_, j) => j !== i))} className="h-8 px-3" disabled={!isEditable}>
                            ✕
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setChoiceOptions([...choiceOptions, ""])} className="mt-2" disabled={!isEditable}>
                      + Вариант ответа
                    </Button>
                  </div>
                  <div className="mb-2 p-3 bg-muted rounded-lg">
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Настройки</div>
                    <ToggleSwitch label="Разрешить выбор нескольких вариантов" checked={choiceAllowMultiple} onChange={setChoiceAllowMultiple} disabled={!isEditable} />
                    {choiceAllowMultiple && (
                      <div style={{ marginLeft: 24, marginTop: 8 }}>
                        <ToggleSwitch label="Ограничить количество вариантов" checked={choiceLimitSelections} onChange={setChoiceLimitSelections} disabled={!isEditable} />
                        {choiceLimitSelections && (
                          <div style={{ marginTop: 8, marginLeft: 24 }}>
                            <Input type="number" min={1} max={choiceOptions.length} value={choiceMaxSelections} onChange={e => setChoiceMaxSelections(parseInt(e.target.value) || 2)} className="w-[60px] h-8 px-2 text-sm" disabled={!isEditable} />
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <ToggleSwitch label="Перемешать варианты ответа" checked={choiceShuffle} onChange={setChoiceShuffle} disabled={!isEditable} />
                      <p className="text-xs text-muted-foreground mt-1 ml-0">Включите эту опцию, чтобы перемешать ответы. Вы можете закрепить позиции конкретных ответов.</p>
                    </div>
                    <ToggleSwitch label="Разрешить респондентам ввести свой ответ (опция «Другое»)" checked={choiceAllowOther} onChange={setChoiceAllowOther} disabled={!isEditable} />
                    <div>
                      <ToggleSwitch label="Добавить опцию «Ничего из вышеперечисленного»" checked={choiceAllowNone} onChange={setChoiceAllowNone} disabled={!isEditable} />
                      <p className="text-xs text-muted-foreground mt-1 ml-0">Эта опция отменяет все остальные опции и появляется в конце списка. Вы можете изменить текст этой опции.</p>
                    </div>
                    {choiceAllowNone && (
                      <div style={{ marginLeft: 24, marginTop: 8 }}>
                        <Input type="text" value={choiceNoneText} onChange={e => setChoiceNoneText(e.target.value)} placeholder="Введите название опции" className="h-8 text-xs" disabled={!isEditable} />
                      </div>
                    )}
                    <ToggleSwitch label="Необязательный вопрос" checked={choiceOptional} onChange={setChoiceOptional} disabled={!isEditable} />
                  </div>
                </>
              )}

              {/* Контекст */}
              {newBlockType === "context" && (
                <>
                  <FormField label="Заголовок:" className="mb-4">
                    <Input type="text" value={contextTitle} onChange={e => setContextTitle(e.target.value)} placeholder="Введите заголовок" disabled={!isEditable} />
                  </FormField>
                  <FormField label="Описание" optional className="mb-4">
                    <FormTextarea value={contextDescription} onChange={e => setContextDescription(e.target.value)} placeholder="Введите описание" rows={4} disabled={!isEditable} />
                  </FormField>
                  <AlertBox variant="info" className="p-3 text-sm">
                    ℹ️ Блок «Контекст» отображает текст для ознакомления. Не учитывается в аналитике.
                  </AlertBox>
                </>
              )}

              {/* Шкала */}
              {newBlockType === "scale" && (
                <>
                  <ImageUploader label="Изображение (опционально)" image={scaleImage} onImageChange={setScaleImage} disabled={!isEditable} />
                  <FormField label="Вопрос:" className="mb-4">
                    <Input type="text" value={scaleQuestion} onChange={e => setScaleQuestion(e.target.value)} placeholder="Введите текст вопроса" disabled={!isEditable} />
                  </FormField>
                  <FormField label="Описание" optional className="mb-4">
                    <FormTextarea value={scaleDescription} onChange={e => setScaleDescription(e.target.value)} placeholder="Введите дополнительные детали" rows={2} disabled={!isEditable} />
                  </FormField>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Тип шкалы:</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[{ v: "numeric", l: "Числовой" }, { v: "emoji", l: "Эмодзи" }, { v: "stars", l: "Звезды" }].map(t => (
                        <button key={t.v} type="button" disabled={!isEditable} onClick={() => setScaleType(t.v as any)} className={cn("flex-1 p-2.5 rounded-lg text-sm border", scaleType === t.v ? "border-warning bg-warning-subtle font-semibold" : "border-input bg-background font-normal", isEditable && "cursor-pointer", !isEditable && "opacity-60 pointer-events-none")}>
                          {t.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {scaleType === "numeric" && (
                    <>
                      <div className="flex gap-4 mb-4">
                        <FormField label="От:" className="flex-1">
                          <FormSelect value={scaleMin} onChange={e => setScaleMin(parseInt(e.target.value))} disabled={!isEditable}>
                            {[0, 1].map(v => <option key={v} value={v}>{v}</option>)}
                          </FormSelect>
                        </FormField>
                        <FormField label="До:" className="flex-1">
                          <FormSelect value={scaleMax} onChange={e => setScaleMax(parseInt(e.target.value))} disabled={!isEditable}>
                            {[3, 4, 5, 6, 7, 8, 9, 10].map(v => <option key={v} value={v}>{v}</option>)}
                          </FormSelect>
                        </FormField>
                      </div>
                      <FormField label="Подпись в начале шкалы:" className="mb-4">
                        <Input type="text" value={scaleMinLabel} onChange={e => setScaleMinLabel(e.target.value)} placeholder="Например: Совсем не согласен" disabled={!isEditable} />
                      </FormField>
                      <FormField label="Подпись в конце шкалы:" className="mb-4">
                        <Input type="text" value={scaleMaxLabel} onChange={e => setScaleMaxLabel(e.target.value)} placeholder="Например: Полностью согласен" disabled={!isEditable} />
                      </FormField>
                    </>
                  )}
                  {scaleType === "emoji" && (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Количество эмодзи:</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          {[3, 5].map(n => (
                            <button key={n} type="button" disabled={!isEditable} onClick={() => setScaleEmojiCount(n as 3 | 5)} className={cn("flex-1 p-2.5 rounded-lg text-sm border", scaleEmojiCount === n ? "border-warning bg-warning-subtle" : "border-input bg-background", !isEditable && "opacity-60 pointer-events-none")}>
                              {n === 3 ? "😞 😐 😊" : "😠 😞 😐 😊 😄"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <FormField label="Подпись в начале шкалы:" className="mb-4">
                        <Input type="text" value={scaleMinLabel} onChange={e => setScaleMinLabel(e.target.value)} placeholder="Например: Совсем не согласен" disabled={!isEditable} />
                      </FormField>
                      <FormField label="Подпись в конце шкалы:" className="mb-4">
                        <Input type="text" value={scaleMaxLabel} onChange={e => setScaleMaxLabel(e.target.value)} placeholder="Например: Полностью согласен" disabled={!isEditable} />
                      </FormField>
                    </>
                  )}
                  {scaleType === "stars" && (
                    <>
                      <div className="p-3 bg-muted rounded-lg mb-4 text-center">
                        <span className="text-2xl">⭐⭐⭐⭐⭐</span>
                        <div className="text-sm text-muted-foreground mt-2">От 1 до 5 звезд</div>
                      </div>
                      <FormField label="Подпись в начале шкалы:" className="mb-4">
                        <Input type="text" value={scaleMinLabel} onChange={e => setScaleMinLabel(e.target.value)} placeholder="Например: Совсем не согласен" disabled={!isEditable} />
                      </FormField>
                      <FormField label="Подпись в конце шкалы:" className="mb-4">
                        <Input type="text" value={scaleMaxLabel} onChange={e => setScaleMaxLabel(e.target.value)} placeholder="Например: Полностью согласен" disabled={!isEditable} />
                      </FormField>
                    </>
                  )}
                  <ToggleSwitch label="Необязательный вопрос" checked={scaleOptional} onChange={setScaleOptional} disabled={!isEditable} />
                </>
              )}

              {/* Предпочтение */}
              {newBlockType === "preference" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Вопрос:</label>
                    <FormField label="Вопрос:" className="mb-4">
                      <Input type="text" value={preferenceQuestion} onChange={e => setPreferenceQuestion(e.target.value)} placeholder="Введите текст задания или вопроса" disabled={!isEditable} />
                    </FormField>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Тип сравнения:</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" disabled={!isEditable} onClick={() => setPreferenceComparisonType("all")} className={cn("flex-1 p-3 rounded-lg text-left border", preferenceComparisonType === "all" ? "border-primary bg-primary/10" : "border-input bg-background", !isEditable && "opacity-60 pointer-events-none")}>
                        <div className="font-medium mb-1">Выбор из всех</div>
                        <div className="text-xs text-muted-foreground">Показать все изображения одновременно</div>
                      </button>
                      <button type="button" disabled={!isEditable} onClick={() => setPreferenceComparisonType("pairwise")} className={cn("flex-1 p-3 rounded-lg text-left border", preferenceComparisonType === "pairwise" ? "border-primary bg-primary/10" : "border-input bg-background", !isEditable && "opacity-60 pointer-events-none")}>
                        <div className="font-medium mb-1">Попарное сравнение</div>
                        <div className="text-xs text-muted-foreground">Показывать только два изображения за раз</div>
                      </button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Изображения:</label>
                    {preferenceImages.map((img, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                        <span className="px-3 py-2 bg-muted rounded-md text-sm font-medium min-w-[32px] text-center">{String.fromCharCode(65 + i)}</span>
                        <div style={{ flex: 1 }}>
                          {img.url || img.file ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <img src={img.file ? URL.createObjectURL(img.file) : img.url} alt={`Вариант ${String.fromCharCode(65 + i)}`} className="w-[60px] h-[60px] object-cover rounded-md border border-input" />
                              <span className="text-sm text-muted-foreground flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{img.file?.name || "Загружено"}</span>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => { const newImgs = [...preferenceImages]; newImgs[i] = { file: null, url: "", uploading: false }; setPreferenceImages(newImgs); }}
                                className="h-7 px-2.5 text-xs"
                                disabled={!isEditable}
                              >
                                Удалить
                              </Button>
                            </div>
                          ) : (
                            <label className={cn("flex items-center justify-center p-4 border-2 border-dashed border-input rounded-lg bg-muted", isEditable ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
                              <span className="text-sm text-muted-foreground">📷 Выбрать файл</span>
                              <input type="file" accept="image/*" style={{ display: "none" }} disabled={!isEditable} onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const newImgs = [...preferenceImages];
                                  newImgs[i] = { file, url: "", uploading: false };
                                  setPreferenceImages(newImgs);
                                }
                              }} />
                            </label>
                          )}
                        </div>
                        {preferenceImages.length > 2 && (
                          <Button variant="destructive" size="sm" onClick={() => setPreferenceImages(preferenceImages.filter((_, j) => j !== i))} className="h-8 px-3" disabled={!isEditable}>
                            ✕
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setPreferenceImages([...preferenceImages, { file: null, url: "", uploading: false }])} className="mt-2" disabled={!isEditable}>
                      + Добавить изображение
                    </Button>
                  </div>
                  {preferenceComparisonType === "all" && (
                    <ToggleSwitch label="Перемешивать варианты ответа" checked={preferenceShuffle} onChange={setPreferenceShuffle} disabled={!isEditable} />
                  )}
                </>
              )}

              {/* 5 секунд */}
              {newBlockType === "five_seconds" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Инструкция:</label>
                    <FormField label="Инструкция:" className="mb-4">
                      <FormTextarea value={fiveSecondsInstruction} onChange={e => setFiveSecondsInstruction(e.target.value)} placeholder="Введите инструкцию для респондента" rows={2} disabled={!isEditable} />
                    </FormField>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Изображение:</label>
                    {fiveSecondsImage.url || fiveSecondsImage.file ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img src={fiveSecondsImage.file ? URL.createObjectURL(fiveSecondsImage.file) : fiveSecondsImage.url} alt="Preview" className="w-[120px] h-20 object-cover rounded-lg border border-input" />
                        <div style={{ flex: 1 }}>
                          <div className="text-sm text-muted-foreground mb-2">{fiveSecondsImage.file?.name || "Загружено"}</div>
                          <Button variant="destructive" size="sm" onClick={() => setFiveSecondsImage({ file: null, url: "", uploading: false })} className="h-7 px-3 text-xs" disabled={!isEditable}>
                            Удалить
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <label className={cn("flex flex-col items-center justify-center p-8 border-2 border-dashed border-input rounded-lg bg-muted", isEditable ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
                        <span className="text-3xl mb-2">📷</span>
                        <span className="text-sm text-muted-foreground">Выберите изображение</span>
                        <span className="text-xs text-muted-foreground/70 mt-1">JPEG, PNG, GIF, WebP (до 5MB)</span>
                        <input type="file" accept="image/*" style={{ display: "none" }} disabled={!isEditable} onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setFiveSecondsImage({ file, url: "", uploading: false });
                          }
                        }} />
                      </label>
                    )}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Время показа: {fiveSecondsDuration} сек</label>
                    <input type="range" min={5} max={60} value={fiveSecondsDuration} onChange={e => setFiveSecondsDuration(parseInt(e.target.value))} style={{ width: "100%" }} disabled={!isEditable} />
                    <div className="flex justify-between text-xs text-muted-foreground/70">
                      <span>5 сек</span>
                      <span>60 сек</span>
                    </div>
                  </div>
                </>
              )}

              {/* Тест первого клика */}
              {newBlockType === "first_click" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Инструкция:</label>
                    <FormField label="Задание:" className="mb-4">
                      <FormTextarea value={firstClickInstruction} onChange={e => setFirstClickInstruction(e.target.value)} placeholder="Введите задание для респондента" rows={2} disabled={!isEditable} />
                    </FormField>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Изображение:</label>
                    {firstClickImage.url || firstClickImage.file ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img src={firstClickImage.file ? URL.createObjectURL(firstClickImage.file) : firstClickImage.url} alt="Preview" className="w-[120px] h-20 object-cover rounded-lg border border-input" />
                        <div style={{ flex: 1 }}>
                          <div className="text-sm text-muted-foreground mb-2">{firstClickImage.file?.name || "Загружено"}</div>
                          <Button variant="destructive" size="sm" onClick={() => setFirstClickImage({ file: null, url: "", uploading: false })} className="h-7 px-3 text-xs" disabled={!isEditable}>
                            Удалить
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <label className={cn("flex flex-col items-center justify-center p-8 border-2 border-dashed border-input rounded-lg bg-muted", isEditable ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
                        <span className="text-3xl mb-2">📷</span>
                        <span className="text-sm text-muted-foreground">Выберите изображение</span>
                        <span className="text-xs text-muted-foreground/70 mt-1">JPEG, PNG, GIF, WebP (до 5MB)</span>
                        <input type="file" accept="image/*" style={{ display: "none" }} disabled={!isEditable} onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setFirstClickImage({ file, url: "", uploading: false });
                          }
                        }} />
                      </label>
                    )}
                  </div>
                </>
              )}

              {/* Сортировка карточек */}
              {newBlockType === "card_sorting" && (
                <>
                  <FormField label="Задание:" className="mb-4">
                    <FormTextarea 
                      value={cardSortingTask} 
                      onChange={e => setCardSortingTask(e.target.value)} 
                      placeholder="Например: Представьте, что вы совершаете покупки в интернет-магазине и вам нужно найти какую-то информацию. В этом задании приведён список разделов сайта. Ваша задача — разбить их по категориям так, как вам кажется логичным." 
                      rows={3} 
                      disabled={!isEditable}
                    />
                  </FormField>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Тип сортировки</label>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button
                        type="button"
                        disabled={!isEditable}
                        onClick={() => setCardSortingType("closed")}
                        className={cn(
                          "flex-1 p-4 rounded-lg text-left border",
                          cardSortingType === "closed" ? "border-2 border-primary bg-info-subtle" : "border border-input bg-background",
                          !isEditable && "opacity-60 pointer-events-none"
                        )}
                      >
                        <div className="font-semibold mb-1">Закрытая сортировка</div>
                        <div className="text-sm text-muted-foreground">Респонденты группируют карточки в заранее определенные категории.</div>
                      </button>
                      <button
                        type="button"
                        disabled={!isEditable}
                        onClick={() => setCardSortingType("open")}
                        className={cn(
                          "flex-1 p-4 rounded-lg text-left border",
                          cardSortingType === "open" ? "border-2 border-primary bg-info-subtle" : "border border-input bg-background",
                          !isEditable && "opacity-60 pointer-events-none"
                        )}
                      >
                        <div className="font-semibold mb-1">Открытая сортировка</div>
                        <div className="text-sm text-muted-foreground">Респонденты группируют карточки в категории, которые они создают сами; вы можете также добавить заранее определенные категории.</div>
                      </button>
                    </div>
                  </div>

                  {/* Карточки */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Карточки</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 14 }}>{cardSortingCards.filter(c => c.title.trim()).length} карточек</span>
                      <Button variant="outline" size="sm" onClick={() => setShowCardSortingCardsModal(true)} disabled={!isEditable}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </Button>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <ToggleSwitch label="Перемешивать карточки" checked={cardSortingShuffleCards} onChange={setCardSortingShuffleCards} disabled={!isEditable} />
                      <ToggleSwitch label="Разрешить не сортировать все карточки" checked={cardSortingAllowPartialSort} onChange={setCardSortingAllowPartialSort} disabled={!isEditable} />
                      {cardSortingAllowPartialSort && (
                        <div className="ml-14 text-sm text-muted-foreground -mt-1 mb-2">
                          Если эта опция включена, респондент сможет завершить сортировку, даже если не все карточки отсортированы.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Категории */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Категории</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 14 }}>{cardSortingCategories.filter(c => c.name.trim()).length} категорий</span>
                      <Button variant="outline" size="sm" onClick={() => setShowCardSortingCategoriesModal(true)} disabled={!isEditable}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </Button>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <ToggleSwitch label="Перемешивать категории" checked={cardSortingShuffleCategories} onChange={setCardSortingShuffleCategories} disabled={!isEditable} />
                    </div>
                  </div>

                  {/* Превью */}
                  <div className="p-4 bg-success-subtle rounded-lg">
                    <div className="font-semibold mb-3">Сортировка карточек</div>
                    <div className="bg-success/20 rounded-lg p-4 mb-3">
                      <div style={{ display: "flex", gap: 16 }}>
                        <div className="flex flex-col gap-2">
                          {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="w-10 h-6 bg-foreground rounded-md" />
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 12, flex: 1 }}>
                          {[1, 2, 3].map(i => (
                            <div key={i} className="w-20 h-[100px] border-2 border-dashed border-muted-foreground rounded-lg" />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      Отсортируйте каждую карточку в категорию, которая вам кажется наиболее подходящей. Перетащите карточки в правую часть страницы, чтобы создать категории.
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Просто делайте то, что кажется вам наиболее подходящим, нет правильных или неправильных ответов.
                    </div>
                  </div>
                </>
              )}

              {/* Матрица */}
              {newBlockType === "matrix" && (
                <>
                  <ImageUploader label="Изображение (опционально)" image={matrixImage} onImageChange={setMatrixImage} disabled={!isEditable} />
                  <FormField label="Вопрос:" className="mb-4">
                    <Input 
                      type="text" 
                      value={matrixQuestion} 
                      onChange={e => setMatrixQuestion(e.target.value)}
                      disabled={!isEditable} 
                      placeholder="Введите текст вопроса" 
                    />
                  </FormField>
                  <FormField label="Описание" optional className="mb-4">
                    <FormTextarea 
                      value={matrixDescription} 
                      onChange={e => setMatrixDescription(e.target.value)} 
                      placeholder="Введите описание" 
                      rows={2} 
                      disabled={!isEditable}
                    />
                  </FormField>

                  {/* Строки */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Строки</label>
                    <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: 12 }}>
                      {matrixRows.map((row, i) => (
                        <div key={row.id} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                          <input 
                            type="text" 
                            value={row.title} 
                            onChange={e => {
                              const newRows = [...matrixRows];
                              newRows[i] = { ...newRows[i], title: e.target.value };
                              setMatrixRows(newRows);
                            }} 
                            placeholder="Название строки" 
                            className="flex-1 px-3 py-2.5 border border-input rounded-md text-sm bg-muted" 
                            disabled={!isEditable}
                          />
                          <button 
                            type="button"
                            disabled={!isEditable || matrixRows.length <= 1}
                            onClick={() => {
                              if (matrixRows.length > 1) {
                                setMatrixRows(matrixRows.filter((_, j) => j !== i));
                              }
                            }} 
                            style={{ padding: 8, background: "transparent", border: "none", cursor: matrixRows.length > 1 && isEditable ? "pointer" : "not-allowed", opacity: matrixRows.length > 1 && isEditable ? 1 : 0.3 }}
                          >
                            <Trash2 size={18} className="text-muted-foreground/70" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" onClick={() => setMatrixRows([...matrixRows, { id: crypto.randomUUID(), title: "" }])} disabled={!isEditable}>
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить строку
                    </Button>
                    <div className="p-3 bg-muted rounded-lg mt-3">
                      <ToggleSwitch label="Перемешивать строки" checked={matrixShuffleRows} onChange={setMatrixShuffleRows} disabled={!isEditable} />
                    </div>
                  </div>

                  {/* Столбцы */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Столбцы</label>
                    <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: 12 }}>
                      {matrixColumns.map((column, i) => (
                        <div key={column.id} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                          <input 
                            type="text" 
                            value={column.title} 
                            onChange={e => {
                              const newColumns = [...matrixColumns];
                              newColumns[i] = { ...newColumns[i], title: e.target.value };
                              setMatrixColumns(newColumns);
                            }} 
                            placeholder="Название столбца" 
                            className="flex-1 px-3 py-2.5 border border-input rounded-md text-sm bg-muted" 
                            disabled={!isEditable}
                          />
                          <button 
                            type="button"
                            disabled={!isEditable || matrixColumns.length <= 1}
                            onClick={() => {
                              if (matrixColumns.length > 1) {
                                setMatrixColumns(matrixColumns.filter((_, j) => j !== i));
                              }
                            }} 
                            style={{ padding: 8, background: "transparent", border: "none", cursor: matrixColumns.length > 1 && isEditable ? "pointer" : "not-allowed", opacity: matrixColumns.length > 1 && isEditable ? 1 : 0.3 }}
                          >
                            <Trash2 size={18} className="text-muted-foreground/70" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" onClick={() => setMatrixColumns([...matrixColumns, { id: crypto.randomUUID(), title: "" }])} disabled={!isEditable}>
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить столбец
                    </Button>
                    <div className="p-3 bg-muted rounded-lg mt-3">
                      <ToggleSwitch label="Перемешивать колонки" checked={matrixShuffleColumns} onChange={setMatrixShuffleColumns} disabled={!isEditable} />
                    </div>
                  </div>

                  {/* Настройки */}
                  <div style={{ marginBottom: 16 }}>
                    <div className="p-3 bg-muted rounded-lg">
                      <ToggleSwitch label="Разрешить выбор нескольких вариантов" checked={matrixAllowMultiple} onChange={setMatrixAllowMultiple} disabled={!isEditable} />
                      {matrixAllowMultiple && (
                        <div className="ml-14 text-sm text-muted-foreground -mt-1 mb-2">
                          Если вы хотите разрешить респондентам выбирать несколько вариантов в строке, включите эту настройку.
                        </div>
                      )}
                      <ToggleSwitch label="Необязательный вопрос" checked={matrixOptional} onChange={setMatrixOptional} disabled={!isEditable} />
                    </div>
                  </div>
                </>
              )}

              {/* Соглашение */}
              {newBlockType === "agreement" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Заголовок:</label>
                    <input 
                      type="text" 
                      value={agreementTitle} 
                      onChange={e => setAgreementTitle(e.target.value)} 
                      placeholder="Пожалуйста, ознакомьтесь и примите условия участия в исследовании" 
                      className="w-full px-3 py-2 border border-input rounded-md text-sm" 
                      disabled={!isEditable}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 12, fontSize: 14, fontWeight: 500 }}>Тип соглашения:</label>
                    <div style={{ display: "flex", gap: 12 }}>
                      <label className={cn("flex-1 p-4 rounded-lg border", agreementType === "standard" ? "border-primary bg-info-subtle" : "border-input bg-background", isEditable ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <input 
                            type="radio" 
                            name="agreementType" 
                            value="standard" 
                            checked={agreementType === "standard"} 
                            onChange={() => setAgreementType("standard")}
                            style={{ margin: 0 }}
                            disabled={!isEditable}
                          />
                          <span style={{ fontWeight: 500, fontSize: 14 }}>Сбор персональных данных</span>
                        </div>
                        <div className="text-sm text-muted-foreground ml-6">
                          Стандартное соглашение для сбора и обработки персональных данных
                        </div>
                      </label>
                      <label className={cn("flex-1 p-4 rounded-lg border", agreementType === "custom" ? "border-primary bg-info-subtle" : "border-input bg-background", isEditable ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <input 
                            type="radio" 
                            name="agreementType" 
                            value="custom" 
                            checked={agreementType === "custom"} 
                            onChange={() => setAgreementType("custom")}
                            style={{ margin: 0 }}
                            disabled={!isEditable}
                          />
                          <span style={{ fontWeight: 500, fontSize: 14 }}>Загрузить свое соглашение</span>
                        </div>
                        <div className="text-sm text-muted-foreground ml-6">
                          Загрузите свой собственный файл .pdf с текстом соглашения
                        </div>
                      </label>
                    </div>
                  </div>

                  {agreementType === "custom" && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Файл соглашения (.pdf):</label>
                      {agreementPdfFile.file || agreementPdfFile.url ? (
                        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-input">
                          <FileText size={24} className="text-muted-foreground" />
                          <div style={{ flex: 1 }}>
                            <div className="text-sm text-muted-foreground mb-1">
                              {agreementPdfFile.file?.name || "Загружено"}
                            </div>
                            {agreementPdfFile.url && (
                              <a 
                                href={agreementPdfFile.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-primary no-underline"
                              >
                                Открыть PDF
                              </a>
                            )}
                          </div>
                          <button 
                            type="button"
                            onClick={() => setAgreementPdfFile({ file: null, url: "" })} 
                            disabled={!isEditable}
                            className="h-7 px-2.5 text-xs rounded bg-destructive text-destructive-foreground"
                          >
                            Удалить
                          </button>
                        </div>
                      ) : (
                        <label className={cn("flex items-center justify-center p-6 border-2 border-dashed border-input rounded-lg bg-muted transition-all", isEditable ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
                          <input 
                            type="file" 
                            accept=".pdf" 
                            className="hidden" 
                            disabled={!isEditable}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file && file.type === "application/pdf") {
                                setAgreementPdfFile({ file, url: "" });
                              } else {
                                setError("Пожалуйста, выберите файл в формате PDF");
                              }
                            }}
                          />
                          <div className="text-center">
                            <FileText size={32} className="text-muted-foreground/70 mb-2 mx-auto" />
                            <div className="text-sm text-muted-foreground">Нажмите для загрузки PDF</div>
                            <div className="text-xs text-muted-foreground/70 mt-1">Только файлы .pdf</div>
                          </div>
                        </label>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Тестирование дерева */}
              {newBlockType === "tree_testing" && (
                <TreeTestingEditor
                  task={treeTestingTask}
                  setTask={setTreeTestingTask}
                  description={treeTestingDescription}
                  setDescription={setTreeTestingDescription}
                  tree={treeTestingTree}
                  setTree={setTreeTestingTree}
                  correctAnswers={treeTestingCorrectAnswers}
                  setCorrectAnswers={setTreeTestingCorrectAnswers}
                  allowSkip={treeTestingAllowSkip}
                  setAllowSkip={setTreeTestingAllowSkip}
                  expandedNodes={expandedTreeNodes}
                  setExpandedNodes={setExpandedTreeNodes}
                  disabled={!isEditable}
                />
              )}
            </div>

          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddBlockModal(false); resetAllBlockForms(); }}>
              Отмена
            </Button>
            <Button onClick={handleAddBlock} disabled={!isEditable}>
              {editingBlockId ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cards Modal for Card Sorting */}
      <Dialog open={showCardSortingCardsModal} onOpenChange={setShowCardSortingCardsModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Карточки ({cardSortingCards.filter(c => c.title.trim()).length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <ToggleSwitch 
                label="Добавить изображения" 
                checked={cardSortingShowImages} 
                onChange={setCardSortingShowImages} 
              />
              <ToggleSwitch 
                label="Добавить описания" 
                checked={cardSortingShowDescriptions} 
                onChange={setCardSortingShowDescriptions} 
              />
            </div>
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {cardSortingCards.map((card, i) => (
                <div key={card.id} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                  {cardSortingShowImages && (
                    <div style={{ width: 64, flexShrink: 0 }}>
                      {card.imageUrl || card.imageFile ? (
                        <div style={{ position: "relative" }}>
                          <img 
                            src={card.imageFile ? URL.createObjectURL(card.imageFile) : card.imageUrl} 
                            alt="" 
                            className="w-16 h-16 object-cover rounded-lg border border-input" 
                          />
                          <button 
                            onClick={() => {
                              const newCards = [...cardSortingCards];
                              newCards[i] = { ...newCards[i], imageUrl: "", imageFile: null };
                              setCardSortingCards(newCards);
                            }}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground border-none text-xs cursor-pointer flex items-center justify-center"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <label className="w-16 h-16 border-2 border-dashed border-input rounded-lg flex items-center justify-center cursor-pointer bg-muted">
                          <ImageIcon size={20} className="text-muted-foreground/70" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            style={{ display: "none" }} 
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const newCards = [...cardSortingCards];
                                newCards[i] = { ...newCards[i], imageFile: file };
                                setCardSortingCards(newCards);
                              }
                            }} 
                          />
                        </label>
                      )}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <input 
                      type="text" 
                      value={card.title} 
                      onChange={e => {
                        const newCards = [...cardSortingCards];
                        newCards[i] = { ...newCards[i], title: e.target.value };
                        setCardSortingCards(newCards);
                      }} 
                      placeholder="Название карточки" 
                      className={cn("w-full px-3 py-2.5 border border-input rounded-md text-sm", cardSortingShowDescriptions ? "mb-2" : "mb-0", "bg-muted")} 
                    />
                    {cardSortingShowDescriptions && (
                      <input 
                        type="text" 
                        value={card.description} 
                        onChange={e => {
                          const newCards = [...cardSortingCards];
                          newCards[i] = { ...newCards[i], description: e.target.value };
                          setCardSortingCards(newCards);
                        }} 
                        placeholder="Введите описание" 
                        className="w-full px-3 py-2 border border-input rounded-md text-sm text-muted-foreground" 
                      />
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      if (cardSortingCards.length > 1) {
                        setCardSortingCards(cardSortingCards.filter((_, j) => j !== i));
                      }
                    }} 
                    style={{ padding: 8, background: "transparent", border: "none", cursor: cardSortingCards.length > 1 ? "pointer" : "not-allowed", opacity: cardSortingCards.length > 1 ? 1 : 0.3 }}
                  >
                    <Trash2 size={18} className="text-muted-foreground/70" />
                  </button>
                </div>
              ))}
            </div>
            <Button 
              variant="outline" 
              onClick={() => setCardSortingCards([...cardSortingCards, { id: crypto.randomUUID(), title: "", description: "", imageUrl: "", imageFile: null }])}
            >
              <Plus className="h-4 w-4 mr-2" />
              Карточка
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowCardSortingCardsModal(false)}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Categories Modal for Card Sorting */}
      <Dialog open={showCardSortingCategoriesModal} onOpenChange={setShowCardSortingCategoriesModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Категории ({cardSortingCategories.filter(c => c.name.trim()).length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {cardSortingCategories.map((cat, i) => (
                <div key={cat.id} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                  <input 
                    type="text" 
                    value={cat.name} 
                    onChange={e => {
                      const newCats = [...cardSortingCategories];
                      newCats[i] = { ...newCats[i], name: e.target.value };
                      setCardSortingCategories(newCats);
                    }} 
                    placeholder="Название категории" 
                    className="flex-1 px-3 py-2.5 border border-input rounded-md text-sm bg-muted" 
                  />
                  <button 
                    onClick={() => {
                      if (cardSortingCategories.length > 1) {
                        setCardSortingCategories(cardSortingCategories.filter((_, j) => j !== i));
                      }
                    }} 
                    style={{ padding: 8, background: "transparent", border: "none", cursor: cardSortingCategories.length > 1 ? "pointer" : "not-allowed", opacity: cardSortingCategories.length > 1 ? 1 : 0.3 }}
                  >
                    <X size={18} className="text-muted-foreground/70" />
                  </button>
                </div>
              ))}
            </div>
            <Button 
              variant="outline" 
              onClick={() => setCardSortingCategories([...cardSortingCategories, { id: crypto.randomUUID(), name: "" }])}
            >
              <Plus className="h-4 w-4 mr-2" />
              Категория
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowCardSortingCategoriesModal(false)}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============= Компонент InlineBlockEditor =============
interface InlineBlockEditorProps {
  block: StudyBlock;
  index: number;
  isEditable: boolean;
  prototypes: Prototype[];
  allBlocks: StudyBlock[]; // Все блоки для выбора в логике
  onDelete: () => void;
  onUpdateBlock: (blockId: string, updates: Partial<StudyBlock>) => void;
  onPrototypeDeleted?: (id: string) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
  onSetError?: (message: string | null) => void;
}

function InlineBlockEditor({
  block,
  index,
  isEditable,
  prototypes,
  allBlocks,
  onDelete,
  onUpdateBlock,
  onPrototypeDeleted,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  onSetError
}: InlineBlockEditorProps) {
  const typeInfo = BLOCK_TYPES.find(t => t.value === block.type) || BLOCK_TYPES[0];
  const IconComponent = typeInfo.Icon;

  // Локальный state для текстовых полей (для мгновенного отображения)
  const [localText, setLocalText] = useState<Record<string, string>>({});
  const [localImage, setLocalImage] = useState<{ file: File | null; url: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Локальные состояния для card_sorting
  const [localCards, setLocalCards] = useState<Array<{ id: string; title: string; description: string; imageUrl: string }>>([]);
  const [localCategories, setLocalCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [showCardsModal, setShowCardsModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [cardsShowImages, setCardsShowImages] = useState(false);
  const [cardsShowDescriptions, setCardsShowDescriptions] = useState(false);
  
  // Локальные состояния для tree_testing
  const [localTree, setLocalTree] = useState<TreeTestingNode[]>([]);
  const [localTreeCorrectAnswers, setLocalTreeCorrectAnswers] = useState<string[]>([]);
  const [localTreeExpandedNodes, setLocalTreeExpandedNodes] = useState<Set<string>>(new Set());
  
  // Локальные состояния для matrix
  const [localMatrixRows, setLocalMatrixRows] = useState<Array<{ id: string; title: string }>>([]);
  const [localMatrixColumns, setLocalMatrixColumns] = useState<Array<{ id: string; title: string }>>([]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  
  // Состояние для показа секции логики (inline)
  const [showLogicSection, setShowLogicSection] = useState(false);
  
  // Показываем секцию логики если она уже есть в config
  useEffect(() => {
    if (block.config?.logic) {
      setShowLogicSection(true);
    }
    // При удалении логики секция скрывается через setShowLogicSection(false) в onClick
  }, [block.config?.logic]);
  
  // Состояние для drag-and-drop изображений в блоке предпочтение
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  
  // Инициализация карточек и категорий из block.config
  useEffect(() => {
    if (block.type === "card_sorting") {
      const cards = block.config?.cards || [];
      const categories = block.config?.categories || [];
      setLocalCards(cards);
      setLocalCategories(categories);
      // Показываем опции, если есть хотя бы одна карточка с изображением/описанием
      setCardsShowImages(cards.length > 0 && cards.some((c: any) => c.imageUrl));
      setCardsShowDescriptions(cards.length > 0 && cards.some((c: any) => c.description));
    }
    if (block.type === "tree_testing") {
      const tree = block.config?.tree || [];
      const correctAnswers = block.config?.correctAnswers || [];
      setLocalTree(tree);
      setLocalTreeCorrectAnswers(correctAnswers);
      // Развернуть все узлы при загрузке
      const allIds = new Set<string>();
      const collectIds = (nodes: TreeTestingNode[]) => {
        nodes.forEach(node => {
          if (node.children.length > 0) {
            allIds.add(node.id);
            collectIds(node.children);
          }
        });
      };
      collectIds(tree);
      setLocalTreeExpandedNodes(allIds);
    }
    if (block.type === "matrix") {
      const rows = block.config?.rows || [];
      const columns = block.config?.columns || [];
      setLocalMatrixRows(rows.length > 0 ? rows : [{ id: crypto.randomUUID(), title: "" }]);
      setLocalMatrixColumns(columns.length > 0 ? columns : [{ id: crypto.randomUUID(), title: "" }]);
    }
  }, [block.id, block.config?.cards, block.config?.categories, block.config?.tree, block.config?.correctAnswers, block.config?.rows, block.config?.columns]);

  // Функция загрузки изображения
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setUploadingImage(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return null;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("study-images")
        .upload(fileName, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("study-images")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  // Функция загрузки PDF файла
  const uploadPdf = async (file: File): Promise<string | null> => {
    try {
      setUploadingImage(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return null;
      }

      if (file.type !== "application/pdf") {
        return null;
      }

      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("study-images")
        .upload(fileName, file, {
          contentType: "application/pdf"
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("study-images")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  // Получить значение изображения
  const getImageValue = () => {
    if (localImage) {
      return localImage;
    }
    const imageUrl = block.config?.imageUrl;
    return imageUrl ? { file: null, url: imageUrl } : { file: null, url: "" };
  };

  // Обработка загрузки изображения
  const handleImageChange = async (file: File | null, url: string = "") => {
    if (file) {
      setLocalImage({ file, url: "" });
      const uploadedUrl = await uploadImage(file);
      if (uploadedUrl) {
        setLocalImage({ file: null, url: uploadedUrl });
        updateConfig("imageUrl", uploadedUrl);
      }
    } else {
      setLocalImage({ file: null, url: "" });
      updateConfig("imageUrl", undefined);
    }
  };

  // Получить значение текстового поля (локальное или из block.config)
  const getTextValue = (key: string, fallback: string = "") => {
    return localText[key] !== undefined ? localText[key] : (block.config?.[key] || fallback);
  };

  // Получить инструкции (локальное или из block.instructions)
  const getInstructionsValue = () => {
    return localText["__instructions__"] !== undefined ? localText["__instructions__"] : (block.instructions || "");
  };

  // Debounced save для текстовых полей конфига
  const debouncedSaveConfig = useCallback(
    debounce((newConfig: any) => {
      onUpdateBlock(block.id, { config: newConfig });
    }, 800),
    [block.id, onUpdateBlock]
  );

  // Debounced save для инструкций
  const debouncedSaveInstructions = useCallback(
    debounce((value: string) => {
      onUpdateBlock(block.id, { instructions: value });
    }, 800),
    [block.id, onUpdateBlock]
  );

  // Обновление текстового поля конфига (с debounce)
  const updateConfigText = (key: string, value: string) => {
    setLocalText(prev => ({ ...prev, [key]: value }));
    const newConfig = { ...block.config, [key]: value };
    debouncedSaveConfig(newConfig);
  };

  // Обновление НЕтекстового конфига (без debounce — сразу сохраняем)
  // Взаимное исключение: eye_tracking_enabled и record_camera не могут быть включены одновременно,
  // т.к. WebGazer требует эксклюзивный доступ к камере для анализа движений глаз
  const updateConfig = (key: string, value: any) => {
    let newConfig = { ...block.config, [key]: value };
    
    // При включении eye_tracking — отключаем запись камеры
    if (key === "eye_tracking_enabled" && value === true) {
      newConfig.record_camera = false;
    }
    // При включении записи камеры — отключаем eye_tracking
    if (key === "record_camera" && value === true) {
      newConfig.eye_tracking_enabled = false;
    }
    
    onUpdateBlock(block.id, { config: newConfig });
  };

  // Обновление инструкций (с debounce)
  const updateInstructions = (value: string) => {
    setLocalText(prev => ({ ...prev, "__instructions__": value }));
    debouncedSaveInstructions(value);
  };

  // Обновление прототипа (без debounce)
  const updatePrototype = (protoId: string) => {
    onUpdateBlock(block.id, { prototype_id: protoId });
  };

  // Сброс локального state при изменении block извне
  useEffect(() => {
    setLocalText({});
    setLocalImage(null);
  }, [block.id]);

  return (
    <div className="flex items-start gap-2 group/block">
      {/* Drag handle */}
      {isEditable && (
        <div
          draggable={isEditable}
          onDragStart={onDragStart}
          className={cn(
            "flex items-center justify-center pt-3 pb-3 px-1 cursor-grab active:cursor-grabbing opacity-0 group-hover/block:opacity-100 transition-opacity hover:opacity-100",
            isDragging && "opacity-100"
          )}
          style={{ minHeight: '60px' }}
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <Card 
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "flex-1 transition-all border border-border shadow-[0px_2px_3px_rgba(0,0,0,0.1)] rounded-[20px] group",
          isDragging && "opacity-50 border-dashed border-primary"
        )}
      >
        <CardContent className="p-0">
          {/* Заголовок блока */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium leading-6">{index + 1}.</span>
            <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
              <IconComponent size={14} className="text-muted-foreground" />
            </div>
            <span className="text-[15px] font-medium leading-6">{typeInfo.label}</span>
          </div>

          {isEditable && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!showLogicSection && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setShowLogicSection(true);
                    // Инициализируем пустую логику если её еще нет
                    if (!block.config?.logic) {
                      onUpdateBlock(block.id, { 
                        config: { ...block.config, logic: {} } 
                      });
                    }
                  }}
                >
                  <Workflow className="h-4 w-4 mr-1" />
                  Добавить логику
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-destructive hover:text-destructive h-8 w-8 p-0"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Поля редактирования в зависимости от типа */}
        <div className="space-y-3 p-5">
          {/* Прототип */}
          {block.type === "prototype" && (
            <>
              <div>
                <Label className="text-[15px] font-medium leading-6 mb-1 block">Figma прототип</Label>
                {prototypes.length === 0 ? (
                  <div className="text-sm text-warning bg-warning/10 dark:bg-warning/15 dark:text-warning p-2 rounded border border-warning/20 dark:border-warning/30">
                    Нет прототипов. Создайте через Figma плагин.
                  </div>
                ) : (
                  <PrototypeSelect
                    value={block.prototype_id || ""}
                    onChange={updatePrototype}
                    prototypes={prototypes}
                    disabled={!isEditable}
                    onPrototypeDeleted={(id) => {
                      onPrototypeDeleted?.(id);
                      if (block.prototype_id === id) onUpdateBlock(block.id, { prototype_id: null });
                    }}
                    triggerClassName="rounded-md h-auto py-2 text-sm"
                  />
                )}
              </div>
              <div>
                <FloatingTextarea 
                  label="Инструкции"
                  value={getInstructionsValue()} 
                  onChange={e => updateInstructions(e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите инструкции для респондента"
                  rows={2}
                />
              </div>
              <div className="mt-2 p-3 bg-muted rounded-lg space-y-3">
                <div className="text-sm font-medium">Дополнительные настройки</div>
                <ToggleSwitch
                  label="Отслеживание движений глаз (экспериментально)"
                  checked={!!block.config?.eye_tracking_enabled}
                  onChange={(checked: boolean) => updateConfig("eye_tracking_enabled", checked)}
                  disabled={!isEditable}
                />
                {block.config?.eye_tracking_enabled && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    Запись камеры отключена — WebGazer использует камеру для анализа глаз
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleSwitch
                    label="Запись экрана"
                    checked={!!block.config?.record_screen}
                    onChange={(checked: boolean) => updateConfig("record_screen", checked)}
                    disabled={!isEditable}
                  />
                  <ToggleSwitch
                    label={block.config?.eye_tracking_enabled ? "Запись камеры (откл. при eye tracking)" : "Запись камеры"}
                    checked={!!block.config?.record_camera}
                    onChange={(checked: boolean) => updateConfig("record_camera", checked)}
                    disabled={!isEditable || !!block.config?.eye_tracking_enabled}
                  />
                  <ToggleSwitch
                    label="Запись голоса"
                    checked={!!block.config?.record_audio}
                    onChange={(checked: boolean) => updateConfig("record_audio", checked)}
                    disabled={!isEditable}
                  />
                </div>
              </div>
            </>
          )}

          {/* Открытый вопрос */}
          {block.type === "open_question" && (
            <>
              <div>
                {(() => {
                  const image = getImageValue();
                  const hasImage = image.file || image.url;
                  return (
                    <div>
                      {hasImage ? (
                        <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/30">
                          <img 
                            src={image.file ? URL.createObjectURL(image.file) : image.url} 
                            alt="Preview" 
                            className="w-20 h-16 object-cover rounded-md border border-border"
                          />
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-2">{image.file?.name || "Загружено"}</div>
                            {isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImageChange(null)}
                                disabled={uploadingImage}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center justify-start cursor-pointer group">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file && isEditable) {
                                handleImageChange(file);
                              }
                            }}
                            disabled={!isEditable || uploadingImage}
                          />
                          {uploadingImage ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          )}
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <FloatingTextarea 
                  label="Вопрос"
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите текст вопроса"
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={block.config.optional || false}
                  onCheckedChange={(checked) => updateConfig("optional", checked)}
                  disabled={!isEditable}
                />
                <span>Необязательный вопрос</span>
              </label>
            </>
          )}

          {/* UMUX Lite */}
          {block.type === "umux_lite" && (
            <div className="text-[15px] font-medium leading-6 text-foreground">
              Стандартный опрос UMUX Lite из 2 вопросов по шкале 1-7
            </div>
          )}

          {/* Выбор */}
          {block.type === "choice" && (
            <>
              <div>
                {(() => {
                  const image = getImageValue();
                  const hasImage = image.file || image.url;
                  return (
                    <div>
                      {hasImage ? (
                        <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/30">
                          <img 
                            src={image.file ? URL.createObjectURL(image.file) : image.url} 
                            alt="Preview" 
                            className="w-20 h-16 object-cover rounded-md border border-border"
                          />
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-2">{image.file?.name || "Загружено"}</div>
                            {isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImageChange(null)}
                                disabled={uploadingImage}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center justify-start cursor-pointer group">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file && isEditable) {
                                handleImageChange(file);
                              }
                            }}
                            disabled={!isEditable || uploadingImage}
                          />
                          {uploadingImage ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          )}
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <FloatingInput 
                  label="Вопрос"
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите вопрос"
                />
              </div>
              <div>
                <div className="space-y-2">
                  {(block.config.options || []).map((opt: string, i: number) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-5">{String.fromCharCode(65 + i)}.</span>
                      <FloatingInput 
                        value={opt} 
                        onChange={e => {
                          const newOpts = [...(block.config.options || [])];
                          newOpts[i] = e.target.value;
                          updateConfig("options", newOpts);
                        }}
                        disabled={!isEditable}
                        className="flex-1"
                        placeholder="Введите вариант ответа"
                      />
                      {isEditable && (block.config.options?.length || 0) > 2 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const newOpts = (block.config.options || []).filter((_: any, j: number) => j !== i);
                            updateConfig("options", newOpts);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {isEditable && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-xs"
                      onClick={() => updateConfig("options", [...(block.config.options || []), ""])}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Добавить вариант
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config.allowMultiple || false}
                    onCheckedChange={(checked) => updateConfig("allowMultiple", checked)}
                    disabled={!isEditable}
                  />
                  <span>Разрешить выбор нескольких вариантов</span>
                </label>
                <div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={block.config.shuffle || false}
                      onCheckedChange={(checked) => updateConfig("shuffle", checked)}
                      disabled={!isEditable}
                    />
                    <span>Перемешать варианты ответа</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">Включите эту опцию, чтобы перемешать ответы. Вы можете закрепить позиции конкретных ответов.</p>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config.allowOther || false}
                    onCheckedChange={(checked) => updateConfig("allowOther", checked)}
                    disabled={!isEditable}
                  />
                  <span>Разрешить респондентам ввести свой ответ (опция «Другое»)</span>
                </label>
                <div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={block.config.allowNone || false}
                      onCheckedChange={(checked) => updateConfig("allowNone", checked)}
                      disabled={!isEditable}
                    />
                    <span>Добавить опцию «Ничего из вышеперечисленного»</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">Эта опция отменяет все остальные опции и появляется в конце списка. Вы можете изменить текст этой опции.</p>
                </div>
                {block.config.allowNone && (
                  <div className="ml-6 mt-1">
                    <Input 
                      type="text" 
                      value={block.config.noneText ?? ""} 
                      onChange={e => updateConfig("noneText", e.target.value)} 
                      placeholder="Ничего из вышеперечисленного" 
                      className="h-8 text-xs max-w-xs" 
                      disabled={!isEditable}
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config.optional || false}
                    onCheckedChange={(checked) => updateConfig("optional", checked)}
                    disabled={!isEditable}
                  />
                  <span>Необязательный вопрос</span>
                </label>
              </div>
            </>
          )}

          {/* Контекст */}
          {block.type === "context" && (
            <>
              <div>
                {(() => {
                  const image = getImageValue();
                  const hasImage = image.file || image.url;
                  return (
                    <div>
                      {hasImage ? (
                        <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/30">
                          <img 
                            src={image.file ? URL.createObjectURL(image.file) : image.url} 
                            alt="Preview" 
                            className="w-20 h-16 object-cover rounded-md border border-border"
                          />
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-2">{image.file?.name || "Загружено"}</div>
                            {isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImageChange(null)}
                                disabled={uploadingImage}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center justify-start cursor-pointer group">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file && isEditable) {
                                handleImageChange(file);
                              }
                            }}
                            disabled={!isEditable || uploadingImage}
                          />
                          {uploadingImage ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          )}
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <FloatingInput 
                  label="Заголовок"
                  value={getTextValue("title")} 
                  onChange={e => updateConfigText("title", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите заголовок"
                />
              </div>
              <div>
                <FloatingTextarea 
                  label="Описание"
                  value={getTextValue("description")} 
                  onChange={e => updateConfigText("description", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите описание"
                  rows={3}
                />
              </div>
            </>
          )}

          {/* Шкала */}
          {block.type === "scale" && (
            <>
              <div>
                {(() => {
                  const image = getImageValue();
                  const hasImage = image.file || image.url;
                  return (
                    <div>
                      {hasImage ? (
                        <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/30">
                          <img 
                            src={image.file ? URL.createObjectURL(image.file) : image.url} 
                            alt="Preview" 
                            className="w-20 h-16 object-cover rounded-md border border-border"
                          />
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-2">{image.file?.name || "Загружено"}</div>
                            {isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImageChange(null)}
                                disabled={uploadingImage}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center justify-start cursor-pointer group">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file && isEditable) {
                                handleImageChange(file);
                              }
                            }}
                            disabled={!isEditable || uploadingImage}
                          />
                          {uploadingImage ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          )}
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <FloatingInput 
                  label="Вопрос"
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите вопрос"
                />
              </div>
              <div className="flex gap-2">
                {[
                  { v: "numeric", l: "Числовой" },
                  { v: "emoji", l: "Эмодзи" },
                  { v: "stars", l: "Звезды" }
                ].map(t => (
                  <button
                    key={t.v}
                    onClick={() => isEditable && updateConfig("scaleType", t.v)}
                    disabled={!isEditable}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-md border transition-colors",
                      block.config.scaleType === t.v
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
              {block.config.scaleType === "numeric" && (
                <div className="flex gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <Label className="text-[15px] font-medium leading-6">От:</Label>
                    <select 
                      value={block.config.min || 1}
                      onChange={e => updateConfig("min", parseInt(e.target.value))}
                      disabled={!isEditable}
                      className="p-1 text-sm border border-border rounded bg-background"
                    >
                      {[0, 1].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[15px] font-medium leading-6">До:</Label>
                    <select 
                      value={block.config.max || 5}
                      onChange={e => updateConfig("max", parseInt(e.target.value))}
                      disabled={!isEditable}
                      className="p-1 text-sm border border-border rounded bg-background"
                    >
                      {[3, 4, 5, 6, 7, 8, 9, 10].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <FloatingInput 
                  label="Подпись в начале шкалы"
                  value={block.config.minLabel ?? ""} 
                  onChange={e => updateConfig("minLabel", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Например: Совсем не согласен"
                />
              </div>
              <div>
                <FloatingInput 
                  label="Подпись в конце шкалы"
                  value={block.config.maxLabel ?? ""} 
                  onChange={e => updateConfig("maxLabel", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Например: Полностью согласен"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={block.config.optional || false}
                  onCheckedChange={(checked) => updateConfig("optional", checked)}
                  disabled={!isEditable}
                />
                <span>Необязательный вопрос</span>
              </label>
            </>
          )}

          {/* Предпочтение */}
          {block.type === "preference" && (
            <>
              <div>
                <FloatingInput 
                  label="Вопрос"
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите вопрос"
                />
              </div>
              <div>
                <div className="space-y-2">
                  {(block.config.images || []).map((imgUrl: string, i: number) => {
                    const handleImageDragStart = (e: React.DragEvent, index: number) => {
                      if (!isEditable || !imgUrl) return;
                      setDraggedImageIndex(index);
                      e.dataTransfer.effectAllowed = "move";
                    };

                    const handleImageDragOver = (e: React.DragEvent) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    };

                    const handleImageDrop = (e: React.DragEvent, targetIndex: number) => {
                      e.preventDefault();
                      if (draggedImageIndex === null || draggedImageIndex === targetIndex || !isEditable) return;
                      
                      const newImages = [...(block.config.images || [])];
                      const [draggedItem] = newImages.splice(draggedImageIndex, 1);
                      newImages.splice(targetIndex, 0, draggedItem);
                      updateConfig("images", newImages);
                      setDraggedImageIndex(null);
                    };

                    return (
                      <div 
                        key={i} 
                        className={cn(
                          "flex gap-2 items-center",
                          draggedImageIndex === i && "opacity-50"
                        )}
                        draggable={isEditable && !!imgUrl}
                        onDragStart={(e) => handleImageDragStart(e, i)}
                        onDragOver={handleImageDragOver}
                        onDrop={(e) => handleImageDrop(e, i)}
                        onDragEnd={() => setDraggedImageIndex(null)}
                      >
                        {isEditable && <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />}
                        <span className="text-xs text-muted-foreground w-5 flex-shrink-0">{String.fromCharCode(65 + i)}.</span>
                        {imgUrl ? (
                          <div className="flex items-center gap-3 flex-1 p-2 border border-border rounded-xl bg-muted/30">
                            <img 
                              src={imgUrl} 
                              alt={`Preview ${i + 1}`} 
                              className="w-16 h-12 object-cover rounded-md border border-border flex-shrink-0"
                            />
                            {isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newImages = [...(block.config.images || [])];
                                  newImages.splice(i, 1);
                                  updateConfig("images", newImages);
                                }}
                                className="text-destructive hover:text-destructive h-8 w-8 p-0 ml-auto"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 flex-1 p-2 border border-border rounded-xl bg-muted/30">
                            <label className="flex items-center justify-start cursor-pointer group flex-1">
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const uploadedUrl = await uploadImage(file);
                                    if (uploadedUrl) {
                                      const newImages = [...(block.config.images || [])];
                                      newImages[i] = uploadedUrl;
                                      updateConfig("images", newImages);
                                    }
                                  }
                                }}
                                disabled={!isEditable || uploadingImage}
                              />
                              {uploadingImage ? (
                                <span className="text-xs text-muted-foreground">...</span>
                              ) : (
                                <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                              )}
                            </label>
                            {(block.config.images || []).length > 2 && isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newImages = [...(block.config.images || [])];
                                  newImages.splice(i, 1);
                                  updateConfig("images", newImages);
                                }}
                                className="text-destructive hover:text-destructive h-8 w-8 p-0 ml-auto"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {isEditable && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-xs"
                      onClick={() => updateConfig("images", [...(block.config.images || []), ""])}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Добавить вариант ответа
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => isEditable && updateConfig("comparisonType", "all")}
                  disabled={!isEditable}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors flex-1",
                    block.config.comparisonType === "all"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  Выбор из всех
                </button>
                <button
                  onClick={() => isEditable && updateConfig("comparisonType", "pairwise")}
                  disabled={!isEditable}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors flex-1",
                    block.config.comparisonType === "pairwise"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  Попарное сравнение
                </button>
              </div>
              {block.config.comparisonType === "all" && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config.shuffle || false}
                    onCheckedChange={(checked) => updateConfig("shuffle", checked)}
                    disabled={!isEditable}
                  />
                  <span>Перемешивать варианты ответа</span>
                </label>
              )}
            </>
          )}

          {/* 5 секунд */}
          {block.type === "five_seconds" && (
            <>
              <div>
                {(() => {
                  const image = getImageValue();
                  const hasImage = image.file || image.url;
                  return (
                    <div>
                      {hasImage ? (
                        <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/30">
                          <img 
                            src={image.file ? URL.createObjectURL(image.file) : image.url} 
                            alt="Preview" 
                            className="w-20 h-16 object-cover rounded-md border border-border"
                          />
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-2">{image.file?.name || "Загружено"}</div>
                            {isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImageChange(null)}
                                disabled={uploadingImage}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center justify-start cursor-pointer group">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file && isEditable) {
                                handleImageChange(file);
                              }
                            }}
                            disabled={!isEditable || uploadingImage}
                          />
                          {uploadingImage ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          )}
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <FloatingTextarea 
                  label="Инструкция"
                  value={getTextValue("instruction")} 
                  onChange={e => updateConfigText("instruction", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите инструкцию"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-4">
                <Label className="text-[15px] font-medium leading-6">Время показа:</Label>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" 
                    min={5} 
                    max={60} 
                    value={block.config.duration || 5}
                    onChange={e => updateConfig("duration", parseInt(e.target.value))}
                    disabled={!isEditable}
                    className="w-24"
                  />
                  <span className="text-sm font-medium">{block.config.duration || 5} сек</span>
                </div>
              </div>
            </>
          )}

          {/* Тест первого клика */}
          {block.type === "first_click" && (
            <>
              <div>
                {(() => {
                  const image = getImageValue();
                  const hasImage = image.file || image.url;
                  return (
                    <div>
                      {hasImage ? (
                        <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/30">
                          <img 
                            src={image.file ? URL.createObjectURL(image.file) : image.url} 
                            alt="Preview" 
                            className="w-20 h-16 object-cover rounded-md border border-border"
                          />
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-2">{image.file?.name || "Загружено"}</div>
                            {isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImageChange(null)}
                                disabled={uploadingImage}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center justify-start cursor-pointer group">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file && isEditable) {
                                handleImageChange(file);
                              }
                            }}
                            disabled={!isEditable || uploadingImage}
                          />
                          {uploadingImage ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          )}
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <FloatingTextarea 
                  label="Инструкция"
                  value={getTextValue("instruction")} 
                  onChange={e => updateConfigText("instruction", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите задание для респондента"
                  rows={2}
                />
              </div>
            </>
          )}

          {/* Сортировка карточек */}
          {block.type === "card_sorting" && (
            <>
              <div>
                <FloatingTextarea 
                  label="Задание"
                  value={getTextValue("task")} 
                  onChange={e => updateConfigText("task", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите задание"
                  rows={2}
                />
              </div>

              <div>
                <h3 className="text-[15px] font-medium leading-6 mb-2">Тип сортировки</h3>
                <div className="flex flex-row gap-3">
                  <label className={cn(
                    "flex flex-1 min-w-0 cursor-pointer rounded-lg border p-4 text-left transition-colors",
                    (block.config?.sortingType === "closed" ? "border-2 border-primary bg-info-subtle" : "border border-input bg-background"),
                    isEditable ? "hover:bg-muted/50" : "cursor-default opacity-80"
                  )}>
                    <input
                      type="radio"
                      name="card_sorting_type"
                      checked={block.config?.sortingType === "closed"}
                      onChange={() => isEditable && updateConfig("sortingType", "closed")}
                      className="sr-only"
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-sm">Закрытая сортировка</span>
                      <p className="text-sm text-muted-foreground mt-1">Респонденты группируют карточки в заранее определенные категории.</p>
                    </div>
                  </label>
                  <label className={cn(
                    "flex flex-1 min-w-0 cursor-pointer rounded-lg border p-4 text-left transition-colors",
                    (block.config?.sortingType === "open" || !block.config?.sortingType ? "border-2 border-primary bg-info-subtle" : "border border-input bg-background"),
                    isEditable ? "hover:bg-muted/50" : "cursor-default opacity-80"
                  )}>
                    <input
                      type="radio"
                      name="card_sorting_type"
                      checked={block.config?.sortingType === "open" || !block.config?.sortingType}
                      onChange={() => isEditable && updateConfig("sortingType", "open")}
                      className="sr-only"
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-sm">Открытая сортировка</span>
                      <p className="text-sm text-muted-foreground mt-1">Респонденты группируют карточки в категории, которые они создают сами; вы можете также добавить заранее определенные категории.</p>
                    </div>
                  </label>
                </div>
              </div>
              
              {/* Карточки */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[15px] font-medium leading-6">Карточки</h3>
                  {isEditable && (
                    <button
                      onClick={() => setShowCardsModal(true)}
                      className="flex items-center gap-1 text-primary hover:text-[var(--color-primary-hover)] transition-colors text-[13px] font-medium"
                    >
                      {localCards.filter(c => c.title.trim()).length === 0 ? (
                        <>
                          <Plus className="h-4 w-4" />
                          Добавить
                        </>
                      ) : (
                        <>
                          <Pencil className="h-4 w-4" />
                          Редактировать
                        </>
                      )}
                    </button>
                  )}
                </div>
                {localCards.filter(c => c.title.trim()).length === 0 ? (
                  <div className="text-sm text-muted-foreground mb-2">Карточки не добавлены</div>
                ) : (
                  <div className="text-sm text-muted-foreground mb-2">
                    {localCards.filter(c => c.title.trim()).length} карточек
                  </div>
                )}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={block.config.shuffleCards || false}
                      onCheckedChange={(checked) => updateConfig("shuffleCards", checked)}
                      disabled={!isEditable}
                    />
                    <span>Перемешивать карточки</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={block.config.allowPartialSort || false}
                      onCheckedChange={(checked) => updateConfig("allowPartialSort", checked)}
                      disabled={!isEditable}
                    />
                    <span>Разрешить не сортировать все карточки</span>
                  </label>
                  {block.config.allowPartialSort && (
                    <div className="text-xs text-muted-foreground ml-6">
                      Если эта опция включена, респондент сможет завершить сортировку, даже если не все карточки отсортированы.
                    </div>
                  )}
                </div>
              </div>
              
              {/* Категории */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[15px] font-medium leading-6">Категории</h3>
                  {isEditable && (
                    <button
                      onClick={() => setShowCategoriesModal(true)}
                      className="flex items-center gap-1 text-primary hover:text-[var(--color-primary-hover)] transition-colors text-[13px] font-medium"
                    >
                      {localCategories.filter(c => c.name.trim()).length === 0 ? (
                        <>
                          <Plus className="h-4 w-4" />
                          Добавить
                        </>
                      ) : (
                        <>
                          <Pencil className="h-4 w-4" />
                          Редактировать
                        </>
                      )}
                    </button>
                  )}
                </div>
                {localCategories.filter(c => c.name.trim()).length === 0 ? (
                  <div className="text-sm text-muted-foreground mb-2">Категории не добавлены</div>
                ) : (
                  <div className="text-sm text-muted-foreground mb-2">
                    {localCategories.filter(c => c.name.trim()).length} категорий
                  </div>
                )}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={block.config.shuffleCategories || false}
                      onCheckedChange={(checked) => updateConfig("shuffleCategories", checked)}
                      disabled={!isEditable}
                    />
                    <span>Перемешивать категории</span>
                  </label>
                </div>
              </div>
              
              {/* Модальное окно для карточек */}
              <Dialog open={showCardsModal} onOpenChange={setShowCardsModal}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Карточки ({localCards.filter(c => c.title.trim()).length})</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox 
                          checked={cardsShowImages}
                          onCheckedChange={(checked) => setCardsShowImages(checked === true)}
                        />
                        <span>Добавить изображения</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox 
                          checked={cardsShowDescriptions}
                          onCheckedChange={(checked) => setCardsShowDescriptions(checked === true)}
                        />
                        <span>Добавить описания</span>
                      </label>
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto space-y-2">
                      {localCards.map((card, i) => (
                        <div key={card.id} className="flex gap-3 items-start p-3 border border-border rounded-xl">
                          {cardsShowImages && (
                            <div className="flex-shrink-0">
                              {card.imageUrl ? (
                                <div className="relative">
                                  <img 
                                    src={card.imageUrl} 
                                    alt="" 
                                    className="w-16 h-16 object-cover rounded-md border border-border"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={async () => {
                                      const newCards = [...localCards];
                                      newCards[i] = { ...newCards[i], imageUrl: "" };
                                      setLocalCards(newCards);
                                    }}
                                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 p-0"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <label className="flex items-center justify-center w-16 h-16 border-2 border-dashed border-border rounded-md cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const uploadedUrl = await uploadImage(file);
                                        if (uploadedUrl) {
                                          const newCards = [...localCards];
                                          newCards[i] = { ...newCards[i], imageUrl: uploadedUrl };
                                          setLocalCards(newCards);
                                        }
                                      }
                                    }}
                                  />
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                </label>
                              )}
                            </div>
                          )}
                          <div className="flex-1 space-y-2">
                            <FloatingInput
                              label="Название карточки"
                              value={card.title}
                              onChange={e => {
                                const newCards = [...localCards];
                                newCards[i] = { ...newCards[i], title: e.target.value };
                                setLocalCards(newCards);
                              }}
                              placeholder="Введите название карточки"
                            />
                            {cardsShowDescriptions && (
                              <FloatingInput
                                label="Описание"
                                value={card.description}
                                onChange={e => {
                                  const newCards = [...localCards];
                                  newCards[i] = { ...newCards[i], description: e.target.value };
                                  setLocalCards(newCards);
                                }}
                                placeholder="Введите описание"
                              />
                            )}
                          </div>
                          {localCards.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setLocalCards(localCards.filter((_, j) => j !== i));
                              }}
                              className="text-destructive hover:text-destructive flex-shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setLocalCards([...localCards, { id: crypto.randomUUID(), title: "", description: "", imageUrl: "" }])}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Карточка
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button 
                      onClick={() => {
                        const validCards = localCards.filter(c => c.title.trim()).map(c => ({
                          id: c.id,
                          title: c.title.trim(),
                          description: cardsShowDescriptions ? (c.description || "") : "",
                          imageUrl: cardsShowImages ? (c.imageUrl || "") : ""
                        }));
                        updateConfig("cards", validCards);
                        setShowCardsModal(false);
                      }}
                    >
                      Готово
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              {/* Модальное окно для категорий */}
              <Dialog open={showCategoriesModal} onOpenChange={setShowCategoriesModal}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Категории ({localCategories.filter(c => c.name.trim()).length})</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="max-h-[50vh] overflow-y-auto space-y-2">
                      {localCategories.map((cat, i) => (
                        <div key={cat.id} className="flex gap-2 items-center">
                          <FloatingInput
                            label="Название категории"
                            value={cat.name}
                            onChange={e => {
                              const newCats = [...localCategories];
                              newCats[i] = { ...newCats[i], name: e.target.value };
                              setLocalCategories(newCats);
                            }}
                            placeholder="Введите название категории"
                            className="flex-1"
                          />
                          {localCategories.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setLocalCategories(localCategories.filter((_, j) => j !== i));
                              }}
                              className="text-destructive hover:text-destructive flex-shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setLocalCategories([...localCategories, { id: crypto.randomUUID(), name: "" }])}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Категория
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button 
                      onClick={() => {
                        const validCategories = localCategories.filter(c => c.name.trim()).map(c => ({
                          id: c.id,
                          name: c.name.trim()
                        }));
                        updateConfig("categories", validCategories);
                        setShowCategoriesModal(false);
                      }}
                    >
                      Готово
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}

          {/* Матрица */}
          {block.type === "matrix" && (
            <>
              {/* Изображение */}
              <div>
                {(() => {
                  const image = getImageValue();
                  const hasImage = image.file || image.url;
                  return (
                    <div>
                      {hasImage ? (
                        <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/30 mb-4">
                          <img 
                            src={image.file ? URL.createObjectURL(image.file) : image.url} 
                            alt="Preview" 
                            className="w-20 h-16 object-cover rounded-md border border-border"
                          />
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-2">{image.file?.name || "Загружено"}</div>
                            {isEditable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  await handleImageChange(null);
                                }}
                                disabled={uploadingImage}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        isEditable && (
                          <label className="flex items-center justify-start cursor-pointer group mb-4">
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file && isEditable) {
                                  await handleImageChange(file, "");
                                }
                              }}
                              disabled={!isEditable || uploadingImage}
                            />
                            {uploadingImage ? (
                              <span className="text-xs text-muted-foreground">...</span>
                            ) : (
                              <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            )}
                          </label>
                        )
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <FloatingTextarea 
                  label="Вопрос"
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите вопрос"
                  rows={2}
                />
              </div>
              <div>
                <FloatingTextarea 
                  label="Описание (опционально)"
                  value={getTextValue("description")} 
                  onChange={e => updateConfigText("description", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите описание"
                  rows={2}
                />
              </div>

              {/* Строки */}
              <div>
                <h3 className="text-[15px] font-medium leading-6 mb-3">Строки</h3>
                <div className="flex flex-col gap-2">
                  {localMatrixRows.map((row, i) => {
                    const isEmpty = !row.title.trim();
                    const isEditing = editingRowId === row.id;
                    
                    if (isEmpty || isEditing) {
                      // Вычисляем ширину для Input на основе текста
                      const textWidth = row.title.length > 0 ? Math.max(row.title.length * 8 + 24, 120) : 120;
                      return (
                        <div key={row.id} className="w-fit">
                          <Input
                            value={row.title}
                            onChange={(e) => {
                              const newRows = [...localMatrixRows];
                              newRows[i] = { ...newRows[i], title: e.target.value };
                              setLocalMatrixRows(newRows);
                            }}
                            onBlur={() => {
                              setEditingRowId(null);
                              const validRows = localMatrixRows.filter(r => r.title.trim()).map(r => ({
                                id: r.id,
                                title: r.title.trim()
                              }));
                              updateConfig("rows", validRows);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                              if (e.key === "Escape") {
                                setEditingRowId(null);
                                e.currentTarget.blur();
                              }
                            }}
                            placeholder="Название строки"
                            className="h-8 px-3 py-1.5 text-sm rounded-full border"
                            autoFocus={isEmpty || isEditing}
                            style={{ width: isEmpty ? "100%" : `${textWidth}px`, minWidth: "120px" }}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={row.id} className="w-fit">
                        <Badge 
                          variant="secondary"
                          className="px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer border border-transparent hover:border-border transition-colors"
                          onClick={() => {
                            if (isEditable) {
                              setEditingRowId(row.id);
                            }
                          }}
                        >
                          <span>{row.title}</span>
                          {isEditable && localMatrixRows.filter(r => r.title.trim()).length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const newRows = [...localMatrixRows];
                                newRows.splice(i, 1);
                                setLocalMatrixRows(newRows);
                                const validRows = newRows.filter(r => r.title.trim()).map(r => ({
                                  id: r.id,
                                  title: r.title.trim()
                                }));
                                updateConfig("rows", validRows);
                              }}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      </div>
                    );
                  })}
                  {isEditable && (
                    <div className="w-fit">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newRows = [...localMatrixRows, { id: crypto.randomUUID(), title: "" }];
                          setLocalMatrixRows(newRows);
                        }}
                        className="flex items-center gap-1"
                      >
                        <Plus className="h-4 w-4" />
                        Добавить строку
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={block.config?.shuffleRows || false}
                      onCheckedChange={(checked) => updateConfig("shuffleRows", checked === true)}
                      disabled={!isEditable}
                    />
                    <span>Перемешивать строки</span>
                  </label>
                </div>
              </div>

              {/* Столбцы */}
              <div>
                <h3 className="text-[15px] font-medium leading-6 mb-3">Столбцы</h3>
                <div className="flex flex-col gap-2">
                  {localMatrixColumns.map((column, i) => {
                    const isEmpty = !column.title.trim();
                    const isEditing = editingColumnId === column.id;
                    
                    if (isEmpty || isEditing) {
                      // Вычисляем ширину для Input на основе текста
                      const textWidth = column.title.length > 0 ? Math.max(column.title.length * 8 + 24, 120) : 120;
                      return (
                        <div key={column.id} className="w-fit">
                          <Input
                            value={column.title}
                            onChange={(e) => {
                              const newColumns = [...localMatrixColumns];
                              newColumns[i] = { ...newColumns[i], title: e.target.value };
                              setLocalMatrixColumns(newColumns);
                            }}
                            onBlur={() => {
                              setEditingColumnId(null);
                              const validColumns = localMatrixColumns.filter(c => c.title.trim()).map(c => ({
                                id: c.id,
                                title: c.title.trim()
                              }));
                              updateConfig("columns", validColumns);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                              if (e.key === "Escape") {
                                setEditingColumnId(null);
                                e.currentTarget.blur();
                              }
                            }}
                            placeholder="Название столбца"
                            className="h-8 px-3 py-1.5 text-sm rounded-full border"
                            autoFocus={isEmpty || isEditing}
                            style={{ width: isEmpty ? "100%" : `${textWidth}px`, minWidth: "120px" }}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={column.id} className="w-fit">
                        <Badge 
                          variant="secondary"
                          className="px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer border border-transparent hover:border-border transition-colors"
                          onClick={() => {
                            if (isEditable) {
                              setEditingColumnId(column.id);
                            }
                          }}
                        >
                          <span>{column.title}</span>
                          {isEditable && localMatrixColumns.filter(c => c.title.trim()).length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const newColumns = [...localMatrixColumns];
                                newColumns.splice(i, 1);
                                setLocalMatrixColumns(newColumns);
                                const validColumns = newColumns.filter(c => c.title.trim()).map(c => ({
                                  id: c.id,
                                  title: c.title.trim()
                                }));
                                updateConfig("columns", validColumns);
                              }}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      </div>
                    );
                  })}
                  {isEditable && (
                    <div className="w-fit">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newColumns = [...localMatrixColumns, { id: crypto.randomUUID(), title: "" }];
                          setLocalMatrixColumns(newColumns);
                        }}
                        className="flex items-center gap-1"
                      >
                        <Plus className="h-4 w-4" />
                        Добавить столбец
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={block.config?.shuffleColumns || false}
                      onCheckedChange={(checked) => updateConfig("shuffleColumns", checked === true)}
                      disabled={!isEditable}
                    />
                    <span>Перемешивать колонки</span>
                  </label>
                </div>
              </div>

              {/* Настройки */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config?.allowMultiple || false}
                    onCheckedChange={(checked) => updateConfig("allowMultiple", checked === true)}
                    disabled={!isEditable}
                  />
                  <span>Разрешить выбор нескольких вариантов</span>
                </label>
                {block.config?.allowMultiple && (
                  <div className="ml-6 text-xs text-muted-foreground">
                    Если вы хотите разрешить респондентам выбирать несколько вариантов в строке, включите эту настройку.
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config?.optional || false}
                    onCheckedChange={(checked) => updateConfig("optional", checked === true)}
                    disabled={!isEditable}
                  />
                  <span>Необязательный вопрос</span>
                </label>
              </div>

            </>
          )}

          {/* Соглашение */}
          {block.type === "agreement" && (
            <>
              <div>
                <FloatingInput
                  label="Заголовок"
                  value={getTextValue("title")}
                  onChange={e => updateConfigText("title", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Пожалуйста, ознакомьтесь и примите условия участия в исследовании"
                />
              </div>

              <div>
                <Label className="text-[15px] font-medium leading-6 mb-2 block">Тип соглашения</Label>
                <div className="flex gap-3">
                  <label className={cn(
                    "flex-1 p-4 border rounded-lg cursor-pointer transition-colors",
                    block.config?.agreementType === "standard"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="radio"
                        name={`agreement-type-${block.id}`}
                        value="standard"
                        checked={block.config?.agreementType === "standard" || block.config?.agreementType === undefined}
                        onChange={() => updateConfig("agreementType", "standard")}
                        disabled={!isEditable}
                        className="cursor-pointer"
                      />
                      <span className="font-medium text-sm">Сбор персональных данных</span>
                    </div>
                    <div className="text-xs text-muted-foreground ml-6">
                      Стандартное соглашение для сбора и обработки персональных данных
                    </div>
                  </label>
                  <label className={cn(
                    "flex-1 p-4 border rounded-lg cursor-pointer transition-colors",
                    block.config?.agreementType === "custom"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="radio"
                        name={`agreement-type-${block.id}`}
                        value="custom"
                        checked={block.config?.agreementType === "custom"}
                        onChange={() => updateConfig("agreementType", "custom")}
                        disabled={!isEditable}
                        className="cursor-pointer"
                      />
                      <span className="font-medium text-sm">Загрузить свое соглашение</span>
                    </div>
                    <div className="text-xs text-muted-foreground ml-6">
                      Загрузите свой собственный файл .pdf с текстом соглашения
                    </div>
                  </label>
                </div>
              </div>

              {block.config?.agreementType === "custom" && (
                <div>
                  <Label className="text-[15px] font-medium leading-6 mb-2 block">Файл соглашения (.pdf)</Label>
                  {block.config?.customPdfUrl ? (
                    <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/30">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground mb-1">PDF файл загружен</div>
                        <a
                          href={block.config.customPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Открыть PDF
                        </a>
                      </div>
                      {isEditable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            updateConfig("customPdfUrl", undefined);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Удалить
                        </Button>
                      )}
                    </div>
                  ) : (
                    isEditable && (
                      <label className="flex items-center justify-center cursor-pointer group p-6 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors bg-muted/30">
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && file.type === "application/pdf") {
                              const uploadedUrl = await uploadPdf(file);
                              if (uploadedUrl) {
                                updateConfig("customPdfUrl", uploadedUrl);
                              }
                            } else {
                              onSetError?.("Пожалуйста, выберите файл в формате PDF");
                            }
                          }}
                          disabled={!isEditable}
                        />
                        <div className="text-center">
                          <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2 group-hover:text-primary transition-colors" />
                          <div className="text-sm text-muted-foreground">Нажмите для загрузки PDF</div>
                          <div className="text-xs text-muted-foreground mt-1">Только файлы .pdf</div>
                        </div>
                      </label>
                    )
                  )}
                </div>
              )}
            </>
          )}

          {/* Тестирование дерева */}
          {block.type === "tree_testing" && (
            <TreeTestingEditorInline
              task={getTextValue("task")}
              setTask={(task) => updateConfigText("task", task)}
              description={getTextValue("description")}
              setDescription={(desc) => updateConfigText("description", desc)}
              tree={localTree}
              setTree={(tree) => {
                setLocalTree(tree);
                updateConfig("tree", tree);
              }}
              correctAnswers={localTreeCorrectAnswers}
              setCorrectAnswers={(answers) => {
                setLocalTreeCorrectAnswers(answers);
                updateConfig("correctAnswers", answers);
              }}
              allowSkip={block.config?.allowSkip || false}
              setAllowSkip={(allow) => updateConfig("allowSkip", allow)}
              expandedNodes={localTreeExpandedNodes}
              setExpandedNodes={setLocalTreeExpandedNodes}
              isEditable={isEditable}
            />
          )}
        </div>

        {/* Логика блока (inline) */}
        {isEditable && showLogicSection && (
          <div className="border-t border-border pt-5 px-5 pb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Логика</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  const newConfig = { ...block.config };
                  delete newConfig.logic;
                  onUpdateBlock(block.id, { config: newConfig });
                  setShowLogicSection(false);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Удалить логику
              </Button>
            </div>
            <LogicEditor
              block={block}
              allBlocks={allBlocks}
              onSave={(logic) => {
                onUpdateBlock(block.id, { 
                  config: { ...block.config, logic } 
                });
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

// ============= Компонент LogicEditor =============
interface LogicEditorProps {
  block: StudyBlock;
  allBlocks: StudyBlock[];
  onSave: (logic: BlockLogic) => void;
  onCancel?: () => void; // Опционально для inline режима
}

function LogicEditor({ block, allBlocks, onSave }: LogicEditorProps) {
  const currentLogic = block.config?.logic as BlockLogic | undefined;
  
  // Состояние для логического перехода
  const [conditionalLogic, setConditionalLogic] = useState<ConditionalLogic>(
    currentLogic?.conditionalLogic || { rules: [] }
  );
  
  // Состояние для показа при условии
  const [showOnCondition, setShowOnCondition] = useState<ShowOnCondition>(
    currentLogic?.showOnCondition || { enabled: false, action: "show", conditions: [] }
  );

  // Автосохранение при изменении логики (с debounce для избежания лишних вызовов)
  const isInitialMount = useRef(true);
  useEffect(() => {
    // Пропускаем первый рендер (инициализация из currentLogic)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      const logic: BlockLogic = {};
      if (conditionalLogic.rules.length > 0 || conditionalLogic.elseGoToBlockId) {
        logic.conditionalLogic = conditionalLogic;
      }
      if (showOnCondition.enabled) {
        logic.showOnCondition = showOnCondition;
      }
      onSave(logic);
    }, 300); // Debounce 300ms

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditionalLogic, showOnCondition]);

  const blocksInOrder = useMemo(
    () => [...allBlocks].sort((a, b) => a.order_index - b.order_index),
    [allBlocks]
  );
  const previousBlocks = useMemo(
    () => blocksInOrder.filter(b => b.order_index < block.order_index),
    [blocksInOrder, block.order_index]
  );

  const getBlockTitle = (blockId: string): string => {
    const targetBlock = blocksInOrder.find(b => b.id === blockId);
    if (!targetBlock) return "Блок не найден";
    const getTitle = (b: StudyBlock): string => {
      switch (b.type) {
        case "open_question":
          return b.config?.question?.substring(0, 50) || "Открытый вопрос";
        case "choice":
          return b.config?.question?.substring(0, 50) || "Выбор";
        case "scale":
          return b.config?.question?.substring(0, 50) || "Шкала";
        case "preference":
          return b.config?.question?.substring(0, 50) || "Предпочтение";
        case "card_sorting":
          return b.config?.task?.substring(0, 50) || "Сортировка карточек";
        case "matrix":
          return b.config?.question?.substring(0, 50) || "Матрица";
        case "tree_testing":
          return b.config?.task?.substring(0, 50) || "Тестирование дерева";
        case "prototype":
          return "Figma прототип";
        default:
          return `Блок ${b.type}`;
      }
    };
    const idx = blocksInOrder.indexOf(targetBlock);
    return `${idx >= 0 ? idx + 1 : "?"}. ${getTitle(targetBlock)}`;
  };

  return (
    <div className="space-y-6">
      {/* Показать при условии — первая секция */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Показать при условии</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Показать или скрыть блок в зависимости от условий
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
            <Checkbox
              checked={showOnCondition.enabled}
              onCheckedChange={(checked) => {
                setShowOnCondition({ ...showOnCondition, enabled: checked === true });
              }}
            />
            <span className="text-sm">Включить</span>
          </label>
        </div>

        {showOnCondition.enabled && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={showOnCondition.action}
                onChange={(e) => {
                  setShowOnCondition({
                    ...showOnCondition,
                    action: e.target.value as "show" | "hide"
                  });
                }}
                className="p-2 border border-border rounded-md text-sm"
              >
                <option value="show">Показать</option>
                <option value="hide">Скрыть</option>
              </select>
              <span className="text-sm">этот блок, если</span>
            </div>

            <div className="space-y-2">
              {showOnCondition.conditions.map((condition, condIndex) => (
                <div key={condIndex} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={condition.blockId}
                      onChange={(e) => {
                        const newConditions = [...showOnCondition.conditions];
                        newConditions[condIndex].blockId = e.target.value;
                        setShowOnCondition({ ...showOnCondition, conditions: newConditions });
                      }}
                      className="flex-1 min-w-[140px] p-2 border border-border rounded-md text-sm"
                    >
                      <option value="">Выберите блок</option>
                      {previousBlocks.map(b => (
                        <option key={b.id} value={b.id}>
                          {getBlockTitle(b.id)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={condition.operator}
                      onChange={(e) => {
                        const newConditions = [...showOnCondition.conditions];
                        newConditions[condIndex].operator = e.target.value as LogicCondition["operator"];
                        setShowOnCondition({ ...showOnCondition, conditions: newConditions });
                      }}
                      className="p-2 border border-border rounded-md text-sm"
                    >
                      <option value="contains">содержит</option>
                      <option value="not_contains">не содержит</option>
                      <option value="equals">равно</option>
                      <option value="not_equals">не равно</option>
                      <option value="less_than">меньше</option>
                      <option value="greater_than">больше</option>
                      <option value="has_answer">имеет ответ</option>
                      <option value="completed_on">завершен на...</option>
                      <option value="not_completed_on">не завершен на...</option>
                    </select>
                    {condition.operator !== "has_answer" &&
                      condition.operator !== "completed_on" &&
                      condition.operator !== "not_completed_on" &&
                      (condition.operator === "contains" ||
                        condition.operator === "not_contains" ||
                        condition.operator === "equals" ||
                        condition.operator === "not_equals") &&
                      (() => {
                        const condBlock = blocksInOrder.find(b => b.id === condition.blockId);
                        const isChoiceBlock = condBlock?.type === "choice" && Array.isArray(condBlock?.config?.options);
                        const options = isChoiceBlock ? (condBlock.config.options as string[]) : [];
                        return isChoiceBlock ? (
                          <select
                            value={condition.value || ""}
                            onChange={(e) => {
                              const newConditions = [...showOnCondition.conditions];
                              newConditions[condIndex].value = e.target.value;
                              setShowOnCondition({ ...showOnCondition, conditions: newConditions });
                            }}
                            className="flex-1 min-w-[120px] p-2 border border-border rounded-md text-sm"
                          >
                            <option value="">Выберите опцию</option>
                            {options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={condition.value || ""}
                            onChange={(e) => {
                              const newConditions = [...showOnCondition.conditions];
                              newConditions[condIndex].value = e.target.value;
                              setShowOnCondition({ ...showOnCondition, conditions: newConditions });
                            }}
                            placeholder="Значение"
                            className="flex-1 min-w-[120px] p-2 border border-border rounded-md text-sm"
                          />
                        );
                      })()}
                    {(condition.operator === "less_than" || condition.operator === "greater_than") && (
                      <input
                        type="number"
                        value={condition.value ?? ""}
                        onChange={(e) => {
                          const newConditions = [...showOnCondition.conditions];
                          newConditions[condIndex].value = e.target.value;
                          setShowOnCondition({ ...showOnCondition, conditions: newConditions });
                        }}
                        placeholder="Число"
                        className="flex-1 min-w-[80px] p-2 border border-border rounded-md text-sm"
                      />
                    )}
                    {(condition.operator === "completed_on" || condition.operator === "not_completed_on") && (
                      <input
                        type="text"
                        value={condition.screenName || ""}
                        onChange={(e) => {
                          const newConditions = [...showOnCondition.conditions];
                          newConditions[condIndex].screenName = e.target.value;
                          setShowOnCondition({ ...showOnCondition, conditions: newConditions });
                        }}
                        placeholder="Название экрана"
                        className="flex-1 min-w-[120px] p-2 border border-border rounded-md text-sm"
                      />
                    )}
                    {showOnCondition.conditions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newConditions = showOnCondition.conditions.filter((_, i) => i !== condIndex);
                          const prevCombs = (showOnCondition.combinators ?? []) as ("and" | "or")[];
                          const newCombinators = [...prevCombs];
                          newCombinators.splice(condIndex > 0 ? condIndex - 1 : 0, 1);
                          setShowOnCondition({
                            ...showOnCondition,
                            conditions: newConditions,
                            combinators: newCombinators.length ? newCombinators : undefined
                          });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {condIndex < showOnCondition.conditions.length - 1 && (
                    <div className="flex items-center gap-2">
                      <select
                        value={showOnCondition.combinators?.[condIndex] ?? "and"}
                        onChange={(e) => {
                          const comb = (showOnCondition.combinators ?? []) as ("and" | "or")[];
                          const next = [...comb];
                          while (next.length <= condIndex) next.push("and");
                          next[condIndex] = e.target.value as "and" | "or";
                          setShowOnCondition({ ...showOnCondition, combinators: next });
                        }}
                        className="w-20 p-1.5 border border-border rounded-md text-sm"
                      >
                        <option value="and">И</option>
                        <option value="or">Или</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newConditions = [
                    ...showOnCondition.conditions,
                    { blockId: "", operator: "contains" as const, value: "" }
                  ];
                  const prevCombs = showOnCondition.combinators ?? [];
                  const newCombinators: ("and" | "or")[] = newConditions.length <= 1 ? [] : [...prevCombs, "and"];
                  setShowOnCondition({
                    ...showOnCondition,
                    conditions: newConditions,
                    combinators: newCombinators.length ? newCombinators : undefined
                  });
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Добавить условие
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Логический переход — вторая секция */}
      <div className="border-t border-border pt-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Логический переход</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Добавьте условия, чтобы настроить переходы между блоками
        </p>

        {conditionalLogic.rules.length === 0 ? (
          <div className="space-y-2">
            <span className="font-medium">Всегда переходить к</span>
            <select
              value={conditionalLogic.elseGoToBlockId || ""}
              onChange={(e) => {
                setConditionalLogic({
                  ...conditionalLogic,
                  elseGoToBlockId: e.target.value || undefined
                });
              }}
              className="w-full p-2 border border-border rounded-md text-sm"
            >
              <option value="">Выберите блок</option>
              <option value="__next__">Следующий блок</option>
              {blocksInOrder.map(b => (
                <option key={b.id} value={b.id}>
                  {getBlockTitle(b.id)}
                </option>
              ))}
              <option value="__end__">Завершение теста</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConditionalLogic({
                  ...conditionalLogic,
                  rules: [
                    {
                      conditions: [{ blockId: "", operator: "contains", value: "" }],
                      goToBlockId: conditionalLogic.elseGoToBlockId || ""
                    }
                  ]
                });
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Добавить условие
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {conditionalLogic.rules.map((rule, ruleIndex) => (
                <div key={ruleIndex} className="border border-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Если</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const newRules = conditionalLogic.rules.filter((_, i) => i !== ruleIndex);
                        setConditionalLogic({ ...conditionalLogic, rules: newRules });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {rule.conditions.map((condition, condIndex) => (
                      <div key={condIndex} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={condition.blockId}
                            onChange={(e) => {
                              const newRules = [...conditionalLogic.rules];
                              newRules[ruleIndex].conditions[condIndex].blockId = e.target.value;
                              setConditionalLogic({ ...conditionalLogic, rules: newRules });
                            }}
                            className="flex-1 min-w-[140px] p-2 border border-border rounded-md text-sm"
                          >
                            <option value="">Выберите блок</option>
                            {previousBlocks.map(b => (
                              <option key={b.id} value={b.id}>
                                {getBlockTitle(b.id)}
                              </option>
                            ))}
                          </select>
                          <select
                            value={condition.operator}
                            onChange={(e) => {
                              const newRules = [...conditionalLogic.rules];
                              newRules[ruleIndex].conditions[condIndex].operator = e.target.value as LogicCondition["operator"];
                              setConditionalLogic({ ...conditionalLogic, rules: newRules });
                            }}
                            className="p-2 border border-border rounded-md text-sm"
                          >
                            <option value="contains">содержит</option>
                            <option value="not_contains">не содержит</option>
                            <option value="equals">равно</option>
                            <option value="not_equals">не равно</option>
                            <option value="less_than">меньше</option>
                            <option value="greater_than">больше</option>
                            <option value="has_answer">имеет ответ</option>
                            <option value="completed_on">завершен на...</option>
                            <option value="not_completed_on">не завершен на...</option>
                          </select>
                          {condition.operator !== "has_answer" &&
                            condition.operator !== "completed_on" &&
                            condition.operator !== "not_completed_on" &&
                            (condition.operator === "contains" ||
                              condition.operator === "not_contains" ||
                              condition.operator === "equals" ||
                              condition.operator === "not_equals") &&
                            (() => {
                              const condBlock = blocksInOrder.find(b => b.id === condition.blockId);
                              const isChoiceBlock = condBlock?.type === "choice" && Array.isArray(condBlock?.config?.options);
                              const options = isChoiceBlock ? (condBlock.config.options as string[]) : [];
                              return isChoiceBlock ? (
                                <select
                                  value={condition.value || ""}
                                  onChange={(e) => {
                                    const newRules = [...conditionalLogic.rules];
                                    newRules[ruleIndex].conditions[condIndex].value = e.target.value;
                                    setConditionalLogic({ ...conditionalLogic, rules: newRules });
                                  }}
                                  className="flex-1 min-w-[120px] p-2 border border-border rounded-md text-sm"
                                >
                                  <option value="">Выберите опцию</option>
                                  {options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={condition.value || ""}
                                  onChange={(e) => {
                                    const newRules = [...conditionalLogic.rules];
                                    newRules[ruleIndex].conditions[condIndex].value = e.target.value;
                                    setConditionalLogic({ ...conditionalLogic, rules: newRules });
                                  }}
                                  placeholder="Значение"
                                  className="flex-1 min-w-[120px] p-2 border border-border rounded-md text-sm"
                                />
                              );
                            })()}
                          {(condition.operator === "less_than" || condition.operator === "greater_than") && (
                            <input
                              type="number"
                              value={condition.value ?? ""}
                              onChange={(e) => {
                                const newRules = [...conditionalLogic.rules];
                                newRules[ruleIndex].conditions[condIndex].value = e.target.value;
                                setConditionalLogic({ ...conditionalLogic, rules: newRules });
                              }}
                              placeholder="Число"
                              className="flex-1 min-w-[80px] p-2 border border-border rounded-md text-sm"
                            />
                          )}
                          {(condition.operator === "completed_on" || condition.operator === "not_completed_on") && (
                            <input
                              type="text"
                              value={condition.screenName || ""}
                              onChange={(e) => {
                                const newRules = [...conditionalLogic.rules];
                                newRules[ruleIndex].conditions[condIndex].screenName = e.target.value;
                                setConditionalLogic({ ...conditionalLogic, rules: newRules });
                              }}
                              placeholder="Название экрана"
                              className="flex-1 min-w-[120px] p-2 border border-border rounded-md text-sm"
                            />
                          )}
                          {rule.conditions.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newRules = [...conditionalLogic.rules];
                                const newConds = newRules[ruleIndex].conditions.filter((_, i) => i !== condIndex);
                                const prevCombs = (newRules[ruleIndex].combinators ?? []) as ("and" | "or")[];
                                const newCombs = [...prevCombs];
                                newCombs.splice(condIndex > 0 ? condIndex - 1 : 0, 1);
                                newRules[ruleIndex] = {
                                  ...newRules[ruleIndex],
                                  conditions: newConds,
                                  combinators: newCombs.length ? newCombs : undefined
                                };
                                setConditionalLogic({ ...conditionalLogic, rules: newRules });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {condIndex < rule.conditions.length - 1 && (
                          <div className="flex items-center gap-2">
                            <select
                              value={rule.combinators?.[condIndex] ?? "or"}
                              onChange={(e) => {
                                const newRules = [...conditionalLogic.rules];
                                const comb = (newRules[ruleIndex].combinators ?? []) as ("and" | "or")[];
                                const next = [...comb];
                                while (next.length <= condIndex) next.push("or");
                                next[condIndex] = e.target.value as "and" | "or";
                                newRules[ruleIndex] = { ...newRules[ruleIndex], combinators: next };
                                setConditionalLogic({ ...conditionalLogic, rules: newRules });
                              }}
                              className="w-20 p-1.5 border border-border rounded-md text-sm"
                            >
                              <option value="and">И</option>
                              <option value="or">Или</option>
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newRules = [...conditionalLogic.rules];
                        newRules[ruleIndex].conditions.push({
                          blockId: "",
                          operator: "contains",
                          value: ""
                        });
                        const prevCombs = newRules[ruleIndex].combinators ?? [];
                        newRules[ruleIndex].combinators = [...prevCombs, "or"];
                        setConditionalLogic({ ...conditionalLogic, rules: newRules });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Добавить условие
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <span className="font-medium">Перейти к</span>
                    <select
                      value={rule.goToBlockId}
                      onChange={(e) => {
                        const newRules = [...conditionalLogic.rules];
                        newRules[ruleIndex].goToBlockId = e.target.value;
                        setConditionalLogic({ ...conditionalLogic, rules: newRules });
                      }}
                      className="w-full p-2 border border-border rounded-md text-sm"
                    >
                      <option value="">Выберите блок</option>
                      <option value="__next__">Следующий блок</option>
                      {blocksInOrder.map(b => (
                        <option key={b.id} value={b.id}>
                          {getBlockTitle(b.id)}
                        </option>
                      ))}
                      <option value="__end__">Завершение теста</option>
                    </select>
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                onClick={() => {
                  setConditionalLogic({
                    ...conditionalLogic,
                    rules: [
                      ...conditionalLogic.rules,
                      {
                        conditions: [{ blockId: "", operator: "contains", value: "" }],
                        goToBlockId: ""
                      }
                    ]
                  });
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Добавить правило
              </Button>
            </div>

            <div className="space-y-2">
              <span className="font-medium">Если ничего не подошло, перейти к</span>
              <select
                value={conditionalLogic.elseGoToBlockId || ""}
                onChange={(e) => {
                  setConditionalLogic({
                    ...conditionalLogic,
                    elseGoToBlockId: e.target.value || undefined
                  });
                }}
                className="w-full p-2 border border-border rounded-md text-sm"
              >
                <option value="">Выберите блок</option>
                <option value="__next__">Следующий блок</option>
                {blocksInOrder.map(b => (
                  <option key={b.id} value={b.id}>
                    {getBlockTitle(b.id)}
                  </option>
                ))}
                <option value="__end__">Завершение теста</option>
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Функция генерации стандартного текста соглашения (152-ФЗ)
export function generateStandardAgreementText(): string {
  return `СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ

Настоящим я даю свое согласие на обработку моих персональных данных в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ "О персональных данных".

1. ОПЕРАТОР ПЕРСОНАЛЬНЫХ ДАННЫХ
Оператором персональных данных является организация, проводящая исследование.

2. ЦЕЛИ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ
Персональные данные обрабатываются в следующих целях:
- Проведение исследования и анализ результатов
- Улучшение качества продуктов и услуг
- Коммуникация с участниками исследования (при необходимости)

3. СОСТАВ ПЕРСОНАЛЬНЫХ ДАННЫХ
В рамках исследования могут собираться следующие данные:
- Ответы на вопросы исследования
- Данные о взаимодействии с интерфейсом (клики, время прохождения)
- Аудио- и видеозаписи (если применимо)
- Электронная почта и другие контактные данные (если предоставлены)

4. СПОСОБЫ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ
Обработка персональных данных осуществляется с использованием средств автоматизации и без использования таких средств, включая сбор, запись, систематизацию, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передачу (распространение, предоставление, доступ), обезличивание, блокирование, удаление, уничтожение персональных данных.

5. СРОК ДЕЙСТВИЯ СОГЛАСИЯ
Согласие действует до достижения целей обработки персональных данных или до отзыва согласия субъектом персональных данных.

6. ПРАВА СУБЪЕКТА ПЕРСОНАЛЬНЫХ ДАННЫХ
Я понимаю, что в соответствии с Федеральным законом № 152-ФЗ "О персональных данных" имею право:
- Получать информацию, касающуюся обработки моих персональных данных
- Требовать уточнения, блокирования или уничтожения персональных данных
- Отозвать согласие на обработку персональных данных
- Обжаловать действия или бездействие оператора в уполномоченный орган по защите прав субъектов персональных данных или в судебном порядке

7. ОТЗЫВ СОГЛАСИЯ
Я понимаю, что могу отозвать свое согласие на обработку персональных данных, направив письменное уведомление оператору по адресу, указанному в контактной информации.

Настоящее согласие предоставляется мной добровольно и подтверждает, что я ознакомлен(а) с условиями обработки персональных данных.`;
}

// Debounce утилита
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// ============= Вспомогательные функции для работы с деревом =============

// Найти узел и его родителя по ID
function findNodeById(
  nodes: TreeTestingNode[],
  nodeId: string,
  parent: TreeTestingNode | null = null
): { node: TreeTestingNode; parent: TreeTestingNode | null; parentArray: TreeTestingNode[] } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === nodeId) {
      return { node: nodes[i], parent, parentArray: nodes };
    }
    const found = findNodeById(nodes[i].children, nodeId, nodes[i]);
    if (found) {
      return found;
    }
  }
  return null;
}

// Получить путь к узлу (массив ID от корня до узла)
function getNodePath(nodes: TreeTestingNode[], nodeId: string, path: string[] = []): string[] | null {
  for (const node of nodes) {
    const currentPath = [...path, node.id];
    if (node.id === nodeId) {
      return currentPath;
    }
    const found = getNodePath(node.children, nodeId, currentPath);
    if (found) {
      return found;
    }
  }
  return null;
}

// Получить все ID узлов в дереве (для SortableContext)
function getAllNodeIds(nodes: TreeTestingNode[]): string[] {
  const ids: string[] = [];
  const collect = (nodeList: TreeTestingNode[]) => {
    nodeList.forEach(node => {
      ids.push(node.id);
      if (node.children.length > 0) {
        collect(node.children);
      }
    });
  };
  collect(nodes);
  return ids;
}

// Удалить узел из дерева
function removeNodeFromTree(nodes: TreeTestingNode[], nodeId: string): TreeTestingNode[] {
  return nodes
    .filter(node => node.id !== nodeId)
    .map(node => ({
      ...node,
      children: removeNodeFromTree(node.children, nodeId)
    }));
}

// Вставить узел в массив по индексу
function insertNodeAt(nodes: TreeTestingNode[], node: TreeTestingNode, index: number): TreeTestingNode[] {
  const newNodes = [...nodes];
  newNodes.splice(index, 0, node);
  return newNodes;
}

// Переместить узел в дереве
function moveNodeInTree(
  nodes: TreeTestingNode[],
  activeId: string,
  overId: string | null
): TreeTestingNode[] {
  if (!overId || activeId === overId) {
    return nodes;
  }

  const activeNodeInfo = findNodeById(nodes, activeId);
  if (!activeNodeInfo) {
    return nodes;
  }

  const { node: activeNode, parentArray: activeParentArray, parent: activeParent } = activeNodeInfo;
  
  // Проверяем, не пытаемся ли переместить узел внутрь самого себя или своих потомков
  const activePath = getNodePath(nodes, activeId);
  const overPath = getNodePath(nodes, overId);
  if (activePath && overPath && activePath.length > 0) {
    // Проверяем, не является ли overId потомком activeId
    const overIsDescendant = overPath.slice(0, activePath.length).every((id, idx) => id === activePath[idx]);
    if (overIsDescendant && overPath.length > activePath.length) {
      // Нельзя перемещать узел внутрь своих потомков
      return nodes;
    }
  }
  
  // Удаляем узел из текущей позиции
  let newTree = removeNodeFromTree(nodes, activeId);

  const overNodeInfo = findNodeById(newTree, overId);
  if (!overNodeInfo) {
    return newTree;
  }

  const { parentArray: overParentArray, parent: overParent } = overNodeInfo;
  const overIndex = overParentArray.findIndex(n => n.id === overId);

  if (overIndex === -1) {
    return newTree;
  }

  // Определяем, на том ли уровне перемещаем (сравниваем по родителю)
  const activeParentId = activeParent?.id || null;
  const overParentId = overParent?.id || null;
  const sameLevel = activeParentId === overParentId;

  // Если перемещаем на тот же уровень
  if (sameLevel) {
    // Находим индекс активного узла в массиве родителя (в исходном дереве до удаления)
    let activeIndex = -1;
    for (let i = 0; i < activeParentArray.length; i++) {
      if (activeParentArray[i].id === activeId) {
        activeIndex = i;
        break;
      }
    }
    
    if (activeIndex !== -1 && activeIndex !== overIndex) {
      // Используем arrayMove для перемещения в пределах одного массива
      // Но нужно учесть, что после удаления activeNode из newTree, индексы сдвинулись
      // Если activeIndex < overIndex, то после удаления overIndex уменьшился на 1
      const adjustedOverIndex = activeIndex < overIndex ? overIndex - 1 : overIndex;
      // Вставляем activeNode обратно в правильную позицию
      const reordered = insertNodeAt(overParentArray, activeNode, adjustedOverIndex);
      return replaceParentArrayInTree(newTree, activeParentId, reordered);
    }
    // Если индекс не изменился, возвращаем дерево без изменений
    return newTree;
  }

  // Перемещаем на другой уровень - вставляем после целевого узла
  const insertIndex = overIndex + 1;
  const newParentArray = insertNodeAt([...overParentArray], activeNode, insertIndex);
  return replaceParentArrayInTree(newTree, overParentId, newParentArray);
}

// Обновить узел в дереве
function updateNodeInTree(nodes: TreeTestingNode[], nodeId: string, updates: Partial<TreeTestingNode> | ((node: TreeTestingNode) => TreeTestingNode)): TreeTestingNode[] {
  return nodes.map(node => {
    if (node.id === nodeId) {
      if (typeof updates === 'function') {
        return updates(node);
      }
      return { ...node, ...updates };
    }
    if (node.children.length > 0) {
      return { ...node, children: updateNodeInTree(node.children, nodeId, updates) };
    }
    return node;
  });
}

// Заменить массив узлов в дереве по ID родителя
function replaceParentArrayInTree(
  nodes: TreeTestingNode[],
  parentId: string | null,
  newArray: TreeTestingNode[]
): TreeTestingNode[] {
  // Если это корневой массив (parentId === null)
  if (parentId === null) {
    return newArray;
  }

  // Ищем родителя по ID и заменяем его children
  return nodes.map(node => {
    if (node.id === parentId) {
      return { ...node, children: newArray };
    }
    if (node.children.length > 0) {
      return { ...node, children: replaceParentArrayInTree(node.children, parentId, newArray) };
    }
    return node;
  });
}

// ============= Компонент SortableTreeNode =============
interface SortableTreeNodeProps {
  node: TreeTestingNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isCorrect: boolean;
  isEditable: boolean;
  expandedNodes: Set<string>;
  correctAnswers: string[];
  onToggleExpanded: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, updates: Partial<TreeTestingNode>) => void;
  onToggleCorrectAnswer: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onRemoveNode: (nodeId: string) => void;
  renderChildren: (children: TreeTestingNode[], depth: number) => React.ReactNode;
}

function SortableTreeNode({
  node,
  depth,
  hasChildren,
  isExpanded,
  isCorrect,
  isEditable,
  expandedNodes,
  correctAnswers,
  onToggleExpanded,
  onUpdateNode,
  onToggleCorrectAnswer,
  onAddChild,
  onRemoveNode,
  renderChildren,
}: SortableTreeNodeProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    disabled: !isEditable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div style={{ marginLeft: depth * 24 }} className="ml-6">
      <div 
        ref={setNodeRef} 
        style={style} 
        className="flex items-center gap-2 mb-2 py-1"
        {...attributes}
      >
        {/* Кнопка развернуть/свернуть */}
        <button
          onClick={() => hasChildren && isEditable && onToggleExpanded(node.id)}
          disabled={!isEditable}
          className={cn(
            "w-6 h-6 flex items-center justify-center bg-transparent border-none",
            hasChildren && isEditable ? "cursor-pointer opacity-100" : "cursor-default opacity-30"
          )}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          ) : (
            <span className="w-4" />
          )}
        </button>

        {/* Drag handle */}
        {isEditable && (
          <div
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none select-none"
            style={{ userSelect: 'none' }}
          >
            <GripVertical size={16} className="text-muted-foreground" />
          </div>
        )}

        {/* Инпут названия */}
        <FloatingInput
          value={node.name}
          onChange={e => onUpdateNode(node.id, { name: e.target.value })}
          placeholder="Введите название категории"
          disabled={!isEditable}
          className="flex-1"
        />

        {/* Кнопка "Отметить как верный" */}
        {isEditable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleCorrectAnswer(node.id)}
            className={cn(
              "h-8 px-3",
              isCorrect && "bg-success-bg border-success/50 text-foreground"
            )}
          >
            <CheckCircle2
              size={16}
              className={cn(
                "mr-1",
                isCorrect ? "text-foreground" : "text-muted-foreground"
              )}
            />
            {isCorrect && <span className="text-xs text-foreground">Верный</span>}
          </Button>
        )}

        {/* Кнопка добавить подкатегорию */}
        {isEditable && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              onAddChild(node.id);
            }}
            className="h-8 w-8"
          >
            <Plus size={16} />
          </Button>
        )}

        {/* Кнопка удалить */}
        {isEditable && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onRemoveNode(node.id);
            }}
            className="h-8 w-8 text-destructive hover:text-destructive"
          >
            <Trash2 size={16} />
          </Button>
        )}
      </div>

      {/* Дочерние узлы */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map(child => renderChildren([child], depth + 1))}
        </div>
      )}
    </div>
  );
}

// ============= Компонент TreeTestingEditorInline (встроенный в блок) =============
interface TreeTestingEditorInlineProps {
  task: string;
  setTask: (task: string) => void;
  description: string;
  setDescription: (desc: string) => void;
  tree: TreeTestingNode[];
  setTree: (tree: TreeTestingNode[]) => void;
  correctAnswers: string[];
  setCorrectAnswers: (answers: string[]) => void;
  allowSkip: boolean;
  setAllowSkip: (allow: boolean) => void;
  expandedNodes: Set<string>;
  setExpandedNodes: (nodes: Set<string>) => void;
  isEditable: boolean;
}

function TreeTestingEditorInline({
  task,
  setTask,
  description,
  setDescription,
  tree,
  setTree,
  correctAnswers,
  setCorrectAnswers,
  allowSkip,
  setAllowSkip,
  expandedNodes,
  setExpandedNodes,
  isEditable
}: TreeTestingEditorInlineProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Мемоизируем список всех ID узлов для SortableContext
  const allNodeIds = useMemo(() => getAllNodeIds(tree), [tree]);

  // Обновить узел в дереве
  const updateNode = useCallback((nodeId: string, updates: Partial<TreeTestingNode>) => {
    const newTree = tree.map((node: TreeTestingNode) => {
      if (node.id === nodeId) {
        return { ...node, ...updates };
      }
      if (node.children.length > 0) {
        return { ...node, children: updateNodeInTree(node.children, nodeId, updates) };
      }
      return node;
    });
    setTree(newTree);
  }, [setTree, tree]);

  // Добавить дочерний узел
  const addChildNode = useCallback((parentId: string) => {
    const newChild: TreeTestingNode = { id: crypto.randomUUID(), name: "", children: [] };
    const newTree = updateNodeInTree(tree, parentId, (node) => ({
      ...node,
      children: [...node.children, newChild]
    }));
    setTree(newTree);
    const newExpanded = new Set(expandedNodes);
    newExpanded.add(parentId);
    setExpandedNodes(newExpanded);
  }, [setTree, tree, expandedNodes, setExpandedNodes]);

  // Удалить узел
  const removeNode = useCallback((nodeId: string) => {
    const newTree = removeNodeFromTree(tree, nodeId);
    setTree(newTree);
    if (correctAnswers.includes(nodeId)) {
      setCorrectAnswers(correctAnswers.filter(id => id !== nodeId));
    }
  }, [setTree, tree, correctAnswers, setCorrectAnswers]);

  // Добавить узел на верхнем уровне
  const addRootNode = () => {
    setTree([...tree, { id: crypto.randomUUID(), name: "", children: [] }]);
  };

  // Переключить развёрнутость узла
  const toggleExpanded = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Переключить верный ответ
  const toggleCorrectAnswer = (nodeId: string) => {
    if (correctAnswers.includes(nodeId)) {
      setCorrectAnswers(correctAnswers.filter(id => id !== nodeId));
    } else {
      setCorrectAnswers([...correctAnswers, nodeId]);
    }
  };

  // Развернуть все
  const expandAll = () => {
    const allIds = new Set<string>();
    const collect = (nodes: TreeTestingNode[]) => {
      nodes.forEach(node => {
        if (node.children.length > 0) {
          allIds.add(node.id);
          collect(node.children);
        }
      });
    };
    collect(tree);
    setExpandedNodes(allIds);
  };

  // Свернуть все
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Обработчик начала перетаскивания
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Обработчик окончания перетаскивания
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Перемещаем узел
    const newTree = moveNodeInTree(tree, activeId, overId);
    if (newTree !== tree) {
      setTree(newTree);
    }
  };

  // Рекурсивный рендер узла дерева с использованием SortableTreeNode
  const renderTreeNode = useCallback((node: TreeTestingNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isCorrect = correctAnswers.includes(node.id);

    return (
      <SortableTreeNode
        key={node.id}
        node={node}
        depth={depth}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        isCorrect={isCorrect}
        isEditable={isEditable}
        expandedNodes={expandedNodes}
        correctAnswers={correctAnswers}
        onToggleExpanded={toggleExpanded}
        onUpdateNode={updateNode}
        onToggleCorrectAnswer={toggleCorrectAnswer}
        onAddChild={addChildNode}
        onRemoveNode={removeNode}
        renderChildren={(children, childDepth) => children.map(child => renderTreeNode(child, childDepth))}
      />
    );
  }, [expandedNodes, correctAnswers, isEditable, toggleExpanded, updateNode, toggleCorrectAnswer, addChildNode, removeNode]);

  // Получить список верных ответов для отображения
  const getCorrectAnswerPaths = (): string[] => {
    const paths: string[] = [];
    
    const findPath = (nodes: TreeTestingNode[], currentPath: string[] = []): void => {
      nodes.forEach(node => {
        const nodePath = [...currentPath, node.name].filter(Boolean);
        if (correctAnswers.includes(node.id) && node.name.trim()) {
          paths.push(nodePath.join(" › "));
        }
        if (node.children.length > 0) {
          findPath(node.children, nodePath);
        }
      });
    };
    
    findPath(tree);
    return paths;
  };

  return (
    <>
      {/* Задание */}
      <div>
        <FloatingTextarea 
          label="Задание"
          value={task} 
          onChange={e => setTask(e.target.value)}
          disabled={!isEditable}
          placeholder="Где бы вы искали товар?"
          rows={2}
        />
      </div>

      {/* Описание */}
      <div>
        <FloatingTextarea
          label="Описание"
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={!isEditable}
          placeholder="Добавить дополнительный контекст для задания"
          rows={2}
        />
      </div>

      {/* Дерево */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-medium leading-6">Дерево</h3>
          {isEditable && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Свернуть все
              </Button>
              <Button variant="outline" size="sm" onClick={expandAll}>
                Развернуть все
              </Button>
            </div>
          )}
        </div>
        
        {/* Дерево узлов */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="border border-border rounded-xl p-4 bg-muted/30 max-h-[400px] overflow-y-auto">
            {tree.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Дерево не настроено
              </div>
            ) : (
              <>
                <SortableContext 
                  items={allNodeIds} 
                  strategy={verticalListSortingStrategy}
                >
                  {tree.map(node => renderTreeNode(node))}
                </SortableContext>
                {isEditable && (
                  <Button 
                    variant="outline" 
                    onClick={addRootNode}
                    className="w-full mt-2"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить категорию
                  </Button>
                )}
              </>
            )}
          </div>
          <DragOverlay>
            {activeId ? (
              <div className="flex items-center gap-2 mb-2 py-1 opacity-50 bg-white border border-border rounded p-2">
                <GripVertical size={16} className="text-muted-foreground" />
                <span className="text-sm">
                  {findNodeById(tree, activeId)?.node.name || 'Перемещение...'}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Верные ответы */}
      {correctAnswers.length > 0 && (
        <div>
          <Label className="text-[15px] font-medium leading-6 mb-2 block">
            {correctAnswers.length === 1 ? "Верный ответ" : "Верные ответы"}
          </Label>
          <div className="space-y-2">
            {getCorrectAnswerPaths().map((path, i) => (
              <div 
                key={i} 
                className="flex items-center gap-2 p-3 bg-success-bg border border-success/30 rounded-xl"
              >
                <CheckCircle2 size={18} className="text-foreground flex-shrink-0" />
                <span className="text-sm text-foreground">{path}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Опция разрешить пропуск */}
      <div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox 
            checked={allowSkip}
            onCheckedChange={setAllowSkip}
            disabled={!isEditable}
          />
          <span>Разрешить пропустить задание</span>
        </label>
      </div>
    </>
  );
}

// ============= Компонент TreeTestingEditor =============
interface TreeTestingEditorProps {
  task: string;
  setTask: (task: string) => void;
  description: string;
  setDescription: (desc: string) => void;
  tree: TreeTestingNode[];
  setTree: (tree: TreeTestingNode[]) => void;
  correctAnswers: string[];
  setCorrectAnswers: (answers: string[]) => void;
  allowSkip: boolean;
  setAllowSkip: (allow: boolean) => void;
  expandedNodes: Set<string>;
  setExpandedNodes: (nodes: Set<string>) => void;
  disabled?: boolean;
}

function TreeTestingEditor({
  task,
  setTask,
  description,
  setDescription,
  tree,
  setTree,
  correctAnswers,
  setCorrectAnswers,
  allowSkip,
  setAllowSkip,
  expandedNodes,
  setExpandedNodes,
  disabled = false
}: TreeTestingEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Мемоизируем список всех ID узлов для SortableContext
  const allNodeIds = useMemo(() => getAllNodeIds(tree), [tree]);

  // Подсчитать количество узлов с названиями
  const countValidNodes = (nodes: TreeTestingNode[]): number => {
    return nodes.reduce((acc, node) => {
      const selfCount = node.name.trim() ? 1 : 0;
      return acc + selfCount + countValidNodes(node.children);
    }, 0);
  };

  // Обновить узел в дереве
  const updateNode = useCallback((nodeId: string, updates: Partial<TreeTestingNode>) => {
    const newTree = tree.map((node: TreeTestingNode) => {
      if (node.id === nodeId) {
        return { ...node, ...updates };
      }
      if (node.children.length > 0) {
        return { ...node, children: updateNodeInTree(node.children, nodeId, updates) };
      }
      return node;
    });
    setTree(newTree);
  }, [setTree, tree]);

  // Добавить дочерний узел
  const addChildNode = useCallback((parentId: string) => {
    const newChild: TreeTestingNode = { id: crypto.randomUUID(), name: "", children: [] };
    const newTree = updateNodeInTree(tree, parentId, (node) => ({
      ...node,
      children: [...node.children, newChild]
    }));
    setTree(newTree);
    const newExpanded = new Set(expandedNodes);
    newExpanded.add(parentId);
    setExpandedNodes(newExpanded);
  }, [setTree, tree, expandedNodes, setExpandedNodes]);

  // Удалить узел
  const removeNode = useCallback((nodeId: string) => {
    const newTree = removeNodeFromTree(tree, nodeId);
    setTree(newTree);
    if (correctAnswers.includes(nodeId)) {
      setCorrectAnswers(correctAnswers.filter(id => id !== nodeId));
    }
  }, [setTree, tree, correctAnswers, setCorrectAnswers]);

  // Добавить узел на верхнем уровне
  const addRootNode = () => {
    setTree([...tree, { id: crypto.randomUUID(), name: "", children: [] }]);
  };

  // Переключить развёрнутость узла
  const toggleExpanded = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Переключить верный ответ
  const toggleCorrectAnswer = (nodeId: string) => {
    if (correctAnswers.includes(nodeId)) {
      setCorrectAnswers(correctAnswers.filter(id => id !== nodeId));
    } else {
      setCorrectAnswers([...correctAnswers, nodeId]);
    }
  };

  // Развернуть все
  const expandAll = () => {
    const allIds = new Set<string>();
    const collect = (nodes: TreeTestingNode[]) => {
      nodes.forEach(node => {
        if (node.children.length > 0) {
          allIds.add(node.id);
          collect(node.children);
        }
      });
    };
    collect(tree);
    setExpandedNodes(allIds);
  };

  // Свернуть все
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Обработчик начала перетаскивания
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Обработчик окончания перетаскивания
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Перемещаем узел
    const newTree = moveNodeInTree(tree, activeId, overId);
    if (newTree !== tree) {
      setTree(newTree);
    }
  };

  // Рекурсивный рендер узла дерева с использованием SortableTreeNode
  const renderTreeNode = useCallback((node: TreeTestingNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isCorrect = correctAnswers.includes(node.id);

    return (
      <SortableTreeNode
        key={node.id}
        node={node}
        depth={depth}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        isCorrect={isCorrect}
        isEditable={!disabled}
        expandedNodes={expandedNodes}
        correctAnswers={correctAnswers}
        onToggleExpanded={toggleExpanded}
        onUpdateNode={updateNode}
        onToggleCorrectAnswer={toggleCorrectAnswer}
        onAddChild={addChildNode}
        onRemoveNode={removeNode}
        renderChildren={(children, childDepth) => children.map(child => renderTreeNode(child, childDepth))}
      />
    );
  }, [expandedNodes, correctAnswers, toggleExpanded, updateNode, toggleCorrectAnswer, addChildNode, removeNode]);

  // Получить список верных ответов для отображения
  const getCorrectAnswerPaths = (): string[] => {
    const paths: string[] = [];
    
    const findPath = (nodes: TreeTestingNode[], currentPath: string[] = []): void => {
      nodes.forEach(node => {
        const nodePath = [...currentPath, node.name].filter(Boolean);
        if (correctAnswers.includes(node.id) && node.name.trim()) {
          paths.push(nodePath.join(" › "));
        }
        if (node.children.length > 0) {
          findPath(node.children, nodePath);
        }
      });
    };
    
    findPath(tree);
    return paths;
  };

  return (
    <div className={cn(disabled && "pointer-events-none opacity-60")}>
      {/* Задание */}
      <div className="mb-4">
        <FloatingInput
          label="Задание"
          value={task}
          onChange={e => setTask(e.target.value)}
          placeholder="Где бы вы искали товар?"
        />
      </div>

      {/* Описание */}
      <div className="mb-4">
        <FloatingTextarea
          label="Описание"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Добавить дополнительный контекст для задания"
          rows={2}
        />
      </div>

      {/* Дерево */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Label>Дерево</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Свернуть все
            </Button>
            <Button variant="outline" size="sm" onClick={expandAll}>
              Развернуть все
            </Button>
          </div>
        </div>
        
        <div style={{ 
          fontSize: 13, 
          color: "var(--color-muted-foreground)", 
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 4
        }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <span>Клавиатурные сокращения</span>
        </div>
        
        <p className="text-sm text-muted-foreground mb-4">
          Перетащите элементы, чтобы переупорядочить их. Переместите вправо, чтобы вложить пункт, влево, чтобы вывести на уровень выше.
        </p>

        {/* Дерево узлов */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="border border-input rounded-lg p-4 bg-muted max-h-[400px] overflow-y-auto">
            <SortableContext 
              items={allNodeIds} 
              strategy={verticalListSortingStrategy}
            >
              {tree.map(node => renderTreeNode(node))}
            </SortableContext>
            
            {/* Кнопка добавить категорию */}
            <button
              onClick={addRootNode}
              className="flex items-center gap-2 px-4 py-2.5 mt-2 bg-background border border-input rounded-md cursor-pointer text-sm"
            >
              <Plus size={16} />
              Добавить категорию
            </button>
          </div>
          <DragOverlay>
            {activeId ? (
              <div className="flex items-center gap-2 mb-2 py-1 opacity-50 bg-white border border-border rounded p-2">
                <GripVertical size={16} className="text-muted-foreground" />
                <span className="text-sm">
                  {findNodeById(tree, activeId)?.node.name || 'Перемещение...'}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Верные ответы */}
      {correctAnswers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Label style={{ display: "block", marginBottom: 8 }}>
            {correctAnswers.length === 1 ? "Верный ответ" : "Верные ответы"}
          </Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {getCorrectAnswerPaths().map((path, i) => (
              <div 
                key={i} 
                className="flex items-center gap-2 px-3 py-2 bg-success-bg rounded-md text-sm"
              >
                <CheckCircle2 size={18} className="text-foreground" />
                <span className="text-foreground">{path}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Разрешить пропустить */}
      <div className="p-3 bg-muted rounded-lg">
        <ToggleSwitch 
          label="Разрешить пропустить задание" 
          checked={allowSkip} 
          onChange={setAllowSkip} 
        />
        {allowSkip && (
          <div className="ml-14 text-sm text-muted-foreground -mt-1">
            Респонденты могут пропустить этот блок, если у них возникли трудности.
          </div>
        )}
      </div>
    </div>
  );
}

// Компонент Toggle Switch
// Компонент для загрузки изображения
function ImageUploader({ label, image, onImageChange, disabled }: { 
  label: string; 
  image: { file: File | null; url: string }; 
  onImageChange: (img: { file: File | null; url: string }) => void;
  disabled?: boolean;
}) {
  const hasImage = image.file || image.url;
  
  return (
    <div style={{ marginBottom: 16 }} className={cn(disabled && "opacity-60 pointer-events-none")}>
      {hasImage ? (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-input">
          <img 
            src={image.file ? URL.createObjectURL(image.file) : image.url} 
            alt="Preview" 
            className="w-20 h-15 object-cover rounded-md border border-input" 
          />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground mb-1">{image.file?.name || "Загружено"}</div>
            <button 
              type="button"
              onClick={() => onImageChange({ file: null, url: "" })} 
              disabled={disabled}
              className="h-7 px-2.5 text-xs rounded bg-destructive text-destructive-foreground"
            >
              Удалить
            </button>
          </div>
        </div>
      ) : (
        <label className={cn("flex items-center justify-center group", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
          <ImagePlus size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
          <input 
            type="file" 
            accept="image/*" 
            style={{ display: "none" }} 
            disabled={disabled}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                onImageChange({ file, url: "" });
              }
            }} 
          />
        </label>
      )}
    </div>
  );
}

// Компонент Toggle Switch
function ToggleSwitch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      <div className={cn("w-11 h-6 rounded-full relative transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")}>
        <div className={cn("w-5 h-5 rounded-full bg-background absolute top-0.5 transition-all shadow-sm", checked ? "left-[22px]" : "left-0.5")} />
      </div>
      <span style={{ fontSize: 13 }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: "none" }} disabled={disabled} />
    </label>
  );
}
