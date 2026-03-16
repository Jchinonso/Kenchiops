import type { ChartConfig } from "@/components/ui/chart";

export const CHART_CONFIG: ChartConfig = {
  avgConfidence: {
    label: "Avg Confidence",
    color: "#6366f1",
  },
} as const;

export const BUCKET_OPTIONS = [
  { value: "day" as const, label: "Daily" },
  { value: "week" as const, label: "Weekly" },
] as const;

export const RANGE_OPTIONS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
] as const;

export const MS_PER_DAY = 86_400_000;
