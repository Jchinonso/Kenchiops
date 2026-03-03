/**
 * NotificationDropdown — floating notification list with mark-all-read.
 */

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";
import { NotificationItem } from "./NotificationItem";
import type { NotificationDropdownProps } from "./types";

export const NotificationDropdown = ({
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkAsRead,
  onDismiss,
  onClose,
}: NotificationDropdownProps) => {
  const hasNotifications = notifications.length > 0;

  return (
    <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-100 dark:border-zinc-800 z-50">
      <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Notifications</h4>
        <button
          type="button"
          disabled={unreadCount < 1}
          onClick={onMarkAllRead}
          className={cn(
            "text-xs transition-colors",
            unreadCount > 0
              ? "text-indigo-500 hover:text-indigo-600 cursor-pointer"
              : "text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
          )}
        >
          Mark all read
        </button>
      </div>

      {hasNotifications ? (
        <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
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
          <Bell className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            No notifications yet
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            CI/CD failure alerts and analysis results will appear here.
          </p>
        </div>
      )}

      <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800">
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
