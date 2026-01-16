import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

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

type BlockType = "prototype" | "open_question" | "umux_lite" | "choice" | "context" | "scale" | "preference" | "five_seconds" | "card_sorting" | "tree_testing";

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

const getBlockTypeColor = (type: BlockType): string => {
  const colors: Record<BlockType, string> = {
    prototype: "#2196f3",
    open_question: "#9c27b0",
    umux_lite: "#ff5722",
    choice: "#4caf50",
    context: "#607d8b",
    scale: "#ff9800",
    preference: "#e91e63",
    five_seconds: "#795548",
    card_sorting: "#00bcd4",
    tree_testing: "#8bc34a"
  };
  return colors[type] || "#666";
};

const getBlockTypeLabel = (type: BlockType): string => {
  const labels: Record<BlockType, string> = {
    prototype: "Прототип",
    open_question: "Открытый вопрос",
    umux_lite: "UMUX Lite",
    choice: "Выбор",
    context: "Контекст",
    scale: "Шкала",
    preference: "Предпочтение",
    five_seconds: "5 секунд",
    card_sorting: "Сортировка карточек",
    tree_testing: "Тестирование дерева"
  };
  return labels[type] || type;
};

export default function StudyResultsTab({ studyId, blocks }: StudyResultsTabProps) {
  const [runs, setRuns] = useState<StudyRun[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [responses, setResponses] = useState<StudyBlockResponse[]>([]);
  const [prototypes, setPrototypes] = useState<Record<string, Proto>>({});
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [heatmapFilterSessions, setHeatmapFilterSessions] = useState<Record<string, Set<string>>>({});
  const [selectedHeatmapScreen, setSelectedHeatmapScreen] = useState<{ screen: Screen; proto: Proto; clicks: Array<{ x: number; y: number; count: number }>; blockId: string } | null>(null);

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
      // Load sessions with run_id (включая prototype_id)
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, run_id, block_id, study_id, prototype_id, started_at, completed, aborted")
        .in("run_id", runIds)
        .not("run_id", "is", null);

      if (sessionsError) {
        console.error("Error loading sessions:", sessionsError);
        return;
      }

      // Load events with run_id
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
        
        // Сортируем события по времени для определения финального статуса
        const sortedEvents = [...sessionEvents].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        // Проверяем события на наличие completed/aborted/closed
        const hasCompletedEvent = sortedEvents.some(e => e.event_type === "completed");
        const hasAbortedEvent = sortedEvents.some(e => e.event_type === "aborted");
        const hasClosedEvent = sortedEvents.some(e => e.event_type === "closed");
        
        // Определяем статус: приоритет у событий, затем БД
        // Если есть событие completed - пройден
        // Если есть aborted или closed (и нет completed после них) - сдался
        let isCompleted = false;
        let isAborted = false;
        
        if (hasCompletedEvent) {
          // Проверяем, было ли completed последним из терминальных событий
          const completedIdx = sortedEvents.findIndex(e => e.event_type === "completed");
          const abortedIdx = sortedEvents.findIndex(e => e.event_type === "aborted");
          const closedIdx = sortedEvents.findIndex(e => e.event_type === "closed");
          
          const completedTime = completedIdx >= 0 ? new Date(sortedEvents[completedIdx].timestamp).getTime() : 0;
          const abortedTime = abortedIdx >= 0 ? new Date(sortedEvents[abortedIdx].timestamp).getTime() : 0;
          const closedTime = closedIdx >= 0 ? new Date(sortedEvents[closedIdx].timestamp).getTime() : 0;
          
          // Completed считается если оно последнее из терминальных событий
          isCompleted = completedTime >= abortedTime && completedTime >= closedTime;
          isAborted = !isCompleted && (hasAbortedEvent || hasClosedEvent);
        } else if (hasAbortedEvent || hasClosedEvent) {
          isAborted = true;
        } else {
          // Если нет событий - используем данные из БД
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

      setSessions(sessionsWithMetrics);
      setEvents(eventsData || []);

      // Load prototypes for prototype blocks and sessions
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
        console.error("Error loading responses:", responsesError);
        return;
      }

      setResponses(responsesData || []);
    } catch (err) {
      console.error("Unexpected error loading responses:", err);
    }
  };

  const calculateAggregates = () => {
    const totalRuns = runs.length;
    const finishedRuns = runs.filter(r => r.status === "finished").length;
    const completionRate = totalRuns > 0 ? ((finishedRuns / totalRuns) * 100).toFixed(1) : "0";
    
    const finishedRunsWithDuration = runs.filter(r => r.status === "finished" && r.finished_at && r.started_at);
    const avgDuration = finishedRunsWithDuration.length > 0
      ? finishedRunsWithDuration.reduce((sum, r) => {
          const duration = new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime();
          return sum + duration;
        }, 0) / finishedRunsWithDuration.length / 1000 / 60 // Convert to minutes
      : 0;

    return {
      total: totalRuns,
      finished: finishedRuns,
      completionRate,
      avgDurationMinutes: avgDuration.toFixed(1)
    };
  };

  // Вспомогательные функции для работы с прототипами
  const getScreenName = (prototypeId: string | null, screenId: string | null): string => {
    if (!screenId) return "-";
    if (!prototypeId) return screenId;
    const proto = prototypes[prototypeId];
    if (!proto) return screenId;
    const screen = proto.screens?.find((s: any) => s.id === screenId);
    return screen ? screen.name : screenId;
  };

  const getHotspotName = (prototypeId: string | null, hotspotId: string | null, screenId: string | null): string => {
    if (!hotspotId) {
      if (screenId) {
        return getScreenName(prototypeId, screenId);
      }
      return "-";
    }
    if (!prototypeId) return hotspotId;
    const proto = prototypes[prototypeId];
    if (!proto) return hotspotId;
    const hotspot = proto.hotspots?.find((h: any) => 
      h.id === hotspotId && 
      (screenId ? h.frame === screenId : true)
    );
    return hotspot?.name || hotspotId;
  };

  const translateEventType = (eventType: string): string => {
    const translations: Record<string, string> = {
      "screen_load": "Загрузка экрана",
      "hotspot_click": "Клик по области",
      "click": "Клик в пустую область",
      "scroll": "Скролл",
      "scroll_start": "Начало скролла",
      "scroll_end": "Конец скролла",
      "completed": "Пройден",
      "aborted": "Сдался",
      "closed": "Закрыл тест",
      "overlay_open": "Открыт оверлей",
      "overlay_close": "Закрыт оверлей",
      "overlay_swap": "Переключил оверлей"
    };
    return translations[eventType] || eventType;
  };

  const groupClicksByScreen = (events: any[], prototypeId: string | null): Array<{
    timestamp: string;
    event_type: string;
    screen_id: string | null;
    clicks: string;
    isClickGroup: boolean;
    scroll_type?: string;
  }> => {
    const result: Array<{
      timestamp: string;
      event_type: string;
      screen_id: string | null;
      clicks: string;
      isClickGroup: boolean;
      scroll_type?: string;
    }> = [];

    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let currentScreenId: string | null = null;
    let currentScreenClicks: any[] = [];

    sortedEvents.forEach((event) => {
      if (event.event_type === "screen_load") {
        if (currentScreenClicks.length > 0 && currentScreenId) {
          const clicksList = currentScreenClicks.map(click => {
            if (click.hotspot_id) {
              return getHotspotName(prototypeId, click.hotspot_id, click.screen_id);
            } else {
              return getScreenName(prototypeId, click.screen_id);
            }
          });
          result.push({
            timestamp: currentScreenClicks[0].timestamp,
            event_type: "clicks",
            screen_id: currentScreenId,
            clicks: clicksList.join(", "),
            isClickGroup: true,
            scroll_type: undefined
          });
          currentScreenClicks = [];
        }
        currentScreenId = event.screen_id;
        result.push({
          timestamp: event.timestamp,
          event_type: event.event_type,
          screen_id: event.screen_id,
          clicks: "-",
          isClickGroup: false,
          scroll_type: undefined
        });
      } else if (event.event_type === "hotspot_click" || event.event_type === "click") {
        if (event.screen_id === currentScreenId) {
          currentScreenClicks.push(event);
        } else {
          if (currentScreenClicks.length > 0 && currentScreenId) {
            const clicksList = currentScreenClicks.map(click => {
              if (click.hotspot_id) {
                return getHotspotName(prototypeId, click.hotspot_id, click.screen_id);
              } else {
                return getScreenName(prototypeId, click.screen_id);
              }
            });
            result.push({
              timestamp: currentScreenClicks[0].timestamp,
              event_type: "clicks",
              screen_id: currentScreenId,
              clicks: clicksList.join(", "),
              isClickGroup: true
            });
            currentScreenClicks = [];
          }
          currentScreenId = event.screen_id;
          currentScreenClicks = [event];
        }
      } else if (event.event_type === "scroll") {
        if (currentScreenClicks.length > 0 && currentScreenId) {
          const clicksList = currentScreenClicks.map(click => {
            if (click.hotspot_id) {
              return getHotspotName(prototypeId, click.hotspot_id, click.screen_id);
            } else {
              return getScreenName(prototypeId, click.screen_id);
            }
          });
          result.push({
            timestamp: currentScreenClicks[0].timestamp,
            event_type: "clicks",
            screen_id: currentScreenId,
            clicks: clicksList.join(", "),
            isClickGroup: true,
            scroll_type: undefined
          });
          currentScreenClicks = [];
        }
        result.push({
          timestamp: event.timestamp,
          event_type: event.event_type,
          screen_id: event.screen_id,
          clicks: "-",
          isClickGroup: false,
          scroll_type: event.scroll_type
        });
      } else {
        if (currentScreenClicks.length > 0 && currentScreenId) {
          const clicksList = currentScreenClicks.map(click => {
            if (click.hotspot_id) {
              return getHotspotName(prototypeId, click.hotspot_id, click.screen_id);
            } else {
              return getScreenName(prototypeId, click.screen_id);
            }
          });
          result.push({
            timestamp: currentScreenClicks[0].timestamp,
            event_type: "clicks",
            screen_id: currentScreenId,
            clicks: clicksList.join(", "),
            isClickGroup: true,
            scroll_type: undefined
          });
          currentScreenClicks = [];
        }
        result.push({
          timestamp: event.timestamp,
          event_type: event.event_type,
          screen_id: event.screen_id,
          clicks: getHotspotName(prototypeId, event.hotspot_id, event.screen_id),
          isClickGroup: false,
          scroll_type: undefined
        });
      }
    });

    if (currentScreenClicks.length > 0 && currentScreenId) {
      const clicksList = currentScreenClicks.map(click => {
        if (click.hotspot_id) {
          return getHotspotName(prototypeId, click.hotspot_id, click.screen_id);
        } else {
          return getScreenName(prototypeId, click.screen_id);
        }
      });
      result.push({
        timestamp: currentScreenClicks[0].timestamp,
        event_type: "clicks",
        screen_id: currentScreenId,
        clicks: clicksList.join(", "),
        isClickGroup: true
      });
    }

    return result;
  };

  const calculatePrototypeBlockMetrics = (blockId: string) => {
    const blockSessions = sessions.filter(s => s.block_id === blockId);
    const blockEvents = events.filter(e => e.block_id === blockId);
    
    const completed = blockSessions.filter(s => s.completed).length;
    const aborted = blockSessions.filter(s => s.aborted).length;
    const totalEvents = blockEvents.length;
    
    // Group events by type
    const eventsByType: Record<string, number> = {};
    blockEvents.forEach(e => {
      eventsByType[e.event_type] = (eventsByType[e.event_type] || 0) + 1;
    });

    // Calculate heatmap data (clicks) - агрегированные по всем сессиям
    const clicks: Array<{ x: number; y: number; count: number; screenId?: string }> = [];
    const clickMap: Record<string, { x: number; y: number; count: number; screenId?: string }> = {};
    
    blockEvents.forEach(e => {
      if ((e.event_type === "hotspot_click" || e.event_type === "click") && e.x !== undefined && e.y !== undefined) {
        const screenId = e.screen_id || "";
        const key = `${screenId}_${Math.floor(e.x / 10) * 10}_${Math.floor(e.y / 10) * 10}`; // Группируем по 10px
        if (!clickMap[key]) {
          clickMap[key] = { x: e.x, y: e.y, count: 0, screenId };
        }
        clickMap[key].count += 1;
      }
    });
    
    clicks.push(...Object.values(clickMap));

    // Данные по сессиям с событиями
    const sessionsData = blockSessions.map(session => {
      const sessionEvents = blockEvents.filter(e => e.session_id === session.id);
      const sessionClicks: Array<{ x: number; y: number; screenId?: string }> = [];
      sessionEvents.forEach(e => {
        if ((e.event_type === "hotspot_click" || e.event_type === "click") && e.x !== undefined && e.y !== undefined) {
          sessionClicks.push({ x: e.x, y: e.y, screenId: e.screen_id || undefined });
        }
      });

      // Определяем статус: completed имеет приоритет над aborted
      let status: "completed" | "aborted" | "in_progress" = "in_progress";
      if (session.completed) {
        status = "completed";
      } else if (session.aborted) {
        status = "aborted";
      }
      
      return {
        session: {
          ...session,
          prototype_id: session.prototype_id || null
        },
        events: sessionEvents,
        clicks: sessionClicks,
        status
      };
    });

    return {
      sessionsCount: blockSessions.length,
      completed,
      aborted,
      totalEvents,
      eventsByType,
      clicks,
      sessionsData
    };
  };

  // Функция для расчета хитмапа по экранам
  const calculateHeatmapData = (blockId: string, sessionIdFilters?: Set<string>): Record<string, Array<{ x: number; y: number; count: number }>> => {
    const heatmapMap: Record<string, Record<string, { x: number; y: number; count: number }>> = {};
    
    let blockSessions = sessions.filter(s => s.block_id === blockId);
    if (sessionIdFilters && sessionIdFilters.size > 0) {
      blockSessions = blockSessions.filter(s => sessionIdFilters.has(s.id));
    }
    
    const blockSessionIds = new Set(blockSessions.map(s => s.id));
    const blockEvents = events.filter(e => e.block_id === blockId && blockSessionIds.has(e.session_id));
    
    blockEvents.forEach(event => {
      if ((event.event_type === "hotspot_click" || event.event_type === "click") && event.screen_id && event.x !== undefined && event.y !== undefined) {
        const screenId = event.screen_id;
        const x = event.x;
        const y = event.y;
        
        if (!heatmapMap[screenId]) {
          heatmapMap[screenId] = {};
        }
        
        const key = `${x},${y}`;
        if (!heatmapMap[screenId][key]) {
          heatmapMap[screenId][key] = { x, y, count: 0 };
        }
        heatmapMap[screenId][key].count += 1;
      }
    });
    
    const result: Record<string, Array<{ x: number; y: number; count: number }>> = {};
    Object.keys(heatmapMap).forEach(screenId => {
      result[screenId] = Object.values(heatmapMap[screenId]);
    });
    
    return result;
  };

  // Функция для расчета времени на экранах
  const calculateScreenTimes = (blockId: string): Array<{ screenId: string; screenName: string; totalTime: number; visitCount: number }> => {
    const screenTimesMap: Record<string, { totalTime: number; visitCount: number; prototypeId?: string }> = {};
    
    const blockSessions = sessions.filter(s => s.block_id === blockId);
    const blockSessionIds = new Set(blockSessions.map(s => s.id));
    const blockEvents = events.filter(e => e.block_id === blockId && blockSessionIds.has(e.session_id));
    
    // Группируем события по сессиям
    const eventsBySession: Record<string, any[]> = {};
    blockEvents.forEach(e => {
      if (!eventsBySession[e.session_id]) {
        eventsBySession[e.session_id] = [];
      }
      eventsBySession[e.session_id].push(e);
    });
    
    blockSessions.forEach(session => {
      const sessionEvts = eventsBySession[session.id] || [];
      const prototypeId = session.prototype_id;
      
      const screenLoads = sessionEvts
        .filter(e => e.event_type === "screen_load" && e.screen_id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      screenLoads.forEach((loadEvent, index) => {
        const screenId = loadEvent.screen_id;
        const loadTime = new Date(loadEvent.timestamp).getTime();
        
        let endTime: number;
        if (index < screenLoads.length - 1) {
          endTime = new Date(screenLoads[index + 1].timestamp).getTime();
        } else {
          const lastEvent = sessionEvts[sessionEvts.length - 1];
          endTime = lastEvent ? new Date(lastEvent.timestamp).getTime() : loadTime;
        }
        
        const timeSpent = Math.max(0, endTime - loadTime);
        
        if (!screenTimesMap[screenId]) {
          screenTimesMap[screenId] = { totalTime: 0, visitCount: 0, prototypeId: prototypeId || undefined };
        }
        
        screenTimesMap[screenId].totalTime += timeSpent;
        screenTimesMap[screenId].visitCount += 1;
      });
    });
    
    return Object.entries(screenTimesMap).map(([screenId, data]) => {
      let screenName = screenId;
      if (data.prototypeId && prototypes[data.prototypeId]) {
        const screen = prototypes[data.prototypeId].screens?.find(s => s.id === screenId);
        if (screen) screenName = screen.name;
      }
      
      return {
        screenId,
        screenName,
        totalTime: data.totalTime,
        visitCount: data.visitCount
      };
    }).sort((a, b) => b.totalTime - a.totalTime);
  };

  // Функция форматирования времени
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}м ${remainingSeconds}с`;
    }
    return `${seconds}с`;
  };

  const formatAnswer = (answer: any, blockType?: BlockType): string => {
    if (answer === null || answer === undefined) {
      return "";
    }
    
    // Если это строка, возвращаем как есть
    if (typeof answer === "string") {
      return answer;
    }
    
    // Если это объект, форматируем в зависимости от типа блока
    if (typeof answer === "object") {
      // Открытый вопрос
      if (answer.text !== undefined) {
        return String(answer.text);
      }
      
      // UMUX Lite
      if (answer.umux_lite_score !== undefined) {
        return `UMUX Lite: ${answer.umux_lite_score}% | SUS: ${answer.sus_score?.toFixed(1) || "—"} | ${answer.item1}-${answer.item2}${answer.feedback ? ` | "${answer.feedback}"` : ""}`;
      }
      
      // Выбор (choice)
      if (blockType === "choice" || answer.selected !== undefined) {
        const parts: string[] = [];
        if (answer.selected && answer.selected.length > 0) {
          parts.push(answer.selected.join(", "));
        }
        if (answer.other) {
          parts.push(`Другое: "${answer.other}"`);
        }
        if (answer.none) {
          parts.push("Ничего из вышеперечисленного");
        }
        return parts.join(" | ") || "(пусто)";
      }
      
      // Шкала (scale)
      if (blockType === "scale" || answer.scaleType !== undefined) {
        const scaleTypes: Record<string, string> = { numeric: "Числовая", emoji: "Эмодзи", stars: "Звезды" };
        return `${answer.value !== null ? answer.value : "(не выбрано)"} (${scaleTypes[answer.scaleType] || ""})`;
      }
      
      // Предпочтение (preference)
      if (blockType === "preference" || answer.type === "all" || answer.type === "pairwise") {
        if (answer.type === "all") {
          return `Выбран вариант ${String.fromCharCode(65 + (answer.selectedIndex || 0))}`;
        } else if (answer.type === "pairwise" && answer.wins) {
          const winEntries = Object.entries(answer.wins as Record<string, number>);
          winEntries.sort((a, b) => (b[1] as number) - (a[1] as number));
          return `Победы: ${winEntries.map(([idx, count]) => `${String.fromCharCode(65 + parseInt(idx))}:${count}`).join(", ")}`;
        }
      }
      
      // Тестирование дерева (tree_testing)
      if (blockType === "tree_testing" || answer.selectedPath !== undefined) {
        const pathNames = answer.pathNames || [];
        const isCorrect = answer.isCorrect;
        const pathStr = pathNames.length > 0 ? pathNames.join(" › ") : "(не выбрано)";
        if (isCorrect !== undefined) {
          return `${pathStr} ${isCorrect ? "✅" : "❌"}`;
        }
        return pathStr;
      }
      
      // Карточная сортировка (card_sorting)
      if (blockType === "card_sorting" || answer.categories !== undefined) {
        const categories = answer.categories || {};
        const catEntries = Object.entries(categories);
        if (catEntries.length === 0) return "(не отсортировано)";
        return catEntries.map(([catName, cards]) => {
          const cardList = Array.isArray(cards) ? cards : [];
          return `${catName}: ${cardList.length} карт.`;
        }).join(" | ");
      }
      
      // Если это массив, показываем элементы через запятую
      if (Array.isArray(answer)) {
        return answer.map(item => String(item)).join(", ");
      }
      
      // Для других объектов показываем значения через двоеточие
      const entries = Object.entries(answer);
      if (entries.length > 0) {
        return entries.map(([key, value]) => {
          if (value === null || value === undefined) {
            return `${key}: (пусто)`;
          }
          return `${key}: ${String(value)}`;
        }).join("; ");
      }
    }
    
    // Fallback: преобразуем в строку
    return String(answer);
  };

  const calculateQuestionBlockMetrics = (blockId: string) => {
    const blockResponses = responses.filter(r => r.block_id === blockId);
    
    return {
      responsesCount: blockResponses.length,
      responses: blockResponses.map(r => ({
        run_id: r.run_id,
        answer: r.answer,
        duration_ms: r.duration_ms,
        created_at: r.created_at
      }))
    };
  };

  const handleToggleRun = (runId: string) => {
    const newSelected = new Set(selectedRuns);
    if (newSelected.has(runId)) {
      newSelected.delete(runId);
    } else {
      newSelected.add(runId);
    }
    setSelectedRuns(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedRuns(new Set(runs.map(r => r.id)));
  };

  const handleDeselectAll = () => {
    setSelectedRuns(new Set());
  };

  const handleDeleteSelectedRuns = async () => {
    if (selectedRuns.size === 0) {
      setError("Выберите хотя бы одно прохождение для удаления");
      return;
    }

    if (!confirm(`Удалить ${selectedRuns.size} прохождений? Это каскадно удалит ответы и связанные события.`)) {
      return;
    }

    const runIds = Array.from(selectedRuns);

    try {
      // 1. Удаляем study_block_responses
      const { data: deletedResponses, error: responsesError } = await supabase
        .from("study_block_responses")
        .delete()
        .in("run_id", runIds)
        .select();

      if (responsesError) {
        console.error("Error deleting responses:", responsesError);
        setError(`Ошибка удаления ответов: ${responsesError.message}`);
        return;
      }
      console.log(`Удалено ответов: ${deletedResponses?.length || 0}`);

      // 2. Удаляем sessions где run_id IS NOT NULL (ВАЖНО: только run-linked sessions)
      const { data: deletedSessions, error: sessionsError } = await supabase
        .from("sessions")
        .delete()
        .in("run_id", runIds)
        .not("run_id", "is", null)
        .select();

      if (sessionsError) {
        console.error("Error deleting sessions:", sessionsError);
        setError(`Ошибка удаления сессий: ${sessionsError.message}`);
        return;
      }
      console.log(`Удалено сессий: ${deletedSessions?.length || 0}`);

      // 3. Удаляем events где run_id IS NOT NULL (ВАЖНО: только run-linked events)
      const { data: deletedEvents, error: eventsError } = await supabase
        .from("events")
        .delete()
        .in("run_id", runIds)
        .not("run_id", "is", null)
        .select();

      if (eventsError) {
        console.error("Error deleting events:", eventsError);
        setError(`Ошибка удаления событий: ${eventsError.message}`);
        return;
      }
      console.log(`Удалено событий: ${deletedEvents?.length || 0}`);

      // 4. Удаляем study_runs
      const { data: deletedRuns, error: runsError } = await supabase
        .from("study_runs")
        .delete()
        .in("id", runIds)
        .select();

      if (runsError) {
        console.error("Error deleting runs:", runsError);
        setError(`Ошибка удаления прохождений: ${runsError.message}. Проверьте права доступа.`);
        return;
      }

      if (!deletedRuns || deletedRuns.length === 0) {
        setError("Не удалось удалить прохождения. Возможно, у вас нет прав на удаление.");
        return;
      }

      console.log(`Успешно удалено ${deletedRuns.length} прохождений из ${runIds.length} запрошенных`);

      // Очищаем выбранные прохождения
      setSelectedRuns(new Set());
      
      // Обновляем список прохождений (без авто-выбора)
      setLoading(true);
      setError(null); // Очищаем ошибки после успешного удаления
      try {
        const { data: runsData, error: reloadError } = await supabase
          .from("study_runs")
          .select("*")
          .eq("study_id", studyId)
          .order("started_at", { ascending: false });

        if (reloadError) {
          console.error("Error reloading runs:", reloadError);
          setError(reloadError.message);
        } else {
          setRuns(runsData || []);
          // Очищаем связанные данные
          setSessions([]);
          setEvents([]);
          setResponses([]);
        }
      } catch (err) {
        console.error("Error reloading runs:", err);
        setError(`Ошибка обновления списка: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    } catch (err) {
      console.error("Unexpected error deleting runs:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const aggregates = calculateAggregates();

  if (loading) {
    return <div style={{ padding: 20 }}>Загрузка результатов...</div>;
  }

  if (error) {
    return <div style={{ padding: 20, color: "red" }}>Ошибка: {error}</div>;
  }

  return (
    <div style={{ padding: "20px 0" }}>
      {/* Aggregates */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
        marginBottom: 24
      }}>
        <div style={{ padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Всего прохождений</div>
          <div style={{ fontSize: 24, fontWeight: "bold", color: "#333" }}>{aggregates.total}</div>
        </div>
        <div style={{ padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Завершено</div>
          <div style={{ fontSize: 24, fontWeight: "bold", color: "#333" }}>{aggregates.finished}</div>
        </div>
        <div style={{ padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Процент завершения</div>
          <div style={{ fontSize: 24, fontWeight: "bold", color: "#333" }}>{aggregates.completionRate}%</div>
        </div>
        <div style={{ padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Среднее время</div>
          <div style={{ fontSize: 24, fontWeight: "bold", color: "#333" }}>{aggregates.avgDurationMinutes} мин</div>
        </div>
      </div>

      {/* Runs list with checkboxes */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Прохождения ({selectedRuns.size} выбрано)</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSelectAll}
              style={{ padding: "6px 12px", fontSize: 12, background: "#2196f3", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
            >
              Выбрать все
            </button>
            <button
              onClick={handleDeselectAll}
              style={{ padding: "6px 12px", fontSize: 12, background: "#666", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
            >
              Снять выбор
            </button>
            {selectedRuns.size > 0 && (
              <button
                onClick={handleDeleteSelectedRuns}
                style={{ padding: "6px 12px", fontSize: 12, background: "#f44336", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}
              >
                Удалить выбранные ({selectedRuns.size})
              </button>
            )}
          </div>
        </div>
        <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #ddd", borderRadius: 4 }}>
          {runs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>Нет прохождений для этого теста</div>
          ) : (
            runs.map(run => (
              <div
                key={run.id}
                style={{
                  padding: 12,
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  alignItems: "center",
                  gap: 12
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedRuns.has(run.id)}
                  onChange={() => handleToggleRun(run.id)}
                  style={{ cursor: "pointer" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {new Date(run.started_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Статус: {run.status === "finished" ? "Завершен" : run.status === "started" ? "В процессе" : run.status} {run.finished_at ? `• Завершен: ${new Date(run.finished_at).toLocaleString()}` : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Block metrics */}
      {selectedRuns.size > 0 && blocks.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 18 }}>Метрики по блокам</h3>
          {blocks.map((block, index) => (
            <div
              key={block.id}
              style={{
                padding: 16,
                background: "#fff",
                borderRadius: 8,
                marginBottom: 16,
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: getBlockTypeColor(block.type),
                  color: "white",
                  fontSize: 11,
                  fontWeight: "bold"
                }}>
                  {getBlockTypeLabel(block.type)} #{index + 1}
                </span>
              </div>

              {block.type === "prototype" ? (
                <div>
                  {(() => {
                    const metrics = calculatePrototypeBlockMetrics(block.id);
                    
                    return (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
                          <div>
                            <div style={{ fontSize: 12, color: "#666" }}>Сессий</div>
                            <div style={{ fontSize: 18, fontWeight: "bold" }}>{metrics.sessionsCount}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: "#666" }}>Завершено</div>
                            <div style={{ fontSize: 18, fontWeight: "bold", color: "#4caf50" }}>{metrics.completed}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: "#666" }}>Сдались</div>
                            <div style={{ fontSize: 18, fontWeight: "bold", color: "#ff9800" }}>{metrics.aborted}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: "#666" }}>Всего событий</div>
                            <div style={{ fontSize: 18, fontWeight: "bold" }}>{metrics.totalEvents}</div>
                          </div>
                        </div>
                        
                        {Object.keys(metrics.eventsByType).length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>События по типу:</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {Object.entries(metrics.eventsByType).map(([type, count]) => (
                                <span key={type} style={{ padding: "4px 8px", background: "#f5f5f5", borderRadius: 4, fontSize: 12 }}>
                                  {type}: {count}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        
                        {metrics.sessionsData && metrics.sessionsData.length > 0 && (
                          <div style={{ marginTop: 20 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#333" }}>Респонденты ({metrics.sessionsData.length})</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                              {metrics.sessionsData.map(({ session, events: sessionEvents, clicks: sessionClicks, status }) => (
                                <div key={session.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                                        Сессия {session.id.substring(0, 8)}...
                                      </div>
                                      <div style={{ fontSize: 11, color: "#666" }}>
                                        {new Date(session.started_at).toLocaleString("ru-RU")}
                                        {session.event_count !== undefined && ` • ${session.event_count} событий`}
                                      </div>
                                    </div>
                                    <div>
                                      <span style={{
                                        padding: "4px 8px",
                                        borderRadius: 4,
                                        fontSize: 11,
                                        fontWeight: 500,
                                        background: status === "completed" ? "#e8f5e9" : status === "aborted" ? "#fff3e0" : "#e3f2fd",
                                        color: status === "completed" ? "#2e7d32" : status === "aborted" ? "#e65100" : "#1565c0"
                                      }}>
                                        {status === "completed" ? "✓ Пройден" : status === "aborted" ? "⚠ Сдался" : "⏳ В процессе"}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {expandedSessions.has(session.id) ? (
                                    <div style={{ marginTop: 12 }}>
                                      <button
                                        onClick={() => {
                                          const newSet = new Set(expandedSessions);
                                          newSet.delete(session.id);
                                          setExpandedSessions(newSet);
                                        }}
                                        style={{ marginBottom: 12, padding: "6px 12px", background: "#f5f5f5", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
                                      >
                                        Свернуть
                                      </button>
                                      
                                      <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>События ({sessionEvents.length})</div>
                                        <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #eee", borderRadius: 4 }}>
                                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                            <thead style={{ background: "#f5f5f5", position: "sticky", top: 0 }}>
                                              <tr>
                                                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Время</th>
                                                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Тип</th>
                                                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Экран</th>
                                                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Область клика</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {groupClicksByScreen(sessionEvents, session.prototype_id || null).map((groupedEvent, idx) => (
                                                <tr key={`${groupedEvent.timestamp}-${idx}`} style={{ borderBottom: "1px solid #eee" }}>
                                                  <td style={{ padding: "8px" }}>
                                                    {new Date(groupedEvent.timestamp).toLocaleTimeString("ru-RU")}
                                                  </td>
                                                  <td style={{ padding: "8px" }}>
                                                    <span style={{
                                                      padding: "2px 6px",
                                                      borderRadius: 3,
                                                      background: groupedEvent.event_type === "completed" ? "#4caf50" : 
                                                                groupedEvent.event_type === "clicks" ? "#2196f3" :
                                                                groupedEvent.event_type === "hotspot_click" ? "#2196f3" :
                                                                groupedEvent.event_type === "scroll" ? "#9c27b0" :
                                                                groupedEvent.event_type === "closed" ? "#f44336" :
                                                                groupedEvent.event_type === "aborted" ? "#ff9800" : "#ff9800",
                                                      color: "white",
                                                      fontSize: 10
                                                    }}>
                                                      {groupedEvent.event_type === "clicks" ? "Клики" : translateEventType(groupedEvent.event_type)}
                                                      {groupedEvent.event_type === "scroll" && groupedEvent.scroll_type && (
                                                        <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.9 }}>
                                                          ({groupedEvent.scroll_type === "vertical" ? "верт." : groupedEvent.scroll_type === "horizontal" ? "гор." : "оба"})
                                                        </span>
                                                      )}
                                                    </span>
                                                  </td>
                                                  <td style={{ padding: "8px", fontSize: 11 }}>
                                                    {getScreenName(session.prototype_id || null, groupedEvent.screen_id)}
                                                  </td>
                                                  <td style={{ padding: "8px", fontSize: 11 }}>
                                                    {groupedEvent.clicks || "-"}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                      
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        const newSet = new Set(expandedSessions);
                                        newSet.add(session.id);
                                        setExpandedSessions(newSet);
                                      }}
                                      style={{ marginTop: 8, padding: "6px 12px", background: "#007AFF", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
                                    >
                                      Показать детали
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Хитмап кликов по экранам */}
                        {(() => {
                          const protoId = block.prototype_id;
                          const proto = protoId ? prototypes[protoId] : null;
                          if (!proto || !proto.screens || proto.screens.length === 0) {
                            return null;
                          }

                          const currentFilter = heatmapFilterSessions[block.id] || new Set<string>();
                          const blockSessionsForHeatmap = metrics.sessionsData?.map(s => s.session) || [];
                          const blockSessionIds = new Set(blockSessionsForHeatmap.map(s => s.id));
                          const filteredSessionIds = currentFilter.size > 0 ? currentFilter : blockSessionIds;
                          const heatmapData = calculateHeatmapData(block.id, filteredSessionIds);
                          const screenTimes = calculateScreenTimes(block.id);
                          const screenTimesMap = screenTimes.reduce((acc, st) => {
                            acc[st.screenId] = st;
                            return acc;
                          }, {} as Record<string, { screenId: string; screenName: string; totalTime: number; visitCount: number }>);

                          // Фильтруем экраны по flow
                          const validScreenIds = new Set<string>();
                          if (proto.start) validScreenIds.add(proto.start);
                          if (proto.end) validScreenIds.add(proto.end);
                          (proto.edges || []).forEach(edge => {
                            validScreenIds.add(edge.from);
                            validScreenIds.add(edge.to);
                          });
                          
                          const taskScreens = proto.screens
                            .filter(screen => validScreenIds.has(screen.id))
                            .map(screen => ({ screen, proto }));
                          
                          if (taskScreens.length === 0) return null;

                          // Сортируем экраны по пути
                          taskScreens.sort((a, b) => {
                            if (!proto.start || !proto.end) return 0;
                            if (a.screen.id === proto.start) return -1;
                            if (b.screen.id === proto.start) return 1;
                            if (a.screen.id === proto.end) return 1;
                            if (b.screen.id === proto.end) return -1;
                            return 0;
                          });

                          const containerWidth = 700;
                          const screenCount = taskScreens.length;
                          const gapSize = 16;
                          const availableWidth = containerWidth - (screenCount - 1) * gapSize;
                          const baseWidth = availableWidth / Math.max(screenCount, 1);
                          const scale = baseWidth / Math.max(...taskScreens.map(s => s.screen.width), 300);

                          return (
                            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #eee" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                                <h4 style={{ fontSize: 14, margin: 0, color: "#333" }}>Хитмап кликов</h4>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <label style={{ fontSize: 11, color: "#666" }}>Фильтр:</label>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    <button
                                      onClick={() => {
                                        if (currentFilter.size === blockSessionsForHeatmap.length) {
                                          setHeatmapFilterSessions(prev => ({ ...prev, [block.id]: new Set<string>() }));
                                        } else {
                                          setHeatmapFilterSessions(prev => ({ ...prev, [block.id]: blockSessionIds }));
                                        }
                                      }}
                                      style={{
                                        padding: "3px 6px",
                                        borderRadius: 4,
                                        border: "1px solid #ddd",
                                        fontSize: 10,
                                        cursor: "pointer",
                                        background: currentFilter.size === blockSessionsForHeatmap.length ? "#2196f3" : "white",
                                        color: currentFilter.size === blockSessionsForHeatmap.length ? "white" : "#333"
                                      }}
                                    >
                                      {currentFilter.size === blockSessionsForHeatmap.length ? "Снять все" : "Все"}
                                    </button>
                                    {blockSessionsForHeatmap.slice(0, 5).map(session => {
                                      const isSelected = currentFilter.has(session.id);
                                      return (
                                        <button
                                          key={session.id}
                                          onClick={() => {
                                            const newFilter = new Set(currentFilter);
                                            if (isSelected) {
                                              newFilter.delete(session.id);
                                            } else {
                                              newFilter.add(session.id);
                                            }
                                            setHeatmapFilterSessions(prev => ({ ...prev, [block.id]: newFilter }));
                                          }}
                                          style={{
                                            padding: "3px 6px",
                                            borderRadius: 4,
                                            border: "1px solid #ddd",
                                            fontSize: 10,
                                            cursor: "pointer",
                                            background: isSelected ? "#2196f3" : "white",
                                            color: isSelected ? "white" : "#333"
                                          }}
                                        >
                                          {session.id.substring(0, 6)}...
                                        </button>
                                      );
                                    })}
                                    {blockSessionsForHeatmap.length > 5 && (
                                      <span style={{ fontSize: 10, color: "#999", padding: "3px" }}>+{blockSessionsForHeatmap.length - 5} ещё</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div style={{ 
                                display: "flex", 
                                gap: gapSize, 
                                overflowX: "auto",
                                paddingBottom: 8
                              }}>
                                {taskScreens.map(({ screen }) => {
                                  const clicks = heatmapData[screen.id] || [];
                                  const maxCount = clicks.length > 0 ? Math.max(...clicks.map(c => c.count)) : 0;
                                  const previewWidth = Math.min(screen.width * scale, 200);
                                  const previewHeight = previewWidth * (screen.height / screen.width);
                                  const isFinalScreen = screen.id === proto.end || screen.name.toLowerCase().includes('[final]');
                                  const screenTimeData = screenTimesMap[screen.id];
                                  
                                  return (
                                    <div 
                                      key={screen.id} 
                                      style={{ 
                                        flexShrink: 0,
                                        cursor: "pointer",
                                        transition: "transform 0.2s"
                                      }}
                                      onClick={() => setSelectedHeatmapScreen({ screen, proto, clicks, blockId: block.id })}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = "scale(1.05)";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = "scale(1)";
                                      }}
                                    >
                                      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 500, textAlign: "center", maxWidth: previewWidth, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {screen.name}
                                      </div>
                                      <div style={{ 
                                        position: "relative", 
                                        display: "inline-block", 
                                        border: "1px solid #ddd", 
                                        borderRadius: 4,
                                        width: previewWidth,
                                        height: previewHeight,
                                        overflow: "hidden"
                                      }}>
                                        <img 
                                          src={screen.image} 
                                          alt={screen.name}
                                          style={{ 
                                            display: "block", 
                                            width: previewWidth,
                                            height: previewHeight,
                                            objectFit: "contain"
                                          }}
                                        />
                                        {clicks.length > 0 && (
                                          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
                                            {clicks.map((click, idx) => {
                                              const opacity = maxCount > 0 ? Math.min(0.8, 0.3 + (click.count / maxCount) * 0.5) : 0.5;
                                              const size = Math.max(4, Math.min(16, 4 + (click.count / maxCount) * 12));
                                              return (
                                                <div
                                                  key={idx}
                                                  style={{
                                                    position: "absolute",
                                                    left: `${(click.x / screen.width) * 100}%`,
                                                    top: `${(click.y / screen.height) * 100}%`,
                                                    width: size,
                                                    height: size,
                                                    borderRadius: "50%",
                                                    background: `rgba(255, 0, 0, ${opacity})`,
                                                    transform: "translate(-50%, -50%)",
                                                    pointerEvents: "none",
                                                    border: "1px solid rgba(255, 255, 255, 0.8)",
                                                    boxShadow: "0 0 2px rgba(0,0,0,0.3)"
                                                  }}
                                                  title={`${click.count} клик${click.count > 1 ? "ов" : ""}`}
                                                />
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      {screenTimeData && (
                                        <div style={{ fontSize: 9, color: "#666", marginTop: 4, textAlign: "center" }}>
                                          <div>Всего: {formatTime(screenTimeData.totalTime)}</div>
                                          <div>Посещений: {screenTimeData.visitCount}</div>
                                        </div>
                                      )}
                                      {clicks.length === 0 && !isFinalScreen && (
                                        <div style={{ fontSize: 9, color: "#999", marginTop: 4, textAlign: "center" }}>
                                          Нет кликов
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              ) : block.type === "context" || block.type === "five_seconds" ? (
                <div style={{ padding: 12, background: "#f5f5f5", borderRadius: 8, fontSize: 13, color: "#666" }}>
                  {block.type === "context" ? "Информационный блок — не собирает данные" : "Блок «5 секунд» — переход без сохранения данных"}
                </div>
              ) : (
                <div>
                  {(() => {
                    const metrics = calculateQuestionBlockMetrics(block.id);
                    return (
                      <div>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 12, color: "#666" }}>Ответов</div>
                          <div style={{ fontSize: 18, fontWeight: "bold" }}>{metrics.responsesCount}</div>
                        </div>
                        {metrics.responses.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Ответы:</div>
                            <div style={{ maxHeight: 200, overflowY: "auto" }}>
                              {metrics.responses.slice(0, 10).map((r, idx) => (
                                <div key={idx} style={{ padding: 8, background: "#f9f9f9", borderRadius: 4, marginBottom: 8 }}>
                                  <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                                    {new Date(r.created_at).toLocaleString()}
                                    {r.duration_ms && ` • ${(r.duration_ms / 1000).toFixed(1)}s`}
                                  </div>
                                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                    {formatAnswer(r.answer, block.type)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Модальное окно для просмотра хитмапа экрана */}
      {selectedHeatmapScreen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setSelectedHeatmapScreen(null)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "90vh",
              background: "white",
              borderRadius: 8,
              padding: 20,
              overflow: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedHeatmapScreen(null)}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "rgba(0,0,0,0.1)",
                border: "none",
                borderRadius: "50%",
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 18
              }}
            >
              ✕
            </button>
            
            <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>{selectedHeatmapScreen.screen.name}</h3>
            
            <div style={{ position: "relative", display: "inline-block" }}>
              <img
                src={selectedHeatmapScreen.screen.image}
                alt={selectedHeatmapScreen.screen.name}
                style={{
                  maxWidth: "80vw",
                  maxHeight: "70vh",
                  objectFit: "contain",
                  borderRadius: 4,
                  border: "1px solid #ddd"
                }}
              />
              {selectedHeatmapScreen.clicks.length > 0 && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
                  {selectedHeatmapScreen.clicks.map((click, idx) => {
                    const maxCount = Math.max(...selectedHeatmapScreen.clicks.map(c => c.count));
                    const opacity = maxCount > 0 ? Math.min(0.8, 0.3 + (click.count / maxCount) * 0.5) : 0.5;
                    const size = Math.max(8, Math.min(32, 8 + (click.count / maxCount) * 24));
                    return (
                      <div
                        key={idx}
                        style={{
                          position: "absolute",
                          left: `${(click.x / selectedHeatmapScreen.screen.width) * 100}%`,
                          top: `${(click.y / selectedHeatmapScreen.screen.height) * 100}%`,
                          width: size,
                          height: size,
                          borderRadius: "50%",
                          background: `rgba(255, 0, 0, ${opacity})`,
                          transform: "translate(-50%, -50%)",
                          pointerEvents: "none",
                          border: "2px solid rgba(255, 255, 255, 0.9)",
                          boxShadow: "0 0 4px rgba(0,0,0,0.4)"
                        }}
                        title={`${click.count} клик${click.count > 1 ? "ов" : ""}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            
            <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
              <div>Размер экрана: {selectedHeatmapScreen.screen.width} × {selectedHeatmapScreen.screen.height}px</div>
              <div>Кликов: {selectedHeatmapScreen.clicks.length} позиций, {selectedHeatmapScreen.clicks.reduce((sum, c) => sum + c.count, 0)} всего</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

