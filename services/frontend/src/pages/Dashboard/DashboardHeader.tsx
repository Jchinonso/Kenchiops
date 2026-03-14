/**
 * Dashboard header with breadcrumb, refresh indicator, theme toggle, and notifications.
 */

import { Bell, Menu, Moon, Sun, RefreshCw } from "lucide-react";
import { DashboardBreadcrumb } from "@/components/DashboardBreadcrumb";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { NotificationDropdown } from "./NotificationDropdown";
import type { DashboardNotification } from "@/hooks/useDashboardSSE";

interface DashboardHeaderProps {
  readonly lastUpdatedLabel: string;
  readonly onRefresh: () => void;
  readonly isRefreshing: boolean;
  readonly resolvedTheme: string;
  readonly onToggleTheme: () => void;
  readonly unreadCount: number;
  readonly onToggleNotifications: () => void;
  readonly notificationsOpen: boolean;
  readonly notificationsRef: React.RefObject<HTMLDivElement | null>;
  readonly notifications: readonly DashboardNotification[];
  readonly onMarkAllRead: () => void;
  readonly onMarkAsRead: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onCloseNotifications: () => void;
  readonly onOpenSidebar: () => void;
}

export const DashboardHeader = ({
  lastUpdatedLabel,
  onRefresh,
  isRefreshing,
  resolvedTheme,
  onToggleTheme,
  unreadCount,
  onToggleNotifications,
  notificationsOpen,
  notificationsRef,
  notifications,
  onMarkAllRead,
  onMarkAsRead,
  onDismiss,
  onCloseNotifications,
  onOpenSidebar,
}: DashboardHeaderProps) => (
  <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30">
    <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 sm:py-4 gap-4">
      <div className="flex items-center gap-3 flex-1">
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
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
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline text-xs text-zinc-400 dark:text-zinc-500">
            {isRefreshing ? "Refreshing..." : `Updated ${lastUpdatedLabel}`}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-1.5 sm:p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                aria-label={isRefreshing ? "Refreshing data..." : "Refresh data"}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{isRefreshing ? "Refreshing..." : "Refresh data (r)"}</TooltipContent>
          </Tooltip>
        </div>

        {/* Theme Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleTheme}
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
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
                onClick={onToggleNotifications}
                className="relative p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
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
              onMarkAllRead={onMarkAllRead}
              onMarkAsRead={onMarkAsRead}
              onDismiss={onDismiss}
              onClose={onCloseNotifications}
            />
          )}
        </div>
      </div>
    </div>
  </header>
);
