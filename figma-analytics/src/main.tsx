import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { useThemeStore } from "./store/themeStore";

// Инициализация темы перед рендерингом
const initTheme = () => {
  const { initTheme } = useThemeStore.getState();
  initTheme();
  
  // Подписка на изменения системной темы
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const { theme } = useThemeStore.getState();
      if (theme === 'system') {
        initTheme();
      }
    };
    mediaQuery.addEventListener('change', handleChange);
  }
};

// Инициализируем тему сразу
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter
    future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    }}
  >
    <App />
  </BrowserRouter>
);

