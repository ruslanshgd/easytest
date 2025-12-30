import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { isValidUUID } from "./utils/validation";

interface AnalyticsProps {
  sessionId: string | null;
}

interface Session {
  id: string;
  started_at?: string; // В БД поле называется started_at
  event_count?: number;
  last_event_at?: string;
  completed?: boolean;
  aborted?: boolean; // Явно указываем, что сессия прервана
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
  timestamp: string; // В БД поле называется timestamp
  x?: number; // Координата X для кликов в пустую область
  y?: number; // Координата Y для кликов в пустую область
}

interface Screen {
  id: string;
  name: string;
  width: number;
  height: number;
  image: string;
}

interface Hotspot {
  id: string;
  name?: string; // Название элемента
  frame: string;
  trigger: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  target: string | null;
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
  screens: Screen[];
  hotspots: Hotspot[];
  edges: Edge[];
  targets: string[];
}

export default function Analytics({ sessionId: propSessionId }: AnalyticsProps) {
  const params = useParams<{ sessionId?: string }>();
  const location = useLocation();
  
  // Приоритет: URL params > state > props > localStorage
  const selectedSessionId = params.sessionId || location.state?.sessionId || propSessionId || null;
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionEvents, setSessionEvents] = useState<Record<string, SessionEvent[]>>({});
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [prototypes, setPrototypes] = useState<Record<string, Proto>>({}); // prototype_id -> Proto
  const [prototypeTaskDescriptions, setPrototypeTaskDescriptions] = useState<Record<string, string | null>>({}); // prototype_id -> task_description
  const [sessionPrototypeIds, setSessionPrototypeIds] = useState<Record<string, string>>({}); // session_id -> prototype_id
  const [heatmapFilterSessions, setHeatmapFilterSessions] = useState<Set<string>>(new Set()); // Фильтр хитмапа по сессиям (множественный выбор) - для глобального хитмапа
  const [taskHeatmapFilterSessions, setTaskHeatmapFilterSessions] = useState<Record<string, Set<string>>>({}); // Фильтр хитмапа по сессиям для каждого task group (prototype_id -> Set<session_id>)
  const [selectedHeatmapScreen, setSelectedHeatmapScreen] = useState<{ screen: Screen; proto: Proto; clicks: Array<{ x: number; y: number; count: number }> } | null>(null); // Выбранный экран для overlay
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<Set<string>>(new Set()); // Раскрытые группы заданий (prototype_id)

  // Функция загрузки всех сессий
  // КРИТИЧНО: Загружаем только сессии для прототипов текущего пользователя
  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    console.log("Analytics: Loading sessions for current user's prototypes");
    
    try {
      // Сначала получаем текущего пользователя
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Analytics: User not authenticated");
        setError("Требуется авторизация");
        setLoading(false);
        return;
      }

      // Загружаем прототипы текущего пользователя
      const { data: userPrototypes, error: prototypesError } = await supabase
        .from("prototypes")
        .select("id")
        .eq("user_id", user.id);

      if (prototypesError) {
        console.error("Analytics: Error loading user prototypes", prototypesError);
        setError(prototypesError.message);
        setLoading(false);
        return;
      }

      if (!userPrototypes || userPrototypes.length === 0) {
        console.log("Analytics: No prototypes found for user");
        setSessions([]);
        setSessionEvents({});
        setLoading(false);
        return;
      }

      const userPrototypeIds = userPrototypes.map(p => p.id);
      console.log("Analytics: Found prototypes for user:", userPrototypeIds.length);

      // Загружаем сессии только для прототипов текущего пользователя
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, started_at, prototype_id, umux_lite_item1, umux_lite_item2, umux_lite_score, umux_lite_sus_score, feedback_text")
        .in("prototype_id", userPrototypeIds)
        .order("started_at", { ascending: false })
        .limit(100);

      if (sessionsError) {
        console.error("Analytics: Error loading sessions", sessionsError);
        setError(sessionsError.message);
        setLoading(false);
        return;
      }

      // Для каждой сессии загружаем количество событий
      const sessionIds = (sessionsData || []).map(s => s.id);
      
      if (sessionIds.length === 0) {
        setSessions([]);
        setSessionEvents({});
        setLoading(false);
        return;
      }

      // Загружаем события (x и y могут отсутствовать в БД, поэтому загружаем все поля)
      const { data: eventsData, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .in("session_id", sessionIds);

      if (eventsError) {
        console.error("Analytics: Error loading events", eventsError);
        setError(eventsError.message);
        setLoading(false);
        return;
      }

      // Группируем события по сессиям
      const eventsBySession: Record<string, SessionEvent[]> = {};
      (eventsData || []).forEach(event => {
        if (!eventsBySession[event.session_id]) {
          eventsBySession[event.session_id] = [];
        }
        eventsBySession[event.session_id].push(event as SessionEvent);
      });

      // Формируем список сессий с метриками
      console.log("Analytics: Processing sessions data", { count: sessionsData?.length, sample: sessionsData?.[0] });
      const sessionsWithMetrics: Session[] = (sessionsData || []).map(session => {
        const events = eventsBySession[session.id] || [];
        // Сортируем события по времени для правильного определения порядка
        const sortedEvents = [...events].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        // Находим индексы ключевых событий
        const completedIndex = sortedEvents.findIndex(e => e.event_type === "completed");
        const abortedIndex = sortedEvents.findIndex(e => e.event_type === "aborted");
        const closedIndex = sortedEvents.findIndex(e => e.event_type === "closed");
        
        // Тест пройден = есть событие completed, и оно произошло после всех aborted
        // Если completed есть, он имеет приоритет даже если после него closed
        const hasCompleted = completedIndex !== -1;
        const hasAborted = abortedIndex !== -1;
        const hasClosed = closedIndex !== -1;
        
        // Определяем статусы с учетом порядка событий ПО ВРЕМЕНИ (timestamp), а не по индексу
        let isCompleted = false;
        let isAborted = false;
        
        if (hasCompleted) {
          // Если есть completed, проверяем порядок с aborted ПО ВРЕМЕНИ
          if (hasAborted) {
            // Находим события completed и aborted для сравнения по времени
            const completedEvent = sortedEvents[completedIndex];
            const abortedEvent = sortedEvents[abortedIndex];
            const completedTime = new Date(completedEvent.timestamp).getTime();
            const abortedTime = new Date(abortedEvent.timestamp).getTime();
            
            // Если completed был ПОСЛЕ aborted по времени - тест пройден
            // Если aborted был после completed - игнорируем aborted (пользователь продолжил и прошел)
            isCompleted = completedTime > abortedTime;
            isAborted = !isCompleted && abortedIndex !== -1;
          } else {
            // Если completed есть и нет aborted - тест пройден
            isCompleted = true;
          }
        } else if (hasAborted) {
          // Если нет completed, но есть aborted - прерван
          isAborted = true;
        } else if (hasClosed) {
          // Если нет completed и aborted, но есть closed - закрыт
          isAborted = true;
        }
        
        const lastEvent = sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1] : null;

        // Конвертируем numeric значения из БД (могут приходить как строки) в числа
        const umuxLiteScore = (session as any).umux_lite_score;
        const umuxLiteSusScore = (session as any).umux_lite_sus_score;
        
        // Функция безопасной конвертации в число
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

      // Сохраняем соответствие session_id -> prototype_id
      const sessionProtoMap: Record<string, string> = {};
      (sessionsData || []).forEach(session => {
        if ((session as any).prototype_id) {
          sessionProtoMap[session.id] = (session as any).prototype_id;
        }
      });
      setSessionPrototypeIds(sessionProtoMap);

      // Загружаем прототипы для всех уникальных prototype_id
      const uniquePrototypeIds = Array.from(new Set(Object.values(sessionProtoMap)));
      if (uniquePrototypeIds.length > 0) {
        await loadPrototypes(uniquePrototypeIds);
      }

      // Если есть selectedSessionId в URL, автоматически раскрываем эту сессию
      if (selectedSessionId && sessionsWithMetrics.some(s => s.id === selectedSessionId)) {
        setExpandedSessions(new Set([selectedSessionId]));
        // Загружаем детали сессии
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .eq("session_id", selectedSessionId)
          .order("timestamp", { ascending: true });
        
        if (!error && data) {
          setSessionEvents(prev => ({
            ...prev,
            [selectedSessionId]: data as SessionEvent[]
          }));
        }
      }
    } catch (err) {
      console.error("Analytics: Unexpected error loading sessions", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Загружаем список всех сессий
  useEffect(() => {
    loadSessions();
  }, [selectedSessionId]);

  // КРИТИЧНО: Отслеживаем изменения авторизации для перезагрузки данных
  // Это позволяет обновлять данные после выхода из аккаунта
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Analytics: Auth state changed, reloading sessions", { hasSession: !!session });
      // Перезагружаем данные при изменении авторизации
      // RLS политики автоматически отфильтруют данные по текущему пользователю
      loadSessions();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Загружаем детали конкретной сессии при раскрытии
  // ВСЕГДА перезагружаем события из БД, чтобы получить актуальные данные
  // (особенно важно при повторном прохождении теста в той же сессии)
  const loadSessionDetails = async (sessionId: string) => {
    // Валидация sessionId перед запросом к БД
    if (!isValidUUID(sessionId)) {
      console.error("Analytics: Invalid sessionId format:", sessionId);
      return;
    }

    console.log("Analytics: Reloading session details for:", sessionId);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("session_id", sessionId)
      .order("timestamp", { ascending: true });

    if (error) {
      console.error("Analytics: Error loading session details", error);
      return;
    }

    // ВСЕГДА обновляем события, даже если они уже были загружены
    // Это гарантирует актуальность данных при повторном прохождении теста
    setSessionEvents(prev => ({
      ...prev,
      [sessionId]: (data || []) as SessionEvent[]
    }));
    
    console.log("Analytics: Session details reloaded, events count:", (data || []).length);
  };

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

  const toggleSelectSession = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedSessions.size === sessions.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(sessions.map(s => s.id)));
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm(`Удалить сессию ${sessionId}?`)) {
      return;
    }

    // Валидация sessionId перед запросом к БД
    if (!isValidUUID(sessionId)) {
      setError("Invalid session ID format");
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      console.log("Deleting session:", sessionId);
      
      // Сначала удаляем события сессии
      const { data: deletedEvents, error: eventsError } = await supabase
        .from("events")
        .delete()
        .eq("session_id", sessionId)
        .select();

      if (eventsError) {
        console.error("Error deleting events:", eventsError);
        setError(`Ошибка удаления событий: ${eventsError.message}`);
        setDeleting(false);
        return;
      }

      console.log("Deleted events:", deletedEvents?.length || 0);

      // КРИТИЧНО: Проверяем, что все события удалены перед удалением сессии
      // Это необходимо из-за foreign key constraint
      const { data: remainingEvents, error: checkError } = await supabase
        .from("events")
        .select("id")
        .eq("session_id", sessionId)
        .limit(1);

      if (checkError) {
        console.error("Error checking remaining events:", checkError);
        setError(`Ошибка проверки событий: ${checkError.message}`);
        setDeleting(false);
        return;
      }

      if (remainingEvents && remainingEvents.length > 0) {
        console.warn("Some events were not deleted due to RLS policies:", remainingEvents.length);
        setError(`ОШИБКА: Не удалось удалить все события (${remainingEvents.length} осталось). Возможно, проблема с правами доступа (RLS политики) в Supabase.`);
        setDeleting(false);
        return;
      }

      // Затем удаляем саму сессию (теперь безопасно, так как все события удалены)
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

      console.log("Deleted session:", deletedSession);

      // Проверяем, что сессия действительно удалена
      if (!deletedSession || deletedSession.length === 0) {
        console.warn("Session deletion returned no data - may not have been deleted");
        // Проверяем, существует ли сессия еще
        const { data: checkSession } = await supabase
          .from("sessions")
          .select("id")
          .eq("id", sessionId)
          .maybeSingle();
        
        if (checkSession) {
          setError("ОШИБКА: Сессия не была удалена. Возможно, проблема с правами доступа (RLS политики) в Supabase. Проверьте настройки RLS для таблиц sessions и events.");
          setDeleting(false);
          return;
        }
      }

      // Перезагружаем список сессий из базы
      await loadSessions();

      // Очищаем состояние выбранных сессий
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

  const deleteSelectedSessions = async () => {
    if (selectedSessions.size === 0) {
      return;
    }

    if (!confirm(`Удалить ${selectedSessions.size} выбранных сессий?`)) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const sessionIds = Array.from(selectedSessions);
      console.log("Deleting selected sessions:", sessionIds);

      // Удаляем события выбранных сессий
      const { data: deletedEvents, error: eventsError } = await supabase
        .from("events")
        .delete()
        .in("session_id", sessionIds)
        .select();

      if (eventsError) {
        console.error("Error deleting events:", eventsError);
        setError(`Ошибка удаления событий: ${eventsError.message}`);
        setDeleting(false);
        return;
      }

      console.log("Deleted events:", deletedEvents?.length || 0);

      // КРИТИЧНО: Проверяем, что все события удалены перед удалением сессий
      // Это необходимо из-за foreign key constraint
      const { data: remainingEvents, error: checkError } = await supabase
        .from("events")
        .select("id, session_id")
        .in("session_id", sessionIds)
        .limit(1);

      if (checkError) {
        console.error("Error checking remaining events:", checkError);
        setError(`Ошибка проверки событий: ${checkError.message}`);
        setDeleting(false);
        return;
      }

      if (remainingEvents && remainingEvents.length > 0) {
        console.warn("Some events were not deleted due to RLS policies:", remainingEvents.length);
        setError(`ОШИБКА: Не удалось удалить все события (${remainingEvents.length} осталось). Возможно, проблема с правами доступа (RLS политики) в Supabase.`);
        setDeleting(false);
        return;
      }

      // Удаляем сессии (теперь безопасно, так как все события удалены)
      const { data: deletedSessions, error: sessionError } = await supabase
        .from("sessions")
        .delete()
        .in("id", sessionIds)
        .select();

      if (sessionError) {
        console.error("Error deleting sessions:", sessionError);
        setError(`Ошибка удаления сессий: ${sessionError.message}`);
        setDeleting(false);
        return;
      }

      console.log("Deleted sessions:", deletedSessions?.length || 0);

      // Проверяем, что сессии действительно удалены
      if (!deletedSessions || deletedSessions.length === 0) {
        console.warn("Sessions deletion returned no data - may not have been deleted");
        // Проверяем, существуют ли сессии еще
        const { data: checkSessions } = await supabase
          .from("sessions")
          .select("id")
          .in("id", sessionIds);
        
        if (checkSessions && checkSessions.length > 0) {
          setError(`ОШИБКА: ${checkSessions.length} сессий не были удалены. Возможно, проблема с правами доступа (RLS политики) в Supabase. Проверьте настройки RLS для таблиц sessions и events.`);
          setDeleting(false);
          return;
        }
      }

      // Перезагружаем список сессий из базы
      await loadSessions();

      // Очищаем состояние выбранных сессий
      setSelectedSessions(new Set());
      setExpandedSessions(prev => {
        const newExpanded = new Set(prev);
        sessionIds.forEach(id => newExpanded.delete(id));
        return newExpanded;
      });
    } catch (err) {
      console.error("Error deleting sessions:", err);
      setError(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  // Функция загрузки прототипов
  // КРИТИЧНО: Загружаем только прототипы текущего пользователя
  const loadPrototypes = async (prototypeIds: string[]) => {
    try {
      // Получаем текущего пользователя
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Analytics: User not authenticated");
        return;
      }

      // Загружаем только прототипы текущего пользователя
      const { data: prototypesData, error: protoError } = await supabase
        .from("prototypes")
        .select("id, data, task_description")
        .in("id", prototypeIds)
        .eq("user_id", user.id);

      if (protoError) {
        console.error("Analytics: Error loading prototypes", protoError);
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
      console.error("Analytics: Unexpected error loading prototypes", err);
    }
  };

  // Функция получения названия экрана по screen_id
  const getScreenName = (sessionId: string, screenId: string | null): string => {
    if (!screenId) return "-";
    
    const prototypeId = sessionPrototypeIds[sessionId];
    if (!prototypeId) return screenId;
    
    const proto = prototypes[prototypeId];
    if (!proto) return screenId;
    
    const screen = proto.screens.find(s => s.id === screenId);
    return screen ? screen.name : screenId;
  };

  // Функция получения названия элемента по hotspot_id
  const getHotspotName = (sessionId: string, hotspotId: string | null, screenId: string | null): string => {
    if (!hotspotId) {
      // Если нет hotspot_id, но есть координаты (клик в пустую область), показываем название экрана
      if (screenId) {
        return getScreenName(sessionId, screenId);
      }
      return "-";
    }
    
    const prototypeId = sessionPrototypeIds[sessionId];
    if (!prototypeId) return hotspotId;
    
    const proto = prototypes[prototypeId];
    if (!proto) return hotspotId;
    
    // Ищем hotspot по id и frame (screen_id)
    const hotspot = proto.hotspots.find(h => 
      h.id === hotspotId && 
      (screenId ? h.frame === screenId : true)
    );
    
    // Возвращаем название элемента, если есть, иначе ID
    return hotspot?.name || hotspotId;
  };

  // Функция группировки кликов по экранам для отображения
  // Группирует клики, которые происходят на одном экране между screen_load событиями
  const groupClicksByScreen = (events: SessionEvent[], sessionId: string): Array<{
    timestamp: string;
    event_type: string;
    screen_id: string | null;
    clicks: string; // Все клики через запятую
    isClickGroup: boolean; // true если это группа кликов, false если отдельное событие
  }> => {
    const result: Array<{
      timestamp: string;
      event_type: string;
      screen_id: string | null;
      clicks: string;
      isClickGroup: boolean;
    }> = [];

    // Сортируем события по времени
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let currentScreenId: string | null = null;
    let currentScreenClicks: SessionEvent[] = [];

    sortedEvents.forEach((event) => {
      // Если это screen_load - сохраняем предыдущие клики (если есть) и начинаем новую группу
      if (event.event_type === "screen_load") {
        // Сохраняем предыдущие клики как группу
        if (currentScreenClicks.length > 0 && currentScreenId) {
          const clicksList = currentScreenClicks.map(click => {
            if (click.hotspot_id) {
              // Клик по hotspot - показываем название элемента
              return getHotspotName(sessionId, click.hotspot_id, click.screen_id);
            } else {
              // Клик в пустую область - показываем название экрана
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

        // Начинаем новый визит экрана
        currentScreenId = event.screen_id;
        
        // Добавляем screen_load как отдельное событие
        result.push({
          timestamp: event.timestamp,
          event_type: event.event_type,
          screen_id: event.screen_id,
          clicks: "-",
          isClickGroup: false
        });
      }
      // Если это клик (hotspot_click или click)
      else if (event.event_type === "hotspot_click" || event.event_type === "click") {
        // Если клик на текущем экране - добавляем в группу
        if (event.screen_id === currentScreenId) {
          currentScreenClicks.push(event);
        } else {
          // Клик на другом экране - сохраняем предыдущие клики (если есть)
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

          // Начинаем новую группу для нового экрана
          currentScreenId = event.screen_id;
          currentScreenClicks = [event];
        }
      }
      // Остальные события (completed, aborted, closed)
      else {
        // Сохраняем предыдущие клики (если есть) перед другим событием
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

        // Добавляем событие как отдельное
        result.push({
          timestamp: event.timestamp,
          event_type: event.event_type,
          screen_id: event.screen_id,
          clicks: getHotspotName(sessionId, event.hotspot_id, event.screen_id),
          isClickGroup: false
        });
      }
    });

    // Сохраняем оставшиеся клики (если есть) в конце
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

  // Функция расчета суммарного времени на каждом экране для конкретного прототипа
  const calculateScreenTimes = (prototypeId?: string): Array<{ screenId: string; screenName: string; totalTime: number; visitCount: number }> => {
    const screenTimesMap: Record<string, { totalTime: number; visitCount: number; prototypeId?: string }> = {};
    
    // Фильтруем сессии по prototypeId, если указан
    const filteredSessions = prototypeId 
      ? sessions.filter(s => sessionPrototypeIds[s.id] === prototypeId)
      : sessions;
    
    // Проходим по отфильтрованным сессиям
    filteredSessions.forEach(session => {
      const events = sessionEvents[session.id] || [];
      const sessionPrototypeId = sessionPrototypeIds[session.id];
      
      // Находим все события screen_load в порядке времени
      const screenLoads = events
        .filter(e => e.event_type === "screen_load" && e.screen_id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      // Для каждого screen_load вычисляем время до следующего события (или до конца сессии)
      screenLoads.forEach((loadEvent, index) => {
        const screenId = loadEvent.screen_id!;
        const loadTime = new Date(loadEvent.timestamp).getTime();
        
        // Ищем следующее screen_load событие
        let endTime: number;
        if (index < screenLoads.length - 1) {
          // Время до следующего screen_load
          endTime = new Date(screenLoads[index + 1].timestamp).getTime();
        } else {
          // Последний screen_load - время до последнего события в сессии
          const lastEvent = events[events.length - 1];
          endTime = lastEvent ? new Date(lastEvent.timestamp).getTime() : loadTime;
        }
        
        const timeSpent = Math.max(0, endTime - loadTime); // в миллисекундах
        
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
    
    // Преобразуем в массив с названиями экранов
    return Object.entries(screenTimesMap).map(([screenId, data]) => {
      let screenName = screenId;
      if (data.prototypeId && prototypes[data.prototypeId]) {
        const screen = prototypes[data.prototypeId].screens.find(s => s.id === screenId);
        if (screen) screenName = screen.name;
      }
      
      return {
        screenId,
        screenName,
        totalTime: data.totalTime, // в миллисекундах
        visitCount: data.visitCount
      };
    }).sort((a, b) => b.totalTime - a.totalTime); // Сортируем по времени (от большего к меньшему)
  };

  // Функция перевода типов событий на русский
  const translateEventType = (eventType: string): string => {
    const translations: Record<string, string> = {
      "screen_load": "Загрузка экрана",
      "hotspot_click": "Клик по области",
      "completed": "Пройден",
      "aborted": "Сдался",
      "closed": "Закрыл тест"
    };
    return translations[eventType] || eventType;
  };

  // Функция группировки сессий по заданиям (prototype_id)
  const groupSessionsByTask = (): Array<{
    prototypeId: string;
    taskDescription: string | null;
    sessions: Session[];
    metrics: {
      total: number;
      completed: number;
      aborted: number;
      closed: number;
      totalAbandoned: number;
      conversionRate: string;
      avgUmuxLite: number | null;
      avgUmuxLiteSus: number | null;
    };
  }> => {
    const groupsMap: Record<string, Session[]> = {};
    
    // Группируем сессии по prototype_id
    sessions.forEach(session => {
      const prototypeId = session.prototype_id || "unknown";
      if (!groupsMap[prototypeId]) {
        groupsMap[prototypeId] = [];
      }
      groupsMap[prototypeId].push(session);
    });

    // Преобразуем в массив с метриками
    return Object.entries(groupsMap).map(([prototypeId, groupSessions]) => {
      const completed = groupSessions.filter(s => s.completed).length;
      // Считаем aborted только для сессий, которые НЕ завершились успешно
      const aborted = groupSessions.filter(s => {
        // Если сессия завершена успешно, не считаем её как aborted
        if (s.completed) {
          return false;
        }
        const events = sessionEvents[s.id] || [];
        return events.some(e => e.event_type === "aborted");
      }).length;
      const closed = groupSessions.filter(s => {
        const events = sessionEvents[s.id] || [];
        return events.some(e => e.event_type === "closed");
      }).length;

      // Расчет среднего UMUX Lite score
      const umuxLiteScores = groupSessions
        .filter(s => s.umux_lite_score !== null && s.umux_lite_score !== undefined)
        .map(s => s.umux_lite_score!);
      const avgUmuxLite = umuxLiteScores.length > 0
        ? umuxLiteScores.reduce((sum, score) => sum + score, 0) / umuxLiteScores.length
        : null;

      // Расчет среднего UMUX Lite SUS score
      const umuxLiteSusScores = groupSessions
        .filter(s => s.umux_lite_sus_score !== null && s.umux_lite_sus_score !== undefined)
        .map(s => s.umux_lite_sus_score!);
      const avgUmuxLiteSus = umuxLiteSusScores.length > 0
        ? umuxLiteSusScores.reduce((sum, score) => sum + score, 0) / umuxLiteSusScores.length
        : null;

      const totalAbandoned = aborted + closed;
      const conversionRate = groupSessions.length > 0 ? ((completed / groupSessions.length) * 100).toFixed(1) : "0";
      
      return {
        prototypeId,
        taskDescription: prototypeTaskDescriptions[prototypeId] || null,
        sessions: groupSessions.sort((a, b) => {
          const dateA = a.started_at ? new Date(a.started_at).getTime() : 0;
          const dateB = b.started_at ? new Date(b.started_at).getTime() : 0;
          return dateB - dateA; // Сортировка по убыванию (новые сверху)
        }),
        metrics: {
          total: groupSessions.length,
          completed,
          aborted,
          closed,
          totalAbandoned,
          conversionRate,
          avgUmuxLite: avgUmuxLite ? Math.round(avgUmuxLite * 100) / 100 : null,
          avgUmuxLiteSus: avgUmuxLiteSus ? Math.round(avgUmuxLiteSus * 100) / 100 : null
        }
      };
    }).sort((a, b) => {
      // Сортировка по дате первой сессии (новые задания сверху)
      const firstSessionA = a.sessions[0];
      const firstSessionB = b.sessions[0];
      const dateA = firstSessionA?.started_at ? new Date(firstSessionA.started_at).getTime() : 0;
      const dateB = firstSessionB?.started_at ? new Date(firstSessionB.started_at).getTime() : 0;
      return dateB - dateA;
    });
  };

  const toggleTaskGroup = (prototypeId: string) => {
    const newExpanded = new Set(expandedTaskGroups);
    if (newExpanded.has(prototypeId)) {
      newExpanded.delete(prototypeId);
    } else {
      newExpanded.add(prototypeId);
    }
    setExpandedTaskGroups(newExpanded);
  };

  const deleteAllSessions = async () => {
    if (!confirm(`Удалить ВСЕ ${sessions.length} сессий? Это действие нельзя отменить!`)) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const allSessionIds = sessions.map(s => s.id);

      if (allSessionIds.length === 0) {
        setDeleting(false);
        return;
      }

      console.log("Deleting all sessions:", allSessionIds.length);

      // Удаляем все события всех сессий
      const { data: deletedEvents, error: eventsError } = await supabase
        .from("events")
        .delete()
        .in("session_id", allSessionIds)
        .select();

      if (eventsError) {
        console.error("Error deleting all events:", eventsError);
        setError(`Ошибка удаления событий: ${eventsError.message}`);
        setDeleting(false);
        return;
      }

      console.log("Deleted events:", deletedEvents?.length || 0);

      // КРИТИЧНО: Проверяем, что все события удалены перед удалением сессий
      // Это необходимо из-за foreign key constraint
      const { data: remainingEvents, error: checkError } = await supabase
        .from("events")
        .select("id, session_id")
        .in("session_id", allSessionIds)
        .limit(1);

      if (checkError) {
        console.error("Error checking remaining events:", checkError);
        setError(`Ошибка проверки событий: ${checkError.message}`);
        setDeleting(false);
        return;
      }

      if (remainingEvents && remainingEvents.length > 0) {
        console.warn("Some events were not deleted due to RLS policies:", remainingEvents.length);
        setError(`ОШИБКА: Не удалось удалить все события (${remainingEvents.length} осталось). Возможно, проблема с правами доступа (RLS политики) в Supabase.`);
        setDeleting(false);
        return;
      }

      // Удаляем все сессии (теперь безопасно, так как все события удалены)
      const { data: deletedSessions, error: sessionError } = await supabase
        .from("sessions")
        .delete()
        .in("id", allSessionIds)
        .select();

      if (sessionError) {
        console.error("Error deleting all sessions:", sessionError);
        setError(`Ошибка удаления сессий: ${sessionError.message}`);
        setDeleting(false);
        return;
      }

      console.log("Deleted sessions:", deletedSessions?.length || 0);

      // Проверяем, что сессии действительно удалены
      if (!deletedSessions || deletedSessions.length === 0) {
        console.warn("Sessions deletion returned no data - may not have been deleted");
        // Проверяем, существуют ли сессии еще
        const { data: checkSessions } = await supabase
          .from("sessions")
          .select("id")
          .in("id", allSessionIds);
        
        if (checkSessions && checkSessions.length > 0) {
          setError(`ОШИБКА: ${checkSessions.length} сессий не были удалены. Возможно, проблема с правами доступа (RLS политики) в Supabase. Проверьте настройки RLS для таблиц sessions и events.`);
          setDeleting(false);
          return;
        }
      }

      // Перезагружаем список сессий из базы
      await loadSessions();

      // Очищаем состояние
      setSelectedSessions(new Set());
      setExpandedSessions(new Set());
    } catch (err) {
      console.error("Error deleting all sessions:", err);
      setError(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  const containerStyle = {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "100vh",
    background: "#f5f5f7",
    padding: 20,
    width: "100%",
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
        <h2>Аналитика сессий</h2>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <h2>Аналитика сессий</h2>
        <p style={{ color: "red" }}>Ошибка: {error}</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={containerStyle}>
        <h2>Аналитика сессий</h2>
        <p>Сессии не найдены.</p>
      </div>
    );
  }

  // Расчет общей статистики (только для заголовка)
  const totalSessions = sessions.length;
  
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

  // Функция определения экранов, на которых произошли события "aborted" или "closed"
  // Показывает только последний экран, где произошло последнее событие "aborted", "completed" или "closed"
  // КРИТИЧНО: Для каждой сессии показывается только ОДИН экран - экран последнего события
  const getAbandonedScreens = (sessionIdFilters?: Set<string>, prototypeId?: string): { closedScreens: Set<string>; abortedScreens: Set<string> } => {
    const closedScreenIds = new Set<string>();
    const abortedScreenIds = new Set<string>();
    
    // Фильтруем сессии по prototypeId если указан, иначе по sessionIdFilters
    let filteredSessions = sessions;
    if (prototypeId) {
      filteredSessions = sessions.filter(s => sessionPrototypeIds[s.id] === prototypeId);
      // Если есть sessionIdFilters, дополнительно фильтруем по ним
      if (sessionIdFilters && sessionIdFilters.size > 0) {
        filteredSessions = filteredSessions.filter(s => sessionIdFilters.has(s.id));
      }
    } else if (sessionIdFilters && sessionIdFilters.size > 0) {
      filteredSessions = sessions.filter(s => sessionIdFilters.has(s.id));
    }
    
    console.log("getAbandonedScreens: filteredSessions", filteredSessions.map(s => s.id), "sessionIdFilters", sessionIdFilters, "prototypeId", prototypeId);
    
    filteredSessions.forEach(session => {
      const events = sessionEvents[session.id] || [];
      
      // Фильтруем только события completed, aborted, closed с screen_id
      const relevantEvents = events.filter(e => 
        (e.event_type === "completed" || e.event_type === "aborted" || e.event_type === "closed") 
        && e.screen_id
      );
      
      if (relevantEvents.length === 0) {
        return;
      }
      
      // Сортируем события по timestamp (от старых к новым)
      const sortedEvents = [...relevantEvents].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Находим последнее событие (самое новое по timestamp)
      const lastEvent = sortedEvents[sortedEvents.length - 1];
      
      console.log("getAbandonedScreens: session", session.id, "lastEvent", lastEvent.event_type, "screen_id", lastEvent.screen_id, "all relevant events", sortedEvents.map(e => `${e.event_type}:${e.screen_id}`));
      
      // Показываем только экран последнего события
      // Приоритет: completed > aborted > closed (уже учтен порядком событий)
      // КРИТИЧНО: Для каждой сессии добавляется только ОДИН экран
      if (lastEvent.screen_id) {
        if (lastEvent.event_type === "completed") {
          // Если тест завершен успешно, не показываем экраны aborted/closed
          // (можно добавить отдельную логику для completed, если нужно)
        } else if (lastEvent.event_type === "aborted") {
          // Показываем только последний экран, где произошло событие "aborted"
          abortedScreenIds.add(lastEvent.screen_id);
          console.log("getAbandonedScreens: added aborted screen", lastEvent.screen_id, "for session", session.id);
        } else if (lastEvent.event_type === "closed") {
          // Показываем только последний экран, где произошло событие "closed"
          closedScreenIds.add(lastEvent.screen_id);
          console.log("getAbandonedScreens: added closed screen", lastEvent.screen_id, "for session", session.id);
        }
      }
    });
    
    console.log("getAbandonedScreens: result", { closedScreens: Array.from(closedScreenIds), abortedScreens: Array.from(abortedScreenIds) });
    
    return { closedScreens: closedScreenIds, abortedScreens: abortedScreenIds };
  };

  // Функция расчета хитмапа кликов по экранам
  const calculateHeatmapData = (sessionIdFilters?: Set<string>, prototypeId?: string): Record<string, Array<{ x: number; y: number; count: number }>> => {
    const heatmapMap: Record<string, Record<string, { x: number; y: number; count: number }>> = {};
    
    // Фильтруем сессии по prototypeId если указан, иначе по sessionIdFilters
    // КРИТИЧНО: Если указаны sessionIdFilters, они имеют приоритет - фильтруем только по ним
    let filteredSessions = sessions;
    if (sessionIdFilters && sessionIdFilters.size > 0) {
      // КРИТИЧНО: Если есть фильтр по сессиям, используем только его
      filteredSessions = sessions.filter(s => sessionIdFilters.has(s.id));
      // Если также указан prototypeId, дополнительно фильтруем по нему
      if (prototypeId) {
        filteredSessions = filteredSessions.filter(s => sessionPrototypeIds[s.id] === prototypeId);
      }
    } else if (prototypeId) {
      // Если нет фильтра по сессиям, но есть prototypeId - фильтруем по нему
      filteredSessions = sessions.filter(s => sessionPrototypeIds[s.id] === prototypeId);
    }
    
    filteredSessions.forEach(session => {
      const events = sessionEvents[session.id] || [];
      const prototypeId = sessionPrototypeIds[session.id];
      
      if (!prototypeId || !prototypes[prototypeId]) return;
      
      const proto = prototypes[prototypeId];
      
      // Находим все hotspot_click события (клики по хотспотам)
      const hotspotClickEvents = events.filter(e => e.event_type === "hotspot_click" && e.hotspot_id && e.screen_id);
      
      hotspotClickEvents.forEach(clickEvent => {
        const screenId = clickEvent.screen_id!;
        const eventData = clickEvent as any;
        
        // Используем реальные координаты клика, если они есть, иначе центр hotspot
        let x: number;
        let y: number;
        
        if (eventData.x !== undefined && eventData.y !== undefined) {
          // Используем реальные координаты клика
          x = eventData.x;
          y = eventData.y;
        } else {
          // Fallback: используем центр hotspot
          const hotspotId = clickEvent.hotspot_id!;
          const hotspot = proto.hotspots.find(h => h.id === hotspotId && h.frame === screenId);
          if (!hotspot) return;
          x = hotspot.x + hotspot.w / 2;
          y = hotspot.y + hotspot.h / 2;
        }
        
        // Инициализируем структуру для экрана
        if (!heatmapMap[screenId]) {
          heatmapMap[screenId] = {};
        }
        
        // Округляем координаты для группировки близких кликов
        const roundedX = Math.round(x / 10) * 10;
        const roundedY = Math.round(y / 10) * 10;
        const key = `${roundedX},${roundedY}`;
        
        if (!heatmapMap[screenId][key]) {
          heatmapMap[screenId][key] = { x: roundedX, y: roundedY, count: 0 };
        }
        
        heatmapMap[screenId][key].count += 1;
      });
      
      // Находим все click события (клики в пустую область - с screen_id, но без hotspot_id)
      const emptyAreaClickEvents = events.filter(e => 
        e.event_type === "click" && 
        e.screen_id && 
        !e.hotspot_id
      );
      
      emptyAreaClickEvents.forEach(clickEvent => {
        const screenId = clickEvent.screen_id!;
        
        // Для кликов в пустую область координаты должны быть в дополнительных полях
        // Если их нет, пропускаем (они будут добавлены в TestView)
        const eventData = clickEvent as any;
        if (eventData.x !== undefined && eventData.y !== undefined) {
          const x = eventData.x;
          const y = eventData.y;
          
          // Инициализируем структуру для экрана
          if (!heatmapMap[screenId]) {
            heatmapMap[screenId] = {};
          }
          
          // Округляем координаты для группировки близких кликов
          const roundedX = Math.round(x / 10) * 10;
          const roundedY = Math.round(y / 10) * 10;
          const key = `${roundedX},${roundedY}`;
          
          if (!heatmapMap[screenId][key]) {
            heatmapMap[screenId][key] = { x: roundedX, y: roundedY, count: 0 };
          }
          
          heatmapMap[screenId][key].count += 1;
        }
      });
    });
    
    // Преобразуем в массив для каждого экрана
    const result: Record<string, Array<{ x: number; y: number; count: number }>> = {};
    Object.keys(heatmapMap).forEach(screenId => {
      result[screenId] = Object.values(heatmapMap[screenId]);
    });
    
    return result;
  };

  return (
    <div style={containerStyle}>
      {/* Блок "Аналитика сессий" */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Аналитика сессий</h2>
          <p style={{ color: "#666", marginTop: 4 }}>
            Найдено сессий: {totalSessions}
            {selectedSessions.size > 0 && ` | Выбрано: ${selectedSessions.size}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={deleteSelectedSessions}
            disabled={selectedSessions.size === 0 || deleting}
            style={{
              padding: "8px 16px",
              background: selectedSessions.size === 0 ? "#ccc" : "#f44336",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: selectedSessions.size === 0 ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: "bold"
            }}
          >
            Удалить выбранные ({selectedSessions.size})
          </button>
          <button
            onClick={deleteAllSessions}
            disabled={sessions.length === 0 || deleting}
            style={{
              padding: "8px 16px",
              background: sessions.length === 0 ? "#ccc" : "#d32f2f",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: sessions.length === 0 ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: "bold"
            }}
          >
            Удалить все
          </button>
        </div>
      </div>

      {deleting && (
        <div style={{ 
          padding: 12, 
          background: "#fff3cd", 
          borderRadius: 4, 
          marginBottom: 16,
          color: "#856404"
        }}>
          Удаление...
        </div>
      )}

      {/* Хитмап кликов (глобальный - удаляется, будет внутри task groups) */}
      {false && Object.keys(prototypes).length > 0 && (
        <div style={{
          background: "#ffffff",
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
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
                    if (heatmapFilterSessions.size === sessions.length) {
                      setHeatmapFilterSessions(new Set());
                    } else {
                      setHeatmapFilterSessions(new Set(sessions.map(s => s.id)));
                    }
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid #ddd",
                    fontSize: 11,
                    cursor: "pointer",
                    background: heatmapFilterSessions.size === sessions.length ? "#2196f3" : "white",
                    color: heatmapFilterSessions.size === sessions.length ? "white" : "#333"
                  }}
                >
                  {heatmapFilterSessions.size === sessions.length ? "Снять все" : "Выбрать все"}
                </button>
                {sessions.map(session => {
                  const isSelected = heatmapFilterSessions.has(session.id);
                  const events = sessionEvents[session.id] || [];
                  const hasClosed = events.some(e => e.event_type === "closed");
                  const hasAborted = events.some(e => e.event_type === "aborted");
                  // Определяем иконку в зависимости от статуса сессии
                  let icon = "○"; // В процессе
                  if (session.completed) {
                    icon = "✓"; // Пройдена
                  } else if (hasClosed) {
                    icon = "!"; // Закрыл окно
                  } else if (hasAborted) {
                    icon = "✗"; // Сдался
                  }
                  return (
                    <button
                      key={session.id}
                      onClick={() => {
                        const newFilter = new Set(heatmapFilterSessions);
                        if (isSelected) {
                          newFilter.delete(session.id);
                        } else {
                          newFilter.add(session.id);
                        }
                        setHeatmapFilterSessions(newFilter);
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
              {heatmapFilterSessions.size > 0 && (
                <span style={{ fontSize: 11, color: "#666" }}>
                  Выбрано: {heatmapFilterSessions.size} из {sessions.length}
                </span>
              )}
            </div>
          </div>
          {(() => {
            const heatmapData = calculateHeatmapData(heatmapFilterSessions.size > 0 ? heatmapFilterSessions : undefined, undefined);
            // Подсвечиваем экраны только если выбрана ОДНА конкретная сессия (не все и не несколько)
            const abandonedScreens = heatmapFilterSessions.size === 1
              ? getAbandonedScreens(heatmapFilterSessions, undefined)
              : { closedScreens: new Set<string>(), abortedScreens: new Set<string>() };
            // Собираем ТОЛЬКО уникальные экраны (screens) из прототипов, НЕ hotspots
            // Используем Map для устранения дубликатов по screen.id
            const screensMap = new Map<string, { screen: Screen; proto: Proto }>();
            
            Object.values(prototypes).forEach(proto => {
              // Собираем все screen IDs, которые реально участвуют в flow
              // Экраны прототипа - это те, которые являются start, end или участвуют в edges
              const validScreenIds = new Set<string>();
              
              if (proto.start) validScreenIds.add(proto.start);
              if (proto.end) validScreenIds.add(proto.end);
              
              // Добавляем все screen IDs, которые встречаются в edges
              (proto.edges || []).forEach(edge => {
                validScreenIds.add(edge.from);
                validScreenIds.add(edge.to);
              });
              
              proto.screens.forEach(screen => {
                // Включаем только те screens, которые реально участвуют в flow прототипа
                // Это исключает элементы типа Frame 4, Frame 5, которые являются hotspots внутри других экранов
                if (validScreenIds.has(screen.id)) {
                  // Добавляем только если экран еще не был добавлен (уникальность по screen.id)
                  if (!screensMap.has(screen.id)) {
                    screensMap.set(screen.id, { screen, proto });
                  }
                }
              });
            });
            
            // Преобразуем Map в массив
            const allScreens = Array.from(screensMap.values());
            
            // Сортируем экраны по порядку flow: от start до end
            allScreens.sort((a, b) => {
              const proto = a.proto;
              if (!proto.start || !proto.end) return 0;
              
              // Если один из них start - он первый
              if (a.screen.id === proto.start) return -1;
              if (b.screen.id === proto.start) return 1;
              
              // Если один из них end - он последний
              if (a.screen.id === proto.end) return 1;
              if (b.screen.id === proto.end) return -1;
              
              // Строим путь от start к end используя edges
              const buildPath = (startId: string, endId: string, edges: Edge[]): string[] => {
                const path: string[] = [startId];
                const visited = new Set<string>([startId]);
                
                let current = startId;
                while (current !== endId && path.length < proto.screens.length) {
                  const edge = edges.find(e => e.from === current && !visited.has(e.to));
                  if (!edge) break;
                  path.push(edge.to);
                  visited.add(edge.to);
                  current = edge.to;
                }
                
                return path;
              };
              
              const path = buildPath(proto.start, proto.end, proto.edges || []);
              const indexA = path.indexOf(a.screen.id);
              const indexB = path.indexOf(b.screen.id);
              
              // Если оба в пути - сортируем по позиции в пути
              if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB;
              }
              
              // Если один в пути - он раньше
              if (indexA !== -1) return -1;
              if (indexB !== -1) return 1;
              
              // Иначе сохраняем исходный порядок
              return 0;
            });
            
            if (allScreens.length === 0) return null;
            
            // Вычисляем размер для экранов (уменьшаем в 2 раза, если не помещается - еще меньше)
            const containerWidth = 1104 - 40 - 32; // минус padding контейнера и padding блока
            const minScreenWidth = 150; // минимальная ширина экрана в превью
            const screenCount = allScreens.length;
            const gapSize = 16;
            const availableWidth = containerWidth - (screenCount - 1) * gapSize; // минус gaps
            const baseWidth = availableWidth / screenCount;
            const scale = baseWidth < minScreenWidth ? baseWidth / Math.max(...allScreens.map(s => s.screen.width)) : 0.5; // если меньше минимума - масштабируем по ширине
            
            return (
              <div style={{ 
                display: "flex", 
                gap: gapSize, 
                overflowX: "auto",
                paddingBottom: 8
              }}>
                {allScreens.map(({ screen, proto }) => {
                  const clicks = heatmapData[screen.id] || [];
                  const maxCount = clicks.length > 0 ? Math.max(...clicks.map(c => c.count)) : 0;
                  const previewWidth = screen.width * scale;
                  const previewHeight = screen.height * scale;
                  
                  return (
                    <div 
                      key={screen.id} 
                      style={{ 
                        flexShrink: 0,
                        cursor: "pointer",
                        transition: "transform 0.2s"
                      }}
                      onClick={() => setSelectedHeatmapScreen({ screen, proto, clicks })}
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
                        border: abandonedScreens.closedScreens.has(screen.id) 
                          ? "1px solid #f44336" 
                          : abandonedScreens.abortedScreens.has(screen.id)
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
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    position: "absolute",
                                    left: `${(click.x / screen.width) * 100}%`,
                                    top: `${(click.y / screen.height) * 100}%`,
                                    width: `${(size / screen.width) * 100}%`,
                                    height: `${(size / screen.height) * 100}%`,
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
                      {clicks.length === 0 && (
                        <div style={{ fontSize: 11, color: "#999", marginTop: 4, textAlign: "center" }}>
                          Нет кликов
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Overlay для детального просмотра экрана */}
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
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20
          }}
          onClick={() => setSelectedHeatmapScreen(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 8,
              padding: 20,
              maxWidth: "90vw",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedHeatmapScreen(null)}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "#f44336",
                color: "white",
                border: "none",
                borderRadius: 4,
                width: 32,
                height: 32,
                fontSize: 18,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              ×
            </button>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>{selectedHeatmapScreen.screen.name}</h3>
            <div style={{ position: "relative", display: "inline-block", border: "1px solid #ddd", borderRadius: 4 }}>
              <img 
                src={selectedHeatmapScreen.screen.image} 
                alt={selectedHeatmapScreen.screen.name}
                style={{ display: "block", maxWidth: "100%", height: "auto" }}
              />
              {selectedHeatmapScreen.clicks.length > 0 && (() => {
                const maxCount = Math.max(...selectedHeatmapScreen.clicks.map(c => c.count));
                return (
                  <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
                    {selectedHeatmapScreen.clicks.map((click, idx) => {
                      const opacity = maxCount > 0 ? Math.min(0.8, 0.3 + (click.count / maxCount) * 0.5) : 0.5;
                      const size = Math.max(8, Math.min(40, 8 + (click.count / maxCount) * 32));
                      return (
                        <div
                          key={idx}
                          style={{
                            position: "absolute",
                            left: `${(click.x / selectedHeatmapScreen.screen.width) * 100}%`,
                            top: `${(click.y / selectedHeatmapScreen.screen.height) * 100}%`,
                            width: `${(size / selectedHeatmapScreen.screen.width) * 100}%`,
                            height: `${(size / selectedHeatmapScreen.screen.height) * 100}%`,
                            borderRadius: "50%",
                            background: `rgba(255, 0, 0, ${opacity})`,
                            transform: "translate(-50%, -50%)",
                            pointerEvents: "none",
                            border: "2px solid rgba(255, 255, 255, 0.8)",
                            boxShadow: "0 0 4px rgba(0,0,0,0.3)"
                          }}
                          title={`${click.count} клик${click.count > 1 ? "ов" : ""}`}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {selectedHeatmapScreen.clicks.length === 0 && (
              <div style={{ fontSize: 14, color: "#999", marginTop: 12, textAlign: "center" }}>
                Нет кликов на этом экране
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        marginBottom: 12, 
        padding: "8px 16px",
        background: "#ffffff",
        borderRadius: 8,
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <input
          type="checkbox"
          checked={selectedSessions.size === sessions.length && sessions.length > 0}
          onChange={toggleSelectAll}
          style={{ marginRight: 12, cursor: "pointer" }}
        />
        <span style={{ fontSize: 14, fontWeight: "bold" }}>
          {selectedSessions.size === sessions.length && sessions.length > 0 ? "Снять все" : "Выбрать все"}
        </span>
      </div>

      {/* Группировка сессий по заданиям */}
      {groupSessionsByTask().map(taskGroup => {
        const isGroupExpanded = expandedTaskGroups.has(taskGroup.prototypeId);
        
        return (
          <div
            key={taskGroup.prototypeId}
            style={{
              background: "#ffffff",
              borderRadius: 8,
              padding: 16,
              marginBottom: 20,
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}
          >
            {/* Заголовок группы заданий */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                cursor: "pointer",
                marginBottom: isGroupExpanded ? 16 : 0
              }}
              onClick={() => toggleTaskGroup(taskGroup.prototypeId)}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 600, color: "#333" }}>
                  {taskGroup.taskDescription || `Задание ${taskGroup.prototypeId.substring(0, 8)}...`}
                </h3>
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", 
                  gap: 12,
                  fontSize: 12,
                  color: "#666"
                }}>
                  <div>
                    <span style={{ color: "#999" }}>Запущено: </span>
                    <span style={{ fontWeight: "bold" }}>{taskGroup.metrics.total}</span>
                  </div>
                  <div>
                    <span style={{ color: "#999" }}>Пройдено: </span>
                    <span style={{ fontWeight: "bold", color: "#4caf50" }}>{taskGroup.metrics.completed}</span>
                  </div>
                  <div>
                    <span style={{ color: "#999" }}>Прервано (сдался): </span>
                    <span style={{ fontWeight: "bold", color: "#ff9800" }}>{taskGroup.metrics.aborted}</span>
                  </div>
                  <div>
                    <span style={{ color: "#999" }}>Закрыто: </span>
                    <span style={{ fontWeight: "bold", color: "#f44336" }}>{taskGroup.metrics.closed}</span>
                  </div>
                  <div>
                    <span style={{ color: "#999" }}>Всего брошено: </span>
                    <span style={{ fontWeight: "bold", color: "#ff5722" }}>{taskGroup.metrics.totalAbandoned}</span>
                  </div>
                  <div>
                    <span style={{ color: "#999" }}>Конверсия: </span>
                    <span style={{ fontWeight: "bold", color: "#2196f3" }}>{taskGroup.metrics.conversionRate}%</span>
                  </div>
                  {taskGroup.metrics.avgUmuxLite !== null && taskGroup.metrics.avgUmuxLite !== undefined && (
                    <div>
                      <span style={{ color: "#999" }}>UMUX Lite (среднее): </span>
                      <span style={{ fontWeight: "bold", color: "#9c27b0" }}>
                        {taskGroup.metrics.avgUmuxLite.toFixed(1)}
                        {taskGroup.metrics.avgUmuxLiteSus !== null && taskGroup.metrics.avgUmuxLiteSus !== undefined && (
                          <span style={{ fontSize: 11, color: "#999", marginLeft: 4 }}>
                            (SUS: {taskGroup.metrics.avgUmuxLiteSus.toFixed(1)})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 18, marginLeft: 16, color: "#666" }}>
                {isGroupExpanded ? "▼" : "▶"}
              </span>
            </div>

            {/* Список сессий в группе */}
            {isGroupExpanded && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
                {taskGroup.sessions.map(session => {
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
                                            groupedEvent.event_type === "closed" ? "#f44336" :
                                            groupedEvent.event_type === "aborted" ? "#ff9800" : "#ff9800",
                                  color: "white",
                                  fontSize: 11
                                }}>
                                  {groupedEvent.event_type === "clicks" ? "Клики" : translateEventType(groupedEvent.event_type)}
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

                {/* Хитмап кликов для этого задания */}
                {(() => {
                  const taskProto = prototypes[taskGroup.prototypeId];
                  if (!taskProto) return null;
                  
                  // Получаем фильтр сессий для этого task group
                  const taskFilterSessions = taskHeatmapFilterSessions[taskGroup.prototypeId] || new Set<string>();
                  const taskSessions = taskGroup.sessions;
                  const taskSessionIds = new Set(taskSessions.map(s => s.id));
                  
                  // Используем фильтр только если он не пустой, иначе все сессии
                  const filteredTaskSessionIds = taskFilterSessions.size > 0 ? taskFilterSessions : taskSessionIds;
                  const taskHeatmapData = calculateHeatmapData(filteredTaskSessionIds, taskGroup.prototypeId);
                  
                  // Подсвечиваем экраны только если выбрана ОДНА конкретная сессия (не все и не несколько)
                  const shouldHighlight = taskFilterSessions.size === 1;
                  const taskAbandonedScreens = shouldHighlight 
                    ? getAbandonedScreens(taskFilterSessions, taskGroup.prototypeId)
                    : { closedScreens: new Set<string>(), abortedScreens: new Set<string>() };
                  
                  // Собираем уникальные экраны из этого прототипа
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
                  
                  // Сортируем экраны по порядку flow
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
                  
                  // Получаем время на экранах для этого задания
                  const taskScreenTimesMap = calculateScreenTimes(taskGroup.prototypeId).reduce((acc, st) => {
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
                                const newFilters = { ...taskHeatmapFilterSessions };
                                if (taskFilterSessions.size === taskSessions.length) {
                                  delete newFilters[taskGroup.prototypeId];
                                  setTaskHeatmapFilterSessions(newFilters);
                                } else {
                                  newFilters[taskGroup.prototypeId] = new Set(taskSessionIds);
                                  setTaskHeatmapFilterSessions(newFilters);
                                }
                              }}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 4,
                                border: "1px solid #ddd",
                                fontSize: 11,
                                cursor: "pointer",
                                background: taskFilterSessions.size === taskSessions.length ? "#2196f3" : "white",
                                color: taskFilterSessions.size === taskSessions.length ? "white" : "#333"
                              }}
                            >
                              {taskFilterSessions.size === taskSessions.length ? "Снять все" : "Выбрать все"}
                            </button>
                            {taskSessions.map(session => {
                              const isSelected = taskFilterSessions.has(session.id);
                              const events = sessionEvents[session.id] || [];
                              const hasClosed = events.some(e => e.event_type === "closed");
                              const hasAborted = events.some(e => e.event_type === "aborted");
                              // Определяем иконку в зависимости от статуса сессии
                              let icon = "○"; // В процессе
                              if (session.completed) {
                                icon = "✓"; // Пройдена
                              } else if (hasClosed) {
                                icon = "!"; // Закрыл окно
                              } else if (hasAborted) {
                                icon = "✗"; // Сдался
                              }
                              return (
                                <button
                                  key={session.id}
                                  onClick={() => {
                                    const newFilters = { ...taskHeatmapFilterSessions };
                                    if (!newFilters[taskGroup.prototypeId]) {
                                      newFilters[taskGroup.prototypeId] = new Set();
                                    }
                                    const newFilter = new Set(newFilters[taskGroup.prototypeId]);
                                    if (isSelected) {
                                      newFilter.delete(session.id);
                                    } else {
                                      newFilter.add(session.id);
                                    }
                                    if (newFilter.size === 0) {
                                      delete newFilters[taskGroup.prototypeId];
                                    } else {
                                      newFilters[taskGroup.prototypeId] = newFilter;
                                    }
                                    setTaskHeatmapFilterSessions(newFilters);
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
                          {taskFilterSessions.size > 0 && (
                            <span style={{ fontSize: 11, color: "#666" }}>
                              Выбрано: {taskFilterSessions.size} из {taskSessions.length}
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
                                      return (
                                        <div
                                          key={idx}
                                          style={{
                                            position: "absolute",
                                            left: `${(click.x / screen.width) * 100}%`,
                                            top: `${(click.y / screen.height) * 100}%`,
                                            width: `${(size / screen.width) * 100}%`,
                                            height: `${(size / screen.height) * 100}%`,
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
                              {/* Время на экранах под каждым экраном */}
                              {screenTimeData && (
                                <div style={{ fontSize: 10, color: "#666", marginTop: 4, textAlign: "center" }}>
                                  <div>Всего: {formatTime(screenTimeData.totalTime)}</div>
                                  <div>Среднее: {formatTime(Math.floor(screenTimeData.totalTime / screenTimeData.visitCount))}</div>
                                  <div>Посещений: {screenTimeData.visitCount}</div>
                                </div>
                              )}
                              {/* Показываем "нет кликов" только для нефинальных экранов */}
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
            )}
          </div>
        );
      })}
    </div>
  );
}
