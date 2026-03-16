/**
 * Shared types for the Dashboard module.
 */

import type { DashboardNotification } from "@/hooks/useDashboardSSE";

export type RouteResolver = (pathname: string) => React.ReactNode;

export interface ComingSoonConfig {
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly ctaLabel?: string;
  readonly ctaHref?: string;
}

export interface DashboardHeaderProps {
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

export interface NotificationItemProps {
  readonly notification: DashboardNotification;
  readonly onClose: () => void;
  readonly onMarkAsRead: (id: string) => void;
  readonly onDismiss: (id: string) => void;
}

export interface NotificationDropdownProps {
  readonly notifications: readonly DashboardNotification[];
  readonly unreadCount: number;
  readonly onMarkAllRead: () => void;
  readonly onMarkAsRead: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onClose: () => void;
}
