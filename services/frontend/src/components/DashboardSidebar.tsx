/**
 * Dashboard Sidebar
 *
 * Collapsible navigation with grouped sections for the full platform:
 * CI/CD, Incidents, Infrastructure, Deployments, plus top-level items
 * for Overview, Analytics, Integrations, and Settings.
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  AlertTriangle,
  Search,
  Workflow,
  GitBranch,
  Flame,
  Clock,
  FileText,
  Siren,
  Server,
  FileCode,
  RefreshCw,
  DollarSign,
  Rocket,
  ShieldAlert,
  ArrowUpCircle,
  BarChart3,
  Puzzle,
  Settings,
  ChevronRight,
  HelpCircle,
  LogOut,
  Loader2,
  X,
} from "lucide-react";

// ==================== Types ====================

interface NavLeafItem {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly href: string;
}

interface NavGroup {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly basePath: string;
  readonly children: readonly NavLeafItem[];
}

type NavEntry = NavLeafItem | NavGroup;

const isNavGroup = (entry: NavEntry): entry is NavGroup => "children" in entry;

interface DashboardSidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onLogout: () => void;
  readonly isLoggingOut: boolean;
}

// ==================== Navigation Data ====================

const NAV_ENTRIES: readonly NavEntry[] = [
  {
    icon: <LayoutDashboard className="w-5 h-5" />,
    label: "Overview",
    href: "/dashboard",
  },
  {
    icon: <GitBranch className="w-5 h-5" />,
    label: "CI/CD",
    basePath: "/dashboard/cicd",
    children: [
      {
        icon: <AlertTriangle className="w-4 h-4" />,
        label: "Failures",
        href: "/dashboard/cicd/failures",
      },
      { icon: <Search className="w-4 h-4" />, label: "Analyses", href: "/dashboard/cicd/analyses" },
      {
        icon: <Workflow className="w-4 h-4" />,
        label: "Pipelines",
        href: "/dashboard/cicd/pipelines",
      },
    ],
  },
  {
    icon: <Siren className="w-5 h-5" />,
    label: "Incidents",
    basePath: "/dashboard/incidents",
    children: [
      { icon: <Flame className="w-4 h-4" />, label: "Active", href: "/dashboard/incidents/active" },
      {
        icon: <Clock className="w-4 h-4" />,
        label: "Timeline",
        href: "/dashboard/incidents/timeline",
      },
      {
        icon: <FileText className="w-4 h-4" />,
        label: "Postmortems",
        href: "/dashboard/incidents/postmortems",
      },
    ],
  },
  {
    icon: <Server className="w-5 h-5" />,
    label: "Infrastructure",
    basePath: "/dashboard/infra",
    children: [
      {
        icon: <FileCode className="w-4 h-4" />,
        label: "IaC Reviews",
        href: "/dashboard/infra/iac",
      },
      { icon: <RefreshCw className="w-4 h-4" />, label: "Drift", href: "/dashboard/infra/drift" },
      { icon: <DollarSign className="w-4 h-4" />, label: "Cost", href: "/dashboard/infra/cost" },
    ],
  },
  {
    icon: <Rocket className="w-5 h-5" />,
    label: "Deployments",
    basePath: "/dashboard/deployments",
    children: [
      {
        icon: <ShieldAlert className="w-4 h-4" />,
        label: "Risk Scores",
        href: "/dashboard/deployments/risk",
      },
      {
        icon: <ArrowUpCircle className="w-4 h-4" />,
        label: "Rollouts",
        href: "/dashboard/deployments/rollouts",
      },
    ],
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    label: "Analytics",
    href: "/dashboard/analytics",
  },
  {
    icon: <Puzzle className="w-5 h-5" />,
    label: "Integrations",
    href: "/dashboard/integrations",
  },
  {
    icon: <Settings className="w-5 h-5" />,
    label: "Settings",
    href: "/dashboard/settings",
  },
];

// ==================== Sub-components ====================

interface LeafItemProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
  readonly indented?: boolean;
  readonly onClick?: () => void;
}

const SidebarLeafItem = ({ icon, label, href, active, indented, onClick }: LeafItemProps) => (
  <Link
    to={href}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 rounded-lg transition-all duration-200 text-sm",
      indented ? "ml-5 pl-3 py-2 border-l-2" : "px-4 py-2.5",
      active
        ? indented
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium"
          : "bg-indigo-500 text-white shadow-md font-medium"
        : indented
          ? "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
    )}
  >
    {icon}
    <span>{label}</span>
  </Link>
);

interface NavGroupProps {
  readonly group: NavGroup;
  readonly pathname: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onItemClick?: () => void;
}

const SidebarNavGroup = ({ group, pathname, isOpen, onToggle, onItemClick }: NavGroupProps) => {
  const hasActiveChild = group.children.some((child) => pathname.startsWith(child.href));

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center justify-between w-full px-4 py-2.5 rounded-lg transition-all duration-200 text-sm",
          hasActiveChild
            ? "text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/60"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
        )}
      >
        <div className="flex items-center gap-3">
          {group.icon}
          <span className="font-medium">{group.label}</span>
        </div>
        <ChevronRight
          className={cn(
            "w-4 h-4 text-gray-400 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="mt-1 space-y-0.5 pb-1">
          {group.children.map((child) => (
            <SidebarLeafItem
              key={child.href}
              {...child}
              active={pathname.startsWith(child.href)}
              indented
              onClick={onItemClick}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ==================== Main Component ====================

const isLeafActive = (entry: NavLeafItem, pathname: string): boolean =>
  entry.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(entry.href);

export const DashboardSidebar = ({
  isOpen,
  onClose,
  onLogout,
  isLoggingOut,
}: DashboardSidebarProps) => {
  const { pathname } = useLocation();

  // Auto-expand groups containing the active route on mount
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        NAV_ENTRIES.filter(
          (entry): entry is NavGroup =>
            isNavGroup(entry) && entry.children.some((child) => pathname.startsWith(child.href))
        ).map((group) => group.label)
      )
  );

  // Auto-expand only the active group when navigating (accordion behavior)
  useEffect(() => {
    const matchingGroup = NAV_ENTRIES.find(
      (entry): entry is NavGroup =>
        isNavGroup(entry) && entry.children.some((child) => pathname.startsWith(child.href))
    );
    if (matchingGroup) {
      setOpenGroups(new Set([matchingGroup.label]));
    }
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "fixed lg:sticky top-0 left-0 z-50 w-64 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      {/* Logo */}
      <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
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
          <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
            Kenchi
          </span>
        </Link>
        <button onClick={onClose} className="lg:hidden p-2 text-gray-500 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto">
        {NAV_ENTRIES.map((entry) =>
          isNavGroup(entry) ? (
            <SidebarNavGroup
              key={entry.label}
              group={entry}
              pathname={pathname}
              isOpen={openGroups.has(entry.label)}
              onToggle={() => toggleGroup(entry.label)}
              onItemClick={onClose}
            />
          ) : (
            <SidebarLeafItem
              key={entry.href}
              {...entry}
              active={isLeafActive(entry, pathname)}
              onClick={onClose}
            />
          )
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-gray-800 space-y-1">
        <button className="flex items-center gap-3 px-4 py-3 w-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg transition-colors">
          <HelpCircle className="w-5 h-5" />
          <span className="font-medium text-sm">Help & Support</span>
        </button>
        <button
          onClick={onLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-3 px-4 py-3 w-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoggingOut ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <LogOut className="w-5 h-5" />
          )}
          <span className="font-medium text-sm">
            {isLoggingOut ? "Signing out..." : "Sign Out"}
          </span>
        </button>
      </div>
    </aside>
  );
};
