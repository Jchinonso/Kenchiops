/**
 * Incident Detail Content
 *
 * Renders the full triage detail sections inside the IncidentDetailPanel sheet.
 * Separated from the panel wrapper to keep module sizes manageable.
 */

import { Badge } from "@/components/ui/badge";
import { Zap, AlertTriangle, BarChart3, ListChecks, CheckCircle2, XCircle } from "lucide-react";
import type { AlertWithTriageResult } from "@/hooks/useIncidentData";
import { cn } from "@/lib/utils";
import { isSafeUrl } from "@/lib/urlSafety";
import {
  getSeverityStyle,
  getIncidentStatusStyle,
  getSourceLabel,
  titleCase,
  formatTimestamp,
} from "@/lib/formatters";
import type {
  AISummary,
  SeverityAssessment,
  RoutingDecision,
  CorrelatedIncident,
  MatchedRunbook,
} from "./types";
import { canAcknowledge, canResolve, getConfidenceLevel } from "./helpers";

// ==================== Sub-components ====================

const SectionHeading = ({ children }: { readonly children: React.ReactNode }) => (
  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
    {children}
  </h3>
);

const InfoRow = ({ label, value }: { readonly label: string; readonly value: React.ReactNode }) => (
  <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
    <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
    <span className="text-xs text-zinc-900 dark:text-zinc-100 font-medium text-right max-w-[60%] truncate">
      {value}
    </span>
  </div>
);

// ==================== Loading Skeleton ====================

export const IncidentDetailSkeleton = () => (
  <div className="flex-1 px-4 space-y-4 animate-pulse">
    <div className="flex gap-2">
      <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-700 rounded" />
      <div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-700 rounded" />
    </div>
    <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded" />
    <div className="h-24 bg-zinc-200 dark:bg-zinc-700 rounded-lg" />
    <div className="h-4 w-1/2 bg-zinc-200 dark:bg-zinc-700 rounded" />
    <div className="h-32 bg-zinc-200 dark:bg-zinc-700 rounded-lg" />
  </div>
);

// ==================== Detail Content ====================

interface IncidentDetailContentProps {
  readonly data: AlertWithTriageResult;
  readonly onAcknowledge: () => void;
  readonly onResolve: () => void;
  readonly ackLoading: boolean;
  readonly resolveLoading: boolean;
}

