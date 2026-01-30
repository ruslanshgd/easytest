import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'light' | 'dark';
  initTheme: () => void;
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
  
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  
  // Также применяем класс для совместимости
  root.classList.remove('light', 'dark');
  root.classList.add(effectiveTheme);
};

// Загрузка темы из localStorage
const loadThemeFromStorage = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem('figma-analytics-theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
};

// Сохранение темы в localStorage
const saveThemeToStorage = (theme: Theme) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('figma-analytics-theme', theme);
};

export const useThemeStore = create<ThemeStore>()((set, get) => {
  // Инициализация из localStorage
  const initialTheme = loadThemeFromStorage();
  applyTheme(initialTheme);
  const initialEffectiveTheme = initialTheme === 'system' ? getSystemTheme() : initialTheme;
  
  return {
    theme: initialTheme,
    effectiveTheme: initialEffectiveTheme,
    
    setTheme: (theme: Theme) => {
      applyTheme(theme);
      saveThemeToStorage(theme);
      const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
      set({ theme, effectiveTheme });
    },
    
    initTheme: () => {
      const { theme } = get();
      applyTheme(theme);
      const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
      set({ effectiveTheme });
      
      // Подписаться на изменения системной темы
      if (typeof window !== 'undefined' && theme === 'system') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
          const { theme: currentTheme } = get();
          if (currentTheme === 'system') {
            const newEffectiveTheme = mediaQuery.matches ? 'dark' : 'light';
            applyTheme('system');
            set({ effectiveTheme: newEffectiveTheme });
          }
        };
        
        mediaQuery.addEventListener('change', handleChange);
        
        // Возвращаем функцию очистки (будет вызвана при размонтировании)
        return () => mediaQuery.removeEventListener('change', handleChange);
      }
    },
  };
});
