/**
 * Anchor Selection for Log Truncation
 *
 * Implements tiered anchor selection strategy for CI log truncation.
 * Higher tiers represent more definitive failure signals.
 * Within tiers, prefers LATEST match (closer to end of logs).
 *
 * WHY LATEST MATCH: CI logs are chronological. Final failure summaries,
 * exit codes, and definitive error messages appear at the END. Early
 * matches are often warnings, retries, or benign mentions. Anchoring
 * on the latest match ensures we capture the actual failure context.
 *
 * @module formatting/preprocessing/anchorSelection
 */

import {
  CI_FAILURE_TIER1_PATTERNS,
  CI_FAILURE_TIER2_PATTERNS,
  CI_FAILURE_TIER3_PATTERNS,
  CI_FAILURE_TIER4_PATTERNS,
  ERROR_INDICATORS,
  LOG_PARSING_LIMITS,
  ANCHOR_TIERS,
  TEST_SUMMARY_PATTERNS,
} from "../../constants/index.js";

import type { AnchorResult, TieredMatch } from "./types.js";

// Re-export ANCHOR_TIERS for backward compatibility
export { ANCHOR_TIERS };

// ==================== Constants ====================

/**
 * Tiered patterns configuration.
 */
const TIERED_PATTERNS: ReadonlyArray<{ tier: number; patterns: readonly RegExp[] }> = [
  { tier: ANCHOR_TIERS.CI_BOUNDARY, patterns: CI_FAILURE_TIER1_PATTERNS },
  { tier: ANCHOR_TIERS.INFRA_KILLER, patterns: CI_FAILURE_TIER2_PATTERNS },
  { tier: ANCHOR_TIERS.STACK_TRACE, patterns: CI_FAILURE_TIER3_PATTERNS },
  { tier: ANCHOR_TIERS.GENERIC_ERROR, patterns: CI_FAILURE_TIER4_PATTERNS },
];

// ==================== Match Collection Functions ====================

/**
 * Find all match positions for a single pattern using matchAll.
 * Uses String.prototype.matchAll() for functional iteration.
 *
 * @param content - Content to search
 * @param pattern - Pattern to match (must have global flag)
 * @returns Array of match positions
 */
const findPatternMatches = (content: string, pattern: RegExp): readonly number[] => {
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  return Array.from(content.matchAll(globalPattern))
    .map((match) => match.index)
    .filter((index): index is number => index !== undefined);
};

/**
 * Find all match positions for multiple patterns.
 *
 * @param content - Content to search
 * @param patterns - Patterns to match
 * @returns Array of all match positions (sorted ascending)
 */
const findAllPatternPositions = (
  content: string,
  patterns: readonly RegExp[]
): readonly number[] => {
  const allPositions = patterns.flatMap((pattern) => findPatternMatches(content, pattern));
  return [...new Set(allPositions)].sort((firstPos, secondPos) => firstPos - secondPos);
};

/**
 * Collect matches from all tiers.
 *
 * @param content - Content to search
 * @returns Array of tiered matches
 */
const collectTieredMatches = (content: string): readonly TieredMatch[] =>
  TIERED_PATTERNS.flatMap(({ tier, patterns }) =>
    findAllPatternPositions(content, patterns).map((position) => ({
      position,
      tier,
    }))
  );

/**
 * Find the LAST occurrence of each indicator string (case-insensitive).
 * Returns the maximum (latest) position across all indicators.
 *
 * WHY LAST: Early "ERROR" mentions may be warnings or retries that succeeded.
 * The final occurrence is more likely to be the actual failure point.
 *
 * @param content - Content to search
 * @param indicators - String indicators to find
 * @returns Object with latest position and count of indicators found
 */
const findLastIndicatorPosition = (
  content: string,
  indicators: readonly string[]
): { position: number; indicatorsFound: number } => {
  const contentLower = content.toLowerCase();

  return indicators.reduce(
    (result, indicator) => {
      const indicatorLower = indicator.toLowerCase();
      const lastIndex = contentLower.lastIndexOf(indicatorLower);
      if (lastIndex === -1) {
        return result;
      }
      return {
        position: Math.max(result.position, lastIndex),
        indicatorsFound: result.indicatorsFound + 1,
      };
    },
    { position: -1, indicatorsFound: 0 }
  );
};

// ==================== Anchor Selection Functions ====================

/**
 * Select the best anchor from tiered matches.
 * Strategy: Pick highest tier (lowest number), prefer LATEST match within tier.
 *
 * @param matches - Array of tiered matches
 * @returns Best match or undefined if no matches
 */
const selectBestFromTiered = (matches: readonly TieredMatch[]): TieredMatch | undefined => {
  if (matches.length === 0) {
    return undefined;
  }

  const highestPriorityTier = Math.min(...matches.map((match) => match.tier));
  const topTierMatches = matches.filter((match) => match.tier === highestPriorityTier);

  return topTierMatches.reduce((latest, current) =>
    current.position > latest.position ? current : latest
  );
};

/**
 * Find the best anchor position for log truncation.
 *
 * IMPORTANT: Returns the RAW match position (true index), NOT a pre-shifted
 * position. The truncation window calculation is the ONLY place that should
 * apply context before/after offsets.
 *
 * Priority order:
 * 1. Test summary at end (contains all failures) - tier 0
 * 2. Tier 1: CI boundary markers (most reliable)
 * 3. Tier 2: Infrastructure failures (always fatal)
 * 4. Tier 3: Stack traces and exceptions
 * 5. Tier 4: Generic error indicators
 * 6. Fallback: LAST occurrence of ERROR/FAILED strings
 *
 * @param content - Log content to analyze
 * @returns Anchor result with position and metadata
 */
export const findBestAnchor = (content: string): AnchorResult => {
  const allSummaryPositions = TEST_SUMMARY_PATTERNS.flatMap((pattern) =>
    findPatternMatches(content, pattern)
  );

  if (allSummaryPositions.length > 0) {
    const lastSummary = Math.max(...allSummaryPositions);
    return {
      position: lastSummary,
      tier: ANCHOR_TIERS.SUMMARY,
      totalMatches: allSummaryPositions.length,
    };
  }

  const tieredMatches = collectTieredMatches(content);
  const bestTiered = selectBestFromTiered(tieredMatches);

  if (bestTiered) {
    return {
      position: bestTiered.position,
      tier: bestTiered.tier,
      totalMatches: tieredMatches.length,
    };
  }

  const fallbackResult = findLastIndicatorPosition(content, ERROR_INDICATORS);
  if (fallbackResult.position !== -1) {
    return {
      position: fallbackResult.position,
      tier: ANCHOR_TIERS.FALLBACK,
      totalMatches: fallbackResult.indicatorsFound,
    };
  }

  return {
    position: LOG_PARSING_LIMITS.DEFAULT_ERROR_POSITION,
    tier: ANCHOR_TIERS.FALLBACK,
    totalMatches: 0,
  };
};

/**
 * Find the best error position (simplified interface for backward compatibility).
 *
 * @param content - Log content to analyze
 * @returns Best starting index for truncation
 */
export const findBestErrorPosition = (content: string): number => findBestAnchor(content).position;
