import { Routes, Route, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Analytics from "./Analytics";
import Auth from "./components/Auth";
import TokenPage from "./TokenPage";

function App() {
  const location = useLocation();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Проверка авторизации
  useEffect(() => {
    // Проверяем текущую сессию
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Слушаем изменения авторизации
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Показываем загрузку
  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}>
        <div>Загрузка...</div>
      </div>
    );
  }

  // Если пользователь не авторизован и это не страница /token, показываем форму входа
  // Страница /token доступна без авторизации (но токен будет null)
  if (!session && !location.pathname.startsWith("/token")) {
    return <Auth />;
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div>
      {/* Кнопка выхода в правом верхнем углу */}
      <div style={{
        position: "fixed",
        top: "10px",
        right: "10px",
        zIndex: 1000,
      }}>
        <button
          onClick={handleSignOut}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.9rem",
            fontWeight: "500",
          }}
        >
          Выйти
        </button>
      </div>
      <Routes>
        <Route path="/" element={<Analytics sessionId={null} />} />
        <Route path="/analytics" element={<Analytics sessionId={null} />} />
        <Route path="/analytics/:sessionId" element={<Analytics sessionId={null} />} />
        <Route path="/token" element={<TokenPage />} />
      </Routes>
    </div>
  );
}

export default App;

