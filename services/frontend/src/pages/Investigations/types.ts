/**
 * Shared types for the Investigations module.
 */

import type { InvestigationRecord } from "@/hooks/useInvestigationData";

export interface InvestigationTableRowProps {
  readonly investigation: InvestigationRecord;
  readonly onClick: () => void;
}
