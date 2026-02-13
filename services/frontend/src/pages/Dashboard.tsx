import { useState, useEffect, useRef } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  AlertTriangle,
  Zap,
  BarChart3,
  Settings,
  Bell,
  Search,
  ChevronDown,
  Clock,
  LogOut,
  User,
  HelpCircle,
  Menu,
  X,
  GitBranch,
  Rocket,
  Circle,
  ExternalLink,
  Activity,
  FolderGit2,
} from "lucide-react";

interface SidebarItemProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly href: string;
  readonly active?: boolean;
  readonly onClick?: () => void;
}

const SidebarItem = ({ icon, label, href, active, onClick }: SidebarItemProps) => (
  <Link
    to={href}
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      active
        ? "bg-indigo-500 text-white shadow-md"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </Link>
);

interface GettingStartedStep {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly linkLabel: string;
}

const gettingStartedSteps: readonly GettingStartedStep[] = [
  {
    title: "Connect a Repository",
    description:
      "Link your GitHub, GitLab, or Bitbucket repository to start monitoring CI pipelines.",
    href: "/dashboard/repos",
    linkLabel: "Go to Repositories",
  },
  {
    title: "Set Up CI Webhook",
    description:
      "Configure your CI provider to send build events to Kenchi for automatic analysis.",
    href: "/dashboard/settings",
    linkLabel: "Open Settings",
  },
  {
    title: "Run Your First Analysis",
    description:
      "Once connected, Kenchi automatically analyzes CI failures and identifies root causes.",
    href: "/dashboard/analyses",
    linkLabel: "View Analyses",
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

const Dashboard = () => {
  const { pathname: currentPath } = useLocation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or Escape key
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

  const sidebarItems = [
    { icon: <LayoutDashboard className="w-5 h-5" />, label: "Overview", href: "/dashboard" },
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      label: "CI Failures",
      href: "/dashboard/failures",
    },
    { icon: <Search className="w-5 h-5" />, label: "Analyses", href: "/dashboard/analyses" },
    { icon: <GitBranch className="w-5 h-5" />, label: "Repositories", href: "/dashboard/repos" },
    { icon: <BarChart3 className="w-5 h-5" />, label: "Patterns", href: "/dashboard/patterns" },
    { icon: <Activity className="w-5 h-5" />, label: "Analytics", href: "/dashboard/analytics" },
    { icon: <Settings className="w-5 h-5" />, label: "Settings", href: "/dashboard/settings" },
  ];

  const closeSidebar = () => setSidebarOpen(false);
  const handleSidebarLogout = () => {
    closeSidebar();
    logout();
  };
  const toggleNotifications = () => setNotificationsOpen((prev) => !prev);
  const toggleUserMenu = () => setUserMenuOpen((prev) => !prev);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 w-64 h-screen bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <span className="text-lg sm:text-xl font-bold text-gray-900">Kenchi</span>
          </Link>
          <button
            onClick={closeSidebar}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => (
            <SidebarItem
              key={item.label}
              {...item}
              active={currentPath === item.href}
              onClick={closeSidebar}
            />
          ))}
        </nav>

        <div className="p-3 sm:p-4 border-t border-gray-100 space-y-1">
          <button className="flex items-center gap-3 px-4 py-3 w-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors">
            <HelpCircle className="w-5 h-5" />
            <span className="font-medium">Help & Support</span>
          </button>
          <button
            onClick={handleSidebarLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

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
                        onClick={() => logout()}
                        className="flex items-center gap-3 px-4 py-2 w-full text-left text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-4 sm:p-6 lg:p-8">
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
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</h3>
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

          {/* Getting Started */}
          <Card className="mb-6 sm:mb-8">
            <CardHeader className="border-b">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-indigo-500" />
                <CardTitle>Getting Started</CardTitle>
              </div>
              <CardDescription>
                Complete these steps to start analyzing your CI/CD failures.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {gettingStartedSteps.map((step, stepIndex) => (
                  <div
                    key={step.title}
                    className="flex items-start gap-4 p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <Circle className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 text-sm">
                          {stepIndex + 1}. {step.title}
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          Pending
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">{step.description}</p>
                      <Link
                        to={step.href}
                        className="inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                      >
                        {step.linkLabel}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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
            <CardContent className="py-8">
              <Empty className="border-0">
                <EmptyMedia variant="icon">
                  <Activity className="w-6 h-6" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No recent activity</EmptyTitle>
                  <EmptyDescription>
                    Connect a repository and push some code to see CI analysis results here.
                  </EmptyDescription>
                </EmptyHeader>
                <Link
                  to="/dashboard/repos"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <GitBranch className="w-4 h-4" />
                  Connect a Repository
                </Link>
              </Empty>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
