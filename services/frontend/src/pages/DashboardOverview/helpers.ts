/**
 * Pure helper functions for DashboardOverview.
 */

import type { AnalysisRecord } from "@/hooks/useDashboardData";
import type { PipelineMetricsResponse, ActiveCountBySource } from "@/hooks/useIncidentData";
import type { QuickStat } from "./types";

export const formatAvgConfidence = (
  analyses: readonly AnalysisRecord[]
): {
  readonly label: string;
  readonly subtitle: string;
} => {
  const { length: count } = analyses;
  if (count === 0) {
    return { label: "--", subtitle: "No analyses yet" };
  }
  const confidences = analyses.map((analysis) => analysis.diagnosisConfidence);
  const sum = confidences.reduce((runningSum, confidence) => runningSum + confidence, 0);
  return {
    label: `${Math.round((sum / count) * 100)}%`,
    subtitle: `From last ${count} analyses`,
  };
};

export const buildRepoSubtitle = (githubCount: number, gitlabCount: number): string => {
  const total = githubCount + gitlabCount;
  if (total === 0) {
    return "None connected yet";
  }
  const parts: readonly string[] = [
    ...(githubCount > 0 ? [`${githubCount} GitHub`] : []),
    ...(gitlabCount > 0 ? [`${gitlabCount} GitLab`] : []),
  ];
  return parts.join(" \u00B7 ");
};

/**
 * Builds the quick stats array. Accepts pre-computed icon elements from the
 * calling component so this file stays free of JSX / React imports.
 */
export const buildQuickStats = (
  stats: {
    readonly totalFailures: number;
    readonly totalAnalyses: number;
    readonly connectedRepos: number;
    readonly gitlabProjectCount: number;
  } | null,
  avgConfidence: { readonly label: string; readonly subtitle: string },
  triageStats: PipelineMetricsResponse | null,
  icons: {
    readonly failures: React.ReactNode;
    readonly analyses: React.ReactNode;
    readonly confidence: React.ReactNode;
    readonly repos: React.ReactNode;
    readonly alerts: React.ReactNode;
    readonly triaged: React.ReactNode;
  },
  sourceBreakdown?: readonly ActiveCountBySource[] | null
): readonly QuickStat[] => [
  {
    title: "Failures",
    value: stats ? String(stats.totalFailures) : "--",
    subtitle: stats
      ? `${stats.totalFailures === 0 ? "No failures detected" : "Total detected"}`
      : "Loading...",
    href: "/dashboard/cicd/analyses",
    icon: icons.failures,
    colorClass: "bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/25",
  },
  {
    title: "Analyses",
    value: stats ? String(stats.totalAnalyses) : "--",
    subtitle: stats
      ? `${stats.totalAnalyses === 0 ? "No analyses yet" : "Total completed"}`
      : "Loading...",
    href: "/dashboard/cicd/analyses",
    icon: icons.analyses,
    colorClass: "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25",
  },
  {
    title: "Confidence",
    value: avgConfidence.label,
    subtitle: avgConfidence.subtitle,
    href: "/dashboard/cicd/analyses",
    icon: icons.confidence,
    colorClass: "bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/25",
  },
  {
    title: "Repositories",
    value: stats ? String(stats.connectedRepos + stats.gitlabProjectCount) : "--",
    subtitle: stats
      ? buildRepoSubtitle(stats.connectedRepos, stats.gitlabProjectCount)
      : "Loading...",
    href: "/dashboard/cicd/pipelines",
    icon: icons.repos,
    colorClass: "bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/25",
  },
  {
    title: "Active Alerts",
    value: triageStats ? String(triageStats.dedup.activeAlerts) : "--",
    subtitle: triageStats ? "Require attention" : "Loading...",
    href: "/dashboard/incidents/active",
    icon: icons.alerts,
    colorClass: "bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25",
    sourceBreakdown: sourceBreakdown ?? undefined,
  },
  {
    title: "Triaged",
    value: triageStats ? String(triageStats.pipeline.totalTriaged) : "--",
    subtitle: triageStats ? "Total triaged" : "Loading...",
    href: "/dashboard/incidents/active",
    icon: icons.triaged,
    colorClass: "bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/25",
  },
];

/** Characters that trigger formula interpretation in spreadsheet applications (DDE injection). */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

const escapeCSVField = (field: string): string => {
  const sanitized = field.length > 0 && FORMULA_TRIGGER_CHARS.has(field[0]) ? `'${field}` : field;
  const needsQuoting =
    sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n");
  return needsQuoting ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
};

export const handleExportOverview = (quickStats: readonly QuickStat[]): void => {
  const rows = [["Metric", "Value"], ...quickStats.map((stat) => [stat.title, stat.value])];
  const csv = rows.map((row) => row.map(escapeCSVField).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), {
    href: url,
    download: "kenchi-overview.csv",
  });
  anchor.click();
  URL.revokeObjectURL(url);
};
