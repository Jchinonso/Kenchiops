/**
 * Incident Table Row Components
 *
 * Sub-components for the Active Incidents table:
 * - SortableTableHead: clickable column header with sort icons
 * - IncidentRow: table row for an individual incident
 * - ExpandedIncidentRow: lazy-loaded triage details when a row is expanded
 */

import { TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  Bot,
  ClipboardList,
  Loader2,
} from "lucide-react";
import {
  useIncidentDetail,
  useAcknowledgeIncident,
  useResolveIncident,
  type IncidentAlertRecord,
} from "@/hooks/useIncidentData";
import { cn } from "@/lib/utils";
import {
  getSeverityStyle,
  getIncidentStatusStyle,
  getSourceLabel,
  truncateText,
  titleCase,
} from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";

// ==================== Types ====================

export interface SortConfig {
  readonly column: string;
  readonly direction: "asc" | "desc" | null;
}

/** Statuses that allow acknowledging */
const canAcknowledge = (status: string): boolean =>
  status === "received" || status === "triaged" || status === "escalated";

/** Statuses that allow resolving */
const canResolve = (status: string): boolean =>
  status !== "resolved" && status !== "closed" && status !== "deduped";

// ==================== SortableTableHead ====================

interface SortableTableHeadProps {
  readonly label: string;
  readonly column: string;
  readonly currentSort: SortConfig;
  readonly onSort: (column: string) => void;
}

export const SortableTableHead = ({
  label,
  column,
  currentSort,
  onSort,
}: SortableTableHeadProps) => {
  const { column: sortColumn, direction: sortDirection } = currentSort;
  const isActive = sortColumn === column && sortDirection !== null;
  const Icon =
    isActive && sortDirection === "asc"
      ? ArrowUp
      : isActive && sortDirection === "desc"
        ? ArrowDown
        : ArrowUpDown;

  const ariaSortValue: "ascending" | "descending" | "none" =
    isActive && sortDirection === "asc"
      ? "ascending"
      : isActive && sortDirection === "desc"
        ? "descending"
        : "none";

  return (
    <TableHead
      scope="col"
      aria-sort={ariaSortValue}
      className="cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-indigo-500" : "text-gray-400")} />
      </div>
    </TableHead>
  );
};

// ==================== IncidentRow ====================

interface IncidentRowProps {
  readonly incident: IncidentAlertRecord;
  readonly isExpanded: boolean;
  readonly isDuplicate?: boolean;
  readonly onClick: () => void;
}

export const IncidentRow = ({ incident, isExpanded, isDuplicate, onClick }: IncidentRowProps) => (
  <TableRow
    onClick={onClick}
    onKeyDown={(keyEvent) => {
      const { key } = keyEvent;
      if (key === "Enter" || key === " ") {
        keyEvent.preventDefault();
        onClick();
      }
    }}
    tabIndex={0}
    aria-expanded={isExpanded}
    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
  >
    <TableCell className="w-8">
      <ChevronRight
        aria-hidden="true"
        className={cn("w-4 h-4 text-gray-400 transition-transform", isExpanded && "rotate-90")}
      />
    </TableCell>
    <TableCell>
      <Badge variant="outline" className={cn("text-xs", getSeverityStyle(incident.severity))}>
        {titleCase(incident.severity)}
      </Badge>
    </TableCell>
    <TableCell className="max-w-xs">
      <div className="flex items-center gap-1.5">
        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
          {truncateText(incident.title, 80)}
        </p>
        {isDuplicate && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 shrink-0 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20"
          >
            Possible dup
          </Badge>
        )}
      </div>
      {incident.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {truncateText(incident.description, 60)}
        </p>
      )}
    </TableCell>
    <TableCell className="text-sm text-gray-700 dark:text-gray-300">
      {incident.serviceName ?? "--"}
    </TableCell>
    <TableCell className="text-sm text-gray-700 dark:text-gray-300">
      {incident.environment ?? "--"}
    </TableCell>
    <TableCell className="text-xs text-gray-600 dark:text-gray-400">
      {getSourceLabel(incident.source)}
    </TableCell>
    <TableCell>
      <Badge variant="outline" className={cn("text-xs", getIncidentStatusStyle(incident.status))}>
        {titleCase(incident.status)}
      </Badge>
    </TableCell>
    <TableCell className="text-gray-500 dark:text-gray-400 text-xs">
      <TimeDisplay dateTime={incident.receivedAt} />
    </TableCell>
  </TableRow>
);

