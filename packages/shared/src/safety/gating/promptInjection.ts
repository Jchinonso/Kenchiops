/**
 * Prompt Injection Detection Module
 *
 * Detects potential prompt injection attacks in user inputs before
 * they are sent to LLMs. Prevents jailbreaks and unauthorized instructions.
 *
 * @module safety/gating/promptInjection
 */

import type {
  InjectionDetectionResult,
  InjectionMatch,
  InjectionPatternType,
  InjectionRecommendation,
  InjectionPattern,
} from "../types.js";
import {
  INJECTION_RISK_THRESHOLDS,
  INJECTION_MAX_WEIGHT_PER_TYPE,
  INJECTION_CODE_FENCE_WEIGHT_MULTIPLIER,
} from "../../constants/safety.js";
import {
  INJECTION_PATTERNS,
  INSTRUCTION_CONTEXT_KEYWORDS,
  CODE_FENCE_CLOSED_PATTERN,
  CODE_FENCE_UNCLOSED_PATTERN,
} from "./injectionPatterns.js";

// ==================== Helper Functions ====================

/**
 * Extracts [start, end] ranges from matchAll results.
 * Clones regex to avoid shared mutable state under concurrency.
 */
const extractRanges = (text: string, pattern: RegExp): Array<[number, number]> => {
  const regex = cloneRegex(pattern);
  return [...text.matchAll(regex)].flatMap((match) =>
    match.index === undefined
      ? []
      : [[match.index, match.index + match[0].length] as [number, number]]
  );
};

/**
 * Finds ranges of code fences (closed and unclosed) in text.
 * Quote lines (>) are not discounted as they're too easy to game.
 */
const findCodeFenceRanges = (text: string): Array<[number, number]> => [
  ...extractRanges(text, CODE_FENCE_CLOSED_PATTERN),
  ...extractRanges(text, CODE_FENCE_UNCLOSED_PATTERN),
];

/**
 * Checks if an index is within any of the given ranges.
 */
const isInRanges = (index: number, ranges: ReadonlyArray<[number, number]>): boolean =>
  ranges.some(([start, end]) => index >= start && index < end);

/**
 * Checks if text has instruction-related context nearby a match.
 * Looks within 100 chars before and after the match.
 */
const hasInstructionContext = (text: string, matchIndex: number, matchLength: number): boolean => {
  const contextRadius = 100;
  const start = Math.max(0, matchIndex - contextRadius);
  const end = Math.min(text.length, matchIndex + matchLength + contextRadius);
  const context = text.slice(start, end);
  return INSTRUCTION_CONTEXT_KEYWORDS.test(context);
};

/**
 * Creates dedup key for a match (patternId + exact position + length).
 */
const getMatchKey = (patternId: string, index: number, length: number): string =>
  `${patternId}:${index}:${length}`;

/**
 * Clones a RegExp to avoid shared mutable state issues under concurrency.
 */
const cloneRegex = (pattern: RegExp): RegExp => new RegExp(pattern.source, pattern.flags);

// ==================== Core Functions ====================

/**
 * Checks if a match should be included based on context requirements.
 */
const shouldIncludeMatch = (
  text: string,
  matchIndex: number,
  matchLength: number,
  requiresInstructionContext: boolean | undefined
): boolean =>
  !requiresInstructionContext ||
  matchIndex < 0 ||
  hasInstructionContext(text, matchIndex, matchLength);

/**
 * Creates an InjectionMatch from pattern and regex match.
 */
const createMatch = (
  patternDef: Pick<InjectionPattern, "id" | "type" | "severity" | "weight">,
  regexMatch: RegExpMatchArray,
  codeFenceRanges: ReadonlyArray<[number, number]>
): InjectionMatch => {
  const matchIndex = regexMatch.index ?? -1;
  return {
    patternId: patternDef.id,
    type: patternDef.type,
    matchedText: regexMatch[0].slice(0, 50),
    matchLength: regexMatch[0].length,
    severity: patternDef.severity,
    weight: patternDef.weight,
    index: matchIndex,
    inCodeFence: matchIndex >= 0 && isInRanges(matchIndex, codeFenceRanges),
  };
};

