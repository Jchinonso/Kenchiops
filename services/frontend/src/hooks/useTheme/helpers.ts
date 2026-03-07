import type { ThemePreference, ResolvedTheme } from "./types";

const STORAGE_KEY = "kenchi_theme";
const DARK_CLASS = "dark";

const VALID_PREFERENCES: ReadonlySet<string> = new Set(["light", "dark", "system"]);

export const getSystemPreference = (): ResolvedTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const readStoredPreference = (): ThemePreference => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && VALID_PREFERENCES.has(stored) ? (stored as ThemePreference) : "dark";
};

export const storePreference = (preference: ThemePreference): void => {
  localStorage.setItem(STORAGE_KEY, preference);
};

export const applyTheme = (resolved: ResolvedTheme): void => {
  const { classList } = document.documentElement;
  if (resolved === "dark") {
    classList.add(DARK_CLASS);
  } else {
    classList.remove(DARK_CLASS);
  }
};
