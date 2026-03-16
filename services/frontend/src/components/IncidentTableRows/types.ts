import type { IncidentAlertRecord } from "@/hooks/useIncidentData";

export interface IncidentRowProps {
  readonly incident: IncidentAlertRecord;
  readonly isExpanded: boolean;
  readonly isDuplicate?: boolean;
  readonly onClick: () => void;
}

export interface ExpandedIncidentRowProps {
  readonly incidentId: string;
  readonly onViewDetails: () => void;
  readonly onRefresh: () => void;
}
