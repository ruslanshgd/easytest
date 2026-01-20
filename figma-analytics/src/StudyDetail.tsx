import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useAppStore } from "./store";
import { isValidUUID } from "./utils/validation";
import StudyResultsTab from "./components/StudyResultsTab";
import StudyShareTab from "./components/StudyShareTab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
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
  type LucideIcon
} from "lucide-react";

// Все типы блоков
type BlockType = "prototype" | "open_question" | "umux_lite" | "choice" | "context" | "scale" | "preference" | "five_seconds" | "card_sorting" | "tree_testing";

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

const BLOCK_TYPES: { value: BlockType; label: string; Icon: LucideIcon }[] = [
  { value: "prototype", label: "Прототип", Icon: Layers },
  { value: "open_question", label: "Открытый вопрос", Icon: MessageSquare },
  { value: "choice", label: "Выбор", Icon: ListChecks },
  { value: "scale", label: "Шкала", Icon: BarChart3 },
  { value: "preference", label: "Предпочтение", Icon: Images },
  { value: "context", label: "Контекст", Icon: FileText },
  { value: "five_seconds", label: "5 секунд", Icon: Timer },
  { value: "card_sorting", label: "Сортировка карточек", Icon: LayoutGrid },
  { value: "tree_testing", label: "Тестирование дерева", Icon: GitBranch },
  { value: "umux_lite", label: "UMUX Lite", Icon: ClipboardList },
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
    resetBlockForm,
  } = useAppStore();

  // Local state for study data (specific to this component instance)
  const [study, setStudy] = useState<Study | null>(null);
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const isSaving = savingCount > 0;
  const titleInputRef = useRef<HTMLInputElement>(null);
  
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

      const { data: prototypesData } = await supabase
        .from("prototypes")
        .select("id, task_description")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setPrototypes(prototypesData || []);
    } catch (err) {
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudy();
  }, [studyId]);

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
      setEditedTitle(study.title);
    }
  }, [study?.title]);

  const handlePublish = async () => {
    if (!study || !studyId) return;
    if (blocks.length === 0) {
      setError("Добавьте хотя бы один блок перед публикацией");
      return;
    }
    if (!confirm("Опубликовать тест? После публикации редактирование блоков будет заблокировано.")) return;

    const { error: updateError } = await supabase
      .from("studies")
      .update({ status: "published" })
      .eq("id", studyId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadStudy();
  };

  const handleStop = async () => {
    if (!study || !studyId) return;
    if (!confirm("Остановить тестирование? Ссылка перестанет работать.")) return;

    const { error: updateError } = await supabase
      .from("studies")
      .update({ status: "stopped" })
      .eq("id", studyId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadStudy();
  };

  const handleDuplicate = async () => {
    if (!study || !studyId) return;
    if (!confirm(`Продублировать тест "${study.title}"?`)) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: newStudy, error: createError } = await supabase
      .from("studies")
      .insert([{ title: `${study.title} (копия)`, user_id: user.id, status: "draft" }])
      .select()
      .single();

    if (createError || !newStudy) {
      setError(createError?.message || "Ошибка создания копии");
      return;
    }

    if (blocks.length > 0) {
      const newBlocks = blocks.map(block => ({
        study_id: newStudy.id,
        type: block.type,
        order_index: block.order_index,
        prototype_id: block.prototype_id,
        instructions: block.instructions,
        config: block.config
      }));
      await supabase.from("study_blocks").insert(newBlocks);
    }

    navigate(`/studies/${newStudy.id}`);
  };

  const handleDelete = async () => {
    if (!study || !studyId) return;
    if (!confirm(`Удалить тест "${study.title}"? Все блоки, прохождения и ответы будут удалены.`)) return;

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

    // При создании нового блока добавляем order_index
    if (!isEditing) {
      const maxOrderIndex = blocks.length > 0 ? Math.max(...blocks.map(b => b.order_index)) : -1;
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
          minLabel: scaleType === "numeric" ? scaleMinLabel.trim() || undefined : undefined,
          maxLabel: scaleType === "numeric" ? scaleMaxLabel.trim() || undefined : undefined,
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

  const handleDeleteBlock = async (blockId: string) => {
    if (study?.status !== "draft") return;
    if (!confirm("Удалить этот блок?")) return;

    // 1. Оптимистично удаляем из локального state
    setBlocks(prevBlocks => {
      const filtered = prevBlocks.filter(b => b.id !== blockId);
      // Пересчитываем order_index
      return filtered.map((b, i) => ({ ...b, order_index: i }));
    });

    // 2. Удаляем из БД в фоне
    incrementSaving();
    try {
      const { error: deleteError } = await supabase
        .from("study_blocks")
        .delete()
        .eq("id", blockId);

      if (deleteError) {
        // При ошибке перезагружаем данные
        await loadStudy();
        setError(deleteError.message);
      }
    } finally {
      decrementSaving();
    }
  };

  // Быстрое добавление блока с дефолтными значениями
  const handleQuickAddBlock = async (blockType: BlockType) => {
    if (!studyId || study?.status !== "draft") return;

    const maxOrderIndex = blocks.length > 0 ? Math.max(...blocks.map(b => b.order_index)) : -1;
    
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
      }
    };

    const blockData: any = {
      study_id: studyId,
      type: blockType,
      order_index: maxOrderIndex + 1,
      config: defaultConfigs[blockType]
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

    const draggedBlock = blocks.find(b => b.id === draggedBlockId);
    const targetBlock = blocks.find(b => b.id === targetBlockId);
    if (!draggedBlock || !targetBlock) {
      setDraggedBlockId(null);
      return;
    }

    const draggedIndex = draggedBlock.order_index;
    const targetIndex = targetBlock.order_index;
    const updates: Array<{ id: string; order_index: number }> = [];

    if (draggedIndex < targetIndex) {
      for (const block of blocks) {
        if (block.id === draggedBlockId) {
          updates.push({ id: block.id, order_index: targetIndex });
        } else if (block.order_index > draggedIndex && block.order_index <= targetIndex) {
          updates.push({ id: block.id, order_index: block.order_index - 1 });
        }
      }
    } else {
      for (const block of blocks) {
        if (block.id === draggedBlockId) {
          updates.push({ id: block.id, order_index: targetIndex });
        } else if (block.order_index >= targetIndex && block.order_index < draggedIndex) {
          updates.push({ id: block.id, order_index: block.order_index + 1 });
        }
      }
    }

    // 1. Оптимистично обновляем локальный state сразу
    setBlocks(prevBlocks => {
      const updatesMap = new Map(updates.map(u => [u.id, u.order_index]));
      return prevBlocks
        .map(b => updatesMap.has(b.id) ? { ...b, order_index: updatesMap.get(b.id)! } : b)
        .sort((a, b) => a.order_index - b.order_index);
    });
    setDraggedBlockId(null);

    // 2. Сохраняем в БД в фоне
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

  const isEditable = study?.status === "draft";

  const containerStyle = { padding: "20px", maxWidth: "1104px", margin: "0 auto" };

  if (loading) {
    return <div style={containerStyle}><h2>Тест</h2><p>Загрузка...</p></div>;
  }

  if (error && !study) {
    return (
      <div style={containerStyle}>
        <h2>Тест</h2>
        <p style={{ color: "red" }}>Ошибка: {error}</p>
        <button onClick={() => navigate(-1)} style={{ marginTop: 16, padding: "8px 16px" }}>
          ← Назад
        </button>
      </div>
    );
  }

  if (!study) {
    return (
      <div style={containerStyle}>
        <h2>Тест</h2>
        <p>Тест не найден</p>
        <button onClick={() => navigate(-1)} style={{ marginTop: 16, padding: "8px 16px" }}>
          ← Назад
        </button>
      </div>
    );
  }

  const statusConfig = {
    draft: { label: "Черновик", variant: "secondary" as const },
    published: { label: "Опубликован", variant: "success" as const },
    stopped: { label: "Остановлен", variant: "secondary" as const }
  };
  const status = statusConfig[study.status];

  // Сохранение нового названия (инлайн редактирование)
  const saveTitle = async () => {
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
      setEditedTitle(study.title);
      setIsEditingTitle(false);
    }
  };

  // Получить краткое название блока для сайдбара
  const getBlockShortName = (block: StudyBlock, index: number): string => {
    switch (block.type) {
      case "prototype":
        const proto = prototypes.find(p => p.id === block.prototype_id);
        return proto?.task_description?.substring(0, 30) || `Прототип`;
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
      case "card_sorting":
        return block.config?.task?.substring(0, 30) || "Сортировка карточек";
      case "tree_testing":
        return block.config?.task?.substring(0, 30) || "Тестирование дерева";
      default:
        return `Блок ${index + 1}`;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Header */}
      <div className="border-b border-border bg-background px-4 py-2">
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
                      setEditedTitle(study.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="h-8 text-base font-medium w-64"
                />
              ) : (
                <h1 
                  className="text-base font-medium cursor-pointer hover:bg-muted px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    setEditedTitle(study.title);
                    setIsEditingTitle(true);
                  }}
                >
                  {study.title}
                </h1>
              )}
              <Badge variant={status.variant}>{status.label}</Badge>
              {isSaving && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  Сохранение...
                </span>
              )}
            </div>
          </div>

          {/* Center: Tabs */}
          <div className="flex gap-1">
            {[
              { key: "builder", label: "Тест" },
              { key: "share", label: "Пригласить респондентов" },
              { key: "results", label: "Отчет" }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                  activeTab === tab.key 
                    ? "bg-primary/10 text-primary" 
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
            {study.status === "draft" && (
              <Button size="sm" onClick={handlePublish}>
                <Rocket className="h-4 w-4 mr-2" />
                Опубликовать
              </Button>
            )}
            {study.status === "published" && (
              <Button variant="destructive" size="sm" onClick={handleStop}>
                <StopCircle className="h-4 w-4 mr-2" />
                Остановить
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
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
        {/* Left Sidebar - Block List */}
        <div className="w-64 border-r border-border bg-muted/30 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {blocks.map((block, index) => {
              const typeInfo = getBlockTypeInfo(block.type);
              const IconComponent = typeInfo.Icon;
              
              return (
                <div
                  key={block.id}
                  draggable={isEditable}
                  onDragStart={() => handleDragStart(block.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(block.id)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-lg transition-all group",
                    "bg-background border border-border hover:border-primary/30",
                    draggedBlockId === block.id && "opacity-50 border-dashed border-primary"
                  )}
                >
                  {isEditable && (
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-move" />
                  )}
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-primary">{index + 1}</span>
                  </div>
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <IconComponent size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {getBlockShortName(block, index)}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {blocks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Нет блоков
              </div>
            )}
          </div>
          
          {/* Add Block Button with Dropdown */}
          {isEditable && (
            <div className="p-3 border-t border-border">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-sm">Добавить блок</span>
                  </Button>
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
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Builder Tab */}
            {activeTab === "builder" && (
              <div className="max-w-3xl mx-auto space-y-4">
                {!isEditable && (
                  <Card className="mb-4 border-warning/30 bg-warning/5">
                    <CardContent className="p-4 text-sm text-warning">
                      Редактирование заблокировано — тест опубликован.
                    </CardContent>
                  </Card>
                )}

                {/* Все блоки с инлайн редактированием */}
                {blocks.map((block, index) => (
                  <InlineBlockEditor
                    key={block.id}
                    block={block}
                    index={index}
                    isEditable={isEditable}
                    prototypes={prototypes}
                    onDelete={() => handleDeleteBlock(block.id)}
                    onUpdateBlock={updateBlockInState}
                    onDragStart={() => handleDragStart(block.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(block.id)}
                    isDragging={draggedBlockId === block.id}
                  />
                ))}

                {/* Пустое состояние */}
                {blocks.length === 0 && (
                  <Card className="p-10 text-center border-dashed">
                    <div className="text-muted-foreground mb-4">
                      В этом тесте пока нет блоков
                    </div>
                    {isEditable && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Добавить первый блок
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-56">
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
                  </Card>
                )}
              </div>
            )}

            {activeTab === "results" && studyId && <StudyResultsTab studyId={studyId} blocks={blocks} />}
            {activeTab === "share" && <StudyShareTab studyId={studyId || ""} studyStatus={study.status} shareToken={study.share_token} />}
          </div>
        </div>
      </div>

      {/* Add Block Modal */}
      <Dialog open={showAddBlockModal} onOpenChange={setShowAddBlockModal}>
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
                      onClick={() => { setNewBlockType(type.value); resetBlockForm(); }}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                        isSelected 
                          ? "border-primary bg-primary/5 text-primary" 
                          : "border-border hover:border-primary/50"
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
              {/* Прототип */}
              {newBlockType === "prototype" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Прототип:</label>
                    {prototypes.length === 0 ? (
                      <div style={{ padding: 12, background: "#fff3e0", color: "#e65100", borderRadius: 4, fontSize: 13 }}>
                        Нет доступных прототипов. Создайте через Figma плагин.
                      </div>
                    ) : (
                      <select value={selectedPrototypeId} onChange={e => setSelectedPrototypeId(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14 }}>
                        <option value="">Выберите прототип</option>
                        {prototypes.map(p => <option key={p.id} value={p.id}>{p.task_description || p.id.substring(0, 8)}</option>)}
                      </select>
                    )}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Инструкции (опционально):</label>
                    <textarea value={newBlockInstructions} onChange={e => setNewBlockInstructions(e.target.value)} placeholder="Введите инструкции" rows={3} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
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
                  />
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Текст вопроса:</label>
                    <textarea value={openQuestionText} onChange={e => setOpenQuestionText(e.target.value)} placeholder="Введите текст вопроса" rows={3} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <ToggleSwitch label="Необязательный вопрос" checked={openQuestionOptional} onChange={setOpenQuestionOptional} />
                </>
              )}

              {/* UMUX Lite */}
              {newBlockType === "umux_lite" && (
                <div style={{ padding: 16, background: "#fff3e0", borderRadius: 8 }}>
                  <div style={{ fontSize: 14, color: "#e65100", marginBottom: 8 }}><strong>📋 UMUX Lite опрос</strong></div>
                  <p style={{ margin: 0, fontSize: 13, color: "#666" }}>Стандартный опрос из 2 вопросов по шкале 1-7.</p>
                </div>
              )}

              {/* Выбор */}
              {newBlockType === "choice" && (
                <>
                  <ImageUploader
                    label="Изображение (опционально)"
                    image={choiceImage}
                    onImageChange={setChoiceImage}
                  />
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Вопрос:</label>
                    <input type="text" value={choiceQuestion} onChange={e => setChoiceQuestion(e.target.value)} placeholder="Введите текст вопроса" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Описание (опционально):</label>
                    <textarea value={choiceDescription} onChange={e => setChoiceDescription(e.target.value)} placeholder="Введите дополнительные детали" rows={2} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Варианты ответа:</label>
                    {choiceOptions.map((opt, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <span style={{ padding: "8px 12px", background: "#f5f5f5", borderRadius: 4, fontSize: 14, fontWeight: 500 }}>{String.fromCharCode(65 + i)}</span>
                        <input type="text" value={opt} onChange={e => { const newOpts = [...choiceOptions]; newOpts[i] = e.target.value; setChoiceOptions(newOpts); }} placeholder="Введите вариант ответа" style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14 }} />
                        {choiceOptions.length > 2 && (
                          <button onClick={() => setChoiceOptions(choiceOptions.filter((_, j) => j !== i))} style={{ padding: "8px 12px", background: "#ffebee", color: "#c62828", border: "none", borderRadius: 4, cursor: "pointer" }}>✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setChoiceOptions([...choiceOptions, ""])} style={{ padding: "8px 16px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
                      + Вариант ответа
                    </button>
                  </div>
                  <div style={{ marginBottom: 8, padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Настройки</div>
                    <ToggleSwitch label="Разрешить выбор нескольких вариантов" checked={choiceAllowMultiple} onChange={setChoiceAllowMultiple} />
                    {choiceAllowMultiple && (
                      <div style={{ marginLeft: 24, marginTop: 8 }}>
                        <ToggleSwitch label="Ограничить количество вариантов" checked={choiceLimitSelections} onChange={setChoiceLimitSelections} />
                        {choiceLimitSelections && (
                          <div style={{ marginTop: 8, marginLeft: 24 }}>
                            <input type="number" min={1} max={choiceOptions.length} value={choiceMaxSelections} onChange={e => setChoiceMaxSelections(parseInt(e.target.value) || 2)} style={{ width: 60, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14 }} />
                          </div>
                        )}
                      </div>
                    )}
                    <ToggleSwitch label="Перемешивать варианты ответа" checked={choiceShuffle} onChange={setChoiceShuffle} />
                    <ToggleSwitch label="Разрешить респондентам ввести свой ответ (опция «Другое»)" checked={choiceAllowOther} onChange={setChoiceAllowOther} />
                    <ToggleSwitch label="Добавить опцию «Ничего из вышеперечисленного»" checked={choiceAllowNone} onChange={setChoiceAllowNone} />
                    {choiceAllowNone && (
                      <div style={{ marginLeft: 24, marginTop: 8 }}>
                        <input type="text" value={choiceNoneText} onChange={e => setChoiceNoneText(e.target.value)} placeholder="Введите название опции" style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13 }} />
                      </div>
                    )}
                    <ToggleSwitch label="Необязательный вопрос" checked={choiceOptional} onChange={setChoiceOptional} />
                  </div>
                </>
              )}

              {/* Контекст */}
              {newBlockType === "context" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Заголовок:</label>
                    <input type="text" value={contextTitle} onChange={e => setContextTitle(e.target.value)} placeholder="Введите заголовок" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Описание (опционально):</label>
                    <textarea value={contextDescription} onChange={e => setContextDescription(e.target.value)} placeholder="Введите описание" rows={4} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ padding: 12, background: "#e3f2fd", borderRadius: 8, fontSize: 13, color: "#1565c0" }}>
                    ℹ️ Блок «Контекст» отображает текст для ознакомления. Не учитывается в аналитике.
                  </div>
                </>
              )}

              {/* Шкала */}
              {newBlockType === "scale" && (
                <>
                  <ImageUploader
                    label="Изображение (опционально)"
                    image={scaleImage}
                    onImageChange={setScaleImage}
                  />
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Вопрос:</label>
                    <input type="text" value={scaleQuestion} onChange={e => setScaleQuestion(e.target.value)} placeholder="Введите текст вопроса" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Описание (опционально):</label>
                    <textarea value={scaleDescription} onChange={e => setScaleDescription(e.target.value)} placeholder="Введите дополнительные детали" rows={2} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Тип шкалы:</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[{ v: "numeric", l: "Числовой" }, { v: "emoji", l: "Эмодзи" }, { v: "stars", l: "Звезды" }].map(t => (
                        <button key={t.v} onClick={() => setScaleType(t.v as any)} style={{ flex: 1, padding: "10px", border: scaleType === t.v ? "2px solid #ff9800" : "1px solid #ddd", borderRadius: 8, background: scaleType === t.v ? "#fff3e0" : "white", cursor: "pointer", fontSize: 13, fontWeight: scaleType === t.v ? 600 : 400 }}>
                          {t.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {scaleType === "numeric" && (
                    <>
                      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>От:</label>
                          <select value={scaleMin} onChange={e => setScaleMin(parseInt(e.target.value))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14 }}>
                            {[0, 1].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>До:</label>
                          <select value={scaleMax} onChange={e => setScaleMax(parseInt(e.target.value))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14 }}>
                            {[3, 4, 5, 6, 7, 8, 9, 10].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Подпись в начале шкалы:</label>
                        <input type="text" value={scaleMinLabel} onChange={e => setScaleMinLabel(e.target.value)} placeholder="Например: Совсем не согласен" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }} />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Подпись в конце шкалы:</label>
                        <input type="text" value={scaleMaxLabel} onChange={e => setScaleMaxLabel(e.target.value)} placeholder="Например: Полностью согласен" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }} />
                      </div>
                    </>
                  )}
                  {scaleType === "emoji" && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Количество эмодзи:</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[3, 5].map(n => (
                          <button key={n} onClick={() => setScaleEmojiCount(n as 3 | 5)} style={{ flex: 1, padding: "10px", border: scaleEmojiCount === n ? "2px solid #ff9800" : "1px solid #ddd", borderRadius: 8, background: scaleEmojiCount === n ? "#fff3e0" : "white", cursor: "pointer", fontSize: 13 }}>
                            {n === 3 ? "😞 😐 😊" : "😠 😞 😐 😊 😄"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {scaleType === "stars" && (
                    <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 8, marginBottom: 16, textAlign: "center" }}>
                      <span style={{ fontSize: 24 }}>⭐⭐⭐⭐⭐</span>
                      <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>От 1 до 5 звезд</div>
                    </div>
                  )}
                  <ToggleSwitch label="Необязательный вопрос" checked={scaleOptional} onChange={setScaleOptional} />
                </>
              )}

              {/* Предпочтение */}
              {newBlockType === "preference" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Вопрос:</label>
                    <input type="text" value={preferenceQuestion} onChange={e => setPreferenceQuestion(e.target.value)} placeholder="Введите текст задания или вопроса" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Тип сравнения:</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setPreferenceComparisonType("all")} style={{ flex: 1, padding: "12px", border: preferenceComparisonType === "all" ? "2px solid #e91e63" : "1px solid #ddd", borderRadius: 8, background: preferenceComparisonType === "all" ? "#fce4ec" : "white", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Выбор из всех</div>
                        <div style={{ fontSize: 12, color: "#666" }}>Показать все изображения одновременно</div>
                      </button>
                      <button onClick={() => setPreferenceComparisonType("pairwise")} style={{ flex: 1, padding: "12px", border: preferenceComparisonType === "pairwise" ? "2px solid #e91e63" : "1px solid #ddd", borderRadius: 8, background: preferenceComparisonType === "pairwise" ? "#fce4ec" : "white", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Попарное сравнение</div>
                        <div style={{ fontSize: 12, color: "#666" }}>Показывать только два изображения за раз</div>
                      </button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Изображения:</label>
                    {preferenceImages.map((img, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                        <span style={{ padding: "8px 12px", background: "#f5f5f5", borderRadius: 4, fontSize: 14, fontWeight: 500, minWidth: 32, textAlign: "center" }}>{String.fromCharCode(65 + i)}</span>
                        <div style={{ flex: 1 }}>
                          {img.url || img.file ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <img src={img.file ? URL.createObjectURL(img.file) : img.url} alt={`Вариант ${String.fromCharCode(65 + i)}`} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd" }} />
                              <span style={{ fontSize: 13, color: "#666", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.file?.name || "Загружено"}</span>
                              <button onClick={() => { const newImgs = [...preferenceImages]; newImgs[i] = { file: null, url: "", uploading: false }; setPreferenceImages(newImgs); }} style={{ padding: "6px 10px", background: "#ffebee", color: "#c62828", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Удалить</button>
                            </div>
                          ) : (
                            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", border: "2px dashed #ddd", borderRadius: 8, cursor: "pointer", background: "#fafafa" }}>
                              <span style={{ fontSize: 13, color: "#666" }}>📷 Выбрать файл</span>
                              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
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
                          <button onClick={() => setPreferenceImages(preferenceImages.filter((_, j) => j !== i))} style={{ padding: "8px 12px", background: "#ffebee", color: "#c62828", border: "none", borderRadius: 4, cursor: "pointer" }}>✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setPreferenceImages([...preferenceImages, { file: null, url: "", uploading: false }])} style={{ padding: "8px 16px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
                      + Добавить изображение
                    </button>
                  </div>
                  {preferenceComparisonType === "all" && (
                    <ToggleSwitch label="Перемешивать варианты ответа" checked={preferenceShuffle} onChange={setPreferenceShuffle} />
                  )}
                </>
              )}

              {/* 5 секунд */}
              {newBlockType === "five_seconds" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Инструкция:</label>
                    <textarea value={fiveSecondsInstruction} onChange={e => setFiveSecondsInstruction(e.target.value)} placeholder="Введите инструкцию для респондента" rows={2} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Изображение:</label>
                    {fiveSecondsImage.url || fiveSecondsImage.file ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img src={fiveSecondsImage.file ? URL.createObjectURL(fiveSecondsImage.file) : fiveSecondsImage.url} alt="Preview" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>{fiveSecondsImage.file?.name || "Загружено"}</div>
                          <button onClick={() => setFiveSecondsImage({ file: null, url: "", uploading: false })} style={{ padding: "6px 12px", background: "#ffebee", color: "#c62828", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Удалить</button>
                        </div>
                      </div>
                    ) : (
                      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", border: "2px dashed #ddd", borderRadius: 8, cursor: "pointer", background: "#fafafa" }}>
                        <span style={{ fontSize: 32, marginBottom: 8 }}>📷</span>
                        <span style={{ fontSize: 14, color: "#666" }}>Выберите изображение</span>
                        <span style={{ fontSize: 12, color: "#999", marginTop: 4 }}>JPEG, PNG, GIF, WebP (до 5MB)</span>
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
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
                    <input type="range" min={5} max={60} value={fiveSecondsDuration} onChange={e => setFiveSecondsDuration(parseInt(e.target.value))} style={{ width: "100%" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999" }}>
                      <span>5 сек</span>
                      <span>60 сек</span>
                    </div>
                  </div>
                </>
              )}

              {/* Сортировка карточек */}
              {newBlockType === "card_sorting" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Задание:</label>
                    <textarea 
                      value={cardSortingTask} 
                      onChange={e => setCardSortingTask(e.target.value)} 
                      placeholder="Например: Представьте, что вы совершаете покупки в интернет-магазине и вам нужно найти какую-то информацию. В этом задании приведён список разделов сайта. Ваша задача — разбить их по категориям так, как вам кажется логичным." 
                      rows={3} 
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} 
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Тип сортировки</label>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button
                        onClick={() => setCardSortingType("closed")}
                        style={{
                          flex: 1,
                          padding: "16px",
                          border: cardSortingType === "closed" ? "2px solid #2383e2" : "1px solid #ddd",
                          borderRadius: 8,
                          background: cardSortingType === "closed" ? "#e3f2fd" : "white",
                          cursor: "pointer",
                          textAlign: "left"
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Закрытая сортировка</div>
                        <div style={{ fontSize: 13, color: "#666" }}>Респонденты группируют карточки в заранее определенные категории.</div>
                      </button>
                      <button
                        onClick={() => setCardSortingType("open")}
                        style={{
                          flex: 1,
                          padding: "16px",
                          border: cardSortingType === "open" ? "2px solid #2383e2" : "1px solid #ddd",
                          borderRadius: 8,
                          background: cardSortingType === "open" ? "#e3f2fd" : "white",
                          cursor: "pointer",
                          textAlign: "left"
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Открытая сортировка</div>
                        <div style={{ fontSize: 13, color: "#666" }}>Респонденты группируют карточки в категории, которые они создают сами; вы можете также добавить заранее определенные категории.</div>
                      </button>
                    </div>
                  </div>

                  {/* Карточки */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Карточки</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 14 }}>{cardSortingCards.filter(c => c.title.trim()).length} карточек</span>
                      <Button variant="outline" size="sm" onClick={() => setShowCardSortingCardsModal(true)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </Button>
                    </div>
                    <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
                      <ToggleSwitch label="Перемешивать карточки" checked={cardSortingShuffleCards} onChange={setCardSortingShuffleCards} />
                      <ToggleSwitch label="Разрешить не сортировать все карточки" checked={cardSortingAllowPartialSort} onChange={setCardSortingAllowPartialSort} />
                      {cardSortingAllowPartialSort && (
                        <div style={{ marginLeft: 56, fontSize: 13, color: "#666", marginTop: -4, marginBottom: 8 }}>
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
                      <Button variant="outline" size="sm" onClick={() => setShowCardSortingCategoriesModal(true)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </Button>
                    </div>
                    <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
                      <ToggleSwitch label="Перемешивать категории" checked={cardSortingShuffleCategories} onChange={setCardSortingShuffleCategories} />
                    </div>
                  </div>

                  {/* Превью */}
                  <div style={{ padding: 16, background: "#e8f5e9", borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 12 }}>Сортировка карточек</div>
                    <div style={{ background: "#c8e6c9", borderRadius: 8, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 16 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} style={{ width: 40, height: 24, background: "#333", borderRadius: 4 }} />
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 12, flex: 1 }}>
                          {[1, 2, 3].map(i => (
                            <div key={i} style={{ width: 80, height: 100, border: "2px dashed #666", borderRadius: 8 }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                      Отсортируйте каждую карточку в категорию, которая вам кажется наиболее подходящей. Перетащите карточки в правую часть страницы, чтобы создать категории.
                    </div>
                    <div style={{ fontSize: 13, color: "#666" }}>
                      Просто делайте то, что кажется вам наиболее подходящим, нет правильных или неправильных ответов.
                    </div>
                  </div>
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
                />
              )}
            </div>

          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddBlockModal(false); resetAllBlockForms(); }}>
              Отмена
            </Button>
            <Button onClick={handleAddBlock}>
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
                            style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }} 
                          />
                          <button 
                            onClick={() => {
                              const newCards = [...cardSortingCards];
                              newCards[i] = { ...newCards[i], imageUrl: "", imageFile: null };
                              setCardSortingCards(newCards);
                            }}
                            style={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: 10, background: "#c62828", color: "white", border: "none", fontSize: 12, cursor: "pointer" }}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <label style={{ width: 64, height: 64, border: "2px dashed #ddd", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#fafafa" }}>
                          <ImageIcon size={20} color="#999" />
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
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, marginBottom: cardSortingShowDescriptions ? 8 : 0, background: "#f7f7f5" }} 
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
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, color: "#666" }} 
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
                    <Trash2 size={18} color="#999" />
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
                    style={{ flex: 1, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, background: "#f7f7f5" }} 
                  />
                  <button 
                    onClick={() => {
                      if (cardSortingCategories.length > 1) {
                        setCardSortingCategories(cardSortingCategories.filter((_, j) => j !== i));
                      }
                    }} 
                    style={{ padding: 8, background: "transparent", border: "none", cursor: cardSortingCategories.length > 1 ? "pointer" : "not-allowed", opacity: cardSortingCategories.length > 1 ? 1 : 0.3 }}
                  >
                    <X size={18} color="#999" />
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
  onDelete: () => void;
  onUpdateBlock: (blockId: string, updates: Partial<StudyBlock>) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
}

function InlineBlockEditor({
  block,
  index,
  isEditable,
  prototypes,
  onDelete,
  onUpdateBlock,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging
}: InlineBlockEditorProps) {
  const typeInfo = BLOCK_TYPES.find(t => t.value === block.type) || BLOCK_TYPES[0];
  const IconComponent = typeInfo.Icon;

  // Локальный state для текстовых полей (для мгновенного отображения)
  const [localText, setLocalText] = useState<Record<string, string>>({});

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
  const updateConfig = (key: string, value: any) => {
    const newConfig = { ...block.config, [key]: value };
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
  }, [block.id]);

  return (
    <Card 
      draggable={isEditable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "transition-all",
        isDragging && "opacity-50 border-dashed border-primary"
      )}
    >
      <CardContent className="p-4">
        {/* Заголовок блока */}
        <div className="flex items-center gap-3 mb-4">
          {isEditable && (
            <div className="cursor-grab active:cursor-grabbing">
              <GripVertical className="h-5 w-5 text-muted-foreground/50 hover:text-muted-foreground" />
            </div>
          )}
          
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary">{index + 1}</span>
            </div>
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <IconComponent size={16} className="text-muted-foreground" />
            </div>
            <span className="font-medium text-sm">{typeInfo.label}</span>
          </div>

          {isEditable && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-destructive hover:text-destructive h-8 w-8 p-0"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Поля редактирования в зависимости от типа */}
        <div className="space-y-3 pl-11">
          {/* Прототип */}
          {block.type === "prototype" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Прототип</Label>
                {prototypes.length === 0 ? (
                  <div className="text-sm text-warning bg-warning/10 p-2 rounded">
                    Нет прототипов. Создайте через Figma плагин.
                  </div>
                ) : (
                  <select 
                    value={block.prototype_id || ""} 
                    onChange={e => updatePrototype(e.target.value)}
                    disabled={!isEditable}
                    className="w-full p-2 text-sm border border-border rounded-md bg-background"
                  >
                    <option value="">Выберите прототип</option>
                    {prototypes.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.task_description || p.id.substring(0, 8)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Инструкции</Label>
                <textarea 
                  value={getInstructionsValue()} 
                  onChange={e => updateInstructions(e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите инструкции для респондента"
                  rows={2}
                  className="w-full p-2 text-sm border border-border rounded-md bg-background resize-none"
                />
              </div>
            </>
          )}

          {/* Открытый вопрос */}
          {block.type === "open_question" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Вопрос</Label>
                <textarea 
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите текст вопроса"
                  rows={2}
                  className="w-full p-2 text-sm border border-border rounded-md bg-background resize-none"
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
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              📋 Стандартный опрос UMUX Lite из 2 вопросов по шкале 1-7
            </div>
          )}

          {/* Выбор */}
          {block.type === "choice" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Вопрос</Label>
                <Input 
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите вопрос"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Варианты ответа</Label>
                <div className="space-y-2">
                  {(block.config.options || []).map((opt: string, i: number) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-5">{String.fromCharCode(65 + i)}.</span>
                      <Input 
                        value={opt} 
                        onChange={e => {
                          const newOpts = [...(block.config.options || [])];
                          newOpts[i] = e.target.value;
                          updateConfig("options", newOpts);
                        }}
                        disabled={!isEditable}
                        className="text-sm flex-1"
                        placeholder="Вариант ответа"
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
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config.allowMultiple || false}
                    onCheckedChange={(checked) => updateConfig("allowMultiple", checked)}
                    disabled={!isEditable}
                  />
                  <span>Несколько ответов</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config.shuffle || false}
                    onCheckedChange={(checked) => updateConfig("shuffle", checked)}
                    disabled={!isEditable}
                  />
                  <span>Перемешивать</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={block.config.optional || false}
                    onCheckedChange={(checked) => updateConfig("optional", checked)}
                    disabled={!isEditable}
                  />
                  <span>Необязательный</span>
                </label>
              </div>
            </>
          )}

          {/* Контекст */}
          {block.type === "context" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Заголовок</Label>
                <Input 
                  value={getTextValue("title")} 
                  onChange={e => updateConfigText("title", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите заголовок"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Описание</Label>
                <textarea 
                  value={getTextValue("description")} 
                  onChange={e => updateConfigText("description", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите описание"
                  rows={3}
                  className="w-full p-2 text-sm border border-border rounded-md bg-background resize-none"
                />
              </div>
            </>
          )}

          {/* Шкала */}
          {block.type === "scale" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Вопрос</Label>
                <Input 
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите вопрос"
                  className="text-sm"
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
                    <Label className="text-xs text-muted-foreground">От:</Label>
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
                    <Label className="text-xs text-muted-foreground">До:</Label>
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
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={block.config.optional || false}
                  onCheckedChange={(checked) => updateConfig("optional", checked)}
                  disabled={!isEditable}
                />
                <span>Необязательный</span>
              </label>
            </>
          )}

          {/* Предпочтение */}
          {block.type === "preference" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Вопрос</Label>
                <Input 
                  value={getTextValue("question")} 
                  onChange={e => updateConfigText("question", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите вопрос"
                  className="text-sm"
                />
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
              <div className="text-xs text-muted-foreground">
                {(block.config.images?.length || 0)} изображений загружено
              </div>
            </>
          )}

          {/* 5 секунд */}
          {block.type === "five_seconds" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Инструкция</Label>
                <textarea 
                  value={getTextValue("instruction")} 
                  onChange={e => updateConfigText("instruction", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите инструкцию"
                  rows={2}
                  className="w-full p-2 text-sm border border-border rounded-md bg-background resize-none"
                />
              </div>
              <div className="flex items-center gap-4">
                <Label className="text-xs text-muted-foreground">Время показа:</Label>
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
              {block.config.imageUrl && (
                <div className="text-xs text-muted-foreground">✓ Изображение загружено</div>
              )}
            </>
          )}

          {/* Сортировка карточек */}
          {block.type === "card_sorting" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Задание</Label>
                <textarea 
                  value={getTextValue("task")} 
                  onChange={e => updateConfigText("task", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите задание"
                  rows={2}
                  className="w-full p-2 text-sm border border-border rounded-md bg-background resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => isEditable && updateConfig("sortingType", "closed")}
                  disabled={!isEditable}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors flex-1",
                    block.config.sortingType === "closed"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  Закрытая
                </button>
                <button
                  onClick={() => isEditable && updateConfig("sortingType", "open")}
                  disabled={!isEditable}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors flex-1",
                    block.config.sortingType === "open"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  Открытая
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {block.config.cards?.length || 0} карточек • {block.config.categories?.length || 0} категорий
              </div>
            </>
          )}

          {/* Тестирование дерева */}
          {block.type === "tree_testing" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Задание</Label>
                <textarea 
                  value={getTextValue("task")} 
                  onChange={e => updateConfigText("task", e.target.value)}
                  disabled={!isEditable}
                  placeholder="Введите задание"
                  rows={2}
                  className="w-full p-2 text-sm border border-border rounded-md bg-background resize-none"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {(() => {
                  const countNodes = (nodes: any[]): number => {
                    if (!nodes) return 0;
                    return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0);
                  };
                  return `${countNodes(block.config.tree || [])} категорий • ${block.config.correctAnswers?.length || 0} верных ответов`;
                })()}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Debounce утилита
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
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
  setExpandedNodes
}: TreeTestingEditorProps) {
  
  // Подсчитать количество узлов с названиями
  const countValidNodes = (nodes: TreeTestingNode[]): number => {
    return nodes.reduce((acc, node) => {
      const selfCount = node.name.trim() ? 1 : 0;
      return acc + selfCount + countValidNodes(node.children);
    }, 0);
  };

  // Обновить узел в дереве
  const updateNode = (nodeId: string, updates: Partial<TreeTestingNode>, nodes: TreeTestingNode[]): TreeTestingNode[] => {
    return nodes.map(node => {
      if (node.id === nodeId) {
        return { ...node, ...updates };
      }
      if (node.children.length > 0) {
        return { ...node, children: updateNode(nodeId, updates, node.children) };
      }
      return node;
    });
  };

  // Добавить дочерний узел
  const addChildNode = (parentId: string, nodes: TreeTestingNode[]): TreeTestingNode[] => {
    return nodes.map(node => {
      if (node.id === parentId) {
        const newChild: TreeTestingNode = { id: crypto.randomUUID(), name: "", children: [] };
        return { ...node, children: [...node.children, newChild] };
      }
      if (node.children.length > 0) {
        return { ...node, children: addChildNode(parentId, node.children) };
      }
      return node;
    });
  };

  // Удалить узел
  const removeNode = (nodeId: string, nodes: TreeTestingNode[]): TreeTestingNode[] => {
    return nodes
      .filter(node => node.id !== nodeId)
      .map(node => ({
        ...node,
        children: removeNode(nodeId, node.children)
      }));
  };

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

  // Рекурсивный рендер узла дерева
  const renderTreeNode = (node: TreeTestingNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isCorrect = correctAnswers.includes(node.id);

    return (
      <div key={node.id} style={{ marginLeft: depth * 24 }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 8, 
          marginBottom: 8,
          padding: "4px 0"
        }}>
          {/* Кнопка развернуть/свернуть */}
          <button
            onClick={() => hasChildren && toggleExpanded(node.id)}
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              cursor: hasChildren ? "pointer" : "default",
              opacity: hasChildren ? 1 : 0.3
            }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
            ) : (
              <span style={{ width: 16 }} />
            )}
          </button>

          {/* Drag handle */}
          <GripVertical size={16} style={{ color: "#999", cursor: "grab" }} />

          {/* Инпут названия */}
          <input
            type="text"
            value={node.name}
            onChange={e => setTree(updateNode(node.id, { name: e.target.value }, tree))}
            placeholder="Название категории"
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              fontSize: 14,
              background: "#f7f7f5"
            }}
          />

          {/* Кнопка "Отметить как верный" */}
          <button
            onClick={() => toggleCorrectAnswer(node.id)}
            title={isCorrect ? "Убрать из верных ответов" : "Отметить как верный"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              background: isCorrect ? "#e8f5e9" : "transparent",
              border: isCorrect ? "1px solid #4caf50" : "1px solid #e0e0e0",
              borderRadius: 6,
              cursor: "pointer",
              color: isCorrect ? "#2e7d32" : "#666",
              fontSize: 13
            }}
          >
            <CheckCircle2 size={16} style={{ color: isCorrect ? "#4caf50" : "#ccc" }} />
            {isCorrect && <span>Верный</span>}
          </button>

          {/* Кнопка добавить подкатегорию */}
          <button
            onClick={() => {
              setTree(addChildNode(node.id, tree));
              // Развернуть родителя
              const newExpanded = new Set(expandedNodes);
              newExpanded.add(node.id);
              setExpandedNodes(newExpanded);
            }}
            title="Добавить подкатегорию"
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              cursor: "pointer"
            }}
          >
            <Plus size={16} color="#666" />
          </button>

          {/* Кнопка удалить */}
          <button
            onClick={() => {
              setTree(removeNode(node.id, tree));
              // Удалить из верных ответов если был
              if (correctAnswers.includes(node.id)) {
                setCorrectAnswers(correctAnswers.filter(id => id !== node.id));
              }
            }}
            title="Удалить категорию"
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer"
            }}
          >
            <Trash2 size={16} color="#999" />
          </button>
        </div>

        {/* Дочерние узлы */}
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

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
      <div style={{ marginBottom: 16 }}>
        <Label style={{ display: "block", marginBottom: 8 }}>Задание</Label>
        <Input
          value={task}
          onChange={e => setTask(e.target.value)}
          placeholder="Где бы вы искали товар?"
        />
      </div>

      {/* Описание */}
      <div style={{ marginBottom: 16 }}>
        <Label style={{ display: "block", marginBottom: 8 }}>Описание</Label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Добавить дополнительный контекст для задания"
          rows={2}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #e0e0e0",
            borderRadius: 6,
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box"
          }}
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
          color: "#666", 
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 4
        }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <span>Клавиатурные сокращения</span>
        </div>
        
        <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          Перетащите элементы, чтобы переупорядочить их. Переместите вправо, чтобы вложить пункт, влево, чтобы вывести на уровень выше.
        </p>

        {/* Дерево узлов */}
        <div style={{ 
          border: "1px solid #e0e0e0", 
          borderRadius: 8, 
          padding: 16,
          background: "#fafafa",
          maxHeight: 400,
          overflowY: "auto"
        }}>
          {tree.map(node => renderTreeNode(node))}
          
          {/* Кнопка добавить категорию */}
          <button
            onClick={addRootNode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              marginTop: 8,
              background: "white",
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14
            }}
          >
            <Plus size={16} />
            Добавить категорию
          </button>
        </div>
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
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 8,
                  padding: "8px 12px",
                  background: "#e8f5e9",
                  borderRadius: 6,
                  fontSize: 14
                }}
              >
                <CheckCircle2 size={18} style={{ color: "#4caf50" }} />
                <span>{path}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Разрешить пропустить */}
      <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
        <ToggleSwitch 
          label="Разрешить пропустить задание" 
          checked={allowSkip} 
          onChange={setAllowSkip} 
        />
        {allowSkip && (
          <div style={{ marginLeft: 56, fontSize: 13, color: "#666", marginTop: -4 }}>
            Респонденты могут пропустить этот блок, если у них возникли трудности.
          </div>
        )}
      </div>
    </>
  );
}

// Компонент Toggle Switch
// Компонент для загрузки изображения
function ImageUploader({ label, image, onImageChange }: { 
  label: string; 
  image: { file: File | null; url: string }; 
  onImageChange: (img: { file: File | null; url: string }) => void 
}) {
  const hasImage = image.file || image.url;
  
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>{label}</label>
      {hasImage ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "#f9f9f9", borderRadius: 8, border: "1px solid #e0e0e0" }}>
          <img 
            src={image.file ? URL.createObjectURL(image.file) : image.url} 
            alt="Preview" 
            style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid #ddd" }} 
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>{image.file?.name || "Загружено"}</div>
            <button 
              onClick={() => onImageChange({ file: null, url: "" })} 
              style={{ padding: "4px 10px", background: "#ffebee", color: "#c62828", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            >
              Удалить
            </button>
          </div>
        </div>
      ) : (
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", border: "2px dashed #ddd", borderRadius: 8, cursor: "pointer", background: "#fafafa", transition: "border-color 0.2s" }}>
          <span style={{ fontSize: 13, color: "#666" }}>📷 Выбрать изображение</span>
          <input 
            type="file" 
            accept="image/*" 
            style={{ display: "none" }} 
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
function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, cursor: "pointer" }}>
      <div style={{ width: 44, height: 24, borderRadius: 12, background: checked ? "#2196f3" : "#ccc", position: "relative", transition: "background 0.2s" }}>
        <div style={{ width: 20, height: 20, borderRadius: 10, background: "white", position: "absolute", top: 2, left: checked ? 22 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
      </div>
      <span style={{ fontSize: 13 }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: "none" }} />
    </label>
  );
}
