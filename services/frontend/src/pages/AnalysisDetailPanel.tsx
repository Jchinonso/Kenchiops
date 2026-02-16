/**
 * Analysis Detail Panel
 *
 * Slide-over Sheet panel showing full analysis details.
 * Opened when clicking an analysis row in CICDAnalyses.
 */

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

// ==================== Props ====================

interface AnalysisDetailPanelProps {
  readonly analysisId: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
}

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
            {error
              ? "Failed to load analysis"
              : repo && timestamp
                ? `${repo} \u00b7 ${timestamp}`
                : "Loading analysis details..."}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <DetailSkeleton />
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : analysis ? (
          <DetailContent analysis={analysis} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
