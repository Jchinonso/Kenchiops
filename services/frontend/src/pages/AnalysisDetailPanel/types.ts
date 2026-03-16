/**
 * Shared types for the AnalysisDetailPanel module.
 */

export interface AnalysisDetailPanelProps {
  readonly analysisId: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
}
