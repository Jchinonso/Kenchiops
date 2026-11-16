/**
 * Constants for the metrics page.
 */

import type { ChartConfig } from "@/components/ui/chart";

/** Lookback window (days) for the MTTR trend chart. */
export const TREND_DAYS = 30;

/** Recharts config for the time-to-triage trend line. */
export const TREND_CHART_CONFIG: ChartConfig = {
  medianMinutes: {
    label: "Median time-to-triage (min)",
    color: "#6366f1",
  },
} as const;

/** Recharts config for the severity bar chart. */
export const SEVERITY_CHART_CONFIG: ChartConfig = {
  count: {
    label: "Incidents",
  },
} as const;

/** Fixed colors per severity label. */
export const SEVERITY_COLORS: Readonly<Record<string, string>> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#22c55e",
  info: "#3b82f6",
  unknown: "#6b7280",
} as const;
