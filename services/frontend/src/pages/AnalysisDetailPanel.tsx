/**
 * Analysis Detail Panel
 *
 * Slide-over Sheet panel showing full analysis details.
 * Opened when clicking an analysis row in CICDAnalyses.
 */

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import {
  getConfidenceLabel,
  getConfidenceStyle,
  formatTimestamp,
  extractRepoFromKey,
} from "@/lib/formatters";
import { useAnalysisDetail, type AnalysisRecord } from "@/hooks/useDashboardData";

// ==================== Props ====================

interface AnalysisDetailPanelProps {
  readonly analysisId: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
}

// ==================== Sub-components ====================

interface SectionCardProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
}

const SectionCard = ({ icon, title, children }: SectionCardProps) => (
  <div className="rounded-lg border border-gray-200 bg-white">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
      {icon}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    </div>
    <div className="px-4 py-3">{children}</div>
  </div>
);

interface ConfidenceBarProps {
  readonly label: string;
  readonly value: number;
}

const ConfidenceBar = ({ label, value }: ConfidenceBarProps) => {
  const percentage = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">{label}</span>
        <Badge variant="outline" className={cn("text-xs", getConfidenceStyle(value))}>
          {getConfidenceLabel(value)} ({percentage}%)
        </Badge>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
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

const DetailSkeleton = () => (
  <div className="space-y-4 px-4 pb-4">
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-16 w-full" />
    <Skeleton className="h-32 w-full" />
  </div>
);

interface DetailContentProps {
  readonly analysis: AnalysisRecord;
}

const DetailContent = ({ analysis }: DetailContentProps) => {
  const [rawOpen, setRawOpen] = useState(false);
  const confidenceSignalEntries = analysis.confidenceSignals
    ? Object.entries(analysis.confidenceSignals)
    : [];

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      {/* Summary */}
      <SectionCard icon={<Zap className="h-4 w-4 text-indigo-500" />} title="Summary">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {analysis.summary}
        </p>
      </SectionCard>

      {/* Root Cause */}
      <SectionCard icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} title="Root Cause">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
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
              <li key={`action-${index}`} className="text-sm text-gray-700 leading-relaxed">
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
                <span className="text-xs font-medium text-gray-500 truncate">{key}</span>
                <span className="text-xs text-gray-700 truncate">{String(value)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Linked Event */}
      {analysis.eventId && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <FileText className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="text-xs text-gray-600">
            Linked to failure event:{" "}
            <span className="font-mono text-gray-800">{analysis.eventId}</span>
          </span>
        </div>
      )}

      {/* Raw Analysis JSON */}
      <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
        <div className="rounded-lg border border-gray-200 bg-white">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">
            <Code className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Raw Analysis Data</span>
            {rawOpen ? (
              <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-gray-100 px-4 py-3">
              <pre className="overflow-x-auto rounded-md bg-gray-50 p-3 text-xs font-mono text-gray-700 max-h-96 overflow-y-auto">
                {JSON.stringify(analysis.fullAnalysis, null, 2)}
              </pre>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
};

// ==================== Main Component ====================

export const AnalysisDetailPanel = ({ analysisId, open, onClose }: AnalysisDetailPanelProps) => {
  const { data: analysis, isLoading, error } = useAnalysisDetail(analysisId);

  const repo = analysis ? extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis) : null;

  const timestamp = analysis ? formatTimestamp(analysis.createdAt) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Analysis Detail</SheetTitle>
          <SheetDescription>
            {repo && timestamp ? `${repo} \u00b7 ${timestamp}` : "Loading analysis details..."}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <DetailSkeleton />
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : analysis ? (
          <DetailContent analysis={analysis} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
