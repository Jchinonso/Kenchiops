import type {
  InvestigationRecord,
  InvestigationDiagnosis,
  InvestigationCorrelation,
  SuggestedInvestigationAction,
  TimelineEvent,
} from "@/hooks/useInvestigationData";

export interface StatBadgeProps {
  readonly label: string;
  readonly value: string;
  readonly className?: string;
}

export interface SuggestedActionsSectionProps {
  readonly actions: readonly SuggestedInvestigationAction[];
}

export interface DiagnosisSectionProps {
  readonly diagnosis: InvestigationDiagnosis;
}

export interface TimelineSectionProps {
  readonly events: readonly TimelineEvent[];
}

export interface CorrelationSectionProps {
  readonly correlation: InvestigationCorrelation;
}

export interface ActiveStatusProps {
  readonly status: string;
}

export interface FailedStatusProps {
  readonly investigation: InvestigationRecord;
  readonly onRetry: () => void;
}
