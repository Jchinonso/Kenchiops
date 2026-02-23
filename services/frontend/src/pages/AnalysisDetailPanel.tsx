/**
 * Analysis Detail Panel
 *
 * Slide-over Sheet panel showing full analysis details.
 * Opened when clicking an analysis row in CICDAnalyses.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Link2, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { formatTimestamp, extractRepoFromKey } from "@/lib/formatters";
import { useAnalysisDetail } from "@/hooks/useDashboardData";
import { DetailSkeleton, DetailContent } from "@/components/AnalysisDetailContent";
import { CorrelatedPipelineItems } from "@/components/CorrelatedPipelineItems";

// ==================== Props ====================

interface AnalysisDetailPanelProps {
  readonly analysisId: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
}

// ==================== Main Component ====================

export const AnalysisDetailPanel = ({ analysisId, open, onClose }: AnalysisDetailPanelProps) => {
  const { data: analysis, isLoading, error } = useAnalysisDetail(analysisId);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [analysisId]);

  const handleCopyLink = useCallback(async () => {
    if (!analysisId) {
      return;
    }
    const url = `${window.location.origin}/dashboard/cicd/analyses/${analysisId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [analysisId]);

  const repo = analysis ? extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis) : null;

  const commitSha = useMemo(() => {
    const key = analysis?.aggregationKey;
    if (!key) {
      return null;
    }
    const colonIndex = key.lastIndexOf(":");
    return colonIndex >= 0 ? key.slice(colonIndex + 1) : null;
  }, [analysis?.aggregationKey]);

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
            {error
              ? "Failed to load analysis"
              : repo && timestamp
                ? `${repo} \u00b7 ${timestamp}`
                : "Loading analysis details..."}
          </SheetDescription>
          {analysisId && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors mt-1 self-start"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
          )}
        </SheetHeader>

        {isLoading ? (
          <DetailSkeleton />
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : analysis ? (
          <>
            <DetailContent analysis={analysis} />
            <div className="px-4 pb-4">
              <CorrelatedPipelineItems commitSha={commitSha} sourcePipeline="cicd" />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
