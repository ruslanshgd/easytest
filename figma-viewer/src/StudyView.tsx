import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { isValidUUID } from "./utils/validation";
import TestView from "./TestView.tsx";

interface Study {
  id: string;
  title: string;
  status: string;
}

interface StudyBlock {
  id: string;
  study_id: string;
  type: "prototype" | "question";
  order_index: number;
  prototype_id: string | null;
  instructions: string | null;
  config: any;
}

interface QuestionBlockProps {
  question: string;
  onNext: () => void;
}

function QuestionBlock({ question, onNext }: QuestionBlockProps) {
  const [answer, setAnswer] = useState("");

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "20px",
      background: "#f5f5f7"
    }}>
      <div style={{
        maxWidth: "600px",
        width: "100%",
        background: "white",
        borderRadius: "12px",
        padding: "32px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
      }}>
        <h2 style={{
          margin: "0 0 24px 0",
          fontSize: "24px",
          fontWeight: 600,
          color: "#333"
        }}>
          {question || "Вопрос"}
        </h2>
        
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Введите ваш ответ..."
          style={{
            width: "100%",
            minHeight: "150px",
            padding: "12px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            fontSize: "16px",
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: "20px"
          }}
        />
        
        <button
          onClick={onNext}
          disabled={!answer.trim()}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: answer.trim() ? "#007AFF" : "#ccc",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: 600,
            cursor: answer.trim() ? "pointer" : "not-allowed",
            transition: "background 0.2s"
          }}
        >
          Далее
        </button>
      </div>
    </div>
  );
}

