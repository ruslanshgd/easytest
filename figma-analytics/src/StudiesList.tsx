import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useAppStore } from "./store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FormTextarea } from "@/components/forms/FormTextarea";
import { FormSelect } from "@/components/forms/FormSelect";
import { FormField } from "@/components/forms/FormField";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  FolderPlus, 
  Plus, 
  Folder, 
  FolderOpen, 
  MoreHorizontal, 
  Pencil, 
  Copy, 
  FolderInput, 
  Trash2,
  ChevronRight,
  GripVertical,
  Layers,
  MessageSquare,
  ListChecks,
  BarChart3,
  Images,
  FileText,
  Timer,
  ClipboardList,
  Users,
  Check,
  MousePointerClick,
  LayoutGrid,
  GitBranch,
  Table,
  ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

// Block type icons mapping (must match block types in constructor; see lib/block-icons.tsx)
const BLOCK_ICONS: Record<string, React.ElementType> = {
  prototype: Layers,
  open_question: MessageSquare,
  choice: ListChecks,
  scale: BarChart3,
  preference: Images,
  context: FileText,
  five_seconds: Timer,
  umux_lite: ClipboardList,
  first_click: MousePointerClick,
  card_sorting: LayoutGrid,
  tree_testing: GitBranch,
  matrix: Table,
  agreement: ShieldCheck,
};

const BLOCK_COLORS: Record<string, string> = {
  prototype: "bg-blue-100 text-blue-600",
  open_question: "bg-yellow-100 text-yellow-600",
  choice: "bg-green-100 text-green-600",
  scale: "bg-orange-100 text-orange-600",
  preference: "bg-pink-100 text-pink-600",
  context: "bg-gray-100 text-gray-600",
  five_seconds: "bg-red-100 text-red-600",
  umux_lite: "bg-purple-100 text-purple-600",
  first_click: "bg-teal-100 text-teal-600",
  card_sorting: "bg-indigo-100 text-indigo-600",
  tree_testing: "bg-amber-100 text-amber-600",
  matrix: "bg-cyan-100 text-cyan-600",
  agreement: "bg-emerald-100 text-emerald-600",
};

interface Study {
  id: string;
  title: string;
  status: "draft" | "published" | "stopped";
  folder_id: string | null;
  share_token: string | null;
  created_at: string;
}

interface FolderType {
  id: string;
  name: string;
  team_id: string;
  parent_id: string | null;
  created_at: string;
}

interface FolderWithCount extends FolderType {
  studiesCount: number;
  subFoldersCount: number;
}

interface StudyBlock {
  id: string;
  study_id: string;
  type: string;
  order_index: number;
  deleted_at?: string | null;
}

interface StudyStats {
  blocks: StudyBlock[];
  sessionsCount: number;
}

