import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { getBlockTypeConfig, type BlockType } from "../lib/block-icons";
import { cn } from "../lib/utils";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { 
  UserRoundCheck, 
  UserRoundX, 
  UserRoundMinus, 
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
  Trash2
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
  MiniMap, 
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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
  
  // UI State
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ReportViewMode>("summary");
  const [cardSortingView, setCardSortingView] = useState<CardSortingView>("matrix");
  const [treeTestingView, setTreeTestingView] = useState<TreeTestingView>("common_paths");
  const [heatmapView, setHeatmapView] = useState<HeatmapView>("heatmap");
  const [heatmapTab, setHeatmapTab] = useState<HeatmapTab>("by_screens");
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [searchCategoryQuery, setSearchCategoryQuery] = useState("");
  const [searchCardQuery, setSearchCardQuery] = useState("");
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);
  const [onlyFirstClicks, setOnlyFirstClicks] = useState(false);
  const [showClickOrder, setShowClickOrder] = useState(false);

  useEffect(() => {
    loadRuns();
  }, [studyId]);

  useEffect(() => {
    if (selectedRuns.size > 0) {
      loadSessionsAndEvents();
      loadResponses();
    } else {
      setSessions([]);
      setEvents([]);
      setResponses([]);
    }
  }, [selectedRuns, studyId]);

  // Auto-select first block or first session
  useEffect(() => {
    if (viewMode === "summary") {
      if (blocks.length > 0 && !selectedBlockId) {
        setSelectedBlockId(blocks[0].id);
      }
    } else if (viewMode === "responses") {
      if (sessions.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sessions[0].id);
      }
    }
  }, [blocks, selectedBlockId, sessions, selectedSessionId, viewMode]);

  const loadRuns = async () => {
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
  };

  const loadSessionsAndEvents = async () => {
    if (selectedRuns.size === 0) return;

    const runIds = Array.from(selectedRuns);

    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, run_id, block_id, study_id, prototype_id, started_at, completed, aborted")
        .in("run_id", runIds)
        .not("run_id", "is", null);

      if (sessionsError) {
        console.error("Error loading sessions:", sessionsError);
        return;
      }

      const { data: eventsData, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .in("run_id", runIds)
        .not("run_id", "is", null);

      if (eventsError) {
        console.error("Error loading events:", eventsError);
        return;
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
  };

  const loadResponses = async () => {
    if (selectedRuns.size === 0) return;

    const runIds = Array.from(selectedRuns);

    try {
      const { data: responsesData, error: responsesError } = await supabase
        .from("study_block_responses")
        .select("*")
        .in("run_id", runIds);

      if (responsesError) {
        console.error("StudyResultsTab: Error loading responses:", responsesError);
        return;
      }

      // Логирование для диагностики
      console.log("StudyResultsTab: Loaded responses:", {
        count: responsesData?.length || 0,
        runIds: runIds.length,
        sample: responsesData?.slice(0, 3).map(r => ({
          id: r.id,
          run_id: r.run_id,
          block_id: r.block_id,
          has_answer: !!r.answer,
          duration_ms: r.duration_ms
        })),
        blockIds: [...new Set(responsesData?.map(r => r.block_id).filter(Boolean) || [])],
        responsesWithoutBlockId: responsesData?.filter(r => !r.block_id).length || 0
      });

      setResponses(responsesData || []);
    } catch (err) {
      console.error("StudyResultsTab: Unexpected error loading responses:", err);
    }
  };

  const deleteBlockResponses = async (blockId: string) => {
    if (!confirm("Удалить все ответы для этого блока?")) return;
    
    try {
      const { error } = await supabase
        .from("study_block_responses")
        .delete()
        .eq("block_id", blockId);
      
      if (error) {
        console.error("Error deleting responses:", error);
        alert("Ошибка при удалении ответов: " + error.message);
        return;
      }
      
      // Обновить локальное состояние
      setResponses(prev => prev.filter(r => r.block_id !== blockId));
      
      // Перезагрузить для синхронизации
      await loadResponses();
    } catch (err) {
      console.error("Error deleting responses:", err);
      alert("Ошибка при удалении ответов");
    }
  };

  // Calculate total responses count
  const totalResponsesCount = responses.length;

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
      <div className="w-80 bg-[#F6F6F6] flex flex-col relative">
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
                  : "bg-white text-muted-foreground hover:bg-muted"
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
                  : "bg-white text-muted-foreground hover:bg-muted"
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
                      : "bg-white border border-border hover:border-primary/30"
                  )}
                >
                  <span className="text-sm font-medium">{index + 1}.</span>
                  <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
                    isSelected ? "bg-white/20" : "bg-[#EDEDED]"
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
            // Show sessions in responses mode
            sessions.map((session) => {
              const isSelected = selectedSessionId === session.id;
              
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
                    "w-full flex flex-col gap-1 p-2 rounded-xl transition-all text-left",
                    isSelected
                      ? "bg-primary text-white shadow-md"
                      : "bg-white border border-border hover:border-primary/30"
                  )}
                >
                  <div className={cn("text-xs font-medium", isSelected ? "text-white" : "text-foreground")}>
                    {date.toLocaleString("ru-RU")}
                  </div>
                  <div className={cn("flex items-center gap-2 text-xs", isSelected ? "text-white/80" : "text-muted-foreground")}>
                    <span>{os}</span>
                    <span>•</span>
                    <span>{browser}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#F6F6F6]">
        <div className="flex-1 overflow-y-auto bg-[#F6F6F6]">
          <div className="max-w-3xl mx-auto pt-6">
          {viewMode === "summary" && selectedBlock && (() => {
            const filteredResponses = responses.filter(r => r.block_id === selectedBlock.id);
            const filteredSessions = sessions.filter(s => s.block_id === selectedBlock.id);
            const filteredEvents = events.filter(e => e.block_id === selectedBlock.id);
            
            // Логирование для диагностики фильтрации
            console.log("StudyResultsTab: Filtering data for block:", {
              block_id: selectedBlock.id,
              block_type: selectedBlock.type,
              total_responses: responses.length,
              filtered_responses: filteredResponses.length,
              total_sessions: sessions.length,
              filtered_sessions: filteredSessions.length,
              total_events: events.length,
              filtered_events: filteredEvents.length,
              sample_response: filteredResponses[0] ? {
                id: filteredResponses[0].id,
                run_id: filteredResponses[0].run_id,
                block_id: filteredResponses[0].block_id
              } : null
            });
            
            return (
              <BlockReportView
                block={selectedBlock}
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
              onDeleteResponses={viewMode === "responses" ? deleteBlockResponses : undefined}
              />
            );
          })()}
          {viewMode === "responses" && selectedSessionId && (() => {
            const selectedSession = sessions.find(s => s.id === selectedSessionId);
            if (!selectedSession) return null;
            
            return (
              <AllBlocksReportView
                blocks={blocks}
                sessionId={selectedSession.id}
                runId={selectedSession.run_id}
                responses={responses.filter(r => r.run_id === selectedSession.run_id)}
                sessions={sessions.filter(s => s.run_id === selectedSession.run_id)}
                events={events.filter(e => e.run_id === selectedSession.run_id)}
                prototypes={prototypes}
                onDeleteResponses={deleteBlockResponses}
              />
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
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function BlockReportView({
  block,
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
  onDeleteResponses
}: BlockReportViewProps) {
  // Render based on block type
  switch (block.type) {
    case "open_question":
      return <OpenQuestionView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "scale":
      return <ScaleView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "choice":
      return <ChoiceView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "preference":
      return <PreferenceView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "matrix":
      return <MatrixView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "agreement":
      return <AgreementView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "card_sorting":
      return (
        <CardSortingViewComponent
          block={block}
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
          onlyFirstClicks={onlyFirstClicks}
          setOnlyFirstClicks={setOnlyFirstClicks}
          showClickOrder={showClickOrder}
          setShowClickOrder={setShowClickOrder}
          onDeleteResponses={onDeleteResponses}
        />
      );
    case "umux_lite":
      return <UmuxLiteView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "context":
      return <ContextView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "five_seconds":
      return <FiveSecondsView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    case "first_click":
      return <FirstClickView block={block} responses={responses} viewMode={viewMode} onDeleteResponses={onDeleteResponses} />;
    default:
      return (
        <div className="max-w-full">
          <Card className="p-6">
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

function OpenQuestionView({ block, responses, viewMode, onDeleteResponses }: OpenQuestionViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;

  return (
    <div className="max-w-full">
      <Card className="p-6">
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Вопрос</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
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
          </div>

          {/* Results Section - показываем в обоих режимах */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-4">Ответы ({responses.length})</h3>
            <div className="space-y-3">
              {responses.map((response, idx) => {
                const answerText = typeof response.answer === "string" 
                  ? response.answer 
                  : response.answer?.text || JSON.stringify(response.answer);
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
      </Card>
    </div>
  );
}

// Scale View
interface ScaleViewProps {
  block: StudyBlock;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ScaleView({ block, responses, viewMode, onDeleteResponses }: ScaleViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  const scaleType = block.config?.scaleType || "numeric";
  const minValue = block.config?.minValue || 1;
  const maxValue = block.config?.maxValue || 5;

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
      <Card className="p-6">
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Вопрос</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
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
                    <div className="w-full bg-muted rounded-full h-6 overflow-hidden">
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
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ChoiceView({ block, responses, viewMode, onDeleteResponses }: ChoiceViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  const options = block.config?.options || [];
  const allowMultiple = block.config?.allowMultiple || false;
  const allowOther = block.config?.allowOther || false;

  // Calculate statistics
  const optionCounts: Record<string, number> = {};
  const otherAnswers: string[] = [];

  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object") {
      if (answer.selected && Array.isArray(answer.selected)) {
        answer.selected.forEach((opt: string) => {
          optionCounts[opt] = (optionCounts[opt] || 0) + 1;
        });
      }
      if (answer.other) {
        otherAnswers.push(answer.other);
      }
    }
  });

  const totalResponses = responses.length;
  const maxCount = Math.max(...Object.values(optionCounts), 1);

  return (
    <div className="max-w-full">
      <Card className="p-6">
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Вопрос</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
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
                    <div className="w-full bg-muted rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              
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
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function PreferenceView({ block, responses, viewMode, onDeleteResponses }: PreferenceViewProps) {
  const question = block.config?.question || "Вопрос";
  const imageUrl = block.config?.image;
  // Используем images из конфига (как в PreferenceBlock)
  const images = block.config?.images || [];
  const options = block.config?.options || [];
  const optionImages = block.config?.optionImages || images; // Fallback на images если optionImages нет

  // Calculate statistics
  const optionCounts: Record<number, number> = {};

  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object") {
      if (answer.selectedIndex !== undefined) {
        const idx = answer.selectedIndex;
        optionCounts[idx] = (optionCounts[idx] || 0) + 1;
      } else if (answer.wins && typeof answer.wins === "object") {
        // For pairwise comparison, count wins
        Object.entries(answer.wins).forEach(([idx, wins]) => {
          optionCounts[parseInt(idx)] = (optionCounts[parseInt(idx)] || 0) + (wins as number);
        });
      }
    }
  });

  const totalResponses = responses.length;
  const maxCount = Math.max(...Object.values(optionCounts), 1);

  return (
    <div className="max-w-full">
      <Card className="p-6">
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Вопрос</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
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
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
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
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function MatrixView({ block, responses, viewMode, onDeleteResponses }: MatrixViewProps) {
  const question = block.config?.question || "Вопрос";
  const description = block.config?.description;
  const imageUrl = block.config?.imageUrl;
  const rows = block.config?.rows || [];
  const columns = block.config?.columns || [];

  // Подсчитываем количество выборов для каждой пары (rowId, columnId)
  const cellCounts: Record<string, Record<string, number>> = {};
  
  responses.forEach(r => {
    const answer = r.answer;
    if (typeof answer === "object" && answer.selections) {
      Object.entries(answer.selections).forEach(([rowId, columnIds]) => {
        if (Array.isArray(columnIds)) {
          if (!cellCounts[rowId]) {
            cellCounts[rowId] = {};
          }
          columnIds.forEach((columnId: string) => {
            cellCounts[rowId][columnId] = (cellCounts[rowId][columnId] || 0) + 1;
          });
        }
      });
    }
  });

  const totalResponses = responses.length;

  return (
    <div className="max-w-full">
      <Card className="p-6">
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Вопрос</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
            <p className="text-base mb-4">{question}</p>
            {description && (
              <p className="text-sm text-muted-foreground mb-4">{description}</p>
            )}
            {imageUrl && (
              <div className="mb-4">
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
                                    background: "rgba(147, 51, 234, 0.1)", 
                                    color: "#9333ea" 
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
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function AgreementView({ block, responses, viewMode, onDeleteResponses }: AgreementViewProps) {
  const title = block.config?.title || "Соглашение";
  const agreementType = block.config?.agreementType || "standard";
  const customPdfUrl = block.config?.customPdfUrl;

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
      <Card className="p-6">
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Соглашение</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
            <p className="text-base mb-4">{title}</p>
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
                    <div className="p-4 border border-border rounded-lg bg-green-50">
                      <div className="text-sm text-muted-foreground mb-1">Принято</div>
                      <div className="text-2xl font-semibold text-green-700">{acceptedCount}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {acceptanceRate.toFixed(1)}%
                      </div>
                    </div>
                    {notAcceptedCount > 0 && (
                      <div className="p-4 border border-border rounded-lg bg-red-50">
                        <div className="text-sm text-muted-foreground mb-1">Не принято</div>
                        <div className="text-2xl font-semibold text-red-700">{notAcceptedCount}</div>
                        <div className="text-xs text-muted-foreground mt-1">
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
                                    <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800 text-sm font-medium">
                                      Принято
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-800 text-sm font-medium">
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
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-green-500 h-full transition-all"
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
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden relative">
                          <div
                            className="bg-green-500 h-full transition-all flex items-center justify-start px-2"
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
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-full">
      <Card className="p-6">
        <div className="space-y-6">
          {/* Task Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Задание</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
            <p className="text-base">{task}</p>
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
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  treeTestingView: TreeTestingView;
  setTreeTestingView: (view: TreeTestingView) => void;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function TreeTestingView({
  block,
  responses,
  viewMode,
  treeTestingView,
  setTreeTestingView,
  onDeleteResponses
}: TreeTestingViewProps) {
  const question = block.config?.question || "Вопрос";
  const correctPath = block.config?.correctPath || [];

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
      <Card className="p-6">
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Вопрос</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
            <p className="text-base">{question}</p>
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
                <span className="cursor-help">ℹ️</span>
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

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTreeTestingView("common_paths")}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              treeTestingView === "common_paths"
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Самые частые пути
          </button>
          <button
            onClick={() => setTreeTestingView("first_clicks")}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              treeTestingView === "first_clicks"
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Первые клики
          </button>
          <button
            onClick={() => setTreeTestingView("final_points")}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              treeTestingView === "final_points"
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Финальные точки
          </button>
        </div>

        <div className="space-y-4">
            {treeTestingView === "common_paths" && (
            <>
              {sortedPaths.map((pathData, idx) => {
                const percentage = totalResponses > 0 ? (pathData.count / totalResponses) * 100 : 0;
                const pathText = pathData.path.join(" › ");
                return (
                  <div key={`path-${block.id}-${idx}-${pathText}`} className="space-y-2">
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={pathData.isCorrect ? "bg-green-500" : "bg-gray-600"}
                        style={{ 
                          width: `${Math.max(percentage, 0)}%`, 
                          minWidth: percentage > 0 ? '2px' : '0',
                          transition: "width 0.3s" 
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
            </>
          )}

          {treeTestingView === "first_clicks" && (
            <>
              {sortedFirstClicks.map((firstClickData, idx) => {
                const percentage = totalResponses > 0 ? (firstClickData.count / totalResponses) * 100 : 0;
                const pathText = firstClickData.path.join(" › ");
                return (
                  <div key={`first-click-${block.id}-${idx}-${pathText}`} className="space-y-2">
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={firstClickData.isCorrect ? "bg-green-500" : "bg-gray-600"}
                        style={{ 
                          width: `${Math.max(percentage, 0)}%`, 
                          minWidth: percentage > 0 ? '2px' : '0',
                          transition: "width 0.3s" 
                        }}
                      />
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          {firstClickData.isCorrect && (
                            <CircleCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                          )}
                          <span className="font-medium text-sm">{pathText}</span>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {percentage.toFixed(0)}% ({firstClickData.count})
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {treeTestingView === "final_points" && (
            <>
              {sortedFinalPoints.map((finalPointData, idx) => {
                const percentage = totalResponses > 0 ? (finalPointData.count / totalResponses) * 100 : 0;
                const pathText = finalPointData.isUnsuccessful 
                  ? "Неуспешно" 
                  : finalPointData.path.length > 0 
                    ? finalPointData.path.join(" › ")
                    : "Неизвестно";
                return (
                  <div key={`final-point-${block.id}-${idx}-${pathText}`} className="space-y-2">
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={finalPointData.isCorrect ? "bg-green-500" : "bg-gray-600"}
                        style={{ 
                          width: `${Math.max(percentage, 0)}%`, 
                          minWidth: percentage > 0 ? '2px' : '0',
                          transition: "width 0.3s" 
                        }}
                      />
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          {finalPointData.isCorrect && (
                            <CircleCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                          )}
                          <span className="font-medium text-sm">{pathText}</span>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {percentage.toFixed(0)}% ({finalPointData.count})
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
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

// UMUX Lite View
interface UmuxLiteViewProps {
  block: StudyBlock;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function UmuxLiteView({ block, responses, viewMode, onDeleteResponses }: UmuxLiteViewProps) {
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
      <Card className="p-6">
        <div className="space-y-6">
          {/* Question Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">UMUX Lite</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
            <p className="text-base text-muted-foreground mb-4">
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
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function ContextView({ block, responses, viewMode, onDeleteResponses }: ContextViewProps) {
  const title = block.config?.title || "Контекст";
  const description = block.config?.description;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        {description && (
          <p className="text-base text-muted-foreground">{description}</p>
        )}
        <div className="mt-4 text-sm text-muted-foreground">
          Блок контекста не собирает ответы. Он используется для отображения информации респондентам.
        </div>
      </Card>
    </div>
  );
}

// Five Seconds View
interface FiveSecondsViewProps {
  block: StudyBlock;
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function FiveSecondsView({ block, responses, viewMode, onDeleteResponses }: FiveSecondsViewProps) {
  const instruction = block.config?.instruction || "Инструкция";
  const imageUrl = block.config?.imageUrl;
  const duration = block.config?.duration || 5;

  const totalResponses = responses.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Тест на {duration} секунд</h2>
          {viewMode === "responses" && onDeleteResponses && (
            <button
              onClick={() => onDeleteResponses(block.id)}
              className="p-2 hover:bg-muted rounded transition-colors"
              title="Удалить все ответы"
            >
              <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
            </button>
          )}
        </div>
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
      </Card>

      {viewMode === "responses" && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Ответы ({totalResponses})</h3>
          <div className="space-y-4">
            {responses.map((response, idx) => {
              const answerText = typeof response.answer === "string" 
                ? response.answer 
                : response.answer?.text || response.answer?.answer || JSON.stringify(response.answer);
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
  responses: StudyBlockResponse[];
  viewMode: ReportViewMode;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function FirstClickView({ block, responses, viewMode, onDeleteResponses }: FirstClickViewProps) {
  const [clickMapOpen, setClickMapOpen] = useState(false);
  const [clickMapTab, setClickMapTab] = useState<"heatmap" | "clicks" | "image">("image");

  const instruction = block.config?.instruction || "Задание";
  const imageUrl = block.config?.imageUrl;
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
      <Card className="p-6">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold">Тест первого клика</h2>
              {viewMode === "responses" && onDeleteResponses && (
                <button
                  onClick={() => onDeleteResponses(block.id)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  title="Удалить все ответы"
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
            <p className="text-base mb-4">{instruction}</p>
          </div>
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
                        key={i}
                        className="absolute w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow"
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
  onlyFirstClicks: boolean;
  setOnlyFirstClicks: (only: boolean) => void;
  showClickOrder: boolean;
  setShowClickOrder: (show: boolean) => void;
  onDeleteResponses?: (blockId: string) => Promise<void>;
}

function PrototypeView({
  block,
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
  onlyFirstClicks,
  setOnlyFirstClicks,
  showClickOrder,
  setShowClickOrder,
  onDeleteResponses
}: PrototypeViewProps) {
  const protoId = block.prototype_id;
  const proto = protoId ? prototypes[protoId] : null;
  const taskDescription = block.config?.task || block.instructions || "Задание";
  
  // Состояние для попапа с информацией о ноде
  const [selectedNode, setSelectedNode] = useState<{ screen: Screen; stepNumber: number; visitorsCount: number; totalSessions: number; position: { x: number; y: number } } | null>(null);

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

  // Кастомный узел для отображения изображений экранов
  const ScreenNode = ({ data }: { data: any }) => {
    const isStart = startScreens.has(data.screenId);
    const isEnd = endScreens.has(data.screenId);
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
          color: '#666',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {isStart && <Play className="h-3 w-3 flex-shrink-0" />}
          {isEnd && !isStart && <Flag className="h-3 w-3 flex-shrink-0" />}
          <span>{displayLabel}</span>
        </div>
        
        {/* Нода с изображением */}
        <div style={{ 
          width: '200px', 
          height: '150px',
          border: '2px solid #e0e0e0',
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
          background: '#f5f5f5'
        }}>
          {/* Handle для входящих соединений */}
          <Handle type="target" position={Position.Top} />
          
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
              background: '#f5f5f5',
              color: '#666',
              fontSize: '12px',
              textAlign: 'center',
              padding: '8px'
            }}>
              {data.label}
            </div>
          )}
          
          {/* Handle для исходящих соединений */}
          <Handle type="source" position={Position.Bottom} />
        </div>
      </div>
    );
  };

  // Мемоизируем nodeTypes чтобы избежать пересоздания при каждом рендере
  const nodeTypes = useMemo(() => ({
    screen: ScreenNode
  }), []);

  // Calculate flow data for xyflow
  const getFlowData = () => {
    if (!proto) return { nodes: [], edges: [] };

    // Подсчитываем частоту переходов из событий screen_load
    const transitionCounts: Record<string, number> = {};
    sessions.forEach(session => {
      const sessionEvents = events
        .filter(e => e.session_id === session.id && e.event_type === "screen_load")
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      for (let i = 0; i < sessionEvents.length - 1; i++) {
        const from = sessionEvents[i].screen_id;
        const to = sessionEvents[i + 1].screen_id;
        if (from && to) {
          const key = `${from}->${to}`;
          transitionCounts[key] = (transitionCounts[key] || 0) + 1;
        }
      }
    });

    const maxTransitionCount = Math.max(...Object.values(transitionCounts), 1);

    // Создаем ноды с изображениями
    const nodes = screens.map((screen, idx) => ({
      id: screen.id,
      type: 'screen',
      position: { x: idx * 250, y: 40 }, // Смещаем вниз, чтобы было место для названия
      data: { 
        label: screen.name,
        image: screen.image, // Добавляем изображение экрана
        screenId: screen.id // Добавляем screenId для определения стартового/финального
      }
    }));

    // Получаем множество ID существующих нод для проверки (ПЕРЕД созданием edges)
    const nodeIds = new Set(nodes.map(n => n.id));

    // Создаем edges с толщиной в зависимости от частоты переходов
    const edgeMap = new Map<string, any>();
    let edgeCounter = 0;
    
    // Сначала добавляем все возможные edges из proto.edges
    (proto.edges || []).forEach(edge => {
      // Проверяем, что source и target существуют в nodes
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        return; // Пропускаем edge, если ноды не существуют
      }
      
      const key = `${edge.from}->${edge.to}`;
      const count = transitionCounts[key] || 0;
      const thickness = count > 0 ? Math.max(2, (count / maxTransitionCount) * 8) : 1;
      const edgeId = edge.id || `edge-${edgeCounter++}`;
      
      // Убеждаемся, что id уникален
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          id: edgeId,
          source: edge.from,
          target: edge.to,
          type: 'smoothstep',
          animated: count > 0,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            strokeWidth: thickness,
            stroke: count > 0 ? '#007AFF' : '#ccc'
          },
          label: count > 0 ? `${count}` : undefined
        });
      }
    });

    // Добавляем edges из реальных переходов, которых может не быть в proto.edges
    Object.entries(transitionCounts).forEach(([key, count]) => {
      if (!edgeMap.has(key)) {
        const [from, to] = key.split('->');
        
        // Проверяем, что source и target существуют в nodes
        if (!nodeIds.has(from) || !nodeIds.has(to)) {
          return; // Пропускаем edge, если ноды не существуют
        }
        
        const thickness = Math.max(2, (count / maxTransitionCount) * 8);
        edgeMap.set(key, {
          id: `edge-${edgeCounter++}`,
          source: from,
          target: to,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            strokeWidth: thickness,
            stroke: '#007AFF'
          },
          label: `${count}`
        });
      }
    });

    const edges = Array.from(edgeMap.values());

    return { nodes, edges };
  };

  const { nodes, edges } = getFlowData();
  
  // Обработчик клика на ноду
  const handleNodeClick = (event: React.MouseEvent, node: any) => {
    const screen = screens.find(s => s.id === node.id);
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

  // Calculate heatmap data
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
      const nextEvent = screenEvents.find(e => 
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
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold">#{block.order_index + 1}</div>
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Задание: {taskDescription}</h2>
                {viewMode === "responses" && onDeleteResponses && (
                  <button
                    onClick={() => onDeleteResponses(block.id)}
                    className="p-2 hover:bg-muted rounded transition-colors"
                    title="Удалить все ответы"
                  >
                    <Trash2 className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {sessions.length} ответов
          </div>
        </div>

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
              <div className="text-sm text-muted-foreground">Сдались</div>
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
              onNodeClick={handleNodeClick}
              onPaneClick={() => setSelectedNode(null)}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          
          {/* Попап с информацией о ноде - рядом с нодой */}
          {selectedNode && (
            <div 
              className="fixed z-50 bg-white border border-border rounded-lg shadow-lg p-4"
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
      <Card className="p-6">
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
              >
                <img
                  src={screen.image}
                  alt={screen.name}
                  className="w-full h-auto rounded border border-border"
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
                  <th className="text-left p-3 font-medium text-sm">Путь</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const sessionEvents = events
                    .filter(e => e.session_id === session.id && e.event_type === "screen_load")
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                  
                  const screenIds = sessionEvents.map(e => e.screen_id).filter(Boolean);
                  
                  // Вычисляем время прохождения
                  let sessionTime = 0;
                  if (sessionEvents.length > 0) {
                    const startTime = new Date(sessionEvents[0].timestamp).getTime();
                    const endTime = session.completed || session.aborted
                      ? new Date(sessionEvents[sessionEvents.length - 1].timestamp).getTime()
                      : Date.now();
                    sessionTime = (endTime - startTime) / 1000;
                  }
                  
                  const status = session.completed ? "Успешно" : session.aborted ? "Сдались" : "В процессе";
                  const date = new Date(session.started_at);
                  const formattedDate = formatResponseDate(date);
                  
                  return (
                    <tr key={session.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 text-sm">{formattedDate}</td>
                      <td className="p-3 text-sm">{status}</td>
                      <td className="p-3 text-sm">{sessionTime.toFixed(1)} с</td>
                      <td className="p-3">
                        <div className="flex gap-2 flex-wrap">
                          {screenIds.map((screenId, screenIdx) => {
                            const screen = screenMap.get(screenId);
                            if (!screen) return null;
                            return (
                              <button
                                key={screenIdx}
                                onClick={() => {
                                  setSelectedNode({
                                    screen,
                                    stepNumber: screenIdx + 1,
                                    visitorsCount: 1,
                                    totalSessions: sessions.length
                                  });
                                }}
                                className="relative"
                              >
                                <img
                                  src={screen.image}
                                  alt={screen.name}
                                  className="w-16 h-12 object-cover rounded border border-border hover:border-primary transition-colors cursor-pointer"
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
              <div className="mb-4 p-4 bg-muted/30 border border-border rounded-lg">
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
                    
                    // Вычисляем время прохождения
                    let sessionTime = 0;
                    if (sessionEvents.length > 0) {
                      const startTime = new Date(sessionEvents[0].timestamp).getTime();
                      const endTime = session.completed || session.aborted
                        ? new Date(sessionEvents[sessionEvents.length - 1].timestamp).getTime()
                        : Date.now();
                      sessionTime = (endTime - startTime) / 1000;
                    }
                    
                    const status = session.completed ? "Успешно" : session.aborted ? "Сдались" : "В процессе";
                    const date = new Date(session.started_at);
                    const formattedDate = formatResponseDate(date);
                    
                    return (
                      <tr key={session.id} className="border-b border-border hover:bg-muted/30">
                        <td className="p-3 text-sm">{formattedDate}</td>
                        <td className="p-3 text-sm">{status}</td>
                        <td className="p-3 text-sm">{sessionTime.toFixed(1)} с</td>
                        <td className="p-3">
                          <div className="flex gap-2 flex-wrap">
                            {screenIds.map((screenId, screenIdx) => {
                              const screen = screenMap.get(screenId);
                              if (!screen) return null;
                              return (
                                <button
                                  key={screenIdx}
                                  onClick={() => {
                                    setSelectedNode({
                                      screen,
                                      stepNumber: screenIdx + 1,
                                      visitorsCount: 1,
                                      totalSessions: sessions.length
                                    });
                                  }}
                                  className="relative"
                                >
                                  <img
                                    src={screen.image}
                                    alt={screen.name}
                                    className="w-16 h-12 object-cover rounded border border-border hover:border-primary transition-colors cursor-pointer"
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
      {selectedHeatmapScreen && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedHeatmapScreen(null)}
        >
          <div
            className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto p-6"
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
                  {(heatmapView === "heatmap" || heatmapView === "clicks") && (
                    <div className="absolute inset-0 pointer-events-none">
                      {getHeatmapData(selectedHeatmapScreen.screen.id).map((click, idx) => {
                        const maxCount = Math.max(...getHeatmapData(selectedHeatmapScreen.screen.id).map(c => c.count), 1);
                        const opacity = Math.min(0.8, 0.3 + (click.count / maxCount) * 0.5);
                        const size = Math.max(8, Math.min(32, 8 + (click.count / maxCount) * 24));
                        return (
                          <div
                            key={idx}
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
                        <div className="text-lg font-semibold">{stats.avgTime.toFixed(1)} с</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Медианное время</div>
                        <div className="text-lg font-semibold">{stats.medianTime.toFixed(1)} с</div>
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
        </div>
      )}

      {/* Modal for respondent screen */}
      {selectedRespondentScreen && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedRespondentScreen(null)}
        >
          <div
            className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">
                {selectedRespondentScreen.screen.name} ({selectedRespondentScreen.screenIndex} из {selectedRespondentScreen.totalScreens})
              </h3>
              <button
                onClick={() => setSelectedRespondentScreen(null)}
                className="p-2 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <div className="relative border border-border rounded-lg overflow-hidden bg-black">
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
                            key={idx}
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
                        <div className="text-lg font-semibold">{timeOnScreen.toFixed(1)} с</div>
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
        </div>
      )}
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
  // Фильтруем блоки, у которых есть ответы
  // Для блока "Прототип" проверяем наличие sessions, для остальных - responses
  const blocksWithResponses = blocks.filter(block => {
    if (block.type === "prototype") {
      // Для прототипа проверяем наличие sessions с block_id
      return sessions.some(s => s.block_id === block.id);
    } else {
      // Для остальных блоков проверяем наличие responses с block_id
      return responses.some(r => r.block_id === block.id);
    }
  });
  
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
                <div className="p-6">
                  <BlockReportView
                    block={block}
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
                    selectedRespondentScreen={null}
                    setSelectedRespondentScreen={() => {}}
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
                    onDeleteResponses={onDeleteResponses}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
