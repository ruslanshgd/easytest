import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { isValidUUID } from "./utils/validation";

// Используем те же интерфейсы из Analytics
interface Session {
  id: string;
  started_at?: string;
  event_count?: number;
  last_event_at?: string;
  completed?: boolean;
  aborted?: boolean;
  prototype_id?: string;
  umux_lite_item1?: number | null;
  umux_lite_item2?: number | null;
  umux_lite_score?: number | null;
  umux_lite_sus_score?: number | null;
  feedback_text?: string | null;
}

interface SessionEvent {
  id: string;
  session_id: string;
  event_type: string;
  screen_id: string | null;
  hotspot_id: string | null;
  timestamp: string;
  x?: number;
  y?: number;
  scroll_x?: number;
  scroll_y?: number;
  scroll_depth_x?: number;
  scroll_depth_y?: number;
  scroll_direction?: string;
  scroll_type?: string;
  is_nested?: boolean;
  frame_id?: string;
}

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

export default function PrototypePage() {
  const params = useParams<{ prototypeId: string }>();
  const navigate = useNavigate();
  const prototypeId = params.prototypeId || null;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionEvents, setSessionEvents] = useState<Record<string, SessionEvent[]>>({});
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [prototypes, setPrototypes] = useState<Record<string, Proto>>({});
  const [prototypeTaskDescriptions, setPrototypeTaskDescriptions] = useState<Record<string, string | null>>({});
  const [sessionPrototypeIds, setSessionPrototypeIds] = useState<Record<string, string>>({});
  const [taskHeatmapFilterSessions, setTaskHeatmapFilterSessions] = useState<Set<string>>(new Set());
  const [selectedHeatmapScreen, setSelectedHeatmapScreen] = useState<{ screen: Screen; proto: Proto; clicks: Array<{ x: number; y: number; count: number }> } | null>(null);

  // Функция загрузки всех сессий (та же логика из Analytics)
  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    console.log("PrototypePage: Loading sessions for current user's prototypes");
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("PrototypePage: User not authenticated");
        setError("Требуется авторизация");
        setLoading(false);
        return;
      }

      const { data: userPrototypes, error: prototypesError } = await supabase
        .from("prototypes")
        .select("id")
        .eq("user_id", user.id);

      if (prototypesError) {
        console.error("PrototypePage: Error loading user prototypes", prototypesError);
        setError(prototypesError.message);
        setLoading(false);
        return;
      }

      if (!userPrototypes || userPrototypes.length === 0) {
        console.log("PrototypePage: No prototypes found for user");
        setSessions([]);
        setSessionEvents({});
        setLoading(false);
        return;
      }

      const userPrototypeIds = userPrototypes.map(p => p.id);
      console.log("PrototypePage: Found prototypes for user:", userPrototypeIds.length);

      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, started_at, prototype_id, umux_lite_item1, umux_lite_item2, umux_lite_score, umux_lite_sus_score, feedback_text")
        .in("prototype_id", userPrototypeIds)
        .order("started_at", { ascending: false })
        .limit(100);

      if (sessionsError) {
        console.error("PrototypePage: Error loading sessions", sessionsError);
        setError(sessionsError.message);
        setLoading(false);
        return;
      }

      const sessionIds = (sessionsData || []).map(s => s.id);
      
      if (sessionIds.length === 0) {
        setSessions([]);
        setSessionEvents({});
        setLoading(false);
        return;
      }

      const { data: eventsData, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .in("session_id", sessionIds);

      if (eventsError) {
        console.error("PrototypePage: Error loading events", eventsError);
        setError(eventsError.message);
        setLoading(false);
        return;
      }

      const eventsBySession: Record<string, SessionEvent[]> = {};
      (eventsData || []).forEach(event => {
        if (!eventsBySession[event.session_id]) {
          eventsBySession[event.session_id] = [];
        }
        eventsBySession[event.session_id].push(event as SessionEvent);
      });

      const sessionsWithMetrics: Session[] = (sessionsData || []).map(session => {
        const events = eventsBySession[session.id] || [];
        const sortedEvents = [...events].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const completedIndex = sortedEvents.findIndex(e => e.event_type === "completed");
        const abortedIndex = sortedEvents.findIndex(e => e.event_type === "aborted");
        const closedIndex = sortedEvents.findIndex(e => e.event_type === "closed");
        
        const hasCompleted = completedIndex !== -1;
        const hasAborted = abortedIndex !== -1;
        const hasClosed = closedIndex !== -1;
        
        let isCompleted = false;
        let isAborted = false;
        
        if (hasCompleted) {
          if (hasAborted) {
            const completedEvent = sortedEvents[completedIndex];
            const abortedEvent = sortedEvents[abortedIndex];
            const completedTime = new Date(completedEvent.timestamp).getTime();
            const abortedTime = new Date(abortedEvent.timestamp).getTime();
            isCompleted = completedTime > abortedTime;
            isAborted = !isCompleted && abortedIndex !== -1;
          } else {
            isCompleted = true;
          }
        } else if (hasAborted) {
          isAborted = true;
        } else if (hasClosed) {
          isAborted = true;
        }
        
        const lastEvent = sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1] : null;

        const umuxLiteScore = (session as any).umux_lite_score;
        const umuxLiteSusScore = (session as any).umux_lite_sus_score;
        
        const safeParseFloat = (value: any): number | null => {
          if (value === null || value === undefined) return null;
          if (typeof value === 'number') {
            return isNaN(value) ? null : value;
          }
          if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? null : parsed;
          }
          return null;
        };
        
        return {
          id: session.id,
          started_at: session.started_at,
          event_count: events.length,
          last_event_at: lastEvent?.timestamp,
          completed: isCompleted,
          aborted: isAborted && !isCompleted,
          prototype_id: (session as any).prototype_id || undefined,
          umux_lite_item1: (session as any).umux_lite_item1 || null,
          umux_lite_item2: (session as any).umux_lite_item2 || null,
          umux_lite_score: safeParseFloat(umuxLiteScore),
          umux_lite_sus_score: safeParseFloat(umuxLiteSusScore),
          feedback_text: (session as any).feedback_text || null
        };
      });

      setSessions(sessionsWithMetrics);
      setSessionEvents(eventsBySession);

      const sessionProtoMap: Record<string, string> = {};
      (sessionsData || []).forEach(session => {
        if ((session as any).prototype_id) {
          sessionProtoMap[session.id] = (session as any).prototype_id;
        }
      });
      setSessionPrototypeIds(sessionProtoMap);

      const uniquePrototypeIds = Array.from(new Set(Object.values(sessionProtoMap)));
      if (uniquePrototypeIds.length > 0) {
        await loadPrototypes(uniquePrototypeIds);
      }
    } catch (err) {
      console.error("PrototypePage: Unexpected error loading sessions", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Функция загрузки прототипов (та же логика из Analytics)
  const loadPrototypes = async (prototypeIds: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("PrototypePage: User not authenticated");
        return;
      }

      const { data: prototypesData, error: protoError } = await supabase
        .from("prototypes")
        .select("id, data, task_description")
        .in("id", prototypeIds)
        .eq("user_id", user.id);

      if (protoError) {
        console.error("PrototypePage: Error loading prototypes", protoError);
        return;
      }

      if (prototypesData) {
        const prototypesMap: Record<string, Proto> = {};
        const taskDescriptionsMap: Record<string, string | null> = {};
        prototypesData.forEach(p => {
          if (p.data) {
            prototypesMap[p.id] = p.data as Proto;
          }
          taskDescriptionsMap[p.id] = p.task_description || null;
        });
        setPrototypes(prev => ({ ...prev, ...prototypesMap }));
        setPrototypeTaskDescriptions(prev => ({ ...prev, ...taskDescriptionsMap }));
      }
    } catch (err) {
      console.error("PrototypePage: Unexpected error loading prototypes", err);
    }
  };

  // Загружаем данные при монтировании
  useEffect(() => {
    if (prototypeId && isValidUUID(prototypeId)) {
      loadSessions();
    } else if (prototypeId) {
      setError("Неверный формат ID прототипа");
      setLoading(false);
    }
  }, [prototypeId]);

  // Функции управления сессиями (те же из Analytics)
  const toggleSession = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
      loadSessionDetails(sessionId);
    }
    setExpandedSessions(newExpanded);
  };

  const loadSessionDetails = async (sessionId: string) => {
    if (!isValidUUID(sessionId)) {
      console.error("PrototypePage: Invalid sessionId format:", sessionId);
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("session_id", sessionId)
      .order("timestamp", { ascending: true });

    if (error) {
      console.error("PrototypePage: Error loading session details", error);
      return;
    }

    setSessionEvents(prev => ({
      ...prev,
      [sessionId]: (data || []) as SessionEvent[]
    }));
  };

  const toggleSelectSession = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm(`Удалить сессию ${sessionId}?`)) {
      return;
    }

    if (!isValidUUID(sessionId)) {
      setError("Invalid session ID format");
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const { data: deletedEvents, error: eventsError } = await supabase
        .from("events")
        .delete()
        .eq("session_id", sessionId);

      if (eventsError) {
        console.error("Error deleting events:", eventsError);
        setError(`Ошибка удаления событий: ${eventsError.message}`);
        setDeleting(false);
        return;
      }

      const { data: deletedSession, error: sessionError } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionId)
        .select();

      if (sessionError) {
        console.error("Error deleting session:", sessionError);
        setError(`Ошибка удаления сессии: ${sessionError.message}`);
        setDeleting(false);
        return;
      }

      if (!deletedSession || deletedSession.length === 0) {
        const { data: checkSessions } = await supabase
          .from("sessions")
          .select("id")
          .eq("id", sessionId);
        if (checkSessions && checkSessions.length > 0) {
          setError("ОШИБКА: Сессия не была удалена. Возможно, проблема с правами доступа (RLS политики) в Supabase.");
        }
      }

      await loadSessions();
      setSelectedSessions(prev => {
        const newSelected = new Set(prev);
        newSelected.delete(sessionId);
        return newSelected;
      });
      setExpandedSessions(prev => {
        const newExpanded = new Set(prev);
        newExpanded.delete(sessionId);
        return newExpanded;
      });
    } catch (err) {
      console.error("Error deleting session:", err);
      setError(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  // Вспомогательные функции (те же из Analytics)
  const getScreenName = (sessionId: string, screenId: string | null): string => {
    if (!screenId) return "-";
    const prototypeId = sessionPrototypeIds[sessionId];
    if (!prototypeId) return screenId;
    const proto = prototypes[prototypeId];
    if (!proto) return screenId;
    const screen = proto.screens.find(s => s.id === screenId);
    return screen ? screen.name : screenId;
  };

  const getHotspotName = (sessionId: string, hotspotId: string | null, screenId: string | null): string => {
    if (!hotspotId) {
      if (screenId) {
        return getScreenName(sessionId, screenId);
      }
      return "-";
    }
    const prototypeId = sessionPrototypeIds[sessionId];
    if (!prototypeId) return hotspotId;
    const proto = prototypes[prototypeId];
    if (!proto) return hotspotId;
    const hotspot = proto.hotspots.find((h: any) => 
      h.id === hotspotId && 
      (screenId ? h.frame === screenId : true)
    );
    return hotspot?.name || hotspotId;
  };

  const groupClicksByScreen = (events: SessionEvent[], sessionId: string): Array<{
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
    let currentScreenClicks: SessionEvent[] = [];

    sortedEvents.forEach((event) => {
      if (event.event_type === "screen_load") {
        if (currentScreenClicks.length > 0 && currentScreenId) {
          const clicksList = currentScreenClicks.map(click => {
            if (click.hotspot_id) {
              return getHotspotName(sessionId, click.hotspot_id, click.screen_id);
            } else {
              return getScreenName(sessionId, click.screen_id);
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
                return getHotspotName(sessionId, click.hotspot_id, click.screen_id);
              } else {
                return getScreenName(sessionId, click.screen_id);
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
              return getHotspotName(sessionId, click.hotspot_id, click.screen_id);
            } else {
              return getScreenName(sessionId, click.screen_id);
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
              return getHotspotName(sessionId, click.hotspot_id, click.screen_id);
            } else {
              return getScreenName(sessionId, click.screen_id);
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
          clicks: getHotspotName(sessionId, event.hotspot_id, event.screen_id),
          isClickGroup: false,
          scroll_type: undefined
        });
      }
    });

    if (currentScreenClicks.length > 0 && currentScreenId) {
      const clicksList = currentScreenClicks.map(click => {
        if (click.hotspot_id) {
          return getHotspotName(sessionId, click.hotspot_id, click.screen_id);
        } else {
          return getScreenName(sessionId, click.screen_id);
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

  const calculateScreenTimes = (prototypeId?: string): Array<{ screenId: string; screenName: string; totalTime: number; visitCount: number }> => {
    const screenTimesMap: Record<string, { totalTime: number; visitCount: number; prototypeId?: string }> = {};
    
    const filteredSessions = prototypeId 
      ? sessions.filter(s => sessionPrototypeIds[s.id] === prototypeId)
      : sessions;
    
    filteredSessions.forEach(session => {
      const events = sessionEvents[session.id] || [];
      const sessionPrototypeId = sessionPrototypeIds[session.id];
      
      const screenLoads = events
        .filter(e => e.event_type === "screen_load" && e.screen_id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      screenLoads.forEach((loadEvent, index) => {
        const screenId = loadEvent.screen_id!;
        const loadTime = new Date(loadEvent.timestamp).getTime();
        
        let endTime: number;
        if (index < screenLoads.length - 1) {
          endTime = new Date(screenLoads[index + 1].timestamp).getTime();
        } else {
          const lastEvent = events[events.length - 1];
          endTime = lastEvent ? new Date(lastEvent.timestamp).getTime() : loadTime;
        }
        
        const timeSpent = Math.max(0, endTime - loadTime);
        
        if (!screenTimesMap[screenId]) {
          screenTimesMap[screenId] = { totalTime: 0, visitCount: 0, prototypeId: sessionPrototypeId };
        }
        
        screenTimesMap[screenId].totalTime += timeSpent;
        screenTimesMap[screenId].visitCount += 1;
        if (!screenTimesMap[screenId].prototypeId && sessionPrototypeId) {
          screenTimesMap[screenId].prototypeId = sessionPrototypeId;
        }
      });
    });
    
    return Object.entries(screenTimesMap).map(([screenId, data]) => {
      let screenName = screenId;
      if (data.prototypeId && prototypes[data.prototypeId]) {
        const screen = prototypes[data.prototypeId].screens.find(s => s.id === screenId);
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

  const calculateHeatmapData = (sessionIdFilters?: Set<string>, prototypeId?: string): Record<string, Array<{ x: number; y: number; count: number }>> => {
    const heatmapMap: Record<string, Record<string, { x: number; y: number; count: number }>> = {};
    
    let filteredSessions = sessions;
    if (prototypeId) {
      filteredSessions = sessions.filter(s => sessionPrototypeIds[s.id] === prototypeId);
      if (sessionIdFilters && sessionIdFilters.size > 0) {
        filteredSessions = filteredSessions.filter(s => sessionIdFilters.has(s.id));
      }
    } else if (sessionIdFilters && sessionIdFilters.size > 0) {
      filteredSessions = sessions.filter(s => sessionIdFilters.has(s.id));
    }
    
    filteredSessions.forEach(session => {
      const events = sessionEvents[session.id] || [];
      const hotspotClickEvents = events.filter(e => 
        e.event_type === "hotspot_click" && e.hotspot_id && e.screen_id && e.x !== undefined && e.y !== undefined
      );
      
      hotspotClickEvents.forEach(clickEvent => {
        const screenId = clickEvent.screen_id!;
        const x = clickEvent.x!;
        const y = clickEvent.y!;
        
        if (!heatmapMap[screenId]) {
          heatmapMap[screenId] = {};
        }
        
        const key = `${x},${y}`;
        if (!heatmapMap[screenId][key]) {
          heatmapMap[screenId][key] = { x, y, count: 0 };
        }
        heatmapMap[screenId][key].count += 1;
      });
      
      const emptyAreaClickEvents = events.filter(e => 
        e.event_type === "click" && e.screen_id && !e.hotspot_id && e.x !== undefined && e.y !== undefined
      );
      
      emptyAreaClickEvents.forEach(clickEvent => {
        const screenId = clickEvent.screen_id!;
        const x = clickEvent.x!;
        const y = clickEvent.y!;
        
        if (!heatmapMap[screenId]) {
          heatmapMap[screenId] = {};
        }
        
        const key = `${x},${y}`;
        if (!heatmapMap[screenId][key]) {
          heatmapMap[screenId][key] = { x, y, count: 0 };
        }
        heatmapMap[screenId][key].count += 1;
      });
    });
    
    const result: Record<string, Array<{ x: number; y: number; count: number }>> = {};
    Object.keys(heatmapMap).forEach(screenId => {
      result[screenId] = Object.values(heatmapMap[screenId]);
    });
    
    return result;
  };

  const getAbandonedScreens = (sessionIdFilters?: Set<string>, prototypeId?: string): { closedScreens: Set<string>; abortedScreens: Set<string> } => {
    const closedScreenIds = new Set<string>();
    const abortedScreenIds = new Set<string>();
    
    let filteredSessions = sessions;
    if (prototypeId) {
      filteredSessions = sessions.filter(s => sessionPrototypeIds[s.id] === prototypeId);
      if (sessionIdFilters && sessionIdFilters.size > 0) {
        filteredSessions = filteredSessions.filter(s => sessionIdFilters.has(s.id));
      }
    } else if (sessionIdFilters && sessionIdFilters.size > 0) {
      filteredSessions = sessions.filter(s => sessionIdFilters.has(s.id));
    }
    
    filteredSessions.forEach(session => {
      const events = sessionEvents[session.id] || [];
      const relevantEvents = events.filter(e => 
        (e.event_type === "completed" || e.event_type === "aborted" || e.event_type === "closed") 
        && e.screen_id
      );
      
      if (relevantEvents.length === 0) {
        return;
      }
      
      const sortedEvents = [...relevantEvents].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      const lastEvent = sortedEvents[sortedEvents.length - 1];
      
      if (lastEvent.screen_id) {
        if (lastEvent.event_type === "aborted") {
          abortedScreenIds.add(lastEvent.screen_id);
        } else if (lastEvent.event_type === "closed") {
          closedScreenIds.add(lastEvent.screen_id);
        }
      }
    });
    
    return { closedScreens: closedScreenIds, abortedScreens: abortedScreenIds };
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

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}м ${remainingSeconds}с`;
    }
    return `${seconds}с`;
  };

  // Фильтруем сессии по prototypeId
  const prototypeSessions = prototypeId 
    ? sessions.filter(s => sessionPrototypeIds[s.id] === prototypeId)
    : [];

  // Вычисляем метрики для этого прототипа (та же логика из groupSessionsByTask)
  const calculateMetrics = () => {
    const completed = prototypeSessions.filter(s => s.completed).length;
    const aborted = prototypeSessions.filter(s => {
      if (s.completed) {
        return false;
      }
      const events = sessionEvents[s.id] || [];
      return events.some(e => e.event_type === "aborted");
    }).length;
    const closed = prototypeSessions.filter(s => {
      const events = sessionEvents[s.id] || [];
      return events.some(e => e.event_type === "closed");
    }).length;

    const umuxLiteScores = prototypeSessions
      .filter(s => s.umux_lite_score !== null && s.umux_lite_score !== undefined)
      .map(s => s.umux_lite_score!);
    const avgUmuxLite = umuxLiteScores.length > 0
      ? umuxLiteScores.reduce((sum, score) => sum + score, 0) / umuxLiteScores.length
      : null;

    const umuxLiteSusScores = prototypeSessions
      .filter(s => s.umux_lite_sus_score !== null && s.umux_lite_sus_score !== undefined)
      .map(s => s.umux_lite_sus_score!);
    const avgUmuxLiteSus = umuxLiteSusScores.length > 0
      ? umuxLiteSusScores.reduce((sum, score) => sum + score, 0) / umuxLiteSusScores.length
      : null;

    const totalAbandoned = aborted + closed;
    const conversionRate = prototypeSessions.length > 0 ? ((completed / prototypeSessions.length) * 100).toFixed(1) : "0";
    
    return {
      total: prototypeSessions.length,
      completed,
      aborted,
      closed,
      totalAbandoned,
      conversionRate,
      avgUmuxLite: avgUmuxLite ? Math.round(avgUmuxLite * 100) / 100 : null,
      avgUmuxLiteSus: avgUmuxLiteSus ? Math.round(avgUmuxLiteSus * 100) / 100 : null
    };
  };

  const metrics = calculateMetrics();
  const taskDescription = prototypeId ? (prototypeTaskDescriptions[prototypeId] || null) : null;
  const taskProto = prototypeId ? prototypes[prototypeId] : null;

  // Стили (те же из Analytics)
  const containerStyle = {
    padding: "20px",
    maxWidth: "1104px",
    margin: "0 auto"
  };

  const sessionCardStyle = {
    background: "#ffffff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    cursor: "pointer",
    transition: "box-shadow 0.2s"
  };

  const sessionHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  };

  const sessionIdStyle = {
    fontFamily: "monospace",
    fontSize: 14,
    fontWeight: "bold",
    color: "#333"
  };

  const metricsStyle = {
    display: "flex",
    gap: 16,
    fontSize: 12,
    color: "#666"
  };

  const badgeStyle = (completed: boolean, aborted: boolean = false, closed: boolean = false) => ({
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: "bold",
    background: completed ? "#4caf50" : closed ? "#f44336" : aborted ? "#ff9800" : "#9e9e9e",
    color: "white"
  });

  if (loading) {
    return (
      <div style={containerStyle}>
        <h2>Аналитика прототипа</h2>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <h2>Аналитика прототипа</h2>
        <p style={{ color: "red" }}>Ошибка: {error}</p>
        <button onClick={() => navigate("/")} style={{ marginTop: 16, padding: "8px 16px" }}>
          Вернуться к списку
        </button>
      </div>
    );
  }

  if (!prototypeId || !isValidUUID(prototypeId)) {
    return (
      <div style={containerStyle}>
        <h2>Аналитика прототипа</h2>
        <p style={{ color: "red" }}>Неверный ID прототипа</p>
        <button onClick={() => navigate("/")} style={{ marginTop: 16, padding: "8px 16px" }}>
          Вернуться к списку
        </button>
      </div>
    );
  }

  if (prototypeSessions.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2>Аналитика прототипа</h2>
          <button onClick={() => navigate("/")} style={{ padding: "8px 16px" }}>
            Вернуться к списку
          </button>
        </div>
        <p>Сессии для этого прототипа не найдены.</p>
      </div>
    );
  }

  // Фильтры для хитмапа
  const taskSessionIds = new Set(prototypeSessions.map(s => s.id));
  const filteredTaskSessionIds = taskHeatmapFilterSessions.size > 0 ? taskHeatmapFilterSessions : taskSessionIds;
  const taskHeatmapData = calculateHeatmapData(filteredTaskSessionIds, prototypeId);
  const shouldHighlight = taskHeatmapFilterSessions.size === 1;
  const taskAbandonedScreens = shouldHighlight 
    ? getAbandonedScreens(taskHeatmapFilterSessions, prototypeId)
    : { closedScreens: new Set<string>(), abortedScreens: new Set<string>() };

  return (
    <div style={containerStyle}>
      {/* Заголовок с кнопкой назад */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 600, color: "#333" }}>
            {taskDescription || `Прототип ${prototypeId.substring(0, 8)}...`}
          </h2>
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", 
            gap: 12,
            fontSize: 12,
            color: "#666"
          }}>
            <div>
              <span style={{ color: "#999" }}>Запущено: </span>
              <span style={{ fontWeight: "bold" }}>{metrics.total}</span>
            </div>
            <div>
              <span style={{ color: "#999" }}>Пройдено: </span>
              <span style={{ fontWeight: "bold", color: "#4caf50" }}>{metrics.completed}</span>
            </div>
            <div>
              <span style={{ color: "#999" }}>Прервано (сдался): </span>
              <span style={{ fontWeight: "bold", color: "#ff9800" }}>{metrics.aborted}</span>
            </div>
            <div>
              <span style={{ color: "#999" }}>Закрыто: </span>
              <span style={{ fontWeight: "bold", color: "#f44336" }}>{metrics.closed}</span>
            </div>
            <div>
              <span style={{ color: "#999" }}>Всего брошено: </span>
              <span style={{ fontWeight: "bold", color: "#ff5722" }}>{metrics.totalAbandoned}</span>
            </div>
            <div>
              <span style={{ color: "#999" }}>Конверсия: </span>
              <span style={{ fontWeight: "bold", color: "#2196f3" }}>{metrics.conversionRate}%</span>
            </div>
            {metrics.avgUmuxLite !== null && metrics.avgUmuxLite !== undefined && (
              <div>
                <span style={{ color: "#999" }}>UMUX Lite (среднее): </span>
                <span style={{ fontWeight: "bold", color: "#9c27b0" }}>
                  {metrics.avgUmuxLite.toFixed(1)}
                  {metrics.avgUmuxLiteSus !== null && metrics.avgUmuxLiteSus !== undefined && (
                    <span style={{ fontSize: 11, color: "#999", marginLeft: 4 }}>
                      (SUS: {metrics.avgUmuxLiteSus.toFixed(1)})
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
        <button 
          onClick={() => navigate("/")} 
          style={{ 
            padding: "8px 16px",
            background: "#2196f3",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: "bold"
          }}
        >
          ← Вернуться к списку
        </button>
      </div>

      {/* Список сессий */}
      <div style={{ marginTop: 24 }}>
        {prototypeSessions.sort((a, b) => {
          const dateA = a.started_at ? new Date(a.started_at).getTime() : 0;
          const dateB = b.started_at ? new Date(b.started_at).getTime() : 0;
          return dateB - dateA;
        }).map(session => {
          const isExpanded = expandedSessions.has(session.id);
          const events = sessionEvents[session.id] || [];
          const isSelected = selectedSessions.has(session.id);

          return (
            <div
              key={session.id}
              style={{
                ...sessionCardStyle,
                border: isSelected ? "2px solid #2196f3" : "none"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 8px rgba(0,0,0,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelectSession(session.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginTop: 4, cursor: "pointer" }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={sessionHeaderStyle}
                    onClick={() => toggleSession(session.id)}
                  >
                    <div>
                      <div style={sessionIdStyle}>{session.id}</div>
                      <div style={metricsStyle}>
                        <span>Событий: {session.event_count || 0}</span>
                        {session.started_at && (
                          <span>
                            Создана: {new Date(session.started_at).toLocaleString("ru-RU")}
                          </span>
                        )}
                        {session.last_event_at && (
                          <span>
                            Последняя активность: {new Date(session.last_event_at).toLocaleString("ru-RU")}
                          </span>
                        )}
                        {(session.umux_lite_score !== null && session.umux_lite_score !== undefined) || (session.umux_lite_item1 !== null && session.umux_lite_item1 !== undefined) ? (
                          <span style={{ color: "#2196f3", fontWeight: "bold" }}>
                            {session.umux_lite_score !== null && session.umux_lite_score !== undefined ? (
                              <>
                                UMUX Lite: {session.umux_lite_score.toFixed(1)}
                                {session.umux_lite_sus_score !== null && session.umux_lite_sus_score !== undefined && (
                                  <span style={{ fontSize: 11, marginLeft: 4 }}>
                                    (SUS: {session.umux_lite_sus_score.toFixed(1)})
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                UMUX Lite: item1={session.umux_lite_item1}, item2={session.umux_lite_item2}
                              </>
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <span style={(() => {
                        const events = sessionEvents[session.id] || [];
                        const hasClosed = events.some(e => e.event_type === "closed");
                        const hasAborted = events.some(e => e.event_type === "aborted");
                        return badgeStyle(session.completed || false, hasAborted, hasClosed);
                      })()}>
                        {session.completed ? "✓ Пройден" : (() => {
                          const events = sessionEvents[session.id] || [];
                          const hasClosed = events.some(e => e.event_type === "closed");
                          const hasAborted = events.some(e => e.event_type === "aborted");
                          if (hasClosed) return "⏸ Закрыл тест";
                          if (hasAborted) return "⏸ Сдался";
                          return "○ В процессе";
                        })()}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 18 }}>
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      disabled={deleting}
                      style={{
                        padding: "6px 12px",
                        background: "#f44336",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: deleting ? "not-allowed" : "pointer",
                        fontSize: 12,
                        fontWeight: "bold"
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
                  {session.feedback_text && (
                    <div style={{ 
                      marginBottom: 16, 
                      padding: 12, 
                      background: "#f5f5f5", 
                      borderRadius: 4,
                      borderLeft: "3px solid #2196f3"
                    }}>
                      <div style={{ fontSize: 12, fontWeight: "bold", color: "#333", marginBottom: 8 }}>
                        💬 Фидбэк от респондента:
                      </div>
                      <div style={{ fontSize: 14, color: "#666", whiteSpace: "pre-wrap" }}>
                        {session.feedback_text}
                      </div>
                    </div>
                  )}
                  {events.length === 0 ? (
                    <p style={{ color: "#999" }}>Загрузка событий...</p>
                  ) : (
                    <div>
                      <h3 style={{ fontSize: 14, marginBottom: 12 }}>
                        События ({events.length}):
                      </h3>
                      <div style={{ maxHeight: "400px", overflow: "auto" }}>
                        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#f5f5f5" }}>
                              <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>
                                Время
                              </th>
                              <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>
                                Тип
                              </th>
                              <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>
                                Экран
                              </th>
                              <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>
                                Область клика
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupClicksByScreen(events, session.id).map((groupedEvent, idx) => (
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
                                              groupedEvent.event_type === "scroll_start" ? "#9c27b0" :
                                              groupedEvent.event_type === "scroll_end" ? "#9c27b0" :
                                              groupedEvent.event_type === "closed" ? "#f44336" :
                                              groupedEvent.event_type === "aborted" ? "#ff9800" : "#ff9800",
                                    color: "white",
                                    fontSize: 11
                                  }}>
                                    {groupedEvent.event_type === "clicks" ? "Клики" : translateEventType(groupedEvent.event_type)}
                                    {groupedEvent.event_type === "scroll" && groupedEvent.scroll_type && (
                                      <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.9 }}>
                                        ({groupedEvent.scroll_type === "vertical" ? "верт." : groupedEvent.scroll_type === "horizontal" ? "гор." : "оба"})
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td style={{ padding: "8px", fontSize: 11 }}>
                                  {getScreenName(session.id, groupedEvent.screen_id)}
                                </td>
                                <td style={{ padding: "8px", fontSize: 11 }}>
                                  {groupedEvent.clicks || "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <details style={{ marginTop: 12 }}>
                        <summary style={{ cursor: "pointer", color: "#666", fontSize: 12 }}>
                          Показать JSON
                        </summary>
                        <pre style={{
                          background: "#f5f5f5",
                          padding: 12,
                          borderRadius: 4,
                          overflow: "auto",
                          fontSize: 11,
                          marginTop: 8
                        }}>
                          {JSON.stringify(events, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Хитмап кликов */}
      {taskProto && (() => {
        const validScreenIds = new Set<string>();
        if (taskProto.start) validScreenIds.add(taskProto.start);
        if (taskProto.end) validScreenIds.add(taskProto.end);
        (taskProto.edges || []).forEach(edge => {
          validScreenIds.add(edge.from);
          validScreenIds.add(edge.to);
        });
        
        const taskScreens = taskProto.screens
          .filter(screen => validScreenIds.has(screen.id))
          .map(screen => ({ screen, proto: taskProto }));
        
        if (taskScreens.length === 0) return null;
        
        taskScreens.sort((a, b) => {
          if (!taskProto.start || !taskProto.end) return 0;
          if (a.screen.id === taskProto.start) return -1;
          if (b.screen.id === taskProto.start) return 1;
          if (a.screen.id === taskProto.end) return 1;
          if (b.screen.id === taskProto.end) return -1;
          
          const buildPath = (startId: string, endId: string, edges: Edge[]): string[] => {
            const path: string[] = [startId];
            const visited = new Set<string>([startId]);
            let current = startId;
            while (current !== endId && path.length < taskProto.screens.length) {
              const edge = edges.find(e => e.from === current && !visited.has(e.to));
              if (!edge) break;
              path.push(edge.to);
              visited.add(edge.to);
              current = edge.to;
            }
            return path;
          };
          
          const path = buildPath(taskProto.start, taskProto.end, taskProto.edges || []);
          const indexA = path.indexOf(a.screen.id);
          const indexB = path.indexOf(b.screen.id);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
        });
        
        const containerWidth = 1104 - 40 - 32;
        const minScreenWidth = 150;
        const screenCount = taskScreens.length;
        const gapSize = 16;
        const availableWidth = containerWidth - (screenCount - 1) * gapSize;
        const baseWidth = availableWidth / screenCount;
        const scale = baseWidth < minScreenWidth ? baseWidth / Math.max(...taskScreens.map(s => s.screen.width)) : 0.5;
        
        const taskScreenTimesMap = calculateScreenTimes(prototypeId).reduce((acc, st) => {
          acc[st.screenId] = st;
          return acc;
        }, {} as Record<string, { screenId: string; screenName: string; totalTime: number; visitCount: number }>);
        
        return (
          <div style={{
            marginTop: 24,
            paddingTop: 24,
            borderTop: "1px solid #eee"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <h3 style={{ fontSize: 16, margin: 0, color: "#333" }}>Хитмап кликов</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, color: "#666" }}>
                  Фильтр по сессиям:
                </label>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: "400px" }}>
                  <button
                    onClick={() => {
                      if (taskHeatmapFilterSessions.size === prototypeSessions.length) {
                        setTaskHeatmapFilterSessions(new Set());
                      } else {
                        setTaskHeatmapFilterSessions(new Set(taskSessionIds));
                      }
                    }}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "1px solid #ddd",
                      fontSize: 11,
                      cursor: "pointer",
                      background: taskHeatmapFilterSessions.size === prototypeSessions.length ? "#2196f3" : "white",
                      color: taskHeatmapFilterSessions.size === prototypeSessions.length ? "white" : "#333"
                    }}
                  >
                    {taskHeatmapFilterSessions.size === prototypeSessions.length ? "Снять все" : "Выбрать все"}
                  </button>
                  {prototypeSessions.map(session => {
                    const isSelected = taskHeatmapFilterSessions.has(session.id);
                    const events = sessionEvents[session.id] || [];
                    const hasClosed = events.some(e => e.event_type === "closed");
                    const hasAborted = events.some(e => e.event_type === "aborted");
                    let icon = "○";
                    if (session.completed) {
                      icon = "✓";
                    } else if (hasClosed) {
                      icon = "!";
                    } else if (hasAborted) {
                      icon = "✗";
                    }
                    return (
                      <button
                        key={session.id}
                        onClick={() => {
                          const newFilter = new Set(taskHeatmapFilterSessions);
                          if (isSelected) {
                            newFilter.delete(session.id);
                          } else {
                            newFilter.add(session.id);
                          }
                          setTaskHeatmapFilterSessions(newFilter);
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid #ddd",
                          fontSize: 11,
                          cursor: "pointer",
                          background: isSelected ? "#2196f3" : "white",
                          color: isSelected ? "white" : "#333",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {session.id.substring(0, 8)}... {icon}
                      </button>
                    );
                  })}
                </div>
                {taskHeatmapFilterSessions.size > 0 && (
                  <span style={{ fontSize: 11, color: "#666" }}>
                    Выбрано: {taskHeatmapFilterSessions.size} из {prototypeSessions.length}
                  </span>
                )}
              </div>
            </div>
            <div style={{ 
              display: "flex", 
              gap: gapSize, 
              overflowX: "auto",
              paddingBottom: 8
            }}>
              {taskScreens.map(({ screen }) => {
                const clicks = taskHeatmapData[screen.id] || [];
                const maxCount = clicks.length > 0 ? Math.max(...clicks.map(c => c.count)) : 0;
                const previewWidth = screen.width * scale;
                const previewHeight = screen.height * scale;
                const isFinalScreen = screen.id === taskProto.end || screen.name.toLowerCase().includes('[final]');
                const screenTimeData = taskScreenTimesMap[screen.id];
                
                return (
                  <div 
                    key={screen.id} 
                    style={{ 
                      flexShrink: 0,
                      cursor: "pointer",
                      transition: "transform 0.2s"
                    }}
                    onClick={() => setSelectedHeatmapScreen({ screen, proto: taskProto, clicks })}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 500, textAlign: "center" }}>
                      {screen.name}
                    </div>
                    <div style={{ 
                      position: "relative", 
                      display: "inline-block", 
                      border: shouldHighlight && taskAbandonedScreens.closedScreens.has(screen.id) 
                        ? "1px solid #f44336" 
                        : shouldHighlight && taskAbandonedScreens.abortedScreens.has(screen.id)
                        ? "1px solid #ff9800"
                        : "2px solid #ddd", 
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
                            const size = Math.max(4, Math.min(20, 4 + (click.count / maxCount) * 16));
                            const sizePercent = (size / screen.width) * 100;
                            return (
                              <div
                                key={idx}
                                style={{
                                  position: "absolute",
                                  left: `${(click.x / screen.width) * 100}%`,
                                  top: `${(click.y / screen.height) * 100}%`,
                                  width: `${sizePercent}%`,
                                  height: `${sizePercent * (screen.width / screen.height)}%`,
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
                      <div style={{ fontSize: 10, color: "#666", marginTop: 4, textAlign: "center" }}>
                        <div>Всего: {formatTime(screenTimeData.totalTime)}</div>
                        <div>Среднее: {formatTime(Math.floor(screenTimeData.totalTime / screenTimeData.visitCount))}</div>
                        <div>Посещений: {screenTimeData.visitCount}</div>
                      </div>
                    )}
                    {clicks.length === 0 && !isFinalScreen && (
                      <div style={{ fontSize: 11, color: "#999", marginTop: 4, textAlign: "center" }}>
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
}

