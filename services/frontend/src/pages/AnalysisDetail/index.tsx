/**
 * Analysis Detail Page
 *
 * Full-page view of a single analysis result. Accessed via
 * /dashboard/cicd/analyses/:id. Shows comprehensive analysis
 * details with back navigation and linked event navigation.
 */

import { Link } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";
import { useAnalysisDetail } from "@/hooks/useDashboardData";
import { extractRepoFromKey, formatTimestamp } from "@/lib/formatters";
import { DetailSkeleton, DetailContent } from "@/components/AnalysisDetailContent";
import { ANALYSES_LIST_PATH } from "./constants";
import type { AnalysisDetailProps } from "./types";

// ==================== Main Component ====================

export const AnalysisDetail = ({ analysisId }: AnalysisDetailProps) => {
  const { data: analysis, isLoading, error } = useAnalysisDetail(analysisId);

  const repo = analysis ? extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis) : null;
  const timestamp = analysis ? formatTimestamp(analysis.createdAt) : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to={ANALYSES_LIST_PATH}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Analyses
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950">
          <Zap className="w-5 h-5 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
            {isLoading
              ? "Loading analysis..."
              : error
                ? "Analysis Not Found"
                : `Analysis for ${repo}`}
          </h1>
          {timestamp && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{timestamp}</p>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <DetailSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-12 text-center">
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Link
            to={ANALYSES_LIST_PATH}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
          >
            Return to Analyses
          </Link>
        </div>
      ) : analysis ? (
        <DetailContent analysis={analysis} showLinkedEventLink />
      ) : null}
    </div>
  );
};
