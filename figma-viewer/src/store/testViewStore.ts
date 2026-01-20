import type { ViewerStore } from './index';
import type { Proto } from '../types/proto';

export interface TestViewStore {
  // State
  proto: Proto | null;
  currentScreen: string | null;
  testViewLoading: boolean;
  testViewError: string | null;
  isEmptyState: boolean;
  taskDescription: string | null;
  actualSessionId: string | null;
  debugOverlayEnabled: boolean;
  showSuccessPopup: boolean;
  
  // Actions
  setProto: (proto: Proto | null) => void;
  setCurrentScreen: (screenId: string | null) => void;
  setTestViewLoading: (loading: boolean) => void;
  setTestViewError: (error: string | null) => void;
  setIsEmptyState: (isEmpty: boolean) => void;
  setTaskDescription: (description: string | null) => void;
  setActualSessionId: (sessionId: string | null) => void;
  setDebugOverlayEnabled: (enabled: boolean) => void;
  setShowSuccessPopup: (show: boolean) => void;
}

export const createTestViewStore = (set: any, get: any): TestViewStore => ({
  // Initial state
  proto: null,
  currentScreen: null,
  testViewLoading: false,
  testViewError: null,
  isEmptyState: false,
  taskDescription: null,
  actualSessionId: null,
  debugOverlayEnabled: false,
  showSuccessPopup: false,
  
  // Actions
  setProto: (proto) => set({ proto }),
  setCurrentScreen: (screenId) => set({ currentScreen: screenId }),
  setTestViewLoading: (testViewLoading) => set({ testViewLoading }),
  setTestViewError: (testViewError) => set({ testViewError }),
  setIsEmptyState: (isEmpty) => set({ isEmptyState: isEmpty }),
  setTaskDescription: (description) => set({ taskDescription: description }),
  setActualSessionId: (sessionId) => set({ actualSessionId: sessionId }),
  setDebugOverlayEnabled: (enabled) => set({ debugOverlayEnabled: enabled }),
  setShowSuccessPopup: (show) => set({ showSuccessPopup: show }),
});
