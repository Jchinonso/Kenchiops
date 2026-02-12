import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  AlertTriangle,
  Target,
  Zap,
  BarChart3,
  Settings,
  Bell,
  Search,
  ChevronDown,
  CheckCircle,
  Clock,
  TrendingUp,
  Activity,
  Repeat,
  MoreHorizontal,
  Filter,
  Download,
  RefreshCw,
  LogOut,
  User,
  HelpCircle,
  Menu,
  X,
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

interface StatCardProps {
  readonly title: string;
  readonly value: string;
  readonly change: string;
  readonly changeType: "positive" | "negative" | "neutral";
  readonly icon: React.ReactNode;
  readonly color: string;
}

const StatCard = ({ title, value, change, changeType, icon, color }: StatCardProps) => (
  <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-xs sm:text-sm text-gray-500 mb-1">{title}</p>
        <h3 className="text-xl sm:text-2xl font-bold text-gray-900">{value}</h3>
        <div className="flex items-center gap-1 mt-1">
          <span
            className={`text-xs sm:text-sm font-medium ${
              changeType === "positive"
                ? "text-green-600"
                : changeType === "negative"
                  ? "text-red-600"
                  : "text-gray-600"
            }`}
          >
            {change}
          </span>
          <span className="text-xs text-gray-400 hidden sm:inline">vs last week</span>
        </div>
      </div>
      <div
        className={`w-10 h-10 sm:w-12 sm:h-12 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}
      >
        {icon}
      </div>
    </div>
  </div>
);

interface FailureItemProps {
  readonly title: string;
  readonly repo: string;
  readonly branch: string;
  readonly status: "open" | "analyzing" | "resolved";
  readonly time: string;
  readonly confidence: string;
}

const FailureItem = ({ title, repo, branch, status, time, confidence }: FailureItemProps) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 hover:bg-gray-50 rounded-lg transition-colors gap-2 sm:gap-0">
    <div className="flex items-start sm:items-center gap-3">
      <div
        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          status === "open"
            ? "bg-red-100 text-red-600"
            : status === "analyzing"
              ? "bg-amber-100 text-amber-600"
              : "bg-green-100 text-green-600"
        }`}
      >
        <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <div className="min-w-0">
        <h4 className="font-medium text-gray-900 text-sm sm:text-base truncate">{title}</h4>
        <p className="text-xs sm:text-sm text-gray-500 truncate">
          {repo} • {branch} • {time}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 sm:gap-4 ml-11 sm:ml-0">
      <div className="flex items-center gap-1 text-gray-400">
        <span className="text-xs sm:text-sm">{confidence}</span>
        <span className="text-xs hidden sm:inline">confidence</span>
      </div>
      <span
        className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
          status === "open"
            ? "bg-red-100 text-red-700"
            : status === "analyzing"
              ? "bg-amber-100 text-amber-700"
              : "bg-green-100 text-green-700"
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    </div>
  </div>
);

interface FailurePatternProps {
  readonly title: string;
  readonly frequency: "high" | "medium" | "low";
  readonly type: string;
  readonly occurrences: string;
}

const FailurePattern = ({ title, frequency, type, occurrences }: FailurePatternProps) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 hover:bg-gray-50 rounded-lg transition-colors gap-2 sm:gap-0">
    <div className="flex items-start sm:items-center gap-3">
      <div
        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          frequency === "high"
            ? "bg-red-100 text-red-600"
            : frequency === "medium"
              ? "bg-amber-100 text-amber-600"
              : "bg-blue-100 text-blue-600"
        }`}
      >
        <Repeat className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <div className="min-w-0">
        <h4 className="font-medium text-gray-900 text-sm sm:text-base truncate">{title}</h4>
        <p className="text-xs sm:text-sm text-gray-500 truncate">
          {type} • {occurrences}
        </p>
      </div>
    </div>
    <span
      className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ml-11 sm:ml-0 self-start sm:self-auto ${
        frequency === "high"
          ? "bg-red-100 text-red-700"
          : frequency === "medium"
            ? "bg-amber-100 text-amber-700"
            : "bg-blue-100 text-blue-700"
      }`}
    >
      {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
    </span>
  </div>
);

