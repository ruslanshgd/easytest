import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { StudyRunViewStore } from './studyRunViewStore';
import type { TestViewStore } from './testViewStore';

import { createStudyRunViewStore } from './studyRunViewStore';
import { createTestViewStore } from './testViewStore';

// Объединённый тип всего store
export type ViewerStore = StudyRunViewStore & TestViewStore;

// Глобальный store приложения
export const useViewerStore = create<ViewerStore>()(
  devtools(
    (set, get) => ({
      ...createStudyRunViewStore(set, get),
      ...createTestViewStore(set, get),
    }),
    { name: 'FigmaViewerStore' }
  )
);
