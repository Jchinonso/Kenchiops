import type { InvestigationEvidenceItem } from "@/hooks/useInvestigationData";

export interface EvidenceGroup {
  readonly source: string;
  readonly label: string;
  readonly items: readonly InvestigationEvidenceItem[];
}
