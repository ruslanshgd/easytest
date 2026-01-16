import { Routes, Route, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "./supabaseClient";
import { isValidUUID } from "./utils/validation";

import TestView from "./TestView.tsx";
import Finished from "./Finished.tsx";
import StudyRunView from "./StudyRunView.tsx";

function App() {
  const location = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const processedSessionId = useRef<string | null>(null); // Отслеживаем обработанные sessionId
  const isCreatingSession = useRef<boolean>(false); // Флаг для предотвращения одновременного создания
  const processingPrototypeId = useRef<string | null>(null); // Отслеживаем обрабатываемый prototypeId для предотвращения дублирования

  useEffect(() => {
    // Извлекаем sessionId или prototypeId из URL (UUID формат: 8-4-4-4-12 символов)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pathParts = location.pathname.split("/").filter(Boolean);
    
    // Определяем, на какой странице мы находимся
    const isFinishedPage = location.pathname.startsWith("/finished");
    const isTestPage = !isFinishedPage;
    
    // Проверяем, является ли это ссылкой с prototypeId (формат: /prototype/{prototypeId})
    let urlPrototypeId: string | null = null;
    if (pathParts[0] === "prototype" && pathParts[1] && uuidRegex.test(pathParts[1])) {
      urlPrototypeId = pathParts[1];
    }
    
    // Ищем UUID в пути (для обратной совместимости со старыми ссылками с sessionId)
    let urlSessionId: string | null = null;
    if (!urlPrototypeId) {
      for (const part of pathParts) {
        if (uuidRegex.test(part)) {
          urlSessionId = part;
          break;
        }
      }
    }

    // Проверяем в localStorage, не обрабатывали ли мы уже этот sessionId
    const processedKey = `processed_${urlSessionId}`;
    if (urlSessionId && localStorage.getItem(processedKey)) {
      const processedNewSessionId = localStorage.getItem(processedKey);
      console.log("App: SessionId already processed, using stored session:", processedNewSessionId);
      if (processedNewSessionId) {
        setSessionId(processedNewSessionId);
        processedSessionId.current = processedNewSessionId;
      } else {
        setSessionId(urlSessionId);
        processedSessionId.current = urlSessionId;
      }
      return;
    }

    // Если этот sessionId уже был обработан в текущей сессии, не обрабатываем повторно
    if (urlSessionId && urlSessionId === processedSessionId.current) {
      console.log("App: SessionId already processed in current session, skipping:", urlSessionId);
      setSessionId(urlSessionId);
      return;
    }

    // Если уже создаем сессию, не запускаем повторно
    if (isCreatingSession.current) {
      console.log("App: Session creation already in progress, skipping");
      return;
    }

    // Приоритет: URL параметр > localStorage > новый UUID (только для страниц тестирования)
    let sid: string | null = null;

    if (urlSessionId) {
      sid = urlSessionId;
      localStorage.setItem("figmaTest_sessionId", sid);
    } else if (isTestPage) {
      // Только для страниц тестирования используем localStorage или создаем новый
      const stored = localStorage.getItem("figmaTest_sessionId");
      if (stored) {
        sid = stored;
      } else {
        // Создаем новый только для страниц тестирования
        sid = uuidv4();
        localStorage.setItem("figmaTest_sessionId", sid);
      }
    } else {
      // Для finished не создаем новую сессию
      const stored = localStorage.getItem("figmaTest_sessionId");
      sid = stored; // Используем только если есть в localStorage
    }

    // Если есть prototypeId в URL (новая схема), создаем сессию для этого прототипа
    if (urlPrototypeId && isTestPage) {
      // Валидация prototypeId перед использованием
      if (!isValidUUID(urlPrototypeId)) {
        console.error("App: Invalid prototypeId format in URL:", urlPrototypeId);
        return;
      }

      // КРИТИЧНО: В инкогнито режиме localStorage доступен между вкладками в рамках одной сессии браузера
      // Но данные не сохраняются между сессиями браузера (после закрытия всех вкладок)
      // Поэтому для инкогнито используем sessionStorage для проверки сессии в текущей вкладке
      // Если в sessionStorage нет sessionId для этого prototypeId - создаем новую сессию
      // Это гарантирует, что каждая новая вкладка в инкогнито создает новую сессию
      
      const processedKey = `processed_prototype_${urlPrototypeId}`;
      let existingSessionId: string | null = null;
      let isIncognitoMode = false;
      
      // Проверяем sessionStorage - если там нет sessionId, значит это новая вкладка
      // В инкогнито sessionStorage изолирован для каждой вкладки
      try {
        const sessionStorageKey = `session_prototype_${urlPrototypeId}`;
        const sessionStorageSessionId = sessionStorage.getItem(sessionStorageKey);
        
        // Если в sessionStorage есть sessionId - используем его (та же вкладка)
        if (sessionStorageSessionId && isValidUUID(sessionStorageSessionId)) {
          existingSessionId = sessionStorageSessionId;
          isIncognitoMode = false; // Это обычный режим или та же вкладка
          console.log("App: Found sessionId in sessionStorage (same tab):", existingSessionId);
        } else {
          // Если в sessionStorage нет sessionId, но есть в localStorage - это может быть инкогнито
          // В инкогнито localStorage доступен между вкладками, но мы хотим создавать новую сессию для каждой вкладки
          const localStorageSessionId = localStorage.getItem(processedKey);
          
          if (localStorageSessionId && isValidUUID(localStorageSessionId)) {
            // Есть sessionId в localStorage, но нет в sessionStorage - это новая вкладка
            // В инкогнито это означает, что нужно создать новую сессию для новой вкладки
            // Проверяем, не инкогнито ли это, пытаясь определить по другим признакам
            // Но для надежности: если нет в sessionStorage - всегда создаем новую сессию
            console.log("App: Found sessionId in localStorage but not in sessionStorage - treating as new tab/incognito");
            isIncognitoMode = true; // Новая вкладка = новая сессия
            existingSessionId = null; // Не используем старую сессию
          } else {
            // Нет sessionId ни в sessionStorage, ни в localStorage - создаем новую сессию
            isIncognitoMode = false; // Это может быть первый раз или обычный режим
            existingSessionId = null;
          }
        }
      } catch (e) {
        // В инкогнито или при блокировке storage будет ошибка
        console.log("App: Storage not available - incognito mode detected", e);
        isIncognitoMode = true;
        existingSessionId = null;
      }
      
      // КРИТИЧНО: Если есть существующая сессия в sessionStorage (та же вкладка), используем её
      if (existingSessionId && isValidUUID(existingSessionId) && !isIncognitoMode) {
        console.log("App: Using existing session from sessionStorage (same tab):", existingSessionId);
        setSessionId(existingSessionId);
        processedSessionId.current = existingSessionId;
        return;
      }
      
      // КРИТИЧНО: Если это новая вкладка (нет sessionId в sessionStorage) - создаем новую сессию
      // Это работает и для инкогнито, и для обычного режима
      if (isIncognitoMode || !existingSessionId) {
        // Проверяем, не обрабатываем ли мы уже этот prototypeId
        // Это предотвращает race condition при быстром двойном срабатывании useEffect
        if (processingPrototypeId.current === urlPrototypeId && isCreatingSession.current) {
          console.log("App: Session creation already in progress for this prototypeId, skipping:", urlPrototypeId);
          return;
        }
        
        // Если обрабатываем другой prototypeId, ждем завершения
        if (processingPrototypeId.current && processingPrototypeId.current !== urlPrototypeId && isCreatingSession.current) {
          console.log("App: Session creation already in progress for another prototype, skipping");
          return;
        }
        
        if (isIncognitoMode) {
          console.log("App: New tab/incognito mode - creating new session (ignoring any existing sessionId in localStorage)");
        } else {
          console.log("App: Normal mode - creating new session (not found in sessionStorage)");
        }
        
        // Сбрасываем состояния для создания новой сессии
        setSessionId(null);
        processedSessionId.current = null;
        // Устанавливаем флаг СИНХРОННО до всех async операций
        isCreatingSession.current = true;
        processingPrototypeId.current = urlPrototypeId;
      }
      
      // Асинхронное создание сессии
      // КРИТИЧНО: Создаем сессию с user_id = NULL для anonymous пользователей
      (async () => {
        // В инкогнито всегда создаем новую сессию
        // В обычном режиме тоже создаем новую, если её нет в localStorage
        if (isIncognitoMode) {
          console.log("App: Incognito mode - creating new session");
        } else {
          console.log("App: Normal mode - creating new session (not found in localStorage)");
        }
        
        // Создаем новую сессию для этого прототипа
        // КРИТИЧНО: user_id должен быть NULL для anonymous пользователей
        const newSessionId = uuidv4();
        console.log("App: Creating new session for prototype:", newSessionId, "prototype_id:", urlPrototypeId, "incognito:", isIncognitoMode);
        
        try {
          // КРИТИЧНО: Явно устанавливаем user_id = NULL для anonymous сессий
          const { data: insertData, error: insertError } = await supabase
            .from("sessions")
            .insert([{ 
              id: newSessionId, 
              prototype_id: urlPrototypeId,
              user_id: null // Явно устанавливаем NULL для anonymous пользователей
            }])
            .select();
          
          if (insertError) {
            console.error("App: Error creating session for prototype:", { 
              newSessionId, 
              urlPrototypeId, 
              insertError,
              errorMessage: insertError.message,
              errorDetails: insertError.details,
              errorHint: insertError.hint,
              errorCode: insertError.code
            });
            // КРИТИЧНО: Даже если есть ошибка создания сессии, устанавливаем sessionId для продолжения работы
            // Это позволит записывать события и завершать тест
            console.warn("App: Setting sessionId despite error to allow test continuation:", newSessionId);
            setSessionId(newSessionId);
            processedSessionId.current = newSessionId;
            isCreatingSession.current = false;
            processingPrototypeId.current = null;
          } else {
            console.log("App: Session created successfully for prototype:", { newSessionId, urlPrototypeId, insertData });
            processedSessionId.current = newSessionId;
            
            // Сохраняем в sessionStorage для текущей вкладки (работает и в инкогнито)
            try {
              const sessionStorageKey = `session_prototype_${urlPrototypeId}`;
              sessionStorage.setItem(sessionStorageKey, newSessionId);
              console.log("App: Session saved to sessionStorage for current tab");
            } catch (e) {
              console.warn("App: Failed to save to sessionStorage:", e);
            }
            
            // Сохраняем в localStorage только в обычном режиме (для синхронизации между вкладками)
            if (!isIncognitoMode) {
              try {
                localStorage.setItem(`processed_prototype_${urlPrototypeId}`, newSessionId);
                localStorage.setItem("figmaTest_sessionId", newSessionId);
                console.log("App: Session saved to localStorage for normal mode");
              } catch (e) {
                console.warn("App: Failed to save to localStorage:", e);
              }
            } else {
              console.log("App: Incognito/new tab mode - session NOT saved to localStorage (only sessionStorage)");
            }
            
            // КРИТИЧНО: Устанавливаем sessionId ПОСЛЕ успешного создания сессии
            setSessionId(newSessionId);
            isCreatingSession.current = false;
            processingPrototypeId.current = null;
          }
        } catch (error) {
          console.error("App: Unexpected error creating session for prototype:", { 
            newSessionId, 
            urlPrototypeId, 
            error,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined
          });
          // КРИТИЧНО: Даже при ошибке устанавливаем sessionId для продолжения работы
          console.warn("App: Setting sessionId despite error to allow test continuation:", newSessionId);
          setSessionId(newSessionId);
          processedSessionId.current = newSessionId;
          isCreatingSession.current = false;
          processingPrototypeId.current = null;
        }
      })();
      return;
    }

    // Если есть sessionId в URL (старая схема для обратной совместимости)
    // КРИТИЧНО: Если это sessionId, который мы только что создали из prototypeId, НЕ создаем новую сессию
    if (urlSessionId && isTestPage) {
      // Валидация sessionId перед использованием
      if (!isValidUUID(urlSessionId)) {
        console.error("App: Invalid sessionId format in URL:", urlSessionId);
        return;
      }

      // Проверяем, не обрабатывали ли мы уже этот sessionId
      if (processedSessionId.current === urlSessionId) {
        console.log("App: SessionId already processed, using it:", urlSessionId);
        setSessionId(urlSessionId);
        return;
      }
      
      // КРИТИЧНО: Проверяем, не создали ли мы эту сессию только что из prototypeId
      // Если сессия очень свежая (менее 5 секунд), используем её без создания новой
      (async () => {
        const { data: existingSession, error } = await supabase
          .from("sessions")
          .select("prototype_id, started_at")
          .eq("id", urlSessionId)
          .maybeSingle();
        
        if (error) {
          console.error("App: Error checking existing session:", error);
          setSessionId(urlSessionId);
          return;
        }

        if (existingSession) {
          // Если сессия существует и очень свежая (менее 5 секунд), используем её
          // Это предотвращает создание дубликата при navigate из TestView
          if (existingSession.started_at) {
            const sessionAge = Date.now() - new Date(existingSession.started_at).getTime();
            if (sessionAge < 5000) {
              console.log("App: Session is very fresh, using it without creating new:", urlSessionId);
              processedSessionId.current = urlSessionId;
              try {
                localStorage.setItem(`processed_${urlSessionId}`, urlSessionId);
                localStorage.setItem("figmaTest_sessionId", urlSessionId);
              } catch (e) {
                console.warn("App: localStorage not available:", e);
              }
              setSessionId(urlSessionId);
              return;
            }
          }
          
          // Если сессия существует, но не свежая, просто используем её
          // НЕ создаем новую сессию, если сессия уже существует
          console.log("App: Session exists, using it:", urlSessionId);
          processedSessionId.current = urlSessionId;
          setSessionId(urlSessionId);
          return;
        }
        
        // Если сессии нет, это может быть старая ссылка - используем sessionId как есть
        // НЕ создаем новую сессию автоматически для старых ссылок
        console.log("App: Session not found, using URL sessionId as is:", urlSessionId);
        setSessionId(urlSessionId);
      })();
    } else {
      // Для остальных случаев (нет sessionId в URL или не тестовая страница)
      // НЕ создаем сессию автоматически - она создастся только когда:
      // 1. Пользователь откроет ссылку с prototypeId из плагина
      // 2. Пользователь откроет ссылку с sessionId
      setSessionId(sid);
      console.log("App: SessionId set to", sid, "from URL:", urlSessionId, "path:", location.pathname, "isTestPage:", isTestPage);
      // Сессия будет создана позже, когда пользователь начнет тест
    }
  }, [location.pathname]);

  return (
    <div>
      <Routes>
        <Route path="/" element={<TestView sessionId={sessionId} />} />
        <Route path="/prototype/:prototypeId" element={<TestView sessionId={sessionId} />} />
        <Route path="/run/:token" element={<StudyRunView />} />
        <Route path="/share/:token" element={<StudyRunView />} />
        <Route path="/:sessionId" element={<TestView sessionId={sessionId} />} />
        <Route path="/finished/:sessionId?" element={<Finished />} />
      </Routes>
    </div>
  );
}

export default App;
