import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AuthStore } from './authStore';
import type { AuthFormStore } from './authFormStore';
import type { UIStore } from './uiStore';
import type { StudiesStore } from './studiesStore';
import type { StudyDetailStore } from './studyDetailStore';
import type { AnalyticsStore } from './analyticsStore';
import type { ProfileStore } from './profileStore';

import { createAuthStore } from './authStore';
import { createAuthFormStore } from './authFormStore';
import { createUIStore } from './uiStore';
import { createStudiesStore } from './studiesStore';
import { createStudyDetailStore } from './studyDetailStore';
import { createAnalyticsStore } from './analyticsStore';
import { createProfileStore } from './profileStore';

// Объединённый тип всего store
export type AppStore = AuthStore & AuthFormStore & UIStore & StudiesStore & StudyDetailStore & AnalyticsStore & ProfileStore;

// Глобальный store приложения
export const useAppStore = create<AppStore>()(
  devtools(
    (set, get, api) => ({
      ...createAuthStore(set),
      ...createAuthFormStore(set),
      ...createUIStore(set, get),
      ...createStudiesStore(set, get),
      ...createStudyDetailStore(set, get),
      ...createAnalyticsStore(set, get),
      ...createProfileStore(set, get),
    }),
    { name: 'FigmaAnalyticsStore' }
  )
);
