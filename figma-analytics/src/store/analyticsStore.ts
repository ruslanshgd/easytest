import type { AppStore } from './index';
import type { Session, SessionEvent, Proto, Screen } from './types';

export interface AnalyticsStore {
  // State
  sessions: Session[];
  sessionEvents: Record<string, SessionEvent[]>;
  expandedSessions: Set<string>;
  selectedSessions: Set<string>;
  analyticsLoading: boolean;
  deleting: boolean;
  prototypes: Record<string, Proto>;
  prototypeTaskDescriptions: Record<string, string | null>;
  sessionPrototypeIds: Record<string, string>;
  prototypeFlowIds: Record<string, string | null>;
  heatmapFilterSessions: Set<string>;
  taskHeatmapFilterSessions: Record<string, Set<string>>;
  selectedHeatmapScreen: { 
    screen: Screen; 
    proto: Proto; 
    clicks: Array<{ x: number; y: number; count: number }> 
  } | null;
  expandedTaskGroups: Set<string>;
  
  // Actions
  setSessions: (sessions: Session[]) => void;
  setSessionEvents: (events: Record<string, SessionEvent[]>) => void;
  toggleSessionExpanded: (sessionId: string) => void;
  toggleSessionSelected: (sessionId: string) => void;
  selectAllSessions: (sessionIds: string[]) => void;
  clearSessionSelection: () => void;
  setExpandedSessions: (sessions: Set<string>) => void;
  setAnalyticsLoading: (loading: boolean) => void;
  setDeleting: (deleting: boolean) => void;
  setPrototypes: (prototypes: Record<string, Proto>) => void;
  setPrototypeTaskDescriptions: (descriptions: Record<string, string | null>) => void;
  setSessionPrototypeIds: (ids: Record<string, string>) => void;
  setPrototypeFlowIds: (ids: Record<string, string | null>) => void;
  setHeatmapFilterSessions: (sessions: Set<string>) => void;
  setTaskHeatmapFilterSessions: (filters: Record<string, Set<string>>) => void;
  setSelectedHeatmapScreen: (screen: { 
    screen: Screen; 
    proto: Proto; 
    clicks: Array<{ x: number; y: number; count: number }> 
  } | null) => void;
  toggleTaskGroupExpanded: (prototypeId: string) => void;
}

export const createAnalyticsStore = (set: any, get: any): AnalyticsStore => ({
  // Initial state
  sessions: [],
  sessionEvents: {},
  expandedSessions: new Set(),
  selectedSessions: new Set(),
  analyticsLoading: false,
  deleting: false,
  prototypes: {},
  prototypeTaskDescriptions: {},
  sessionPrototypeIds: {},
  prototypeFlowIds: {},
  heatmapFilterSessions: new Set(),
  taskHeatmapFilterSessions: {},
  selectedHeatmapScreen: null,
  expandedTaskGroups: new Set(),
  
  // Actions
  setSessions: (sessions) => set({ sessions }),
  setSessionEvents: (events) => set({ sessionEvents: events }),
  
  toggleSessionExpanded: (sessionId) => set((state: AnalyticsStore) => {
    const newExpanded = new Set(state.expandedSessions);
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
    }
    return { expandedSessions: newExpanded };
  }),
  
  toggleSessionSelected: (sessionId) => set((state: AnalyticsStore) => {
    const newSelected = new Set(state.selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    return { selectedSessions: newSelected };
  }),
  
  selectAllSessions: (sessionIds) => set((state: AnalyticsStore) => {
    const allSelected = sessionIds.length > 0 && 
      sessionIds.every(id => state.selectedSessions.has(id));
    
    if (allSelected) {
      return { selectedSessions: new Set() };
    } else {
      return { selectedSessions: new Set(sessionIds) };
    }
  }),
  
  clearSessionSelection: () => set({ selectedSessions: new Set() }),
  
  setExpandedSessions: (sessions) => set({ expandedSessions: sessions }),
  
  setAnalyticsLoading: (analyticsLoading) => set({ analyticsLoading }),
  setDeleting: (deleting) => set({ deleting }),
  setPrototypes: (prototypes) => set({ prototypes }),
  setPrototypeTaskDescriptions: (descriptions) => set({ prototypeTaskDescriptions: descriptions }),
  setSessionPrototypeIds: (ids) => set({ sessionPrototypeIds: ids }),
  setPrototypeFlowIds: (ids) => set({ prototypeFlowIds: ids }),
  
  setHeatmapFilterSessions: (sessions) => set({ heatmapFilterSessions: sessions }),
  
  setTaskHeatmapFilterSessions: (filters) => set({ taskHeatmapFilterSessions: filters }),
  
  setSelectedHeatmapScreen: (screen) => set({ selectedHeatmapScreen: screen }),
  
  toggleTaskGroupExpanded: (prototypeId) => set((state: AnalyticsStore) => {
    const newExpanded = new Set(state.expandedTaskGroups);
    if (newExpanded.has(prototypeId)) {
      newExpanded.delete(prototypeId);
    } else {
      newExpanded.add(prototypeId);
    }
    return { expandedTaskGroups: newExpanded };
  }),
});
