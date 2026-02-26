/**
 * Shared constants for the Settings page: animation variants, badge styles, nav items.
 */

import { User, CreditCard, Sun, Shield, AlertTriangle } from "lucide-react";

// ==================== Navigation ====================

export const NAV_ITEMS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: CreditCard },
  { id: "preferences", label: "Preferences", icon: Sun },
  { id: "security", label: "Security", icon: Shield },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
] as const;

export const SECTION_IDS = NAV_ITEMS.map((item) => item.id);

// ==================== Badge Styles ====================

export const PLAN_BADGE_STYLES: Readonly<Record<string, string>> = {
  free: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  pro: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  team: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  enterprise:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
};

export const getPlanBadgeStyle = (planId: string): string =>
  PLAN_BADGE_STYLES[planId] ?? PLAN_BADGE_STYLES.free;

export const BILLING_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: "Your subscription is active",
  past_due: "Payment is past due — please update your payment method",
  trialing: "You are on a free trial",
};

export const BILLING_BADGE_STYLES: Readonly<Record<string, string>> = {
  active:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  past_due:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
};

export const DEFAULT_BADGE_STYLE =
  "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700";

// ==================== Delete Confirmation ====================

export const DELETE_CONFIRMATION = "DELETE";
