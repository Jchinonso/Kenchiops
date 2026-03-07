/**
 * Feedback Section
 *
 * Thumbs up/down buttons for rating CI failure analyses.
 * When marked "Helpful", the analysis is ingested into the RAG knowledge base.
 */

import { useCallback } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useMyFeedback,
  useSubmitFeedback,
  type FeedbackSubmission,
} from "@/hooks/useAnalysisFeedback";

// ==================== Props ====================

interface FeedbackSectionProps {
  readonly analysisId: string;
}

// ==================== Component ====================

export const FeedbackSection = ({ analysisId }: FeedbackSectionProps) => {
  const { data: existingFeedback, isLoading: isFetching } = useMyFeedback(analysisId);
  const { submitFeedback, isLoading: isSubmitting } = useSubmitFeedback(analysisId);

  const currentType = existingFeedback?.feedbackType ?? null;
  const isDisabled = isFetching || isSubmitting;

  const handleFeedback = useCallback(
    async (feedbackType: FeedbackSubmission["feedbackType"]) => {
      const result = await submitFeedback({ feedbackType });
      if (result) {
        const message =
          feedbackType === "correct" && result.lessonIngested
            ? "Analysis saved to knowledge base"
            : "Feedback recorded";
        toast.success(message);
      } else {
        toast.error("Failed to submit feedback");
      }
    },
    [submitFeedback]
  );

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Was this analysis helpful?
        </span>
        <div className="flex items-center gap-2">
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}

          <button
            type="button"
            disabled={isDisabled}
            onClick={() => {
              handleFeedback("correct");
            }}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50",
              currentType === "correct"
                ? "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800"
                : "text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-700 dark:hover:text-green-300 hover:border-green-300 dark:hover:border-green-800"
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            Helpful
          </button>

          <button
            type="button"
            disabled={isDisabled}
            onClick={() => {
              handleFeedback("incorrect");
            }}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50",
              currentType === "incorrect"
                ? "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-800"
                : "text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-800"
            )}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Not helpful
          </button>
        </div>
      </div>
    </div>
  );
};
