import { Loader2, Bot, ClipboardList, CheckCircle2, XCircle } from "lucide-react";
import {
  useIncidentDetail,
  useAcknowledgeIncident,
  useResolveIncident,
} from "@/hooks/useIncidentData";
import { canAcknowledge, canResolve } from "@/components/IncidentTableRows";

interface MobileExpandedIncidentProps {
  readonly incidentId: string;
  readonly onViewDetails: () => void;
  readonly onRefresh: () => void;
}

/**
 * Mobile-compatible version of ExpandedIncidentRow.
 * Renders triage details without table wrapper elements.
 */
export const MobileExpandedIncident = ({
  incidentId,
  onViewDetails,
  onRefresh,
}: MobileExpandedIncidentProps) => {
  const { data, isLoading, error } = useIncidentDetail(incidentId);
  const { acknowledge, isLoading: ackLoading } = useAcknowledgeIncident();
  const { resolve, isLoading: resolveLoading } = useResolveIncident();

  const triageResult = data?.triageResult;
  const alert = data?.alert;
  const aiSummary = triageResult?.aiSummary as
    | { readonly headline?: string; readonly rootCauseSummary?: string }
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

  const handleAcknowledge = async () => {
    await acknowledge(incidentId);
    onRefresh();
  };

  const handleResolve = async () => {
    await resolve(incidentId);
    onRefresh();
  };

  return (
    <div className="space-y-3">
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading triage details...
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load details: {error}</p>
      )}

      {triageResult && (
        <>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              {summarySource === "ai" ? (
                <Bot className="w-3.5 h-3.5 text-indigo-500" />
              ) : (
                <ClipboardList className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {summarySource === "ai" ? "AI Summary" : "Template Summary"}
              </h4>
            </div>
            {aiSummary?.headline && (
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {aiSummary.headline}
              </p>
            )}
            {aiSummary?.rootCauseSummary && (
              <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1">
                {aiSummary.rootCauseSummary}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            {severityScore !== undefined && (
              <span className="text-zinc-600 dark:text-zinc-400">
                Severity Score:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {severityScore}
                </span>
                /100
              </span>
            )}
            {confidence !== undefined && (
              <span className="text-zinc-600 dark:text-zinc-400">
                Confidence:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {Math.round(confidence * 100)}%
                </span>
              </span>
            )}
            {completeness !== undefined && (
              <span className="text-zinc-600 dark:text-zinc-400">
                Completeness:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {Math.round(completeness * 100)}%
                </span>
              </span>
            )}
          </div>

          {matchedRules && matchedRules.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Routed by: {matchedRules.map((rule) => rule.ruleName).join(", ")}
            </p>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {alert && canAcknowledge(alert.status) && (
          <button
            type="button"
            disabled={ackLoading}
            onClick={handleAcknowledge}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors disabled:opacity-50"
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
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md hover:bg-green-100 dark:hover:bg-green-900 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            {resolveLoading ? "Resolving..." : "Resolve"}
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center px-3 py-2 min-h-[44px] text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
          onClick={onViewDetails}
        >
          View Full Details →
        </button>
      </div>
    </div>
  );
};
