import { useTheme } from "@/hooks/useTheme";

/** Initializes theme (dark class on html) at the app root. Renders nothing. */
const ThemeInitializer = () => {
  useTheme();
  return null;
};

export default ThemeInitializer;
