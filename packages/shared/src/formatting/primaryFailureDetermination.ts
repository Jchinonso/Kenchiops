/**
 * Primary Failure Determination Module
 *
 * Determines the primary (root cause) failure using causality-aware heuristics.
 * Uses functional composition for scoring artifacts.
 *
 * @module formatting/primaryFailureDetermination
 */

import {
  PRIMARY_FAILURE_CONFIG,
  CAUSALITY_TYPE_ORDER,
  STACKTRACE_INDICATORS,
  ARTIFACT_TYPES,
  type ArtifactType,
} from "../constants/index.js";

import type { RankedArtifact, PrimaryFailure } from "./chunkingTypes.js";

// ==================== Scoring Types ====================

/**
 * Artifact score entry for primary failure determination.
 */
interface ArtifactScore {
  readonly index: number;
  readonly score: number;
  readonly reasons: readonly string[];
}

/**
 * Scoring component for building artifact scores functionally.
 */
interface ScoringComponent {
  readonly score: number;
  readonly reason: string | null;
}

// ==================== Scoring Functions ====================

/**
 * Computes position-based score for an artifact.
 * Earlier artifacts are more likely root causes.
 *
 * @param artifactIndex - Index of artifact in the array
 * @returns ScoringComponent with score and reason
 */
const computePositionScore = (artifactIndex: number): ScoringComponent => {
  const score = Math.max(0, PRIMARY_FAILURE_CONFIG.POSITION_EARLY_WEIGHT - artifactIndex);
  return {
    score,
    reason: score > 0 ? `early position (+${score})` : null,
  };
};

/**
 * Computes type-based score for an artifact.
 * Types earlier in CAUSALITY_TYPE_ORDER are more likely root causes.
 *
 * @param artifactType - Type of the artifact
 * @returns ScoringComponent with score and reason
 */
const computeTypeScore = (artifactType: ArtifactType): ScoringComponent => {
  const typeIndex = CAUSALITY_TYPE_ORDER.indexOf(artifactType);
  const score = typeIndex >= 0 ? CAUSALITY_TYPE_ORDER.length - typeIndex : 0;
  return {
    score,
    reason: `type ${artifactType} (+${score})`,
  };
};

/**
 * Checks if content contains stack trace indicators.
 *
 * @param snippet - Artifact snippet content
 * @param artifactType - Type of the artifact
 * @returns True if stack trace indicators are present
 */
const containsStackTrace = (snippet: string, artifactType: ArtifactType): boolean =>
  artifactType === "stack_trace" ||
  STACKTRACE_INDICATORS.some((indicator) => snippet.includes(indicator));

/**
 * Computes stack trace score for an artifact.
 *
 * @param snippet - Artifact snippet content
 * @param artifactType - Type of the artifact
 * @returns ScoringComponent with score and reason
 */
const computeStackTraceScore = (snippet: string, artifactType: ArtifactType): ScoringComponent => {
  const hasStackTrace = containsStackTrace(snippet, artifactType);
  const score = hasStackTrace ? PRIMARY_FAILURE_CONFIG.STACKTRACE_WEIGHT : 0;
  return {
    score,
    reason: score > 0 ? `has stacktrace (+${score})` : null,
  };
};

/**
 * Combines scoring components into a single artifact score.
 *
 * @param index - Artifact index
 * @param components - Array of scoring components
 * @returns ArtifactScore with combined score and reasons
 */
const combineScores = (index: number, components: readonly ScoringComponent[]): ArtifactScore => {
  const totalScore = components.reduce((sum, component) => sum + component.score, 0);
  const reasons = components
    .map((component) => component.reason)
    .filter((reason): reason is string => reason !== null);

  return { index, score: totalScore, reasons };
};

/**
 * Computes complete score for a single artifact.
 *
 * @param artifact - The artifact to score
 * @param index - Index of the artifact
 * @returns ArtifactScore for the artifact
 */
const scoreArtifact = (artifact: RankedArtifact, index: number): ArtifactScore => {
  const components: readonly ScoringComponent[] = [
    computePositionScore(index),
    computeTypeScore(artifact.type),
    computeStackTraceScore(artifact.snippet, artifact.type),
  ];
  return combineScores(index, components);
};

// ==================== Confidence Calculation ====================

