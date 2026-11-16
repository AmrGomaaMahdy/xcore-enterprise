import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const THEMES = [
  { id: 'classic', label: 'Classic light' },
  { id: 'desert', label: 'Desert gold' },
  { id: 'azure', label: 'Azure sky' },
  { id: 'dark', label: 'Dark' },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'xcore.theme';
const ThemeContext = createContext<{ theme: ThemeId; setTheme: (t: ThemeId) => void }>({
  theme: 'classic',
  setTheme: () => {},
});

function initial(): ThemeId {
  try {
    const saved = localStorage.getItem(KEY) as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    /* storage may be blocked */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'classic';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
