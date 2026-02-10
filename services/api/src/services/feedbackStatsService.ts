/**
 * Feedback Statistics Service
 *
 * Provides feedback counting and statistics for fine-tuning readiness.
 *
 * @module services/feedbackStatsService
 */

import { query, createLogger, getErrorMessage, SERVICE_NAMES } from "@kenchi/shared";
import type { FeedbackCounts } from "../types/apiTypes.js";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== SQL Queries ====================

const FEEDBACK_STATS_QUERIES = {
  COUNT_BY_TYPE: `
    SELECT
      feedback_type,
      COUNT(*) as count
    FROM analysis_feedback
    WHERE ($1::text IS NULL OR tenant_id = $1)
    GROUP BY feedback_type
  `,

  COUNT_SINCE_DATE: `
    SELECT COUNT(*) as count
    FROM analysis_feedback
    WHERE created_at >= $1
      AND ($2::text IS NULL OR tenant_id = $2)
  `,
} as const;

// ==================== Public API ====================

/**
 * Counts feedback by type.
 *
 * @param tenantId - Optional tenant ID to filter by
 * @returns Feedback counts grouped by type
 */
export const countFeedbackByType = async (tenantId?: string): Promise<FeedbackCounts> => {
  try {
    const result = await query<{ feedback_type: string; count: string }>(
      FEEDBACK_STATS_QUERIES.COUNT_BY_TYPE,
      [tenantId ?? null]
    );

    // Build counts using reduce for immutable pattern
    const countsMap = result.rows.reduce(
      (accumulator, row) => {
        const count = parseInt(row.count, 10);
        const feedbackType = row.feedback_type;
        if (feedbackType === "helpful" || feedbackType === "not_helpful") {
          return { ...accumulator, [feedbackType]: count };
        }
        return { ...accumulator, neutral: accumulator.neutral + count };
      },
      { helpful: 0, not_helpful: 0, neutral: 0 }
    );

    return countsMap;
  } catch (error) {
    logger.error("Failed to count feedback by type", {
      tenantId,
      error: getErrorMessage(error),
    });
    return { helpful: 0, not_helpful: 0, neutral: 0 };
  }
};

/**
 * Counts feedback since a given date.
 *
 * @param since - Date to count feedback from
 * @param tenantId - Optional tenant ID to filter by
 * @returns Count of feedback records since the date
 */
export const countFeedbackSinceDate = async (since: Date, tenantId?: string): Promise<number> => {
  try {
    const result = await query<{ count: string }>(FEEDBACK_STATS_QUERIES.COUNT_SINCE_DATE, [
      since.toISOString(),
      tenantId ?? null,
    ]);

    return parseInt(result.rows[0]?.count ?? "0", 10);
  } catch (error) {
    logger.error("Failed to count feedback since date", {
      since: since.toISOString(),
      tenantId,
      error: getErrorMessage(error),
    });
    return 0;
  }
};
