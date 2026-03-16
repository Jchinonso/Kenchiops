import type { SeverityDistributionEntry, SeverityBySourceEntry } from "@/hooks/useIncidentData";

export interface SeverityDistributionChartProps {
  readonly distribution: readonly SeverityDistributionEntry[] | null;
  readonly distributionBySource?: readonly SeverityBySourceEntry[] | null;
  readonly isLoading: boolean;
}
