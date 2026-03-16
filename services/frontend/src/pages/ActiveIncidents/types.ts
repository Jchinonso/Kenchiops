/**
 * Shared types for the ActiveIncidents module.
 */

import type { SortConfig } from "@/components/SortableTableHead";
import type { IncidentAlertRecord } from "@/hooks/useIncidentData";

export interface MobileExpandedIncidentProps {
  readonly incidentId: string;
  readonly onViewDetails: () => void;
  readonly onRefresh: () => void;
}

export interface IncidentCardContentProps {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly hasItems: boolean;
  readonly hasActiveFilters: boolean;
  readonly isMobile: boolean;
  readonly sortedItems: readonly IncidentAlertRecord[];
  readonly duplicateIds: ReadonlySet<string>;
  readonly expandedId: string | null;
  readonly sort: SortConfig;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
  readonly total: number;
  readonly pageSize: number;
  readonly onExpand: (id: string) => void;
  readonly onViewDetails: (id: string) => void;
  readonly onRefetch: () => void;
  readonly onSort: (column: string) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onPageSizeChange: (size: number) => void;
}
