import type { ShortcutGroup } from "./types";

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    label: "General",
    shortcuts: [
      { key: "Ctrl+K", description: "Open command palette" },
      { key: "?", description: "Show keyboard shortcuts" },
      { key: "Esc", description: "Close dialogs and menus" },
      { key: "t", description: "Toggle light / dark theme" },
      { key: "r", description: "Refresh dashboard data" },
    ],
  },
  {
    label: "Navigation",
    shortcuts: [
      { key: "g then o", description: "Go to Overview" },
      { key: "g then f", description: "Go to Failures" },
      { key: "g then a", description: "Go to Analyses" },
    ],
  },
  {
    label: "Tables",
    shortcuts: [{ key: "/", description: "Focus repository filter" }],
  },
];
