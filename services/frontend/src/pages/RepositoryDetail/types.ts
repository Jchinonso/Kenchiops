/**
 * Shared types for the RepositoryDetail module.
 */

import type { AnalysisRecord, EventRecord } from "@/hooks/useDashboardData";

export interface RepositoryDetailProps {
  readonly repoFullName: string;
}

export interface AnalysisItemProps {
  readonly analysis: AnalysisRecord;
}

export interface FailureItemProps {
  readonly event: EventRecord;
}
