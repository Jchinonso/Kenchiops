import { cn } from "@/lib/utils";

export const DEBOUNCE_MS = 300;

export const SEVERITY_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "", label: "All Severities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const CONFIDENCE_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: "", label: "All Confidence" },
  { value: "min:0.8", label: "High (80%+)" },
  { value: "min:0.5,max:0.8", label: "Medium (50-80%)" },
  { value: "max:0.5", label: "Low (<50%)" },
];

export const TIME_RANGE_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: "", label: "All Time" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
];

export const INCIDENT_SEVERITY_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: "", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
];

export const SOURCE_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: "", label: "All Sources" },
  { value: "pagerduty", label: "PagerDuty" },
  { value: "datadog", label: "Datadog" },
  { value: "cloudwatch", label: "CloudWatch" },
  { value: "prometheus", label: "Prometheus" },
  { value: "custom", label: "Custom" },
];

export const INCIDENT_STATUS_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: "", label: "All Statuses" },
  { value: "received", label: "Received" },
  { value: "processing", label: "Processing" },
  { value: "triaged", label: "Triaged" },
  { value: "escalated", label: "Escalated" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
];

export const INVESTIGATION_STATUS_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: "", label: "All Statuses" },
  { value: "gathering", label: "Gathering" },
  { value: "analyzing", label: "Analyzing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export const INPUT_CLASS = cn(
  "px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg",
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-100"
);
