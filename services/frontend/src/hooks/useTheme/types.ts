export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface UseThemeResult {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setTheme: (theme: ThemePreference) => void;
}
