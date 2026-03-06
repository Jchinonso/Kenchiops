/**
 * Dashboard Shell
 *
 * Top-level dashboard layout with sidebar, header, and content routing.
 * Renders the appropriate sub-page based on the current path.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardSSE } from "@/hooks/useDashboardSSE";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { Toaster } from "@/components/ui/sonner";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { ComingSoon } from "@/components/ComingSoon";
import { DashboardOverview } from "@/pages/DashboardOverview";
import { Onboarding } from "@/pages/Onboarding";
import { Settings } from "@/pages/Settings";
import { PlanSelection } from "@/pages/PlanSelection";
import { Integrations } from "@/pages/Integrations";
import { PageLoader } from "@/components/PageLoader";
import { GitLabSetup } from "@/pages/GitLabSetup";
import { TeamManagement } from "@/pages/TeamManagement";
import { TenantGuard } from "@/components/TenantGuard";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { useTheme } from "@/hooks/useTheme";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { DashboardFooter } from "@/components/DashboardFooter";
import { formatRelativeTime } from "@/lib/formatters";

import {
  findComingSoonConfig,
  isCICDRoute,
  isIncidentRoute,
  renderIncidentPage,
  renderCICDPage,
} from "./helpers";
import { DashboardHeader } from "./DashboardHeader";
import { useDashboardKeyboardShortcuts } from "./useDashboardKeyboardShortcuts";

// Exact-path → component lookup (static pages without dynamic props)
const STATIC_ROUTES: Readonly<Record<string, React.ReactNode>> = {
  "/dashboard/settings/team": <TeamManagement />,
  "/dashboard/setup/gitlab": <GitLabSetup />,
  "/dashboard/integrations": <Integrations />,
  "/dashboard/settings/plan": <PlanSelection />,
  "/dashboard/settings": <Settings />,
};

const Dashboard = () => {
  const { pathname: currentPath } = useLocation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const queryClient = useQueryClient();
  const {
    notifications,
    markAllRead,
    markAsRead,
    dismissNotification,
  } = useDashboardSSE();
  const { resolved: resolvedTheme, setTheme } = useTheme();
  const {
    data: tenant,
    isLoading: tenantLoading,
    error: tenantError,
  } = useTenantInfo();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [onboardingSkipped, setOnboardingSkipped] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date>(new Date());

  // Reset state when tenant changes (org switch).
  // queryClient.clear() drops all cached data so hooks re-fetch for the new org.
  // Uses state-based previous-value tracking during render to avoid both
  // ref-during-render errors and cascading effect setState calls.
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const currentTenantId = user?.tenantId ?? null;
  const [prevTenantId, setPrevTenantId] = useState(currentTenantId);
  if (prevTenantId !== currentTenantId) {
    setPrevTenantId(currentTenantId);
    setOnboardingSkipped(false);
    setOnboardingDismissed(false);
    queryClient.clear();
  }
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );
  const notificationsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const toggleTheme = useCallback(
    () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    [resolvedTheme, setTheme]
  );

  // Track SSE events for "last updated" label.
  // When a new notification arrives, the data was just invalidated by the SSE
  // handler, so we update the timestamp. setState is intentional here —
  // we're synchronizing UI state with an external event count.
  const prevNotificationCountRef = useRef(notifications.length);
  useEffect(() => {
    if (notifications.length !== prevNotificationCountRef.current) {
      prevNotificationCountRef.current = notifications.length;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing timestamp with external SSE event count
      setLastRefreshAt(new Date());
    }
  }, [notifications.length]);

  const lastUpdatedLabel = useMemo(
    () => formatRelativeTime(lastRefreshAt.toISOString()),
    [lastRefreshAt]
  );

  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const toggleCommand = useCallback(() => setCommandOpen((prev) => !prev), []);

  useDashboardKeyboardShortcuts({
    toggleTheme,
    navigate,
    notificationsRef,
    onCloseNotifications: closeNotifications,
    onOpenShortcuts: openShortcuts,
    onToggleCommand: toggleCommand,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
        <PageLoader className="min-h-screen" />
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
  // Hide setup checklist if tenant already has analyses (previously set up, maybe app was uninstalled)
  const tenantHasData = tenant?.hasData ?? false;
  const showOnboarding =
    !onboardingDismissed && !localStorage.getItem(onboardingKey) && !tenantHasData;
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
  const toggleNotifications = () => setNotificationsOpen((prev) => !prev);

  // Show onboarding wizard whenever no CI provider is connected.
  // localStorage is NOT checked here — onboarding re-appears on every login
  // until the user actually connects a provider. The "Skip" button only
  // dismisses for the current session (via onboardingSkipped state).
  const needsOnboarding =
    !tenantLoading &&
    !onboardingSkipped &&
    (tenantError !== null ||
      (tenant !== null && !tenant.githubConnected && !tenant.gitlabConnected));

  const handleSkipOnboarding = () => {
    localStorage.setItem(onboardingKey, "1");
    setOnboardingSkipped(true);
    setOnboardingDismissed(true);
  };

  const handleRefresh = () => {
    void queryClient.invalidateQueries();
    setLastRefreshAt(new Date());
  };

  const resolvePageContent = (): React.ReactNode => {
    const staticPage = STATIC_ROUTES[currentPath];
    if (staticPage) {
      return staticPage;
    }

    if (isCICDRoute(currentPath)) {
      return renderCICDPage(currentPath);
    }
    if (isIncidentRoute(currentPath)) {
      return renderIncidentPage(currentPath);
    }

    const comingSoonConfig = findComingSoonConfig(currentPath);
    if (comingSoonConfig) {
      return <ComingSoon {...comingSoonConfig} />;
    }

    if (currentPath === "/dashboard/onboarding" || needsOnboarding) {
      return (
        <Onboarding
          displayName={displayName}
          provider={user?.organizations.find((org) => org.isSelected)?.provider ?? "github"}
          onSkip={handleSkipOnboarding}
        />
      );
    }

    return (
      <DashboardOverview
        firstName={firstName}
        showOnboarding={showOnboarding}
        dismissOnboarding={dismissOnboarding}
        tenant={tenant}
      />
    );
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex">
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
        onOpenShortcuts={openShortcuts}
      />

      <main className="flex-1 min-w-0">
        <DashboardHeader
          lastUpdatedLabel={lastUpdatedLabel}
          onRefresh={handleRefresh}
          resolvedTheme={resolvedTheme}
          onToggleTheme={toggleTheme}
          unreadCount={unreadCount}
          onToggleNotifications={toggleNotifications}
          notificationsOpen={notificationsOpen}
          notificationsRef={notificationsRef}
          notifications={notifications}
          onMarkAllRead={markAllRead}
          onMarkAsRead={markAsRead}
          onDismiss={dismissNotification}
          onCloseNotifications={closeNotifications}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <div id="main-content" className="p-4 sm:p-6 lg:p-8">
          <TenantGuard>
            <PageErrorBoundary key={currentPath}>{resolvePageContent()}</PageErrorBoundary>
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
        onOpenShortcuts={openShortcuts}
      />
    </div>
  );
};

export default Dashboard;
