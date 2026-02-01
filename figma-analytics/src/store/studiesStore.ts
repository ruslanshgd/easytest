import type { AppStore } from './index';
import type { Study, Folder, FolderWithCount, StudyStats } from './types';
import { supabase } from '../supabaseClient';

export interface StudiesStore {
  // State
  studies: Study[];
  folders: Folder[];
  currentFolderFolders: FolderWithCount[];
  breadcrumbs: Folder[];
  currentFolderId: string | null;
  studyStats: Record<string, StudyStats>;
  studiesLoading: boolean;
  
  // Actions
  setStudies: (studies: Study[]) => void;
  setFolders: (folders: Folder[]) => void;
  setCurrentFolderFolders: (folders: FolderWithCount[]) => void;
  setBreadcrumbs: (breadcrumbs: Folder[]) => void;
  setCurrentFolderId: (folderId: string | null) => void;
  setStudyStats: (stats: Record<string, StudyStats>) => void;
  setStudiesLoading: (loading: boolean) => void;
  
  // Data loading actions
  loadStudies: (folderId: string | null) => Promise<void>;
  loadFolders: () => Promise<void>;
  loadAllData: (folderId: string | null) => Promise<void>;
  
  // Helper actions
  buildBreadcrumbs: (folderId: string | null, allFolders: Folder[]) => Folder[];
  countStudiesInFolder: (folderId: string) => Promise<number>;
  countSubFolders: (folderId: string, allFolders: Folder[]) => number;
  getUserTeamId: (userId: string) => Promise<string | null>;
}

