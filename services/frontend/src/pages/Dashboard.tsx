/**
 * Dashboard Shell
 *
 * Top-level dashboard layout with sidebar, header, and content routing.
 * Renders the appropriate sub-page based on the current path.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardSSE, type DashboardNotification } from "@/hooks/useDashboardSSE";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { ComingSoon } from "@/components/ComingSoon";
import { DashboardOverview } from "@/pages/DashboardOverview";
import { Onboarding } from "@/pages/Onboarding";
import { CICDAnalyses } from "@/pages/CICDAnalyses";
import { CICDPipelines } from "@/pages/CICDPipelines";
import { WebhookActivity } from "@/pages/WebhookActivity";
import { RepositoryDetail } from "@/pages/RepositoryDetail";
import { AnalysisDetail } from "@/pages/AnalysisDetail";
import { ActiveIncidents } from "@/pages/ActiveIncidents";
import { Investigations } from "@/pages/Investigations";
import { NewInvestigation } from "@/pages/NewInvestigation";
import { InvestigationDetail } from "@/pages/InvestigationDetail";
import { Settings } from "@/pages/Settings";
import { PlanSelection } from "@/pages/PlanSelection";
import { Integrations } from "@/pages/Integrations";
import { GitLabSetup } from "@/pages/GitLabSetup";
import { TeamManagement } from "@/pages/TeamManagement";
import { TenantGuard } from "@/components/TenantGuard";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import {
  Bell,
  Menu,
  Rocket,
  Server,
  BarChart3,
  Moon,
  Sun,
  Clock,
  FileText,
  FileCode,
  RefreshCw,
  DollarSign,
  ShieldAlert,
  ArrowUpCircle,
  AlertTriangle,
  Search,
  X,
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
};

// ==================== Routing Helpers ====================

const findComingSoonConfig = (pathname: string): ComingSoonConfig | undefined =>
  COMING_SOON_PAGES[pathname] ??
  Object.entries(COMING_SOON_PAGES).find(([prefix]) => pathname.startsWith(prefix))?.[1];

const isCICDRoute = (pathname: string): boolean => pathname.startsWith("/dashboard/cicd");
const isIncidentRoute = (pathname: string): boolean => pathname.startsWith("/dashboard/incidents");

const INVESTIGATIONS_PREFIX = "/dashboard/incidents/investigations/";

const renderIncidentPage = (pathname: string, refreshKey: number): React.ReactNode => {
  // Investigation routes — most specific first
  if (pathname.startsWith("/dashboard/incidents/investigations/new")) {
    return <NewInvestigation />;
  }
  if (pathname.startsWith(INVESTIGATIONS_PREFIX)) {
    const investigationId = decodeURIComponent(pathname.slice(INVESTIGATIONS_PREFIX.length));
    return <InvestigationDetail investigationId={investigationId} refreshKey={refreshKey} />;
  }
  if (pathname.startsWith("/dashboard/incidents/investigations")) {
    return <Investigations refreshKey={refreshKey} />;
  }
  // Active incidents
  if (pathname.startsWith("/dashboard/incidents/active") || pathname === "/dashboard/incidents") {
    return <ActiveIncidents refreshKey={refreshKey} />;
  }
  // Timeline and Postmortems are still Coming Soon — handled by findComingSoonConfig
  return null;
};

const PIPELINES_PREFIX = "/dashboard/cicd/pipelines/";
const ANALYSES_PREFIX = "/dashboard/cicd/analyses/";

const renderCICDPage = (pathname: string, refreshKey: number): React.ReactNode => {
  if (pathname.startsWith("/dashboard/cicd/failures")) {
    return <CICDAnalyses refreshKey={refreshKey} />;
  }
  if (pathname.startsWith(ANALYSES_PREFIX)) {
    const analysisId = decodeURIComponent(pathname.slice(ANALYSES_PREFIX.length));
    return <AnalysisDetail analysisId={analysisId} refreshKey={refreshKey} />;
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
  return <CICDAnalyses refreshKey={refreshKey} />;
};

// ==================== Notification Components ====================

interface NotificationItemProps {
  readonly notification: DashboardNotification;
  readonly onClose: () => void;
  readonly onMarkAsRead: (id: string) => void;
  readonly onDismiss: (id: string) => void;
}

const NotificationItem = ({
  notification,
  onClose,
  onMarkAsRead,
  onDismiss,
}: NotificationItemProps) => {
  const {
    id: notificationId,
    type,
    read,
    analysisId,
    title,
    description,
    timestamp,
  } = notification;
  const isFailure = type === "failure";
  const Icon = isFailure ? AlertTriangle : Search;
  const iconColor = isFailure ? "text-red-500" : "text-green-500";

  const linkTarget =
    !isFailure && analysisId
      ? `/dashboard/cicd/analyses/${analysisId}`
      : "/dashboard/cicd/analyses";

  const handleClick = () => {
    onMarkAsRead(notificationId);
    onClose();
  };

  const handleDismiss = (clickEvent: React.MouseEvent) => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    onDismiss(notificationId);
  };

  return (
    <Link to={linkTarget} onClick={handleClick}>
      <div
        className={cn(
          "px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group",
          !read && "bg-indigo-50/50 dark:bg-indigo-950/20"
        )}
      >
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", iconColor)} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm truncate",
              read
                ? "text-gray-700 dark:text-gray-300"
                : "text-gray-900 dark:text-gray-100 font-medium"
            )}
          >
            {title}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{description}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {formatRelativeTime(timestamp)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </Link>
  );
};

interface NotificationDropdownProps {
  readonly notifications: readonly DashboardNotification[];
  readonly unreadCount: number;
  readonly onMarkAllRead: () => void;
  readonly onMarkAsRead: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onClose: () => void;
}

const NotificationDropdown = ({
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkAsRead,
  onDismiss,
  onClose,
}: NotificationDropdownProps) => {
  const hasNotifications = notifications.length > 0;

  return (
    <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 z-50">
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h4>
        <button
          type="button"
          disabled={unreadCount < 1}
          onClick={onMarkAllRead}
          className={cn(
            "text-xs transition-colors",
            unreadCount > 0
              ? "text-indigo-500 hover:text-indigo-600 cursor-pointer"
              : "text-gray-400 dark:text-gray-500 cursor-not-allowed"
          )}
        >
          Mark all read
        </button>
      </div>

      {hasNotifications ? (
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onClose={onClose}
              onMarkAsRead={onMarkAsRead}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            No notifications yet
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            CI/CD failure alerts and analysis results will appear here.
          </p>
        </div>
      )}

      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
        <Link
          to="/dashboard/settings"
          onClick={onClose}
          className="text-xs text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
        >
          Notification preferences
        </Link>
      </div>
    </div>
  );
};

// ==================== Dashboard ====================

const Dashboard = () => {
  const { pathname: currentPath } = useLocation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const {
    refreshKey: sseRefreshKey,
    notifications,
    markAllRead,
    markAsRead,
    dismissNotification,
  } = useDashboardSSE();
  const { resolved: resolvedTheme, setTheme } = useTheme();
  const { data: tenant, isLoading: tenantLoading } = useTenantInfo(sseRefreshKey);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [onboardingSkipped, setOnboardingSkipped] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date>(new Date());
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );
  const refreshKey = sseRefreshKey + manualRefreshKey;
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
  }, [sseRefreshKey]);

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
          f: "/dashboard/cicd/analyses",
          a: "/dashboard/cicd/analyses",
          s: "/dashboard/settings",
          p: "/dashboard/cicd/pipelines",
          i: "/dashboard/incidents/active",
          v: "/dashboard/incidents/investigations",
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
  };

  // Detect new users who haven't connected any CI provider yet
  const needsOnboarding =
    !tenantLoading &&
    tenant !== null &&
    !tenant.githubConnected &&
    !tenant.gitlabConnected &&
    !onboardingSkipped &&
    !localStorage.getItem(onboardingKey);

  const handleSkipOnboarding = () => {
    localStorage.setItem(onboardingKey, "1");
    setOnboardingSkipped(true);
    setOnboardingDismissed(true);
  };

  const isOverview = currentPath === "/dashboard";
  const isOnboarding = currentPath === "/dashboard/onboarding";
  const isSettings = currentPath === "/dashboard/settings";
  const isPlanSelection = currentPath === "/dashboard/settings/plan";
  const isIntegrations = currentPath === "/dashboard/integrations";
  const isGitLabSetup = currentPath === "/dashboard/setup/gitlab";
  const isTeam = currentPath === "/dashboard/settings/team";
  const isCICD = isCICDRoute(currentPath);
  const isIncident = isIncidentRoute(currentPath);
  const incidentPage = isIncident ? renderIncidentPage(currentPath, refreshKey) : null;
  const comingSoonConfig =
    isOverview ||
    isOnboarding ||
    isCICD ||
    isSettings ||
    isPlanSelection ||
    isIntegrations ||
    isGitLabSetup ||
    isTeam ||
    incidentPage
      ? undefined
      : findComingSoonConfig(currentPath);

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
              {/* Last Updated + Refresh */}
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Updated {lastUpdatedLabel}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setManualRefreshKey((prev) => prev + 1);
                        setLastRefreshAt(new Date());
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded transition-colors"
                      aria-label="Refresh data"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              </div>

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
                  <NotificationDropdown
                    notifications={notifications}
                    unreadCount={unreadCount}
                    onMarkAllRead={markAllRead}
                    onMarkAsRead={markAsRead}
                    onDismiss={dismissNotification}
                    onClose={() => setNotificationsOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div id="main-content" className="p-4 sm:p-6 lg:p-8">
          <TenantGuard>
            <PageErrorBoundary key={currentPath}>
              {comingSoonConfig ? (
                <ComingSoon {...comingSoonConfig} />
              ) : isTeam ? (
                <TeamManagement />
              ) : isGitLabSetup ? (
                <GitLabSetup />
              ) : isIntegrations ? (
                <Integrations />
              ) : isPlanSelection ? (
                <PlanSelection />
              ) : isSettings ? (
                <Settings />
              ) : isCICD ? (
                renderCICDPage(currentPath, refreshKey)
              ) : incidentPage ? (
                incidentPage
              ) : isOnboarding || (isOverview && needsOnboarding) ? (
                <Onboarding
                  displayName={displayName}
                  provider={user?.providers?.[0]?.provider ?? "github"}
                  onSkip={handleSkipOnboarding}
                />
              ) : (
                <DashboardOverview
                  firstName={firstName}
                  showOnboarding={showOnboarding}
                  dismissOnboarding={dismissOnboarding}
                  refreshKey={refreshKey}
                />
              )}
            </PageErrorBoundary>
          </TenantGuard>
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
