/**
 * Hallucination Detection Module
 *
 * Detects fabricated or unsupported claims in LLM outputs by checking
 * against provided evidence and known patterns of hallucination.
 *
 * @module safety/validation/hallucination
 */

import type {
  HallucinationCheckResult,
  HallucinationIndicator,
  HallucinationIndicatorType,
  HallucinationConfidenceLevel,
  HallucinationRiskLevel,
  ConfidenceContext,
  ConfidenceRule,
  RiskLevelThreshold,
} from "../types.js";
import {
  HALLUCINATION_DEFAULT_THRESHOLD,
  HALLUCINATION_RISK_WEIGHTS,
  HALLUCINATION_PATTERNS,
  CLAIM_PATTERNS,
  TEMPORAL_PATTERN,
  HALLUCINATION_CONFIDENCE_THRESHOLDS as CONFIDENCE_THRESHOLDS,
} from "../../constants/safety.js";
import {
  HALLUCINATION_CONFIG,
  HALLUCINATION_TEXT_THRESHOLDS,
  CLAIM_STOPWORDS,
} from "../../constants/validation.js";

// ==================== Pure Helper Functions ====================

/** Truncates text to max length */
const truncate = (text: string, maxLength: number): string =>
  text.length > maxLength ? text.slice(0, maxLength) : text;

/** Clamps value between 0 and 1 */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Calculates ratio safely (returns 0 if denominator is 0) */
const safeRatio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

/** Safely matches pattern against text, resetting state */
const matchAll = (text: string, pattern: RegExp): string[] => {
  pattern.lastIndex = 0;
  return text.match(pattern) ?? [];
};

/** Executes regex globally and returns all match results */
const execAll = (text: string, pattern: RegExp): RegExpExecArray[] => {
  pattern.lastIndex = 0;
  const results: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    results.push(match);
  }
  return results;
};

/** Creates indicator with truncated matched text */
const createIndicator = (
  type: HallucinationIndicatorType,
  matchedText: string,
  weight: number
): HallucinationIndicator => ({
  type,
  matchedText: truncate(matchedText, HALLUCINATION_CONFIG.MATCH_TEXT_TRUNCATE_LENGTH),
  weight,
});

/** Checks if word is significant (not a stopword and long enough) */
const isSignificantWord = (word: string): boolean =>
  word.length > HALLUCINATION_CONFIG.MIN_SIGNIFICANT_WORD_LENGTH && !CLAIM_STOPWORDS.has(word);

/** Extracts significant words from text */
const extractSignificantWords = (text: string): string[] =>
  text.toLowerCase().split(/\s+/).filter(isSignificantWord);

/** Counts words appearing in target text */
const countMatchingWords = (words: readonly string[], target: string): number =>
  words.filter((word) => target.includes(word)).length;

/** Checks if claim length is within valid bounds */
const isValidClaimLength = (claim: string): boolean =>
  claim.length > HALLUCINATION_CONFIG.MIN_CLAIM_LENGTH &&
  claim.length < HALLUCINATION_CONFIG.MAX_CLAIM_LENGTH;

/** Sums weights of indicators */
const sumWeights = (indicators: readonly HallucinationIndicator[]): number =>
  indicators.reduce((sum, { weight }) => sum + weight, 0);

/** Counts pattern matches in text */
const countMatches = (text: string, pattern: RegExp): number => matchAll(text, pattern).length;

/** Calculates average sentence length */
const getAvgSentenceLength = (text: string): number =>
  text.length / Math.max(1, text.split(/[.!?]/).length);

// ==================== Text Analysis Predicates ====================

const hasSuspiciouslyLongSentences = (text: string): boolean =>
  getAvgSentenceLength(text) > HALLUCINATION_TEXT_THRESHOLDS.SUSPICIOUS_AVG_SENTENCE_LENGTH;

const hasHighNumberDensity = (text: string): boolean =>
  countMatches(text, /\d+/g) / (text.length / 100) >
  HALLUCINATION_TEXT_THRESHOLDS.SUSPICIOUS_NUMBER_DENSITY;

const hasManyDateReferences = (text: string): boolean =>
  countMatches(text, /\b(?:19|20)\d{2}\b/g) > HALLUCINATION_TEXT_THRESHOLDS.SUSPICIOUS_DATE_COUNT;

/** Text characteristic checks with score contributions */
const TEXT_CHECKS: ReadonlyArray<{ check: (text: string) => boolean; score: number }> = [
  { check: hasSuspiciouslyLongSentences, score: 0.1 },
  { check: hasHighNumberDensity, score: 0.15 },
  { check: hasManyDateReferences, score: 0.1 },
];

// ==================== Core Detection Functions ====================

/** Detects temporal impossibilities (future years stated in past tense) */
const detectTemporalImpossibilities = (text: string): HallucinationIndicator[] => {
  const currentYear = new Date().getFullYear();
  return execAll(text, TEMPORAL_PATTERN)
    .filter((match) => parseInt(match[1], 10) > currentYear)
    .map((match) => createIndicator("temporal_impossibility", match[0], 0.4));
};

