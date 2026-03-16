/**
 * Analysis Detail Content
 *
 * Shared display components for rendering analysis details.
 * Used by both the slide-over AnalysisDetailPanel and the
 * full-page AnalysisDetail route.
 */

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Zap,
  FileText,
  ListChecks,
  BarChart3,
  Code,
  Package,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getConfidenceLabel, getConfidenceStyle, flattenSignalEntries } from "@/lib/formatters";
import type { AnalysisRecord } from "@/hooks/useDashboardData";
import { FeedbackSection } from "@/components/FeedbackSection";
import { priorityStyles, depChangeLabels, depChangeBadgeStyles } from "./constants";
import { extractFullAnalysis } from "./helpers";

// ==================== SectionCard ====================

interface SectionCardProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
}

export const SectionCard = ({ icon, title, children }: SectionCardProps) => (
  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
      {icon}
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
    </div>
    <div className="px-4 py-3">{children}</div>
  </div>
);

// ==================== ConfidenceBar ====================

interface ConfidenceBarProps {
  readonly label: string;
  readonly value: number;
}

export const ConfidenceBar = ({ label, value }: ConfidenceBarProps) => {
  const percentage = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
        <Badge variant="outline" className={cn("text-xs", getConfidenceStyle(value))}>
          {getConfidenceLabel(value)} ({percentage}%)
        </Badge>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn(
            "h-2 rounded-full transition-all",
            value >= 0.8 ? "bg-green-500" : value >= 0.5 ? "bg-amber-500" : "bg-red-500"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// ==================== DetailSkeleton ====================

export const DetailSkeleton = () => (
  <div className="space-y-4 px-4 pb-4">
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-16 w-full" />
    <Skeleton className="h-32 w-full" />
  </div>
);

// ==================== DetailContent ====================

interface DetailContentProps {
  readonly analysis: AnalysisRecord;
  readonly showLinkedEventLink?: boolean;
}

export const DetailContent = ({ analysis, showLinkedEventLink = false }: DetailContentProps) => {
  const [rawOpen, setRawOpen] = useState(false);
  const confidenceSignalEntries = analysis.confidenceSignals
    ? flattenSignalEntries(analysis.confidenceSignals)
    : [];

  const { depChanges, buildChanges, richActions } = useMemo(
    () => extractFullAnalysis(analysis.fullAnalysis),
    [analysis.fullAnalysis]
  );

  // Use rich actions from fullAnalysis if available, fall back to flat string array
  const hasRichActions = richActions.length > 0 && typeof richActions[0]?.description === "string";

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      {/* Summary */}
      <SectionCard icon={<Zap className="h-4 w-4 text-indigo-500" />} title="Summary">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {analysis.summary}
        </p>
      </SectionCard>

      {/* Root Cause */}
      <SectionCard icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} title="Root Cause">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {analysis.identifiedCause ?? "No root cause identified"}
        </p>
      </SectionCard>

      {/* Confidence */}
      <SectionCard icon={<BarChart3 className="h-4 w-4 text-blue-500" />} title="Confidence">
        <div className="space-y-3">
          <ConfidenceBar label="Diagnosis" value={analysis.diagnosisConfidence} />
          {analysis.actionConfidence !== null && (
            <ConfidenceBar label="Action" value={analysis.actionConfidence} />
          )}
        </div>
      </SectionCard>

      {/* Recommended Actions (enriched with priority from fullAnalysis) */}
      {hasRichActions ? (
        <SectionCard
          icon={<ListChecks className="h-4 w-4 text-green-500" />}
          title="Recommended Actions"
        >
          <ol className="list-decimal list-inside space-y-2">
            {richActions.map((action) => {
              const priorityKey = String(action.priority ?? "medium").toLowerCase();
              const style = priorityStyles[priorityKey] ?? "text-zinc-600 dark:text-zinc-400";
              const label = `${priorityKey.charAt(0).toUpperCase()}${priorityKey.slice(1)}`;
              return (
                <li
                  key={action.description}
                  className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed"
                >
                  <Badge variant="outline" className={cn("text-[10px] mr-2 py-0", style)}>
                    {label}
                  </Badge>
                  {action.description}
                </li>
              );
            })}
          </ol>
        </SectionCard>
      ) : (
        analysis.recommendedActions &&
        analysis.recommendedActions.length > 0 && (
          <SectionCard
            icon={<ListChecks className="h-4 w-4 text-green-500" />}
            title="Recommended Actions"
          >
            <ol className="list-decimal list-inside space-y-2">
              {analysis.recommendedActions.map((action) => (
                <li
                  key={action}
                  className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed"
                >
                  {action}
                </li>
              ))}
            </ol>
          </SectionCard>
        )
      )}

      {/* Dependency Changes */}
      {depChanges.length > 0 && (
        <SectionCard
          icon={<Package className="h-4 w-4 text-cyan-500" />}
          title={`Dependency Changes (${depChanges.length})`}
        >
          <div className="space-y-2">
            {depChanges.map((dep) => (
              <div
                key={`${dep.name}-${dep.type}`}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] py-0",
                      depChangeBadgeStyles[dep.type] ?? "bg-zinc-100 text-zinc-700"
                    )}
                  >
                    {depChangeLabels[dep.type] ?? dep.type}
                  </Badge>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{dep.name}</span>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {dep.oldVersion && dep.newVersion
                    ? `${dep.oldVersion} → ${dep.newVersion}`
                    : (dep.newVersion ?? dep.oldVersion ?? "")}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Build Config Changes */}
      {buildChanges.length > 0 && (
        <SectionCard
          icon={<Wrench className="h-4 w-4 text-orange-500" />}
          title={`Build Config Changes (${buildChanges.length})`}
        >
          <ul className="space-y-2">
            {buildChanges.map((change) => (
              <li key={change.file} className="text-sm">
                <span className="font-mono text-zinc-800 dark:text-zinc-200">{change.file}</span>
                {change.changeType && (
                  <Badge variant="outline" className="text-[10px] ml-2 py-0">
                    {change.changeType}
                  </Badge>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{change.summary}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Confidence Signals */}
      {confidenceSignalEntries.length > 0 && (
        <SectionCard
          icon={<BarChart3 className="h-4 w-4 text-purple-500" />}
          title="Confidence Signals"
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {confidenceSignalEntries.map(([key, value]) => (
              <div key={key} className="contents">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">
                  {key}
                </span>
                <span className="text-xs text-zinc-700 dark:text-zinc-300 font-mono truncate">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Linked Event */}
      {analysis.eventId && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3">
          <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Linked to failure event:{" "}
            {showLinkedEventLink ? (
              <Link
                to="/dashboard/cicd/analyses"
                className="font-mono text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline decoration-dotted underline-offset-2 transition-colors"
              >
                {analysis.eventId}
              </Link>
            ) : (
              <span className="font-mono text-zinc-800 dark:text-zinc-200">{analysis.eventId}</span>
            )}
          </span>
        </div>
      )}

      {/* Feedback */}
      <FeedbackSection analysisId={analysis.id} />

      {/* Raw Analysis JSON */}
      <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            <Code className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Raw Analysis Data
            </span>
            {rawOpen ? (
              <ChevronDown className="ml-auto h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronRight className="ml-auto h-4 w-4 text-zinc-400" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
              <pre className="overflow-x-auto rounded-md bg-zinc-50 dark:bg-zinc-800 p-3 text-xs font-mono text-zinc-700 dark:text-zinc-300 max-h-96 overflow-y-auto">
                {JSON.stringify(analysis.fullAnalysis, null, 2)}
              </pre>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
};