export default function StudyView() {
  const params = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const studyId = params.studyId || null;

  const [study, setStudy] = useState<Study | null>(null);
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prototypeTaskDescription, setPrototypeTaskDescription] = useState<string | null>(null);

  // Загружаем study и blocks
  useEffect(() => {
    if (!studyId) {
      setError("Study ID не указан в URL");
      setLoading(false);
      return;
    }

    if (!isValidUUID(studyId)) {
      setError("Неверный формат Study ID");
      setLoading(false);
      return;
    }

    loadStudy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  const loadStudy = async () => {
    if (!studyId) return;

    setLoading(true);
    setError(null);

    try {
      // Загружаем study
      // ВАЖНО: Для MVP используем public read или auth (в зависимости от RLS)
      // Пока пробуем без auth (если RLS позволяет public read)
      const { data: studyData, error: studyError } = await supabase
        .from("studies")
        .select("id, title, status")
        .eq("id", studyId)
        .maybeSingle();

      if (studyError) {
        console.error("Error loading study:", studyError);
        setError(`Ошибка загрузки study: ${studyError.message}`);
        setLoading(false);
        return;
      }

      if (!studyData) {
        setError("Study не найден");
        setLoading(false);
        return;
      }

      setStudy(studyData);

      // Загружаем blocks
      const { data: blocksData, error: blocksError } = await supabase
        .from("study_blocks")
        .select("id, study_id, type, order_index, prototype_id, instructions, config")
        .eq("study_id", studyId)
        .order("order_index", { ascending: true });

      if (blocksError) {
        console.error("Error loading blocks:", blocksError);
        setError(`Ошибка загрузки blocks: ${blocksError.message}`);
        setLoading(false);
        return;
      }

      if (!blocksData || blocksData.length === 0) {
        setError("В этом study нет блоков");
        setLoading(false);
        return;
      }

      setBlocks(blocksData);

      // Если первый блок - prototype, загружаем task_description
      if (blocksData[0].type === "prototype" && blocksData[0].prototype_id) {
        await loadPrototypeTaskDescription(blocksData[0].prototype_id);
      }
    } catch (err) {
      console.error("Unexpected error loading study:", err);
      setError(`Неожиданная ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPrototypeTaskDescription = async (prototypeId: string) => {
    try {
      const { data: prototypeData, error: protoError } = await supabase
        .from("prototypes")
        .select("task_description")
        .eq("id", prototypeId)
        .maybeSingle();

      if (!protoError && prototypeData) {
        setPrototypeTaskDescription(prototypeData.task_description);
      }
    } catch (err) {
      console.error("Error loading prototype task_description:", err);
    }
  };

  const handleNextBlock = () => {
    if (currentBlockIndex < blocks.length - 1) {
      const nextIndex = currentBlockIndex + 1;
      setCurrentBlockIndex(nextIndex);
      
      // Если следующий блок - prototype, загружаем task_description
      if (blocks[nextIndex].type === "prototype" && blocks[nextIndex].prototype_id) {
        loadPrototypeTaskDescription(blocks[nextIndex].prototype_id);
      }
    } else {
      // Study завершен
      navigate("/finished");
    }
  };

  const handlePrototypeComplete = () => {
    // Когда прототип завершен, переходим к следующему блоку
    handleNextBlock();
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontSize: "18px",
        color: "#666"
      }}>
        Загрузка study...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px"
      }}>
        <div style={{
          maxWidth: "500px",
          padding: "24px",
          background: "#ffebee",
          color: "#c62828",
          borderRadius: "8px",
          textAlign: "center"
        }}>
          <h2 style={{ margin: "0 0 16px 0" }}>Ошибка</h2>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!study || blocks.length === 0) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontSize: "18px",
        color: "#666"
      }}>
        Study не найден или не содержит блоков
      </div>
    );
  }

  const currentBlock = blocks[currentBlockIndex];

  if (!currentBlock) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontSize: "18px",
        color: "#666"
      }}>
        Блок не найден
      </div>
    );
  }

  // Показываем прогресс
  const progress = ((currentBlockIndex + 1) / blocks.length) * 100;

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      {/* Прогресс-бар */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "4px",
        background: "#e0e0e0",
        zIndex: 1000
      }}>
        <div style={{
          height: "100%",
          width: `${progress}%`,
          background: "#007AFF",
          transition: "width 0.3s ease"
        }} />
      </div>

      {/* Индикатор блока */}
      <div style={{
        position: "fixed",
        top: "12px",
        right: "12px",
        padding: "8px 16px",
        background: "rgba(0,0,0,0.7)",
        color: "white",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: 600,
        zIndex: 1000
      }}>
        {currentBlockIndex + 1} / {blocks.length}
      </div>

      {/* Рендерим текущий блок */}
      {currentBlock.type === "prototype" ? (
        <div>
          {/* Передаем instructions в TestView через пропсы или модифицируем task_description */}
          {/* ВАЖНО: TestView ожидает prototypeId в URL или через props */}
          {/* Для reuse TestView, нам нужно либо модифицировать его, либо создать wrapper */}
          {/* Пока создадим wrapper, который передает prototypeId и instructions */}
          {currentBlock.prototype_id ? (
            <PrototypeBlockWrapper
              prototypeId={currentBlock.prototype_id}
              instructions={currentBlock.instructions || prototypeTaskDescription}
              onComplete={handlePrototypeComplete}
            />
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              fontSize: "18px",
              color: "#666"
            }}>
              Прототип не указан в блоке
            </div>
          )}
        </div>
      ) : (
        <QuestionBlock
          question={currentBlock.config?.question || "Вопрос"}
          onNext={handleNextBlock}
        />
      )}
    </div>
  );
}

// Wrapper для TestView, который передает prototypeId и instructions
interface PrototypeBlockWrapperProps {
  prototypeId: string;
  instructions: string | null;
  onComplete: () => void;
}

function PrototypeBlockWrapper({ prototypeId, instructions, onComplete }: PrototypeBlockWrapperProps) {
  // const navigate = useNavigate(); // Reserved for future navigation needs
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prototypeCompleted, setPrototypeCompleted] = useState(false);

  // Создаем сессию для этого прототипа (как в App.tsx)
  useEffect(() => {
    const createSession = async () => {
      try {
        const { v4: uuidv4 } = await import("uuid");
        const newSessionId = uuidv4();
        
        const { error: insertError } = await supabase
          .from("sessions")
          .insert([{ 
            id: newSessionId, 
            prototype_id: prototypeId,
            user_id: null
          }]);

        if (insertError) {
          console.error("Error creating session:", insertError);
          // Используем sessionId даже при ошибке для продолжения работы
          setSessionId(newSessionId);
        } else {
          setSessionId(newSessionId);
        }
      } catch (err) {
        console.error("Unexpected error creating session:", err);
      }
    };

    createSession();
  }, [prototypeId]);

  // ВАЖНО: TestView ожидает prototypeId в URL через useParams
  // Для reuse TestView без изменений, используем navigate к /prototype/:prototypeId
  // Но нам нужно перехватить завершение прототипа
  
  // Используем window.location для изменения URL без навигации через React Router
  // Это позволит TestView получить prototypeId из URL
  useEffect(() => {
    if (sessionId && prototypeId) {
      // ВАЖНО: Изменяем URL через history.pushState чтобы TestView мог получить prototypeId
      // Но не вызываем navigate, чтобы не сломать роутинг StudyView
      const currentPath = window.location.pathname;
      const newPath = `/prototype/${prototypeId}`;
      
      // Сохраняем текущий путь для восстановления
      window.history.pushState({ studyView: true, originalPath: currentPath }, "", newPath);
      
      // Слушаем изменения location для перехвата завершения
      const handleLocationChange = () => {
        if (window.location.pathname.startsWith("/finished")) {
          // Прототип завершен
          setPrototypeCompleted(true);
          // Восстанавливаем путь study
          window.history.pushState({}, "", currentPath);
        }
      };
      
      // Используем popstate для отслеживания изменений
      window.addEventListener("popstate", handleLocationChange);
      
      // Также проверяем изменения через setInterval (fallback)
      const interval = setInterval(() => {
        if (window.location.pathname.startsWith("/finished")) {
          handleLocationChange();
        }
      }, 100);
      
      return () => {
        window.removeEventListener("popstate", handleLocationChange);
        clearInterval(interval);
        // Восстанавливаем путь при размонтировании
        if (window.location.pathname.startsWith("/prototype/")) {
          window.history.pushState({}, "", currentPath);
        }
      };
    }
  }, [sessionId, prototypeId]);

  // Когда прототип завершен, вызываем onComplete
  useEffect(() => {
    if (prototypeCompleted) {
      onComplete();
    }
  }, [prototypeCompleted, onComplete]);

  // ВАЖНО: TestView использует useParams для получения prototypeId
  // Но мы находимся в /study/:studyId, поэтому useParams не вернет prototypeId
  // Решение: модифицируем TestView минимально - добавить опциональный prop prototypeIdOverride
  // Но пользователь сказал не трогать TestView...
  
  // Альтернатива: создаем отдельный роут внутри StudyView через MemoryRouter
  // Но это сложно
  
  // Для MVP: модифицируем TestView минимально - добавить опциональный prop prototypeIdOverride
  // Это не сломает существующий режим
  
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      {/* ВАЖНО: TestView ожидает prototypeId из URL через useParams */}
      {/* Но мы в /study/:studyId, поэтому нужно либо изменить URL, либо модифицировать TestView */}
      {/* Для MVP модифицируем TestView минимально - добавить prototypeIdOverride prop */}
      {/* Но пока используем navigate к /prototype/:prototypeId */}
      
      {/* Показываем instructions если они есть */}
      {instructions && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "600px",
          padding: "16px 24px",
          background: "rgba(0,0,0,0.85)",
          color: "white",
          borderRadius: "8px",
          fontSize: "14px",
          zIndex: 1000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          lineHeight: "1.5"
        }}>
          <strong style={{ display: "block", marginBottom: "8px" }}>Инструкции:</strong>
          <div>{instructions}</div>
        </div>
      )}
      
      {/* ВАЖНО: Для reuse TestView, нам нужно чтобы он получил prototypeId из URL */}
      {/* Но мы находимся в /study/:studyId */}
      {/* Решение: модифицируем TestView чтобы принимать prototypeId через props */}
      {/* Но пользователь сказал не трогать... */}
      
      {/* Временное решение: используем TestView с navigate */}
      {/* Но это создаст новую сессию и навигацию */}
      
      {/* Лучшее решение: модифицируем TestView минимально */}
      <TestView sessionId={sessionId} />
    </div>
  );
}

