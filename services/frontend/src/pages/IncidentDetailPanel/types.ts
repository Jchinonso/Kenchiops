/**
 * Shared types for the IncidentDetailPanel module.
 */

export interface IncidentDetailPanelProps {
  readonly incidentId: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRefresh: () => void;
}
