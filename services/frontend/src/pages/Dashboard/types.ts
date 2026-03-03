/**
 * Shared types for the Dashboard module.
 */

import type { DashboardNotification } from "@/hooks/useDashboardSSE";

export interface ComingSoonConfig {
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly ctaLabel?: string;
  readonly ctaHref?: string;
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
