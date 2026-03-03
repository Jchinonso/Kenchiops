/**
 * Shared types for DashboardOverview sub-components.
 */

import type { AnalysisRecord, EventRecord } from "@/hooks/useDashboardData";
import type { ActiveCountBySource, IncidentAlertRecord } from "@/hooks/useIncidentData";

export interface OnboardingStep {
  readonly title: string;
  readonly description: string;
  readonly completedDescription: string;
  readonly ctaLabel: string;
  readonly href: string;
  readonly external?: boolean;
  readonly icon: React.ReactNode;
  readonly completed: boolean;
}

export interface QuickStat {
  readonly title: string;
  readonly value: string;
  readonly subtitle: string;
  readonly href: string;
  readonly icon: React.ReactNode;
  readonly colorClass: string;
  readonly sourceBreakdown?: readonly ActiveCountBySource[];
}

export interface StatCardsProps {
  readonly quickStats: readonly QuickStat[];
  readonly statsLoading: boolean;
  readonly statsError: string | null;
  readonly isNewUser: boolean;
  readonly refetchStats: () => void;
}

export interface CompactProgressProps {
  readonly steps: readonly OnboardingStep[];
  readonly completedCount: number;
  readonly onDismiss: () => void;
}

export interface FullChecklistProps {
  readonly steps: readonly OnboardingStep[];
  readonly allStepsComplete: boolean;
  readonly onDismiss: () => void;
}

export interface OnboardingChecklistProps {
  readonly showOnboarding: boolean;
  readonly dismissOnboarding: () => void;
  readonly steps: readonly OnboardingStep[];
  readonly completedCount: number;
  readonly allStepsComplete: boolean;
  readonly isNewUser: boolean;
}

export interface RecentFailuresProps {
  readonly items: readonly EventRecord[];
}

export interface RecentAnalysesProps {
  readonly items: readonly AnalysisRecord[];
}

export interface RecentIncidentsProps {
  readonly items: readonly IncidentAlertRecord[];
}

export interface ActivityFeedProps {
  readonly failureItems: readonly EventRecord[];
  readonly analysisItems: readonly AnalysisRecord[];
  readonly incidentItems: readonly IncidentAlertRecord[];
  readonly activityLoading: boolean;
  readonly failuresError: string | null;
  readonly analysesError: string | null;
  readonly isNewUser: boolean;
  readonly refetchFailures: () => void;
  readonly refetchAnalyses: () => void;
  readonly activityGridCols: string;
}

export interface DashboardOverviewProps {
  readonly firstName: string;
  readonly showOnboarding: boolean;
  readonly dismissOnboarding: () => void;
  readonly refreshKey?: number;
}
