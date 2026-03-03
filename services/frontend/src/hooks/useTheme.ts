/**
 * Theme Hook
 *
 * Manages dark/light/system theme preference with localStorage persistence.
 * Toggles the `dark` class on document.documentElement for Tailwind dark mode.
 */

import { useState, useEffect, useCallback, useMemo } from "react";

// ==================== Types ====================

type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface UseThemeResult {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setTheme: (theme: ThemePreference) => void;
}

// ==================== Constants ====================

const STORAGE_KEY = "kenchi_theme";
const DARK_CLASS = "dark";

const VALID_PREFERENCES: ReadonlySet<string> = new Set(["light", "dark", "system"]);

// ==================== Helpers ====================

const getSystemPreference = (): ResolvedTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const readStoredPreference = (): ThemePreference => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && VALID_PREFERENCES.has(stored) ? (stored as ThemePreference) : "dark";
};

const applyTheme = (resolved: ResolvedTheme): void => {
  const { classList } = document.documentElement;
  if (resolved === "dark") {
    classList.add(DARK_CLASS);
  } else {
    classList.remove(DARK_CLASS);
  }
};

// ==================== Hook ====================

export const useTheme = (): UseThemeResult => {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  // Track system preference changes for "system" mode
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemPreference);

  const resolved = useMemo<ResolvedTheme>(
    () => (preference === "system" ? systemTheme : preference),
    [preference, systemTheme]
  );

  const setTheme = useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    setPreference(next);
  }, []);

  // Apply theme class to DOM whenever resolved changes
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (preference !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemTheme(getSystemPreference());
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preference]);

  return { preference, resolved, setTheme };
};