/**
 * Detects injection patterns in text using matchAll for position tracking.
 *
 * @param text - Text to analyze
 * @returns Array of unique matches found
 */
const detectPatterns = (text: string): InjectionMatch[] => {
  const codeFenceRanges = findCodeFenceRanges(text);

  // Collect all matches, filtering by context requirements
  // Clone regex per pattern to avoid shared mutable state under concurrency
  const allMatches = INJECTION_PATTERNS.flatMap((patternDef) => {
    const regex = cloneRegex(patternDef.pattern);
    return [...text.matchAll(regex)]
      .filter((regexMatch) =>
        shouldIncludeMatch(
          text,
          regexMatch.index ?? -1,
          regexMatch[0].length,
          patternDef.requiresInstructionContext
        )
      )
      .map((regexMatch) => createMatch(patternDef, regexMatch, codeFenceRanges));
  });

  // Dedupe by patternId + exact position + length
  const dedupedMatches = allMatches.reduce<Map<string, InjectionMatch>>((accumulator, match) => {
    const key = getMatchKey(match.patternId, match.index, match.matchLength);
    return accumulator.has(key) ? accumulator : new Map(accumulator).set(key, match);
  }, new Map<string, InjectionMatch>());

  return Array.from(dedupedMatches.values());
};

/**
 * Calculates risk score from matches with per-type capping.
 *
 * @param matches - Detected matches
 * @returns Risk score (0-1)
 */
const calculateRiskScore = (matches: readonly InjectionMatch[]): number => {
  if (matches.length === 0) {
    return 0;
  }

  // Group weights by type and cap each type's contribution
  const getEffectiveWeight = (match: InjectionMatch): number => {
    const shouldDiscount = match.inCodeFence && match.severity !== "critical";
    return shouldDiscount ? match.weight * INJECTION_CODE_FENCE_WEIGHT_MULTIPLIER : match.weight;
  };

  const weightByType = matches.reduce<Map<InjectionPatternType, number>>((accumulator, match) => {
    const effectiveWeight = getEffectiveWeight(match);
    const currentWeight = accumulator.get(match.type) ?? 0;
    const cappedWeight = Math.min(currentWeight + effectiveWeight, INJECTION_MAX_WEIGHT_PER_TYPE);
    return new Map(accumulator).set(match.type, cappedWeight);
  }, new Map<InjectionPatternType, number>());

  // Sum capped weights
  const totalWeight = Array.from(weightByType.values()).reduce((sum, weight) => sum + weight, 0);

  // Apply diminishing returns for multiple pattern types (not matches)
  // DIMINISHING_BASE controls how quickly additional pattern types add less weight
  const DIMINISHING_BASE = 0.8;
  const typeCount = weightByType.size;
  const diminishingFactor = 1 - DIMINISHING_BASE ** typeCount;
  const baseScore = Math.min(1, totalWeight * diminishingFactor);

  // Boost if critical severity present (but not from code fence context)
  const hasCriticalOutsideCodeFence = matches.some(
    (match) => match.severity === "critical" && !match.inCodeFence
  );
  const criticalBoost = hasCriticalOutsideCodeFence ? 0.2 : 0;

  return Math.min(1, baseScore + criticalBoost);
};

/**
 * Threshold lookup table for score-based recommendations.
 * Ordered by descending threshold (check highest first).
 */
const SCORE_THRESHOLDS: ReadonlyArray<{
  min: number;
  recommendation: InjectionRecommendation;
}> = [
  { min: INJECTION_RISK_THRESHOLDS.BLOCK_MIN, recommendation: "block" },
  { min: INJECTION_RISK_THRESHOLDS.SANITIZE_MIN, recommendation: "sanitize" },
  { min: INJECTION_RISK_THRESHOLDS.REVIEW_MIN, recommendation: "review" },
];

/**
 * Checks if matches indicate critical severity outside code fences.
 */
const hasCriticalOutsideCodeFence = (matches: readonly InjectionMatch[]): boolean =>
  matches.some((match) => match.severity === "critical" && !match.inCodeFence);

