/**
 * AnalysisDetailPanel helpers
 *
 * Pure functions for extracting data from analysis aggregation keys.
 */

/**
 * Build the shareable URL for an analysis detail panel.
 */
export const buildAnalysisUrl = (analysisId: string): string =>
  `${window.location.origin}/dashboard/cicd/analyses/${analysisId}`;

/**
 * Extract commit SHA from an aggregation key.
 * The key format is "owner/repo:sha" — returns the part after the last colon.
 */
export const extractCommitShaFromKey = (aggregationKey: string): string | null => {
  const colonIndex = aggregationKey.lastIndexOf(":");
  return colonIndex >= 0 ? aggregationKey.slice(colonIndex + 1) : null;
};
