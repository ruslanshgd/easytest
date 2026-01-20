import type { ViewerStore } from './index';
import type { StudyBlock } from './types';
import { supabase } from '../supabaseClient';
import { v4 as uuidv4 } from 'uuid';

export interface StudyData {
  study: {
    id: string;
    title: string;
    status: string;
  };
  blocks: StudyBlock[];
}

export interface StudyRunViewStore {
  // State
  studyData: StudyData | null;
  runId: string | null;
  currentBlockIndex: number;
  studyRunLoading: boolean;
  studyRunError: string | null;
  currentBlockSessionId: string | null;
  finished: boolean;
  
  // Actions
  setStudyData: (data: StudyData | null) => void;
  setRunId: (id: string | null) => void;
  setCurrentBlockIndex: (index: number) => void;
  setStudyRunLoading: (loading: boolean) => void;
  setStudyRunError: (error: string | null) => void;
  setCurrentBlockSessionId: (sessionId: string | null) => void;
  setFinished: (finished: boolean) => void;
  loadStudyAndStartRun: (token: string) => Promise<void>;
  createSessionForBlock: (prototypeId: string, blockId: string, studyId: string, runIdParam: string) => Promise<void>;
}

export const createStudyRunViewStore = (set: any, get: any): StudyRunViewStore => ({
  // Initial state
  studyData: null,
  runId: null,
  currentBlockIndex: 0,
  studyRunLoading: true,
  studyRunError: null,
  currentBlockSessionId: null,
  finished: false,
  
  // Actions
  setStudyData: (data) => set({ studyData: data }),
  setRunId: (id) => set({ runId: id }),
  setCurrentBlockIndex: (index) => set({ currentBlockIndex: index }),
  setStudyRunLoading: (studyRunLoading) => set({ studyRunLoading }),
  setStudyRunError: (studyRunError) => set({ studyRunError }),
  setCurrentBlockSessionId: (sessionId) => set({ currentBlockSessionId: sessionId }),
  setFinished: (finished) => set({ finished }),
  
  // Data loading
  loadStudyAndStartRun: async (token: string) => {
    set({ studyRunLoading: true, studyRunError: null });
    
    try {
      const { data: studyDataResult, error: studyError } = await supabase.rpc("rpc_get_public_study", { p_token: token });

      if (studyError) {
        if (studyError.message?.includes("stopped")) {
          set({ studyRunError: "Тестирование завершено. Этот тест больше не принимает ответы.", studyRunLoading: false });
        } else {
          set({ studyRunError: `Ошибка загрузки теста: ${studyError.message}`, studyRunLoading: false });
        }
        return;
      }

      if (!studyDataResult) {
        set({ studyRunError: "Тест не найден или токен недействителен", studyRunLoading: false });
        return;
      }

      const studyData = studyDataResult as StudyData;
      set({ studyData });

      // Create run
      const clientMeta = {
        user_agent: navigator.userAgent,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        window_width: window.innerWidth,
        window_height: window.innerHeight,
      };

      const { data: runIdResult, error: runError } = await supabase.rpc("rpc_start_public_run", {
        p_token: token,
        p_client_meta: JSON.stringify(clientMeta)
      });

      if (runError) {
        set({ studyRunError: `Ошибка создания прохождения: ${runError.message}`, studyRunLoading: false });
        return;
      }

      if (!runIdResult) {
        set({ studyRunError: "Не удалось создать прохождение", studyRunLoading: false });
        return;
      }

      set({ runId: runIdResult as string });

      // Create session for first block if it's a prototype
      const blocks = studyData.blocks;
      if (blocks.length > 0 && blocks[0].type === "prototype" && blocks[0].prototype_id) {
        await get().createSessionForBlock(blocks[0].prototype_id, blocks[0].id, studyData.study.id, runIdResult as string);
      }
      
      set({ studyRunLoading: false });
    } catch (err) {
      console.error("Unexpected error loading study:", err);
      set({ studyRunError: `Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`, studyRunLoading: false });
    }
  },
  
  createSessionForBlock: async (prototypeId: string, blockId: string, studyId: string, runIdParam: string) => {
    try {
      const newSessionId = uuidv4();
      const { error: insertError } = await supabase.from("sessions").insert([{
        id: newSessionId,
        prototype_id: prototypeId,
        user_id: null,
        run_id: runIdParam,
        block_id: blockId,
        study_id: studyId
      }]);

      if (insertError) {
        console.error("Error creating session:", insertError);
        return;
      }
      
      set({ currentBlockSessionId: newSessionId });
    } catch (err) {
      console.error("Unexpected error creating session:", err);
    }
  },
});
