/**
 * Dashboard Sidebar
 *
 * Collapsible navigation with grouped sections for the full platform:
 * CI/CD, Incidents, Infrastructure, Deployments, plus top-level items
 * for Overview, Analytics, Integrations, and Settings.
 */

import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import { useAuth } from "@/hooks/useAuth";
import { fetchQuery } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Search,
  Workflow,
  Webhook,
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
  BookOpen,
  Puzzle,
  Settings,
  ChevronRight,
  HelpCircle,
  LogOut,
  Loader2,
  Keyboard,
  ChevronsUpDown,
  X,
} from "lucide-react";

import type { NavEntry, NavGroup, UserInfo } from "./types";
import { isNavGroup, isLeafActive } from "./helpers";
import { PREFETCH_STALE_TIME } from "./constants";

// ==================== Types ====================

interface DashboardSidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onLogout: () => void;
  readonly isLoggingOut: boolean;
  readonly user: UserInfo | null;
  readonly onOpenShortcuts: () => void;
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
      { icon: <Search className="w-4 h-4" />, label: "Analyses", href: "/dashboard/cicd/analyses" },
      {
        icon: <Workflow className="w-4 h-4" />,
        label: "Pipelines",
        href: "/dashboard/cicd/pipelines",
      },
      {
        icon: <Webhook className="w-4 h-4" />,
        label: "Webhooks",
        href: "/dashboard/cicd/webhooks",
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
    comingSoon: true,
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
    comingSoon: true,
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
    comingSoon: true,
  },
  {
    icon: <BookOpen className="w-5 h-5" />,
    label: "Knowledge Base",
    href: "/dashboard/knowledge-base",
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

// ==================== Prefetch Logic ====================

/**
 * Returns a stable callback that prefetches data for a given route on hover.
 * Uses the same query keys and fetch functions as the consuming page hooks
 * so TanStack Query deduplicates correctly.
 */
const usePrefetchRoute = (): ((href: string) => void) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  return useCallback(
    (href: string) => {
      switch (href) {
        case "/dashboard": {
          void queryClient.prefetchQuery({
            queryKey: queryKeys.dashboard.stats(),
            queryFn: () => fetchQuery("/api/v1/dashboard/stats"),
            staleTime: PREFETCH_STALE_TIME,
          });
          void queryClient.prefetchQuery({
            queryKey: queryKeys.dashboard.confidence.distribution(),
            queryFn: () => fetchQuery("/api/v1/dashboard/stats/confidence-distribution"),
            staleTime: PREFETCH_STALE_TIME,
          });
          void queryClient.prefetchQuery({
            queryKey: queryKeys.dashboard.analyses.list({
              limit: 5,
              offset: 0,
            }),
            queryFn: () => fetchQuery("/api/v1/dashboard/analyses?limit=5&offset=0"),
            staleTime: PREFETCH_STALE_TIME,
          });
          void queryClient.prefetchQuery({
            queryKey: queryKeys.dashboard.failures.list({
              limit: 5,
              offset: 0,
            }),
            queryFn: () => fetchQuery("/api/v1/dashboard/failures?limit=5&offset=0"),
            staleTime: PREFETCH_STALE_TIME,
          });
          break;
        }

        case "/dashboard/cicd/analyses": {
          void queryClient.prefetchQuery({
            queryKey: queryKeys.dashboard.analyses.list({
              limit: 20,
              offset: 0,
            }),
            queryFn: () => fetchQuery("/api/v1/dashboard/analyses?limit=20&offset=0"),
            staleTime: PREFETCH_STALE_TIME,
          });
          void queryClient.prefetchQuery({
            queryKey: queryKeys.dashboard.analyses.countsByRepo(),
            queryFn: () => fetchQuery("/api/v1/dashboard/stats/analyses-by-repo"),
            staleTime: PREFETCH_STALE_TIME,
          });
          break;
        }

        case "/dashboard/cicd/webhooks": {
          void queryClient.prefetchQuery({
            queryKey: queryKeys.dashboard.webhookActivity({
              limit: 20,
              offset: 0,
            }),
            queryFn: () => fetchQuery("/api/v1/dashboard/webhook-activity?limit=20&offset=0"),
            staleTime: PREFETCH_STALE_TIME,
          });
          break;
        }

        case "/dashboard/incidents/active": {
          if (!tenantId) {
            break;
          }
          void queryClient.prefetchQuery({
            queryKey: queryKeys.incidents.list({
              tenantId,
              limit: 20,
              offset: 0,
            }),
            queryFn: () => fetchQuery("/api/v1/incidents?limit=20&offset=0"),
            staleTime: PREFETCH_STALE_TIME,
          });
          break;
        }

        // Investigations page hidden from nav (chat copilot covers this use case).
        // Route still works if accessed directly.

        case "/dashboard/knowledge-base": {
          void queryClient.prefetchQuery({
            queryKey: queryKeys.knowledgeBase.stats(),
            queryFn: () => fetchQuery("/api/rag/stats"),
            staleTime: PREFETCH_STALE_TIME,
          });
          void queryClient.prefetchQuery({
            queryKey: queryKeys.knowledgeBase.documents({
              limit: 20,
              offset: 0,
            }),
            queryFn: () => fetchQuery("/api/rag/documents?limit=20&offset=0"),
            staleTime: PREFETCH_STALE_TIME,
          });
          break;
        }

        default:
          break;
      }
    },
    [queryClient, tenantId]
  );
};