export const createStudiesStore = (set: any, get: any): StudiesStore => ({
  // Initial state
  studies: [],
  folders: [],
  currentFolderFolders: [],
  breadcrumbs: [],
  currentFolderId: null,
  studyStats: {},
  studiesLoading: false,
  
  // Basic setters
  setStudies: (studies) => set({ studies }),
  setFolders: (folders) => set({ folders }),
  setCurrentFolderFolders: (folders) => set({ currentFolderFolders: folders }),
  setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
  setCurrentFolderId: (folderId) => set({ currentFolderId: folderId }),
  setStudyStats: (stats) => set({ studyStats: stats }),
  setStudiesLoading: (studiesLoading) => set({ studiesLoading }),
  
  // Helper functions (current schema: team_members has only user_id)
  getUserTeamId: async (userId: string) => {
    const { data: byUserId, error } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !byUserId?.team_id) return null;
    return byUserId.team_id;
  },
  
  buildBreadcrumbs: (folderId: string | null, allFolders: Folder[]): Folder[] => {
    if (!folderId) return [];
    
    const chain: Folder[] = [];
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
  },
  
  countStudiesInFolder: async (folderId: string): Promise<number> => {
    const { count, error } = await supabase
      .from("studies")
      .select("*", { count: "exact", head: true })
      .eq("folder_id", folderId);
    
    if (error) {
      console.error("Error counting studies:", error);
      return 0;
    }
    
    return count || 0;
  },
  
  countSubFolders: (folderId: string, allFolders: Folder[]): number => {
    return allFolders.filter(f => f.parent_id === folderId).length;
  },
  
  // Data loading
  loadStudies: async (folderId: string | null) => {
    set({ studiesLoading: true });
    
    try {
      let studiesQuery = supabase
        .from("studies")
        .select("*")
        .order("created_at", { ascending: false });

      if (folderId) {
        studiesQuery = studiesQuery.eq("folder_id", folderId);
      } else {
        studiesQuery = studiesQuery.is("folder_id", null);
      }

      const { data: studiesData, error: studiesError } = await studiesQuery;

      if (studiesError) {
        console.error("Error loading studies:", studiesError);
        // Проверяем тип ошибки
        const errorMessage = studiesError.message || 'Ошибка загрузки тестов';
        // Если это сетевая ошибка, даем более понятное сообщение
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
          get().setError('Ошибка подключения к серверу. Проверьте интернет-соединение.');
        } else {
          get().setError(errorMessage);
        }
        set({ studiesLoading: false });
        return;
      }

      const loadedStudies = (studiesData || []) as Study[];
      set({ studies: loadedStudies });
      
      // Load stats for studies (опционально, не критично если не загрузится)
      if (loadedStudies.length > 0) {
        try {
          const studyIds = loadedStudies.map(s => s.id);
          
          const { data: blocksData } = await supabase
            .from("study_blocks")
            .select("id, study_id, type, order_index")
            .in("study_id", studyIds)
            .is("deleted_at", null)
            .order("order_index", { ascending: true });
          
          // Количество ответов = респонденты, у которых есть хотя бы одна сессия или ответ (удаление по блокам/по одному не оставляет пустые run в счётчике)
          const { data: runsData } = await supabase
            .from("study_runs")
            .select("id, study_id")
            .in("study_id", studyIds);
          const runIdToStudyId: Record<string, string> = {};
          const allRunIds: string[] = [];
          for (const r of runsData || []) {
            if (r.id && r.study_id) {
              runIdToStudyId[r.id] = r.study_id;
              allRunIds.push(r.id);
            }
          }
          const runsByStudy: Record<string, number> = {};
          for (const id of studyIds) runsByStudy[id] = 0;
          if (allRunIds.length > 0) {
            const runsWithSessionsByStudy: Record<string, Set<string>> = {};
            for (const id of studyIds) runsWithSessionsByStudy[id] = new Set();
            const { data: sessionsData } = await supabase
              .from("sessions")
              .select("run_id, study_id")
              .in("study_id", studyIds);
            for (const row of sessionsData || []) {
              if (row.run_id && row.study_id && runIdToStudyId[row.run_id] === row.study_id) {
                runsWithSessionsByStudy[row.study_id].add(row.run_id);
              }
            }
            const { data: responsesData } = await supabase
              .from("study_block_responses")
              .select("run_id")
              .in("run_id", allRunIds);
            const runsWithResponsesSet = new Set<string>();
            for (const row of responsesData || []) {
              if (row.run_id) runsWithResponsesSet.add(row.run_id);
            }
            for (const [runId, studyId] of Object.entries(runIdToStudyId)) {
              const hasSession = runsWithSessionsByStudy[studyId]?.has(runId) ?? false;
              const hasResponse = runsWithResponsesSet.has(runId);
              if (hasSession || hasResponse) runsByStudy[studyId] = (runsByStudy[studyId] ?? 0) + 1;
            }
          }
          
          const stats: Record<string, StudyStats> = {};
          for (const study of loadedStudies) {
            const studyBlocks = (blocksData || []).filter(b => b.study_id === study.id);
            stats[study.id] = {
              blocks: studyBlocks,
              sessionsCount: runsByStudy[study.id] ?? 0
            };
          }
          set({ studyStats: stats });
        } catch (statsErr) {
          // Не критично, просто логируем
          console.warn("Failed to load study stats:", statsErr);
        }
      }
    } catch (err) {
      console.error("Unexpected error loading studies:", err);
      get().setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      set({ studiesLoading: false });
    }
  },
  
  loadFolders: async () => {
    try {
      const { data: foldersData, error: foldersError } = await supabase
        .from("folders")
        .select("*")
        .order("name", { ascending: true });

      if (foldersError) {
        console.error("Error loading folders:", foldersError);
        // Проверяем тип ошибки
        const errorMessage = foldersError.message || 'Ошибка загрузки папок';
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
          // Не устанавливаем глобальную ошибку для папок, если это сетевая проблема
          // Основная ошибка будет установлена в loadStudies
          console.warn("Network error loading folders, continuing without folders");
        }
        // Продолжаем без папок, чтобы не блокировать загрузку
        return;
      }

      const allFolders = (foldersData || []) as Folder[];
      set({ folders: allFolders });
      
      // Build breadcrumbs and current folder folders
      const currentFolderId = get().currentFolderId;
      const breadcrumbs = get().buildBreadcrumbs(currentFolderId, allFolders);
      set({ breadcrumbs });
      
      const currentLevelFolders = allFolders.filter(f => 
        currentFolderId ? f.parent_id === currentFolderId : f.parent_id === null
      );
      
      // Загружаем счетчики с обработкой ошибок
      const foldersWithCounts: FolderWithCount[] = await Promise.all(
        currentLevelFolders.map(async folder => {
          try {
            const studiesCount = await get().countStudiesInFolder(folder.id);
            return {
              ...folder,
              studiesCount,
              subFoldersCount: get().countSubFolders(folder.id, allFolders)
            };
          } catch (err) {
            // Если ошибка при подсчете, используем 0
            console.warn(`Failed to count studies in folder ${folder.id}:`, err);
            return {
              ...folder,
              studiesCount: 0,
              subFoldersCount: get().countSubFolders(folder.id, allFolders)
            };
          }
        })
      );
      
      set({ currentFolderFolders: foldersWithCounts });
    } catch (err) {
      console.error("Unexpected error loading folders:", err);
      get().setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  
  loadAllData: async (folderId: string | null) => {
    // Защита от повторных вызовов - если уже загружаем, не запускаем снова
    if (get().studiesLoading) {
      console.log('StudiesStore: loadAllData skipped - already loading');
      return;
    }
    
    console.log('StudiesStore: loadAllData started', { folderId });
    set({ currentFolderId: folderId, studiesLoading: true });
    get().clearError();
    
    try {
      let user = null;
      let userError = null;
      
      try {
        const result = await supabase.auth.getUser();
        user = result.data?.user || null;
        userError = result.error || null;
      } catch (fetchErr) {
        // Перехватываем сетевые ошибки (AuthRetryableFetchError и другие)
        console.error("Error getting user (network error):", fetchErr);
        const errorMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        const errorName = (fetchErr as any)?.name || '';
        if (errorName === 'AuthRetryableFetchError' || errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
          get().setError('Ошибка подключения к серверу. Проверьте интернет-соединение.');
        } else {
          get().setError("Ошибка авторизации. Попробуйте обновить страницу.");
        }
        set({ studiesLoading: false });
        return;
      }
      
      if (userError) {
        console.error("Error getting user:", userError);
        // Проверяем тип ошибки
        const errorMessage = userError.message || String(userError);
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch') || userError?.name === 'AuthRetryableFetchError') {
          get().setError('Ошибка подключения к серверу. Проверьте интернет-соединение.');
        } else {
          get().setError("Требуется авторизация");
        }
        set({ studiesLoading: false });
        return;
      }
      
      if (!user) {
        get().setError("Требуется авторизация");
        set({ studiesLoading: false });
        return;
      }

      // Загружаем папки и исследования параллельно для ускорения
      // Если одна часть упадет, другая может загрузиться
      await Promise.allSettled([
        get().loadFolders().catch(err => {
          console.warn("Failed to load folders:", err);
          // Не критично, продолжаем
        }),
        get().loadStudies(folderId).catch(err => {
          console.error("Failed to load studies:", err);
          // Эта ошибка уже обрабатывается в loadStudies
        })
      ]);
      
      get().clearSelection();
    } catch (err) {
      console.error("Unexpected error loading data:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
        get().setError('Ошибка подключения к серверу. Проверьте интернет-соединение.');
      } else {
        get().setError(`Неожиданная ошибка: ${errorMessage}`);
      }
    } finally {
      console.log('StudiesStore: loadAllData finished, setting studiesLoading: false');
      set({ studiesLoading: false });
    }
  },
});
