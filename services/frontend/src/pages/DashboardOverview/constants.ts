/**
 * Constants and label lookup helpers for DashboardOverview.
 */

export const EVENT_SOURCE_LABELS: Readonly<Record<string, string>> = {
  "github-app": "GitHub",
  gitlab: "GitLab",
} as const;

export const getEventSourceLabel = (source: string): string | null =>
  EVENT_SOURCE_LABELS[source] ?? null;

export const ANALYSIS_PROVIDER_LABELS: Readonly<Record<string, string>> = {
  github_actions: "GitHub",
  gitlab_ci: "GitLab",
} as const;

export const getAnalysisProviderLabel = (ciProvider: string | null): string | null =>
  ciProvider ? (ANALYSIS_PROVIDER_LABELS[ciProvider] ?? null) : null;
