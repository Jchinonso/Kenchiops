/**
 * Dashboard Overview Content
 *
 * Shows quick stats, onboarding checklist, and recent activity
 * on the main dashboard overview page (/dashboard).
 */

import { Link } from "react-router-dom";
import { useDashboardStats } from "@/hooks/useDashboardData";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Zap,
  Clock,
  FolderGit2,
  Github,
  Rocket,
  ExternalLink,
  Activity,
  MessageSquare,
  X,
} from "lucide-react";

// ==================== Constants ====================

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG ?? "kenchi-devops";

interface OnboardingStep {
  readonly title: string;
  readonly description: string;
  readonly ctaLabel: string;
  readonly href: string;
  readonly external?: boolean;
  readonly icon: React.ReactNode;
}

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    title: "Install Kenchi GitHub App",
    description: "One click connects your repos and sets up webhooks — no manual config needed.",
    ctaLabel: "Install GitHub App",
    href: `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`,
    external: true,
    icon: <Github className="w-5 h-5 text-gray-900" />,
  },
  {
    title: "Connect Slack (optional)",
    description: "Get failure alerts and analysis results delivered to your team's Slack channels.",
    ctaLabel: "Add to Slack",
    href: "/dashboard/settings",
    icon: <MessageSquare className="w-5 h-5 text-purple-600" />,
  },
  {
    title: "Your First Analysis",
    description: "Once connected, Kenchi automatically analyzes CI failures on every push.",
    ctaLabel: "View Analyses",
    href: "/dashboard/cicd/analyses",
    icon: <Zap className="w-5 h-5 text-amber-500" />,
  },
];

interface QuickStat {
  readonly title: string;
  readonly value: string;
  readonly icon: React.ReactNode;
  readonly colorClass: string;
}

const buildQuickStats = (
  stats: {
    readonly totalFailures: number;
    readonly totalAnalyses: number;
    readonly connectedRepos: number;
  } | null
): readonly QuickStat[] => [
  {
    title: "Failed Builds",
    value: stats ? String(stats.totalFailures) : "--",
    icon: <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-red-500",
  },
  {
    title: "Analyses Run",
    value: stats ? String(stats.totalAnalyses) : "--",
    icon: <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-indigo-500",
  },
  {
    title: "Avg Resolution",
    value: "--",
    icon: <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-blue-500",
  },
  {
    title: "Connected Repos",
    value: stats ? String(stats.connectedRepos) : "--",
    icon: <FolderGit2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-green-500",
  },
];

// ==================== Component ====================

interface DashboardOverviewProps {
  readonly firstName: string;
  readonly showOnboarding: boolean;
  readonly dismissOnboarding: () => void;
}

export const DashboardOverview = ({
  firstName,
  showOnboarding,
  dismissOnboarding,
}: DashboardOverviewProps) => {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const quickStats = buildQuickStats(stats);

  return (
    <>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Welcome back, {firstName}!</h1>
        <p className="text-sm sm:text-base text-gray-500 mt-1">
          Here&apos;s your CI/CD pipeline health at a glance.
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        {quickStats.map((stat) => (
          <Card key={stat.title} className="py-4 sm:py-5">
            <CardContent className="px-4 sm:px-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 mb-1">{stat.title}</p>
                  {statsLoading ? (
                    <Skeleton className="h-7 w-12 mt-1" />
                  ) : (
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</h3>
                  )}
                </div>
                <div
                  className={`w-10 h-10 sm:w-12 sm:h-12 ${stat.colorClass} rounded-xl flex items-center justify-center flex-shrink-0`}
                >
                  {stat.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Onboarding (first-time users only) */}
      {showOnboarding && (
        <Card className="mb-6 sm:mb-8">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-indigo-500" />
                <CardTitle>Get Set Up</CardTitle>
              </div>
              <button
                onClick={dismissOnboarding}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardDescription>
              Complete these steps to start analyzing your CI/CD failures.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {ONBOARDING_STEPS.map((step, stepIndex) => (
                <div
                  key={step.title}
                  className="flex items-start gap-4 p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                >
                  <div className="flex-shrink-0 mt-1">{step.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 text-sm mb-1">
                      {stepIndex + 1}. {step.title}
                    </h4>
                    <p className="text-sm text-gray-500 mb-3">{step.description}</p>
                    {step.external ? (
                      <a
                        href={step.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
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
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <CardTitle>Recent Activity</CardTitle>
          </div>
          <CardDescription>
            CI failures and analysis results from your connected repositories.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center">
          <Activity className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No recent activity</p>
          <p className="text-xs text-gray-400 mt-1">
            Activity from your connected repositories will appear here.
          </p>
        </CardContent>
      </Card>
    </>
  );
};
