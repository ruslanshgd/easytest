import * as React from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useThemeStore, type Theme } from "@/store/themeStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Label } from "./label";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme, effectiveTheme } = useThemeStore();
  
  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: 'Светлая',
      icon: <Sun className="h-4 w-4" />,
    },
    {
      value: 'dark',
      label: 'Темная',
      icon: <Moon className="h-4 w-4" />,
    },
    {
      value: 'system',
      label: 'Системная',
      icon: <Monitor className="h-4 w-4" />,
    },
  ];
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {themes.map((themeOption) => {
          const isSelected = theme === themeOption.value;
          return (
            <button
              key={themeOption.value}
              onClick={() => setTheme(themeOption.value)}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-input bg-background hover:bg-muted"
              )}
              aria-label={themeOption.label}
            >
              <div className={cn(
                "transition-colors",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}>
                {themeOption.icon}
              </div>
              <span className={cn(
                "text-xs font-medium",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}>
                {themeOption.label}
              </span>
            </button>
          );
        })}
      </div>
      {theme === 'system' && (
        <p className="text-xs text-muted-foreground">
          Текущая тема: {effectiveTheme === 'dark' ? 'Темная' : 'Светлая'} (определяется системными настройками)
        </p>
      )}
    </div>
  );
}
