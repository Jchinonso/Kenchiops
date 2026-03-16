import type { CorrelationSummary } from "@/hooks/useDashboardData";

export interface CorrelatedPipelineItemsProps {
  /** The commit SHA to look up correlations for */
  readonly commitSha: string | null;
  /** Which pipeline the parent belongs to -- hides items from the same pipeline */
  readonly sourcePipeline: "cicd" | "incident";
}

export interface CorrelationItemProps {
  readonly item: CorrelationSummary;
  readonly to: string;
  readonly icon: React.ReactNode;
}
