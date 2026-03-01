/**
 * Enhanced theme selector with miniature UI previews showing what each mode looks like.
 * Features layout animation on the active indicator and spring hover/tap effects.
 */

import { motion } from "motion/react";
import { Check, Sun } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { itemVariants, microSpring } from "@/lib/animations";

type ThemeMode = "light" | "dark" | "system";

interface ThemeSelectorProps {
  readonly preference: ThemeMode;
  readonly onSetTheme: (theme: ThemeMode) => void;
}

interface ThemePreviewProps {
  readonly mode: ThemeMode;
  readonly active: boolean;
  readonly onClick: () => void;
}

const THEME_LABELS: Readonly<Record<ThemeMode, string>> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ThemePreview = ({ mode, active, onClick }: ThemePreviewProps) => {
  const isDark = mode === "dark";
  const isSystem = mode === "system";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col items-center gap-3 p-2.5 rounded-xl border-2 transition-colors cursor-pointer",
        active
          ? "border-indigo-500 shadow-md shadow-indigo-500/10"
          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
      )}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={microSpring}
    >
      {/* Mini UI preview */}
      <div
        className={cn(
          "w-full aspect-[4/3] rounded-lg overflow-hidden border",
          isDark
            ? "bg-zinc-900 border-zinc-700"
            : isSystem
              ? "bg-gradient-to-r from-white to-gray-900 border-zinc-300 dark:border-zinc-600"
              : "bg-white border-zinc-200"
        )}
      >
        <div className="flex h-full p-1.5 gap-1">
          {/* Sidebar */}
          <div
            className={cn(
              "w-1/4 rounded-sm",
              isDark ? "bg-zinc-800" : isSystem ? "bg-zinc-200" : "bg-zinc-100"
            )}
          />
          {/* Content area */}
          <div className="flex-1 flex flex-col gap-1">
            <div
              className={cn(
                "h-1.5 w-3/4 rounded-sm",
                isDark ? "bg-zinc-700" : isSystem ? "bg-zinc-300" : "bg-zinc-200"
              )}
            />
            <div
              className={cn(
                "h-1.5 w-1/2 rounded-sm",
                isDark ? "bg-zinc-700" : isSystem ? "bg-zinc-300" : "bg-zinc-200"
              )}
            />
            <div
              className={cn(
                "flex-1 rounded-sm opacity-50",
                isDark ? "bg-zinc-700" : isSystem ? "bg-zinc-300" : "bg-zinc-200"
              )}
            />
          </div>
        </div>
      </div>

      {/* Label + active check */}
      <div className="flex items-center gap-1.5">
        {active && (
          <motion.div
            layoutId="theme-check"
            className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center"
            transition={microSpring}
          >
            <Check className="w-2.5 h-2.5 text-white" />
          </motion.div>
        )}
        <span
          className={cn(
            "text-sm font-medium",
            active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"
          )}
        >
          {THEME_LABELS[mode]}
        </span>
      </div>
    </motion.button>
  );
};

export const ThemeSelector = ({ preference, onSetTheme }: ThemeSelectorProps) => (
  <motion.div variants={itemVariants}>
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Sun className="w-5 h-5 text-amber-500" />
          <CardTitle>Appearance</CardTitle>
        </div>
        <CardDescription>Choose your preferred theme.</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-3 gap-3">
          <ThemePreview
            mode="light"
            active={preference === "light"}
            onClick={() => onSetTheme("light")}
          />
          <ThemePreview
            mode="dark"
            active={preference === "dark"}
            onClick={() => onSetTheme("dark")}
          />
          <ThemePreview
            mode="system"
            active={preference === "system"}
            onClick={() => onSetTheme("system")}
          />
        </div>
      </CardContent>
    </Card>
  </motion.div>
);
