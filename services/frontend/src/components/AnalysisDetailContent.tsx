/**
 * Analysis Detail Content
 *
 * Shared display components for rendering analysis details.
 * Used by both the slide-over AnalysisDetailPanel and the
 * full-page AnalysisDetail route.
 */

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getConfidenceLabel, getConfidenceStyle, flattenSignalEntries } from "@/lib/formatters";
import type { AnalysisRecord } from "@/hooks/useDashboardData";

// ==================== SectionCard ====================

interface SectionCardProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
}

export const SectionCard = ({ icon, title, children }: SectionCardProps) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      {icon}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
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
        <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
        <Badge variant="outline" className={cn("text-xs", getConfidenceStyle(value))}>
          {getConfidenceLabel(value)} ({percentage}%)
        </Badge>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
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

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      {/* Summary */}
      <SectionCard icon={<Zap className="h-4 w-4 text-indigo-500" />} title="Summary">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
          {analysis.summary}
        </p>
      </SectionCard>

      {/* Root Cause */}
      <SectionCard icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} title="Root Cause">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
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

      {/* Recommended Actions */}
      {analysis.recommendedActions && analysis.recommendedActions.length > 0 && (
        <SectionCard
          icon={<ListChecks className="h-4 w-4 text-green-500" />}
          title="Recommended Actions"
        >
          <ol className="list-decimal list-inside space-y-2">
            {analysis.recommendedActions.map((action, index) => (
              <li
                key={`action-${index}`}
                className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
              >
                {action}
              </li>
            ))}
          </ol>
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
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                  {key}
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300 font-mono truncate">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Linked Event */}
      {analysis.eventId && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
          <FileText className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Linked to failure event:{" "}
            {showLinkedEventLink ? (
              <Link
                to="/dashboard/cicd/failures"
                className="font-mono text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline decoration-dotted underline-offset-2 transition-colors"
              >
                {analysis.eventId}
              </Link>
            ) : (
              <span className="font-mono text-gray-800 dark:text-gray-200">{analysis.eventId}</span>
            )}
          </span>
        </div>
      )}

      {/* Raw Analysis JSON */}
      <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Code className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Raw Analysis Data
            </span>
            {rawOpen ? (
              <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
              <pre className="overflow-x-auto rounded-md bg-gray-50 dark:bg-gray-800 p-3 text-xs font-mono text-gray-700 dark:text-gray-300 max-h-96 overflow-y-auto">
                {JSON.stringify(analysis.fullAnalysis, null, 2)}
              </pre>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
};
