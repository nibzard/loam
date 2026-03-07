"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useState,
} from "react";

const THEME_STORAGE_KEY = "loam-theme";
const LEGACY_THEME_STORAGE_KEY = "lawn-theme";
const THEME_LOOK_STORAGE_KEY = "loam-theme-look";

type Theme = "light" | "dark";
type ThemeLook = "brutalist" | "clean";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";

  const attributeTheme = document.documentElement.getAttribute("data-theme");
  if (attributeTheme === "dark" || attributeTheme === "light") {
    return attributeTheme;
  }

  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  const legacyStoredTheme = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacyStoredTheme === "dark" || legacyStoredTheme === "light") {
    localStorage.setItem(THEME_STORAGE_KEY, legacyStoredTheme);
    return legacyStoredTheme;
  }

  return getSystemTheme();
}

function getInitialThemeLook(): ThemeLook {
  if (typeof document === "undefined") return "brutalist";

  const attributeLook = document.documentElement.getAttribute("data-look");
  if (attributeLook === "clean" || attributeLook === "brutalist") {
    return attributeLook;
  }

  const storedLook = localStorage.getItem(THEME_LOOK_STORAGE_KEY);
  if (storedLook === "clean" || storedLook === "brutalist") {
    return storedLook;
  }

  return "brutalist";
}

interface ThemeContextValue {
  theme: Theme;
  themeLook: ThemeLook;
  toggleTheme: () => void;
  toggleThemeLook: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const emptySubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [themeLook, setThemeLook] = useState<ThemeLook>(() => getInitialThemeLook());
  const mounted = useMounted();

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [mounted, theme]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-look", themeLook);
    localStorage.setItem(THEME_LOOK_STORAGE_KEY, themeLook);
  }, [mounted, themeLook]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const toggleThemeLook = useCallback(() => {
    setThemeLook((current) => (current === "brutalist" ? "clean" : "brutalist"));
  }, []);

  // Keyboard shortcut: Ctrl/Cmd + Shift + L
  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        toggleTheme();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, toggleTheme]);

  const value = useMemo(
    () => ({ theme, themeLook, toggleTheme, toggleThemeLook, mounted }),
    [theme, themeLook, toggleTheme, toggleThemeLook, mounted],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
