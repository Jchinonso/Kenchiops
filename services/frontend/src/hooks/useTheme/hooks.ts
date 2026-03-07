/**
 * Theme Hook
 *
 * Manages dark/light/system theme preference with localStorage persistence.
 * Toggles the `dark` class on document.documentElement for Tailwind dark mode.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { getSystemPreference, readStoredPreference, storePreference, applyTheme } from "./helpers";
import type { ResolvedTheme, UseThemeResult } from "./types";

export const useTheme = (): UseThemeResult => {
  const [preference, setPreference] = useState(readStoredPreference);
  // Track system preference changes for "system" mode
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemPreference);

  const resolved = useMemo<ResolvedTheme>(
    () => (preference === "system" ? systemTheme : preference),
    [preference, systemTheme]
  );

  const setTheme = useCallback((next: Parameters<typeof storePreference>[0]) => {
    storePreference(next);
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

  return useMemo(() => ({ preference, resolved, setTheme }), [preference, resolved, setTheme]);
};
