/**
 * NotificationItem — single notification row in the dropdown.
 */

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AlertTriangle, Search, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/formatters";
import type { NotificationItemProps } from "./types";

export const NotificationItem = ({
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
          "px-4 py-3 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group",
          !read && "bg-indigo-50/50 dark:bg-indigo-950/20"
        )}
      >
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", iconColor)} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm truncate",
              read
                ? "text-zinc-700 dark:text-zinc-300"
                : "text-zinc-900 dark:text-zinc-100 font-medium"
            )}
          >
            {title}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{description}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            {formatRelativeTime(timestamp)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </Link>
  );
};
