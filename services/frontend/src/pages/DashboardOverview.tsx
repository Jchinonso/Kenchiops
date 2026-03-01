/**
 * Dashboard Overview Content
 *
 * Shows quick stats, onboarding checklist, and recent activity
 * on the main dashboard overview page (/dashboard).
 */

import { Link } from "react-router-dom";
import {
  useDashboardStats,
  useAnalyses,
  useFailures,
  useTenantInfo,
  type AnalysisRecord,
  type EventRecord,
} from "@/hooks/useDashboardData";
import {
  useTriageStats,
  useActiveCountsBySource,
  useBalancedRecentIncidents,
  useSeverityDistributionBySource,
  type IncidentAlertRecord,
  type PipelineMetricsResponse,
  type ActiveCountBySource,
} from "@/hooks/useIncidentData";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  truncateText,
  getConfidenceLabel,
  getConfidenceStyle,
  getSeverityStyle,
  extractRepoFromKey,
  getPayloadString,
  titleCase,
} from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import {
  AlertTriangle,
  Zap,
  Clock,
  FolderGit2,
  Github,
  Gitlab,
  Rocket,
  ExternalLink,
  Activity,
  Search,
  MessageSquare,
  X,
  CheckCircle2,
  Download,
  RefreshCw,
  Siren,
  ShieldCheck,
} from "lucide-react";
import { FeatureGate } from "@/components/FeatureGate";
import { ConfidenceChart } from "@/components/ConfidenceChart";
import { ConfidenceTrendChart } from "@/components/ConfidenceTrendChart";
import { SeverityDistributionChart } from "@/components/SeverityDistributionChart";

// ==================== Constants ====================

interface OnboardingStep {
  readonly title: string;
  readonly description: string;
  readonly completedDescription: string;
  readonly ctaLabel: string;
  readonly href: string;
  readonly external?: boolean;
  readonly icon: React.ReactNode;
  readonly completed: boolean;
}

const buildOnboardingSteps = (
  githubConnected: boolean,
  gitlabConnected: boolean,
  slackConnected: boolean,
  hasAnalyses: boolean
): readonly OnboardingStep[] => [
  {
    title: "Connect a CI Provider",
    description: "Connect GitHub or GitLab to start monitoring your CI/CD pipelines.",
    completedDescription: `${githubConnected ? "GitHub" : "GitLab"} connected and receiving webhooks.`,
    ctaLabel: githubConnected || gitlabConnected ? "Manage Integrations" : "Connect Provider",
    href: "/dashboard/integrations",
    icon: githubConnected ? (
      <Github className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
    ) : (
      <Gitlab className="w-5 h-5 text-orange-500" />
    ),
    completed: githubConnected || gitlabConnected,
  },
  {
    title: "Connect Slack (optional)",
    description: "Get failure alerts and analysis results delivered to your team's Slack channels.",
    completedDescription: "Slack is connected and receiving notifications.",
    ctaLabel: slackConnected ? "Manage Slack" : "Add to Slack",
    href: "/dashboard/settings",
    icon: <MessageSquare className="w-5 h-5 text-purple-600" />,
    completed: slackConnected,
  },
  {
    title: "Your First Analysis",
    description: "Once connected, Kenchi automatically analyzes CI failures on every push.",
    completedDescription: "Kenchi has analyzed CI failures from your repos.",
    ctaLabel: "View Analyses",
    href: "/dashboard/cicd/analyses",
    icon: <Zap className="w-5 h-5 text-amber-500" />,
    completed: hasAnalyses,
  },
];

interface QuickStat {
  readonly title: string;
  readonly value: string;
  readonly subtitle: string;
  readonly href: string;
  readonly icon: React.ReactNode;
  readonly colorClass: string;
  readonly sourceBreakdown?: readonly ActiveCountBySource[];
}

