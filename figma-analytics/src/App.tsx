import { Routes, Route, useLocation, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Analytics from "./Analytics";
import Auth from "./components/Auth";
import TokenPage from "./TokenPage";
import PrototypePage from "./PrototypePage";
import StudiesList from "./StudiesList";
import StudyDetail from "./StudyDetail";
import ProfilePage from "./ProfilePage";
import InvitePage from "./InvitePage";

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


  return (
    <div>
      {/* Навигация в правом верхнем углу - скрываем на странице профиля */}
      {location.pathname !== "/profile" && (
        <div style={{
          position: "fixed",
          top: "10px",
          right: "10px",
          zIndex: 1000,
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
        }}>
          <Link
            to="/profile"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0.5rem 1rem",
              backgroundColor: "#007bff",
              color: "white",
              textDecoration: "none",
              borderRadius: "4px",
              fontSize: "0.9rem",
              fontWeight: "500",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ marginRight: "0.5rem" }}
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Профиль
          </Link>
        </div>
      )}
      <Routes>
        {/* Главная страница показывает список studies */}
        <Route path="/" element={<StudiesList />} />
        <Route path="/analytics" element={<Analytics sessionId={null} />} />
        <Route path="/analytics/:sessionId" element={<Analytics sessionId={null} />} />
        <Route path="/prototypes/:prototypeId" element={<PrototypePage />} />
        <Route path="/studies" element={<StudiesList />} />
        <Route path="/studies/:id" element={<StudyDetail />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/token" element={<TokenPage />} />
      </Routes>
    </div>
  );
}

export default App;

