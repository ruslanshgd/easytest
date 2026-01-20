import { Routes, Route, useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import Analytics from "./Analytics";
import Auth from "./components/Auth";
import TokenPage from "./TokenPage";
import PrototypePage from "./PrototypePage";
import StudiesList from "./StudiesList";
import StudyDetail from "./StudyDetail";
import ProfilePage from "./ProfilePage";
import InvitePage from "./InvitePage";
import { User } from "lucide-react";
import { useAppStore } from "./store";
import { Button } from "@/components/ui/button";

function App() {
  const location = useLocation();
  const { session, authLoading, checkSession, subscribeToAuth } = useAppStore();

  // Проверка авторизации
  useEffect(() => {
    // Проверяем текущую сессию
    checkSession();

    // Слушаем изменения авторизации
    const unsubscribe = subscribeToAuth();

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Functions from store are stable, don't need to be in deps

  // Показываем загрузку только для auth
  if (authLoading) {
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
          <Button asChild size="sm">
            <Link to="/profile">
              <User className="h-4 w-4 mr-2" />
              Профиль
            </Link>
          </Button>
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

