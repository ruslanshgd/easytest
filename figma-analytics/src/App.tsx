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
import { useThemeStore } from "./store/themeStore";
import { Button } from "@/components/ui/button";

function App() {
  const location = useLocation();
  const { session, authLoading, checkSession, subscribeToAuth } = useAppStore();
  const { initTheme } = useThemeStore();

  // Инициализация темы при монтировании
  useEffect(() => {
    initTheme();
  }, [initTheme]);

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
      <div className="flex items-center justify-center min-h-screen">
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
        <header className="flex justify-between items-center px-6 py-3 border-b border-border bg-background sticky top-0 z-[1000]">
          <Link
            to="/"
            className="text-xl font-semibold text-foreground no-underline"
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
        <Route path="/invite/*" element={<InvitePage />} />
        <Route path="/token" element={<TokenPage />} />
      </Routes>
    </div>
  );
}

export default App;

