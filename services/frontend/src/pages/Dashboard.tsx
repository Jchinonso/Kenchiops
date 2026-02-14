import { useState, useEffect, useRef } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { ComingSoon } from "@/components/ComingSoon";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  Zap,
  Settings,
  Bell,
  Search,
  ChevronDown,
  Clock,
  LogOut,
  Loader2,
  User,
  Menu,
  X,
  Github,
  Rocket,
  ExternalLink,
  Activity,
  FolderGit2,
  MessageSquare,
  GitBranch,
  Siren,
  Server,
  Puzzle,
  BarChart3,
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

const onboardingSteps: readonly OnboardingStep[] = [
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

const quickStats: readonly QuickStat[] = [
  {
    title: "Failed Builds",
    value: "0",
    icon: <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-red-500",
  },
  {
    title: "Analyses Run",
    value: "0",
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
    value: "0",
    icon: <FolderGit2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
    colorClass: "bg-green-500",
  },
];

// ==================== Coming Soon Configs ====================

interface ComingSoonConfig {
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
}

const COMING_SOON_PAGES: Readonly<Record<string, ComingSoonConfig>> = {
  "/dashboard/cicd": {
    title: "CI/CD Intelligence",
    description:
      "Automatic failure root cause analysis, pattern recognition, and pipeline optimization. Connect a repository to get started.",
    icon: <GitBranch className="w-8 h-8" />,
  },
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

/** Find the ComingSoon config matching the current path by prefix. */
const findComingSoonConfig = (pathname: string): ComingSoonConfig | undefined =>
  Object.entries(COMING_SOON_PAGES).find(([prefix]) => pathname.startsWith(prefix))?.[1];

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

  // Determine what content to render based on route
  const isOverview = currentPath === "/dashboard";
  const comingSoonConfig = isOverview ? undefined : findComingSoonConfig(currentPath);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeSidebar} />
      )}

      <DashboardSidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        onLogout={handleLogout}
        isLoggingOut={loggingOut}
      />

      {/* Main Content */}
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
          ) : (
            <>
              <div className="mb-6 sm:mb-8">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Welcome back, {firstName}!
                </h1>
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
                          <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                            {stat.value}
                          </h3>
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
                      {onboardingSteps.map((step, stepIndex) => (
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
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