export const IncidentDetailContent = ({
  data,
  onAcknowledge,
  onResolve,
  ackLoading,
  resolveLoading,
}: IncidentDetailContentProps) => {
  const { alert, triageResult } = data;

  const aiSummary = triageResult?.aiSummary as AISummary | undefined;
  const severityAssessment = triageResult?.severityAssessment as SeverityAssessment | undefined;
  const severityScore =
    (triageResult?.severityScore as number | undefined) ?? severityAssessment?.score;
  const confidence = triageResult?.confidence as number | undefined;
  const routing = triageResult?.routingDecision as RoutingDecision | undefined;
  const correlated = triageResult?.correlatedIncidents as readonly CorrelatedIncident[] | undefined;
  const runbooks = triageResult?.matchedRunbooks as readonly MatchedRunbook[] | undefined;

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5">
      {/* Header Badges + Actions */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("text-xs", getSeverityStyle(alert.severity))}>
            {titleCase(alert.severity)}
          </Badge>
          <Badge variant="outline" className={cn("text-xs", getIncidentStatusStyle(alert.status))}>
            {titleCase(alert.status)}
          </Badge>
        </div>
        {alert.description && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{alert.description}</p>
        )}
        <div className="flex items-center gap-2">
          {canAcknowledge(alert.status) && (
            <button
              type="button"
              disabled={ackLoading}
              onClick={onAcknowledge}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {ackLoading ? "Acknowledging..." : "Acknowledge"}
            </button>
          )}
          {canResolve(alert.status) && (
            <button
              type="button"
              disabled={resolveLoading}
              onClick={onResolve}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md hover:bg-green-100 dark:hover:bg-green-900 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              {resolveLoading ? "Resolving..." : "Resolve"}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {aiSummary && (aiSummary.headline || aiSummary.impactAssessment) && (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Summary</h3>
          </div>
          {aiSummary.headline && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{aiSummary.headline}</p>
          )}
          {aiSummary.impactAssessment && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{aiSummary.impactAssessment}</p>
          )}
        </div>
      )}

      {/* Root Cause */}
      {aiSummary?.rootCauseSummary && (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Root Cause</h3>
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{aiSummary.rootCauseSummary}</p>
        </div>
      )}

      {/* Recommended Actions */}
      {aiSummary?.suggestedActions && aiSummary.suggestedActions.length > 0 && (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Recommended Actions
            </h3>
          </div>
          <ol className="space-y-2">
            {aiSummary.suggestedActions.map((item, idx) => (
              <li key={idx} className="text-sm text-zinc-700 dark:text-zinc-300">
                {idx + 1}. {item.action}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Alert Info */}
      <div>
        <SectionHeading>Alert Info</SectionHeading>
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
          <InfoRow label="Source" value={getSourceLabel(alert.source)} />
          <InfoRow label="Service" value={alert.serviceName ?? "--"} />
          <InfoRow label="Environment" value={alert.environment ?? "--"} />
          {alert.fingerprint && <InfoRow label="Fingerprint" value={alert.fingerprint} />}
          <InfoRow label="Received" value={formatTimestamp(alert.receivedAt)} />
          <InfoRow label="Alert ID" value={alert.sourceAlertId} />
        </div>
      </div>

      {/* Severity Assessment */}
      {(severityScore !== undefined || severityAssessment) && (
        <div>
          <SectionHeading>Severity Assessment</SectionHeading>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-2">
            {severityScore !== undefined && (
              <InfoRow
                label="Score"
                value={
                  <>
                    <span className="font-semibold">{severityScore}</span>/100
                  </>
                }
              />
            )}
            {severityAssessment?.label && (
              <InfoRow label="Label" value={titleCase(severityAssessment.label)} />
            )}
            {severityAssessment?.factors && severityAssessment.factors.length > 0 && (
              <div className="pt-1">
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Factors
                </p>
                {severityAssessment.factors.map((factor, idx) => (
                  <InfoRow key={idx} label={factor.name} value={factor.value} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confidence */}
      {confidence !== undefined &&
        (() => {
          const pct = Math.round(confidence * 100);
          const level = getConfidenceLevel(confidence);
          return (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Confidence
                </h3>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Diagnosis</span>
                <span
                  className={cn(
                    "text-xs font-medium px-2.5 py-0.5 rounded-full border",
                    level.badgeClass
                  )}
                >
                  {level.label} ({pct}%)
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", level.barColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })()}

      {/* Routing Decision */}
      {routing && (
        <div>
          <SectionHeading>Routing Decision</SectionHeading>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-2">
            {routing.suppressed && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Suppressed{routing.suppressionReason ? `: ${routing.suppressionReason}` : ""}
              </p>
            )}
            {routing.matchedRules && routing.matchedRules.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Matched Rules
                </p>
                {routing.matchedRules.map((rule, idx) => (
                  <div key={idx} className="flex justify-between py-1 text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300">{rule.ruleName}</span>
                    {rule.action && (
                      <span className="text-zinc-500 dark:text-zinc-400">{rule.action}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {routing.targets && routing.targets.length > 0 && (
              <InfoRow label="Dispatch Targets" value={routing.targets.join(", ")} />
            )}
          </div>
        </div>
      )}

      {/* Correlated Incidents */}
      {correlated && correlated.length > 0 && (
        <div>
          <SectionHeading>Correlated Incidents</SectionHeading>
          <div className="space-y-1.5">
            {correlated.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-1.5 px-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-md"
              >
                <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-[70%]">
                  {item.title}
                </span>
                {item.similarity !== undefined && (
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0 ml-2">
                    {Math.round(item.similarity * 100)}% match
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matched Runbooks */}
      {runbooks && runbooks.length > 0 && (
        <div>
          <SectionHeading>Matched Runbooks</SectionHeading>
          <div className="space-y-1.5">
            {runbooks.map((book, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1.5 px-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-md"
              >
                {book.url && isSafeUrl(book.url) ? (
                  <a
                    href={book.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[70%]"
                  >
                    {book.name}
                  </a>
                ) : (
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-[70%]">
                    {book.name}
                  </span>
                )}
                {book.relevance !== undefined && (
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0 ml-2">
                    {Math.round(book.relevance * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No triage data */}
      {!triageResult && (
        <div className="text-center py-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No triage data available for this incident.
          </p>
        </div>
      )}
    </div>
  );
};
