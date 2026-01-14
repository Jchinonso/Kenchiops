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
 * @module formatting/anchorSelection
 */

import {
  CI_FAILURE_TIER1_PATTERNS,
  CI_FAILURE_TIER2_PATTERNS,
  CI_FAILURE_TIER3_PATTERNS,
  CI_FAILURE_TIER4_PATTERNS,
  ERROR_INDICATORS,
  LOG_PARSING_LIMITS,
} from "../constants/index.js";

// ==================== Types ====================

/**
 * Match position with tier information.
 */
interface TieredMatch {
  /** Position in the content */
  readonly position: number;
  /** Tier level (1 = highest priority) */
  readonly tier: number;
}

/**
 * Anchor selection result with metadata.
 */
export interface AnchorResult {
  /** Selected anchor position (RAW match index, not pre-shifted) */
  readonly position: number;
  /** Tier of the anchor (0=summary, 1-4=tiered, -1=fallback) */
  readonly tier: number;
  /** Number of matches found across all tiers */
  readonly totalMatches: number;
}

// ==================== Constants ====================

/**
 * Tier weights for anchor selection.
 * Higher tier = higher priority (lower number).
 * Exported for use in tier-aware truncation window calculation.
 */
export const ANCHOR_TIERS = {
  /** Test summary at end of output (highest priority) */
  SUMMARY: 0,
  /** Explicit CI failure boundaries (##[error], exit codes) */
  CI_BOUNDARY: 1,
  /** Infrastructure killers (OOM, timeout, disk full, DNS) */
  INFRA_KILLER: 2,
  /** Stack traces, exceptions, assertions */
  STACK_TRACE: 3,
  /** Generic error indicators (ERROR level, build failures) */
  GENERIC_ERROR: 4,
  /** Simple string fallback (ERROR, FAILED) */
  FALLBACK: -1,
} as const;

/**
 * Tiered patterns configuration.
 */
const TIERED_PATTERNS: ReadonlyArray<{ tier: number; patterns: readonly RegExp[] }> = [
  { tier: ANCHOR_TIERS.CI_BOUNDARY, patterns: CI_FAILURE_TIER1_PATTERNS },
  { tier: ANCHOR_TIERS.INFRA_KILLER, patterns: CI_FAILURE_TIER2_PATTERNS },
  { tier: ANCHOR_TIERS.STACK_TRACE, patterns: CI_FAILURE_TIER3_PATTERNS },
  { tier: ANCHOR_TIERS.GENERIC_ERROR, patterns: CI_FAILURE_TIER4_PATTERNS },
];

/**
 * Test/run summary patterns - language-agnostic structural markers.
 * These patterns detect "end-of-run summary" lines across common CI runners.
 * Kept generic: match structural shapes, not specific framework output.
 */
const TEST_SUMMARY_PATTERNS: readonly RegExp[] = [
  // Jest/Vitest style: "Tests: X failed", "Test Suites: X failed"
  /Tests?(?:\s+Suites?)?:\s*\d+\s+(?:failed|passed)/gi,
  // pytest style: "===== X failed, Y passed in Zs =====" (structural equals bars)
  /={3,}\s*\d+\s+(?:failed|passed).*={3,}/gi,
  // Generic count summaries: "X failed, Y passed" or "X failures, Y successes"
  /\d+\s+(?:failed|failures?),?\s+\d+\s+(?:passed|success)/gi,
  // Go test style: "FAIL\t<pkg>" at end, or "ok\t<pkg>"
  /^(?:FAIL|ok)\t\S+\s+[\d.]+s$/gim,
  // Rust/cargo style: "test result: FAILED" or "test result: ok"
  /test result:\s*(?:FAILED|ok)\.\s+\d+\s+passed/gi,
  // Generic "X tests?, Y failures?" summaries
  /\d+\s+tests?,\s*\d+\s+(?:failures?|errors?)/gi,
  // CI runner summaries: "Ran X tests" type lines
  /Ran\s+\d+\s+tests?\s+in\s+[\d.]+/gi,
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
  // Ensure pattern has global flag for matchAll
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);

  // Use matchAll and map to positions - functional approach
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

  // Return sorted unique positions
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
  let latestPosition = -1;
  let indicatorsFound = 0;

  indicators.forEach((indicator) => {
    const indicatorLower = indicator.toLowerCase();
    // Find LAST occurrence by searching backwards
    const lastIndex = contentLower.lastIndexOf(indicatorLower);
    if (lastIndex !== -1) {
      indicatorsFound++;
      if (lastIndex > latestPosition) {
        latestPosition = lastIndex;
      }
    }
  });

  return { position: latestPosition, indicatorsFound };
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

  // Find the highest priority tier (lowest tier number)
  const highestPriorityTier = Math.min(...matches.map((match) => match.tier));

  // Get all matches from the highest priority tier
  const topTierMatches = matches.filter((match) => match.tier === highestPriorityTier);

  // Return the LATEST match from the highest priority tier
  // (final failure summaries appear at end of logs)
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
  // Priority 1: Look for test summary at end (contains all failures listed together)
  // Find ALL summary matches across all summary patterns and pick the LATEST
  const allSummaryPositions = TEST_SUMMARY_PATTERNS.flatMap((pattern) =>
    findPatternMatches(content, pattern)
  );

  if (allSummaryPositions.length > 0) {
    // Use the LAST summary position (final summary at end)
    // FIX: Return RAW match index, NOT pre-shifted position
    // The truncation window calculation handles context offsets
    const lastSummary = Math.max(...allSummaryPositions);
    return {
      position: lastSummary,
      tier: ANCHOR_TIERS.SUMMARY,
      totalMatches: allSummaryPositions.length,
    };
  }

  // Priority 2-5: Tiered pattern matching
  const tieredMatches = collectTieredMatches(content);
  const bestTiered = selectBestFromTiered(tieredMatches);

  if (bestTiered) {
    return {
      position: bestTiered.position,
      tier: bestTiered.tier,
      totalMatches: tieredMatches.length,
    };
  }

  // Priority 6: Fall back to generic error indicators
  // FIX: Use LAST occurrence, not first
  const fallbackResult = findLastIndicatorPosition(content, ERROR_INDICATORS);
  if (fallbackResult.position !== -1) {
    return {
      position: fallbackResult.position,
      tier: ANCHOR_TIERS.FALLBACK,
      totalMatches: fallbackResult.indicatorsFound,
    };
  }

  // No indicators found - start from beginning
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
