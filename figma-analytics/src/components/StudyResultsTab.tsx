import { useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabaseClient";
import { getBlockTypeConfig, type BlockType } from "../lib/block-icons";
import { cn } from "../lib/utils";
import { chartColors, styleColors } from "../lib/styleUtils";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { 
  UserRoundCheck, 
  UserRoundX, 
  UserRoundMinus, 
  UserCheck,
  UserMinus,
  UserX,
  Clock, 
  CircleCheck, 
  CircleMinus,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Info,
  Map as MapIcon,
  Play,
  Flag,
  Trash2,
  MessageSquare,
  CirclePlay,
} from "lucide-react";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { 
  ReactFlow,
  Background, 
  Controls, 
  MarkerType,
  Handle,
  Position,
  BaseEdge
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { HeatmapRenderer } from "./HeatmapRenderer";

interface Screen {
  id: string;
  name: string;
  width: number;
  height: number;
  image: string;
}

interface Edge {
  from: string;
  to: string;
  id: string;
  trigger: string | null;
}

interface Proto {
  protoVersion: string;
  start: string;
  end: string;
  flowId?: string;
  screens: Screen[];
  hotspots: any[];
  edges: Edge[];
  targets: string[];
}

interface StudyRun {
  id: string;
  study_id: string;
  share_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: "started" | "finished" | "abandoned";
  client_meta: any;
}

interface StudyBlock {
  id: string;
  study_id: string;
  type: BlockType;
  order_index: number;
  prototype_id: string | null;
  instructions: string | null;
  config: any;
  eye_tracking_enabled?: boolean;
  deleted_at?: string | null;
}

interface GazePointRow {
  id?: string;
  session_id: string;
  run_id: string;
  study_id: string;
  block_id: string;
  screen_id: string | null;
  ts_ms: number;
  x_norm: number;
  y_norm: number;
}

interface Session {
  id: string;
  run_id: string;
  block_id: string;
  study_id: string;
  prototype_id: string | null;
  started_at: string;
  event_count?: number;
  completed?: boolean;
  aborted?: boolean;
  recording_url?: string | null;
}

interface StudyBlockResponse {
  id: string;
  run_id: string;
  block_id: string;
  answer: any;
  duration_ms: number | null;
  created_at: string;
}

interface StudyResultsTabProps {
  studyId: string;
  blocks: StudyBlock[];
}

type ReportViewMode = "summary" | "responses";
type CardSortingView = "matrix" | "categories" | "cards";
type TreeTestingView = "common_paths" | "first_clicks" | "final_points";
type HeatmapView = "heatmap" | "clicks" | "image";
type HeatmapTab = "by_screens" | "by_respondents";

export default function StudyResultsTab({ studyId, blocks }: StudyResultsTabProps) {
  const [runs, setRuns] = useState<StudyRun[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [responses, setResponses] = useState<StudyBlockResponse[]>([]);
  const [prototypes, setPrototypes] = useState<Record<string, Proto>>({});
  const [gazePoints, setGazePoints] = useState<GazePointRow[]>([]);
  
  // UI State
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ReportViewMode>("summary");
  const [cardSortingView, setCardSortingView] = useState<CardSortingView>("matrix");
  const [treeTestingView, setTreeTestingView] = useState<TreeTestingView>("common_paths");
  const [heatmapView, setHeatmapView] = useState<HeatmapView>("heatmap");
  const [heatmapTab, setHeatmapTab] = useState<HeatmapTab>("by_screens");
  const [respondentHeatmapView, setRespondentHeatmapView] = useState<HeatmapView>("heatmap");
  const [selectedHeatmapScreen, setSelectedHeatmapScreen] = useState<{ 
    screen: Screen; 
    proto: Proto; 
    blockId: string;
    screenIndex: number;
    totalScreens: number;
  } | null>(null);
  const [selectedRespondentScreen, setSelectedRespondentScreen] = useState<{
    screen: Screen;
    proto: Proto;
    session: Session;
    screenIndex: number;
    totalScreens: number;
  } | null>(null);
  const [modalJustOpened, setModalJustOpened] = useState(false);
  const [useGazeHeatmap, setUseGazeHeatmap] = useState(false);
  const [useRespondentGazeHeatmap, setUseRespondentGazeHeatmap] = useState(false);
  
  // Reset modalJustOpened flag after a short delay to prevent immediate backdrop clicks
  useEffect(() => {
    if (selectedRespondentScreen && modalJustOpened) {
      const timer = setTimeout(() => {
        setModalJustOpened(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedRespondentScreen, modalJustOpened]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [searchCategoryQuery, setSearchCategoryQuery] = useState("");
  const [searchCardQuery, setSearchCardQuery] = useState("");
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);
  const [onlyFirstClicks, setOnlyFirstClicks] = useState(false);
  const [showClickOrder, setShowClickOrder] = useState(false);
  const [recordingModalUrl, setRecordingModalUrl] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: runsData, error: runsError } = await supabase
        .from("study_runs")
        .select("*")
        .eq("study_id", studyId)
        .order("started_at", { ascending: false });

      if (runsError) {
        console.error("Error loading runs:", runsError);
        setError(runsError.message);
        setLoading(false);
        return;
      }

      setRuns(runsData || []);
      
      // Auto-select all runs
      if (runsData && runsData.length > 0) {
        setSelectedRuns(new Set(runsData.map(r => r.id)));
      }
    } catch (err) {
      console.error("Unexpected error loading runs:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  const loadSessionsAndEvents = useCallback(async () => {
    if (selectedRuns.size === 0) return;

    const runIds = Array.from(selectedRuns);
    const BATCH_SIZE = 25; // избегаем 400 из‑за слишком длинного URL (run_id=in.(...))
    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    try {
      let sessionsData: any[] = [];
      for (const batch of chunk(runIds, BATCH_SIZE)) {
        const { data, error: sessionsError } = await supabase
          .from("sessions")
          .select("id, run_id, block_id, study_id, prototype_id, started_at, completed, aborted")
          .in("run_id", batch)
          .not("run_id", "is", null);
        if (sessionsError) {
          console.error("Error loading sessions:", sessionsError);
          return;
        }
        sessionsData = sessionsData.concat(data || []);
      }

      let eventsData: any[] = [];
      for (const batch of chunk(runIds, BATCH_SIZE)) {
        const { data, error: eventsError } = await supabase
          .from("events")
          .select("*")
          .in("run_id", batch)
          .not("run_id", "is", null);
        if (eventsError) {
          console.error("Error loading events:", eventsError);
          return;
        }
        eventsData = eventsData.concat(data || []);
      }

      // Calculate metrics for sessions
      const sessionsWithMetrics = (sessionsData || []).map(session => {
        const sessionEvents = (eventsData || []).filter(e => e.session_id === session.id);
        
        const sortedEvents = [...sessionEvents].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const hasCompletedEvent = sortedEvents.some(e => e.event_type === "completed");
        const hasAbortedEvent = sortedEvents.some(e => e.event_type === "aborted");
        const hasClosedEvent = sortedEvents.some(e => e.event_type === "closed");
        
        let isCompleted = false;
        let isAborted = false;
        
        if (hasCompletedEvent) {
          const completedIdx = sortedEvents.findIndex(e => e.event_type === "completed");
          const abortedIdx = sortedEvents.findIndex(e => e.event_type === "aborted");
          const closedIdx = sortedEvents.findIndex(e => e.event_type === "closed");
          
          const completedTime = completedIdx >= 0 ? new Date(sortedEvents[completedIdx].timestamp).getTime() : 0;
          const abortedTime = abortedIdx >= 0 ? new Date(sortedEvents[abortedIdx].timestamp).getTime() : 0;
          const closedTime = closedIdx >= 0 ? new Date(sortedEvents[closedIdx].timestamp).getTime() : 0;
          
          isCompleted = completedTime >= abortedTime && completedTime >= closedTime;
          isAborted = !isCompleted && (hasAbortedEvent || hasClosedEvent);
        } else if (hasAbortedEvent || hasClosedEvent) {
          isAborted = true;
        } else {
          isCompleted = session.completed === true;
          isAborted = session.aborted === true;
        }
        
        return {
          ...session,
          event_count: sessionEvents.length,
          completed: isCompleted,
          aborted: isAborted
        };
      });

      // Sort sessions by started_at descending (newest first)
      const sortedSessions = [...sessionsWithMetrics].sort((a, b) => 
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      );
      
      setSessions(sortedSessions);
      setEvents(eventsData || []);

      // Логирование для диагностики
      console.log("StudyResultsTab: Loaded sessions and events:", {
        sessions_count: sessionsWithMetrics.length,
        events_count: eventsData?.length || 0,
        sessions_with_block_id: sessionsWithMetrics.filter(s => s.block_id).length,
        sessions_without_block_id: sessionsWithMetrics.filter(s => !s.block_id).length,
        events_with_block_id: (eventsData || []).filter(e => e.block_id).length,
        events_without_block_id: (eventsData || []).filter(e => !e.block_id).length,
        unique_block_ids_in_sessions: [...new Set(sessionsWithMetrics.map(s => s.block_id).filter(Boolean))],
        unique_block_ids_in_events: [...new Set((eventsData || []).map(e => e.block_id).filter(Boolean))],
        sample_session: sessionsWithMetrics[0] ? {
          id: sessionsWithMetrics[0].id,
          run_id: sessionsWithMetrics[0].run_id,
          block_id: sessionsWithMetrics[0].block_id,
          study_id: sessionsWithMetrics[0].study_id
        } : null
      });

      // Load prototypes
      const prototypeIdsFromBlocks = Array.from(new Set(
        blocks
          .filter(b => b.type === "prototype" && b.prototype_id)
          .map(b => b.prototype_id!)
      ));
      
      const prototypeIdsFromSessions = Array.from(new Set(
        (sessionsData || [])
          .filter(s => s.prototype_id)
          .map(s => s.prototype_id!)
      ));
      
      const allPrototypeIds = Array.from(new Set([...prototypeIdsFromBlocks, ...prototypeIdsFromSessions]));

      if (allPrototypeIds.length > 0) {
        const { data: prototypesData } = await supabase
          .from("prototypes")
          .select("id, data")
          .in("id", allPrototypeIds);

        if (prototypesData) {
          const prototypesMap: Record<string, any> = {};
          prototypesData.forEach(p => {
            if (p.data) {
              prototypesMap[p.id] = p.data;
            }
          });
          setPrototypes(prev => ({ ...prev, ...prototypesMap }));
        }
      }
    } catch (err) {
      console.error("Unexpected error loading sessions/events:", err);
    }
  }, [selectedRuns, studyId, blocks]);

  const loadGazePoints = useCallback(async () => {
    if (selectedRuns.size === 0) return;

    const hasEyeTrackingBlocks = blocks.some(
      (b) => b.type === "prototype" && (b.config?.eye_tracking_enabled || b.eye_tracking_enabled)
    );
    if (!hasEyeTrackingBlocks) {
      setGazePoints([]);
      return;
    }

    const runIds = Array.from(selectedRuns);
    const batchSize = 25;
    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    try {
      let all: any[] = [];
      for (const batch of chunk(runIds, batchSize)) {
        const { data, error } = await supabase
          .from("gaze_points")
          .select("*")
          .in("run_id", batch);
        if (error) {
          console.error("StudyResultsTab: Error loading gaze_points (table may not exist yet):", error);
          setGazePoints([]);
          return;
        }
        all = all.concat(data || []);
      }
      setGazePoints(all as GazePointRow[]);
    } catch (err) {
      console.error("StudyResultsTab: Unexpected error loading gaze_points:", err);
      setGazePoints([]);
    }
  }, [blocks, selectedRuns]);

  const loadResponses = useCallback(async () => {
    if (selectedRuns.size === 0) return;

    const runIds = Array.from(selectedRuns);
    const batchSize = 25;
    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    try {
      let responsesData: any[] = [];
      for (const batch of chunk(runIds, batchSize)) {
        const { data, error: responsesError } = await supabase
          .from("study_block_responses")
          .select("*")
          .in("run_id", batch);
        if (responsesError) {
          console.error("StudyResultsTab: Error loading responses:", responsesError);
          return;
        }
        responsesData = responsesData.concat(data || []);
      }

      const uniqueBlockIds = [...new Set(responsesData.map(r => r.block_id).filter(Boolean))];
      console.log("StudyResultsTab: Loaded responses:", {
        count: responsesData.length,
        runIds: runIds.length,
        sample: responsesData.slice(0, 3).map(r => ({
          id: r.id,
          run_id: r.run_id,
          block_id: r.block_id,
          has_answer: !!r.answer,
          duration_ms: r.duration_ms
        })),
        blockIds: uniqueBlockIds,
        blockIdsCount: uniqueBlockIds.length,
        responsesWithoutBlockId: responsesData.filter(r => !r.block_id).length,
        responsesByBlock: uniqueBlockIds.reduce((acc, bid) => {
          acc[bid] = responsesData.filter(r => r.block_id === bid).length;
          return acc;
        }, {} as Record<string, number>)
      });

      setResponses(responsesData);
    } catch (err) {
      console.error("StudyResultsTab: Unexpected error loading responses:", err);
    }
  }, [selectedRuns]);

  const deleteBlockResponses = useCallback(async (blockId: string, runIdOrSessionId?: string | null) => {
    // Определить тип блока
    const block = blocks.find(b => b.id === blockId);
    const blockType = block?.type || "unknown";
    
    // КРИТИЧНО: Определяем runId для удаления
    // Если передан runIdOrSessionId - удаляем только для этого run/сессии
    // Иначе удаляем для всех выбранных runs (режим summary)
    let targetRunIds: string[] = [];
    
    if (runIdOrSessionId) {
      // Проверяем, это sessionId или runId
      const session = sessions.find(s => s.id === runIdOrSessionId);
      if (session) {
        // Это sessionId - используем run_id из сессии
        targetRunIds = [session.run_id];
      } else if (selectedRuns.has(runIdOrSessionId)) {
        // Это runId - используем его
        targetRunIds = [runIdOrSessionId];
      } else {
        alert("Не найден run или сессия для удаления");
        return;
      }
    } else {
      // Режим summary - удаляем для всех выбранных runs
      if (selectedRuns.size === 0) {
        alert("Не выбраны runs для удаления");
        return;
      }
      targetRunIds = Array.from(selectedRuns);
    }
    
    console.log("=== deleteBlockResponses called ===", {
      blockId,
      blockType,
      runIdOrSessionId,
      targetRunIds,
      selectedRunsCount: selectedRuns.size,
      totalResponsesCount: responses.length,
      totalSessionsCount: sessions.length,
      allBlockIdsInResponses: [...new Set(responses.map(r => r.block_id).filter(Boolean))],
      responsesForThisBlock: responses.filter(r => r.block_id === blockId && targetRunIds.includes(r.run_id)).length,
      sessionsForThisBlock: sessions.filter(s => s.block_id === blockId && targetRunIds.includes(s.run_id)).length
    });

    const runIdsText = targetRunIds.length === 1 ? "1 run" : `${targetRunIds.length} runs`;
    
    try {
      // Для prototype блоков удаляем сессии, для остальных - ответы из study_block_responses
      if (blockType === "prototype") {
        // Проверить сессии в БД
        const { data: checkSessions, error: checkSessionsError } = await supabase
          .from("sessions")
          .select("id, run_id, block_id")
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        if (checkSessionsError) {
          console.error("Error checking sessions before delete:", checkSessionsError);
          alert("Ошибка при проверке сессий: " + checkSessionsError.message);
          return;
        }
        
        const sessionsInDB = checkSessions?.length || 0;
        const sessionsInLocal = sessions.filter(s => s.block_id === blockId && targetRunIds.includes(s.run_id)).length;
        
        console.log(`Found ${sessionsInDB} sessions in DB for prototype block ${blockId} in ${targetRunIds.length} runs`, {
          sessionsInLocal,
          checkSessionsSample: checkSessions?.slice(0, 3)
        });
        
        if (sessionsInDB === 0) {
          alert("В базе данных нет сессий для удаления для этого prototype блока в выбранных runs");
          return;
        }
        
        const confirmText = runIdOrSessionId 
          ? `Удалить ${sessionsInDB} сессий для этого prototype блока для выбранного респондента? Это также удалит связанные события и данные.`
          : `Удалить ${sessionsInDB} сессий для этого prototype блока в выбранных ${runIdsText}? Это также удалит связанные события и данные.`;
        
        if (!confirm(confirmText)) return;
        
        // Удалить сессии (связанные события удалятся каскадно через foreign key)
        const { error: deleteSessionsError } = await supabase
          .from("sessions")
          .delete()
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        if (deleteSessionsError) {
          console.error("Error deleting sessions:", deleteSessionsError);
          alert("Ошибка при удалении сессий: " + deleteSessionsError.message);
          return;
        }
        
        // Проверить результат удаления
        const { data: verifySessions, error: verifySessionsError } = await supabase
          .from("sessions")
          .select("id")
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        const remainingSessions = verifySessions?.length || 0;
        const actuallyDeleted = sessionsInDB - remainingSessions;
        
        console.log(`Delete sessions result: found ${sessionsInDB} before, ${remainingSessions} after, deleted ${actuallyDeleted} sessions`);
        
        if (actuallyDeleted > 0) {
          console.log(`Successfully deleted ${actuallyDeleted} sessions for prototype block ${blockId}`);
          // Обновить локальное состояние
          setSessions(prev => prev.filter(s => !(s.block_id === blockId && targetRunIds.includes(s.run_id))));
          setEvents(prev => prev.filter(e => !(e.block_id === blockId && targetRunIds.includes(e.run_id))));
          // Перезагрузить данные
          await loadSessionsAndEvents();
          // КРИТИЧНО: Перезагрузить ответы, так как они могут быть связаны с удаленными сессиями
          await loadResponses();
        } else {
          alert("Сессии не были удалены. Возможно, проблема с правами доступа (RLS политика).");
        }
      } else {
        // Для не-prototype блоков удаляем ответы из study_block_responses
        const { data: checkData, error: checkError } = await supabase
          .from("study_block_responses")
          .select("id, run_id, block_id")
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        if (checkError) {
          console.error("Error checking responses before delete:", checkError);
          alert("Ошибка при проверке ответов: " + checkError.message);
          return;
        }
        
        const responsesInDB = checkData?.length || 0;
        const responsesInLocal = responses.filter(r => r.block_id === blockId && targetRunIds.includes(r.run_id)).length;
        
        console.log(`Found ${responsesInDB} responses in DB for block ${blockId} in ${targetRunIds.length} runs`, {
          responsesInLocal,
          checkDataSample: checkData?.slice(0, 3)
        });
        
        if (responsesInDB === 0) {
          alert("В базе данных нет ответов для удаления для этого блока в выбранных runs");
          return;
        }
        
        const confirmText = runIdOrSessionId
          ? `Удалить ${responsesInDB} ответов для этого блока для выбранного респондента?`
          : `Удалить ${responsesInDB} ответов для этого блока в выбранных ${runIdsText}?`;
        
        if (!confirm(confirmText)) return;
        
        // Выполнить удаление
        const { error } = await supabase
          .from("study_block_responses")
          .delete()
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        if (error) {
          console.error("Error deleting responses:", error);
          alert("Ошибка при удалении ответов: " + error.message);
          return;
        }
        
        // Проверить результат удаления
        const { data: verifyData, error: verifyError } = await supabase
          .from("study_block_responses")
          .select("id")
          .eq("block_id", blockId)
          .in("run_id", targetRunIds);
        
        const remainingCount = verifyData?.length || 0;
        const actuallyDeleted = responsesInDB - remainingCount;
        
        console.log(`Delete result: found ${responsesInDB} before, ${remainingCount} after, deleted ${actuallyDeleted} responses`);
        
        if (actuallyDeleted > 0) {
          console.log(`Successfully deleted ${actuallyDeleted} responses for block ${blockId}`);
          // Обновить локальное состояние
          setResponses(prev => prev.filter(r => !(r.block_id === blockId && targetRunIds.includes(r.run_id))));
          // Перезагрузить данные для пересчета аналитики
          await loadResponses();
          // КРИТИЧНО: Перезагрузить сессии и события для пересчета аналитики в сводном отчете
          await loadSessionsAndEvents();
        } else {
          alert("Ответы не были удалены. Возможно, проблема с правами доступа (RLS политика).");
        }
      }
    } catch (err) {
      console.error("Error deleting responses:", err);
      alert("Ошибка при удалении: " + (err instanceof Error ? err.message : String(err)));
    }
  }, [selectedRuns, loadResponses, loadSessionsAndEvents, responses, sessions, blocks]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (selectedRuns.size > 0) {
      loadSessionsAndEvents();
      loadResponses();
      loadGazePoints();
    } else {
      setSessions([]);
      setEvents([]);
      setResponses([]);
      setGazePoints([]);
    }
  }, [selectedRuns, loadSessionsAndEvents, loadResponses, loadGazePoints]);

  // Auto-select first block or first session
  useEffect(() => {
    if (viewMode === "summary") {
      if (blocks.length > 0 && !selectedBlockId) {
        setSelectedBlockId(blocks[0].id);
      }
    } else if (viewMode === "responses") {
      if (sessions.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sessions[0].id);
      } else if (sessions.length === 0 && responses.length > 0 && selectedRuns.size > 0 && !selectedSessionId) {
        // Если нет сессий, но есть ответы - выбираем первый run с ответами
        const selectedRunIds = Array.from(selectedRuns);
        const firstRunWithResponses = selectedRunIds.find(runId => 
          responses.some(r => r.run_id === runId)
        );
        if (firstRunWithResponses) {
          setSelectedSessionId(firstRunWithResponses);
        }
      }
    }
  }, [blocks, selectedBlockId, sessions, selectedSessionId, viewMode]);

  // Calculate total respondents count (not responses count)
  // КРИТИЧНО: Показываем количество респондентов (людей), а не количество ответов.
  // Должно совпадать со списком слева: только люди с сессиями или ответами.
  // НЕ используем runs.length: после удаления всех ответов/сессий список пуст — и счётчик должен быть 0.
  const totalResponsesCount = (() => {
    if (sessions.length > 0) {
      return sessions.length;
    }
    if (responses.length > 0) {
      const uniqueRunIds = new Set(responses.map(r => r.run_id));
      return uniqueRunIds.size;
    }
    return 0;
  })();

  // Get selected block
  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || blocks[0] || null;
  const selectedRun = runs.find(r => r.id === selectedRunId) || null;

  // Parse user agent to get OS and browser
  const parseUserAgent = (userAgent: string | null | undefined) => {
    if (!userAgent) return { os: "Неизвестно", browser: "Неизвестно" };
    
    let os = "Неизвестно";
    let browser = "Неизвестно";
    
    // Parse OS
    if (userAgent.includes("Mac OS X") || userAgent.includes("Macintosh")) {
      os = "Mac OS";
    } else if (userAgent.includes("Windows")) {
      os = "Windows";
    } else if (userAgent.includes("Linux")) {
      os = "Linux";
    } else if (userAgent.includes("Android")) {
      os = "Android";
    } else if (userAgent.includes("iOS")) {
      os = "iOS";
    }
    
    // Parse Browser
    if (userAgent.includes("Chrome") && !userAgent.includes("Edg") && !userAgent.includes("OPR")) {
      browser = "Chrome";
    } else if (userAgent.includes("Firefox")) {
      browser = "Firefox";
    } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
      browser = "Safari";
    } else if (userAgent.includes("Edg")) {
      browser = "Edge";
    } else if (userAgent.includes("OPR")) {
      browser = "Opera";
    } else if (userAgent.includes("MSIE") || userAgent.includes("Trident")) {
      browser = "Internet Explorer";
    }
    
    return { os, browser };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Загрузка результатов...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-destructive">Ошибка: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Left Sidebar - Block List or Sessions List */}
      <div className="w-80 bg-muted flex flex-col relative">
        {/* Full height border */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-border" />
        
        {/* Tabs */}
        <div className="px-3 pt-3 pb-3 flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setViewMode("summary");
                if (blocks.length > 0 && !selectedBlockId) {
                  setSelectedBlockId(blocks[0].id);
                }
              }}
              className={cn(
                "flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                viewMode === "summary"
                  ? "bg-primary text-white"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              Сводный
            </button>
            <button
              onClick={() => {
                setViewMode("responses");
                if (sessions.length > 0 && !selectedSessionId) {
                  setSelectedSessionId(sessions[0].id);
                } else if (runs.length > 0 && !selectedRunId) {
                  setSelectedRunId(runs[0].id);
                }
              }}
              className={cn(
                "flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                viewMode === "responses"
                  ? "bg-primary text-white"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              Ответы {totalResponsesCount}
            </button>
          </div>
        </div>

        {/* Block List or Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
          {viewMode === "summary" ? (
            // Show blocks in summary mode
            blocks.map((block, index) => {
              const blockConfig = getBlockTypeConfig(block.type);
              const IconComponent = blockConfig.icon;
              const isSelected = selectedBlockId === block.id;
              
              return (
                <button
                  key={block.id}
                  onClick={() => setSelectedBlockId(block.id)}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 rounded-xl transition-all text-left",
                    isSelected
                      ? "bg-primary text-white shadow-md"
                      : "bg-card border border-border hover:border-primary/30"
                  )}
                >
                  <span className="text-sm font-medium">{index + 1}.</span>
                  <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
                    isSelected ? "bg-white/20" : "bg-muted"
                  )}>
                    <IconComponent size={14} className={isSelected ? "text-white" : "text-muted-foreground"} />
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">
                    {blockConfig.label}
                  </span>
                </button>
              );
            })
          ) : (
            // Show sessions in responses mode, or runs if no sessions but responses exist
            (() => {
              // Если есть сессии - показываем их
              if (sessions.length > 0) {
                return sessions.map((session) => {
                  const isSelected = selectedSessionId === session.id;
                  const sessionResponses = responses.filter(r => r.run_id === session.run_id);
                  const responsesCount = sessionResponses.length;
                  
                  // Find run for this session to get client_meta
                  const run = runs.find(r => r.id === session.run_id);
                  let userAgent: string | null = null;
                  
                  if (run) {
                    try {
                      const clientMeta = run.client_meta;
                      if (typeof clientMeta === "string") {
                        const parsed = JSON.parse(clientMeta);
                        userAgent = parsed.user_agent || null;
                      } else if (clientMeta && typeof clientMeta === "object") {
                        userAgent = (clientMeta as any).user_agent || null;
                      }
                    } catch (e) {
                      console.error("Error parsing client_meta:", e);
                    }
                  }
                  
                  const { os, browser } = parseUserAgent(userAgent);
                  const date = new Date(session.started_at);
                  
                  return (
                    <button
                      key={session.id}
                      onClick={() => setSelectedSessionId(session.id)}
                      className={cn(
                        "w-full flex flex-col gap-1 p-3 rounded-xl transition-all text-left",
                        isSelected
                          ? "bg-primary text-white shadow-md"
                          : "bg-card border border-border hover:border-primary/30"
                      )}
                    >
                      <div className={cn("text-sm font-medium", isSelected ? "text-white" : "text-foreground")}>
                        {date.toLocaleDateString("ru-RU", { 
                          day: "2-digit", 
                          month: "short", 
                          hour: "2-digit",
                          minute: "2-digit"
                        }).replace(" г.,", ",")}
                      </div>
                      <div className={cn("flex items-center gap-1 text-xs", isSelected ? "text-white/80" : "text-muted-foreground")}>
                        <span>{os}</span>
                        <span>*</span>
                        <span>{browser}</span>
                        {responsesCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{responsesCount} {responsesCount === 1 ? "ответ" : responsesCount < 5 ? "ответа" : "ответов"}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                });
              }
              
              // Если нет сессий, но есть ответы - показываем список runs на основе ответов
              if (responses.length > 0 && selectedRuns.size > 0) {
                const selectedRunIds = Array.from(selectedRuns);
                const runsWithResponses = selectedRunIds
                  .map(runId => {
                    const run = runs.find(r => r.id === runId);
                    const runResponses = responses.filter(r => r.run_id === runId);
                    return { runId, run, responsesCount: runResponses.length };
                  })
                  .filter(item => item.responsesCount > 0)
                  .sort((a, b) => {
                    // Сортируем по дате создания run (если есть) или по количеству ответов
                    if (a.run && b.run) {
                      return new Date(b.run.started_at).getTime() - new Date(a.run.started_at).getTime();
                    }
                    return b.responsesCount - a.responsesCount;
                  });
                
                return runsWithResponses.map(({ runId, run, responsesCount }) => {
                  const isSelected = selectedSessionId === runId;
                  
                  let userAgent: string | null = null;
                  if (run) {
                    try {
                      const clientMeta = run.client_meta;
                      if (typeof clientMeta === "string") {
                        const parsed = JSON.parse(clientMeta);
                        userAgent = parsed.user_agent || null;
                      } else if (clientMeta && typeof clientMeta === "object") {
                        userAgent = (clientMeta as any).user_agent || null;
                      }
                    } catch (e) {
                      console.error("Error parsing client_meta:", e);
                    }
                  }
                  
                  const { os, browser } = parseUserAgent(userAgent);
                  const date = run ? new Date(run.started_at) : new Date();
                  
                  return (
                    <button
                      key={runId}
                      onClick={() => {
                        setSelectedSessionId(runId);
                      }}
                      className={cn(
                        "w-full flex flex-col gap-1 p-3 rounded-xl transition-all text-left",
                        isSelected
                          ? "bg-primary text-white shadow-md"
                          : "bg-card border border-border hover:border-primary/30"
                      )}
                    >
                      <div className={cn("text-sm font-medium", isSelected ? "text-white" : "text-foreground")}>
                        {date.toLocaleDateString("ru-RU", { 
                          day: "2-digit", 
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit"
                        }).replace(" г.,", ",")}
                      </div>
                      <div className={cn("flex items-center gap-1 text-xs", isSelected ? "text-white/80" : "text-muted-foreground")}>
                        <span>{os}</span>
                        <span>*</span>
                        <span>{browser}</span>
                        {responsesCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{responsesCount} {responsesCount === 1 ? "ответ" : responsesCount < 5 ? "ответа" : "ответов"}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                });
              }
              
              return (
                <div className="text-center text-muted-foreground text-sm py-4">
                  Нет данных для отображения
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted">
        <div className="flex-1 overflow-y-auto bg-muted">
          <div className="max-w-3xl mx-auto pt-6">
          {viewMode === "summary" && selectedBlock && (() => {
            // КРИТИЧНО: Для prototype блоков — сессии по block_id, fallback по prototype_id
            let filteredSessions = sessions.filter(s => s.block_id === selectedBlock!.id);
            if (selectedBlock.type === "prototype" && filteredSessions.length === 0 && selectedBlock.prototype_id) {
              const runIds = new Set(selectedRuns);
              filteredSessions = sessions.filter(
                s => s.prototype_id === selectedBlock.prototype_id && runIds.has(s.run_id)
              );
            }

            // Для prototype: события по session_id (чтобы не терять события без block_id). Иначе — по block_id.
            const filteredEvents = selectedBlock.type === "prototype"
              ? events.filter(e => filteredSessions.some(s => s.id === e.session_id))
              : events.filter(e => e.block_id === selectedBlock.id);

            // КРИТИЧНО: Для prototype блоков ответы могут не иметь прямого block_id
            let filteredResponses: typeof responses = [];
            if (selectedBlock.type === "prototype") {
              const blockSessions = filteredSessions;
              const sessionIds = new Set(blockSessions.map(s => s.id));
              if (sessionIds.size > 0) {
                const runIdsFromSessions = new Set(blockSessions.map(s => s.run_id));
                filteredResponses = responses.filter(r => r.run_id && runIdsFromSessions.has(r.run_id));
              } else {
                const selectedRunIds = Array.from(selectedRuns);
                filteredResponses = responses.filter(r =>
                  selectedRunIds.includes(r.run_id) &&
                  (!r.block_id || r.block_id === selectedBlock.id)
                );
              }
            } else {
              filteredResponses = responses.filter(r => r.block_id === selectedBlock.id);
            }

            // Логирование для диагностики фильтрации
            const allBlockIdsInResponses = [...new Set(responses.map(r => r.block_id).filter(Boolean))];
            const sampleResponses = responses.slice(0, 5).map(r => ({
              id: r.id,
              run_id: r.run_id,
              block_id: r.block_id
            }));
            const byBlockId = sessions.filter(s => s.block_id === selectedBlock.id).length;
            const usedFallback = selectedBlock.type === "prototype" && byBlockId === 0 && filteredSessions.length > 0;
            console.log("StudyResultsTab: Filtering data for block:", {
              block_id: selectedBlock.id,
              block_type: selectedBlock.type,
              total_responses: responses.length,
              filtered_responses: filteredResponses.length,
              total_sessions: sessions.length,
              filtered_sessions: filteredSessions.length,
              total_events: events.length,
              filtered_events: filteredEvents.length,
              all_block_ids_in_responses: allBlockIdsInResponses,
              sample_responses: sampleResponses,
              sample_filtered_response: filteredResponses[0] ? {
                id: filteredResponses[0].id,
                run_id: filteredResponses[0].run_id,
                block_id: filteredResponses[0].block_id
              } : null,
              selected_runs_count: selectedRuns.size,
              prototype_filtering_method: selectedBlock.type === "prototype"
                ? (byBlockId > 0 ? "by_block_id" : usedFallback ? "by_prototype_id_fallback" : "by_run_id_without_block_id")
                : "by_block_id"
            });
            
            // КРИТИЧНО: Для prototype блоков PrototypeView не использует responses,
            // но мы все равно передаем их для совместимости
            // Данные для prototype блоков хранятся в sessions и events
            return (
              <BlockReportView
                block={selectedBlock}
                blocks={blocks}
                responses={filteredResponses}
                sessions={filteredSessions}
                events={filteredEvents}
              prototypes={prototypes}
              viewMode={viewMode}
              cardSortingView={cardSortingView}
              setCardSortingView={setCardSortingView}
              treeTestingView={treeTestingView}
              setTreeTestingView={setTreeTestingView}
              heatmapView={heatmapView}
              setHeatmapView={setHeatmapView}
              heatmapTab={heatmapTab}
              setHeatmapTab={setHeatmapTab}
              selectedHeatmapScreen={selectedHeatmapScreen}
              setSelectedHeatmapScreen={setSelectedHeatmapScreen}
              selectedRespondentScreen={selectedRespondentScreen}
              setSelectedRespondentScreen={setSelectedRespondentScreen}
              respondentHeatmapView={respondentHeatmapView}
              setRespondentHeatmapView={setRespondentHeatmapView}
              expandedCategories={expandedCategories}
              setExpandedCategories={setExpandedCategories}
              expandedCards={expandedCards}
              setExpandedCards={setExpandedCards}
              searchCategoryQuery={searchCategoryQuery}
              setSearchCategoryQuery={setSearchCategoryQuery}
              searchCardQuery={searchCardQuery}
              setSearchCardQuery={setSearchCardQuery}
              showHiddenCategories={showHiddenCategories}
              setShowHiddenCategories={setShowHiddenCategories}
              onlyFirstClicks={onlyFirstClicks}
              setOnlyFirstClicks={setOnlyFirstClicks}
              showClickOrder={showClickOrder}
              setShowClickOrder={setShowClickOrder}
              setModalJustOpened={setModalJustOpened}
              onDeleteResponses={viewMode === "responses" ? (blockId: string) => {
                // КРИТИЧНО: В режиме "ответы" передаем runId/sessionId для удаления только конкретного респондента
                const runIdOrSessionId = selectedSessionId;
                return deleteBlockResponses(blockId, runIdOrSessionId);
              } : undefined}
              />
            );
          })()}
          {viewMode === "responses" && (() => {
            // КРИТИЧНО: Если есть selectedSessionId - показываем данные для этой сессии или run
            if (selectedSessionId) {
              // Сначала проверяем, это сессия или run
              const selectedSession = sessions.find(s => s.id === selectedSessionId);
              
              if (selectedSession) {
                // Это сессия - показываем данные для этой сессии
                const sessionRunId = selectedSession.run_id;
                return (
                  <AllBlocksReportView
                    blocks={blocks}
                    sessionId={selectedSession.id}
                    runId={sessionRunId}
                    responses={responses.filter(r => r.run_id === sessionRunId)}
                    sessions={sessions.filter(s => s.run_id === sessionRunId)}
                    events={events.filter(e => e.run_id === sessionRunId)}
                    prototypes={prototypes}
                    onDeleteResponses={(blockId: string) => {
                      return deleteBlockResponses(blockId, sessionRunId);
                    }}
                  />
                );
              } else if (selectedRuns.has(selectedSessionId)) {
                // Это run - показываем данные для этого run
                const runId = selectedSessionId;
                const runResponses = responses.filter(r => r.run_id === runId);
                
                if (runResponses.length > 0) {
                  return (
                    <AllBlocksReportView
                      blocks={blocks}
                      sessionId={undefined}
                      runId={runId}
                      responses={runResponses}
                      sessions={[]}
                      events={events.filter(e => e.run_id === runId)}
                      prototypes={prototypes}
                      onDeleteResponses={(blockId: string) => {
                        return deleteBlockResponses(blockId, runId);
                      }}
                    />
                  );
                }
              }
            }
            
            return (
              <div className="text-center text-muted-foreground py-8">
                Выберите респондента из списка слева для просмотра ответов
              </div>
            );
          })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// Component for rendering block-specific report views
interface BlockReportViewProps {
  block: StudyBlock;
  blocks: StudyBlock[];
  responses: StudyBlockResponse[];
  sessions: Session[];
  events: any[];
  prototypes: Record<string, Proto>;
  viewMode: ReportViewMode;
  cardSortingView: CardSortingView;
  setCardSortingView: (view: CardSortingView) => void;
  treeTestingView: TreeTestingView;
  setTreeTestingView: (view: TreeTestingView) => void;
  heatmapView: HeatmapView;
  setHeatmapView: (view: HeatmapView) => void;
  heatmapTab: HeatmapTab;
  setHeatmapTab: (tab: HeatmapTab) => void;
  selectedHeatmapScreen: { screen: Screen; proto: Proto; blockId: string; screenIndex: number; totalScreens: number } | null;
  setSelectedHeatmapScreen: (screen: { screen: Screen; proto: Proto; blockId: string; screenIndex: number; totalScreens: number } | null) => void;
  selectedRespondentScreen: { screen: Screen; proto: Proto; session: Session; screenIndex: number; totalScreens: number } | null;
  setSelectedRespondentScreen: (screen: { screen: Screen; proto: Proto; session: Session; screenIndex: number; totalScreens: number } | null) => void;
  respondentHeatmapView: HeatmapView;
  setRespondentHeatmapView: (view: HeatmapView) => void;
  expandedCategories: Set<string>;
  setExpandedCategories: (set: Set<string>) => void;
  expandedCards: Set<string>;
  setExpandedCards: (set: Set<string>) => void;
  searchCategoryQuery: string;
  setSearchCategoryQuery: (query: string) => void;
  searchCardQuery: string;
  setSearchCardQuery: (query: string) => void;
  showHiddenCategories: boolean;
  setShowHiddenCategories: (show: boolean) => void;
  onlyFirstClicks: boolean;
  setOnlyFirstClicks: (only: boolean) => void;
  showClickOrder: boolean;
  setShowClickOrder: (show: boolean) => void;
  setModalJustOpened: (value: boolean) => void;
  recordingModalUrl?: string | null;
  setRecordingModalUrl?: (url: string | null) => void;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function BlockReportView({
  block,
  blocks,
  responses,
  sessions,
  events,
  prototypes,
  viewMode,
  cardSortingView,
  setCardSortingView,
  treeTestingView,
  setTreeTestingView,
  heatmapView,
  setHeatmapView,
  heatmapTab,
  setHeatmapTab,
  selectedHeatmapScreen,
  setSelectedHeatmapScreen,
  selectedRespondentScreen,
  setSelectedRespondentScreen,
  respondentHeatmapView,
  setRespondentHeatmapView,
  expandedCategories,
  setExpandedCategories,
  expandedCards,
  setExpandedCards,
  searchCategoryQuery,
  setSearchCategoryQuery,
  searchCardQuery,
  setSearchCardQuery,
  showHiddenCategories,
  setShowHiddenCategories,
  onlyFirstClicks,
  setOnlyFirstClicks,
  showClickOrder,
  setShowClickOrder,
  setModalJustOpened,
  recordingModalUrl,
  setRecordingModalUrl,
  onDeleteResponses
}: BlockReportViewProps) {
  // Вычисляем индекс блока
  const blockIndex = blocks.findIndex(b => b.id === block.id);
  
  // Render based on block type
  switch (block.type) {
    case "open_question":
      return <OpenQuestionView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "scale":
      return <ScaleView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "choice":
      return <ChoiceView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "preference":
      return <PreferenceView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "matrix":
      return <MatrixView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "agreement":
      return <AgreementView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "card_sorting":
      return (
        <CardSortingViewComponent
          block={block}
          blockIndex={blockIndex}
          responses={responses}
          viewMode={viewMode}
          cardSortingView={cardSortingView}
          setCardSortingView={setCardSortingView}
          expandedCategories={expandedCategories}
          setExpandedCategories={setExpandedCategories}
          expandedCards={expandedCards}
          setExpandedCards={setExpandedCards}
          searchCategoryQuery={searchCategoryQuery}
          setSearchCategoryQuery={setSearchCategoryQuery}
          searchCardQuery={searchCardQuery}
          setSearchCardQuery={setSearchCardQuery}
          showHiddenCategories={showHiddenCategories}
          setShowHiddenCategories={setShowHiddenCategories}
          onDeleteResponses={onDeleteResponses}
        />
      );
    case "tree_testing":
      return (
        <TreeTestingView
          block={block}
          blockIndex={blockIndex}
          responses={responses}
          viewMode={viewMode}
          treeTestingView={treeTestingView}
          setTreeTestingView={setTreeTestingView}
          onDeleteResponses={onDeleteResponses}
        />
      );
    case "prototype":
      return (
        <PrototypeView
          block={block}
          blockIndex={blockIndex}
          sessions={sessions}
          events={events}
          prototypes={prototypes}
          viewMode={viewMode}
          heatmapView={heatmapView}
          setHeatmapView={setHeatmapView}
          heatmapTab={heatmapTab}
          setHeatmapTab={setHeatmapTab}
          selectedHeatmapScreen={selectedHeatmapScreen}
          setSelectedHeatmapScreen={setSelectedHeatmapScreen}
          selectedRespondentScreen={selectedRespondentScreen}
          setSelectedRespondentScreen={setSelectedRespondentScreen}
          respondentHeatmapView={respondentHeatmapView}
          setRespondentHeatmapView={setRespondentHeatmapView}
          onlyFirstClicks={onlyFirstClicks}
          setOnlyFirstClicks={setOnlyFirstClicks}
          showClickOrder={showClickOrder}
          setShowClickOrder={setShowClickOrder}
          setModalJustOpened={setModalJustOpened}
          recordingModalUrl={recordingModalUrl ?? null}
          setRecordingModalUrl={setRecordingModalUrl ?? (() => {})}
          onDeleteResponses={onDeleteResponses}
        />
      );
    case "umux_lite":
      return <UmuxLiteView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "context":
      return <ContextView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "five_seconds":
      return <FiveSecondsView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "first_click":
      return <FirstClickView block={block} blockIndex={blockIndex} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    default:
      return (
        <div className="max-w-full">
          <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none" : ""}`}>
            <div className="text-lg font-semibold mb-4">
              {getBlockTypeConfig(block.type).label}
            </div>
            <div className="text-muted-foreground">
              Визуализация для этого типа блока пока не реализована.
            </div>
          </Card>
        </div>
      );
  }
}

// Open Question View
interface OpenQuestionViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

// Helper function to format date as "26 янв., 19:53"
function formatResponseDate(date: Date): string {
  const day = date.getDate();
  const monthNames = ["янв.", "фев.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сен.", "окт.", "ноя.", "дек."];
  const month = monthNames[date.getMonth()];
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${day} ${month}, ${hours}:${minutes}`;
}

function OpenQuestionView({ block, blockIndex, responses, viewMode, onDeleteResponses }: OpenQuestionViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  return (
    <div className="max-w-full">
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <CardContent className="p-0">
          {/* Заголовок блока */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
              <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                <IconComponent size={14} className="text-muted-foreground" />
              </div>
              <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
            </div>
            {viewMode === "responses" && onDeleteResponses && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                  onClick={() => onDeleteResponses(block.id)}
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Поля контента */}
          <div className="space-y-3 p-5">
            <p className="text-base mb-4">{question}</p>
            {imageUrl && (
              <div className="mb-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}

            {/* Results Section - показываем в обоих режимах */}
            <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4">Ответы ({responses.length})</h3>
            <div className="space-y-3">
              {responses.map((response, idx) => {
                const raw = typeof response.answer === "string"
                  ? response.answer
                  : (response.answer as { text?: string } | null)?.text;
                const answerText = (raw != null && String(raw).trim() !== "") ? raw : "—";
                const date = new Date(response.created_at);
                const formattedDate = formatResponseDate(date);
                
                return (
                  <div 
                    key={response.id || idx} 
                    className="p-3 bg-muted/30 border border-border rounded-lg"
                  >
                    <div className="text-xs text-muted-foreground mb-1.5">
                      {formattedDate}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{answerText}</div>
                  </div>
                );
              })}
              {responses.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}
            </div>
          </div>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Scale View
interface ScaleViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ScaleView({ block, blockIndex, responses, viewMode, onDeleteResponses }: ScaleViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  const scaleType = block.config?.scaleType || "numeric";
  const minValue = block.config?.minValue || 1;
  const maxValue = block.config?.maxValue || 5;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Calculate statistics
  const scaleValues: Record<number, number> = {};
  responses.forEach(r => {
    const value = typeof r.answer === "object" ? r.answer?.value : r.answer;
    if (typeof value === "number" && value >= minValue && value <= maxValue) {
      scaleValues[value] = (scaleValues[value] || 0) + 1;
    }
  });

  const totalResponses = responses.length;
  const maxCount = Math.max(...Object.values(scaleValues), 1);

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
            {imageUrl && (
              <div className="mb-4 px-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4">Результаты</h3>
            <div className="space-y-4">
              {Array.from({ length: maxValue - minValue + 1 }, (_, i) => minValue + i).map(value => {
                const count = scaleValues[value] || 0;
                const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                
                return (
                  <div key={value} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{value}</span>
                      <span className="text-muted-foreground">
                        ответы {count}
                      </span>
                    </div>
                    <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {totalResponses === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Choice View
interface ChoiceViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ChoiceView({ block, blockIndex, responses, viewMode, onDeleteResponses }: ChoiceViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  const options = block.config?.options || [];
  const allowMultiple = block.config?.allowMultiple || false;
  const allowOther = block.config?.allowOther || false;
  const allowNone = block.config?.allowNone || false;
  const noneText = block.config?.noneText?.trim() || "Ничего из вышеперечисленного";
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Calculate statistics
  const { optionCounts, otherAnswers, noneCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    const others: string[] = [];
    let none = 0;

    responses.forEach(r => {
      const answer = r.answer;
      if (typeof answer === "object") {
        if (answer.selected && Array.isArray(answer.selected)) {
          answer.selected.forEach((opt: string) => {
            counts[opt] = (counts[opt] || 0) + 1;
          });
        }
        if (answer.other) {
          others.push(answer.other);
        }
        if (answer.none === true) {
          none += 1;
        }
      }
    });

    return { optionCounts: counts, otherAnswers: others, noneCount: none };
  }, [responses]);

  const totalResponses = responses.length;
  const maxCount = Math.max(...Object.values(optionCounts), noneCount, 1);

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
            {imageUrl && (
              <div className="mb-4 px-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4">Результаты</h3>
            <div className="space-y-4">
              {options.map((option: string, idx: number) => {
                const count = optionCounts[option] || 0;
                const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                
                return (
                  <div key={`option-${block.id}-${idx}-${option}`} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{option}</span>
                      <span className="text-muted-foreground">
                        ответы {count}
                      </span>
                    </div>
                    <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              
              {allowNone && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{noneText}</span>
                    <span className="text-muted-foreground">
                      ответы {noneCount}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all"
                      style={{ width: totalResponses > 0 ? `${(noneCount / totalResponses) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              )}
              
              {allowOther && otherAnswers.length > 0 && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-sm font-semibold mb-3">Другое ({otherAnswers.length})</h4>
                  <div className="space-y-2">
                    {otherAnswers.map((answer, idx) => (
                      <div key={`other-${block.id}-${idx}-${answer}`} className="text-sm text-muted-foreground">
                        • {answer}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {totalResponses === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Preference View
interface PreferenceViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function PreferenceView({ block, blockIndex, responses, viewMode, onDeleteResponses }: PreferenceViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  // Используем images из конфига (как в PreferenceBlock)
  const images = block.config?.images || [];
  const options = block.config?.options || [];
  const optionImages = block.config?.optionImages || images; // Fallback на images если optionImages нет
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Calculate statistics
  const optionCounts = useMemo(() => {
    const counts: Record<number, number> = {};

    responses.forEach(r => {
      const answer = r.answer;
      if (typeof answer === "object") {
        if (answer.selectedIndex !== undefined) {
          const idx = answer.selectedIndex;
          counts[idx] = (counts[idx] || 0) + 1;
        } else if (answer.wins && typeof answer.wins === "object") {
          // For pairwise comparison, count wins
          Object.entries(answer.wins).forEach(([idx, wins]) => {
            counts[parseInt(idx)] = (counts[parseInt(idx)] || 0) + (wins as number);
          });
        }
      }
    });

    return counts;
  }, [responses]);

  const totalResponses = responses.length;
  const maxCount = Math.max(...Object.values(optionCounts), 1);

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
            {imageUrl && (
              <div className="mb-4 px-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>

          {/* Results Section - Always visible in summary mode */}
          {(viewMode === "summary" || viewMode === "responses") && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold mb-4">Результаты</h3>
              <div className="space-y-4">
                {(optionImages.length > 0 ? optionImages : images).map((imageUrl: string, idx: number) => {
                  const count = optionCounts[idx] || 0;
                  const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                  const letter = String.fromCharCode(65 + idx); // A, B, C, etc.
                  
                  return (
                    <div key={`pref-${block.id}-${idx}-${imageUrl}`} className="space-y-2">
                      {imageUrl && (
                        <img 
                          src={imageUrl} 
                          alt={`Option ${letter}`}
                          className="w-full h-auto max-h-48 object-cover rounded-lg border border-border"
                        />
                      )}
                      <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{letter}</span>
                        <span className="text-muted-foreground">
                          {percentage.toFixed(0)}% ({count})
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {(optionImages.length === 0 && images.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    Нет изображений для отображения
                  </div>
                )}
                {totalResponses === 0 && (optionImages.length > 0 || images.length > 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    Нет ответов
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Matrix View
interface MatrixViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function MatrixView({ block, blockIndex, responses, viewMode, onDeleteResponses }: MatrixViewProps) {
  const question = block.config?.question || "Вопрос";
  const description = block.config?.description;
  const imageUrl = block.config?.imageUrl;
  const rows = block.config?.rows || [];
  const columns = block.config?.columns || [];
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Подсчитываем количество выборов для каждой пары (rowId, columnId)
  const cellCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    
    responses.forEach(r => {
      const answer = r.answer;
      if (typeof answer === "object" && answer.selections) {
        Object.entries(answer.selections).forEach(([rowId, columnIds]) => {
          if (Array.isArray(columnIds)) {
            if (!counts[rowId]) {
              counts[rowId] = {};
            }
            columnIds.forEach((columnId: string) => {
              counts[rowId][columnId] = (counts[rowId][columnId] || 0) + 1;
            });
          }
        });
      }
    });
    
    return counts;
  }, [responses, rows, columns]);

  const totalResponses = responses.length;

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
            {description && (
              <p className="text-sm text-muted-foreground px-4 pb-3">{description}</p>
            )}
            {imageUrl && (
              <div className="mb-4 px-4">
                <img 
                  src={imageUrl} 
                  alt="Question image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>

          {/* Results Section - Matrix View */}
          {(viewMode === "summary" || viewMode === "responses") && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold mb-4">Результаты</h3>
              {rows.length > 0 && columns.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="border border-border p-2 text-left font-medium"></th>
                        {columns.map((column: any, idx: number) => (
                          <th key={`col-header-${block.id}-${idx}-${column.id}`} className="border border-border p-2 text-center font-medium">
                            {column.title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any, rowIdx: number) => (
                        <tr key={`row-${block.id}-${rowIdx}-${row.id}`}>
                          <td className="border border-border p-2 font-medium">{row.title}</td>
                          {columns.map((column: any, colIdx: number) => {
                            const count = cellCounts[row.id]?.[column.id] || 0;
                            const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                            return (
                              <td key={`cell-${block.id}-${rowIdx}-${colIdx}-${row.id}-${column.id}`} className="border border-border p-2 text-center">
                                {count > 0 ? (
                                  <div className="inline-flex items-center justify-center px-2 py-1 rounded text-sm font-medium" style={{ 
                                    background: `color-mix(in srgb, ${chartColors.accent} 10%, transparent)`, 
                                    color: chartColors.accent 
                                  }}>
                                    {percentage.toFixed(0)}% ({count})
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-muted"></div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Нет данных для отображения
                </div>
              )}
              
              {totalResponses === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}

              {/* Таблица индивидуальных ответов в режиме "ответы" */}
              {viewMode === "responses" && totalResponses > 0 && rows.length > 0 && columns.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold mb-4">Ответы по респондентам</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border border-border p-2 text-left font-medium">Дата</th>
                          {rows.map((row: any) => (
                            <th key={`response-row-${row.id}`} className="border border-border p-2 text-left font-medium text-sm">
                              {row.title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {responses.map((response, idx) => {
                          const answer = response.answer;
                          const selections = typeof answer === "object" && answer.selections ? answer.selections : {};
                          const date = new Date(response.created_at);
                          const formattedDate = formatResponseDate(date);
                          
                          return (
                            <tr key={response.id || idx}>
                              <td className="border border-border p-2 text-sm text-muted-foreground">
                                {formattedDate}
                              </td>
                              {rows.map((row: any) => {
                                const selectedColumns = Array.isArray(selections[row.id]) 
                                  ? selections[row.id] as string[]
                                  : selections[row.id] 
                                    ? [selections[row.id] as string]
                                    : [];
                                
                                const columnTitles = selectedColumns
                                  .map((colId: string) => {
                                    const column = columns.find((c: any) => c.id === colId);
                                    return column ? column.title : colId;
                                  })
                                  .filter(Boolean);
                                
                                return (
                                  <td key={`response-cell-${row.id}-${idx}`} className="border border-border p-2">
                                    {columnTitles.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {columnTitles.map((title: string, i: number) => (
                                          <span 
                                            key={`tag-${i}`}
                                            className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800"
                                          >
                                            {title}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Agreement View
interface AgreementViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function AgreementView({ block, blockIndex, responses, viewMode, onDeleteResponses }: AgreementViewProps) {
  const title = block.config?.title || "Соглашение";
  const agreementType = block.config?.agreementType || "standard";
  const customPdfUrl = block.config?.customPdfUrl;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Подсчет статистики
  const totalResponses = responses.length;
  const acceptedCount = responses.filter(r => {
    const answer = r.answer;
    return typeof answer === "object" && answer.accepted === true;
  }).length;
  const notAcceptedCount = totalResponses - acceptedCount;
  const acceptanceRate = totalResponses > 0 ? (acceptedCount / totalResponses) * 100 : 0;

  // Используем существующую функцию formatResponseDate для единообразия

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{title}</p>
            <div className="text-sm text-muted-foreground mb-2">
              Тип: {agreementType === "standard" ? "Стандартное соглашение" : "Пользовательское соглашение"}
            </div>
            {agreementType === "custom" && customPdfUrl && (
              <div className="mb-4">
                <a
                  href={customPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Открыть PDF соглашения
                </a>
              </div>
            )}
          </div>

          {/* Results Section */}
          {(viewMode === "summary" || viewMode === "responses") && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold mb-4">Результаты</h3>
              
              {totalResponses > 0 ? (
                <>
                  {/* Статистика */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 border border-border rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Всего ответов</div>
                      <div className="text-2xl font-semibold">{totalResponses}</div>
                    </div>
                    <div className="p-4 border border-border rounded-lg bg-success-bg">
                      <div className="text-sm text-[var(--color-success-on-bg)] mb-1">Принято</div>
                      <div className="text-2xl font-semibold text-[var(--color-success-on-bg)]">{acceptedCount}</div>
                      <div className="text-xs text-[var(--color-success-on-bg)]/80 mt-1">
                        {acceptanceRate.toFixed(1)}%
                      </div>
                    </div>
                    {notAcceptedCount > 0 && (
                      <div className="p-4 border border-border rounded-lg bg-destructive-bg">
                        <div className="text-sm text-foreground mb-1">Не принято</div>
                        <div className="text-2xl font-semibold text-foreground">
                          {notAcceptedCount}
                        </div>
                        <div className="text-xs text-foreground/80 mt-1">
                          {((notAcceptedCount / totalResponses) * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Таблица по респондентам */}
                  {viewMode === "responses" && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="border border-border p-2 text-left font-medium">Дата</th>
                            <th className="border border-border p-2 text-center font-medium">Статус</th>
                            <th className="border border-border p-2 text-center font-medium">Время принятия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {responses.map((response, idx) => {
                            const answer = response.answer;
                            const accepted = typeof answer === "object" && answer.accepted === true;
                            const acceptedAt = typeof answer === "object" && answer.acceptedAt 
                              ? formatResponseDate(new Date(answer.acceptedAt))
                              : "-";
                            const responseDate = formatResponseDate(new Date(response.created_at));

                            return (
                              <tr key={response.id || idx}>
                                <td className="border border-border p-2">{responseDate}</td>
                                <td className="border border-border p-2 text-center">
                                  {accepted ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded bg-success-bg text-[var(--color-success-on-bg)] text-sm font-medium">
                                      Принято
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded bg-destructive-bg text-[var(--color-destructive-on-bg)] text-sm font-medium">
                                      Не принято
                                    </span>
                                  )}
                                </td>
                                <td className="border border-border p-2 text-center text-sm text-muted-foreground">
                                  {acceptedAt}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Нет ответов
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Card Sorting View
interface CardSortingViewComponentProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  cardSortingView: CardSortingView;
  setCardSortingView: (view: CardSortingView) => void;
  expandedCategories: Set<string>;
  setExpandedCategories: (set: Set<string>) => void;
  expandedCards: Set<string>;
  setExpandedCards: (set: Set<string>) => void;
  searchCategoryQuery: string;
  setSearchCategoryQuery: (query: string) => void;
  searchCardQuery: string;
  setSearchCardQuery: (query: string) => void;
  showHiddenCategories: boolean;
  setShowHiddenCategories: (show: boolean) => void;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function CardSortingViewComponent({
  block,
  blockIndex,
  responses,
  viewMode,
  cardSortingView,
  setCardSortingView,
  expandedCategories,
  setExpandedCategories,
  expandedCards,
  setExpandedCards,
  searchCategoryQuery,
  setSearchCategoryQuery,
  searchCardQuery,
  setSearchCardQuery,
  showHiddenCategories,
  setShowHiddenCategories,
  onDeleteResponses
}: CardSortingViewComponentProps) {
  const task = block.config?.task || "Задание";
  const cards = block.config?.cards || [];
  const categories = block.config?.categories || [];
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Helper function to get card identifier (string) from card object or string
  // ВАЖНО: Карточки сохраняются по title, поэтому используем title для сопоставления
  const getCardId = (card: any): string => {
    if (typeof card === "string") return card;
    if (typeof card === "object" && card !== null) {
      // Card can be {id, title, imageUrl, description} or {value, ...}
      // Приоритет: title (так как сохраняется по title), затем id, value
      return card.title || card.id || card.value || String(card);
    }
    return String(card);
  };

  // Helper function to get card display name
  const getCardName = (card: any): string => {
    if (typeof card === "string") return card;
    if (typeof card === "object" && card !== null) {
      return card.title || card.value || card.id || String(card);
    }
    return String(card);
  };

  // Функция для поиска карточки по title (так как в ответах карточки сохраняются как строки title)
  const findCardByTitle = (title: string): any => {
    return cards.find((c: any) => {
      const cardTitle = typeof c === "string" ? c : (c.title || c.value || c.id || String(c));
      return cardTitle === title;
    });
  };

  // Process responses
  const categoryCardMap: Record<string, Record<string, number>> = {};
  const cardCategoryMap: Record<string, Record<string, number>> = {};
  const unsortedCardMap: Record<string, number> = {}; // Карточки, которые не отсортированы

  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object" && answer.categories) {
      // Собираем все карточки, которые отсортированы в категории
      // В ответах карточки приходят как строки (title), поэтому используем title как ключ
      const sortedCardTitles = new Set<string>();
      
      Object.entries(answer.categories).forEach(([catName, cardList]) => {
        const cardArray = Array.isArray(cardList) ? cardList : [];
        if (!categoryCardMap[catName]) categoryCardMap[catName] = {};
        cardArray.forEach((cardTitle: any) => {
          // cardTitle - это строка (title карточки) из ответа
          const title = typeof cardTitle === "string" ? cardTitle : String(cardTitle);
          sortedCardTitles.add(title);
          categoryCardMap[catName][title] = (categoryCardMap[catName][title] || 0) + 1;
          
          if (!cardCategoryMap[title]) cardCategoryMap[title] = {};
          cardCategoryMap[title][catName] = (cardCategoryMap[title][catName] || 0) + 1;
        });
      });
      
      // Определяем неотсортированные карточки
      // Сравниваем title карточек из конфига с отсортированными title
      const allCardTitles = new Set(cards.map((c: any) => {
        const cardTitle = typeof c === "string" ? c : (c.title || c.value || c.id || String(c));
        return cardTitle;
      }));
      
      allCardTitles.forEach(cardTitle => {
        if (!sortedCardTitles.has(cardTitle)) {
          unsortedCardMap[cardTitle] = (unsortedCardMap[cardTitle] || 0) + 1;
        }
      });
      
      // Также проверяем unsortedCount из ответа
      if (typeof answer.unsortedCount === "number" && answer.unsortedCount > 0) {
        // Если есть unsortedCount, но мы не знаем какие именно карточки - помечаем все как потенциально неотсортированные
        // В этом случае мы не можем точно определить, но можем показать колонку
      }
    }
  });

  const totalResponses = responses.length;
  const hasUnsorted = Object.keys(unsortedCardMap).length > 0 || responses.some(r => {
    const answer = r.answer;
    return typeof answer === "object" && typeof answer.unsortedCount === "number" && answer.unsortedCount > 0;
  });

  // Matrix view
  const renderMatrixView = () => {
    const categoryNames = Object.keys(categoryCardMap).length > 0 
      ? Object.keys(categoryCardMap) 
      : categories.map((c: any) => c.name || c);
    
    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-border p-2 text-left"></th>
                {categoryNames.map((cat: string, idx: number) => (
                  <th key={`cat-header-${block.id}-${idx}-${cat}`} className="border border-border p-2 text-center font-medium">
                    {cat}
                  </th>
                ))}
                {hasUnsorted && (
                  <th className="border border-border p-2 text-center font-medium">
                    Неотсортированные
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {cards.map((card: any, cardIdx: number) => {
                const cardTitle = typeof card === "string" ? card : (card.title || card.value || card.id || String(card));
                const cardName = getCardName(card);
                return (
                  <tr key={cardIdx}>
                    <td className="border border-border p-2 font-medium">{cardName}</td>
                    {categoryNames.map((cat: string, catIdx: number) => {
                      const count = categoryCardMap[cat]?.[cardTitle] || 0;
                      const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                      return (
                        <td key={`cell-${block.id}-${cardIdx}-${catIdx}-${cat}`} className="border border-border p-2 text-center">
                          {count > 0 ? (
                            <div className="inline-flex items-center justify-center px-2 py-1 rounded bg-green-100 text-green-800 text-sm font-medium">
                              {percentage.toFixed(0)}%
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-muted"></div>
                          )}
                        </td>
                      );
                    })}
                    {hasUnsorted && (
                      <td className="border border-border p-2 text-center">
                        {(() => {
                          const unsortedCount = unsortedCardMap[cardTitle] || 0;
                          const unsortedPercentage = totalResponses > 0 ? (unsortedCount / totalResponses) * 100 : 0;
                          return unsortedCount > 0 ? (
                            <div className="inline-flex items-center justify-center px-2 py-1 rounded bg-green-100 text-green-800 text-sm font-medium">
                              {unsortedPercentage.toFixed(0)}%
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-muted"></div>
                          );
                        })()}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Categories view
  const renderCategoriesView = () => {
    const categoryNames = Object.keys(categoryCardMap).length > 0 
      ? Object.keys(categoryCardMap) 
      : categories.map((c: any) => c.name || c);
    
    const filteredCategories = categoryNames.filter((cat: string) => {
      if (searchCategoryQuery) {
        return cat.toLowerCase().includes(searchCategoryQuery.toLowerCase());
      }
      return true;
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск категорий"
              value={searchCategoryQuery}
              onChange={(e) => setSearchCategoryQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-hidden"
              checked={showHiddenCategories}
              onCheckedChange={(checked) => setShowHiddenCategories(checked === true)}
            />
            <Label htmlFor="show-hidden" className="text-sm">Показать скрытые</Label>
          </div>
        </div>

        <div className="space-y-2">
          {filteredCategories.map((cat: string, idx: number) => {
            const cardsInCategory = Object.keys(categoryCardMap[cat] || {});
            const isExpanded = expandedCategories.has(cat);
            
            return (
              <div key={`category-${cat}-${idx}`} className="border border-border rounded-lg">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const newSet = new Set(expandedCategories);
                    if (newSet.has(cat)) {
                      newSet.delete(cat);
                    } else {
                      newSet.add(cat);
                    }
                    setExpandedCategories(newSet);
                  }}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-base">{cat}</span>
                    <span className="text-sm text-muted-foreground">
                      ({cardsInCategory.length} карточки)
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {isExpanded && cardsInCategory.length > 0 && (
                  <div className="p-3 pt-0 space-y-3">
                    {cardsInCategory.map((cardTitle, cardIdx) => {
                      const count = categoryCardMap[cat][cardTitle];
                      const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                      // Find original card by title (так как в ответах карточки сохраняются по title)
                      const originalCard = findCardByTitle(cardTitle);
                      const cardName = originalCard ? getCardName(originalCard) : cardTitle;
                      return (
                        <div key={`card-in-cat-${block.id}-${cat}-${cardIdx}-${cardTitle}`} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{cardName}</span>
                            <span className="text-sm text-muted-foreground">
                              {percentage.toFixed(0)}% ({count})
                            </span>
                          </div>
                          <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-success h-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Cards view
  const renderCardsView = () => {
    // Используем title как ключ, так как карточки сохраняются по title
    const allCards = cards.map((c: any) => {
      const cardTitle = typeof c === "string" ? c : (c.title || c.value || c.id || String(c));
      return {
        original: c,
        title: cardTitle, // Используем title как ключ
        name: getCardName(c)
      };
    });
    const filteredCards = allCards.filter((card: { original: any; title: string; name: string }) => {
      if (searchCardQuery) {
        return card.name.toLowerCase().includes(searchCardQuery.toLowerCase());
      }
      return true;
    });

    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск карточек"
            value={searchCardQuery}
            onChange={(e) => setSearchCardQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="space-y-4">
          {filteredCards.map((card: { original: any; title: string; name: string }, idx: number) => {
            const categoriesForCard = cardCategoryMap[card.title] || {}; // Используем title как ключ
            const totalCount = Object.values(categoriesForCard).reduce((sum: number, count: number) => sum + count, 0);
            const isExpanded = expandedCards.has(card.title);
            
            // Сортируем категории по количеству (от большего к меньшему)
            const sortedCategories = Object.entries(categoriesForCard)
              .sort((a, b) => (b[1] as number) - (a[1] as number));
            
            return (
              <div key={`card-view-${block.id}-${idx}-${card.title}`} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-semibold">{card.name}</span>
                  <button
                    onClick={() => {
                      const newSet = new Set(expandedCards);
                      if (isExpanded) {
                        newSet.delete(card.title);
                      } else {
                        newSet.add(card.title);
                      }
                      setExpandedCards(newSet);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
                
                {isExpanded && (
                  <div className="space-y-3">
                    {sortedCategories.map(([cat, count]) => {
                      const percentage = totalResponses > 0 ? ((count as number) / totalResponses) * 100 : 0;
                      return (
                        <div key={cat} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{cat}</span>
                            <span className="text-muted-foreground">
                              {percentage.toFixed(0)}% ({count})
                            </span>
                          </div>
                          <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-4 overflow-hidden relative">
                            <div
                              className="bg-success h-full transition-all flex items-center justify-start px-2"
                              style={{ width: `${percentage}%`, minWidth: percentage > 0 ? '20px' : '0' }}
                            >
                              {percentage > 5 && (
                                <span className="text-xs text-white font-medium whitespace-nowrap">{cat}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {sortedCategories.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-2">
                        Карточка не была отсортирована
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Task Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{task}</p>
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            {/* В режиме "ответы" показываем только матрицу, без вкладок */}
            {viewMode === "responses" ? (
              renderMatrixView()
            ) : (
              <>
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setCardSortingView("matrix")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                      cardSortingView === "matrix"
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Матрица
                  </button>
                  <button
                    onClick={() => setCardSortingView("categories")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                      cardSortingView === "categories"
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Категории
                  </button>
                  <button
                    onClick={() => setCardSortingView("cards")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                      cardSortingView === "cards"
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Карточки
                  </button>
                </div>

                {cardSortingView === "matrix" && renderMatrixView()}
                {cardSortingView === "categories" && renderCategoriesView()}
                {cardSortingView === "cards" && renderCardsView()}
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Tree Testing View
interface TreeTestingViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  treeTestingView: TreeTestingView;
  setTreeTestingView: (view: TreeTestingView) => void;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function TreeTestingView({
  block,
  blockIndex,
  responses,
  viewMode,
  treeTestingView,
  setTreeTestingView,
  onDeleteResponses
}: TreeTestingViewProps) {
  const question = block.config?.question || "Вопрос";
  const correctPath = block.config?.correctPath || [];
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  // Calculate metrics
  let successCount = 0;
  let directnessCount = 0;
  const pathTimes: number[] = [];
  const paths: Array<{ path: string[]; count: number; isCorrect: boolean }> = [];
  const firstClicks: Array<{ path: string[]; count: number; isCorrect: boolean }> = [];
  const finalPoints: Array<{ path: string[]; count: number; isCorrect: boolean; isUnsuccessful?: boolean }> = [];

  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object") {
      if (answer.isCorrect) successCount++;
      if (answer.isDirect) directnessCount++;
      
      // Получаем duration_ms из ответа или вычисляем из created_at
      if (answer.duration_ms && typeof answer.duration_ms === "number") {
        pathTimes.push(answer.duration_ms);
      } else if (r.duration_ms && typeof r.duration_ms === "number") {
        // Если duration_ms в самом response
        pathTimes.push(r.duration_ms);
      } else if (r.created_at) {
        // Если duration_ms нет, пытаемся вычислить из времени создания (но это не очень точно)
        // Для точности лучше использовать duration_ms из ответа
        // Пока пропускаем такие случаи
      }
      
      const path = answer.pathNames || answer.selectedPath || [];
      const pathArray = Array.isArray(path) ? path : [path];
      
      if (pathArray.length > 0) {
        const pathStr = pathArray.join(" › ");
        const existing = paths.find(p => p.path.join(" › ") === pathStr);
        if (existing) {
          existing.count++;
        } else {
          paths.push({
            path: pathArray,
            count: 1,
            isCorrect: answer.isCorrect || false
          });
        }
      }
      
      // Первый клик - первый элемент пути
      if (pathArray.length > 0) {
        const firstClickPath = [pathArray[0]];
        const firstClickStr = firstClickPath.join(" › ");
        const existingFirstClick = firstClicks.find(fc => fc.path.join(" › ") === firstClickStr);
        if (existingFirstClick) {
          existingFirstClick.count++;
        } else {
          // Проверяем, правильный ли путь (если первый элемент совпадает с первым элементом правильного пути)
          const isCorrect = correctPath.length > 0 && pathArray[0] === correctPath[0];
          firstClicks.push({
            path: firstClickPath,
            count: 1,
            isCorrect
          });
        }
      }
      
      // Финальная точка - последний элемент пути
      if (pathArray.length > 0) {
        const finalPointPath = pathArray;
        const finalPointStr = finalPointPath.join(" › ");
        const existingFinalPoint = finalPoints.find(fp => fp.path.join(" › ") === finalPointStr);
        if (existingFinalPoint) {
          existingFinalPoint.count++;
        } else {
          // Проверяем, был ли ответ "не знаю" (isCorrect === false и возможно есть флаг)
          const isUnsuccessful = !answer.isCorrect && (answer.dontKnow === true || answer.isUnsuccessful === true);
          finalPoints.push({
            path: finalPointPath,
            count: 1,
            isCorrect: answer.isCorrect || false,
            isUnsuccessful
          });
        }
      } else if (answer.dontKnow === true || answer.isUnsuccessful === true) {
        // Если нет пути, но есть флаг "не знаю" - добавляем в категорию "Неуспешно"
        const existingUnsuccessful = finalPoints.find(fp => fp.isUnsuccessful && fp.path.length === 0);
        if (existingUnsuccessful) {
          existingUnsuccessful.count++;
        } else {
          finalPoints.push({
            path: [],
            count: 1,
            isCorrect: false,
            isUnsuccessful: true
          });
        }
      }
    }
  });

  const totalResponses = responses.length;
  const successRate = totalResponses > 0 ? (successCount / totalResponses) * 100 : 0;
  const directnessRate = totalResponses > 0 ? (directnessCount / totalResponses) * 100 : 0;
  const avgTime = pathTimes.length > 0 
    ? pathTimes.reduce((a, b) => a + b, 0) / pathTimes.length / 1000 
    : 0;
  const medianTime = pathTimes.length > 0
    ? [...pathTimes].sort((a, b) => a - b)[Math.floor(pathTimes.length / 2)] / 1000
    : 0;

  const sortedPaths = [...paths].sort((a, b) => b.count - a.count);
  const sortedFirstClicks = [...firstClicks].sort((a, b) => b.count - a.count);
  const sortedFinalPoints = [...finalPoints].sort((a, b) => b.count - a.count);

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3">{question}</p>
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Процент успеха</div>
            <div className="text-2xl font-bold">{successRate.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              Прямота
              <div className="group relative">
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-2 bg-popover border border-border rounded shadow-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  Измерять, насколько эффективно респонденты добирались до цели. Больше процент означает, что респонденты сделали меньше ненужных шагов
                </div>
              </div>
            </div>
            <div className="text-2xl font-bold">{directnessRate.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Среднее время</div>
            <div className="text-2xl font-bold">{avgTime.toFixed(2)} с</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Медианное время</div>
            <div className="text-2xl font-bold">{medianTime.toFixed(2)} с</div>
          </div>
        </div>

        <div className="space-y-4">
              {sortedPaths.map((pathData, idx) => {
                const percentage = totalResponses > 0 ? (pathData.count / totalResponses) * 100 : 0;
                const pathText = pathData.path.join(" › ");
                return (
                  <div key={`path-${block.id}-${idx}-${pathText}`} className="space-y-2">
                    <div className="w-full bg-[var(--color-progress-bg)] rounded-full h-2 overflow-hidden">
                      <div
                        className={`${pathData.isCorrect ? "bg-success" : "bg-primary"} h-full transition-all`}
                        style={{ 
                          width: `${Math.max(percentage, 0)}%`, 
                          minWidth: percentage > 0 ? '2px' : '0'
                        }}
                      />
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          {pathData.isCorrect && (
                            <CircleCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                          )}
                          <span className="font-medium text-sm">{pathText}</span>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {percentage.toFixed(0)}% ({pathData.count})
                      </span>
                    </div>
                  </div>
                );
              })}

          {totalResponses === 0 && (
            <div className="text-center text-muted-foreground py-8">
              Нет ответов
            </div>
          )}
        </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// UMUX Lite View
interface UmuxLiteViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function UmuxLiteView({ block, blockIndex, responses, viewMode, onDeleteResponses }: UmuxLiteViewProps) {
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;
  // Calculate statistics
  const scores: number[] = [];
  const susScores: number[] = [];
  const feedbacks: string[] = [];

  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object") {
      if (typeof answer.umux_lite_score === "number") {
        scores.push(answer.umux_lite_score);
      }
      if (typeof answer.sus_score === "number") {
        susScores.push(answer.sus_score);
      }
      if (typeof answer.feedback === "string" && answer.feedback.trim()) {
        feedbacks.push(answer.feedback);
      }
    }
  });

  const totalResponses = responses.length;
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const avgSusScore = susScores.length > 0 ? susScores.reduce((a, b) => a + b, 0) / susScores.length : 0;
  const medianScore = scores.length > 0
    ? [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)]
    : 0;

  return (
    <div className="max-w-full">
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-base px-4 py-3 text-muted-foreground">
              Метрика удобства использования интерфейса
            </p>
          </div>

          {/* Results Section */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4">Результаты</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Средний UMUX Lite</div>
            <div className="text-2xl font-bold">{avgScore.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Медианный UMUX Lite</div>
            <div className="text-2xl font-bold">{medianScore.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Средний SUS Score</div>
            <div className="text-2xl font-bold">{avgSusScore.toFixed(1)}</div>
          </div>
        </div>

        {/* Individual Results */}
        <div className="border-t border-border pt-6 mt-6">
          <h3 className="text-lg font-semibold mb-4">Результаты по респондентам</h3>
          <div className="space-y-3">
            {responses.map((response, idx) => {
              const answer = response.answer;
              const umuxScore = typeof answer === "object" && typeof answer.umux_lite_score === "number" 
                ? answer.umux_lite_score 
                : null;
              const susScore = typeof answer === "object" && typeof answer.sus_score === "number"
                ? answer.sus_score
                : null;
              const feedback = typeof answer === "object" && typeof answer.feedback === "string"
                ? answer.feedback
                : null;
              const date = new Date(response.created_at);
              const formattedDate = formatResponseDate(date);
              
              return (
                <div key={response.id || idx} className="p-4 bg-muted/30 border border-border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-xs text-muted-foreground">{formattedDate}</div>
                    <div className="flex gap-4 text-sm">
                      {umuxScore !== null && (
                        <div>
                          <span className="text-muted-foreground">UMUX Lite: </span>
                          <span className="font-medium">{umuxScore.toFixed(1)}</span>
                        </div>
                      )}
                      {susScore !== null && (
                        <div>
                          <span className="text-muted-foreground">SUS Score: </span>
                          <span className="font-medium">{susScore.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {feedback && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      <span className="font-medium">Отзыв: </span>
                      {feedback}
                    </div>
                  )}
                </div>
              );
            })}
            {responses.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                Нет ответов
              </div>
            )}
          </div>
        </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Context View
interface ContextViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ContextView({ block, blockIndex, responses, viewMode, onDeleteResponses }: ContextViewProps) {
  const title = block.config?.title || "Контекст";
  const description = block.config?.description;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none" : ""}`}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
              <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                <IconComponent size={14} className="text-muted-foreground" />
              </div>
              <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="text-base mb-2">{title}</p>
            {description && (
              <p className="text-base text-muted-foreground mb-4">{description}</p>
            )}
            <div className="text-sm text-muted-foreground">
              Блок контекста не собирает ответы. Он используется для отображения информации респондентам.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Five Seconds View
interface FiveSecondsViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function FiveSecondsView({ block, blockIndex, responses, viewMode, onDeleteResponses }: FiveSecondsViewProps) {
  const instruction = block.config?.instruction || "Инструкция";
  const imageUrl = block.config?.imageUrl;
  const duration = block.config?.duration || 5;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;

  const totalResponses = responses.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
              <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                <IconComponent size={14} className="text-muted-foreground" />
              </div>
              <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
            </div>
            {viewMode === "responses" && onDeleteResponses && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                  onClick={() => onDeleteResponses(block.id)}
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-base mb-4">{instruction}</p>
            {imageUrl && (
              <div className="mb-4">
                <img 
                  src={imageUrl} 
                  alt="Test image" 
                  className="max-w-full h-auto rounded-lg border border-border"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {viewMode === "responses" && (
        <Card className="p-6 border-0 shadow-none">
          <h3 className="text-lg font-semibold mb-4">Ответы ({totalResponses})</h3>
          <div className="space-y-4">
            {responses.map((response, idx) => {
              const a = response.answer;
              const raw = typeof a === "string" ? a : (a as { text?: string; answer?: string } | null)?.text ?? (a as { answer?: string } | null)?.answer;
              const answerText = (raw != null && String(raw).trim() !== "") ? raw : "—";
              const date = new Date(response.created_at);
              
              return (
                <div key={response.id || idx} className="border-b border-border pb-4 last:border-0">
                  <div className="text-sm text-muted-foreground mb-2">
                    {date.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-base whitespace-pre-wrap">{answerText}</div>
                </div>
              );
            })}
            {totalResponses === 0 && (
              <div className="text-center text-muted-foreground py-8">
                Нет ответов
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

const MEDIAN_TOOLTIP = "Медиана — это значение, разделяющее верхнюю половину от нижней половины ответов. На неё не влияют ответы с очень длинным или коротким временем.";

// First Click View
interface FirstClickViewProps {
  block: StudyBlock;
  blockIndex: number;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function FirstClickView({ block, blockIndex, responses, viewMode, onDeleteResponses }: FirstClickViewProps) {
  const [clickMapOpen, setClickMapOpen] = useState(false);
  const [clickMapTab, setClickMapTab] = useState<"heatmap" | "clicks" | "image">("image");

  const instruction = block.config?.instruction || "Задание";
  const imageUrl = block.config?.imageUrl;
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;
  const durations = responses
    .map((r) => (r.duration_ms != null ? r.duration_ms / 1000 : null))
    .filter((d): d is number => d != null);
  const n = durations.length;
  const avgTime = n > 0 ? durations.reduce((a, b) => a + b, 0) / n : 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const medianTime = n > 0 ? sorted[Math.floor(n / 2)]! : 0;

  const clicks = responses
    .map((r) => {
      const a = r.answer;
      if (a && typeof a === "object" && typeof a.x === "number" && typeof a.y === "number") {
        return { x: a.x, y: a.y };
      }
      return null;
    })
    .filter((c): c is { x: number; y: number } => c != null);

  return (
    <div className="max-w-full">
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <CardContent className="p-0">
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
                <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                  <IconComponent size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
              </div>
              {viewMode === "responses" && onDeleteResponses && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDeleteResponses(block.id)}
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="px-4 py-3">
              <p className="text-base mb-4">{instruction}</p>
            </div>
          </div>
          <div className="px-4 pb-4">
          {imageUrl && (
            <div className="flex flex-wrap items-start gap-4">
              <div className="w-32 h-24 rounded-lg border border-border overflow-hidden bg-muted/30 flex-shrink-0">
                <img
                  src={imageUrl}
                  alt=""
                  className="w-full h-full object-cover blur-md"
                />
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Среднее время:</span>
                  <span className="font-medium">{avgTime.toFixed(2)} с</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Медианное время:</span>
                  <span className="font-medium">{medianTime.toFixed(2)} с</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex text-muted-foreground hover:text-foreground cursor-help">
                          <Info className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <p className="text-sm whitespace-pre-line">{MEDIAN_TOOLTIP}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Button size="sm" variant="outline" onClick={() => setClickMapOpen(true)}>
                  <MapIcon className="h-4 w-4 mr-2" />
                  Открыть карту кликов
                </Button>
              </div>
            </div>
          )}
          {!imageUrl && (
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Среднее время:</span>
                <span className="font-medium">{avgTime.toFixed(2)} с</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Медианное время:</span>
                <span className="font-medium">{medianTime.toFixed(2)} с</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex text-muted-foreground hover:text-foreground cursor-help">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px]">
                      <p className="text-sm whitespace-pre-line">{MEDIAN_TOOLTIP}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button size="sm" variant="outline" onClick={() => setClickMapOpen(true)}>
                <MapIcon className="h-4 w-4 mr-2" />
                Открыть карту кликов
              </Button>
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={clickMapOpen} onOpenChange={setClickMapOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate pr-8" title={instruction}>
              {instruction}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-4">
            {(["heatmap", "clicks", "image"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setClickMapTab(tab)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  clickMapTab === tab
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {tab === "heatmap" ? "Тепловая карта" : tab === "clicks" ? "Клики" : "Изображение"}
              </button>
            ))}
          </div>
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              {imageUrl && (
                <div className="relative rounded-lg border border-border overflow-hidden bg-muted/30">
                  <img
                    src={imageUrl}
                    alt=""
                    className="w-full h-auto max-h-[50vh] object-contain"
                  />
                  {clickMapTab === "clicks" &&
                    clicks.map((c, i) => (
                      <div
                        key={`click-${c.x}-${c.y}-${i}`}
                        className="absolute w-3 h-3 rounded-full bg-success border-2 border-white shadow"
                        style={{
                          left: `${typeof c.x === "number" && c.x <= 1 ? c.x * 100 : 0}%`,
                          top: `${typeof c.y === "number" && c.y <= 1 ? c.y * 100 : 0}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    ))}
                </div>
              )}
              {!imageUrl && (
                <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
                  Нет изображения
                </div>
              )}
            </div>
            <div className="w-48 flex-shrink-0 space-y-3">
              <div>
                <div className="text-sm text-muted-foreground">Респонденты</div>
                <div className="text-lg font-semibold">{n}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Среднее время</div>
                <div className="text-lg font-semibold">{avgTime.toFixed(2)} с</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Медианное время</div>
                <div className="text-lg font-semibold">{medianTime.toFixed(2)} с</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Prototype View
interface PrototypeViewProps {
  block: StudyBlock;
  sessions: Session[];
  events: any[];
  prototypes: Record<string, Proto>;
  viewMode: ReportViewMode;
  heatmapView: HeatmapView;
  setHeatmapView: (view: HeatmapView) => void;
  heatmapTab: HeatmapTab;
  setHeatmapTab: (tab: HeatmapTab) => void;
  selectedHeatmapScreen: { screen: Screen; proto: Proto; blockId: string; screenIndex: number; totalScreens: number } | null;
  setSelectedHeatmapScreen: (screen: { screen: Screen; proto: Proto; blockId: string; screenIndex: number; totalScreens: number } | null) => void;
  selectedRespondentScreen: { screen: Screen; proto: Proto; session: Session; screenIndex: number; totalScreens: number } | null;
  setSelectedRespondentScreen: (screen: { screen: Screen; proto: Proto; session: Session; screenIndex: number; totalScreens: number } | null) => void;
  respondentHeatmapView: HeatmapView;
  setRespondentHeatmapView: (view: HeatmapView) => void;
  onlyFirstClicks: boolean;
  setOnlyFirstClicks: (only: boolean) => void;
  showClickOrder: boolean;
  setShowClickOrder: (show: boolean) => void;
  setModalJustOpened: (value: boolean) => void;
  recordingModalUrl: string | null;
  setRecordingModalUrl: (url: string | null) => void;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function PrototypeView({
  block,
  blockIndex,
  sessions,
  events,
  prototypes,
  viewMode,
  heatmapView,
  setHeatmapView,
  heatmapTab,
  setHeatmapTab,
  selectedHeatmapScreen,
  setSelectedHeatmapScreen,
  selectedRespondentScreen,
  setSelectedRespondentScreen,
  respondentHeatmapView,
  setRespondentHeatmapView,
  onlyFirstClicks,
  setOnlyFirstClicks,
  showClickOrder,
  setShowClickOrder,
  setModalJustOpened,
  recordingModalUrl,
  setRecordingModalUrl,
  onDeleteResponses
}: PrototypeViewProps) {
  const protoId = block.prototype_id;
  const proto = protoId ? prototypes[protoId] : null;
  const taskDescription = block.config?.task || block.instructions || "Задание";
  const blockConfig = getBlockTypeConfig(block.type);
  const IconComponent = blockConfig.icon;
  
  // Состояние для попапа с информацией о ноде
  const [selectedNode, setSelectedNode] = useState<{ screen: Screen; stepNumber: number; visitorsCount: number; totalSessions: number; position: { x: number; y: number } } | null>(null);

  // Константа таймаута неактивности (в мс), синхронизирована с figma-viewer
  const SESSION_INACTIVITY_TIMEOUT_MS =
    (Number(import.meta.env.VITE_SESSION_INACTIVITY_TIMEOUT_SECONDS || "300") || 300) * 1000;

  // Calculate metrics
  const completedCount = sessions.filter(s => s.completed).length;
  const abortedCount = sessions.filter(s => s.aborted).length;
  const closedCount = sessions.filter(s => {
    const sessionEvents = events.filter(e => e.session_id === s.id);
    return sessionEvents.some(e => e.event_type === "closed");
  }).length;

  // Calculate average and median time
  const sessionTimes: number[] = [];
  sessions.forEach(session => {
    const sessionEvents = events.filter(e => e.session_id === session.id);
    if (sessionEvents.length > 0) {
      const sortedEvents = [...sessionEvents].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const startTime = new Date(sortedEvents[0].timestamp).getTime();
      const endTime = new Date(sortedEvents[sortedEvents.length - 1].timestamp).getTime();
      sessionTimes.push((endTime - startTime) / 1000); // in seconds
    }
  });

  const avgTime = sessionTimes.length > 0
    ? sessionTimes.reduce((a, b) => a + b, 0) / sessionTimes.length
    : 0;
  const medianTime = sessionTimes.length > 0
    ? [...sessionTimes].sort((a, b) => a - b)[Math.floor(sessionTimes.length / 2)]
    : 0;

  // Get screens for prototype
  const screens = proto?.screens || [];
  const screenMap = new Map(screens.map(s => [s.id, s]));

  // Определяем стартовые и финальные экраны
  const getStartAndEndScreens = () => {
    const startScreens = new Set<string>();
    const endScreens = new Set<string>();
    
    sessions.forEach(session => {
      const sessionEvents = events
        .filter(e => e.session_id === session.id && e.event_type === "screen_load")
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      if (sessionEvents.length > 0) {
        startScreens.add(sessionEvents[0].screen_id);
        endScreens.add(sessionEvents[sessionEvents.length - 1].screen_id);
      }
      
      // Также проверяем события completed
      const completedEvents = events.filter(e => 
        e.session_id === session.id && e.event_type === "completed"
      );
      completedEvents.forEach(e => {
        if (e.screen_id) endScreens.add(e.screen_id);
      });
    });
    
    return { startScreens, endScreens };
  };

  const { startScreens, endScreens } = getStartAndEndScreens();

  // Кастомный edge компонент в стиле Sankey (изогнутые ленты с переменной шириной)
  const SankeyEdge = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps & { data?: { count?: number; maxCount?: number } }) => {
    const count = data?.count || 0;
    const maxCount = data?.maxCount || 1;
    
    // Вычисляем ширину ленты на основе количества переходов
    const minWidth = 2;
    const maxWidth = 40;
    const width = count > 0 ? Math.max(minWidth, (count / maxCount) * maxWidth) : minWidth;
    const halfWidth = width / 2;
    
    // Вычисляем контрольные точки для кривой Безье (Sankey-стиль)
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const curvature = 0.3; // Коэффициент кривизны
    
    // Создаем путь для верхней и нижней границы ленты
    const controlPoint1X = sourceX + dx * curvature;
    const controlPoint1Y = sourceY;
    const controlPoint2X = targetX - dx * curvature;
    const controlPoint2Y = targetY;
    
    // Создаем path для ленты (замкнутый путь)
    const path = `
      M ${sourceX},${sourceY - halfWidth}
      C ${controlPoint1X},${sourceY - halfWidth} ${controlPoint2X},${targetY - halfWidth} ${targetX},${targetY - halfWidth}
      L ${targetX},${targetY + halfWidth}
      C ${controlPoint2X},${targetY + halfWidth} ${controlPoint1X},${sourceY + halfWidth} ${sourceX},${sourceY + halfWidth}
      Z
    `;
    
    // Цвет зависит от интенсивности
    const opacity = count > 0 ? Math.min(0.8, 0.3 + (count / maxCount) * 0.5) : 0.2;
    const edgeColor = count > 0 ? chartColors.primary : chartColors.muted;
    
    return (
      <g>
        <path
          d={path}
          fill={edgeColor}
          fillOpacity={opacity}
          stroke="none"
        />
        {count > 0 && (
          <text
            x={(sourceX + targetX) / 2}
            y={(sourceY + targetY) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-foreground)"
            fontSize="11"
            fontWeight="500"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {count}
          </text>
        )}
      </g>
    );
  };

  // Кастомный узел для отображения изображений экранов
  const ScreenNode = ({ data }: { data: any }) => {
    const isStart = startScreens.has(data.screenId);
    const finalStatuses = data.finalStatuses || {
      completed: false,
      aborted: false,
      closed: false,
      in_progress: false
    };
    const isFinal = finalStatuses.completed || finalStatuses.aborted || finalStatuses.closed;
    const displayLabel = data.label && data.label.length > 20 
      ? data.label.substring(0, 20) + '...' 
      : data.label;
    
    return (
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {/* Название экрана выше ноды (4px отступ) */}
        <div style={{
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: finalStatuses.aborted ? styleColors.destructive : styleColors.mutedText,
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: (isStart || finalStatuses.completed || finalStatuses.aborted || finalStatuses.closed) ? '4px 8px' : '0',
          borderRadius: (isStart || finalStatuses.completed || finalStatuses.aborted || finalStatuses.closed) ? '6px' : '0',
          backgroundColor: finalStatuses.completed 
            ? 'var(--color-success-bg)' // Пастельный зеленый для completed
            : finalStatuses.aborted 
            ? 'var(--color-destructive-bg)' // Пастельный красный для aborted
            : finalStatuses.closed 
            ? 'var(--color-warning-bg)' // Пастельный оранжевый для closed
            : isStart
            ? 'var(--color-muted)' // Подложка для стартового экрана
            : 'transparent'
        }}>
          {isStart && !finalStatuses.aborted && <Play className="h-3 w-3 flex-shrink-0" />}
          {isFinal && (
            <>
              {finalStatuses.completed && <UserRoundCheck className="h-3 w-3 flex-shrink-0 text-success" />}
              {finalStatuses.aborted && <UserRoundX className="h-3 w-3 flex-shrink-0" style={{ color: styleColors.destructive }} />}
              {finalStatuses.closed && <UserRoundMinus className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
            </>
          )}
          {!isStart && !isFinal && endScreens.has(data.screenId) && <Flag className="h-3 w-3 flex-shrink-0" />}
          <span style={{ color: finalStatuses.aborted ? styleColors.destructive : 'inherit' }}>{displayLabel}</span>
        </div>
        
        {/* Нода с изображением */}
        <div style={{ 
          width: '200px', 
          height: '150px',
          border: `2px solid ${styleColors.inputBorder}`,
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
          background: styleColors.sidebar
        }}>
          {/* Handle для входящих соединений */}
          <Handle type="target" position={Position.Left} />
          
          {data.image ? (
            <img 
              src={data.image} 
              alt={data.label}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain' // Пропорциональное отображение
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: styleColors.sidebar,
              color: styleColors.mutedText,
              fontSize: '12px',
              textAlign: 'center',
              padding: '8px'
            }}>
              {data.label}
            </div>
          )}
          
          {/* Handle для исходящих соединений */}
          <Handle type="source" position={Position.Right} />
        </div>
      </div>
    );
  };

  // Мемоизируем nodeTypes и edgeTypes чтобы избежать пересоздания при каждом рендере
  const nodeTypes = useMemo(() => ({
    screen: ScreenNode
  }), []);

  const edgeTypes = useMemo(() => ({
    sankey: SankeyEdge
  }), []);

  // Calculate flow data for xyflow
  const getFlowData = () => {
    if (!proto) return { nodes: [], edges: [] };

    // Отслеживаем пути респондентов и их финальные статусы
    interface RespondentPath {
      sessionId: string;
      screens: string[];
      finalScreen: string | null;
      status: 'completed' | 'aborted' | 'closed' | 'in_progress';
      finalEventType?: 'completed' | 'aborted' | 'closed';
    }

    const respondentPaths: RespondentPath[] = [];
    const transitionCounts: Record<string, number> = {};
    const finalScreensByStatus: Record<string, Set<string>> = {
      completed: new Set(),
      aborted: new Set(),
      closed: new Set(),
      in_progress: new Set()
    };

    sessions.forEach(session => {
      const sessionEvents = events
        .filter(e => e.session_id === session.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      const screenLoads = sessionEvents.filter(e => e.event_type === "screen_load");
      const completedEvent = sessionEvents.find(e => e.event_type === "completed");
      const abortedEvent = sessionEvents.find(e => e.event_type === "aborted");
      const closedEvent = sessionEvents.find(e => e.event_type === "closed");
      
      // Определяем финальный статус
      let status: 'completed' | 'aborted' | 'closed' | 'in_progress' = 'in_progress';
      let finalEventType: 'completed' | 'aborted' | 'closed' | undefined = undefined;
      let finalScreen: string | null = null;
      
      if (completedEvent) {
        const completedTime = new Date(completedEvent.timestamp).getTime();
        const abortedTime = abortedEvent ? new Date(abortedEvent.timestamp).getTime() : 0;
        const closedTime = closedEvent ? new Date(closedEvent.timestamp).getTime() : 0;
        
        if (completedTime >= abortedTime && completedTime >= closedTime) {
          status = 'completed';
          finalEventType = 'completed';
        } else if (abortedTime > closedTime) {
          status = 'aborted';
          finalEventType = 'aborted';
        } else {
          status = 'closed';
          finalEventType = 'closed';
        }
      } else if (abortedEvent) {
        status = 'aborted';
        finalEventType = 'aborted';
      } else if (closedEvent) {
        status = 'closed';
        finalEventType = 'closed';
      }
      
      // Определяем финальный экран (последний screen_load перед финальным событием или последний screen_load)
      const screens = screenLoads.map(e => e.screen_id).filter(Boolean) as string[];
      
      // Если нет экранов, но есть событие aborted/closed, используем общий стартовый экран
      // (будет определен позже, но нужно сохранить статус)
      if (screens.length > 0) {
        finalScreen = screens[screens.length - 1];
        finalScreensByStatus[status].add(finalScreen);
      } else if (status !== 'in_progress') {
        // Если респондент сдался/закрыл без загрузки экранов, финальный экран будет определен позже
        // как общий стартовый экран
        finalScreen = null;
      }
      
      // Сохраняем путь респондента (даже если screens пустой)
      respondentPaths.push({
        sessionId: session.id,
        screens,
        finalScreen,
        status,
        finalEventType
      });
      
      // Подсчитываем частоту переходов
      for (let i = 0; i < screens.length - 1; i++) {
        const from = screens[i];
        const to = screens[i + 1];
        if (from && to) {
          const key = `${from}->${to}`;
          transitionCounts[key] = (transitionCounts[key] || 0) + 1;
        }
      }
    });

    // Определяем общий стартовый экран для всех респондентов
    const startScreenCounts = new Map<string, number>();
    respondentPaths.forEach(path => {
      if (path.screens.length > 0) {
        const startScreen = path.screens[0];
        startScreenCounts.set(startScreen, (startScreenCounts.get(startScreen) || 0) + 1);
      }
    });
    
    // Находим самый частый стартовый экран
    let commonStartScreen: string | null = null;
    let maxCount = 0;
    startScreenCounts.forEach((count, screenId) => {
      if (count > maxCount) {
        maxCount = count;
        commonStartScreen = screenId;
      }
    });
    
    // Функция для удаления дубликатов экранов, оставляя только первое вхождение
    const removeDuplicates = (screenArray: string[]): string[] => {
      const seen = new Set<string>();
      const result: string[] = [];
      screenArray.forEach(screenId => {
        if (!seen.has(screenId)) {
          seen.add(screenId);
          result.push(screenId);
        }
      });
      return result;
    };
    
    // Функция для получения цвета по статусу
    const getColorByStatus = (status: string) => {
      switch (status) {
        case 'completed':
          return chartColors.primary;
        case 'aborted':
          return chartColors.destructive;
        case 'closed':
          return chartColors.muted;
        default:
          return chartColors.muted;
      }
    };

    // Создаем ноды и edges для каждого респондента на отдельной горизонтальной линии
    const nodes: any[] = [];
    const edges: any[] = [];
    const nodeIdMap = new Map<string, string>(); // Маппинг (sessionId, screenId) -> nodeId
    
    // Константы для позиционирования
    const stepWidth = 250; // Ширина шага по горизонтали
    const rowHeight = 200; // Высота строки для каждого респондента
    const startY = 40; // Начальная позиция Y
    const startScreenX = 0; // Позиция X для стартового экрана (общий столбец слева)

    // Создаем одну ноду для общего стартового экрана (если он определен)
    // Позиционируем его на первой строке (на той же высоте, что и первый респондент)
    if (commonStartScreen) {
      const startScreen = screens.find(s => s.id === commonStartScreen);
      if (startScreen) {
        const startNodeId = `start-${commonStartScreen}`;
        nodeIdMap.set(`start-${commonStartScreen}`, startNodeId);
        
        nodes.push({
          id: startNodeId,
          type: 'screen',
          position: { x: startScreenX, y: startY },
          data: {
            label: startScreen.name,
            image: startScreen.image,
            screenId: startScreen.id,
            finalStatuses: {
              completed: false,
              aborted: false,
              closed: false,
              in_progress: false
            },
            sessionId: 'common-start'
          }
        });
      }
    }

    respondentPaths.forEach((path, respondentIndex) => {
      const y = startY + respondentIndex * rowHeight;
      
      // Если у респондента нет экранов, но он сдался/закрыл, используем общий стартовый экран
      let uniqueScreens = removeDuplicates(path.screens);
      if (uniqueScreens.length === 0 && commonStartScreen && path.status !== 'in_progress') {
        uniqueScreens = [commonStartScreen];
        // Обновляем finalScreen для этого пути
        path.finalScreen = commonStartScreen;
      }
      
      // Если первый экран - это общий стартовый экран, пропускаем его (уже создан)
      const screensToRender = commonStartScreen && uniqueScreens[0] === commonStartScreen
        ? uniqueScreens.slice(1)
        : uniqueScreens;
      
      // Определяем финальный экран из уникального пути
      const finalScreenInUniquePath = uniqueScreens.length > 0 
        ? uniqueScreens[uniqueScreens.length - 1] 
        : null;
      
      // Если screensToRender пустой, но есть общий стартовый экран и респондент сдался на нем,
      // создаем новую ноду на следующей позиции с индикатором статуса и соединяем с общим стартовым экраном
      if (screensToRender.length === 0 && commonStartScreen && uniqueScreens[0] === commonStartScreen && path.status !== 'in_progress') {
        const startScreen = screens.find(s => s.id === commonStartScreen);
        if (startScreen) {
          const nodeId = `${path.sessionId}-${commonStartScreen}-final`;
          nodeIdMap.set(`${path.sessionId}-${commonStartScreen}`, nodeId);
          
          const finalStatuses = {
            completed: path.status === 'completed',
            aborted: path.status === 'aborted',
            closed: path.status === 'closed',
            in_progress: path.status === 'in_progress'
          };
          
          // Создаем ноду на следующей позиции после стартового экрана
          nodes.push({
            id: nodeId,
            type: 'screen',
            position: { x: stepWidth, y },
            data: {
              label: startScreen.name,
              image: startScreen.image,
              screenId: startScreen.id,
              finalStatuses,
              sessionId: path.sessionId
            }
          });
          
          // Создаем edge от общего стартового экрана к этой ноде
          const startNodeId = nodeIdMap.get(`start-${commonStartScreen}`);
          if (startNodeId) {
            edges.push({
              id: `edge-${path.sessionId}-from-start`,
              source: startNodeId,
              target: nodeId,
              type: 'bezier',
              style: {
                strokeWidth: 36,
                stroke: getColorByStatus(path.status),
                opacity: 0.35
              },
              animated: false
            });
          }
          
          // Не создаем дополнительные edges, так как это единственный переход
          return; // Пропускаем создание дополнительных edges для этого респондента
        }
      }
      
      // Создаем ноды для каждого уникального экрана в пути респондента
      screensToRender.forEach((screenId, stepIndex) => {
        const screen = screens.find(s => s.id === screenId);
        if (!screen) return;
        
        // Создаем уникальный ID ноды для каждого респондента и экрана
        const nodeId = `${path.sessionId}-${screenId}-${stepIndex}`;
        nodeIdMap.set(`${path.sessionId}-${screenId}`, nodeId);
        
        // Позиционируем: если это первый экран и он не общий стартовый, то x=0, иначе stepIndex+1 (т.к. стартовый уже на позиции 0)
        const x = (commonStartScreen && uniqueScreens[0] === commonStartScreen) 
          ? (stepIndex + 1) * stepWidth 
          : stepIndex * stepWidth;
        
        // Определяем финальные статусы для этого экрана
        const isFinalScreen = path.finalScreen === screenId && finalScreenInUniquePath === screenId;
        const finalStatuses = {
          completed: isFinalScreen && path.status === 'completed',
          aborted: isFinalScreen && path.status === 'aborted',
          closed: isFinalScreen && path.status === 'closed',
          in_progress: isFinalScreen && path.status === 'in_progress'
        };
        
        nodes.push({
          id: nodeId,
          type: 'screen',
          position: { x, y },
          data: {
            label: screen.name,
            image: screen.image,
            screenId: screen.id,
            finalStatuses,
            sessionId: path.sessionId
          }
        });
      });
      
      // Создаем edges между последовательными экранами в уникальном пути респондента
      const pathForEdges = uniqueScreens;
      for (let i = 0; i < pathForEdges.length - 1; i++) {
        const fromScreenId = pathForEdges[i];
        const toScreenId = pathForEdges[i + 1];
        
        // Определяем ID нод для source и target
        let fromNodeId: string | undefined;
        let toNodeId: string | undefined;
        
        // Если это первый экран и он общий стартовый
        if (i === 0 && commonStartScreen && fromScreenId === commonStartScreen) {
          fromNodeId = nodeIdMap.get(`start-${commonStartScreen}`);
        } else {
          fromNodeId = nodeIdMap.get(`${path.sessionId}-${fromScreenId}`);
        }
        
        toNodeId = nodeIdMap.get(`${path.sessionId}-${toScreenId}`);
        
        if (fromNodeId && toNodeId) {
          edges.push({
            id: `edge-${path.sessionId}-${i}`,
            source: fromNodeId,
            target: toNodeId,
            type: 'bezier',
            style: {
              strokeWidth: 36,
              stroke: getColorByStatus(path.status),
              opacity: 0.35
            },
            animated: false
          });
        }
      }
    });

    return { nodes, edges };
  };

  const { nodes, edges } = getFlowData();
  
  // Обработчик клика на ноду
  const handleNodeClick = (event: React.MouseEvent, node: any) => {
    // Извлекаем screenId из данных ноды (новый формат ID: sessionId-screenId-stepIndex)
    const screenId = node.data?.screenId || node.id.split('-')[1] || node.id;
    const screen = screens.find(s => s.id === screenId);
    if (!screen) return;
    
    // Подсчитываем количество людей, посетивших экран
    const screenEvents = events.filter(e => e.screen_id === screen.id && e.event_type === "screen_load");
    const visitorsCount = new Set(screenEvents.map(e => e.session_id)).size;
    const totalSessions = sessions.length;
    
    // Определяем номер шага (позицию в среднем пути)
    // Для упрощения используем индекс в массиве screens
    const stepNumber = screens.findIndex(s => s.id === screen.id) + 1;
    
    // Получаем позицию клика для размещения попапа рядом
    const clickX = event.clientX;
    const clickY = event.clientY;
    
    setSelectedNode({
      screen,
      stepNumber,
      visitorsCount,
      totalSessions,
      position: { x: clickX, y: clickY }
    });
  };

  // Calculate click-based heatmap data
  const getHeatmapData = (screenId: string) => {
    const screenEvents = events.filter(e => 
      e.screen_id === screenId && 
      (e.event_type === "click" || e.event_type === "hotspot_click") &&
      e.x !== undefined && e.y !== undefined
    );

    const clickMap: Record<string, { x: number; y: number; count: number }> = {};
    screenEvents.forEach(e => {
      if (onlyFirstClicks) {
        // Only count first click per session
        const sessionFirstClicks = new Set<string>();
        const sessionId = e.session_id;
        if (!sessionFirstClicks.has(sessionId)) {
          sessionFirstClicks.add(sessionId);
          const key = `${Math.floor(e.x! / 10) * 10}_${Math.floor(e.y! / 10) * 10}`;
          if (!clickMap[key]) {
            clickMap[key] = { x: e.x!, y: e.y!, count: 0 };
          }
          clickMap[key].count += 1;
        }
      } else {
        const key = `${Math.floor(e.x! / 10) * 10}_${Math.floor(e.y! / 10) * 10}`;
        if (!clickMap[key]) {
          clickMap[key] = { x: e.x!, y: e.y!, count: 0 };
        }
        clickMap[key].count += 1;
      }
    });

    return Object.values(clickMap);
  };

  // Calculate gaze-based heatmap data (using normalized coordinates)
  const getGazeHeatmapData = (blockId: string, screenId: string, runIdFilter?: string | null) => {
    const samples = gazePoints.filter(p => 
      p.block_id === blockId &&
      p.screen_id === screenId &&
      (runIdFilter ? p.run_id === runIdFilter : true)
    );

    const clickMap: Record<string, { x: number; y: number; count: number }> = {};
    samples.forEach(sample => {
      const proto = Object.values(prototypes)[0] as Proto | undefined;
      // Для координат используем нормализованные значения, умноженные на размеры экрана,
      // сами размеры передаются в HeatmapRenderer через props
      const x = sample.x_norm;
      const y = sample.y_norm;
      const key = `${Math.floor(x * 100)}_${Math.floor(y * 100)}`;
      if (!clickMap[key]) {
        clickMap[key] = { x, y, count: 0 };
      }
      clickMap[key].count += 1;
    });

    return Object.values(clickMap);
  };

  // Get screen statistics
  const getScreenStats = (screenId: string) => {
    const screenEvents = events.filter(e => e.screen_id === screenId);
    const screenSessions = new Set(screenEvents.map(e => e.session_id));
    const clicks = screenEvents.filter(e => 
      e.event_type === "click" || e.event_type === "hotspot_click"
    );
    const misses = clicks.filter(e => !e.hotspot_id).length;
    
    // Calculate time on screen
    const screenLoads = screenEvents.filter(e => e.event_type === "screen_load");
    let totalTime = 0;
    screenLoads.forEach(load => {
      // Ищем следующее событие ТОЛЬКО в той же сессии
      const sessionEvents = screenEvents.filter(e => e.session_id === load.session_id);
      const nextEvent = sessionEvents.find(e => 
        e.timestamp > load.timestamp && 
        (e.event_type === "screen_load" || e.event_type === "completed" || e.event_type === "aborted")
      );
      if (nextEvent) {
        totalTime += new Date(nextEvent.timestamp).getTime() - new Date(load.timestamp).getTime();
      }
    });
    const avgTimeOnScreen = screenSessions.size > 0 ? (totalTime / screenSessions.size) / 1000 : 0;
    const medianTimeOnScreen = avgTimeOnScreen; // Simplified

    return {
      respondents: screenSessions.size,
      totalClicks: clicks.length,
      misses,
      avgTime: avgTimeOnScreen,
      medianTime: medianTimeOnScreen
    };
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with task number and response count */}
      <Card className={`${viewMode === "responses" ? "border-0 shadow-none group" : ""}`}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6">{blockIndex + 1}.</span>
              <div className="w-5 h-5 rounded bg-border flex items-center justify-center flex-shrink-0">
                <IconComponent size={14} className="text-muted-foreground" />
              </div>
              <span className="text-[15px] font-medium leading-6">{blockConfig.label}</span>
            </div>
            {viewMode === "responses" && onDeleteResponses && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                  onClick={() => onDeleteResponses(block.id)}
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-base">{taskDescription}</p>
          </div>
          <div className="px-4 pb-4">
            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <UserRoundCheck className="h-6 w-6 text-green-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Справились</div>
                  <div className="text-2xl font-bold">{completedCount}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <UserRoundX className="h-6 w-6 text-orange-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Сдался</div>
                  <div className="text-2xl font-bold">{abortedCount}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <UserRoundMinus className="h-6 w-6 text-gray-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Закрыли прототип</div>
                  <div className="text-2xl font-bold">{closedCount}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Clock className="h-6 w-6 text-blue-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Среднее время</div>
                  <div className="text-2xl font-bold">{avgTime.toFixed(1)} с</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Clock className="h-6 w-6 text-blue-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Медианное время</div>
                  <div className="text-2xl font-bold">{medianTime.toFixed(1)} с</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flow visualization - только в режиме "Сводный" */}
      {proto && viewMode === "summary" && (
        <Card className="p-6 relative">
          <h3 className="text-lg font-semibold mb-4">Пути</h3>
          <div style={{ height: '400px', width: '100%', position: 'relative' }}>
            <ReactFlow 
              nodes={nodes} 
              edges={edges} 
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={handleNodeClick}
              onPaneClick={() => setSelectedNode(null)}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
          
          {/* Попап с информацией о ноде - рядом с нодой */}
          {selectedNode && selectedNode.position && (
            <div 
              className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-4"
              style={{
                width: '240px',
                height: '308px',
                left: `${selectedNode.position.x + 20}px`,
                top: `${selectedNode.position.y + 20}px`,
                pointerEvents: 'auto',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedNode(null)}
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
              <div className="space-y-3 h-full overflow-y-auto">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Номер шага</div>
                  <div className="text-sm font-semibold">{selectedNode.stepNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Название экрана</div>
                  <div className="text-sm font-medium">{selectedNode.screen.name}</div>
                </div>
                {selectedNode.screen.image && (
                  <div>
                    <img 
                      src={selectedNode.screen.image} 
                      alt={selectedNode.screen.name}
                      className="w-full h-auto rounded-lg border border-border"
                    />
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Посетили экран</div>
                  <div className="text-sm font-medium">
                    {selectedNode.visitorsCount} из {selectedNode.totalSessions} ({selectedNode.totalSessions > 0 ? Math.round((selectedNode.visitorsCount / selectedNode.totalSessions) * 100) : 0}%)
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </Card>
      )}

      {/* Heatmaps and clicks или таблица респондентов */}
      <Card className={`p-6 ${viewMode === "responses" ? "border-0 shadow-none" : ""}`}>
        {viewMode === "summary" ? (
          <>
            <h3 className="text-lg font-semibold mb-4">
              Тепловые карты и клики
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Смотрите тепловые карты и клики для каждого экрана или отдельных ответов
            </p>

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setHeatmapTab("by_screens")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapTab === "by_screens"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                По экранам
              </button>
              <button
                onClick={() => setHeatmapTab("by_respondents")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapTab === "by_respondents"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                По респондентам
              </button>
            </div>
          </>
        ) : (
          <h3 className="text-lg font-semibold mb-4">
            Респонденты
          </h3>
        )}

        {viewMode === "summary" && heatmapTab === "by_screens" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {screens.map((screen, idx) => (
              <button
                key={screen.id}
                onClick={() => setSelectedHeatmapScreen({
                  screen,
                  proto: proto!,
                  blockId: block.id,
                  screenIndex: idx + 1,
                  totalScreens: screens.length
                })}
                className="text-left space-y-2"
                type="button"
              >
                <img
                  src={screen.image}
                  alt={screen.name}
                  className="w-full h-auto rounded border border-border pointer-events-none"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="text-sm font-medium">{screen.name}</div>
              </button>
            ))}
          </div>
        )}

        {viewMode === "summary" && heatmapTab === "by_respondents" && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-sm">Дата</th>
                  <th className="text-left p-3 font-medium text-sm">Статус</th>
                  <th className="text-left p-3 font-medium text-sm">Время</th>
                  <th className="text-left p-3 font-medium text-sm">Запись</th>
                  <th className="text-left p-3 font-medium text-sm">Путь</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const sessionEvents = events
                    .filter(e => e.session_id === session.id && e.event_type === "screen_load")
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                  
                  const screenIds = sessionEvents.map(e => e.screen_id).filter(Boolean);
                  
                  // Вычисляем время прохождения и статус
                  let sessionTime = 0;
                  let status: string = "В процессе";
                  if (sessionEvents.length > 0) {
                    const startTime = new Date(sessionEvents[0].timestamp).getTime();
                    const lastEventTime = new Date(
                      sessionEvents[sessionEvents.length - 1].timestamp
                    ).getTime();
                    const now = Date.now();
                    const inactiveForMs = now - lastEventTime;

                    // Определяем статус через события
                    const sessionAllEvents = events.filter(
                      (e) => e.session_id === session.id
                    );
                    const hasClosed = sessionAllEvents.some(
                      (e) => e.event_type === "closed"
                    );

                    if (session.completed) {
                      status = "Успешно";
                    } else if (session.aborted) {
                      status = "Сдался";
                    } else if (hasClosed) {
                      status = "Закрыл прототип";
                    } else if (inactiveForMs >= SESSION_INACTIVITY_TIMEOUT_MS) {
                      // Нет явного closed, но сессия давно неактивна — считаем, что прототип закрыли
                      status = "Закрыл прототип";
                    } else {
                      status = "В процессе";
                    }

                    const isTerminal =
                      status === "Успешно" ||
                      status === "Сдался" ||
                      status === "Закрыл прототип";
                    const endTime = isTerminal ? lastEventTime : now;
                    sessionTime = (endTime - startTime) / 1000;
                  }

                  const statusIcon = status === "Успешно"
                    ? <UserRoundCheck className="h-4 w-4 text-success inline-block mr-1" />
                    : status === "Сдался"
                      ? <UserRoundX className="h-4 w-4 text-destructive inline-block mr-1" />
                      : status === "Закрыл прототип"
                        ? <UserRoundMinus className="h-4 w-4 text-muted-foreground inline-block mr-1" />
                        : null;
                  const statusColor =
                    status === "Успешно"
                      ? "text-success"
                      : status === "Сдался"
                        ? "text-destructive"
                        : "";
                  const date = new Date(session.started_at);
                  const formattedDate = formatResponseDate(date);
                  
                  return (
                    <tr key={session.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 text-sm">{formattedDate}</td>
                      <td className={`p-3 text-sm ${statusColor}`}>
                        {statusIcon}
                        {status}
                      </td>
                      <td className="p-3 text-sm">{sessionTime.toFixed(1)} с</td>
                      <td className="p-3 text-sm">
                        {session.recording_url ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (setRecordingModalUrl) {
                                setRecordingModalUrl(session.recording_url!);
                              }
                            }}
                            className="text-xs text-accent hover:underline flex items-center gap-1"
                          >
                            <CirclePlay className="h-3 w-3" />
                            Да
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Нет</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2 flex-wrap">
                          {screenIds.map((screenId, screenIdx) => {
                            const screen = screenMap.get(screenId);
                            if (!screen || !proto) return null;
                            return (
                              <button
                                key={screenIdx}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const screenData = {
                                    screen,
                                    proto,
                                    session,
                                    screenIndex: screenIdx + 1,
                                    totalScreens: screenIds.length
                                  };
                                  setSelectedRespondentScreen(screenData);
                                }}
                                className="relative border-0 bg-transparent p-0 cursor-pointer"
                                type="button"
                              >
                                <img
                                  src={screen.image}
                                  alt={screen.name}
                                  className="w-16 h-12 object-cover rounded border border-border hover:border-primary transition-colors"
                                  draggable="false"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Таблица для режима "ответы" */}
        {viewMode === "responses" && (
          <>
            {/* Задание */}
            {taskDescription && taskDescription !== "Задание" && (
              <div className="mb-4 p-4 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-semibold mb-2">Задание:</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{taskDescription}</p>
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-sm">Дата</th>
                    <th className="text-left p-3 font-medium text-sm">Статус</th>
                    <th className="text-left p-3 font-medium text-sm">Время</th>
                    <th className="text-left p-3 font-medium text-sm">Путь</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => {
                    const sessionEvents = events
                      .filter(e => e.session_id === session.id && e.event_type === "screen_load")
                      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    
                    const screenIds = sessionEvents.map(e => e.screen_id).filter(Boolean);
                    
                    // Вычисляем время прохождения и статус
                    let sessionTime = 0;
                    let status: string = "В процессе";
                    if (sessionEvents.length > 0) {
                      const startTime = new Date(sessionEvents[0].timestamp).getTime();
                      const lastEventTime = new Date(
                        sessionEvents[sessionEvents.length - 1].timestamp
                      ).getTime();
                      const now = Date.now();
                      const inactiveForMs = now - lastEventTime;

                      // Определяем статус через события
                      const sessionAllEventsForProto = events.filter(
                        (e) => e.session_id === session.id
                      );
                      const hasClosedForProto = sessionAllEventsForProto.some(
                        (e) => e.event_type === "closed"
                      );

                      if (session.completed) {
                        status = "Успешно";
                      } else if (session.aborted) {
                        status = "Сдался";
                      } else if (hasClosedForProto) {
                        status = "Закрыл прототип";
                      } else if (inactiveForMs >= SESSION_INACTIVITY_TIMEOUT_MS) {
                        status = "Закрыл прототип";
                      } else {
                        status = "В процессе";
                      }

                      const isTerminal =
                        status === "Успешно" ||
                        status === "Сдался" ||
                        status === "Закрыл прототип";
                      const endTime = isTerminal ? lastEventTime : now;
                      sessionTime = (endTime - startTime) / 1000;
                    }

                    const statusIcon = status === "Успешно"
                      ? <UserRoundCheck className="h-4 w-4 text-success inline-block mr-1" />
                      : status === "Сдался"
                        ? <UserRoundX className="h-4 w-4 text-destructive inline-block mr-1" />
                        : status === "Закрыл прототип"
                          ? <UserRoundMinus className="h-4 w-4 text-muted-foreground inline-block mr-1" />
                          : null;
                    const statusColor =
                      status === "Успешно"
                        ? "text-success"
                        : status === "Сдался"
                          ? "text-destructive"
                          : "";
                    const date = new Date(session.started_at);
                    const formattedDate = formatResponseDate(date);
                    
                    return (
                      <tr key={session.id} className="border-b border-border hover:bg-muted/30">
                        <td className="p-3 text-sm">{formattedDate}</td>
                        <td className={`p-3 text-sm ${statusColor}`}>
                          {statusIcon}
                          {status}
                        </td>
                        <td className="p-3 text-sm">{sessionTime.toFixed(1)} с</td>
                        <td className="p-3">
                          <div className="flex gap-2 flex-wrap">
                            {screenIds.map((screenId, screenIdx) => {
                              const screen = screenMap.get(screenId);
                              if (!screen || !proto) return null;
                              return (
                                <button
                                  key={screenIdx}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const screenData = {
                                      screen,
                                      proto,
                                      session,
                                      screenIndex: screenIdx + 1,
                                      totalScreens: screenIds.length
                                    };
                                    setModalJustOpened(true);
                                    setSelectedRespondentScreen(screenData);
                                  }}
                                  className="relative border-0 bg-transparent p-0 cursor-pointer"
                                  type="button"
                                >
                                  <img
                                    src={screen.image}
                                    alt={screen.name}
                                    className="w-16 h-12 object-cover rounded border border-border hover:border-primary transition-colors pointer-events-none"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Modal for heatmap screen */}
      {selectedHeatmapScreen && createPortal(
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
          onClick={() => setSelectedHeatmapScreen(null)}
        >
          <div
            className="bg-card rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">
                {selectedHeatmapScreen.screen.name} ({selectedHeatmapScreen.screenIndex} из {selectedHeatmapScreen.totalScreens})
              </h3>
              <button
                onClick={() => setSelectedHeatmapScreen(null)}
                className="p-2 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setHeatmapView("heatmap")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapView === "heatmap"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Тепловая карта
              </button>
              <button
                onClick={() => setHeatmapView("clicks")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapView === "clicks"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Клики
              </button>
              <button
                onClick={() => setHeatmapView("image")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  heatmapView === "image"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Изображение
              </button>
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <div className="relative border border-border rounded-lg overflow-hidden bg-black">
                  {heatmapView === "image" && (
                    <img
                      src={selectedHeatmapScreen.screen.image}
                      alt={selectedHeatmapScreen.screen.name}
                      className="w-full h-auto"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'flex items-center justify-center h-64 text-white';
                        errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                        target.parentElement?.appendChild(errorDiv);
                      }}
                    />
                  )}
                  {heatmapView === "heatmap" && (() => {
                    const heatmapData = getHeatmapData(selectedHeatmapScreen.screen.id);
                    const maxCount = Math.max(...heatmapData.map(c => c.count), 1);
                    return (
                      <HeatmapRenderer
                        data={heatmapData}
                        width={selectedHeatmapScreen.screen.width}
                        height={selectedHeatmapScreen.screen.height}
                        imageUrl={selectedHeatmapScreen.screen.image}
                        max={maxCount}
                      />
                    );
                  })()}
                  {heatmapView === "clicks" && (
                    <>
                      <img
                        src={selectedHeatmapScreen.screen.image}
                        alt={selectedHeatmapScreen.screen.name}
                        className="w-full h-auto"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'flex items-center justify-center h-64 text-white';
                          errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                          target.parentElement?.appendChild(errorDiv);
                        }}
                      />
                      <div className="absolute inset-0 pointer-events-none">
                        {getHeatmapData(selectedHeatmapScreen.screen.id).map((click, idx) => {
                          const maxCount = Math.max(...getHeatmapData(selectedHeatmapScreen.screen.id).map(c => c.count), 1);
                          const opacity = Math.min(0.8, 0.3 + (click.count / maxCount) * 0.5);
                          const size = Math.max(8, Math.min(32, 8 + (click.count / maxCount) * 24));
                          return (
                            <div
                              key={`heatmap-click-${click.x}-${click.y}-${idx}`}
                              className="absolute rounded-full bg-red-500 border-2 border-white"
                              style={{
                                left: `${(click.x / selectedHeatmapScreen.screen.width) * 100}%`,
                                top: `${(click.y / selectedHeatmapScreen.screen.height) * 100}%`,
                                width: `${size}px`,
                                height: `${size}px`,
                                transform: 'translate(-50%, -50%)',
                                opacity
                              }}
                              title={`${click.count} клик${click.count > 1 ? 'ов' : ''}`}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="w-64 space-y-4">
                {(() => {
                  const stats = getScreenStats(selectedHeatmapScreen.screen.id);
                  return (
                    <>
                      <div>
                        <div className="text-sm text-muted-foreground">Респонденты</div>
                        <div className="text-lg font-semibold">{stats.respondents}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Всего кликов</div>
                        <div className="text-lg font-semibold">{stats.totalClicks}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Промахи</div>
                        <div className="text-lg font-semibold">{stats.misses}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Среднее время</div>
                        <div className="text-lg font-semibold">{stats.avgTime.toFixed(2)} с</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Медианное время</div>
                        <div className="text-lg font-semibold">{stats.medianTime.toFixed(2)} с</div>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <div className="text-sm font-medium mb-2">Настройки</div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="only-first-clicks"
                            checked={onlyFirstClicks}
                            onCheckedChange={(checked) => setOnlyFirstClicks(checked === true)}
                          />
                          <Label htmlFor="only-first-clicks" className="text-sm">
                            Только первые клики
                          </Label>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal for respondent screen */}
      {(() => {
        if (!selectedRespondentScreen) {
          return null;
        }
        return createPortal(
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
          onClick={(e) => {
            // Prevent closing if modal was just opened (prevents click event from button bubbling)
            if (modalJustOpened) {
              e.stopPropagation();
              return;
            }
            setSelectedRespondentScreen(null);
            setModalJustOpened(false);
          }}
        >
          <div
            className="bg-card rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">
                {selectedRespondentScreen.screen.name} ({selectedRespondentScreen.screenIndex} из {selectedRespondentScreen.totalScreens})
              </h3>
              <button
                onClick={() => {
                  setSelectedRespondentScreen(null);
                  setModalJustOpened(false);
                }}
                className="p-2 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setRespondentHeatmapView("heatmap")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "heatmap"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Тепловая карта
              </button>
              <button
                onClick={() => setRespondentHeatmapView("clicks")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "clicks"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Клики
              </button>
              <button
                onClick={() => setRespondentHeatmapView("image")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "image"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Изображение
              </button>
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <div className="relative border border-border rounded-lg overflow-hidden bg-black">
                  {respondentHeatmapView === "image" && (
                    <img
                      src={selectedRespondentScreen.screen.image}
                      alt={selectedRespondentScreen.screen.name}
                      className="w-full h-auto"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'flex items-center justify-center h-64 text-white';
                        errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                        target.parentElement?.appendChild(errorDiv);
                      }}
                    />
                  )}
                  {respondentHeatmapView === "heatmap" && (() => {
                    const sessionClicks = events
                      .filter(e => 
                        e.session_id === selectedRespondentScreen.session.id &&
                        e.screen_id === selectedRespondentScreen.screen.id &&
                        (e.event_type === "click" || e.event_type === "hotspot_click") &&
                        e.x !== undefined && e.y !== undefined
                      );
                    
                    // Преобразуем в формат для тепловой карты (группируем по координатам)
                    const clickMap: Record<string, { x: number; y: number; count: number }> = {};
                    sessionClicks.forEach(e => {
                      const key = `${Math.floor(e.x! / 10) * 10}_${Math.floor(e.y! / 10) * 10}`;
                      if (!clickMap[key]) {
                        clickMap[key] = { x: e.x!, y: e.y!, count: 0 };
                      }
                      clickMap[key].count += 1;
                    });
                    
                    const heatmapData = Object.values(clickMap);
                    const maxCount = Math.max(...heatmapData.map(c => c.count), 1);
                    
                    return (
                      <HeatmapRenderer
                        data={heatmapData}
                        width={selectedRespondentScreen.screen.width}
                        height={selectedRespondentScreen.screen.height}
                        imageUrl={selectedRespondentScreen.screen.image}
                        max={maxCount}
                      />
                    );
                  })()}
                  {respondentHeatmapView === "clicks" && (
                    <>
                      <img
                        src={selectedRespondentScreen.screen.image}
                        alt={selectedRespondentScreen.screen.name}
                        className="w-full h-auto"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'flex items-center justify-center h-64 text-white';
                          errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                          target.parentElement?.appendChild(errorDiv);
                        }}
                      />
                      {(() => {
                        const sessionClicks = events
                          .filter(e => 
                            e.session_id === selectedRespondentScreen.session.id &&
                            e.screen_id === selectedRespondentScreen.screen.id &&
                            (e.event_type === "click" || e.event_type === "hotspot_click") &&
                            e.x !== undefined && e.y !== undefined
                          )
                          .map((e, idx) => ({ ...e, clickOrder: idx + 1 }));
                        
                        return (
                          <div className="absolute inset-0 pointer-events-none">
                            {sessionClicks.map((click, idx) => (
                              <div
                                key={`session-click-${click.x}-${click.y}-${idx}`}
                                className="absolute rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                                style={{
                                  left: `${(click.x! / selectedRespondentScreen.screen.width) * 100}%`,
                                  top: `${(click.y! / selectedRespondentScreen.screen.height) * 100}%`,
                                  width: '24px',
                                  height: '24px',
                                  transform: 'translate(-50%, -50%)'
                                }}
                                title={`Клик ${click.clickOrder}`}
                              >
                                {showClickOrder && click.clickOrder}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>

              <div className="w-64 space-y-4">
                {(() => {
                  const sessionEvents = events.filter(e => 
                    e.session_id === selectedRespondentScreen.session.id &&
                    e.screen_id === selectedRespondentScreen.screen.id
                  );
                  const clicks = sessionEvents.filter(e => 
                    e.event_type === "click" || e.event_type === "hotspot_click"
                  );
                  const misses = clicks.filter(e => !e.hotspot_id).length;
                  
                  // Calculate time on screen
                  const screenLoad = sessionEvents.find(e => e.event_type === "screen_load");
                  const nextScreenLoad = events.find(e => 
                    e.session_id === selectedRespondentScreen.session.id &&
                    e.timestamp > (screenLoad?.timestamp || '') &&
                    e.event_type === "screen_load"
                  );
                  const timeOnScreen = screenLoad && nextScreenLoad
                    ? (new Date(nextScreenLoad.timestamp).getTime() - new Date(screenLoad.timestamp).getTime()) / 1000
                    : 0;

                  return (
                    <>
                      <div>
                        <div className="text-sm text-muted-foreground">Всего кликов</div>
                        <div className="text-lg font-semibold">{clicks.length}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Промахов</div>
                        <div className="text-lg font-semibold">{misses}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Время на экране</div>
                        <div className="text-lg font-semibold">{timeOnScreen.toFixed(2)} с</div>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <div className="text-sm font-medium mb-2">Настройки</div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="click-order"
                            checked={showClickOrder}
                            onCheckedChange={(checked) => setShowClickOrder(checked === true)}
                          />
                          <Label htmlFor="click-order" className="text-sm">
                            Порядок кликов
                          </Label>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
        );
      })()}
    </div>
  );
}

// All Blocks Report View - shows all blocks in one card with 1px borders
interface AllBlocksReportViewProps {
  blocks: StudyBlock[];
  sessionId: string;
  runId: string;
  responses: StudyBlockResponse[];
  sessions: Session[];
  events: any[];
  prototypes: Record<string, Proto>;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function AllBlocksReportView({
  blocks,
  sessionId,
  runId,
  responses,
  sessions,
  events,
  prototypes,
  onDeleteResponses
}: AllBlocksReportViewProps) {
  // State for modal
  const [selectedRespondentScreen, setSelectedRespondentScreen] = useState<{
    screen: Screen;
    proto: Proto;
    session: Session;
    screenIndex: number;
    totalScreens: number;
  } | null>(null);
  const [modalJustOpened, setModalJustOpened] = useState(false);
  const [respondentHeatmapView, setRespondentHeatmapView] = useState<HeatmapView>("heatmap");
  const [showClickOrder, setShowClickOrder] = useState(false);
  const [recordingModalUrl, setRecordingModalUrl] = useState<string | null>(null);

  // Reset modalJustOpened flag after a short delay to prevent immediate backdrop clicks
  useEffect(() => {
    if (selectedRespondentScreen && modalJustOpened) {
      const timer = setTimeout(() => {
        setModalJustOpened(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedRespondentScreen, modalJustOpened]);

  // Фильтруем блоки, у которых есть ответы
  // Для блока "Прототип" проверяем наличие sessions, для остальных - responses
  const blocksWithResponses = useMemo(() => {
    return blocks.filter(block => {
      if (block.type === "prototype") {
        // Для прототипа проверяем наличие sessions с block_id
        return sessions.some(s => s.block_id === block.id);
      } else {
        // Для остальных блоков проверяем наличие responses с block_id
        return responses.some(r => r.block_id === block.id);
      }
    });
  }, [blocks, sessions, responses]);
  
  return (
    <div className="max-w-full">
      <Card className="p-0 overflow-hidden">
        <div className="space-y-0">
          {blocksWithResponses.map((block, index) => {
            const blockResponses = responses.filter(r => r.block_id === block.id);
            const blockSessions = sessions.filter(s => s.block_id === block.id);
            const blockEvents = events.filter(e => e.block_id === block.id);
            
            return (
              <div key={block.id} className="relative">
                {index > 0 && <div className="absolute top-0 left-0 right-0 h-px bg-border" />}
                <div className="p-4">
                  <BlockReportView
                    block={block}
                    blocks={blocks}
                    responses={blockResponses}
                    sessions={blockSessions}
                    events={blockEvents}
                    prototypes={prototypes}
                    viewMode="responses"
                    cardSortingView="matrix"
                    setCardSortingView={() => {}}
                    treeTestingView="common_paths"
                    setTreeTestingView={() => {}}
                    heatmapView="heatmap"
                    setHeatmapView={() => {}}
                    heatmapTab="by_screens"
                    setHeatmapTab={() => {}}
                    selectedHeatmapScreen={null}
                    setSelectedHeatmapScreen={() => {}}
                    selectedRespondentScreen={selectedRespondentScreen}
                    setSelectedRespondentScreen={setSelectedRespondentScreen}
                    respondentHeatmapView={respondentHeatmapView}
                    setRespondentHeatmapView={setRespondentHeatmapView}
                    expandedCategories={new Set()}
                    setExpandedCategories={() => {}}
                    expandedCards={new Set()}
                    setExpandedCards={() => {}}
                    searchCategoryQuery=""
                    setSearchCategoryQuery={() => {}}
                    searchCardQuery=""
                    setSearchCardQuery={() => {}}
                    showHiddenCategories={false}
                    setShowHiddenCategories={() => {}}
                    onlyFirstClicks={false}
                    setOnlyFirstClicks={() => {}}
                    showClickOrder={false}
                    setShowClickOrder={() => {}}
                    setModalJustOpened={setModalJustOpened}
                    recordingModalUrl={recordingModalUrl}
                    setRecordingModalUrl={setRecordingModalUrl}
                    onDeleteResponses={onDeleteResponses}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Modal for respondent screen */}
      {(() => {
        if (!selectedRespondentScreen) {
          return null;
        }
        return createPortal(
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
          onClick={(e) => {
            // Prevent closing if modal was just opened (prevents click event from button bubbling)
            if (modalJustOpened) {
              e.stopPropagation();
              return;
            }
            setSelectedRespondentScreen(null);
            setModalJustOpened(false);
          }}
        >
          <div
            className="bg-card rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">
                {selectedRespondentScreen.screen.name} ({selectedRespondentScreen.screenIndex} из {selectedRespondentScreen.totalScreens})
              </h3>
              <button
                onClick={() => {
                  setSelectedRespondentScreen(null);
                  setModalJustOpened(false);
                }}
                className="p-2 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setRespondentHeatmapView("heatmap")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "heatmap"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Тепловая карта
              </button>
              <button
                onClick={() => setRespondentHeatmapView("clicks")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "clicks"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Клики
              </button>
              <button
                onClick={() => setRespondentHeatmapView("image")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  respondentHeatmapView === "image"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Изображение
              </button>
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <div className="relative border border-border rounded-lg overflow-hidden bg-black">
                  {respondentHeatmapView === "image" && (
                    <img
                      src={selectedRespondentScreen.screen.image}
                      alt={selectedRespondentScreen.screen.name}
                      className="w-full h-auto"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'flex items-center justify-center h-64 text-white';
                        errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                        target.parentElement?.appendChild(errorDiv);
                      }}
                    />
                  )}
                  {respondentHeatmapView === "heatmap" && (() => {
                    const sessionClicks = events
                      .filter(e => 
                        e.session_id === selectedRespondentScreen.session.id &&
                        e.screen_id === selectedRespondentScreen.screen.id &&
                        (e.event_type === "click" || e.event_type === "hotspot_click") &&
                        e.x !== undefined && e.y !== undefined
                      );
                    
                    // Преобразуем в формат для тепловой карты (группируем по координатам)
                    const clickMap: Record<string, { x: number; y: number; count: number }> = {};
                    sessionClicks.forEach(e => {
                      const key = `${Math.floor(e.x! / 10) * 10}_${Math.floor(e.y! / 10) * 10}`;
                      if (!clickMap[key]) {
                        clickMap[key] = { x: e.x!, y: e.y!, count: 0 };
                      }
                      clickMap[key].count += 1;
                    });
                    
                    const heatmapData = Object.values(clickMap);
                    const maxCount = Math.max(...heatmapData.map(c => c.count), 1);
                    
                    return (
                      <HeatmapRenderer
                        data={heatmapData}
                        width={selectedRespondentScreen.screen.width}
                        height={selectedRespondentScreen.screen.height}
                        imageUrl={selectedRespondentScreen.screen.image}
                        max={maxCount}
                      />
                    );
                  })()}
                  {respondentHeatmapView === "clicks" && (
                    <>
                      <img
                        src={selectedRespondentScreen.screen.image}
                        alt={selectedRespondentScreen.screen.name}
                        className="w-full h-auto"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'flex items-center justify-center h-64 text-white';
                          errorDiv.textContent = 'Возможно прототип был изменен после импорта';
                          target.parentElement?.appendChild(errorDiv);
                        }}
                      />
                      {(() => {
                        const sessionClicks = events
                          .filter(e => 
                            e.session_id === selectedRespondentScreen.session.id &&
                            e.screen_id === selectedRespondentScreen.screen.id &&
                            (e.event_type === "click" || e.event_type === "hotspot_click") &&
                            e.x !== undefined && e.y !== undefined
                          )
                          .map((e, idx) => ({ ...e, clickOrder: idx + 1 }));
                        
                        return (
                          <div className="absolute inset-0 pointer-events-none">
                            {sessionClicks.map((click, idx) => (
                              <div
                                key={`session-click-${click.x}-${click.y}-${idx}`}
                                className="absolute rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                                style={{
                                  left: `${(click.x! / selectedRespondentScreen.screen.width) * 100}%`,
                                  top: `${(click.y! / selectedRespondentScreen.screen.height) * 100}%`,
                                  width: '24px',
                                  height: '24px',
                                  transform: 'translate(-50%, -50%)'
                                }}
                                title={`Клик ${click.clickOrder}`}
                              >
                                {showClickOrder && click.clickOrder}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>

              <div className="w-64 space-y-4">
                {(() => {
                  const sessionEvents = events.filter(e => 
                    e.session_id === selectedRespondentScreen.session.id &&
                    e.screen_id === selectedRespondentScreen.screen.id
                  );
                  const clicks = sessionEvents.filter(e => 
                    e.event_type === "click" || e.event_type === "hotspot_click"
                  );
                  const misses = clicks.filter(e => !e.hotspot_id).length;
                  
                  // Calculate time on screen
                  const screenLoad = sessionEvents.find(e => e.event_type === "screen_load");
                  const nextScreenLoad = events.find(e => 
                    e.session_id === selectedRespondentScreen.session.id &&
                    e.timestamp > (screenLoad?.timestamp || '') &&
                    e.event_type === "screen_load"
                  );
                  const timeOnScreen = screenLoad && nextScreenLoad
                    ? (new Date(nextScreenLoad.timestamp).getTime() - new Date(screenLoad.timestamp).getTime()) / 1000
                    : 0;

                  return (
                    <>
                      <div>
                        <div className="text-sm text-muted-foreground">Всего кликов</div>
                        <div className="text-lg font-semibold">{clicks.length}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Промахов</div>
                        <div className="text-lg font-semibold">{misses}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Время на экране</div>
                        <div className="text-lg font-semibold">{timeOnScreen.toFixed(2)} с</div>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <div className="text-sm font-medium mb-2">Настройки</div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="click-order"
                            checked={showClickOrder}
                            onCheckedChange={(checked) => setShowClickOrder(checked === true)}
                          />
                          <Label htmlFor="click-order" className="text-sm">
                            Порядок кликов
                          </Label>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
        );
      })()}

      {/* Modal for video recording */}
      {recordingModalUrl && createPortal(
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
          onClick={() => setRecordingModalUrl(null)}
        >
          <div
            className="bg-card rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Запись сессии</h3>
              <button
                onClick={() => setRecordingModalUrl(null)}
                className="p-2 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <video
              src={recordingModalUrl}
              controls
              className="w-full max-h-[70vh] bg-black rounded-lg"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
