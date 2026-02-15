/**
 * Dashboard Shell
 *
 * Top-level dashboard layout with sidebar, header, and content routing.
 * Renders the appropriate sub-page based on the current path.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { ComingSoon } from "@/components/ComingSoon";
import { DashboardOverview } from "@/pages/DashboardOverview";
import { CICDFailures } from "@/pages/CICDFailures";
import { CICDAnalyses } from "@/pages/CICDAnalyses";
import { CICDPipelines } from "@/pages/CICDPipelines";
import {
  Settings,
  Bell,
  Search,
  ChevronDown,
  LogOut,
  Loader2,
  User,
  Menu,
  Rocket,
  Siren,
  Server,
  Puzzle,
  BarChart3,
} from "lucide-react";

// ==================== Coming Soon Configs ====================

interface ComingSoonConfig {
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
}

const COMING_SOON_PAGES: Readonly<Record<string, ComingSoonConfig>> = {
  "/dashboard/incidents": {
    title: "Incident Triage",
    description:
      "AI-powered incident correlation, severity classification, and automated postmortem generation. Connect your monitoring tools to enable this.",
    icon: <Siren className="w-8 h-8" />,
  },
  "/dashboard/infra": {
    title: "Infrastructure Intelligence",
    description:
      "IaC change review, drift detection, and cost analysis. Connect Terraform Cloud or your Kubernetes clusters to get started.",
    icon: <Server className="w-8 h-8" />,
  },
  "/dashboard/deployments": {
    title: "Deployment Intelligence",
    description:
      "Pre-deploy risk scoring, canary rollout health analysis, and automated rollback triggers. Available once CI/CD data is flowing.",
    icon: <Rocket className="w-8 h-8" />,
  },
  "/dashboard/analytics": {
    title: "Engineering Analytics",
    description:
      "DORA metrics, team health dashboards, and bottleneck identification — automatically calculated from your DevOps data.",
    icon: <BarChart3 className="w-8 h-8" />,
  },
  "/dashboard/integrations": {
    title: "Integrations",
    description:
      "Connect Prometheus, PagerDuty, Datadog, Terraform Cloud, and more. Each integration unlocks new intelligence capabilities.",
    icon: <Puzzle className="w-8 h-8" />,
  },
};

// ==================== Routing Helpers ====================

const findComingSoonConfig = (pathname: string): ComingSoonConfig | undefined =>
  Object.entries(COMING_SOON_PAGES).find(([prefix]) => pathname.startsWith(prefix))?.[1];

const isCICDRoute = (pathname: string): boolean => pathname.startsWith("/dashboard/cicd");

const renderCICDPage = (pathname: string): React.ReactNode => {
  if (pathname.startsWith("/dashboard/cicd/failures")) {
    return <CICDFailures />;
  }
  if (pathname.startsWith("/dashboard/cicd/analyses")) {
    return <CICDAnalyses />;
  }
  if (pathname.startsWith("/dashboard/cicd/pipelines")) {
    return <CICDPipelines />;
  }
  return <CICDFailures />;
};

// ==================== Dashboard ====================

const Dashboard = () => {
  const { pathname: currentPath } = useLocation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    const handleEscape = ({ key }: KeyboardEvent) => {
      if (key === "Escape") {
        setNotificationsOpen(false);
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const userInitials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";
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
  const toggleNotifications = () => setNotificationsOpen((prev) => !prev);
  const toggleUserMenu = () => setUserMenuOpen((prev) => !prev);

  const isOverview = currentPath === "/dashboard";
  const isCICD = isCICDRoute(currentPath);
  const comingSoonConfig = isOverview || isCICD ? undefined : findComingSoonConfig(currentPath);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeSidebar} />
      )}

      <DashboardSidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        onLogout={handleLogout}
        isLoggingOut={loggingOut}
      />

      <main className="flex-1 min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 sm:py-4 gap-4">
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex-1 max-w-xl">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search failures, analyses, or patterns..."
                    className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {/* Notifications */}
              <div ref={notificationsRef} className="relative">
                <button
                  onClick={toggleNotifications}
                  className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <h4 className="font-semibold text-gray-900">Notifications</h4>
                    </div>
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No notifications yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        You&apos;ll see analysis results and alerts here
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* User Menu */}
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={toggleUserMenu}
                  className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={displayName}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium text-xs sm:text-sm">
                        {userInitials}
                      </span>
                    </div>
                  )}
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-gray-900">{displayName}</p>
                    <p className="text-xs text-gray-500">{displayEmail}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="font-medium text-gray-900">{displayName}</p>
                      <p className="text-sm text-gray-500">{displayEmail}</p>
                    </div>
                    <Link
                      to="/dashboard/settings"
                      className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </Link>
                    <Link
                      to="/dashboard/settings"
                      className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      <button
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="flex items-center gap-3 px-4 py-2 w-full text-left text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {loggingOut ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <LogOut className="w-4 h-4" />
                        )}
                        {loggingOut ? "Signing out..." : "Sign Out"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 sm:p-6 lg:p-8">
          {comingSoonConfig ? (
            <ComingSoon {...comingSoonConfig} />
          ) : isCICD ? (
            renderCICDPage(currentPath)
          ) : (
            <DashboardOverview
              firstName={firstName}
              showOnboarding={showOnboarding}
              dismissOnboarding={dismissOnboarding}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