// ==================== Sub-components ====================

interface LeafItemProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
  readonly indented?: boolean;
  readonly comingSoon?: boolean;
  readonly onClick?: () => void;
  readonly onPrefetch?: () => void;
}

const SidebarLeafItem = ({
  icon,
  label,
  href,
  active,
  indented,
  comingSoon,
  onClick,
  onPrefetch,
}: LeafItemProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Link
        to={href}
        onClick={onClick}
        onPointerEnter={onPrefetch}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg transition-all duration-[250ms] text-sm",
          indented
            ? "ml-5 pl-4 py-2 border-l-2 md:ml-0 md:pl-0 md:border-l-0 md:justify-center md:px-2 lg:ml-5 lg:pl-4 lg:border-l-2 lg:justify-start lg:px-0"
            : "px-4 py-2.5 md:justify-center md:px-2 lg:justify-start lg:px-4",
          active
            ? indented
              ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-medium pl-5 lg:pl-5"
              : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-l-2 border-indigo-500 dark:border-indigo-400 font-medium"
            : indented
              ? "border-transparent text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 hover:pl-5 lg:hover:pl-5"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
        )}
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="hidden md:hidden lg:inline group-data-[open=true]:inline">{label}</span>
        {comingSoon && (
          <span className="ml-auto text-[10px] font-medium text-zinc-500 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/50 px-1.5 py-0.5 rounded hidden md:hidden lg:inline-block group-data-[open=true]:inline-block">
            Soon
          </span>
        )}
      </Link>
    </TooltipTrigger>
    <TooltipContent side="right" className="hidden md:block lg:hidden">
      {label}
    </TooltipContent>
  </Tooltip>
);

interface NavGroupProps {
  readonly group: NavGroup;
  readonly pathname: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onItemClick?: () => void;
  readonly onPrefetch?: (href: string) => void;
}

