/**
 * Feedback Section
 *
 * Thumbs up/down buttons for rating CI failure analyses.
 * When marked "Helpful", the analysis is ingested into the RAG knowledge base.
 * When marked "Not helpful", shows a correction textarea for resolution notes.
 */

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  useMyFeedback,
  useSubmitFeedback,
  type FeedbackSubmission,
} from "@/hooks/useAnalysisFeedback";

// ==================== Constants ====================

const CORRECTION_CONFIG = {
  MAX_LENGTH: 1000,
  ROWS: 3,
} as const;

// ==================== Props ====================

interface FeedbackSectionProps {
  readonly analysisId: string;
}

// ==================== Component ====================

export const FeedbackSection = ({ analysisId }: FeedbackSectionProps) => {
  const { data: existingFeedback, isLoading: isFetching } = useMyFeedback(analysisId);
  const { submitFeedback, isLoading: isSubmitting } = useSubmitFeedback(analysisId);

  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");

  const currentType = existingFeedback?.feedbackType ?? null;
  const isDisabled = isFetching || isSubmitting;

  // When existing feedback changes, pre-fill the correction on first open
  const [prevFeedbackId, setPrevFeedbackId] = useState<string | null>(null);
  if (existingFeedback?.id !== prevFeedbackId) {
    setPrevFeedbackId(existingFeedback?.id ?? null);
    if (existingFeedback?.correction && !showCorrection) {
      setCorrection(existingFeedback.correction);
    }
  }

  const handleHelpful = async () => {
    setShowCorrection(false);
    const result = await submitFeedback({ feedbackType: "correct" });
    if (result) {
      const message = result.lessonIngested
        ? "Analysis saved to knowledge base"
        : "Feedback recorded";
      toast.success(message);
    } else {
      toast.error("Failed to submit feedback");
    }
  };

  const handleNotHelpful = () => {
    if (currentType === "incorrect" && !showCorrection) {
      // Already marked incorrect, toggle correction textarea open to edit
      setShowCorrection(true);
      return;
    }
    // Toggle the correction panel
    setShowCorrection((prev) => !prev);
  };

  const handleSubmitCorrection = async () => {
    const submission: FeedbackSubmission = {
      feedbackType: "incorrect",
      ...(correction.trim().length > 0 ? { correction: correction.trim() } : {}),
    };
    const result = await submitFeedback(submission);
    if (result) {
      toast.success("Feedback recorded");
      setShowCorrection(false);
    } else {
      toast.error("Failed to submit feedback");
    }
  };

  const handleCancelCorrection = () => setShowCorrection(false);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Was this analysis helpful?
        </span>
        <div className="flex items-center gap-2">
          {isSubmitting && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-zinc-400"
              aria-label="Submitting feedback"
            />
          )}

          {/* Simplified to thumbs up/down. Additional feedback types ("flaky",
              "needs_more_context") are supported by the API and will be exposed
              when the full feedback taxonomy UI is implemented. */}
          <button
            type="button"
            disabled={isDisabled}
            aria-pressed={currentType === "correct"}
            onClick={handleHelpful}
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
            aria-pressed={currentType === "incorrect"}
            onClick={handleNotHelpful}
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

      {showCorrection && (
        <div className="space-y-2 pt-1">
          <Textarea
            placeholder="What was incorrect about this analysis?"
            aria-label="Describe what was incorrect about this analysis"
            value={correction}
            onChange={(event) =>
              setCorrection(event.target.value.slice(0, CORRECTION_CONFIG.MAX_LENGTH))
            }
            className="text-sm resize-none"
            rows={CORRECTION_CONFIG.ROWS}
            maxLength={CORRECTION_CONFIG.MAX_LENGTH}
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              {correction.length}/{CORRECTION_CONFIG.MAX_LENGTH}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelCorrection}
                disabled={isSubmitting}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitCorrection}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-md transition-colors disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
