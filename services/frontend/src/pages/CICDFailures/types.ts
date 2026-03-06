/**
 * Shared types for CI/CD Failures page components.
 */

import type { EventRecord, AnalysisStatusEntry } from "@/hooks/useDashboardData";

export interface FailureRowProps {
  readonly event: EventRecord;
  readonly analysisStatus?: AnalysisStatusEntry | null;
  readonly isExpanded: boolean;
  readonly onClick: () => void;
}

export interface ExpandedFailureRowProps {
  readonly event: EventRecord;
  readonly analysisStatus?: AnalysisStatusEntry | null;
}

export interface CICDFailuresProps {
  // No props currently needed — data fetching is handled by TanStack Query
}