const SidebarNavGroup = ({
  group,
  pathname,
  isOpen,
  onToggle,
  onItemClick,
  onPrefetch,
}: NavGroupProps) => {
  const hasActiveChild = group.children.some((child) => pathname.startsWith(child.href));
  const submenuId = `submenu-${group.label.toLowerCase().replace(/\//g, "-")}`;
  const firstChildHref = group.children[0]?.href ?? group.basePath;

  return (
    <>
      {/* Collapsed (tablet): icon-only link with tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={firstChildHref}
            onClick={onItemClick}
            aria-label={group.label}
            className={cn(
              "hidden md:flex lg:hidden items-center justify-center w-full px-2 py-2.5 rounded-lg transition-all duration-[250ms] text-sm",
              hasActiveChild
                ? "text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/5"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
            )}
          >
            <span className="flex-shrink-0">{group.icon}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{group.label}</TooltipContent>
      </Tooltip>

      {/* Expanded (mobile overlay + desktop): full nav group */}
      <Collapsible open={isOpen} onOpenChange={onToggle} className="md:hidden lg:block">
        <CollapsibleTrigger
          aria-haspopup="true"
          aria-controls={submenuId}
          className={cn(
            "flex items-center justify-between w-full px-4 py-2.5 rounded-lg transition-all duration-[250ms] text-sm",
            hasActiveChild
              ? "text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/5"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
          )}
        >
          <div className="flex items-center gap-3">
            {group.icon}
            <span className="font-medium">{group.label}</span>
            {group.comingSoon && (
              <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/50 px-1.5 py-0.5 rounded">
                Soon
              </span>
            )}
          </div>
          <ChevronRight
            className={cn(
              "w-4 h-4 text-zinc-400 dark:text-zinc-600 transition-transform duration-200",
              isOpen && "rotate-90"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div id={submenuId} className="mt-1 space-y-0.5 pb-1">
            {group.children.map((child) => (
              <SidebarLeafItem
                key={child.href}
                {...child}
                active={pathname.startsWith(child.href)}
                indented
                onClick={onItemClick}
                onPrefetch={
                  !child.comingSoon && onPrefetch ? () => onPrefetch(child.href) : undefined
                }
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
};

// ==================== Main Component ====================

export const DashboardSidebar = ({
  isOpen,
  onClose,
  onLogout,
  isLoggingOut,
  user,
  onOpenShortcuts,
}: DashboardSidebarProps) => {
  const { pathname } = useLocation();

  // Auto-expand groups containing the active route on mount
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        NAV_ENTRIES.filter(
          (entry): entry is NavGroup =>
            isNavGroup(entry) &&
            !entry.comingSoon &&
            entry.children.some((child) => pathname.startsWith(child.href))
        ).map((group) => group.label)
      )
  );

  // Auto-expand only the active group when navigating (accordion behavior)
  // Uses render-time state adjustment to avoid setState-in-effect
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    const matchingGroup = NAV_ENTRIES.find(
      (entry): entry is NavGroup =>
        isNavGroup(entry) &&
        !entry.comingSoon &&
        entry.children.some((child) => pathname.startsWith(child.href))
    );
    if (matchingGroup) {
      setOpenGroups(new Set([matchingGroup.label]));
    }
  }

  const prefetchRoute = usePrefetchRoute();

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
      data-open={isOpen}
      className={cn(
        "group fixed md:sticky top-0 left-0 z-50 w-64 md:w-16 lg:w-64 h-screen bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800/60 flex flex-col transition-all duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Logo */}
      <div className="p-4 sm:p-6 md:p-3 lg:p-6 border-b border-zinc-200 dark:border-zinc-800/60 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/30">
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
          <span className="text-lg sm:text-xl font-display font-bold text-zinc-900 dark:text-zinc-100 hidden md:hidden lg:inline group-data-[open=true]:inline">
            Kenchi
          </span>
        </Link>
        <button
          onClick={onClose}
          className="md:hidden p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Amber glow edge */}
      <div
        className="h-px w-full flex-shrink-0"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.25), transparent)",
        }}
      />

      {/* Organization Switcher */}
      <div className="border-b border-zinc-200 dark:border-zinc-800/60">
        <OrganizationSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 sm:p-4 md:p-2 lg:px-4 lg:py-3 space-y-1 overflow-y-auto">
        {NAV_ENTRIES.map((entry) =>
          isNavGroup(entry) ? (
            <SidebarNavGroup
              key={entry.label}
              group={entry}
              pathname={pathname}
              isOpen={openGroups.has(entry.label)}
              onToggle={() => toggleGroup(entry.label)}
              onItemClick={onClose}
              onPrefetch={!entry.comingSoon ? prefetchRoute : undefined}
            />
          ) : (
            <SidebarLeafItem
              key={entry.href}
              {...entry}
              active={isLeafActive(entry, pathname)}
              onClick={onClose}
              onPrefetch={!entry.comingSoon ? () => prefetchRoute(entry.href) : undefined}
            />
          )
        )}
      </nav>

      {/* User Menu (Popover) */}
      {/* Section divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-700/50 to-transparent" />
      <div className="border-t border-zinc-200 dark:border-zinc-800/60 p-3 sm:p-4 md:p-2 lg:p-4">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 w-full px-3 py-2.5 md:justify-center md:px-0 lg:justify-start lg:px-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-8 h-8 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-indigo-500/20">
                  <span className="text-white font-medium text-xs">
                    {(user?.displayName ?? "U")
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1 text-left hidden md:hidden lg:block group-data-[open=true]:block">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {user?.displayName ?? "User"}
                </p>
                {user?.email && (
                  <p className="text-xs text-zinc-500 truncate" title={user.email}>
                    {user.email}
                  </p>
                )}
              </div>
              <ChevronsUpDown className="w-4 h-4 text-zinc-400 dark:text-zinc-600 flex-shrink-0 hidden md:hidden lg:block group-data-[open=true]:block" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" sideOffset={8} className="w-56 p-1.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenShortcuts();
              }}
              className="flex items-center gap-3 px-3 py-2 w-full text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              <Keyboard className="w-4 h-4" />
              <span>Keyboard Shortcuts</span>
            </button>
            <a
              href="https://github.com/kenchiops/kenchi/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 w-full text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Help & Support</span>
            </a>
            <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-3 px-3 py-2 w-full text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              <span>{isLoggingOut ? "Signing out..." : "Sign Out"}</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  );
};
