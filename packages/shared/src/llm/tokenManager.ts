/**
 * OpenAI Token Budget Management Module
 *
 * Handles token budget estimation and evidence truncation to ensure
 * prompts fit within model token limits. Optimized to minimize prompt
 * building operations while ensuring accurate token counting.
 *
 * @module llm/tokenManager
 */

import type { Event, Evidence } from "../core/types.js";
import type { TokenEstimate } from "./types.js";
import { LLM_CONSTANTS } from "../constants/index.js";
import { ValidationError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import { buildAnalysisPrompt, estimateTokens, truncateEvidence } from "../integrations/prompts.js";

const logger = createLogger("token-manager");

/**
 * Validates token budget parameters.
 *
 * @param maxTokens - Maximum token budget
 * @throws {ValidationError} If token budget is invalid
 */
const validateTokenBudget = (maxTokens: number): void => {
  if (maxTokens <= LLM_CONSTANTS.TOKEN_BUFFER) {
    throw new ValidationError(
      `Token budget (${maxTokens}) must be greater than buffer (${LLM_CONSTANTS.TOKEN_BUFFER})`
    );
  }
};

/**
 * Calculates the evidence token budget after reserving space for prompt structure.
 *
 * @param maxTokens - Maximum token budget
 * @returns Available tokens for evidence
 */
const calculateEvidenceBudget = (maxTokens: number): number =>
  maxTokens - LLM_CONSTANTS.TOKEN_BUFFER;

/**
 * Manages token budget by truncating evidence if necessary.
 *
 * Optimization strategy:
 * 1. Quick estimate to avoid unnecessary prompt building
 * 2. Only build full prompt if estimate suggests it might fit
 * 3. Truncate evidence if actual tokens exceed budget
 *
 * @param event - The incident event to analyze
 * @param evidence - Collected evidence about the incident
 * @param maxTokens - Maximum token budget for the prompt
 * @returns Evidence, truncated if necessary to fit within budget
 *
 * @example
 * ```typescript
 * const truncatedEvidence = manageTokenBudget(
 *   event,
 *   evidence,
 *   LLM_CONSTANTS.MAX_PROMPT_TOKENS
 * );
 * ```
 */
export const manageTokenBudget = (
  event: Event,
  evidence: Evidence,
  maxTokens: number
): Evidence => {
  validateTokenBudget(maxTokens);

  const originalLogCount = evidence.logs?.length ?? 0;
  const estimate = estimateTokenBudget(evidence, maxTokens);
  const evidenceTokenBudget = calculateEvidenceBudget(maxTokens);

  // Early return: estimate clearly exceeds budget - truncate immediately
  if (estimate.requiresTruncation) {
    const truncated = truncateEvidence(evidence, evidenceTokenBudget);
    const truncatedLogCount = truncated.logs?.length ?? 0;

    logger.warn("Evidence truncated due to token budget (estimate)", {
      originalLogCount,
      truncatedLogCount,
      logsRemoved: originalLogCount - truncatedLogCount,
      estimatedTokens: estimate.totalEstimatedTokens,
      maxTokens,
      evidenceTokenBudget,
    });

    return truncated;
  }

  // Estimate suggests it might fit - verify with actual prompt
  const prompt = buildAnalysisPrompt(event, evidence);
  const actualTokens = estimateTokens(prompt);

  // Early return: actual tokens fit - return original evidence
  if (actualTokens <= maxTokens) {
    logger.debug("Evidence fits within token budget", {
      logCount: originalLogCount,
      actualTokens,
      maxTokens,
    });
    return evidence;
  }

  // Actual tokens exceed budget - truncate evidence
  const truncated = truncateEvidence(evidence, evidenceTokenBudget);
  const truncatedLogCount = truncated.logs?.length ?? 0;

  logger.warn("Evidence truncated due to token budget (actual)", {
    originalLogCount,
    truncatedLogCount,
    logsRemoved: originalLogCount - truncatedLogCount,
    actualTokens,
    maxTokens,
    evidenceTokenBudget,
  });

  return truncated;
};

/**
 * Estimates token budget requirements for evidence.
 *
 * Uses character-based approximation to quickly determine if truncation
 * is likely needed without building the full prompt.
 *
 * @param evidence - Evidence to estimate
 * @param maxTokens - Maximum token budget
 * @returns Token estimate with truncation requirement flag
 */
const estimateTokenBudget = (evidence: Evidence, maxTokens: number): TokenEstimate => {
  const evidenceTokens = estimateEvidenceSize(evidence);
  const totalEstimatedTokens = evidenceTokens + LLM_CONSTANTS.TOKEN_BUFFER;
  const requiresTruncation = totalEstimatedTokens > maxTokens;

  return {
    evidenceTokens,
    totalEstimatedTokens,
    requiresTruncation,
  } as const;
};

/**
 * Character count estimators for different evidence types.
 * Each function returns the character count for its evidence type.
 */
const estimateLogsChars = (logs: Evidence["logs"]): number =>
  logs?.reduce((sum, log) => sum + log.message.length + (log.stackTrace?.length || 0), 0) || 0;

const estimateGitHistoryChars = (gitHistory: Evidence["gitHistory"]): number =>
  gitHistory?.reduce(
    (sum, commit) => sum + commit.message.length + commit.sha.length + commit.author.length,
    0
  ) || 0;

const estimateRelatedDocsChars = (relatedDocs: Evidence["relatedDocs"]): number =>
  relatedDocs?.reduce((sum, doc) => sum + doc.title.length + (doc.excerpt?.length || 0), 0) || 0;

const estimateMetricsChars = (metrics: Evidence["metrics"]): number =>
  metrics ? JSON.stringify(metrics).length : 0;

const estimateSystemStateChars = (systemState: Evidence["systemState"]): number =>
  systemState ? JSON.stringify(systemState).length : 0;

/**
 * Array of evidence estimation functions paired with their corresponding evidence accessors.
 * This allows for a single-pass iteration without multiple if statements.
 */
const evidenceEstimators: ReadonlyArray<{
  readonly estimate: (evidence: Evidence) => number;
}> = [
  { estimate: (evidence) => estimateLogsChars(evidence.logs) },
  { estimate: (evidence) => estimateGitHistoryChars(evidence.gitHistory) },
  { estimate: (evidence) => estimateRelatedDocsChars(evidence.relatedDocs) },
  { estimate: (evidence) => estimateMetricsChars(evidence.metrics) },
  { estimate: (evidence) => estimateSystemStateChars(evidence.systemState) },
] as const;

/**
 * Quick estimate of evidence size in tokens using character-based approximation.
 *
 * Uses a conservative estimate (~4 chars per token) to avoid underestimating.
 * This ensures we err on the side of caution when deciding whether to truncate.
 *
 * @param evidence - Evidence to estimate
 * @returns Estimated token count (rounded up for safety)
 */
const estimateEvidenceSize = (evidence: Evidence): number => {
  const { CHARS_PER_TOKEN_ESTIMATE } = LLM_CONSTANTS;

  const totalChars = evidenceEstimators.reduce((sum, { estimate }) => sum + estimate(evidence), 0);

  return Math.ceil(totalChars / CHARS_PER_TOKEN_ESTIMATE);
};
