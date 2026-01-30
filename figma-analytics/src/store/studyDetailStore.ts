import type { AppStore } from './index';
import type { BlockType } from './types';

export interface StudyDetailStore {
  // State
  activeTab: "builder" | "results" | "share";
  showAddBlockModal: boolean;
  editingBlockId: string | null;
  draggedBlockId: string | null;
  savingCount: number;
  isEditingTitle: boolean;
  editedTitle: string;
  
  // Form state for new block
  newBlockType: BlockType;
  selectedPrototypeId: string;
  newBlockInstructions: string;
  newBlockEyeTrackingEnabled: boolean;
  prototypeRecordScreen: boolean;
  prototypeRecordCamera: boolean;
  prototypeRecordAudio: boolean;
  
  // Block form states (will be simplified with forms per block type)
  [key: string]: any;
  
  // Actions
  setActiveTab: (tab: "builder" | "results" | "share") => void;
  setShowAddBlockModal: (show: boolean) => void;
  setEditingBlockId: (id: string | null) => void;
  setDraggedBlockId: (id: string | null) => void;
  incrementSaving: () => void;
  decrementSaving: () => void;
  setIsEditingTitle: (editing: boolean) => void;
  setEditedTitle: (title: string) => void;
  
  // Block form actions
  setNewBlockType: (type: BlockType) => void;
  setSelectedPrototypeId: (id: string) => void;
  setNewBlockInstructions: (instructions: string) => void;
  setNewBlockEyeTrackingEnabled: (enabled: boolean) => void;
  setPrototypeRecordScreen: (enabled: boolean) => void;
  setPrototypeRecordCamera: (enabled: boolean) => void;
  setPrototypeRecordAudio: (enabled: boolean) => void;
  resetBlockForm: () => void;
}

export const createStudyDetailStore = (set: any, get: any): StudyDetailStore => ({
  // Initial state
  activeTab: "builder",
  showAddBlockModal: false,
  editingBlockId: null,
  draggedBlockId: null,
  savingCount: 0,
  isEditingTitle: false,
  editedTitle: "",
  newBlockType: "prototype",
  selectedPrototypeId: "",
  newBlockInstructions: "",
  newBlockEyeTrackingEnabled: false,
  prototypeRecordScreen: false,
  prototypeRecordCamera: false,
  prototypeRecordAudio: false,
  
  // Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setShowAddBlockModal: (show) => set({ showAddBlockModal: show }),
  setEditingBlockId: (id) => set({ editingBlockId: id }),
  setDraggedBlockId: (id) => set({ draggedBlockId: id }),
  
  incrementSaving: () => set((state: StudyDetailStore) => ({ savingCount: state.savingCount + 1 })),
  decrementSaving: () => set((state: StudyDetailStore) => ({ 
    savingCount: Math.max(0, state.savingCount - 1) 
  })),
  
  setIsEditingTitle: (editing) => set({ isEditingTitle: editing }),
  setEditedTitle: (title) => set({ editedTitle: title }),
  
  // Block form actions
  setNewBlockType: (type) => set({ newBlockType: type }),
  setSelectedPrototypeId: (id) => set({ selectedPrototypeId: id }),
  setNewBlockInstructions: (instructions) => set({ newBlockInstructions: instructions }),
  setNewBlockEyeTrackingEnabled: (enabled) => set({ newBlockEyeTrackingEnabled: enabled }),
  setPrototypeRecordScreen: (enabled) => set({ prototypeRecordScreen: enabled }),
  setPrototypeRecordCamera: (enabled) => set({ prototypeRecordCamera: enabled }),
  setPrototypeRecordAudio: (enabled) => set({ prototypeRecordAudio: enabled }),
  
  resetBlockForm: () => set({
    newBlockType: "prototype",
    selectedPrototypeId: "",
    newBlockInstructions: "",
    newBlockEyeTrackingEnabled: false,
    prototypeRecordScreen: false,
    prototypeRecordCamera: false,
    prototypeRecordAudio: false,
  }),
});
