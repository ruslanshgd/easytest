import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function TokenPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Получаем текущую сессию и извлекаем access_token
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      }
      setLoading(false);
    });

    // Слушаем изменения авторизации
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setToken(session.access_token);
      } else {
        setToken(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const copyToClipboard = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      alert("Токен скопирован в буфер обмена!");
    }
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f5f5f7",
      }}>
        <div>Загрузка...</div>
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f5f5f7",
        padding: 20,
      }}>
        <div style={{
          background: "#ffffff",
          borderRadius: 8,
          padding: 32,
          maxWidth: 500,
          width: "100%",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Требуется авторизация</h2>
          <p style={{ color: "#666", marginBottom: 24 }}>
            Для получения access token необходимо авторизоваться.
          </p>
          <button
            onClick={() => window.location.href = "/"}
            style={{
              width: "100%",
              padding: "12px 24px",
              background: "#007AFF",
              color: "white",
              border: "none",
              borderRadius: 4,
              fontSize: 16,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Перейти к авторизации
          </button>
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
      padding: 20,
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 8,
        padding: 32,
        maxWidth: 600,
        width: "100%",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Access Token</h2>
        <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
          Скопируйте этот токен и вставьте его в настройки плагина Figma для привязки прототипов к вашему аккаунту.
        </p>
        <div style={{
          background: "#f5f5f5",
          padding: 12,
          borderRadius: 4,
          marginBottom: 16,
          wordBreak: "break-all",
          fontFamily: "monospace",
          fontSize: 12,
          border: "1px solid #ddd",
        }}>
          {token}
        </div>
        <button
          onClick={copyToClipboard}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: "#007AFF",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontSize: 16,
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          Копировать токен
        </button>
        <button
          onClick={() => window.location.href = "/"}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: "transparent",
            color: "#007AFF",
            border: "1px solid #007AFF",
            borderRadius: 4,
            fontSize: 16,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Перейти к аналитике
        </button>
      </div>
    </div>
  );
}

