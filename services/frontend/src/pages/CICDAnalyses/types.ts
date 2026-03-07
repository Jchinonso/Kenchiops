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

export type CICDAnalysesProps = Record<string, never>;
