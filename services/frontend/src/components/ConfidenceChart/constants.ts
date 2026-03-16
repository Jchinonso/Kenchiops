import type { ChartConfig } from "@/components/ui/chart";

export const CHART_CONFIG: ChartConfig = {
  count: {
    label: "Analyses",
  },
} as const;

export const LEVEL_COLORS: Readonly<Record<string, string>> = {
  high: "#22c55e",
  medium: "#f59e0b",
  low: "#ef4444",
} as const;

export const LEVEL_LABELS: Readonly<Record<string, string>> = {
  high: "High (80%+)",
  medium: "Medium (50-79%)",
  low: "Low (<50%)",
} as const;

export const LEVEL_LABELS_SHORT: Readonly<Record<string, string>> = {
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export const ALL_LEVELS = ["high", "medium", "low"] as const;
