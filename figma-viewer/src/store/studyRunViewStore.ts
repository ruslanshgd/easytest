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
    const normalizedToken = (token || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
    console.log("StudyRunViewStore: loadStudyAndStartRun called", { token: normalizedToken, supabaseUrl: supabase.supabaseUrl });
    set({ studyRunLoading: true, studyRunError: null });
    
    try {
      console.log("StudyRunViewStore: Calling rpc_get_public_study", { token: normalizedToken });
      const { data: studyDataResult, error: studyError } = await supabase.rpc("rpc_get_public_study", { p_token: normalizedToken });
      console.log("StudyRunViewStore: rpc_get_public_study result", { studyDataResult, studyError });

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
      console.log("StudyRunViewStore: Setting studyData", { studyData, blocksCount: studyData?.blocks?.length });
      set({ studyData });

      // Create run
      const clientMeta = {
        user_agent: navigator.userAgent,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        window_width: window.innerWidth,
        window_height: window.innerHeight,
      };

      console.log("StudyRunViewStore: Calling rpc_start_public_run", { token: normalizedToken, clientMeta });
      const { data: runIdResult, error: runError } = await supabase.rpc("rpc_start_public_run", {
        p_token: normalizedToken,
        p_client_meta: JSON.stringify(clientMeta)
      });
      console.log("StudyRunViewStore: rpc_start_public_run result", { runIdResult, runError });

      if (runError) {
        set({ studyRunError: `Ошибка создания прохождения: ${runError.message}`, studyRunLoading: false });
        return;
      }

      if (!runIdResult) {
        set({ studyRunError: "Не удалось создать прохождение", studyRunLoading: false });
        return;
      }

      set({ runId: runIdResult as string });
      console.log("StudyRunViewStore: RunId set", { runId: runIdResult });

      // Create session for first block if it's a prototype
      const blocks = studyData.blocks;
      console.log("StudyRunViewStore: Checking first block", { blocksCount: blocks.length, firstBlockType: blocks[0]?.type, firstBlockPrototypeId: blocks[0]?.prototype_id });
      if (blocks.length > 0 && blocks[0].type === "prototype" && blocks[0].prototype_id) {
        console.log("StudyRunViewStore: Creating session for first prototype block");
        await get().createSessionForBlock(blocks[0].prototype_id, blocks[0].id, studyData.study.id, runIdResult as string);
        console.log("StudyRunViewStore: Session created for first block, currentBlockSessionId should be set");
      }
      
      console.log("StudyRunViewStore: Setting studyRunLoading to false");
      set({ studyRunLoading: false });
    } catch (err) {
      console.error("Unexpected error loading study:", err);
      set({ studyRunError: `Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`, studyRunLoading: false });
    }
  },
  
  createSessionForBlock: async (prototypeId: string, blockId: string, studyId: string, runIdParam: string) => {
    console.log("StudyRunViewStore: createSessionForBlock called", { prototypeId, blockId, studyId, runIdParam });
    try {
      const newSessionId = uuidv4();
      console.log("StudyRunViewStore: Creating session", { newSessionId });
      
      const { error: insertError } = await supabase.from("sessions").insert([{
        id: newSessionId,
        prototype_id: prototypeId,
        user_id: null,
        run_id: runIdParam,
        block_id: blockId,
        study_id: studyId
      }]);

      if (insertError) {
        console.error("StudyRunViewStore: Error creating session:", insertError);
        return;
      }
      
      console.log("StudyRunViewStore: Session created successfully, setting currentBlockSessionId", { newSessionId });
      set({ currentBlockSessionId: newSessionId });
      console.log("StudyRunViewStore: currentBlockSessionId set", { currentBlockSessionId: newSessionId });
    } catch (err) {
      console.error("StudyRunViewStore: Unexpected error creating session:", err);
    }
  },
});