/** Detects hallucination indicators using pattern matching */
const detectPatternIndicators = (text: string): HallucinationIndicator[] => [
  ...HALLUCINATION_PATTERNS.flatMap(({ pattern, type, weight }) =>
    matchAll(text, pattern).map((match) => createIndicator(type, match, weight))
  ),
  ...detectTemporalImpossibilities(text),
];

/** Extracts unique claims from text within valid length bounds */
const extractClaims = (text: string): string[] => [
  ...new Set(
    CLAIM_PATTERNS.flatMap((pattern) => matchAll(text, pattern))
      .map((match) => match.trim())
      .filter(isValidClaimLength)
  ),
];

/** Checks if claim is supported by any evidence item */
const isClaimSupported = (claim: string, evidence: readonly string[]): boolean => {
  const words = extractSignificantWords(claim);
  const threshold = Math.min(
    HALLUCINATION_CONFIG.MIN_MATCHED_WORDS,
    Math.ceil(words.length * HALLUCINATION_CONFIG.CLAIM_SUPPORT_WORD_RATIO)
  );
  return evidence.some((item) => countMatchingWords(words, item.toLowerCase()) >= threshold);
};

/** Calculates text characteristic score */
const calculateTextScore = (text: string): number =>
  clamp01(
    TEXT_CHECKS.filter(({ check }) => check(text)).reduce((sum, { score }) => sum + score, 0)
  );

/** Calculates weighted risk score from components */
const calculateRiskScore = (indicator: number, unverified: number, text: number): number =>
  clamp01(
    indicator * HALLUCINATION_RISK_WEIGHTS.PATTERN_INDICATORS +
      unverified * HALLUCINATION_RISK_WEIGHTS.UNVERIFIED_CLAIMS +
      text * HALLUCINATION_RISK_WEIGHTS.TEXT_CHARACTERISTICS
  );

const hasSignal = (ctx: ConfidenceContext, threshold: number): boolean =>
  ctx.indicatorCount >= threshold || (ctx.unverifiedCount >= threshold && ctx.hasEvidence);

const CONFIDENCE_RULES: readonly ConfidenceRule[] = [
  {
    level: "low",
    check: (ctx) => ctx.textLength < HALLUCINATION_TEXT_THRESHOLDS.MIN_RELIABLE_TEXT_LENGTH,
  },
  { level: "high", check: (ctx) => hasSignal(ctx, CONFIDENCE_THRESHOLDS.HIGH) },
  { level: "medium", check: (ctx) => hasSignal(ctx, CONFIDENCE_THRESHOLDS.MEDIUM) },
];

/** Determines confidence level based on detection quality */
const determineConfidence = (
  indicatorCount: number,
  unverifiedCount: number,
  hasEvidence: boolean,
  textLength: number
): HallucinationConfidenceLevel => {
  const ctx: ConfidenceContext = { indicatorCount, unverifiedCount, hasEvidence, textLength };
  return CONFIDENCE_RULES.find(({ check }) => check(ctx))?.level ?? "low";
};

/** Creates empty result for invalid input */
const createEmptyResult = (): HallucinationCheckResult => ({
  riskScore: 0,
  isLikelyHallucinated: false,
  indicators: [],
  unverifiedClaims: [],
  detectionConfidence: "low",
});

// ==================== Exports ====================

/**
 * Checks text for potential hallucinations.
 */
export const checkForHallucinations = (
  text: string,
  options: { evidence?: readonly string[]; threshold?: number } = {}
): HallucinationCheckResult => {
  const { evidence = [], threshold = HALLUCINATION_DEFAULT_THRESHOLD } = options;

  if (!text?.trim()) {
    return createEmptyResult();
  }

  const truncatedText = truncate(text, HALLUCINATION_CONFIG.MAX_TEXT_LENGTH);
  const indicators = detectPatternIndicators(truncatedText);
  const claims = extractClaims(truncatedText);
  const unverifiedClaims = claims.filter((claim) => !isClaimSupported(claim, evidence));

  const indicatorScore = clamp01(sumWeights(indicators));
  const unverifiedScore = safeRatio(unverifiedClaims.length, claims.length);
  const textScore = calculateTextScore(truncatedText);
  const riskScore = calculateRiskScore(indicatorScore, unverifiedScore, textScore);

  return {
    riskScore,
    isLikelyHallucinated: riskScore >= threshold,
    indicators,
    unverifiedClaims,
    detectionConfidence: determineConfidence(
      indicators.length,
      unverifiedClaims.length,
      evidence.length > 0,
      text.length
    ),
  };
};

/**
 * Quick check if text is likely hallucinated.
 */
export const isLikelyHallucinated = (text: string, evidence?: readonly string[]): boolean =>
  checkForHallucinations(text, { evidence }).isLikelyHallucinated;

/** Risk level thresholds (checked in order, first match wins) */
const RISK_LEVEL_THRESHOLDS: readonly RiskLevelThreshold[] = [
  { maxScore: 0.3, level: "low" },
  { maxScore: 0.6, level: "medium" },
];

/**
 * Gets hallucination risk level as a category.
 */
export const getHallucinationRiskLevel = (
  text: string,
  evidence?: readonly string[]
): HallucinationRiskLevel => {
  const { riskScore } = checkForHallucinations(text, { evidence });
  return RISK_LEVEL_THRESHOLDS.find(({ maxScore }) => riskScore < maxScore)?.level ?? "high";
};
