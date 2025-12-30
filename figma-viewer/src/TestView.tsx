import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabaseClient";
import { validateUUID } from "./utils/validation";

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

interface Proto {
  protoVersion: string;
  start: string;
  end: string;
  screens: Screen[];
  hotspots: Hotspot[];
  edges: any[];
  targets: string[];
}

interface TestViewProps {
  sessionId: string | null;
}

export default function TestView({ sessionId: propSessionId }: TestViewProps) {
  const navigate = useNavigate();
  const params = useParams<{ prototypeId?: string; sessionId?: string }>();
  
  const [proto, setProto] = useState<Proto | null>(null);
  const [currentScreen, setCurrentScreen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskDescription, setTaskDescription] = useState<string | null>(null);
  const [actualSessionId, setActualSessionId] = useState<string | null>(propSessionId);
  
  const loadedSessionId = useRef<string | null>(null);
  const hasRecordedClosed = useRef<boolean>(false);
  const testCompleted = useRef<boolean>(false);

  // Определяем prototypeId из URL
  const urlPrototypeId = params.prototypeId || null;
  
  // Используем актуальный sessionId (из props или из state)
  const sessionId = actualSessionId || propSessionId;

  // Загружаем прототип из Supabase по sessionId или prototypeId
  // КРИТИЧНО: Прототип должен быть доступен всегда, независимо от авторизации
  // Приоритет: urlPrototypeId > sessionId (прототип всегда доступен по URL)
  useEffect(() => {
    // КРИТИЧНО: Если есть urlPrototypeId в URL, прототип должен быть доступен всегда
    // Это гарантирует, что прототип доступен даже после выхода или в инкогнито
    if (urlPrototypeId) {
      // Если прототип еще не загружен, загружаем его по urlPrototypeId
      if (!proto && !loading) {
        console.log("TestView: Loading prototype directly from URL prototypeId (always accessible):", urlPrototypeId);
        loadPrototypeByPrototypeId(urlPrototypeId);
        return;
      }
      // Если прототип уже загружен, но был загружен по sessionId (loadedSessionId.current не null),
      // и теперь sessionId стал null (пользователь вышел) - прототип должен оставаться доступным
      if (proto && loadedSessionId.current && !sessionId) {
        console.log("TestView: User signed out, but prototype already loaded - keeping it accessible by urlPrototypeId");
        // Сбрасываем loadedSessionId, чтобы прототип считался загруженным по urlPrototypeId
        loadedSessionId.current = null;
        return;
      }
      // Если прототип уже загружен и sessionId есть - прототип остается доступным
      // Не перезагружаем, если прототип уже загружен
      return;
    }
    
    // Если нет urlPrototypeId, но есть sessionId - загружаем по sessionId
    if (sessionId && sessionId !== loadedSessionId.current) {
      // Сбрасываем состояние при смене sessionId
      setProto(null);
      setCurrentScreen(null);
      setError(null);
      loadedSessionId.current = sessionId;
      loadPrototypeFromSupabase(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, urlPrototypeId, propSessionId, proto, loading]);
  
  // Обновляем actualSessionId когда propSessionId меняется
  // КРИТИЧНО: В инкогнито propSessionId может измениться после загрузки прототипа
  // Поэтому всегда обновляем actualSessionId, даже если прототип уже загружен
  // КРИТИЧНО: При выходе (propSessionId становится null) прототип должен оставаться доступным по urlPrototypeId
  // КРИТИЧНО: Если прототип загружен по urlPrototypeId (loadedSessionId.current === null), НЕ перезагружаем прототип, но обновляем actualSessionId
  useEffect(() => {
    // Если прототип загружен по urlPrototypeId (loadedSessionId.current === null), обновляем actualSessionId, но не перезагружаем прототип
    if (urlPrototypeId && loadedSessionId.current === null) {
      if (propSessionId && propSessionId !== actualSessionId) {
        console.log("TestView: Prototype loaded by urlPrototypeId, updating actualSessionId without reloading:", propSessionId);
        setActualSessionId(propSessionId);
      }
      return;
    }
    
    if (propSessionId && propSessionId !== actualSessionId) {
      console.log("TestView: SessionId updated from props:", propSessionId, "previous:", actualSessionId);
      setActualSessionId(propSessionId);
      // Если прототип уже загружен, но sessionId изменился - перезагружаем прототип с новым sessionId
      // Это особенно важно в инкогнито, где новая сессия создается после загрузки прототипа
      if (proto && propSessionId !== loadedSessionId.current) {
        console.log("TestView: Reloading prototype with new sessionId:", propSessionId);
        loadedSessionId.current = null; // Сбрасываем, чтобы загрузить заново
        // Перезагружаем прототип с новым sessionId
        loadPrototypeFromSupabase(propSessionId);
      }
    } else if (!propSessionId && actualSessionId) {
      // КРИТИЧНО: Когда пользователь выходит (propSessionId становится null),
      // прототип должен оставаться доступным, если есть urlPrototypeId в URL
      console.log("TestView: User signed out (propSessionId became null), updating actualSessionId");
      setActualSessionId(null);
      // Если есть urlPrototypeId в URL, прототип должен оставаться доступным
      // Логика загрузки прототипа по urlPrototypeId обрабатывается в первом useEffect
      // Здесь мы только обновляем actualSessionId
    }
  }, [propSessionId, actualSessionId, proto, urlPrototypeId]);

  async function loadPrototypeFromSupabase(sid: string) {
    setLoading(true);
    setError(null);

    try {
      // Валидация sessionId перед запросом к БД
      validateUUID(sid, "sessionId");

      // 1. Получаем сессию с prototype_id
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("prototype_id")
        .eq("id", sid)
        .maybeSingle();

      if (sessionError) {
        throw new Error(`Ошибка загрузки сессии: ${sessionError.message}`);
      }

      if (!session || !session.prototype_id) {
        setLoading(false);
        return;
      }

      // 2. Получаем прототип по prototype_id (включая task_description)
      const { data: prototype, error: protoError } = await supabase
        .from("prototypes")
        .select("data, task_description")
        .eq("id", session.prototype_id)
        .maybeSingle();

      if (protoError) {
        throw new Error(`Ошибка загрузки прототипа: ${protoError.message}`);
      }

      if (!prototype || !prototype.data) {
        throw new Error("Прототип не найден");
      }

      // 3. Устанавливаем прототип и задание
      const protoData = prototype.data as Proto;
      setProto(protoData);
      setCurrentScreen(protoData.start);
      setTaskDescription(prototype.task_description || null);
      
      // Обновляем actualSessionId, если он изменился
      if (sid !== actualSessionId) {
        setActualSessionId(sid);
      }
      
      // НЕ обновляем URL, чтобы избежать повторного срабатывания useEffect в App.tsx
      // URL уже правильный (с sessionId или prototypeId), не нужно его менять
      // navigate(`/${sid}`, { replace: true });
      try {
        localStorage.setItem("figmaTest_sessionId", sid);
      } catch (e) {
        console.warn("TestView: localStorage not available:", e);
      }

    } catch (err) {
      console.error("Error loading prototype from Supabase:", err);
      setError(err instanceof Error ? err.message : "Ошибка загрузки прототипа");
    } finally {
      setLoading(false);
    }
  }

  // Загружаем прототип напрямую по prototypeId (когда sessionId еще не создан или пользователь вышел)
  // КРИТИЧНО: Эта функция должна работать БЕЗ авторизации - прототип доступен всем
  async function loadPrototypeByPrototypeId(prototypeId: string) {
    setLoading(true);
    setError(null);

    try {
      // Валидация prototypeId перед запросом к БД
      validateUUID(prototypeId, "prototypeId");

      console.log("TestView: Loading prototype directly by prototypeId (always accessible):", prototypeId);

      // Получаем прототип по prototype_id (включая task_description)
      // КРИТИЧНО: Этот запрос должен работать БЕЗ авторизации (RLS политики должны разрешать чтение для всех)
      const { data: prototype, error: protoError } = await supabase
        .from("prototypes")
        .select("data, task_description")
        .eq("id", prototypeId)
        .maybeSingle();

      if (protoError) {
        console.error("TestView: Error loading prototype by prototypeId:", protoError);
        // Если ошибка связана с авторизацией, это проблема RLS политик
        if (protoError.message.includes("permission") || protoError.message.includes("policy")) {
          throw new Error(`Прототип недоступен: проверьте настройки доступа. Ошибка: ${protoError.message}`);
        }
        throw new Error(`Ошибка загрузки прототипа: ${protoError.message}`);
      }

      if (!prototype || !prototype.data) {
        throw new Error("Прототип не найден");
      }

      // Устанавливаем прототип и задание
      const protoData = prototype.data as Proto;
      
      // КРИТИЧНО: Проверяем, что start существует в screens
      const startScreen = protoData.screens.find(s => s.id === protoData.start);
      if (!startScreen) {
        console.error("TestView: Start screen not found in prototype screens", {
          start: protoData.start,
          availableScreens: protoData.screens.map(s => ({ id: s.id, name: s.name }))
        });
        throw new Error(`Стартовый экран не найден в прототипе. ID: ${protoData.start}`);
      }
      
      console.log("TestView: Setting prototype and start screen", {
        start: protoData.start,
        startScreenName: startScreen.name,
        totalScreens: protoData.screens.length,
        screenIds: protoData.screens.map(s => s.id)
      });
      
      setProto(protoData);
      setCurrentScreen(protoData.start);
      setTaskDescription(prototype.task_description || null);
      
      // Сбрасываем loadedSessionId, чтобы прототип считался загруженным по urlPrototypeId
      loadedSessionId.current = null;
      
      console.log("TestView: Prototype loaded successfully by prototypeId (always accessible)", {
        currentScreen: protoData.start,
        protoSet: true
      });

    } catch (err) {
      console.error("Error loading prototype by prototypeId:", err);
      setError(err instanceof Error ? err.message : "Ошибка загрузки прототипа");
    } finally {
      setLoading(false);
    }
  }


  async function recordEvent(type: string, screen: string | null, hotspot: string | null = null, useBeacon: boolean = false, x?: number, y?: number) {
    // Используем актуальный sessionId из state
    const currentSessionId = actualSessionId || propSessionId;
    if (!currentSessionId) {
      console.warn("TestView: Cannot record event, sessionId is null");
      return;
    }
    // Не записываем новые события после завершения теста (кроме closed и completed)
    if (testCompleted.current && type !== "completed" && type !== "closed") {
      console.log("TestView: Test completed, ignoring event", { type });
      return;
    }
    console.log("TestView: Recording event", { type, screen, hotspot, sessionId: currentSessionId, useBeacon, x, y });
    
    // КРИТИЧНО: Явно устанавливаем user_id = NULL для anonymous сессий
    // Это необходимо для работы RLS политик "Anonymous can insert events"
    const eventData: any = {
      session_id: currentSessionId,
      event_type: type,
      screen_id: screen,
      hotspot_id: hotspot,
      user_id: null // Явно устанавливаем NULL для anonymous пользователей
    };
    
    // Добавляем координаты, если они переданы (для кликов в пустую область)
    if (x !== undefined && y !== undefined) {
      eventData.x = x;
      eventData.y = y;
    }

    // Если useBeacon = true, используем sendBeacon для надежной отправки при закрытии страницы
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      const url = `${SUPABASE_URL}/rest/v1/events`;
      const payload = JSON.stringify(eventData);
      
      // Используем fetch с keepalive для надежной отправки при закрытии
      // sendBeacon не поддерживает кастомные заголовки, поэтому используем fetch
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: payload,
        keepalive: true // Критично для отправки при закрытии страницы
      }).then(() => {
        console.log("TestView: Event sent via keepalive fetch:", type);
      }).catch(err => {
        console.error("TestView: Error sending event with keepalive:", err);
      });
      return;
    }

    // Обычная отправка через Supabase
    (async () => {
      try {
        const { data, error } = await supabase
          .from("events")
          .insert([eventData]);
        
        if (error) {
          console.error("TestView: Error recording event", { type, sessionId: currentSessionId, error });
        } else {
          console.log("TestView: Event recorded successfully", { type, sessionId: currentSessionId, data });
        }
      } catch (err) {
        console.error("TestView: Unexpected error recording event", { type, sessionId: currentSessionId, err });
      }
    })();
  }

  const goToScreen = (target: string) => {
    // Блокируем переходы после завершения теста
    if (testCompleted.current) {
      console.log("TestView: Test completed, blocking screen transition");
      return;
    }
    recordEvent("screen_load", target);
    setCurrentScreen(target);
  };

  const onHotspotClick = (h: Hotspot, clickX?: number, clickY?: number) => {
    // Блокируем клики по хотспотам после завершения теста
    if (testCompleted.current) {
      console.log("TestView: Test completed, blocking hotspot click");
      return;
    }
    // Сохраняем реальные координаты клика, если они переданы
    recordEvent("hotspot_click", currentScreen, h.id, false, clickX, clickY);
    if (h.target) {
      goToScreen(h.target);
    }
  };

  useEffect(() => {
    if (currentScreen && proto) {
      // Отладочная информация
      console.log("TestView: useEffect - currentScreen check", {
        currentScreen,
        protoEnd: proto.end,
        match: currentScreen === proto.end,
        screenExists: proto.screens.some(s => s.id === currentScreen),
        availableScreens: proto.screens.map(s => s.id)
      });
      
      if (currentScreen === proto.end) {
        console.log("🎉 Reached final screen! Showing congratulations...");
        testCompleted.current = true; // Помечаем, что тест завершен
        // Используем актуальный sessionId из state
        const currentSessionId = actualSessionId || propSessionId;
        if (currentSessionId) {
          recordEvent("completed", currentScreen);
          // Показываем поздравление после небольшой задержки, чтобы пользователь увидел последний фрейм
          setTimeout(() => {
            navigate(`/finished/${currentSessionId}`, { state: { aborted: false, sessionId: currentSessionId } });
          }, 1000); // Увеличил задержку до 1 секунды для лучшей видимости
        } else {
          console.error("TestView: Cannot navigate to finished - sessionId is null");
        }
      }
    }
  }, [currentScreen, proto, navigate, actualSessionId, propSessionId]);

  // Отслеживание закрытия вкладки/браузера
  useEffect(() => {
    // Используем актуальный sessionId из state
    const currentSessionId = actualSessionId || propSessionId;
    if (!currentSessionId || !proto) {
      return;
    }

    const handleBeforeUnload = () => {
      // Не записываем closed, если тест уже завершен (completed отправлен)
      // Проверяем, не на финальном экране ли мы (если да, то тест завершен или завершается)
      if (!hasRecordedClosed.current && currentScreen !== proto.end && !testCompleted.current) {
        hasRecordedClosed.current = true;
        recordEvent("closed", currentScreen, null, true); // useBeacon = true для надежной отправки
      }
    };

    // Добавляем обработчик
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Очистка при размонтировании
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [actualSessionId, propSessionId, proto, currentScreen]);

  if (!proto) {
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        minHeight: "100vh", 
        background: "#f5f5f7",
        padding: "20px"
      }}>
        {loading && (
          <div style={{ marginBottom: "20px", color: "#666" }}>
            Загрузка прототипа...
          </div>
        )}
        {error && (
          <div style={{ 
            marginBottom: "20px", 
            color: "#d32f2f", 
            padding: "12px", 
            background: "#ffebee", 
            borderRadius: "4px",
            maxWidth: "400px"
          }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  const screen = proto.screens.find((s: Screen) => s.id === currentScreen);
  const isFinalScreen = currentScreen === proto.end;
  
  if (!screen) {
    console.error("TestView: Screen not found!", {
      currentScreen,
      availableScreens: proto.screens.map(s => ({ id: s.id, name: s.name })),
      protoStart: proto.start,
      protoEnd: proto.end
    });
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        minHeight: "100vh", 
        background: "#f5f5f7",
        padding: "20px"
      }}>
        <div style={{ 
          background: "#ffebee", 
          padding: "16px", 
          borderRadius: "8px",
          color: "#d32f2f",
          maxWidth: "500px"
        }}>
          <h3 style={{ marginTop: 0 }}>Ошибка: Экран не найден</h3>
          <p>Текущий экран: <code>{currentScreen}</code></p>
          <p>Доступные экраны:</p>
          <ul>
            {proto.screens.map(s => (
              <li key={s.id}><code>{s.id}</code> - {s.name}</li>
            ))}
          </ul>
          <p>Стартовый экран прототипа: <code>{proto.start}</code></p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column",
      justifyContent: "center", 
      alignItems: "center", 
      minHeight: "100vh", 
      background: "#f5f5f7",
      width: "100%",
      padding: "20px"
    }}>
      {/* Отображение задания над прототипом */}
      {taskDescription && (
        <div style={{
          width: "100%",
          maxWidth: screen.width,
          marginBottom: 20,
          padding: 16,
          background: "#ffffff",
          borderRadius: 8,
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h3 style={{
            margin: "0 0 8px 0",
            fontSize: 16,
            fontWeight: 600,
            color: "#333"
          }}>
            Задание:
          </h3>
          <p style={{
            margin: 0,
            fontSize: 14,
            color: "#666",
            lineHeight: 1.5
          }}>
            {taskDescription}
          </p>
        </div>
      )}
      
      <div 
        style={{ position: "relative", width: screen.width }}
        onClick={(e) => {
          // Блокируем все клики после завершения теста
          if (testCompleted.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // Проверяем, что клик не был по хотспоту (хотспоты обрабатывают свои клики и вызывают stopPropagation)
          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") {
            // Получаем координаты клика относительно контейнера
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Проверяем, не попал ли клик в какой-либо хотспот (дополнительная проверка)
            const clickedHotspot = proto.hotspots.find((h: Hotspot) => {
              if (h.frame !== screen.id) return false;
              return (
                clickX >= h.x &&
                clickX <= h.x + h.w &&
                clickY >= h.y &&
                clickY <= h.y + h.h
              );
            });
            
            // Если клик не попал в хотспот, регистрируем как клик в пустую область
            if (!clickedHotspot) {
              recordEvent("click", currentScreen, null, false, clickX, clickY);
            }
          }
        }}
      >
      <img src={screen.image} width={screen.width} />
      
      {isFinalScreen && (
        <div style={{
          position: "absolute",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(76, 175, 80, 0.9)",
          color: "white",
          padding: "15px 30px",
          borderRadius: 8,
          fontSize: 18,
          fontWeight: "bold",
          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
          zIndex: 1000,
          animation: "fadeIn 0.5s ease-in"
        }}>
          🎉 Вы достигли финального экрана!
        </div>
      )}

      {proto.hotspots
        .filter((h: Hotspot) => h.frame === screen.id)
        .map((h: Hotspot) => (
          <div
            key={h.id}
            style={{
              position: "absolute",
              left: h.x,
              top: h.y,
              width: h.w,
              height: h.h,
              cursor: testCompleted.current ? "default" : "pointer",
              zIndex: 1,
              pointerEvents: testCompleted.current ? "none" : "auto"
            }}
            onClick={(e) => {
              // Блокируем клики после завершения теста
              if (testCompleted.current) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал обработчик пустой области
              // Получаем координаты клика относительно контейнера экрана
              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
              if (rect) {
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                onHotspotClick(h, clickX, clickY);
              } else {
                onHotspotClick(h);
              }
            }}
          />
        ))}

      {/* Блокирующий оверлей после завершения теста */}
      {testCompleted.current && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            zIndex: 9999,
            pointerEvents: "auto",
            cursor: "default"
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}
      </div>
      
      {/* Кнопка "Сдаться" под прототипом */}
      {!testCompleted.current && (
        <button
          style={{
            width: screen.width,
            marginTop: 20,
            padding: "12px 24px",
            background: "#e0e0e0",
            color: "#000000",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "center"
          }}
          onClick={() => {
            // Используем актуальный sessionId из state
            const currentSessionId = actualSessionId || propSessionId;
            // Записываем событие о прерывании теста
            if (currentSessionId) {
              recordEvent("aborted", currentScreen);
              // Переходим на страницу завершения
              navigate(`/finished/${currentSessionId}`, { state: { aborted: true, sessionId: currentSessionId } });
            } else {
              console.error("TestView: Cannot navigate to finished - sessionId is null");
            }
          }}
        >
          Сдаться
        </button>
      )}
    </div>
  );
}