const formatAvgConfidence = (
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

const buildRepoSubtitle = (githubCount: number, gitlabCount: number): string => {
  const total = githubCount + gitlabCount;
  if (total === 0) {
    return "None connected yet";
  }
  const parts: string[] = [];
  if (githubCount > 0) {
    parts.push(`${githubCount} GitHub`);
  }
  if (gitlabCount > 0) {
    parts.push(`${gitlabCount} GitLab`);
  }
  return parts.join(" · ");
};

const buildQuickStats = (
  stats: {
    readonly totalFailures: number;
    readonly totalAnalyses: number;
    readonly connectedRepos: number;
    readonly gitlabProjectCount: number;
  } | null,
  avgConfidence: { readonly label: string; readonly subtitle: string },
  triageStats: PipelineMetricsResponse | null,
  sourceBreakdown?: readonly ActiveCountBySource[] | null
): readonly QuickStat[] => [
  {
    title: "Failures",
    value: stats ? String(stats.totalFailures) : "--",
    subtitle: stats
      ? `${stats.totalFailures === 0 ? "No failures detected" : "Total detected"}`
      : "Loading...",
    href: "/dashboard/cicd/analyses",
    icon: <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/25",
  },
  {
    title: "Analyses",
    value: stats ? String(stats.totalAnalyses) : "--",
    subtitle: stats
      ? `${stats.totalAnalyses === 0 ? "No analyses yet" : "Total completed"}`
      : "Loading...",
    href: "/dashboard/cicd/analyses",
    icon: <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25",
  },
  {
    title: "Confidence",
    value: avgConfidence.label,
    subtitle: avgConfidence.subtitle,
    href: "/dashboard/cicd/analyses",
    icon: <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/25",
  },
  {
    title: "Repositories",
    value: stats ? String(stats.connectedRepos + stats.gitlabProjectCount) : "--",
    subtitle: stats
      ? buildRepoSubtitle(stats.connectedRepos, stats.gitlabProjectCount)
      : "Loading...",
    href: "/dashboard/cicd/pipelines",
    icon: <FolderGit2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/25",
  },
  {
    title: "Active Alerts",
    value: triageStats ? String(triageStats.dedup.activeAlerts) : "--",
    subtitle: triageStats ? "Require attention" : "Loading...",
    href: "/dashboard/incidents/active",
    icon: <Siren className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25",
    sourceBreakdown: sourceBreakdown ?? undefined,
  },
  {
    title: "Triaged",
    value: triageStats ? String(triageStats.pipeline.totalTriaged) : "--",
    subtitle: triageStats ? "Total triaged" : "Loading...",
    href: "/dashboard/incidents/active",
    icon: <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/25",
  },
];

// ==================== Provider Display Helpers ====================

const EVENT_SOURCE_LABELS: Readonly<Record<string, string>> = {
  "github-app": "GitHub",
  gitlab: "GitLab",
} as const;

const getEventSourceLabel = (source: string): string | null => EVENT_SOURCE_LABELS[source] ?? null;

const ANALYSIS_PROVIDER_LABELS: Readonly<Record<string, string>> = {
  github_actions: "GitHub",
  gitlab_ci: "GitLab",
} as const;

const getAnalysisProviderLabel = (ciProvider: string | null): string | null =>
  ciProvider ? (ANALYSIS_PROVIDER_LABELS[ciProvider] ?? null) : null;

// ==================== Component ====================

interface DashboardOverviewProps {
  readonly firstName: string;
  readonly showOnboarding: boolean;
  readonly dismissOnboarding: () => void;
  readonly refreshKey?: number;
}

export const DashboardOverview = ({
  firstName,
  showOnboarding,
  dismissOnboarding,
  refreshKey = 0,
}: DashboardOverviewProps) => {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useDashboardStats(refreshKey);
  const {
    data: recentAnalyses,
    isLoading: analysesLoading,
    error: analysesError,
    refetch: refetchAnalyses,
  } = useAnalyses({ limit: 5, offset: 0, refreshKey });
  const {
    data: recentFailures,
    isLoading: failuresLoading,
    error: failuresError,
    refetch: refetchFailures,
  } = useFailures({ limit: 5, offset: 0, refreshKey });
  const { data: tenant } = useTenantInfo(refreshKey);
  const tenantId = tenant?.id ?? "";
  const { data: triageStats } = useTriageStats(tenantId, refreshKey);
  const { data: activeCountsBySource } = useActiveCountsBySource(tenantId, refreshKey);
  const { data: severityBySource } = useSeverityDistributionBySource(tenantId, refreshKey);
  const { data: balancedIncidents, isLoading: incidentsLoading } = useBalancedRecentIncidents(
    tenantId,
    2,
    6,
    refreshKey
  );

  const failureItems = recentFailures?.items ?? [];
  const analysisItems = recentAnalyses?.items ?? [];
  const incidentItems = balancedIncidents ?? [];
  const quickStats = buildQuickStats(
    stats,
    formatAvgConfidence(analysisItems),
    triageStats,
    activeCountsBySource
  );
  const hasActivity =
    failureItems.length > 0 || analysisItems.length > 0 || incidentItems.length > 0;
  const activityLoading = analysesLoading || failuresLoading || incidentsLoading;
  const activityCardCount =
    (failureItems.length > 0 ? 1 : 0) +
    (analysisItems.length > 0 ? 1 : 0) +
    (incidentItems.length > 0 ? 1 : 0);
  const activityGridCols =
    activityCardCount === 1
      ? "grid-cols-1"
      : activityCardCount === 2
        ? "grid-cols-1 lg:grid-cols-2"
        : "grid-cols-1 lg:grid-cols-3";

  const onboardingSteps = buildOnboardingSteps(
    tenant?.githubConnected ?? false,
    tenant?.gitlabConnected ?? false,
    tenant?.slackConnected ?? false,
    (stats?.totalAnalyses ?? 0) > 0
  );
  const completedCount = onboardingSteps.filter((step) => step.completed).length;
  const allStepsComplete = completedCount === onboardingSteps.length;

  // Zero-data state: brand new user with no data from any provider.
  // Also treat as new user when stats fail to load AND tenant has no connections —
  // shows the clean welcome state instead of error cards for fresh accounts.
  const noConnections = tenant !== null && !tenant.githubConnected && !tenant.gitlabConnected;
  const hasZeroStats =
    stats !== null &&
    stats.totalAnalyses + stats.totalFailures + stats.connectedRepos + stats.gitlabProjectCount ===
      0;
  const isNewUser = !statsLoading && (hasZeroStats || (statsError !== null && noConnections));

  const handleExportOverview = () => {
    const rows = [["Metric", "Value"], ...quickStats.map((stat) => [stat.title, stat.value])];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kenchi-overview.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-6 sm:mb-8 flex items-start justify-between gap-4 opacity-0 animate-fade-in">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Welcome back, {firstName}!
          </h1>
          <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400/80 mt-1">
            Here&apos;s your pipeline and incident health at a glance.
          </p>
        </div>
        {!statsLoading && stats && (
          <button
            type="button"
            onClick={handleExportOverview}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800/80 backdrop-blur-sm border border-zinc-200 dark:border-zinc-700/60 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export Dashboard
          </button>
        )}
      </div>

      {/* Quick Stats Grid — suppress error card for new users (show zero-data state below instead) */}
      {statsError && !isNewUser ? (
        <Card className="mb-6 sm:mb-8">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400">{statsError}</p>
            <button
              type="button"
              onClick={refetchStats}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
          {quickStats.map((stat, statIndex) => (
            <Link
              key={stat.title}
              to={stat.href}
              className="block group opacity-0 animate-fade-in"
              style={{ animationDelay: `${statIndex * 60}ms` }}
            >
              <Card className="py-4 sm:py-5 h-full group-hover:border-indigo-300 dark:group-hover:border-indigo-700 group-hover:shadow-lg group-hover:-translate-y-1 group-active:scale-[0.98] transition-all duration-300">
                <CardContent className="px-4 sm:px-6 h-full">
                  <div className="flex items-start justify-between gap-3 h-full">
                    <div className="min-w-0">
                      <p
                        className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 truncate"
                        title={stat.title}
                      >
                        {stat.title}
                      </p>
                      {statsLoading ? (
                        <Skeleton className="h-7 w-12 mt-1" />
                      ) : (
                        <>
                          <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                            {stat.value}
                          </p>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                            {stat.subtitle}
                          </p>
                          {stat.sourceBreakdown && stat.sourceBreakdown.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {stat.sourceBreakdown.map((entry) => (
                                <span
                                  key={entry.source}
                                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                                >
                                  {titleCase(entry.source)} {entry.activeCount}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 ${stat.colorClass} rounded-full flex items-center justify-center flex-shrink-0`}
                    >
                      {stat.icon}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Onboarding — placed before charts so it's visible above the fold */}
      {showOnboarding && completedCount >= 2 && !allStepsComplete ? (
        <div className="mb-6 sm:mb-8 flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 backdrop-blur-sm">
          <Rocket className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-shrink-0">
                Setup {completedCount}/{onboardingSteps.length}
              </span>
              <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${(completedCount / onboardingSteps.length) * 100}%` }}
                />
              </div>
            </div>
            {onboardingSteps
              .filter((step) => !step.completed)
              .map((step) => (
                <div key={step.title} className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Next:</span>
                  {step.external ? (
                    <a
                      href={step.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
                    >
                      {step.title} &rarr;
                    </a>
                  ) : (
                    <Link
                      to={step.href}
                      className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
                    >
                      {step.title} &rarr;
                    </Link>
                  )}
                </div>
              ))}
          </div>
          <button
            onClick={dismissOnboarding}
            className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
            aria-label="Dismiss setup checklist"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : showOnboarding && !allStepsComplete ? (
        <Card className="mb-6 sm:mb-8">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-indigo-500" />
                <CardTitle>
                  <h2>Get Set Up</h2>
                </CardTitle>
              </div>
              <button
                onClick={dismissOnboarding}
                className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                aria-label="Dismiss setup checklist"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardDescription>
              {allStepsComplete
                ? "You're all set! Kenchi is monitoring your CI/CD pipelines."
                : "Complete these steps to start analyzing your CI/CD failures."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {onboardingSteps.map((step, stepIndex) => (
                <div
                  key={step.title}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-lg border transition-colors",
                    step.completed
                      ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/30"
                      : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                  )}
                >
                  <div className="flex-shrink-0 mt-1">
                    {step.completed ? (
                      <div className="ring-2 ring-green-500/20 rounded-full">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      </div>
                    ) : (
                      step.icon
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4
                      className={cn(
                        "font-medium text-sm mb-1",
                        step.completed
                          ? "text-green-800 dark:text-green-300"
                          : "text-zinc-900 dark:text-zinc-100"
                      )}
                    >
                      {stepIndex + 1}. {step.title}
                    </h4>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                      {step.completed ? step.completedDescription : step.description}
                    </p>
                    {step.external ? (
                      <a
                        href={step.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                          step.completed
                            ? "text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                            : "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/20"
                        )}
                      >
                        {step.ctaLabel}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <Link
                        to={step.href}
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                      >
                        {step.ctaLabel}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Zero-data welcome state for brand new users */}
      {isNewUser && !showOnboarding && (
        <Card className="mb-6 sm:mb-8">
          <CardContent className="py-12 text-center">
            <div className="relative mx-auto mb-4 w-16 h-16">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%)",
                  transform: "scale(2)",
                }}
              />
              <div className="relative w-full h-full rounded-full flex items-center justify-center border border-amber-500/20 bg-amber-500/10">
                <Rocket className="w-7 h-7 text-amber-400" />
              </div>
            </div>
            <h2 className="text-lg font-display font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              Welcome to Kenchi
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mb-4">
              Connect your repositories to start analyzing CI/CD failures automatically.
            </p>
            <Link
              to="/dashboard/integrations"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-all duration-200 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
            >
              Connect a CI Provider
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity — suppress error card for new users */}
      {(failuresError || analysesError) && !activityLoading && !isNewUser ? (
        <Card className="mb-6 sm:mb-8">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400">
              {failuresError ?? analysesError}
            </p>
            <button
              type="button"
              onClick={() => {
                if (failuresError) {
                  refetchFailures();
                }
                if (analysesError) {
                  refetchAnalyses();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </CardContent>
        </Card>
      ) : activityLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {Array.from({ length: 3 }, (_, cardIndex) => (
            <Card key={`skel-card-${cardIndex}`}>
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-5 w-32" />
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {Array.from({ length: 3 }, (_unused, rowIndex) => (
                  <div key={`skel-row-${cardIndex}-${rowIndex}`} className="space-y-1.5 py-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !hasActivity ? (
        <Card className="mb-6 sm:mb-8">
          <CardHeader className="border-b">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <CardTitle>
                <h2>Recent Activity</h2>
              </CardTitle>
            </div>
            <CardDescription>
              CI failures, analyses, and incidents from your connected repositories.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-12 text-center">
            <Activity className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              No recent activity
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              Activity from your connected repositories will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "grid gap-4 sm:gap-6 mb-6 sm:mb-8 opacity-0 animate-fade-in",
            activityGridCols
          )}
          style={{ animationDelay: "400ms" }}
        >
          {failureItems.length > 0 && (
            <Card className="border-t-2 border-t-red-500/40">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <CardTitle>
                    <h2>Recent Failures</h2>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {failureItems.map((event: EventRecord) => {
                    const sourceLabel = getEventSourceLabel(event.source);
                    return (
                      <Link
                        key={event.id}
                        to="/dashboard/cicd/analyses"
                        className="block py-3 first:pt-2 last:pb-1 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 -mx-6 px-6 transition-colors duration-200"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <TimeDisplay
                            dateTime={event.timestamp}
                            className="text-xs text-zinc-400 dark:text-zinc-400"
                          />
                          <div className="flex items-center gap-1.5">
                            {sourceLabel && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {sourceLabel}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                getSeverityStyle(event.severity)
                              )}
                            >
                              {titleCase(event.severity ?? "unknown")}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {getPayloadString(event.payload, "repository")}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {getPayloadString(event.payload, "checkName")}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
              <CardFooter className="border-t">
                <Link
                  to="/dashboard/cicd/analyses"
                  className="group/link inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                >
                  View all failures
                  <span className="transition-transform duration-200 group-hover/link:translate-x-0.5">
                    &rarr;
                  </span>
                </Link>
              </CardFooter>
            </Card>
          )}

          {analysisItems.length > 0 && (
            <Card className="border-t-2 border-t-indigo-500/40">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-indigo-500" />
                  <CardTitle>
                    <h2>Recent Analyses</h2>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {analysisItems.map((analysis: AnalysisRecord) => {
                    const providerLabel = getAnalysisProviderLabel(analysis.ciProvider);
                    return (
                      <Link
                        key={analysis.id}
                        to="/dashboard/cicd/analyses"
                        className="block py-3 first:pt-2 last:pb-1 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 -mx-6 px-6 transition-colors duration-200"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <TimeDisplay
                            dateTime={analysis.createdAt}
                            className="text-xs text-zinc-400 dark:text-zinc-400"
                          />
                          <div className="flex items-center gap-1.5">
                            {providerLabel && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {providerLabel}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                getConfidenceStyle(analysis.diagnosisConfidence)
                              )}
                            >
                              {getConfidenceLabel(analysis.diagnosisConfidence)}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis)}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {truncateText(analysis.summary, 60)}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
              <CardFooter className="border-t">
                <Link
                  to="/dashboard/cicd/analyses"
                  className="group/link inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                >
                  View all analyses
                  <span className="transition-transform duration-200 group-hover/link:translate-x-0.5">
                    &rarr;
                  </span>
                </Link>
              </CardFooter>
            </Card>
          )}

          {incidentItems.length > 0 && (
            <Card className="border-t-2 border-t-orange-500/40">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <Siren className="w-5 h-5 text-orange-500" />
                  <CardTitle>
                    <h2>Recent Incidents</h2>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {incidentItems.map((incident: IncidentAlertRecord) => (
                    <Link
                      key={incident.id}
                      to="/dashboard/incidents/active"
                      className="block py-3 first:pt-2 last:pb-1 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 -mx-6 px-6 transition-colors duration-200"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <TimeDisplay
                          dateTime={incident.receivedAt}
                          className="text-xs text-zinc-400 dark:text-zinc-400"
                        />
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            getSeverityStyle(incident.severity)
                          )}
                        >
                          {titleCase(incident.severity)}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {truncateText(incident.title, 60)}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {titleCase(incident.source)}
                      </p>
                    </Link>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="border-t">
                <Link
                  to="/dashboard/incidents/active"
                  className="group/link inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                >
                  View all incidents
                  <span className="transition-transform duration-200 group-hover/link:translate-x-0.5">
                    &rarr;
                  </span>
                </Link>
              </CardFooter>
            </Card>
          )}
        </div>
      )}

      {/* Charts — gated to Team+ plans */}
      <FeatureGate feature="teamAnalytics">
        <ConfidenceTrendChart refreshKey={refreshKey} />
        <ConfidenceChart refreshKey={refreshKey} />
        <SeverityDistributionChart
          distribution={triageStats?.severityDistribution ?? null}
          distributionBySource={severityBySource ?? null}
          isLoading={!triageStats && !!tenantId}
        />
      </FeatureGate>
    </>
  );
};