/**
 * Calculates numeric confidence based on score gap between top two artifacts.
 *
 * @param primaryScore - Score of the primary artifact
 * @param secondScore - Score of the second-best artifact (or zero)
 * @returns Confidence value between zero and MAX_CONFIDENCE
 */
const calculateNumericConfidence = (primaryScore: number, secondScore: number): number => {
  const scoreGap = primaryScore - secondScore;
  const gapRatio = scoreGap / PRIMARY_FAILURE_CONFIG.MAX_SCORE_GAP;
  const rawConfidence =
    PRIMARY_FAILURE_CONFIG.BASE_CONFIDENCE +
    gapRatio * PRIMARY_FAILURE_CONFIG.GAP_CONFIDENCE_FACTOR;
  return Math.min(PRIMARY_FAILURE_CONFIG.MAX_CONFIDENCE, rawConfidence);
};

/**
 * Converts numeric confidence to enum level.
 *
 * @param numericConfidence - Numeric confidence value (0-1)
 * @returns Confidence level enum
 */
const toConfidenceLevel = (numericConfidence: number): "high" | "medium" | "low" => {
  if (numericConfidence >= PRIMARY_FAILURE_CONFIG.HIGH_CONFIDENCE_THRESHOLD) {
    return "high";
  }
  if (numericConfidence >= PRIMARY_FAILURE_CONFIG.MEDIUM_CONFIDENCE_THRESHOLD) {
    return "medium";
  }
  return "low";
};

// ==================== Edge Case Results ====================

/**
 * Creates empty artifacts result for edge case.
 * Returns a result indicating no artifacts were available to analyze.
 */
const createEmptyArtifactsResult = (): PrimaryFailure => ({
  type: ARTIFACT_TYPES.GENERIC_ERROR,
  artifactIndex: -1,
  confidence: "low",
  reason: "No artifacts to analyze",
  evidenceId: "",
  overrideAllowed: true,
  method: "heuristic",
});

/**
 * Creates single artifact result for edge case.
 *
 * @param artifact - The single artifact to use
 * @returns PrimaryFailure for single artifact case
 */
const createSingleArtifactResult = (artifact: RankedArtifact): PrimaryFailure => ({
  type: artifact.type,
  artifactIndex: 0,
  confidence: "high",
  reason: "Single failure - direct root cause",
  evidenceId: artifact.absoluteEvidenceId ?? artifact.evidenceId,
  overrideAllowed: false,
  method: "heuristic",
});

// ==================== Public API ====================

/**
 * Determines primary failure using causality-aware heuristics.
 * Considers failure type, position, and cascading patterns.
 *
 * Uses functional composition pattern:
 * 1. Score each artifact using component scorers
 * 2. Sort by score descending
 * 3. Calculate confidence from score gap
 *
 * @param artifacts - Ranked artifacts to analyze
 * @returns PrimaryFailure determination
 */
export const determinePrimaryFailure = (artifacts: readonly RankedArtifact[]): PrimaryFailure => {
  // Handle edge cases
  if (artifacts.length === 0) {
    return createEmptyArtifactsResult();
  }

  if (artifacts.length === 1) {
    return createSingleArtifactResult(artifacts[0]);
  }

  // Score all artifacts using functional map
  const scores = artifacts.map(scoreArtifact);

  // Sort by score descending to find primary
  const sortedScores = [...scores].sort((scoreA, scoreB) => scoreB.score - scoreA.score);

  const primaryScore = sortedScores[0];
  const secondBestScore = sortedScores[1];
  const primaryArtifact = artifacts[primaryScore.index];

  // Calculate confidence from score gap
  const numericConfidence = calculateNumericConfidence(
    primaryScore.score,
    secondBestScore?.score ?? 0
  );
  const confidenceLevel = toConfidenceLevel(numericConfidence);

  // Determine if override is allowed based on confidence
  const overrideAllowed = confidenceLevel !== "high";

  return {
    type: primaryArtifact.type,
    artifactIndex: primaryScore.index,
    confidence: confidenceLevel,
    reason: primaryScore.reasons.join(", "),
    evidenceId: primaryArtifact.absoluteEvidenceId ?? primaryArtifact.evidenceId,
    overrideAllowed,
    method: "heuristic",
  };
};
