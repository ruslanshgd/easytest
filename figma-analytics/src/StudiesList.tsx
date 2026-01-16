import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";

// Block type icons mapping
const BLOCK_ICONS: Record<string, React.ElementType> = {
  prototype: Layers,
  open_question: MessageSquare,
  choice: ListChecks,
  scale: BarChart3,
  preference: Images,
  context: FileText,
  five_seconds: Timer,
  umux_lite: ClipboardList,
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
}

interface StudyStats {
  blocks: StudyBlock[];
  sessionsCount: number;
}

export default function StudiesList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolderId = searchParams.get("folder");
  
  const [studies, setStudies] = useState<Study[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [currentFolderFolders, setCurrentFolderFolders] = useState<FolderWithCount[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modals
  const [showCreateStudyModal, setShowCreateStudyModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState<string | null>(null);
  const [showRenameFolderModal, setShowRenameFolderModal] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState<string | null>(null);
  const [showMoveFolderModal, setShowMoveFolderModal] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<Study | null>(null);
  const [showDeleteFolderDialog, setShowDeleteFolderDialog] = useState<FolderWithCount | null>(null);
  
  // Form state
  const [newStudyTitle, setNewStudyTitle] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");
  
  // Selection state
  const [selectedStudies, setSelectedStudies] = useState<Set<string>>(new Set());
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{ type: "study" | "folder"; id: string } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [isDropTargetRoot, setIsDropTargetRoot] = useState(false);
  
  // Stats for studies (blocks and sessions count)
  const [studyStats, setStudyStats] = useState<Record<string, StudyStats>>({});

  // Helper function to get team_id
  const getUserTeamId = async (userId: string): Promise<string | null> => {
    const { data } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.team_id || null;
  };

  // Build breadcrumbs chain from current folder to root
  const buildBreadcrumbs = (folderId: string | null, allFolders: FolderType[]): FolderType[] => {
    if (!folderId) return [];
    
    const chain: FolderType[] = [];
    let currentId: string | null = folderId;
    
    while (currentId) {
      const folder = allFolders.find(f => f.id === currentId);
      if (folder) {
        chain.unshift(folder);
        currentId = folder.parent_id;
      } else {
        break;
      }
    }
    
    return chain;
  };

  // Count studies in a folder
  const countStudiesInFolder = async (folderId: string): Promise<number> => {
    const { count, error } = await supabase
      .from("studies")
      .select("*", { count: "exact", head: true })
      .eq("folder_id", folderId);
    
    if (error) {
      console.error("Error counting studies:", error);
      return 0;
    }
    
    return count || 0;
  };

  // Count subfolders in a folder
  const countSubFolders = (folderId: string, allFolders: FolderType[]): number => {
    return allFolders.filter(f => f.parent_id === folderId).length;
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Требуется авторизация");
        setLoading(false);
        return;
      }

      // Load all folders
      const { data: foldersData, error: foldersError } = await supabase
        .from("folders")
        .select("*")
        .order("name", { ascending: true });

      if (foldersError) {
        console.error("Error loading folders:", foldersError);
      } else {
        const allFolders = (foldersData || []) as FolderType[];
        setFolders(allFolders);
        setBreadcrumbs(buildBreadcrumbs(currentFolderId, allFolders));
        
        const currentLevelFolders = allFolders.filter(f => 
          currentFolderId ? f.parent_id === currentFolderId : f.parent_id === null
        );
        
        const foldersWithCounts: FolderWithCount[] = await Promise.all(
          currentLevelFolders.map(async folder => ({
            ...folder,
            studiesCount: await countStudiesInFolder(folder.id),
            subFoldersCount: countSubFolders(folder.id, allFolders)
          }))
        );
        
        setCurrentFolderFolders(foldersWithCounts);
      }

      // Load studies for current folder
      let studiesQuery = supabase
        .from("studies")
        .select("*")
        .order("created_at", { ascending: false });

      if (currentFolderId) {
        studiesQuery = studiesQuery.eq("folder_id", currentFolderId);
      } else {
        studiesQuery = studiesQuery.is("folder_id", null);
      }

      const { data: studiesData, error: studiesError } = await studiesQuery;

      if (studiesError) {
        console.error("Error loading studies:", studiesError);
        setError(studiesError.message);
        setLoading(false);
        return;
      }

      const loadedStudies = (studiesData || []) as Study[];
      setStudies(loadedStudies);
      
      // Load blocks and sessions count for each study
      if (loadedStudies.length > 0) {
        const studyIds = loadedStudies.map(s => s.id);
        
        // Load blocks for all studies at once
        const { data: blocksData } = await supabase
          .from("study_blocks")
          .select("id, study_id, type, order_index")
          .in("study_id", studyIds)
          .order("order_index", { ascending: true });
        
        // Load sessions count for all studies at once
        const { data: sessionsData } = await supabase
          .from("sessions")
          .select("study_id")
          .in("study_id", studyIds);
        
        // Group by study_id
        const stats: Record<string, StudyStats> = {};
        for (const study of loadedStudies) {
          const studyBlocks = (blocksData || []).filter(b => b.study_id === study.id) as StudyBlock[];
          const studySessions = (sessionsData || []).filter(s => s.study_id === study.id);
          stats[study.id] = {
            blocks: studyBlocks,
            sessionsCount: studySessions.length
          };
        }
        setStudyStats(stats);
      }
    } catch (err) {
      console.error("Unexpected error loading data:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSelectedStudies(new Set());
  }, [currentFolderId]);

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

      setShowCreateFolderModal(false);
      setNewFolderName("");
      await loadData();
    } catch (err) {
      console.error("Unexpected error creating folder:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Create study
  const handleCreateStudy = async () => {
    if (!newStudyTitle.trim()) {
      setError("Название не может быть пустым");
      return;
    }

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
          title: newStudyTitle.trim(),
          user_id: teamId ? null : user.id,
          team_id: teamId || null,
          folder_id: currentFolderId || null,
          status: "draft"
        }])
        .select()
        .single();

      if (createError) {
        console.error("Error creating study:", createError);
        setError(createError.message);
        return;
      }

      setShowCreateStudyModal(false);
      setNewStudyTitle("");
      
      if (data) {
        navigate(`/studies/${data.id}`);
      }
    } catch (err) {
      console.error("Unexpected error creating study:", err);
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

      setShowRenameFolderModal(null);
      setRenameFolderName("");
      await loadData();
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

      setShowMoveFolderModal(null);
      await loadData();
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

      setShowDeleteFolderDialog(null);
      await loadData();
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

      setShowRenameModal(null);
      setRenameTitle("");
      await loadData();
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

      setShowMoveModal(null);
      await loadData();
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

      setShowBulkMoveModal(false);
      setSelectedStudies(new Set());
      await loadData();
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

      setShowBulkDeleteDialog(false);
      setSelectedStudies(new Set());
      await loadData();
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

      await loadData();
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

      setShowDeleteDialog(null);
      await loadData();
    } catch (err) {
      console.error("Unexpected error deleting study:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Toggle selection
  const toggleSelection = (studyId: string) => {
    const newSelection = new Set(selectedStudies);
    if (newSelection.has(studyId)) {
      newSelection.delete(studyId);
    } else {
      newSelection.add(studyId);
    }
    setSelectedStudies(newSelection);
  };

  // Select all
  const toggleSelectAll = () => {
    if (selectedStudies.size === studies.length) {
      setSelectedStudies(new Set());
    } else {
      setSelectedStudies(new Set(studies.map(s => s.id)));
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, type: "study" | "folder", id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ type, id }));
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTargetId(null);
    setIsDropTargetRoot(false);
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
    
    setDraggedItem(null);
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
    
    setDraggedItem(null);
  };

  const getStatusConfig = (status: string) => {
    const configs = {
      draft: { label: "Черновик", variant: "secondary" as const },
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

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <h1 className="text-2xl font-bold mb-6">Тесты</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreateFolderModal(true)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            Папка
          </Button>
          <Button onClick={() => setShowCreateStudyModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Тест
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-6 flex justify-between items-center">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>✕</Button>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedStudies.size > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 mb-6 flex justify-between items-center">
          <span className="text-sm font-medium">Выбрано: {selectedStudies.size}</span>
          <div className="flex gap-2">
            {hasFolders && (
              <Button variant="outline" size="sm" onClick={() => setShowBulkMoveModal(true)}>
                <FolderInput className="h-4 w-4 mr-2" />
                Переместить
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedStudies(new Set())}>
              Отменить
            </Button>
          </div>
        </div>
      )}

      {/* Folders */}
      {currentFolderFolders.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Папки</h2>
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
                            setShowRenameFolderModal(folder.id);
                          }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Переименовать
                          </DropdownMenuItem>
                          {folders.length > 1 && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setShowMoveFolderModal(folder.id);
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
                              setShowDeleteFolderDialog(folder);
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
      </div>
        </div>
      )}

      {/* Studies header with select all */}
      {studies.length > 0 && (
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Тесты {currentFolderName && `в папке "${currentFolderName}"`}
          </h2>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
            <Checkbox
              checked={selectedStudies.size === studies.length && studies.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            Выбрать все
          </label>
        </div>
      )}

      {/* Studies list */}
      {studies.length === 0 && currentFolderFolders.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-muted">
              <Folder className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">
                {currentFolderId ? "Папка пуста" : "Нет тестов"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {currentFolderId 
                  ? "В этой папке пока нет тестов и папок"
                  : "Создайте первый тест или папку для организации"}
              </p>
        </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCreateFolderModal(true)}>
                <FolderPlus className="h-4 w-4 mr-2" />
                Папка
              </Button>
              <Button onClick={() => setShowCreateStudyModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Тест
              </Button>
            </div>
          </div>
        </Card>
      ) : studies.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">В этой папке пока нет тестов</p>
          <Button onClick={() => setShowCreateStudyModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Создать тест
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {studies.map(study => {
            const statusConfig = getStatusConfig(study.status);
            const isSelected = selectedStudies.has(study.id);
            const isBeingDragged = draggedItem?.type === "study" && draggedItem.id === study.id;
            const stats = studyStats[study.id];
            const blocks = stats?.blocks || [];
            const sessionsCount = stats?.sessionsCount || 0;
            
            return (
              <Card
                key={study.id}
                draggable
                onDragStart={(e) => handleDragStart(e, "study", study.id)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "transition-all group",
                  isSelected && "ring-2 ring-primary",
                  isBeingDragged && "opacity-50"
                )}
              >
                <div className="flex items-center p-4 gap-4">
                  {/* Checkbox & Drag handle */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(study.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  {/* Block icons */}
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
                  
                  {/* Title & Status */}
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => !draggedItem && navigate(`/studies/${study.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium truncate hover:text-primary transition-colors">
                        {study.title}
                      </span>
                      <Badge variant={statusConfig.variant} className="flex-shrink-0">
                        {statusConfig.label}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Sessions count */}
                  {sessionsCount > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
                      <Users size={14} />
                      <span>{sessionsCount}</span>
                    </div>
                  )}
                  
                  {/* Date */}
                  <div className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">
                    {new Date(study.created_at).toLocaleDateString("ru-RU")}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTitle(study.title);
                        setShowRenameModal(study.id);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
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
                          <DropdownMenuItem onClick={() => setShowMoveModal(study.id)}>
                            <FolderInput className="h-4 w-4 mr-2" />
                            Переместить
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => setShowDeleteDialog(study)}
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

      {/* Create Study Modal */}
      <Dialog open={showCreateStudyModal} onOpenChange={setShowCreateStudyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать тест</DialogTitle>
            {currentFolderName && (
              <DialogDescription>
                Тест будет создан в папке "{currentFolderName}"
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="study-name">Название</Label>
              <Input
                id="study-name"
                placeholder="Введите название теста"
                value={newStudyTitle}
                onChange={(e) => setNewStudyTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateStudy();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateStudyModal(false)}>
                Отмена
            </Button>
            <Button onClick={handleCreateStudy} disabled={!newStudyTitle.trim()}>
                Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Modal */}
      <Dialog open={showCreateFolderModal} onOpenChange={setShowCreateFolderModal}>
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
            <Button variant="outline" onClick={() => setShowCreateFolderModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Study Modal */}
      <Dialog open={!!showRenameModal} onOpenChange={() => setShowRenameModal(null)}>
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
            <Button variant="outline" onClick={() => setShowRenameModal(null)}>
                Отмена
            </Button>
            <Button onClick={() => showRenameModal && handleRename(showRenameModal)} disabled={!renameTitle.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Modal */}
      <Dialog open={!!showRenameFolderModal} onOpenChange={() => setShowRenameFolderModal(null)}>
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
            <Button variant="outline" onClick={() => setShowRenameFolderModal(null)}>
              Отмена
            </Button>
            <Button onClick={() => showRenameFolderModal && handleRenameFolder(showRenameFolderModal)} disabled={!renameFolderName.trim()}>
                Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Study Modal */}
      <Dialog open={!!showMoveModal} onOpenChange={() => setShowMoveModal(null)}>
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
      <Dialog open={!!showMoveFolderModal} onOpenChange={() => setShowMoveFolderModal(null)}>
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
      <Dialog open={showBulkMoveModal} onOpenChange={setShowBulkMoveModal}>
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
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить тест?</AlertDialogTitle>
            <AlertDialogDescription>
              Тест "{showDeleteDialog?.title}" будет удалён. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => showDeleteDialog && handleDelete(showDeleteDialog)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Dialog */}
      <AlertDialog open={!!showDeleteFolderDialog} onOpenChange={() => setShowDeleteFolderDialog(null)}>
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
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
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
