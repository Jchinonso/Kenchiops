/**
 * Incident Card Content
 *
 * Renders the card body for the Active Incidents page:
 * loading skeleton, error state, empty state, mobile cards, or desktop table.
 */

import { Fragment } from "react";
import { Table, TableHeader, TableHead, TableBody, TableCaption } from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Siren, RefreshCw } from "lucide-react";
import {
  getSeverityStyle,
  getIncidentStatusStyle,
  getSourceLabel,
  truncateText,
  titleCase,
} from "@/lib/formatters";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { MobileDataCard } from "@/components/MobileDataCard";
import { SortableTableHead } from "@/components/SortableTableHead";
import { IncidentRow, ExpandedIncidentRow } from "@/components/IncidentTableRows";
import { MobileExpandedIncident } from "./MobileExpandedIncident";
import type { IncidentCardContentProps } from "./types";

export const IncidentCardContent = ({
  isLoading,
  error,
  hasItems,
  hasActiveFilters,
  isMobile,
  sortedItems,
  duplicateIds,
  expandedId,
  sort,
  currentPage,
  totalPages,
  hasPrev,
  hasNext,
  total,
  pageSize,
  onExpand,
  onViewDetails,
  onRefetch,
  onSort,
  onPrev,
  onNext,
  onPageSizeChange,
}: IncidentCardContentProps): React.ReactNode => {
  if (isLoading) {
    return <TableSkeleton />;
  }

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={onRefetch}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (!hasItems) {
    return (
      <Empty className="py-12 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Siren className="w-6 h-6" />
          </EmptyMedia>
          <EmptyTitle>{hasActiveFilters ? "No matching incidents" : "No incidents yet"}</EmptyTitle>
          <EmptyDescription>
            {hasActiveFilters
              ? "Try adjusting your filters to find what you're looking for."
              : "When alerts arrive from PagerDuty or other monitoring tools, they will be triaged and shown here."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isMobile) {
    return (
      <>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 p-3 space-y-3">
          {sortedItems.map((incident) => {
            const isExpanded = expandedId === incident.id;
            return (
              <MobileDataCard
                key={incident.id}
                title={truncateText(incident.title, 80)}
                subtitle={incident.serviceName ?? undefined}
                timestamp={incident.receivedAt}
                badges={[
                  {
                    label: titleCase(incident.severity),
                    className: getSeverityStyle(incident.severity),
                  },
                  {
                    label: titleCase(incident.status),
                    className: getIncidentStatusStyle(incident.status),
                  },
                  {
                    label: getSourceLabel(incident.source),
                    className:
                      "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
                  },
                  ...(duplicateIds.has(incident.id)
                    ? [
                        {
                          label: "Possible dup",
                          className:
                            "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
                        },
                      ]
                    : []),
                ]}
                fields={[
                  ...(incident.environment
                    ? [{ label: "Environment", value: incident.environment }]
                    : []),
                ]}
                onClick={() => onExpand(incident.id)}
                isExpanded={isExpanded}
                expandedContent={
                  isExpanded ? (
                    <MobileExpandedIncident
                      incidentId={incident.id}
                      onViewDetails={() => onViewDetails(incident.id)}
                      onRefresh={onRefetch}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </div>
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={onPrev}
          onNext={onNext}
          totalItems={total}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
        />
      </>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableCaption className="sr-only">
            Active incidents table showing severity, title, service, and triage status
          </TableCaption>
          <TableHeader className="bg-zinc-50/80 dark:bg-zinc-800/50">
            <tr>
              <TableHead scope="col" className="w-8" />
              <SortableTableHead
                label="Severity"
                column="severity"
                currentSort={sort}
                onSort={onSort}
              />
              <TableHead scope="col">Title</TableHead>
              <TableHead scope="col">Service</TableHead>
              <TableHead scope="col">Environment</TableHead>
              <TableHead scope="col">Source</TableHead>
              <TableHead scope="col">Status</TableHead>
              <SortableTableHead
                label="Time"
                column="receivedAt"
                currentSort={sort}
                onSort={onSort}
              />
            </tr>
          </TableHeader>
          <TableBody>
            {sortedItems.map((incident) => (
              <Fragment key={incident.id}>
                <IncidentRow
                  incident={incident}
                  isExpanded={expandedId === incident.id}
                  isDuplicate={duplicateIds.has(incident.id)}
                  onClick={() => onExpand(incident.id)}
                />
                {expandedId === incident.id && (
                  <ExpandedIncidentRow
                    incidentId={incident.id}
                    onViewDetails={() => onViewDetails(incident.id)}
                    onRefresh={onRefetch}
                  />
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onPrev={onPrev}
        onNext={onNext}
        totalItems={total}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
      />
    </>
  );
};
