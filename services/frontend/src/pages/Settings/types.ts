/**
 * Shared types for the Settings module.
 */

import type { UsageLimitDTO } from "@/hooks/useSubscription";
import type { DeletionImpact } from "@/hooks/useDeletionImpact";

export type ThemeMode = "light" | "dark" | "system";

export interface UsageBarProps {
  readonly label: string;
  readonly usage: UsageLimitDTO;
}

export interface BillingCardProps {
  readonly billingStatus: {
    readonly status: string;
    readonly currentPeriodEnd: string | null;
  };
  readonly isLoading: boolean;
  readonly portalLoading: boolean;
  readonly onOpenPortal: () => Promise<void>;
}

export interface SettingsNavProps {
  readonly activeSection: string;
  readonly isPersonal?: boolean;
}

export interface UsageData {
  readonly usage: {
    readonly repositories: UsageLimitDTO;
    readonly analysesThisMonth: UsageLimitDTO;
    readonly integrations: UsageLimitDTO;
    readonly teamMembers: UsageLimitDTO;
  };
}

export interface SubscriptionCardProps {
  readonly planId: string;
  readonly planDisplayName: string;
  readonly usageData: UsageData | null;
  readonly isLoading: boolean;
}

export interface UserInfo {
  readonly displayName?: string;
  readonly email?: string | null;
  readonly avatarUrl?: string | null;
  readonly role?: string;
  readonly createdAt?: string;
  readonly providers?: ReadonlyArray<{
    readonly provider: string;
    readonly username?: string | null;
  }>;
}

export interface TenantInfo {
  readonly id: string;
  readonly orgName: string;
  readonly status: string;
}

export interface ProfileHeroProps {
  readonly user: UserInfo | null;
  readonly tenant: TenantInfo | null;
  readonly tenantLoading: boolean;
}

export interface NotificationSettingsProps {
  readonly toastEnabled: boolean;
  readonly browserEnabled: boolean;
  readonly browserPermissionDenied: boolean;
  readonly onToastChange: (enabled: boolean) => void;
  readonly onBrowserChange: (enabled: boolean) => void;
}

export interface DangerZoneProps {
  readonly impact: DeletionImpact | null;
  readonly impactLoading: boolean;
  readonly impactError: string | null;
  readonly fetchImpact: () => Promise<void>;
  readonly onDeleteAccount: () => Promise<void>;
  readonly deleteLoading: boolean;
}

export interface ThemeSelectorProps {
  readonly preference: ThemeMode;
  readonly onSetTheme: (theme: ThemeMode) => void;
}

export interface ThemePreviewProps {
  readonly mode: ThemeMode;
  readonly active: boolean;
  readonly onClick: () => void;
}

export interface ThemePreviewStyles {
  readonly container: string;
  readonly sidebar: string;
  readonly content: string;
}
