import type { AnalysisRecord } from "@/hooks/useDashboardData";

export interface AnalysisRowProps {
  readonly analysis: AnalysisRecord;
  readonly isExpanded: boolean;
  readonly onClick: () => void;
}

export interface ExpandedAnalysisRowProps {
  readonly analysis: AnalysisRecord;
  readonly onViewDetails: () => void;
}

export interface CICDAnalysesProps {
  // No props currently needed — data fetching is handled by TanStack Query
}