/**
 * Counts high severity matches outside code fences.
 */
const countHighOutsideCodeFence = (matches: readonly InjectionMatch[]): number =>
  matches.filter((match) => match.severity === "high" && !match.inCodeFence).length;

/**
 * Determines recommendation based on risk score and severity.
 *
 * @param riskScore - Calculated risk score
 * @param matches - Detected matches
 * @returns Recommended action
 */
const determineRecommendation = (
  riskScore: number,
  matches: readonly InjectionMatch[]
): InjectionRecommendation => {
  // Critical severity outside code fences always blocks
  if (hasCriticalOutsideCodeFence(matches)) {
    return "block";
  }

  // Find recommendation by threshold lookup
  const entry = SCORE_THRESHOLDS.find((threshold) => riskScore >= threshold.min);
  if (!entry) {
    return "allow";
  }

  // Special case: sanitize threshold with multiple high severity = escalate to block
  if (entry.recommendation === "sanitize" && countHighOutsideCodeFence(matches) >= 2) {
    return "block";
  }

  return entry.recommendation;
};

// ==================== Exports ====================

/**
 * Detects potential prompt injection in input text.
 *
 * @param input - User input to analyze
 * @returns Detection result with risk assessment
 */
export const detectPromptInjection = (input: string): InjectionDetectionResult => {
  if (!input || input.trim().length === 0) {
    return {
      isInjection: false,
      riskScore: 0,
      detectedPatterns: [],
      matches: [],
      recommendation: "allow",
    };
  }

  const matches = detectPatterns(input);
  const riskScore = calculateRiskScore(matches);
  const detectedPatterns = [...new Set(matches.map((match) => match.type))];
  const recommendation = determineRecommendation(riskScore, matches);

  return {
    isInjection: riskScore >= INJECTION_RISK_THRESHOLDS.REVIEW_MIN,
    riskScore,
    detectedPatterns,
    matches,
    recommendation,
  };
};

/**
 * Quick check if input contains injection attempt.
 *
 * @param input - User input to check
 * @returns True if injection detected
 */
export const hasInjectionAttempt = (input: string): boolean =>
  detectPromptInjection(input).isInjection;

/**
 * Checks if input should be blocked.
 *
 * @param input - User input to check
 * @returns True if input should be blocked
 */
export const shouldBlockInput = (input: string): boolean =>
  detectPromptInjection(input).recommendation === "block";

/**
 * Sanitizes input by removing detected injection patterns.
 *
 * WARNING: Regex-based sanitization is defense-in-depth only.
 * It can break legitimate user content and may not fully neutralize attacks.
 * For production, prefer:
 * - "review": route to human or safe-mode pipeline
 * - "block": reject entirely
 * - "sanitize": wrap content as untrusted data, don't surgically edit
 *
 * @param input - User input to sanitize
 * @returns Sanitized input (best-effort, not guaranteed safe)
 */
export const sanitizeInjectionAttempts = (input: string): string => {
  if (!input) {
    return "";
  }

  // Reduce over patterns, applying each replacement immutably
  return INJECTION_PATTERNS.reduce((currentText, { pattern }) => {
    const regex = cloneRegex(pattern);
    return currentText.replace(regex, "[REDACTED]");
  }, input);
};

/** Severity levels in priority order (highest first) */
const SEVERITY_PRIORITY_ORDER: ReadonlyArray<"critical" | "high" | "medium" | "low"> = [
  "critical",
  "high",
  "medium",
  "low",
];

/**
 * Gets severity level for an input.
 *
 * @param input - User input to analyze
 * @returns Highest severity found or "none"
 */
export const getInjectionSeverity = (
  input: string
): "none" | "low" | "medium" | "high" | "critical" => {
  const { matches } = detectPromptInjection(input);

  if (matches.length === 0) {
    return "none";
  }

  const matchedSeverity = SEVERITY_PRIORITY_ORDER.find((severity) =>
    matches.some((match) => match.severity === severity)
  );

  return matchedSeverity ?? "low";
};
