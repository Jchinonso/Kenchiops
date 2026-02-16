/**
 * Dashboard Shell
 *
 * Top-level dashboard layout with sidebar, header, and content routing.
 * Renders the appropriate sub-page based on the current path.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardSSE } from "@/hooks/useDashboardSSE";
import { Toaster } from "@/components/ui/sonner";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { ComingSoon } from "@/components/ComingSoon";
import { DashboardOverview } from "@/pages/DashboardOverview";
import { CICDFailures } from "@/pages/CICDFailures";
import { CICDAnalyses } from "@/pages/CICDAnalyses";
import { CICDPipelines } from "@/pages/CICDPipelines";
import { WebhookActivity } from "@/pages/WebhookActivity";
import { RepositoryDetail } from "@/pages/RepositoryDetail";
import { Settings as SettingsPage } from "@/pages/Settings";
import {
  Bell,
  Menu,
  Rocket,
  Siren,
  Server,
  Puzzle,
  BarChart3,
  Moon,
  Sun,
  Flame,
  Clock,
  FileText,
  FileCode,
  RefreshCw,
  DollarSign,
  ShieldAlert,
  ArrowUpCircle,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { DashboardBreadcrumb } from "@/components/DashboardBreadcrumb";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { DashboardFooter } from "@/components/DashboardFooter";
import { formatRelativeTime } from "@/lib/formatters";

// ==================== Coming Soon Configs ====================

interface ComingSoonConfig {
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly ctaLabel?: string;
  readonly ctaHref?: string;
}

const COMING_SOON_PAGES: Readonly<Record<string, ComingSoonConfig>> = {
  // ---- Incidents ----
  "/dashboard/incidents/active": {
    title: "Active Incidents",
    description:
      "Real-time incident detection with auto-severity classification. Connect your monitoring tools to surface active incidents here.",
    icon: <Flame className="w-8 h-8" />,
  },
  "/dashboard/incidents/timeline": {
    title: "Incident Timeline",
    description:
      "Chronological incident correlation across services. See how failures cascade and identify blast radius automatically.",
    icon: <Clock className="w-8 h-8" />,
  },
  "/dashboard/incidents/postmortems": {
    title: "Automated Postmortems",
    description:
      "AI-generated postmortem drafts from incident data — root cause, timeline, and action items ready for review.",
    icon: <FileText className="w-8 h-8" />,
  },
  "/dashboard/incidents": {
    title: "Incident Triage",
    description:
      "AI-powered incident correlation, severity classification, and automated postmortem generation. Connect your monitoring tools to enable this.",
    icon: <Siren className="w-8 h-8" />,
    ctaLabel: "View CI/CD Failures",
    ctaHref: "/dashboard/cicd/failures",
  },
  // ---- Infrastructure ----
  "/dashboard/infra/iac": {
    title: "IaC Reviews",
    description:
      "Automated review of Terraform, Pulumi, and CloudFormation changes before they hit production. Catch misconfigurations early.",
    icon: <FileCode className="w-8 h-8" />,
  },
  "/dashboard/infra/drift": {
    title: "Drift Detection",
    description:
      "Detect configuration drift between your IaC definitions and live infrastructure state. Stay in sync automatically.",
    icon: <RefreshCw className="w-8 h-8" />,
  },
  "/dashboard/infra/cost": {
    title: "Cost Analysis",
    description:
      "Infrastructure cost attribution and optimization recommendations. Identify underutilized resources and right-size workloads.",
    icon: <DollarSign className="w-8 h-8" />,
  },
  "/dashboard/infra": {
    title: "Infrastructure Intelligence",
    description:
      "IaC change review, drift detection, and cost analysis. Connect Terraform Cloud or your Kubernetes clusters to get started.",
    icon: <Server className="w-8 h-8" />,
    ctaLabel: "Go to Settings",
    ctaHref: "/dashboard/settings",
  },
  // ---- Deployments ----
  "/dashboard/deployments/risk": {
    title: "Deployment Risk Scores",
    description:
      "Pre-deploy risk scoring based on change scope, historical failure patterns, and dependency impact analysis.",
    icon: <ShieldAlert className="w-8 h-8" />,
  },
  "/dashboard/deployments/rollouts": {
    title: "Rollout Monitoring",
    description:
      "Canary rollout health analysis, automated rollback triggers, and progressive delivery insights across environments.",
    icon: <ArrowUpCircle className="w-8 h-8" />,
  },
  "/dashboard/deployments": {
    title: "Deployment Intelligence",
    description:
      "Pre-deploy risk scoring, canary rollout health analysis, and automated rollback triggers. Available once CI/CD data is flowing.",
    icon: <Rocket className="w-8 h-8" />,
    ctaLabel: "View CI/CD Pipelines",
    ctaHref: "/dashboard/cicd/pipelines",
  },
  // ---- Analytics & Integrations ----
  "/dashboard/analytics": {
    title: "Engineering Analytics",
    description:
      "DORA metrics, team health dashboards, and bottleneck identification — automatically calculated from your DevOps data.",
    icon: <BarChart3 className="w-8 h-8" />,
    ctaLabel: "View Analyses",
    ctaHref: "/dashboard/cicd/analyses",
  },
  "/dashboard/integrations": {
    title: "Integrations",
    description:
      "Connect Prometheus, PagerDuty, Datadog, Terraform Cloud, and more. Each integration unlocks new intelligence capabilities.",
    icon: <Puzzle className="w-8 h-8" />,
    ctaLabel: "Go to Settings",
    ctaHref: "/dashboard/settings",
  },
};

// ==================== Routing Helpers ====================

const findComingSoonConfig = (pathname: string): ComingSoonConfig | undefined =>
  COMING_SOON_PAGES[pathname] ??
  Object.entries(COMING_SOON_PAGES).find(([prefix]) => pathname.startsWith(prefix))?.[1];

const isCICDRoute = (pathname: string): boolean => pathname.startsWith("/dashboard/cicd");

const PIPELINES_PREFIX = "/dashboard/cicd/pipelines/";

const renderCICDPage = (pathname: string, refreshKey: number): React.ReactNode => {
  if (pathname.startsWith("/dashboard/cicd/failures")) {
    return <CICDFailures refreshKey={refreshKey} />;
  }
  if (pathname.startsWith("/dashboard/cicd/analyses")) {
    return <CICDAnalyses refreshKey={refreshKey} />;
  }
  if (pathname.startsWith(PIPELINES_PREFIX)) {
    const repoFullName = decodeURIComponent(pathname.slice(PIPELINES_PREFIX.length));
    return <RepositoryDetail repoFullName={repoFullName} refreshKey={refreshKey} />;
  }
  if (pathname.startsWith("/dashboard/cicd/pipelines")) {
    return <CICDPipelines />;
  }
  if (pathname.startsWith("/dashboard/cicd/webhooks")) {
    return <WebhookActivity refreshKey={refreshKey} />;
  }
  return <CICDFailures refreshKey={refreshKey} />;
};

// ==================== Dashboard ====================

const Dashboard = () => {
  const { pathname: currentPath } = useLocation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { refreshKey } = useDashboardSSE();
  const { resolved: resolvedTheme, setTheme } = useTheme();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date>(new Date());
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const pendingGotoRef = useRef(false);
  const gotoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();

  const toggleTheme = useCallback(
    () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    [resolvedTheme, setTheme]
  );

  // Track SSE refresh events for "last updated" and notification badge
  const isFirstRefresh = useRef(true);
  useEffect(() => {
    if (isFirstRefresh.current) {
      isFirstRefresh.current = false;
      return;
    }
    setLastRefreshAt(new Date());
    setUnreadCount((prev) => prev + 1);
  }, [refreshKey]);

  const lastUpdatedLabel = useMemo(
    () => formatRelativeTime(lastRefreshAt.toISOString()),
    [lastRefreshAt]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      const { key } = event;
      if (key === "Escape") {
        setNotificationsOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setCommandOpen((prev) => !prev);
        return;
      }
      if (isInput) {
        return;
      }
      if (key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      if (key === "/") {
        const filterInput = document.querySelector<HTMLInputElement>(
          'input[id="filter-repository"]'
        );
        if (filterInput) {
          event.preventDefault();
          filterInput.focus();
        }
      }
      if (key === "t") {
        event.preventDefault();
        toggleTheme();
      }
      // Two-key navigation: g then o/f/a
      if (pendingGotoRef.current) {
        pendingGotoRef.current = false;
        clearTimeout(gotoTimerRef.current);
        const routes: Readonly<Record<string, string>> = {
          o: "/dashboard",
          f: "/dashboard/cicd/failures",
          a: "/dashboard/cicd/analyses",
          s: "/dashboard/settings",
          p: "/dashboard/cicd/pipelines",
        };
        const route = routes[key];
        if (route) {
          event.preventDefault();
          navigate(route);
        }
        return;
      }
      if (key === "g") {
        pendingGotoRef.current = true;
        gotoTimerRef.current = setTimeout(() => {
          pendingGotoRef.current = false;
        }, 1000);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [toggleTheme]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const displayName = user?.displayName ?? "User";
  const displayEmail = user?.email ?? "";
  const firstName = user?.displayName?.split(" ")[0] ?? "there";
  const onboardingKey = `kenchi_onboarding_${user?.id}`;
  const showOnboarding = !onboardingDismissed && !localStorage.getItem(onboardingKey);
  const dismissOnboarding = () => {
    localStorage.setItem(onboardingKey, "1");
    setOnboardingDismissed(true);
  };

  const closeSidebar = () => setSidebarOpen(false);
  const handleLogout = () => {
    setLoggingOut(true);
    closeSidebar();
    logout();
  };
  const toggleNotifications = () => {
    setNotificationsOpen((prev) => !prev);
    setUnreadCount(0);
  };

  const isOverview = currentPath === "/dashboard";
  const isSettings = currentPath === "/dashboard/settings";
  const isCICD = isCICDRoute(currentPath);
  const comingSoonConfig =
    isOverview || isCICD || isSettings ? undefined : findComingSoonConfig(currentPath);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-indigo-500 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={closeSidebar} />
      )}

      <DashboardSidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        onLogout={handleLogout}
        isLoggingOut={loggingOut}
        user={user ? { displayName, email: displayEmail, avatarUrl: user.avatarUrl } : null}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <main className="flex-1 min-w-0">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 sm:py-4 gap-4">
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden sm:block">
                <DashboardBreadcrumb />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {/* Last Updated */}
              <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500">
                Updated {lastUpdatedLabel}
              </span>

              {/* Theme Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleTheme}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    aria-label="Toggle theme"
                  >
                    {resolvedTheme === "dark" ? (
                      <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme (t)</TooltipContent>
              </Tooltip>

              {/* Notifications */}
              <div ref={notificationsRef} className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleNotifications}
                      className="relative p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      aria-label={
                        unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"
                      }
                    >
                      <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                      {unreadCount > 0 && (
                        <span
                          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1"
                          aria-hidden="true"
                        >
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Notifications</TooltipContent>
                </Tooltip>
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 z-50">
                    <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                        Notifications
                      </h4>
                      <button
                        type="button"
                        disabled
                        className="text-xs text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        No notifications yet
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        CI/CD failure alerts and analysis results will appear here.
                      </p>
                    </div>
                    <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
                      <Link
                        to="/dashboard/settings"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                      >
                        Notification preferences
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div id="main-content" className="p-4 sm:p-6 lg:p-8">
          {comingSoonConfig ? (
            <ComingSoon {...comingSoonConfig} />
          ) : isSettings ? (
            <SettingsPage />
          ) : isCICD ? (
            renderCICDPage(currentPath, refreshKey)
          ) : (
            <DashboardOverview
              firstName={firstName}
              showOnboarding={showOnboarding}
              dismissOnboarding={dismissOnboarding}
              refreshKey={refreshKey}
            />
          )}
        </div>

        <DashboardFooter />
      </main>

      <Toaster position="bottom-right" theme={resolvedTheme} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
    </div>
  );
};

export default Dashboard;
