import type { AppStore } from './index';
import type { Study, FolderWithCount } from './types';

export interface UIStore {
  // Global error/message state
  error: string | null;
  message: string | null;
  
  // Modal states for StudiesList
  showCreateStudyModal: boolean;
  showCreateFolderModal: boolean;
  showRenameModal: string | null;
  showRenameFolderModal: string | null;
  showMoveModal: string | null;
  showMoveFolderModal: string | null;
  showDeleteDialog: Study | null;
  showDeleteFolderDialog: FolderWithCount | null;
  showBulkMoveModal: boolean;
  showBulkDeleteDialog: boolean;
  
  // Form states for StudiesList
  newStudyTitle: string;
  newStudyDescription: string;
  newStudyType: string;
  newFolderName: string;
  renameTitle: string;
  renameFolderName: string;
  
  // Selection state
  selectedStudies: Set<string>;
  
  // Drag and drop state
  draggedItem: { type: "study" | "folder"; id: string } | null;
  dropTargetId: string | null;
  isDropTargetRoot: boolean;
  
  // Actions
  setError: (error: string | null) => void;
  setMessage: (message: string | null) => void;
  clearError: () => void;
  clearMessage: () => void;
  
  // Modal actions
  openCreateStudyModal: () => void;
  closeCreateStudyModal: () => void;
  openCreateFolderModal: () => void;
  closeCreateFolderModal: () => void;
  openRenameModal: (studyId: string) => void;
  closeRenameModal: () => void;
  openRenameFolderModal: (folderId: string) => void;
  closeRenameFolderModal: () => void;
  openMoveModal: (studyId: string) => void;
  closeMoveModal: () => void;
  openMoveFolderModal: (folderId: string) => void;
  closeMoveFolderModal: () => void;
  openDeleteDialog: (study: Study) => void;
  closeDeleteDialog: () => void;
  openDeleteFolderDialog: (folder: FolderWithCount) => void;
  closeDeleteFolderDialog: () => void;
  openBulkMoveModal: () => void;
  closeBulkMoveModal: () => void;
  openBulkDeleteDialog: () => void;
  closeBulkDeleteDialog: () => void;
  
  // Form actions
  setNewStudyTitle: (title: string) => void;
  setNewStudyDescription: (description: string) => void;
  setNewStudyType: (type: string) => void;
  setNewFolderName: (name: string) => void;
  setRenameTitle: (title: string) => void;
  setRenameFolderName: (name: string) => void;
  resetForms: () => void;
  
  // Selection actions
  toggleSelection: (studyId: string) => void;
  toggleSelectAll: (studyIds: string[]) => void;
  clearSelection: () => void;
  
  // Drag and drop actions
  setDraggedItem: (item: { type: "study" | "folder"; id: string } | null) => void;
  setDropTargetId: (id: string | null) => void;
  setIsDropTargetRoot: (isRoot: boolean) => void;
  resetDragState: () => void;
}

export const createUIStore = (set: any, get: any): UIStore => ({
  // Initial state
  error: null,
  message: null,
  showCreateStudyModal: false,
  showCreateFolderModal: false,
  showRenameModal: null,
  showRenameFolderModal: null,
  showMoveModal: null,
  showMoveFolderModal: null,
  showDeleteDialog: null,
  showDeleteFolderDialog: null,
  showBulkMoveModal: false,
  showBulkDeleteDialog: false,
  newStudyTitle: "",
  newStudyDescription: "",
  newStudyType: "",
  newFolderName: "",
  renameTitle: "",
  renameFolderName: "",
  selectedStudies: new Set(),
  draggedItem: null,
  dropTargetId: null,
  isDropTargetRoot: false,
  
  // Actions
  setError: (error) => set({ error }),
  setMessage: (message) => set({ message }),
  clearError: () => set({ error: null }),
  clearMessage: () => set({ message: null }),
  
  // Modal actions
  openCreateStudyModal: () => set({ showCreateStudyModal: true }),
  closeCreateStudyModal: () => set({ 
    showCreateStudyModal: false, 
    newStudyTitle: "",
    newStudyDescription: "",
    newStudyType: ""
  }),
  
  openCreateFolderModal: () => set({ showCreateFolderModal: true }),
  closeCreateFolderModal: () => set({ 
    showCreateFolderModal: false, 
    newFolderName: "" 
  }),
  
  openRenameModal: (studyId) => set({ showRenameModal: studyId }),
  closeRenameModal: () => set({ 
    showRenameModal: null, 
    renameTitle: "" 
  }),
  
  openRenameFolderModal: (folderId) => set({ showRenameFolderModal: folderId }),
  closeRenameFolderModal: () => set({ 
    showRenameFolderModal: null, 
    renameFolderName: "" 
  }),
  
  openMoveModal: (studyId) => set({ showMoveModal: studyId }),
  closeMoveModal: () => set({ showMoveModal: null }),
  
  openMoveFolderModal: (folderId) => set({ showMoveFolderModal: folderId }),
  closeMoveFolderModal: () => set({ showMoveFolderModal: null }),
  
  openDeleteDialog: (study) => set({ showDeleteDialog: study }),
  closeDeleteDialog: () => set({ showDeleteDialog: null }),
  
  openDeleteFolderDialog: (folder) => set({ showDeleteFolderDialog: folder }),
  closeDeleteFolderDialog: () => set({ showDeleteFolderDialog: null }),
  
  openBulkMoveModal: () => set({ showBulkMoveModal: true }),
  closeBulkMoveModal: () => set({ showBulkMoveModal: false }),
  
  openBulkDeleteDialog: () => set({ showBulkDeleteDialog: true }),
  closeBulkDeleteDialog: () => set({ showBulkDeleteDialog: false }),
  
  // Form actions
  setNewStudyTitle: (title) => set({ newStudyTitle: title }),
  setNewStudyDescription: (description) => set({ newStudyDescription: description }),
  setNewStudyType: (type) => set({ newStudyType: type }),
  setNewFolderName: (name) => set({ newFolderName: name }),
  setRenameTitle: (title) => set({ renameTitle: title }),
  setRenameFolderName: (name) => set({ renameFolderName: name }),
  
  resetForms: () => set({
    newStudyTitle: "",
    newStudyDescription: "",
    newStudyType: "",
    newFolderName: "",
    renameTitle: "",
    renameFolderName: "",
  }),
  
  // Selection actions
  toggleSelection: (studyId) => set((state: UIStore) => {
    const newSelection = new Set(state.selectedStudies);
    if (newSelection.has(studyId)) {
      newSelection.delete(studyId);
    } else {
      newSelection.add(studyId);
    }
    return { selectedStudies: newSelection };
  }),
  
  toggleSelectAll: (studyIds) => set((state: UIStore) => {
    const allSelected = studyIds.length > 0 && 
      studyIds.every(id => state.selectedStudies.has(id));
    
    if (allSelected) {
      return { selectedStudies: new Set() };
    } else {
      return { selectedStudies: new Set(studyIds) };
    }
  }),
  
  clearSelection: () => set({ selectedStudies: new Set() }),
  
  // Drag and drop actions
  setDraggedItem: (item) => set({ draggedItem: item }),
  setDropTargetId: (id) => set({ dropTargetId: id }),
  setIsDropTargetRoot: (isRoot) => set({ isDropTargetRoot: isRoot }),
  resetDragState: () => set({
    draggedItem: null,
    dropTargetId: null,
    isDropTargetRoot: false,
  }),
});
