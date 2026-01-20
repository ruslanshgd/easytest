import type { AppStore } from './index';
import type { BlockType } from './types';

export interface TreeTestingNode {
  id: string;
  name: string;
  children: TreeTestingNode[];
  isCorrect?: boolean;
}

export interface StudyDetailFormsStore {
  // Block form states
  newBlockType: BlockType;
  selectedPrototypeId: string;
  newBlockInstructions: string;
  
  // Open question form
  openQuestionText: string;
  openQuestionOptional: boolean;
  openQuestionImage: { file: File | null; url: string };
  
  // Choice form
  choiceImage: { file: File | null; url: string };
  choiceQuestion: string;
  choiceDescription: string;
  choiceOptions: string[];
  choiceAllowMultiple: boolean;
  choiceMaxSelections: number;
  choiceLimitSelections: boolean;
  choiceShuffle: boolean;
  choiceAllowOther: boolean;
  choiceAllowNone: boolean;
  choiceNoneText: string;
  choiceOptional: boolean;
  
  // Context form
  contextTitle: string;
  contextDescription: string;
  
  // Scale form
  scaleImage: { file: File | null; url: string };
  scaleQuestion: string;
  scaleDescription: string;
  scaleType: "numeric" | "emoji" | "stars";
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  scaleEmojiCount: 3 | 5;
  scaleOptional: boolean;
  
  // Preference form
  preferenceQuestion: string;
  preferenceComparisonType: "all" | "pairwise";
  preferenceImages: Array<{ file: File | null; url: string; uploading: boolean }>;
  preferenceShuffle: boolean;
  
  // Five seconds form
  fiveSecondsInstruction: string;
  fiveSecondsDuration: number;
  fiveSecondsImage: { file: File | null; url: string; uploading: boolean };
  
  // Card sorting form
  cardSortingTask: string;
  cardSortingType: "open" | "closed";
  cardSortingCards: Array<{ id: string; title: string; description: string; imageUrl: string; imageFile: File | null }>;
  cardSortingCategories: Array<{ id: string; name: string }>;
  cardSortingShuffleCards: boolean;
  cardSortingShuffleCategories: boolean;
  cardSortingAllowPartialSort: boolean;
  cardSortingShowImages: boolean;
  cardSortingShowDescriptions: boolean;
  showCardSortingCardsModal: boolean;
  showCardSortingCategoriesModal: boolean;
  
  // Tree testing form
  treeTestingTask: string;
  treeTestingDescription: string;
  treeTestingTree: TreeTestingNode[];
  treeTestingCorrectAnswers: string[];
  treeTestingAllowSkip: boolean;
  expandedTreeNodes: Set<string>;
  
  // Actions - simplified, will add specific setters if needed
  [key: string]: any;
}

export const createStudyDetailFormsStore = (set: any, get: any): StudyDetailFormsStore => ({
  // Initial state
  newBlockType: "prototype",
  selectedPrototypeId: "",
  newBlockInstructions: "",
  
  // Open question
  openQuestionText: "",
  openQuestionOptional: false,
  openQuestionImage: { file: null, url: "" },
  
  // Choice
  choiceImage: { file: null, url: "" },
  choiceQuestion: "",
  choiceDescription: "",
  choiceOptions: ["", ""],
  choiceAllowMultiple: false,
  choiceMaxSelections: 2,
  choiceLimitSelections: false,
  choiceShuffle: false,
  choiceAllowOther: false,
  choiceAllowNone: false,
  choiceNoneText: "Ничего из вышеперечисленного",
  choiceOptional: false,
  
  // Context
  contextTitle: "",
  contextDescription: "",
  
  // Scale
  scaleImage: { file: null, url: "" },
  scaleQuestion: "",
  scaleDescription: "",
  scaleType: "numeric",
  scaleMin: 1,
  scaleMax: 5,
  scaleMinLabel: "",
  scaleMaxLabel: "",
  scaleEmojiCount: 5,
  scaleOptional: false,
  
  // Preference
  preferenceQuestion: "",
  preferenceComparisonType: "all",
  preferenceImages: [
    { file: null, url: "", uploading: false },
    { file: null, url: "", uploading: false }
  ],
  preferenceShuffle: false,
  
  // Five seconds
  fiveSecondsInstruction: "",
  fiveSecondsDuration: 5,
  fiveSecondsImage: { file: null, url: "", uploading: false },
  
  // Card sorting
  cardSortingTask: "",
  cardSortingType: "open",
  cardSortingCards: [{ id: crypto.randomUUID(), title: "", description: "", imageUrl: "", imageFile: null }],
  cardSortingCategories: [{ id: crypto.randomUUID(), name: "" }],
  cardSortingShuffleCards: true,
  cardSortingShuffleCategories: true,
  cardSortingAllowPartialSort: false,
  cardSortingShowImages: false,
  cardSortingShowDescriptions: false,
  showCardSortingCardsModal: false,
  showCardSortingCategoriesModal: false,
  
  // Tree testing
  treeTestingTask: "",
  treeTestingDescription: "",
  treeTestingTree: [{ id: crypto.randomUUID(), name: "", children: [] }],
  treeTestingCorrectAnswers: [],
  treeTestingAllowSkip: false,
  expandedTreeNodes: new Set(),
});
