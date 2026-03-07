/**
 * Dashboard Overview Content
 *
 * Shows quick stats, onboarding checklist, and recent activity
 * on the main dashboard overview page (/dashboard).
 */

import { useDashboardStats, useAnalyses, useFailures } from "@/hooks/useDashboardData";
import {
  useTriageStats,
  useActiveCountsBySource,
  useBalancedRecentIncidents,
  useSeverityDistributionBySource,
} from "@/hooks/useIncidentData";
import {
  AlertTriangle,
  Zap,
  Clock,
  FolderGit2,
  Github,
  Gitlab,
  Download,
  MessageSquare,
  Siren,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { FeatureGate } from "@/components/FeatureGate";
import { ConfidenceChart } from "@/components/ConfidenceChart";
import { ConfidenceTrendChart } from "@/components/ConfidenceTrendChart";
import { SeverityDistributionChart } from "@/components/SeverityDistributionChart";

import type { OnboardingStep, DashboardOverviewProps } from "./types";
import { formatAvgConfidence, buildQuickStats, handleExportOverview } from "./helpers";
import { StatCards } from "./StatCards";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { ActivityFeed } from "./ActivityFeed";

// ==================== Onboarding Steps Builder ====================

const buildOnboardingSteps = (
  githubConnected: boolean,
  gitlabConnected: boolean,
  slackConnected: boolean,
  hasAnalyses: boolean,
  isGitHub: boolean
): readonly OnboardingStep[] => {
  const providerName = isGitHub ? "GitHub" : "GitLab";
  const providerConnected = isGitHub ? githubConnected : gitlabConnected;

  return [
    {
      title: `Connect ${providerName}`,
      description: `Connect ${providerName} to start monitoring your CI/CD pipelines.`,
      completedDescription: `${providerName} connected and receiving webhooks.`,
      ctaLabel: providerConnected ? "Manage Integrations" : "Connect Provider",
      href: "/dashboard/integrations",
      icon: isGitHub ? (
        <Github className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
      ) : (
        <Gitlab className="w-5 h-5 text-orange-500" />
      ),
      completed: providerConnected,
    },
    {
      title: "Connect Slack (optional)",
      description:
        "Get failure alerts and analysis results delivered to your team's Slack channels.",
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
};

// ==================== Stat Icons (stable references) ====================

const STAT_ICONS = {
  failures: <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
  analyses: <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
  confidence: <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
  repos: <FolderGit2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
  alerts: <Siren className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
  triaged: <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
} as const;

// ==================== Zero-data Detection ====================

const computeHasZeroStats = (
  statsData: {
    readonly totalAnalyses: number;
    readonly totalFailures: number;
    readonly connectedRepos: number;
    readonly gitlabProjectCount: number;
  } | null
): boolean => {
  if (statsData === null) {
    return false;
  }
  const { totalAnalyses, totalFailures, connectedRepos, gitlabProjectCount } = statsData;
  return totalAnalyses + totalFailures + connectedRepos + gitlabProjectCount === 0;
};

// ==================== Main Component ====================

export const DashboardOverview = ({
  firstName,
  showOnboarding,
  dismissOnboarding,
  tenant: tenantProp = null,
}: DashboardOverviewProps) => {
  const { user } = useAuth();
  const loginProvider = user?.organizations.find((org) => org.isSelected)?.provider ?? "github";
  const isGitHub = loginProvider === "github";

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useDashboardStats();
  const {
    data: recentAnalyses,
    isLoading: analysesLoading,
    error: analysesError,
    refetch: refetchAnalyses,
  } = useAnalyses({ limit: 5, offset: 0 });
  const {
    data: recentFailures,
    isLoading: failuresLoading,
    error: failuresError,
    refetch: refetchFailures,
  } = useFailures({ limit: 5, offset: 0 });
  // Use tenant from parent (Dashboard shell) when available to avoid duplicate API call
  const tenant = tenantProp;
  const tenantId = tenant?.id ?? "";
  const { data: triageStats } = useTriageStats(tenantId);
  const { data: activeCountsBySource } = useActiveCountsBySource(tenantId);
  const { data: severityBySource } = useSeverityDistributionBySource(tenantId);
  const { data: balancedIncidents, isLoading: incidentsLoading } = useBalancedRecentIncidents(
    tenantId,
    2,
    6
  );

  const failureItems = recentFailures?.items ?? [];
  const analysisItems = recentAnalyses?.items ?? [];
  const incidentItems = balancedIncidents ?? [];
  const quickStats = buildQuickStats(
    stats,
    formatAvgConfidence(analysisItems),
    triageStats,
    STAT_ICONS,
    activeCountsBySource
  );
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
    (stats?.totalAnalyses ?? 0) > 0,
    isGitHub
  );
  const completedCount = onboardingSteps.filter((step) => step.completed).length;
  const allStepsComplete = completedCount === onboardingSteps.length;

  // Zero-data state: brand new user with no data from any provider.
  // Also treat as new user when stats fail to load AND tenant has no connections --
  // shows the clean welcome state instead of error cards for fresh accounts.
  const noConnections = tenant !== null && !tenant.githubConnected && !tenant.gitlabConnected;
  const hasZeroStats = computeHasZeroStats(stats);
  const isNewUser = !statsLoading && (hasZeroStats || (statsError !== null && noConnections));

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
            onClick={() => handleExportOverview(quickStats)}
            aria-label="Export Dashboard"
            className="inline-flex items-center gap-1.5 px-2 py-1.5 sm:px-3 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800/80 backdrop-blur-sm border border-zinc-200 dark:border-zinc-700/60 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Dashboard</span>
          </button>
        )}
      </div>

      <StatCards
        quickStats={quickStats}
        statsLoading={statsLoading}
        statsError={statsError}
        isNewUser={isNewUser}
        refetchStats={refetchStats}
      />

      <OnboardingChecklist
        showOnboarding={showOnboarding}
        dismissOnboarding={dismissOnboarding}
        steps={onboardingSteps}
        completedCount={completedCount}
        allStepsComplete={allStepsComplete}
        isNewUser={isNewUser}
      />

      <ActivityFeed
        failureItems={failureItems}
        analysisItems={analysisItems}
        incidentItems={incidentItems}
        activityLoading={activityLoading}
        failuresError={failuresError}
        analysesError={analysesError}
        isNewUser={isNewUser}
        refetchFailures={refetchFailures}
        refetchAnalyses={refetchAnalyses}
        activityGridCols={activityGridCols}
      />

      <FeatureGate feature="teamAnalytics">
        <ConfidenceTrendChart />
        <ConfidenceChart />
        <SeverityDistributionChart
          distribution={triageStats?.severityDistribution ?? null}
          distributionBySource={severityBySource ?? null}
          isLoading={!triageStats && !!tenantId}
        />
      </FeatureGate>
    </>
  );
};