const Dashboard = () => {
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const sidebarItems = [
    { icon: <LayoutDashboard className="w-5 h-5" />, label: "Overview", href: "/dashboard" },
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      label: "CI Failures",
      href: "/dashboard/failures",
    },
    { icon: <Search className="w-5 h-5" />, label: "Analyses", href: "/dashboard/analyses" },
    { icon: <TrendingUp className="w-5 h-5" />, label: "Patterns", href: "/dashboard/patterns" },
    { icon: <BarChart3 className="w-5 h-5" />, label: "Analytics", href: "/dashboard/analytics" },
    { icon: <Settings className="w-5 h-5" />, label: "Settings", href: "/dashboard/settings" },
  ];

  const stats = [
    {
      title: "Failed Builds",
      value: "18",
      change: "-31%",
      changeType: "positive" as const,
      icon: <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
      color: "bg-red-500",
    },
    {
      title: "Root Cause Accuracy",
      value: "93%",
      change: "+4%",
      changeType: "positive" as const,
      icon: <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
      color: "bg-green-500",
    },
    {
      title: "Avg Resolution Time",
      value: "12min",
      change: "-42%",
      changeType: "positive" as const,
      icon: <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
      color: "bg-blue-500",
    },
    {
      title: "Active Analyses",
      value: "6",
      change: "+2",
      changeType: "neutral" as const,
      icon: <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />,
      color: "bg-indigo-500",
    },
  ];

  const recentFailures = [
    {
      title: "TypeScript build error in auth module",
      repo: "frontend-app",
      branch: "feature/sso",
      status: "analyzing" as const,
      time: "12 min ago",
      confidence: "92%",
    },
    {
      title: "Docker image build timeout exceeded",
      repo: "backend-api",
      branch: "main",
      status: "resolved" as const,
      time: "2 hours ago",
      confidence: "97%",
    },
    {
      title: "Test suite segfault in CI runner",
      repo: "shared-lib",
      branch: "refactor/core",
      status: "open" as const,
      time: "4 hours ago",
      confidence: "78%",
    },
    {
      title: "Dependency conflict: react@19 vs react@18",
      repo: "web-app",
      branch: "deps/upgrade",
      status: "resolved" as const,
      time: "1 day ago",
      confidence: "95%",
    },
  ];

  const failurePatterns = [
    {
      title: "Module resolution errors",
      frequency: "high" as const,
      type: "Build",
      occurrences: "23 this week",
    },
    {
      title: "Flaky test: payment flow",
      frequency: "medium" as const,
      type: "Test",
      occurrences: "8 this week",
    },
    {
      title: "Docker layer cache miss",
      frequency: "medium" as const,
      type: "Infra",
      occurrences: "5 this week",
    },
    {
      title: "OOM kill in CI runner",
      frequency: "low" as const,
      type: "Resource",
      occurrences: "2 this week",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 w-64 h-screen bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
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
          {/* Close button for mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => (
            <SidebarItem
              key={item.label}
              {...item}
              active={location.pathname === item.href}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 sm:p-4 border-t border-gray-100 space-y-1">
          <button className="flex items-center gap-3 px-4 py-3 w-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors">
            <HelpCircle className="w-5 h-5" />
            <span className="font-medium">Help & Support</span>
          </button>
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-4 py-3 w-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 sm:py-4 gap-4">
            {/* Left: Hamburger + Search */}
            <div className="flex items-center gap-3 flex-1">
              {/* Hamburger Menu Button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Search */}
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

            {/* Right Actions */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => {
                    setNotificationsOpen(!notificationsOpen);
                    setUserMenuOpen(false);
                  }}
                  className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                </button>

                {/* Notifications Dropdown */}
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <h4 className="font-semibold text-gray-900">Notifications</h4>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <div className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <p className="text-sm text-gray-900">
                          Root cause identified for build #1847
                        </p>
                        <p className="text-xs text-gray-500 mt-1">2 minutes ago</p>
                      </div>
                      <div className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <p className="text-sm text-gray-900">
                          New failure pattern detected in backend-api
                        </p>
                        <p className="text-xs text-gray-500 mt-1">1 hour ago</p>
                      </div>
                      <div className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <p className="text-sm text-gray-900">Analysis complete: 97% confidence</p>
                        <p className="text-xs text-gray-500 mt-1">3 hours ago</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    setUserMenuOpen(!userMenuOpen);
                    setNotificationsOpen(false);
                  }}
                  className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-xs sm:text-sm">JD</span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-gray-900">John Doe</p>
                    <p className="text-xs text-gray-500">john@company.com</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                </button>

                {/* User Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                    <div className="px-4 py-3 border-b border-gray-100 sm:hidden">
                      <p className="font-medium text-gray-900">John Doe</p>
                      <p className="text-sm text-gray-500">john@company.com</p>
                    </div>
                    <div className="px-4 py-3 border-b border-gray-100 hidden sm:block">
                      <p className="font-medium text-gray-900">John Doe</p>
                      <p className="text-sm text-gray-500">john@company.com</p>
                    </div>
                    <Link
                      to="#"
                      className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </Link>
                    <Link
                      to="#"
                      className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      <Link
                        to="/"
                        className="flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Page Title */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard Overview</h1>
            <p className="text-sm sm:text-base text-gray-500 mt-1">
              Welcome back! Here's your CI/CD pipeline health at a glance.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
            {stats.map((stat, index) => (
              <StatCard key={index} {...stat} />
            ))}
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-8">
            {/* Recent CI Failures */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100">
                <div className="flex items-center gap-2 sm:gap-3">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                  <h2 className="font-semibold text-gray-900 text-sm sm:text-base">
                    Recent CI Failures
                  </h2>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Filter className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {recentFailures.map((failure, failureIndex) => (
                  <FailureItem key={failureIndex} {...failure} />
                ))}
              </div>
              <div className="p-3 sm:p-4 border-t border-gray-100">
                <Link
                  to="/dashboard/failures"
                  className="flex items-center justify-center gap-2 text-indigo-500 hover:text-indigo-600 font-medium text-sm"
                >
                  View All CI Failures
                  <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
                </Link>
              </div>
            </div>

            {/* Failure Patterns */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Repeat className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                  <h2 className="font-semibold text-gray-900 text-sm sm:text-base">
                    Failure Patterns
                  </h2>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {failurePatterns.map((pattern, patternIndex) => (
                  <FailurePattern key={patternIndex} {...pattern} />
                ))}
              </div>
              <div className="p-3 sm:p-4 border-t border-gray-100">
                <Link
                  to="/dashboard/patterns"
                  className="flex items-center justify-center gap-2 text-indigo-500 hover:text-indigo-600 font-medium text-sm"
                >
                  View All Patterns
                  <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
                </Link>
              </div>
            </div>

            {/* Analysis Accuracy */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Target className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                  <h2 className="font-semibold text-gray-900 text-sm sm:text-base">
                    Analysis Accuracy
                  </h2>
                </div>
                <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-center mb-4 sm:mb-6">
                  <div className="relative w-32 h-32 sm:w-40 sm:h-40">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="10"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="10"
                        strokeDasharray="234 251"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-bold text-gray-900">93%</span>
                      <span className="text-xs sm:text-sm text-gray-500">Accuracy</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                      <span className="text-sm text-gray-700">Pattern Match Rate</span>
                    </div>
                    <span className="font-medium text-gray-900 text-sm">89%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                      <span className="text-sm text-gray-700">Historical Match</span>
                    </div>
                    <span className="font-medium text-gray-900 text-sm">76%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Target className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
                      <span className="text-sm text-gray-700">Avg Confidence</span>
                    </div>
                    <span className="font-medium text-gray-900 text-sm">0.91</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                      <span className="text-sm text-gray-700">Analysis Coverage</span>
                    </div>
                    <span className="font-medium text-gray-900 text-sm">98%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pipeline Health */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100">
                <div className="flex items-center gap-2 sm:gap-3">
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                  <h2 className="font-semibold text-gray-900 text-sm sm:text-base">
                    Pipeline Health
                  </h2>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="flex items-end justify-between h-36 sm:h-48 gap-1 sm:gap-2">
                  {[
                    { day: "Mon", value: 40 },
                    { day: "Tue", value: 65 },
                    { day: "Wed", value: 45 },
                    { day: "Thu", value: 80 },
                    { day: "Fri", value: 55 },
                    { day: "Sat", value: 30 },
                    { day: "Sun", value: 25 },
                  ].map((item, index) => (
                    <div key={index} className="flex flex-col items-center gap-1 sm:gap-2 flex-1">
                      <div
                        className="w-full bg-indigo-100 rounded-t-lg relative overflow-hidden"
                        style={{ height: `${item.value}%` }}
                      >
                        <div className="absolute bottom-0 left-0 right-0 h-full bg-indigo-500 rounded-t-lg transition-all duration-500" />
                      </div>
                      <span className="text-[10px] sm:text-xs text-gray-500">{item.day}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-100">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Total Analyses</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900">156</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Avg Analysis Time</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900">1.8min</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Resolution Rate</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900">87%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
