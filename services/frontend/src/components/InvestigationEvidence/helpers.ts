import type { InvestigationEvidenceItem } from "@/hooks/useInvestigationData";
import { getEvidenceSourceLabel } from "@/lib/formatters";
import type { EvidenceGroup } from "./types";

export const groupEvidenceBySources = (
  evidence: readonly InvestigationEvidenceItem[]
): readonly EvidenceGroup[] => {
  const grouped = evidence.reduce<Readonly<Record<string, readonly InvestigationEvidenceItem[]>>>(
    (acc, item) => ({
      ...acc,
      [item.source]: [...(acc[item.source] ?? []), item],
    }),
    {}
  );

  return Object.entries(grouped).map(
    ([source, items]): EvidenceGroup => ({
      source,
      label: getEvidenceSourceLabel(source),
      items,
    })
  );
};