export default function StudiesList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolderId = searchParams.get("folder");
  
  // Store selectors
  const {
    // Studies state
    studies,
    folders,
    currentFolderFolders,
    breadcrumbs,
    studiesLoading,
    studyStats,
    // UI state
    error,
    showCreateStudyModal,
    showCreateFolderModal,
    showRenameModal,
    showRenameFolderModal,
    showMoveModal,
    showMoveFolderModal,
    showDeleteDialog,
    showDeleteFolderDialog,
    showBulkMoveModal,
    showBulkDeleteDialog,
    newStudyTitle,
    newStudyDescription,
    newStudyType,
    newFolderName,
    renameTitle,
    renameFolderName,
    selectedStudies,
    draggedItem,
    dropTargetId,
    isDropTargetRoot,
    // Actions
    setError,
    clearError,
    loadAllData,
    getUserTeamId,
    buildBreadcrumbs,
    // Modal actions
    openCreateStudyModal,
    closeCreateStudyModal,
    openCreateFolderModal,
    closeCreateFolderModal,
    openRenameModal,
    closeRenameModal,
    openRenameFolderModal,
    closeRenameFolderModal,
    openMoveModal,
    closeMoveModal,
    openMoveFolderModal,
    closeMoveFolderModal,
    openDeleteDialog,
    closeDeleteDialog,
    openDeleteFolderDialog,
    closeDeleteFolderDialog,
    openBulkMoveModal,
    closeBulkMoveModal,
    openBulkDeleteDialog,
    closeBulkDeleteDialog,
    // Form actions
    setNewStudyTitle,
    setNewStudyDescription,
    setNewStudyType,
    setNewFolderName,
    setRenameTitle,
    setRenameFolderName,
    // Selection actions
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    // Drag and drop actions
    setDraggedItem,
    setDropTargetId,
    setIsDropTargetRoot,
    resetDragState,
  } = useAppStore();

  // Ref для предотвращения повторных вызовов
  const loadingRef = useRef(false);
  const lastFolderIdRef = useRef<string | null | undefined>(undefined);

  // Template modal (e.g. "prototype_testing")
  const [templateModalId, setTemplateModalId] = useState<string | null>(null);
  
  useEffect(() => {
    // Пропускаем, если folderId не изменился (кроме первого рендера)
    if (lastFolderIdRef.current !== undefined && lastFolderIdRef.current === currentFolderId) {
      console.log('StudiesList: useEffect skipped - folderId unchanged', { currentFolderId });
      return;
    }
    
    // Пропускаем, если уже загружаем
    if (loadingRef.current) {
      console.log('StudiesList: useEffect skipped - already loading');
      return;
    }
    
    console.log('StudiesList: useEffect running loadAllData', { currentFolderId });
    lastFolderIdRef.current = currentFolderId;
    loadingRef.current = true;
    
    loadAllData(currentFolderId).finally(() => {
      loadingRef.current = false;
    });
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]); // Functions from store are stable, don't need to be in deps

  // Navigation
  const navigateToFolder = (folderId: string | null) => {
    if (folderId) {
      setSearchParams({ folder: folderId });
    } else {
      setSearchParams({});
    }
  };

  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setError("Название папки не может быть пустым");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }

      const teamId = await getUserTeamId(user.id);
      if (!teamId) {
        setError("Вы должны быть в команде для создания папок");
        return;
      }

      const { error: createError } = await supabase
        .from("folders")
        .insert([{
          name: newFolderName.trim(),
          team_id: teamId,
          parent_id: currentFolderId || null
        }]);

      if (createError) {
        console.error("Error creating folder:", createError);
        setError(createError.message);
        return;
      }

      closeCreateFolderModal();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error creating folder:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Create study with default title "Новый тест" (no modal)
  const handleCreateStudyNoModal = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }
      const teamId = await getUserTeamId(user.id);
      const { data, error: createError } = await supabase
        .from("studies")
        .insert([{
          title: "Новый тест",
          user_id: teamId ? null : user.id,
          team_id: teamId || null,
          folder_id: currentFolderId || null,
          status: "draft"
        }])
        .select()
        .single();
      if (createError) {
        setError(createError.message);
        return;
      }
      if (data) navigate(`/studies/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Create study from modal form
  const handleCreateStudy = async () => {
    if (!newStudyTitle.trim()) {
      setError("Название исследования не может быть пустым");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }

      const teamId = await getUserTeamId(user.id);
      
      // Prepare study data
      const studyData: {
        title: string;
        user_id: string | null;
        team_id: string | null;
        folder_id: string | null;
        status: string;
        description?: string;
        type?: string;
      } = {
        title: newStudyTitle.trim(),
        user_id: teamId ? null : user.id,
        team_id: teamId || null,
        folder_id: currentFolderId || null,
        status: "draft"
      };

      // Add optional fields if provided
      if (newStudyDescription.trim()) {
        studyData.description = newStudyDescription.trim();
      }
      if (newStudyType.trim()) {
        studyData.type = newStudyType.trim();
      }

      const { data, error: createError } = await supabase
        .from("studies")
        .insert([studyData])
        .select()
        .single();

      if (createError) {
        setError(createError.message);
        return;
      }

      if (data) {
        closeCreateStudyModal();
        navigate(`/studies/${data.id}`);
      }
    } catch (err) {
      console.error("Unexpected error creating study:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const PLACEHOLDER_IMAGE_DATA_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23e5e7eb' width='400' height='300'/%3E%3Ctext fill='%239ca3af' x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='14'%3EДобавьте своё изображение%3C/text%3E%3C/svg%3E";

  // Create study from template "Тестирование прототипа"
  const handleUseTemplatePrototypeTesting = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }
      const teamId = await getUserTeamId(user.id);

      const { data: prototypesData } = await supabase
        .from("prototypes")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const firstPrototypeId = prototypesData?.[0]?.id ?? null;

      const { data: studyData, error: createError } = await supabase
        .from("studies")
        .insert([{
          title: "Тестирование прототипа",
          user_id: teamId ? null : user.id,
          team_id: teamId || null,
          folder_id: currentFolderId || null,
          status: "draft"
        }])
        .select()
        .single();

      if (createError || !studyData) {
        setError(createError?.message ?? "Ошибка создания теста");
        return;
      }

      const contextText = "Спасибо, что хотите поделиться с нами своими мыслями. Здесь нет правильных или неправильных ответов — просто оставайтесь собой и делитесь тем, что приходит в голову. Мы очень ценим ваш вклад!";
      const prototypeInstructions = "Найдите в прототипе нужный раздел и выполните предложенное задание. Опишите своими словами, как вы это сделали.";
      const blocks: Array<{ study_id: string; type: string; order_index: number; prototype_id?: string | null; instructions?: string | null; config: object }> = [
        { study_id: studyData.id, type: "context", order_index: 0, config: { title: "Привет 👋", description: contextText } },
        { study_id: studyData.id, type: "prototype", order_index: 1, prototype_id: firstPrototypeId, instructions: prototypeInstructions, config: {} },
        { study_id: studyData.id, type: "scale", order_index: 2, config: { question: "Насколько сложно было выполнить это задание?", scaleType: "numeric", min: 1, max: 5, minValue: 1, maxValue: 5 } },
        { study_id: studyData.id, type: "open_question", order_index: 3, config: { question: "Поделитесь, что было сложным при выполнении задания?", optional: false } }
      ];

      const { error: blocksError } = await supabase.from("study_blocks").insert(blocks);
      if (blocksError) {
        setError(blocksError.message);
        return;
      }

      setTemplateModalId(null);
      navigate(`/studies/${studyData.id}`);
    } catch (err) {
      console.error("Unexpected error using template:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Create study from template "Тест первого клика"
  const handleUseTemplateFirstClick = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }
      const teamId = await getUserTeamId(user.id);

      const { data: studyData, error: createError } = await supabase
        .from("studies")
        .insert([{
          title: "Тест первого клика",
          user_id: teamId ? null : user.id,
          team_id: teamId || null,
          folder_id: currentFolderId || null,
          status: "draft"
        }])
        .select()
        .single();

      if (createError || !studyData) {
        setError(createError?.message ?? "Ошибка создания теста");
        return;
      }

      const contextDescription = "Спасибо, что хотите поделиться с нами своими мыслями. Здесь нет правильных или неправильных ответов — просто оставайтесь собой и делитесь тем, что приходит в голову. Мы очень ценим ваш вклад!";
      const firstClickInstruction = "Найдите на изображении нужный элемент и нажмите на него. Ваш первый клик будет зафиксирован.";
      const blocks: Array<{ study_id: string; type: string; order_index: number; config: object }> = [
        { study_id: studyData.id, type: "context", order_index: 0, config: { title: "Привет 👋", description: contextDescription } },
        { study_id: studyData.id, type: "first_click", order_index: 1, config: { instruction: firstClickInstruction, imageUrl: PLACEHOLDER_IMAGE_DATA_URI } },
        { study_id: studyData.id, type: "scale", order_index: 2, config: { question: "Насколько сложно было найти, где посмотреть последние транзакции?", scaleType: "numeric", min: 1, max: 5, minValue: 1, maxValue: 5 } },
        { study_id: studyData.id, type: "open_question", order_index: 3, config: { question: "Что именно было сложным или показалось непонятным?", optional: false } }
      ];

      const { data: insertedBlocks, error: blocksError } = await supabase.from("study_blocks").insert(blocks).select("id, order_index");
      if (blocksError || !insertedBlocks || insertedBlocks.length !== 4) {
        setError(blocksError?.message ?? "Ошибка создания блоков");
        return;
      }

      const byOrder = (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index;
      const sorted = [...insertedBlocks].sort(byOrder);
      const scaleBlockId = sorted[2].id;
      const openQuestionBlockId = sorted[3].id;
      const openQuestionConfig = blocks[3].config as Record<string, unknown>;

      const { error: updateLogicError } = await supabase
        .from("study_blocks")
        .update({
          config: {
            ...openQuestionConfig,
            logic: {
              showOnCondition: {
                enabled: true,
                action: "show",
                conditions: [{ blockId: scaleBlockId, operator: "less_than" as const, value: "5" }]
              },
              conditionalLogic: { rules: [], elseGoToBlockId: "__end__" }
            }
          }
        })
        .eq("id", openQuestionBlockId);
      if (updateLogicError) {
        setError(updateLogicError.message);
        return;
      }

      setTemplateModalId(null);
      navigate(`/studies/${studyData.id}`);
    } catch (err) {
      console.error("Unexpected error using template:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Create study from template "Улучшение навигации"
  const handleUseTemplateNavigationImprovement = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }
      const teamId = await getUserTeamId(user.id);

      const { data: studyData, error: createError } = await supabase
        .from("studies")
        .insert([{
          title: "Улучшение навигации",
          user_id: teamId ? null : user.id,
          team_id: teamId || null,
          folder_id: currentFolderId || null,
          status: "draft"
        }])
        .select()
        .single();

      if (createError || !studyData) {
        setError(createError?.message ?? "Ошибка создания теста");
        return;
      }

      const contextDescription = "Спасибо, что хотите поделиться с нами своими мыслями. Здесь нет правильных или неправильных ответов — просто оставайтесь собой и делитесь тем, что приходит в голову. Мы очень ценим ваш вклад!";
      const cardSortingTask = "Представьте, что вы совершаете покупки в интернет-магазине и вам нужно найти какую-то информацию. В этом задании приведён список разделов сайта. Ваша задача — разбить их по категориям так, как вам кажется логичным.\n\nЕсли нужной категории нет — можно создать свою.";
      const cardTitles = ["главная", "Все товары", "новинки", "хиты продаж", "одежда", "обувь", "аксессуары", "служба поддержки", "часто задаваемые вопросы", "возвраты и обмены", "отслеживание заказа", "поиск магазинов", "о нас", "связаться с нами"];
      const categoryNames = ["Каталог", "помощь и поддержка", "информация о компании", "скидки акций"];
      const cards = cardTitles.map((title) => ({ id: crypto.randomUUID(), title }));
      const categories = categoryNames.map((name) => ({ id: crypto.randomUUID(), name }));

      const blocks: Array<{ study_id: string; type: string; order_index: number; config: object }> = [
        { study_id: studyData.id, type: "context", order_index: 0, config: { title: "Привет 👋", description: contextDescription } },
        {
          study_id: studyData.id,
          type: "card_sorting",
          order_index: 1,
          config: {
            task: cardSortingTask,
            sortingType: "open",
            cards,
            categories,
            shuffleCards: true,
            shuffleCategories: true,
            allowPartialSort: false,
            showImages: false,
            showDescriptions: false
          }
        }
      ];

      const { error: blocksError } = await supabase.from("study_blocks").insert(blocks);
      if (blocksError) {
        setError(blocksError.message);
        return;
      }

      setTemplateModalId(null);
      navigate(`/studies/${studyData.id}`);
    } catch (err) {
      console.error("Unexpected error using template:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Create study from template "Проверка маркетинговых текстов"
  const handleUseTemplateMarketingCopy = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }
      const teamId = await getUserTeamId(user.id);

      const { data: studyData, error: createError } = await supabase
        .from("studies")
        .insert([{
          title: "Проверка маркетинговых текстов",
          user_id: teamId ? null : user.id,
          team_id: teamId || null,
          folder_id: currentFolderId || null,
          status: "draft"
        }])
        .select()
        .single();

      if (createError || !studyData) {
        setError(createError?.message ?? "Ошибка создания теста");
        return;
      }

      const contextDescription = "Спасибо, что хотите поделиться с нами своими мыслями. Здесь нет правильных или неправильных ответов — просто оставайтесь собой и делитесь тем, что приходит в голову. Мы очень ценим ваш вклад!";
      const fiveSecondsInstruction = "Сейчас мы покажем фрагмент лендинга банка на короткое время. Постарайтесь запомнить как можно больше деталей.";
      const matrixRows = [
        { id: crypto.randomUUID(), title: "Этот банк ориентирован на продукты для бизнеса" },
        { id: crypto.randomUUID(), title: "Страница визуально привлекательна" },
        { id: crypto.randomUUID(), title: "Этот банк подходит для тех, кто ведет активный образ жизни" },
      ];
      const matrixColumns = [
        { id: crypto.randomUUID(), title: "Полностью не согласен(а)" },
        { id: crypto.randomUUID(), title: "Не согласен(а)" },
        { id: crypto.randomUUID(), title: "Нейтрально(а)" },
        { id: crypto.randomUUID(), title: "Согласен(а)" },
        { id: crypto.randomUUID(), title: "Полностью согласен(а)" },
      ];
      const blocks: Array<{ study_id: string; type: string; order_index: number; config: object }> = [
        { study_id: studyData.id, type: "context", order_index: 0, config: { title: "Привет 👋", description: contextDescription } },
        { study_id: studyData.id, type: "five_seconds", order_index: 1, config: { instruction: fiveSecondsInstruction, duration: 5, imageUrl: PLACEHOLDER_IMAGE_DATA_URI } },
        { study_id: studyData.id, type: "open_question", order_index: 2, config: { question: "Какое у вас первое впечатление об этой странице банковского приложения?", optional: false } },
        {
          study_id: studyData.id,
          type: "matrix",
          order_index: 3,
          config: {
            question: "Оцените, насколько вы согласны или не согласны со следующими утверждениями об этом банке",
            description: "",
            imageUrl: undefined,
            rows: matrixRows,
            columns: matrixColumns,
            shuffleRows: false,
            shuffleColumns: false,
            allowMultiple: false,
            optional: false,
          },
        },
      ];

      const { error: blocksError } = await supabase.from("study_blocks").insert(blocks);
      if (blocksError) {
        setError(blocksError.message);
        return;
      }

      setTemplateModalId(null);
      navigate(`/studies/${studyData.id}`);
    } catch (err) {
      console.error("Unexpected error using template:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Create study from template "Продуктовый опрос"
  const handleUseTemplateProductSurvey = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }
      const teamId = await getUserTeamId(user.id);

      const { data: studyData, error: createError } = await supabase
        .from("studies")
        .insert([{
          title: "Продуктовый опрос",
          user_id: teamId ? null : user.id,
          team_id: teamId || null,
          folder_id: currentFolderId || null,
          status: "draft"
        }])
        .select()
        .single();

      if (createError || !studyData) {
        setError(createError?.message ?? "Ошибка создания теста");
        return;
      }

      const contextDescription = "Спасибо, что хотите поделиться с нами своими мыслями о нашем фитнес приложении. Здесь нет правильных или неправильных ответов — просто оставайтесь собой и делитесь тем, что приходит в голову. Мы очень ценим ваш вклад!";
      const blocks: Array<{ study_id: string; type: string; order_index: number; config: object }> = [
        { study_id: studyData.id, type: "context", order_index: 0, config: { title: "Привет 👋", description: contextDescription } },
        { study_id: studyData.id, type: "choice", order_index: 1, config: { question: "Как часто вы пользуетесь приложением?", options: ["Ежедневно", "Несколько раз в неделю", "Раз в неделю", "Реже", "Очень редко"], allowMultiple: false, shuffle: false, allowOther: false, allowNone: false, optional: false } },
        { study_id: studyData.id, type: "open_question", order_index: 2, config: { question: "Можете рассказать, почему вы не пользуетесь приложением чаще?", optional: false } },
        { study_id: studyData.id, type: "choice", order_index: 3, config: { question: "Для чего вы пользуетесь приложением чаще всего?", options: ["Тренировки", "Отслеживание прогресса", "Питание", "Сообщество"], allowMultiple: false, shuffle: false, allowOther: false, allowNone: false, optional: false } },
        { study_id: studyData.id, type: "choice", order_index: 4, config: { question: "Какая функция для вас наиболее полезна?", options: ["Планы тренировок", "Счётчик шагов", "Подсчёт калорий", "Интеграция с другими устройствами"], allowMultiple: false, shuffle: false, allowOther: false, allowNone: false, optional: false } },
        { study_id: studyData.id, type: "scale", order_index: 5, config: { question: "Насколько легко пользоваться приложением?", scaleType: "stars", min: 1, max: 5, optional: false } },
        { study_id: studyData.id, type: "open_question", order_index: 6, config: { question: "Расскажите, как мы можем сделать приложение удобнее для вас? Поделитесь своими идеями", optional: false } }
      ];

      const { data: insertedBlocks, error: blocksError } = await supabase.from("study_blocks").insert(blocks).select("id, order_index");
      if (blocksError || !insertedBlocks || insertedBlocks.length !== 7) {
        setError(blocksError?.message ?? "Ошибка создания блоков");
        return;
      }

      const byOrder = (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index;
      const sorted = [...insertedBlocks].sort(byOrder);
      const choiceHowOftenId = sorted[1].id;
      const scaleEasyId = sorted[5].id;
      const openWhyNotId = sorted[2].id;
      const openIdeasId = sorted[6].id;

      const block2Config = blocks[2].config as Record<string, unknown>;
      const block6Config = blocks[6].config as Record<string, unknown>;

      const { error: update2Error } = await supabase
        .from("study_blocks")
        .update({
          config: {
            ...block2Config,
            logic: {
              showOnCondition: {
                enabled: true,
                action: "show",
                conditions: [{ blockId: choiceHowOftenId, operator: "contains" as const, value: "Очень редко" }]
              },
              conditionalLogic: { rules: [], elseGoToBlockId: "__next__" }
            }
          }
        })
        .eq("id", openWhyNotId);
      if (update2Error) {
        setError(update2Error.message);
        return;
      }

      const { error: update6Error } = await supabase
        .from("study_blocks")
        .update({
          config: {
            ...block6Config,
            logic: {
              showOnCondition: {
                enabled: true,
                action: "show",
                conditions: [{ blockId: scaleEasyId, operator: "less_than" as const, value: "5" }]
              },
              conditionalLogic: { rules: [], elseGoToBlockId: "__end__" }
            }
          }
        })
        .eq("id", openIdeasId);
      if (update6Error) {
        setError(update6Error.message);
        return;
      }

      setTemplateModalId(null);
      navigate(`/studies/${studyData.id}`);
    } catch (err) {
      console.error("Unexpected error using template:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Rename folder
  const handleRenameFolder = async (folderId: string) => {
    if (!renameFolderName.trim()) return;

    try {
      const { error: updateError } = await supabase
        .from("folders")
        .update({ name: renameFolderName.trim() })
        .eq("id", folderId);

      if (updateError) {
        console.error("Error renaming folder:", updateError);
        setError(updateError.message);
        return;
      }

      closeRenameFolderModal();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error renaming folder:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Check if folder is descendant of another
  const isDescendantOf = (folderId: string, ancestorId: string): boolean => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return false;
    if (folder.parent_id === ancestorId) return true;
    if (folder.parent_id) return isDescendantOf(folder.parent_id, ancestorId);
    return false;
  };

  // Move folder
  const handleMoveFolder = async (folderId: string, newParentId: string | null) => {
    if (newParentId === folderId) {
      setError("Нельзя переместить папку в саму себя");
      return;
    }
    
    if (newParentId && isDescendantOf(newParentId, folderId)) {
      setError("Нельзя переместить папку в её дочернюю папку");
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from("folders")
        .update({ parent_id: newParentId })
        .eq("id", folderId);

      if (updateError) {
        console.error("Error moving folder:", updateError);
        setError(updateError.message);
        return;
      }

      closeMoveFolderModal();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error moving folder:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Delete folder
  const handleDeleteFolder = async (folder: FolderWithCount) => {
    try {
      await supabase
        .from("studies")
        .update({ folder_id: folder.parent_id })
        .eq("folder_id", folder.id);

      await supabase
        .from("folders")
        .update({ parent_id: folder.parent_id })
        .eq("parent_id", folder.id);

      const { error: deleteError } = await supabase
        .from("folders")
        .delete()
        .eq("id", folder.id);

      if (deleteError) {
        console.error("Error deleting folder:", deleteError);
        setError(`Ошибка удаления: ${deleteError.message}`);
        return;
      }

      if (currentFolderId === folder.id) {
        navigateToFolder(folder.parent_id);
      }

      closeDeleteFolderDialog();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error deleting folder:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Rename study
  const handleRename = async (studyId: string) => {
    if (!renameTitle.trim()) return;

    try {
      const { error: updateError } = await supabase
        .from("studies")
        .update({ title: renameTitle.trim() })
        .eq("id", studyId);

      if (updateError) {
        console.error("Error renaming study:", updateError);
        setError(updateError.message);
        return;
      }

      closeRenameModal();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error renaming study:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Move study
  const handleMoveStudy = async (studyId: string, folderId: string | null) => {
    try {
      const { error: updateError } = await supabase
        .from("studies")
        .update({ folder_id: folderId })
        .eq("id", studyId);

      if (updateError) {
        console.error("Error moving study:", updateError);
        setError(updateError.message);
        return;
      }

      closeMoveModal();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error moving study:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Bulk move
  const handleBulkMove = async (folderId: string | null) => {
    if (selectedStudies.size === 0) return;

    try {
      const { error: updateError } = await supabase
        .from("studies")
        .update({ folder_id: folderId })
        .in("id", Array.from(selectedStudies));

      if (updateError) {
        console.error("Error moving studies:", updateError);
        setError(updateError.message);
        return;
      }

      closeBulkMoveModal();
      clearSelection();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error moving studies:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedStudies.size === 0) return;

    try {
      const { error: deleteError } = await supabase
        .from("studies")
        .delete()
        .in("id", Array.from(selectedStudies));

      if (deleteError) {
        console.error("Error deleting studies:", deleteError);
        setError(`Ошибка удаления: ${deleteError.message}`);
        return;
      }

      closeBulkDeleteDialog();
      clearSelection();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error deleting studies:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Duplicate study
  const handleDuplicate = async (study: Study) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        return;
      }

      const { data: blocksData } = await supabase
        .from("study_blocks")
        .select("*")
        .eq("study_id", study.id)
        .order("order_index", { ascending: true });

      const teamId = await getUserTeamId(user.id);

      const { data: newStudy, error: createError } = await supabase
        .from("studies")
        .insert([{
          title: `${study.title} (копия)`,
          user_id: teamId ? null : user.id,
          team_id: teamId || null,
          folder_id: study.folder_id,
          status: "draft"
        }])
        .select()
        .single();

      if (createError || !newStudy) {
        console.error("Error duplicating study:", createError);
        setError(createError?.message || "Ошибка создания копии");
        return;
      }

      if (blocksData && blocksData.length > 0) {
        const newBlocks = blocksData.map(block => ({
          study_id: newStudy.id,
          type: block.type,
          order_index: block.order_index,
          prototype_id: block.prototype_id,
          instructions: block.instructions,
          config: block.config
        }));

        await supabase.from("study_blocks").insert(newBlocks);
      }

      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error duplicating study:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Delete study
  const handleDelete = async (study: Study) => {
    try {
      const { error: deleteError } = await supabase
        .from("studies")
        .delete()
        .eq("id", study.id);

      if (deleteError) {
        console.error("Error deleting study:", deleteError);
        setError(`Ошибка удаления: ${deleteError.message}`);
        return;
      }

      closeDeleteDialog();
      await loadAllData(currentFolderId);
    } catch (err) {
      console.error("Unexpected error deleting study:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Select all handler
  const handleToggleSelectAll = () => {
    toggleSelectAll(studies.map(s => s.id));
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, type: "study" | "folder", id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ type, id }));
  };

  const handleDragEnd = () => {
    resetDragState();
  };

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem) return;
    
    if (draggedItem.type === "folder") {
      if (draggedItem.id === folderId || isDescendantOf(folderId, draggedItem.id)) {
        e.dataTransfer.dropEffect = "none";
        return;
      }
    }
    
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(folderId);
    setIsDropTargetRoot(false);
  };

  const handleDragOverRoot = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem) return;
    
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(null);
    setIsDropTargetRoot(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTargetId(null);
      setIsDropTargetRoot(false);
    }
  };

  const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem) return;
    
    setDropTargetId(null);
    setIsDropTargetRoot(false);
    
    if (draggedItem.type === "study") {
      await handleMoveStudy(draggedItem.id, targetFolderId);
    } else if (draggedItem.type === "folder") {
      if (draggedItem.id === targetFolderId || isDescendantOf(targetFolderId, draggedItem.id)) {
        setError("Нельзя переместить папку в саму себя или в дочернюю папку");
        return;
      }
      await handleMoveFolder(draggedItem.id, targetFolderId);
    }
    
    resetDragState();
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem) return;
    
    setDropTargetId(null);
    setIsDropTargetRoot(false);
    
    if (draggedItem.type === "study") {
      await handleMoveStudy(draggedItem.id, null);
    } else if (draggedItem.type === "folder") {
      await handleMoveFolder(draggedItem.id, null);
    }
    
    resetDragState();
  };

  const getStatusConfig = (status: string) => {
    const configs = {
      draft: { label: "Не опубликован", variant: "secondary" as const },
      published: { label: "Опубликован", variant: "success" as const },
      stopped: { label: "Остановлен", variant: "secondary" as const }
    };
    return configs[status as keyof typeof configs] || configs.draft;
  };

  // Get folders available for moving
  const getMoveFolderOptions = (excludeFolderId?: string) => {
    const options: { id: string | null; name: string; depth: number }[] = [];
    
    if (currentFolderId) {
      options.push({ id: null, name: "Корень", depth: 0 });
    }
    
    const buildFolderList = (parentId: string | null, depth: number) => {
      const childFolders = folders.filter(f => f.parent_id === parentId);
      
      for (const folder of childFolders) {
        if (excludeFolderId && (folder.id === excludeFolderId || isDescendantOf(folder.id, excludeFolderId))) {
          continue;
        }
        if (folder.id === currentFolderId) {
          continue;
        }
        
        options.push({ id: folder.id, name: folder.name, depth });
        buildFolderList(folder.id, depth + 1);
      }
    };
    
    buildFolderList(null, 0);
    return options;
  };

  const hasFolders = folders.length > 0;
  const currentFolderName = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : null;

  if (studiesLoading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <h1 className="text-2xl font-bold mb-6">Тесты</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Показываем ошибку если она есть
  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <h1 className="text-2xl font-bold mb-6">Тесты</h1>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="text-destructive text-center">
            <p className="font-medium">Ошибка загрузки данных</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
          <Button onClick={() => loadAllData(currentFolderId)} variant="outline">
            Попробовать снова
          </Button>
        </div>
      </div>
    );
  }

    return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 flex-wrap">
          <div className="flex items-center gap-3">
            <h1
              onDragOver={breadcrumbs.length > 0 ? handleDragOverRoot : undefined}
              onDragLeave={handleDragLeave}
              onDrop={breadcrumbs.length > 0 ? handleDropOnRoot : undefined}
              onClick={() => breadcrumbs.length > 0 && !draggedItem && navigateToFolder(null)}
              className={cn(
                "text-2xl font-bold transition-all rounded-lg px-2 py-1 -mx-2",
                breadcrumbs.length > 0 && "cursor-pointer hover:text-primary",
                isDropTargetRoot && "bg-primary/10 ring-2 ring-primary ring-dashed"
              )}
            >
              Тесты
            </h1>
          </div>
          {breadcrumbs.map((folder, index) => {
            const isDropTarget = dropTargetId === folder.id;
            const isLast = index === breadcrumbs.length - 1;
            
            return (
              <div key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                <span
                  onDragOver={!isLast ? (e) => handleDragOverFolder(e, folder.id) : undefined}
                  onDragLeave={handleDragLeave}
                  onDrop={!isLast ? (e) => handleDropOnFolder(e, folder.id) : undefined}
                  onClick={() => !isLast && !draggedItem && navigateToFolder(folder.id)}
                  className={cn(
                    "text-2xl font-bold transition-all rounded-lg px-2 py-1",
                    !isLast && "cursor-pointer hover:text-primary",
                    isDropTarget && "bg-primary/10 ring-2 ring-primary ring-dashed"
                  )}
                >
                  {folder.name}
                </span>
      </div>
    );
          })}
        </nav>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-6 flex justify-between items-center">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError}>✕</Button>
        </div>
      )}

      {/* Bulk actions bar — fixed at bottom as island, 24px inset */}
      {selectedStudies.size > 0 && (
        <div
          className="studies-bulk-actions-bar fixed left-6 right-6 bottom-6 z-50 flex justify-between items-center rounded-lg px-4 py-3 shadow-lg border bg-primary/5 border-primary/20 text-foreground"
          role="region"
          aria-label="Действия с выбранными тестами"
        >
          <span className="text-sm font-medium">Выбрано: {selectedStudies.size}</span>
          <div className="flex gap-2">
            {hasFolders && (
              <Button variant="outline" size="sm" onClick={openBulkMoveModal}>
                <FolderInput className="h-4 w-4 mr-2" />
                Переместить
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={openBulkDeleteDialog}>
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Отменить
            </Button>
          </div>
        </div>
      )}

      {/* Folders — показываем всегда (в корне и внутри папки): список папок текущего уровня + карточка «Новая папка» */}
      <div className="mb-8">
          <h2 className="text-[15px] font-extrabold leading-6 text-foreground mb-3">Папки</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {currentFolderFolders.map(folder => {
              const isDraggedOver = dropTargetId === folder.id;
              const isBeingDragged = draggedItem?.type === "folder" && draggedItem.id === folder.id;

  return (
                <Card
                  key={folder.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, "folder", folder.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDropOnFolder(e, folder.id)}
                  onClick={() => !draggedItem && navigateToFolder(folder.id)}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md group",
                    isDraggedOver && "ring-2 ring-primary ring-dashed bg-primary/5 scale-[1.02]",
                    isBeingDragged && "opacity-50"
                  )}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        {isDraggedOver ? (
                          <FolderOpen className="h-5 w-5 text-primary" />
                        ) : (
                          <Folder className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{folder.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {folder.studiesCount} тест{folder.studiesCount === 1 ? "" : folder.studiesCount >= 2 && folder.studiesCount <= 4 ? "а" : "ов"}
                          {folder.subFoldersCount > 0 && ` • ${folder.subFoldersCount} папок`}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setRenameFolderName(folder.name);
                            openRenameFolderModal(folder.id);
                          }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Переименовать
                          </DropdownMenuItem>
                          {folders.length > 1 && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              openMoveFolderModal(folder.id);
                            }}>
                              <FolderInput className="h-4 w-4 mr-2" />
                              Переместить
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteFolderDialog(folder);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
        </div>
                  </CardHeader>
                </Card>
              );
            })}
            
            {/* Add folder button in list */}
            <Card
              onClick={openCreateFolderModal}
              className="cursor-pointer transition-all !border-2 !border-dashed !border-border rounded-xl shadow-none"
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-center">
                  <div className="p-2 rounded-lg">
                    <FolderPlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
            </Card>
      </div>
        </div>

      {/* Studies header with select all (only when there are studies) */}
      {studies.length > 0 && (
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[15px] font-extrabold leading-6 text-foreground">
            Тесты {currentFolderName && `в папке "${currentFolderName}"`}
          </h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
              <Checkbox
                checked={selectedStudies.size === studies.length && studies.length > 0}
                onCheckedChange={handleToggleSelectAll}
              />
              Выбрать все
            </label>
            <Button onClick={openCreateStudyModal} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Тест
            </Button>
          </div>
        </div>
      )}

      {/* Studies list */}
      {studies.length === 0 && currentFolderFolders.length === 0 ? (
        <div className="space-y-6" id="onboarding-empty">
          <div className="flex justify-between items-center">
            <h2 className="text-[15px] font-extrabold leading-6 text-foreground">Тесты</h2>
            <Button onClick={openCreateStudyModal} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Тест
            </Button>
          </div>
          <div className="flex flex-col items-center text-center pt-6">
            <h3 className="text-2xl font-bold mb-2">Создайте ваш первый тест</h3>
            <p className="text-base text-muted-foreground mb-6">
              Выберите один из шаблонов ниже, просмотрите все шаблоны или начните с нуля
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("prototype_testing")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Тестирование прототипа</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Протестируйте и улучшите прототипы приложения или сайта на основе обратной связи от пользователей
                </p>
              </Card>
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("first_click")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Тест первого клика</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Выясните, насколько легко пользователям найти определённую функцию в вашем приложении или на сайте
                </p>
              </Card>
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("navigation_improvement")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Улучшение навигации</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Узнайте, как пользователи естественным образом группируют и категоризируют пункты меню
                </p>
              </Card>
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("marketing_copy")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Проверка маркетинговых текстов</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Проверьте эффективность маркетинговых текстов во взаимодействии с целевой аудиторией
                </p>
              </Card>
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("product_survey")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Продуктовый опрос</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Изучите, как пользователи работают с продуктом — сценарии использования и ценные функции
                </p>
              </Card>
            </div>
          </div>
        </div>
      ) : studies.length === 0 ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-[15px] font-extrabold leading-6 text-foreground">
              Тесты {currentFolderName && `в папке "${currentFolderName}"`}
            </h2>
            <Button onClick={openCreateStudyModal} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Тест
            </Button>
          </div>
          <div className="flex flex-col items-center text-center pt-6">
            <h3 className="text-2xl font-bold mb-2">Создайте ваш первый тест</h3>
            <p className="text-base text-muted-foreground mb-6">
              Выберите один из шаблонов ниже, просмотрите все шаблоны или начните с нуля
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("prototype_testing")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Тестирование прототипа</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Протестируйте и улучшите прототипы приложения или сайта на основе обратной связи от пользователей
                </p>
              </Card>
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("first_click")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Тест первого клика</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Выясните, насколько легко пользователям найти определённую функцию в вашем приложении или на сайте
                </p>
              </Card>
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("navigation_improvement")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Улучшение навигации</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Узнайте, как пользователи естественным образом группируют и категоризируют пункты меню
                </p>
              </Card>
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("marketing_copy")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Проверка маркетинговых текстов</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Проверьте эффективность маркетинговых текстов во взаимодействии с целевой аудиторией
                </p>
              </Card>
              <Card
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md p-5 text-left"
                onClick={() => setTemplateModalId("product_survey")}
              >
                <h4 className="text-[15px] font-bold text-foreground mb-2">Продуктовый опрос</h4>
                <p className="text-[13px] font-normal text-muted-foreground">
                  Изучите, как пользователи работают с продуктом — сценарии использования и ценные функции
                </p>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {studies.map(study => {
            const statusConfig = getStatusConfig(study.status);
            const isSelected = selectedStudies.has(study.id);
            const isBeingDragged = draggedItem?.type === "study" && draggedItem.id === study.id;
            const stats = studyStats[study.id];
            const blocks = (stats?.blocks || []).filter(b => !('deleted_at' in b && b.deleted_at));
            const sessionsCount = stats?.sessionsCount || 0;
            
            return (
              <Card
                key={study.id}
                draggable
                onDragStart={(e) => handleDragStart(e, "study", study.id)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "transition-colors duration-200 group !shadow-none border-2 border-border hover:border-primary",
                  isSelected && "ring-2 ring-primary",
                  isBeingDragged && "opacity-50"
                )}
              >
                <div className="flex items-center p-4 gap-4">
                  {/* Checkbox & Title */}
                  <div 
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => !draggedItem && navigate(`/studies/${study.id}`)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(study.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="truncate text-[15px] font-medium leading-6">
                      {study.title}
                    </span>
                  </div>
                  
                  {/* Block icons - centered */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {blocks.length > 0 ? (
                      blocks.slice(0, 8).map((block, idx) => {
                        const IconComponent = BLOCK_ICONS[block.type] || FileText;
                        const colorClass = BLOCK_COLORS[block.type] || "bg-gray-100 text-gray-600";
                        return (
                          <div
                            key={block.id}
                            className={cn(
                              "w-8 h-8 rounded-md flex items-center justify-center",
                              colorClass
                            )}
                            title={block.type}
                          >
                            <IconComponent size={16} />
                          </div>
                        );
                      })
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                        <Plus size={16} />
                      </div>
                    )}
                    {blocks.length > 8 && (
                      <span className="text-xs text-muted-foreground ml-1">+{blocks.length - 8}</span>
                    )}
                  </div>
                  
                  {/* Sessions count */}
                  {sessionsCount > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
                      <Users size={14} />
                      <span>{sessionsCount}</span>
                    </div>
                  )}
                  
                  {/* Status & Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={statusConfig.variant} className="flex-shrink-0 bg-transparent text-[15px] font-medium leading-6 text-muted-foreground">
                      {statusConfig.label}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDuplicate(study)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Копировать
                        </DropdownMenuItem>
                        {hasFolders && (
                          <DropdownMenuItem onClick={() => openMoveModal(study.id)}>
                            <FolderInput className="h-4 w-4 mr-2" />
                            Переместить
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => openDeleteDialog(study)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Template "Тестирование прототипа" Modal */}
      <Dialog open={templateModalId === "prototype_testing"} onOpenChange={(open) => !open && setTemplateModalId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Тестирование прототипа</DialogTitle>
            <DialogDescription className="text-base">
              Протестируйте и улучшите прототипы приложения или сайта на основе обратной связи от пользователей
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <h4 className="text-[15px] font-bold">Что вы узнаете?</h4>
            <ul className="space-y-2 text-[15px] font-normal text-muted-foreground list-none pl-0">
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Узнайте, могут ли ваши пользователи выполнить задание (или несколько заданий) и получите оценку удобства использования вашего сценария</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Соберите качественную обратную связь о том, чего не хватает в функционале — дайте пользователям возможность помочь выявить дополнительные детали</span>
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateModalId(null)}>
              Отмена
            </Button>
            <Button onClick={handleUseTemplatePrototypeTesting}>
              Использовать этот шаблон
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template "Тест первого клика" Modal */}
      <Dialog open={templateModalId === "first_click"} onOpenChange={(open) => !open && setTemplateModalId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Тест первого клика</DialogTitle>
            <DialogDescription className="text-base">
              Выясните, насколько легко пользователям найти определённую функцию в вашем приложении или на сайте
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <h4 className="text-[15px] font-bold">Что вы узнаете?</h4>
            <ul className="space-y-2 text-[15px] font-normal text-muted-foreground list-none pl-0">
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Узнайте, могут ли ваши пользователи выполнить задание (или несколько заданий) и получите оценку удобства использования вашего сценария</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Соберите качественную обратную связь о том, чего не хватает в функционале — дайте пользователям возможность помочь выявить дополнительные детали</span>
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateModalId(null)}>
              Отмена
            </Button>
            <Button onClick={handleUseTemplateFirstClick}>
              Использовать этот шаблон
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template "Улучшение навигации" Modal */}
      <Dialog open={templateModalId === "navigation_improvement"} onOpenChange={(open) => !open && setTemplateModalId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Улучшение навигации</DialogTitle>
            <DialogDescription className="text-base">
              Узнайте, как пользователи естественным образом группируют и категоризируют пункты меню
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <h4 className="text-[15px] font-bold">Что вы узнаете?</h4>
            <ul className="space-y-2 text-[15px] font-normal text-muted-foreground list-none pl-0">
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Определите проблемные места в навигации сайта</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Поймите ожидания пользователей от структуры навигации</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Соберите фидбек об общем восприятии удобства использования, находят ли пользователи навигацию интуитивно понятной или она нуждается в улучшении</span>
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateModalId(null)}>
              Отмена
            </Button>
            <Button onClick={handleUseTemplateNavigationImprovement}>
              Использовать этот шаблон
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template "Проверка маркетинговых текстов" Modal */}
      <Dialog open={templateModalId === "marketing_copy"} onOpenChange={(open) => !open && setTemplateModalId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Проверка маркетинговых текстов</DialogTitle>
            <DialogDescription className="text-base">
              Проверьте эффективность маркетинговых текстов во взаимодействии с целевой аудиторией и определите факторы их успеха или неудачи
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <h4 className="text-[15px] font-bold">Что вы узнаете?</h4>
            <ul className="space-y-2 text-[15px] font-normal text-muted-foreground list-none pl-0">
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Получите непосредственную реакцию аудитории на ваши маркетинговые материалы</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Соберите комплексные данные через опросы: как количественные метрики, так и качественную обратную связь</span>
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateModalId(null)}>
              Отмена
            </Button>
            <Button onClick={handleUseTemplateMarketingCopy}>
              Использовать этот шаблон
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template "Продуктовый опрос" Modal */}
      <Dialog open={templateModalId === "product_survey"} onOpenChange={(open) => !open && setTemplateModalId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Продуктовый опрос</DialogTitle>
            <DialogDescription className="text-base">
              Изучите, как пользователи работают с продуктом — их типичные сценарии использования и предпочитаемые функции. Выясните причины низкой вовлеченности или трудностей в использовании
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <h4 className="text-[15px] font-bold">Что вы узнаете?</h4>
            <ul className="space-y-2 text-[15px] font-normal text-muted-foreground list-none pl-0">
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Выясните причины потери интереса пользователей</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Определите самые ценные для пользователей функции</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Найдите проблемы в удобстве использования и поймите, с какими сложностями сталкиваются пользователи</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>Соберите предложения по улучшению удобства и полезности приложения</span>
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateModalId(null)}>
              Отмена
            </Button>
            <Button onClick={handleUseTemplateProductSurvey}>
              Использовать этот шаблон
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Study Modal */}
      <Dialog open={showCreateStudyModal} onOpenChange={(open) => open ? openCreateStudyModal() : closeCreateStudyModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Создать исследование</DialogTitle>
            <DialogDescription>
              Заполните форму для создания нового исследования
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <FormField label="Название исследования">
              <Input
                id="study-title"
                placeholder="Введите название исследования"
                value={newStudyTitle}
                onChange={(e) => setNewStudyTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleCreateStudy();
                  }
                }}
                autoFocus
              />
            </FormField>
            <FormField label="Описание" optional>
              <FormTextarea
                id="study-description"
                placeholder="Введите описание исследования (опционально)"
                value={newStudyDescription}
                onChange={(e) => setNewStudyDescription(e.target.value)}
                rows={4}
              />
            </FormField>
            <FormField label="Тип исследования" optional>
              <FormSelect
                id="study-type"
                value={newStudyType}
                onChange={(e) => setNewStudyType(e.target.value)}
              >
                <option value="">Выберите тип исследования</option>
                <option value="prototype">Тестирование прототипа</option>
                <option value="first_click">Тест первого клика</option>
                <option value="survey">Опрос</option>
                <option value="usability">Юзабилити-тест</option>
                <option value="card_sorting">Карточная сортировка</option>
                <option value="preference">Тест предпочтений</option>
              </FormSelect>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateStudyModal}>
              Отмена
            </Button>
            <Button onClick={handleCreateStudy} disabled={!newStudyTitle.trim()}>
              Создать исследование
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Modal */}
      <Dialog open={showCreateFolderModal} onOpenChange={(open) => open ? openCreateFolderModal() : closeCreateFolderModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать папку</DialogTitle>
            {currentFolderName && (
              <DialogDescription>
                Папка будет создана внутри "{currentFolderName}"
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Название папки</Label>
              <Input
                id="folder-name"
                placeholder="Введите название папки"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateFolderModal}>
              Отмена
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Study Modal */}
      <Dialog open={!!showRenameModal} onOpenChange={(open) => open ? null : closeRenameModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать тест</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rename-study">Название</Label>
              <Input
                id="rename-study"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && showRenameModal) handleRename(showRenameModal);
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRenameModal}>
                Отмена
            </Button>
            <Button onClick={() => showRenameModal && handleRename(showRenameModal)} disabled={!renameTitle.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Modal */}
      <Dialog open={!!showRenameFolderModal} onOpenChange={(open) => open ? null : closeRenameFolderModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать папку</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rename-folder">Название</Label>
              <Input
                id="rename-folder"
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && showRenameFolderModal) handleRenameFolder(showRenameFolderModal);
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRenameFolderModal}>
              Отмена
            </Button>
            <Button onClick={() => showRenameFolderModal && handleRenameFolder(showRenameFolderModal)} disabled={!renameFolderName.trim()}>
                Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Study Modal */}
      <Dialog open={!!showMoveModal} onOpenChange={(open) => open ? null : closeMoveModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переместить тест</DialogTitle>
            <DialogDescription>Выберите папку назначения</DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-1 py-4">
            {getMoveFolderOptions().map(option => (
              <Button
                key={option.id || "root"}
                variant="ghost"
                className="w-full justify-start"
                style={{ paddingLeft: `${option.depth * 16 + 16}px` }}
                onClick={() => showMoveModal && handleMoveStudy(showMoveModal, option.id)}
              >
                <Folder className="h-4 w-4 mr-2" />
                {option.name}
              </Button>
            ))}
            </div>
        </DialogContent>
      </Dialog>

      {/* Move Folder Modal */}
      <Dialog open={!!showMoveFolderModal} onOpenChange={(open) => open ? null : closeMoveFolderModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переместить папку</DialogTitle>
            <DialogDescription>Выберите родительскую папку</DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-1 py-4">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => showMoveFolderModal && handleMoveFolder(showMoveFolderModal, null)}
            >
              <Folder className="h-4 w-4 mr-2" />
              Корень
            </Button>
            {getMoveFolderOptions(showMoveFolderModal || undefined).filter(o => o.id !== null).map(option => (
              <Button
                key={option.id}
                variant="ghost"
                className="w-full justify-start"
                style={{ paddingLeft: `${option.depth * 16 + 16}px` }}
                onClick={() => showMoveFolderModal && handleMoveFolder(showMoveFolderModal, option.id)}
              >
                <Folder className="h-4 w-4 mr-2" />
                {option.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Modal */}
      <Dialog open={showBulkMoveModal} onOpenChange={(open) => open ? openBulkMoveModal() : closeBulkMoveModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переместить {selectedStudies.size} тест(ов)</DialogTitle>
            <DialogDescription>Выберите папку назначения</DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-1 py-4">
            {getMoveFolderOptions().map(option => (
              <Button
                key={option.id || "root"}
                variant="ghost"
                className="w-full justify-start"
                style={{ paddingLeft: `${option.depth * 16 + 16}px` }}
                onClick={() => handleBulkMove(option.id)}
              >
                <Folder className="h-4 w-4 mr-2" />
                {option.name}
              </Button>
            ))}
        </div>
        </DialogContent>
      </Dialog>

      {/* Delete Study Dialog */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={(open) => open ? null : closeDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить {showDeleteDialog?.title ?? "тест"}</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены? Все содержимое теста и результаты будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => showDeleteDialog && handleDelete(showDeleteDialog)}
            >
              Да, удалить этот тест
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Dialog */}
      <AlertDialog open={!!showDeleteFolderDialog} onOpenChange={(open) => open ? null : closeDeleteFolderDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить папку?</AlertDialogTitle>
            <AlertDialogDescription>
              Папка "{showDeleteFolderDialog?.name}" будет удалена. Содержимое будет перемещено в родительскую папку.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => showDeleteFolderDialog && handleDeleteFolder(showDeleteFolderDialog)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={(open) => open ? openBulkDeleteDialog() : closeBulkDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить {selectedStudies.size} тест(ов)?</AlertDialogTitle>
            <AlertDialogDescription>
              Выбранные тесты будут удалены. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
