import type { ChartConfig } from "@/components/ui/chart";

export const CHART_CONFIG: ChartConfig = {
  count: {
    label: "Incidents",
  },
} as const;

export const SEVERITY_COLORS: Readonly<Record<string, string>> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
} as const;

export const SOURCE_COLORS: Readonly<Record<string, string>> = {
  pagerduty: "#06b6d4",
  datadog: "#8b5cf6",
  grafana: "#f59e0b",
  prometheus: "#ef4444",
  vercel: "#171717",
  netlify: "#00c7b7",
} as const;

export const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

export const SEVERITY_LABELS: Readonly<Record<string, string>> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
} as const;

/** Max time to show skeleton before giving up (ms) */
export const LOADING_TIMEOUT_MS = 5_000;
