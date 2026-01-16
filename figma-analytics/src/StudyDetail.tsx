import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
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
  type LucideIcon
} from "lucide-react";

// Все типы блоков
type BlockType = "prototype" | "open_question" | "umux_lite" | "choice" | "context" | "scale" | "preference" | "five_seconds";

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

const BLOCK_TYPES: { value: BlockType; label: string; Icon: LucideIcon }[] = [
  { value: "prototype", label: "Прототип", Icon: Layers },
  { value: "open_question", label: "Открытый вопрос", Icon: MessageSquare },
  { value: "choice", label: "Выбор", Icon: ListChecks },
  { value: "scale", label: "Шкала", Icon: BarChart3 },
  { value: "preference", label: "Предпочтение", Icon: Images },
  { value: "context", label: "Контекст", Icon: FileText },
  { value: "five_seconds", label: "5 секунд", Icon: Timer },
  { value: "umux_lite", label: "UMUX Lite", Icon: ClipboardList },
];

export default function StudyDetail() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const studyId = params.id || null;

  const [study, setStudy] = useState<Study | null>(null);
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddBlockModal, setShowAddBlockModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"builder" | "results" | "share">("builder");
  const [renameTitle, setRenameTitle] = useState("");

  // Форма добавления блока
  const [newBlockType, setNewBlockType] = useState<BlockType>("prototype");
  const [selectedPrototypeId, setSelectedPrototypeId] = useState("");
  const [newBlockInstructions, setNewBlockInstructions] = useState("");
  
  // Открытый вопрос
  const [openQuestionText, setOpenQuestionText] = useState("");
  const [openQuestionOptional, setOpenQuestionOptional] = useState(false);
  const [openQuestionImage, setOpenQuestionImage] = useState<{ file: File | null; url: string }>({ file: null, url: "" });
  
  // Выбор
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
  
  // Контекст
  const [contextTitle, setContextTitle] = useState("");
  const [contextDescription, setContextDescription] = useState("");
  
  // Шкала
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
  
  // Предпочтение
  const [preferenceQuestion, setPreferenceQuestion] = useState("");
  const [preferenceComparisonType, setPreferenceComparisonType] = useState<"all" | "pairwise">("all");
  const [preferenceImages, setPreferenceImages] = useState<Array<{ file: File | null; url: string; uploading: boolean }>>([
    { file: null, url: "", uploading: false },
    { file: null, url: "", uploading: false }
  ]);
  const [preferenceShuffle, setPreferenceShuffle] = useState(false);
  
  // 5 секунд
  const [fiveSecondsInstruction, setFiveSecondsInstruction] = useState("");
  const [fiveSecondsDuration, setFiveSecondsDuration] = useState(5);
  const [fiveSecondsImage, setFiveSecondsImage] = useState<{ file: File | null; url: string; uploading: boolean }>({ file: null, url: "", uploading: false });

  const resetBlockForm = () => {
    setSelectedPrototypeId("");
    setNewBlockInstructions("");
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

  const handleRename = async () => {
    if (!study || !studyId || !renameTitle.trim()) return;

    const { error: updateError } = await supabase
      .from("studies")
      .update({ title: renameTitle.trim() })
      .eq("id", studyId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setShowRenameModal(false);
    setRenameTitle("");
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
    await loadStudy();
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (study?.status !== "draft") return;
    if (!confirm("Удалить этот блок?")) return;

    const { error: deleteError } = await supabase
      .from("study_blocks")
      .delete()
      .eq("id", blockId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await loadStudy();
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

    for (const update of updates) {
      await supabase.from("study_blocks").update({ order_index: update.order_index }).eq("id", update.id);
    }

    setDraggedBlockId(null);
    await loadStudy();
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

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">{study.title}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Создан: {new Date(study.created_at).toLocaleDateString("ru-RU")}
          </p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад
          </Button>
          <Button variant="ghost" onClick={() => { setRenameTitle(study.title); setShowRenameModal(true); }}>
            <Pencil className="h-4 w-4 mr-2" />
            Переименовать
          </Button>
          <Button variant="ghost" onClick={handleDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            Копировать
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Удалить
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {study.status === "draft" && "Тест в режиме черновика. Можно редактировать блоки."}
            {study.status === "published" && "Тест опубликован. Редактирование заблокировано."}
            {study.status === "stopped" && "Тестирование остановлено."}
          </p>
          <div className="flex gap-2">
            {study.status === "draft" && (
              <Button onClick={handlePublish}>
                <Rocket className="h-4 w-4 mr-2" />
                Опубликовать
              </Button>
            )}
            {study.status === "published" && (
              <Button variant="destructive" onClick={handleStop}>
                <StopCircle className="h-4 w-4 mr-2" />
                Остановить
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-6 flex justify-between items-center">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-1 border-b border-border">
          {[
            { key: "builder", label: "Конструктор" },
            { key: "results", label: "Результаты" },
            { key: "share", label: "Поделиться" }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                "px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.key 
                  ? "border-primary text-primary" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Builder Tab */}
      {activeTab === "builder" && (
        <div>
          {isEditable && (
            <div className="mb-4">
              <Button onClick={() => setShowAddBlockModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить блок
              </Button>
            </div>
          )}
          
          {!isEditable && (
            <Card className="mb-4 border-warning/30 bg-warning/5">
              <CardContent className="p-4 text-sm text-warning">
                Редактирование заблокировано.
              </CardContent>
            </Card>
          )}

          {blocks.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-muted-foreground">В этом тесте пока нет блоков.</p>
              {isEditable && (
                <Button className="mt-4" onClick={() => setShowAddBlockModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить первый блок
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {blocks.map((block, index) => {
                const typeInfo = getBlockTypeInfo(block.type);
                const IconComponent = typeInfo.Icon;
                return (
                  <Card
                    key={block.id}
                    draggable={isEditable}
                    onDragStart={() => handleDragStart(block.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(block.id)}
                    className={cn(
                      "transition-all",
                      isEditable && "cursor-move",
                      draggedBlockId === block.id && "opacity-50 border-dashed border-primary"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {isEditable && <GripVertical className="h-4 w-4 text-muted-foreground/50" />}
                            <Badge variant="default" className="gap-1.5">
                              <IconComponent size={12} />
                              {typeInfo.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">#{index + 1}</span>
                            {block.config?.optional && (
                              <span className="text-xs text-muted-foreground italic">(необязательный)</span>
                            )}
                          </div>
                          <p className="text-sm">{getBlockDescription(block)}</p>
                          {block.instructions && (
                            <div className="mt-3 p-3 bg-muted rounded-md text-sm text-muted-foreground">
                              <strong className="text-foreground">Инструкции:</strong> {block.instructions}
                            </div>
                          )}
                        </div>
                        {isEditable && (
                          <div className="flex gap-2 flex-shrink-0">
                            {block.type !== "umux_lite" && (
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  loadBlockForEdit(block);
                                  setShowAddBlockModal(true);
                                }}
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Редактировать
                              </Button>
                            )}
                            <Button 
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteBlock(block.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "results" && studyId && <StudyResultsTab studyId={studyId} blocks={blocks} />}
      {activeTab === "share" && <StudyShareTab studyId={studyId || ""} studyStatus={study.status} shareToken={study.share_token} />}

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
            </div>

          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddBlockModal(false); resetBlockForm(); }}>
              Отмена
            </Button>
            <Button onClick={handleAddBlock}>
              {editingBlockId ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать тест</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-input">Название</Label>
              <Input 
                id="rename-input"
                value={renameTitle} 
                onChange={e => setRenameTitle(e.target.value)} 
                placeholder="Название теста" 
                onKeyDown={e => { if (e.key === "Enter") handleRename(); }} 
                autoFocus 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameModal(false)}>Отмена</Button>
            <Button onClick={handleRename} disabled={!renameTitle.trim()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