// ==================== ExpandedIncidentRow ====================

interface ExpandedIncidentRowProps {
  readonly incidentId: string;
  readonly onViewDetails: () => void;
  readonly onRefresh: () => void;
}

export const ExpandedIncidentRow = ({
  incidentId,
  onViewDetails,
  onRefresh,
}: ExpandedIncidentRowProps) => {
  const { data, isLoading, error } = useIncidentDetail(incidentId);
  const { acknowledge, isLoading: ackLoading } = useAcknowledgeIncident();
  const { resolve, isLoading: resolveLoading } = useResolveIncident();

  const triageResult = data?.triageResult;
  const alert = data?.alert;
  const aiSummary = triageResult?.aiSummary as
    | {
        readonly headline?: string;
        readonly rootCauseSummary?: string;
      }
    | undefined;
  const summarySource = triageResult?.summarySource as string | undefined;
  const severityScore = triageResult?.severityScore as number | undefined;
  const confidence = triageResult?.confidence as number | undefined;
  const completeness = triageResult?.completeness as number | undefined;
  const matchedRules = (
    triageResult?.routingDecision as
      | { readonly matchedRules?: ReadonlyArray<{ readonly ruleName: string }> }
      | undefined
  )?.matchedRules;

  const handleAcknowledge = async (event: React.MouseEvent) => {
    event.stopPropagation();
    await acknowledge(incidentId);
    onRefresh();
  };

  const handleResolve = async (event: React.MouseEvent) => {
    event.stopPropagation();
    await resolve(incidentId);
    onRefresh();
  };

  return (
    <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-800">
      <TableCell colSpan={8} className="bg-gray-50 dark:bg-gray-800/50 border-b p-0 max-w-0">
        <div className="p-4 space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading triage details...
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to load details: {error}
            </p>
          )}

          {triageResult && (
            <>
              {/* Summary */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  {summarySource === "ai" ? (
                    <Bot className="w-3.5 h-3.5 text-indigo-500" />
                  ) : (
                    <ClipboardList className="w-3.5 h-3.5 text-gray-500" />
                  )}
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {summarySource === "ai" ? "AI Summary" : "Template Summary"}
                  </h4>
                </div>
                {aiSummary?.headline && (
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {aiSummary.headline}
                  </p>
                )}
                {aiSummary?.rootCauseSummary && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    {aiSummary.rootCauseSummary}
                  </p>
                )}
              </div>

              {/* Scores */}
              <div className="flex flex-wrap gap-3 text-xs">
                {severityScore !== undefined && (
                  <span className="text-gray-600 dark:text-gray-400">
                    Severity Score:{" "}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {severityScore}
                    </span>
                    /100
                  </span>
                )}
                {confidence !== undefined && (
                  <span className="text-gray-600 dark:text-gray-400">
                    Confidence:{" "}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {Math.round(confidence * 100)}%
                    </span>
                  </span>
                )}
                {completeness !== undefined && (
                  <span className="text-gray-600 dark:text-gray-400">
                    Completeness:{" "}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {Math.round(completeness * 100)}%
                    </span>
                  </span>
                )}
              </div>

              {/* Routing */}
              {matchedRules && matchedRules.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Routed by: {matchedRules.map((rule) => rule.ruleName).join(", ")}
                </p>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            {alert && canAcknowledge(alert.status) && (
              <button
                type="button"
                disabled={ackLoading}
                onClick={handleAcknowledge}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {ackLoading ? "Acknowledging..." : "Acknowledge"}
              </button>
            )}
            {alert && canResolve(alert.status) && (
              <button
                type="button"
                disabled={resolveLoading}
                onClick={handleResolve}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md hover:bg-green-100 dark:hover:bg-green-900 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                {resolveLoading ? "Resolving..." : "Resolve"}
              </button>
            )}
            <button
              type="button"
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails();
              }}
            >
              View Full Details →
            </button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};
