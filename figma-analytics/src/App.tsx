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
import { User } from "lucide-react";

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

  // Определяем, показывать ли шапку
  // Показываем на главной "/" и "/studies" (списки), но НЕ на "/studies/:id" (внутри теста)
  const isStudyDetailPage = /^\/studies\/[^/]+$/.test(location.pathname);
  const showHeader = !isStudyDetailPage && 
                     location.pathname !== "/profile" && 
                     !location.pathname.startsWith("/token") &&
                     !location.pathname.startsWith("/analytics") &&
                     !location.pathname.startsWith("/prototypes") &&
                     !location.pathname.startsWith("/invite");

  return (
    <div>
      {/* Шапка: ИзиТест слева, Профиль справа */}
      {showHeader && (
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid #e5e5e3",
            backgroundColor: "#ffffff",
            position: "sticky",
            top: 0,
            zIndex: 1000,
          }}
        >
          <Link
            to="/"
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "#1f1f1f",
              textDecoration: "none",
            }}
          >
            ИзиТест
          </Link>
          <Link
            to="/profile"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              backgroundColor: "#2383e2",
              color: "white",
              textDecoration: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            <User size={16} />
            Профиль
          </Link>
        </header>
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

