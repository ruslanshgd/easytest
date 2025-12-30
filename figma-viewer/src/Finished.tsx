import { useState, useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { validateUUID } from "./utils/validation";

export default function Finished() {
  const loc = useLocation();
  const params = useParams<{ sessionId?: string }>();
  const aborted = loc.state?.aborted;
  const sessionId = params.sessionId || loc.state?.sessionId || null;
  
  const [item1, setItem1] = useState<number | null>(null);
  const [item2, setItem2] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загружаем существующие данные из БД при открытии страницы (если есть)
  // Это позволяет показать предыдущие ответы, но пользователь может их изменить и перезаписать
  useEffect(() => {
    if (!sessionId) return;
    
    const loadExistingData = async () => {
      try {
        validateUUID(sessionId, "sessionId");
      } catch {
        return;
      }
      
      // Загружаем существующие данные из БД (если есть)
      const { data: sessionData, error: loadError } = await supabase
        .from("sessions")
        .select("umux_lite_item1, umux_lite_item2, feedback_text")
        .eq("id", sessionId)
        .maybeSingle();
      
      if (loadError) {
        console.warn("Finished: Error loading existing data:", loadError);
        return;
      }
      
      // Если есть данные, заполняем форму (но пользователь может их изменить)
      if (sessionData) {
        if (sessionData.umux_lite_item1 !== null && sessionData.umux_lite_item1 !== undefined) {
          setItem1(sessionData.umux_lite_item1);
        }
        if (sessionData.umux_lite_item2 !== null && sessionData.umux_lite_item2 !== undefined) {
          setItem2(sessionData.umux_lite_item2);
        }
        if (sessionData.feedback_text) {
          setFeedback(sessionData.feedback_text);
        }
      }
    };
    
    loadExistingData();
  }, [sessionId]);

  const handleSubmit = async () => {
    if (item1 === null || item2 === null) {
      setError("Пожалуйста, ответьте на оба вопроса");
      return;
    }

    if (!sessionId) {
      setError("Ошибка: не найден ID сессии");
      return;
    }

    try {
      validateUUID(sessionId, "sessionId");
    } catch {
      setError("Ошибка: неверный формат ID сессии");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Расчет UMUX Lite score: ((item1-1 + item2-1) / 12) * 100
      const umuxLiteScore = ((item1 - 1 + item2 - 1) / 12) * 100;
      
      // Расчет SUS score: 0.65 * ((item1 + item2 - 2) * (100/12)) + 22.9
      const susScore = 0.65 * ((item1 + item2 - 2) * (100 / 12)) + 22.9;

      // Если тест был прерван, также помечаем это (через событие aborted уже записано, но можно добавить дополнительную логику)
      console.log("Finished: Saving UMUX-lite data", { sessionId, item1, item2, umuxLiteScore, susScore, feedback: feedback.trim() || null });
      
      const { data: updateData, error: updateError } = await supabase
        .from("sessions")
        .update({
          umux_lite_item1: item1,
          umux_lite_item2: item2,
          umux_lite_score: Math.round(umuxLiteScore * 100) / 100, // Округляем до 2 знаков
          umux_lite_sus_score: Math.round(susScore * 100) / 100,
          feedback_text: feedback.trim() || null
        })
        .eq("id", sessionId)
        .select();

      if (updateError) {
        console.error("Finished: Error saving UMUX-lite data:", updateError);
        throw new Error(`Ошибка сохранения: ${updateError.message}`);
      }
      
      console.log("Finished: UMUX-lite data saved successfully", updateData);

      // Помечаем, что опрос отправлен (только для текущей сессии браузера)
      setSubmitted(true);
    } catch (err) {
      console.error("Error submitting UMUX Lite:", err);
      setError(err instanceof Error ? err.message : "Ошибка при сохранении ответов");
    } finally {
      setSubmitting(false);
    }
  };

  // Показываем опрос даже если тест прерван - нужно собрать фидбек
  // (Убрали ранний return для aborted)

  // Если опрос уже отправлен в этой сессии браузера
  if (submitted) {
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center", 
        minHeight: "100vh", 
        background: "#f5f5f7",
        padding: 20 
      }}>
        <h2>{aborted ? "😕 Вы прервали прохождение" : "🎉 Поздравляем! Вы завершили тест!"}</h2>
        <p>Спасибо за прохождение и за ваши ответы!</p>
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
      padding: 20 
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 8,
        padding: 32,
        maxWidth: 600,
        width: "100%",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 24, color: "#333" }}>
          {aborted ? "😕 Вы прервали прохождение" : "🎉 Поздравляем! Вы завершили тест!"}
        </h2>
        
        <p style={{ marginBottom: 32, color: "#666", fontSize: 14 }}>
          Пожалуйста, ответьте на несколько вопросов о вашем опыте использования прототипа:
        </p>

        {/* Вопрос 1 */}
        <div style={{ marginBottom: 32 }}>
          <label style={{
            display: "block",
            marginBottom: 12,
            fontSize: 14,
            fontWeight: 500,
            color: "#333"
          }}>
            1. Возможности этого прототипа полностью удовлетворяют моим потребностям.
          </label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#999", whiteSpace: "nowrap" }}>Полностью не согласен</span>
            <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                <button
                  key={value}
                  onClick={() => setItem1(value)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 4,
                    border: "2px solid",
                    borderColor: item1 === value ? "#007AFF" : "#ddd",
                    background: item1 === value ? "#007AFF" : "#fff",
                    color: item1 === value ? "#fff" : "#333",
                    fontSize: 14,
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#999", whiteSpace: "nowrap" }}>Полностью согласен</span>
          </div>
        </div>

        {/* Вопрос 2 */}
        <div style={{ marginBottom: 32 }}>
          <label style={{
            display: "block",
            marginBottom: 12,
            fontSize: 14,
            fontWeight: 500,
            color: "#333"
          }}>
            2. Этот прототип было легко использовать.
          </label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#999", whiteSpace: "nowrap" }}>Полностью не согласен</span>
            <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                <button
                  key={value}
                  onClick={() => setItem2(value)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 4,
                    border: "2px solid",
                    borderColor: item2 === value ? "#007AFF" : "#ddd",
                    background: item2 === value ? "#007AFF" : "#fff",
                    color: item2 === value ? "#fff" : "#333",
                    fontSize: 14,
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#999", whiteSpace: "nowrap" }}>Полностью согласен</span>
          </div>
        </div>

        {/* Поле фидбэка */}
        <div style={{ marginBottom: 32 }}>
          <label style={{
            display: "block",
            marginBottom: 12,
            fontSize: 14,
            fontWeight: 500,
            color: "#333"
          }}>
            3. Дополнительные комментарии (необязательно):
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Поделитесь своими мыслями о прототипе..."
            style={{
              width: "100%",
              minHeight: 100,
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 4,
              fontSize: 14,
              fontFamily: "Arial, sans-serif",
              resize: "vertical",
              boxSizing: "border-box"
            }}
          />
        </div>

        {error && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            background: "#ffebee",
            color: "#c62828",
            borderRadius: 4,
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || item1 === null || item2 === null}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: (submitting || item1 === null || item2 === null) ? "#ccc" : "#007AFF",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontSize: 16,
            fontWeight: "bold",
            cursor: (submitting || item1 === null || item2 === null) ? "not-allowed" : "pointer",
            transition: "background 0.2s"
          }}
        >
          {submitting ? "Отправка..." : "Отправить ответы"}
        </button>
      </div>
    </div>
  );
}
