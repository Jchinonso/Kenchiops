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
 * Measures the actual template overhead by building a prompt with empty evidence.
 * This gives an accurate token budget for evidence instead of relying on a static constant.
 */
const measureTemplateOverhead = (event: Event): number => {
  const emptyEvidence: Evidence = { eventId: event.id, logs: [], collectedAt: "" };
  const templatePrompt = buildAnalysisPrompt(event, emptyEvidence);
  return estimateTokens(templatePrompt);
};

/**
 * Safety factor applied to log reduction during the enforcement loop.
 * Each iteration keeps 75% of remaining logs.
 */
const LOG_REDUCTION_FACTOR = 0.75;

/**
 * Enforces the token budget by progressively removing logs until the full prompt fits.
 * This is the safety net that guarantees the prompt never exceeds maxTokens,
 * regardless of estimation accuracy.
 */
const enforceTokenBudget = (event: Event, evidence: Evidence, maxTokens: number): Evidence => {
  // let: result is iteratively reduced each loop pass
  let result = evidence;
  // let: promptTokens is recalculated each loop pass
  let promptTokens = estimateTokens(buildAnalysisPrompt(event, result));

  while (promptTokens > maxTokens && result.logs && result.logs.length > 1) {
    const keepCount = Math.max(1, Math.floor(result.logs.length * LOG_REDUCTION_FACTOR));
    result = { ...result, logs: result.logs.slice(0, keepCount) };
    promptTokens = estimateTokens(buildAnalysisPrompt(event, result));
  }

  return result;
};

/**
 * Manages token budget by truncating evidence if necessary.
 *
 * Strategy:
 * 1. Quick estimate to avoid unnecessary prompt building
 * 2. Only build full prompt if estimate suggests it might fit
 * 3. Truncate evidence if actual tokens exceed budget
 * 4. Safety net: verify final prompt fits and progressively reduce if not
 *
 * @param event - The incident event to analyze
 * @param evidence - Collected evidence about the incident
 * @param maxTokens - Maximum token budget for the prompt
 * @returns Evidence, truncated if necessary to fit within budget
 */
export const manageTokenBudget = (
  event: Event,
  evidence: Evidence,
  maxTokens: number
): Evidence => {
  validateTokenBudget(maxTokens);

  // Cap log entries to prevent output JSON from exceeding max completion tokens.
  // Each log entry produces ~500 chars in the LLM's JSON response; 50 entries keeps
  // the output well under the 16K completion token limit.
  const cappedEvidence =
    evidence.logs && evidence.logs.length > LLM_CONSTANTS.MAX_EVIDENCE_LOGS
      ? { ...evidence, logs: evidence.logs.slice(0, LLM_CONSTANTS.MAX_EVIDENCE_LOGS) }
      : evidence;

  const originalLogCount = evidence.logs?.length ?? 0;
  const cappedLogCount = cappedEvidence.logs?.length ?? 0;
  const templateOverhead = measureTemplateOverhead(event);
  const evidenceTokenBudget = Math.max(1, maxTokens - templateOverhead);
  const estimate = estimateTokenBudget(cappedEvidence, maxTokens);

  if (cappedLogCount < originalLogCount) {
    logger.info("Evidence logs capped for output size", {
      originalLogCount,
      cappedLogCount,
      maxEvidenceLogs: LLM_CONSTANTS.MAX_EVIDENCE_LOGS,
    });
  }

  // Early return: estimate clearly exceeds budget - truncate immediately
  if (estimate.requiresTruncation) {
    const truncated = truncateEvidence(cappedEvidence, evidenceTokenBudget);
    const verified = enforceTokenBudget(event, truncated, maxTokens);
    const verifiedLogCount = verified.logs?.length ?? 0;

    logger.warn("Evidence truncated due to token budget (estimate)", {
      originalLogCount,
      truncatedLogCount: verifiedLogCount,
      logsRemoved: originalLogCount - verifiedLogCount,
      estimatedTokens: estimate.totalEstimatedTokens,
      templateOverhead,
      maxTokens,
      evidenceTokenBudget,
    });

    return verified;
  }

  // Estimate suggests it might fit - verify with actual prompt
  const prompt = buildAnalysisPrompt(event, cappedEvidence);
  const actualTokens = estimateTokens(prompt);

  // Early return: actual tokens fit - return capped evidence
  if (actualTokens <= maxTokens) {
    logger.debug("Evidence fits within token budget", {
      logCount: cappedLogCount,
      actualTokens,
      maxTokens,
    });
    return cappedEvidence;
  }

  // Actual tokens exceed budget - truncate evidence with safety enforcement
  const truncated = truncateEvidence(cappedEvidence, evidenceTokenBudget);
  const verified = enforceTokenBudget(event, truncated, maxTokens);
  const verifiedLogCount = verified.logs?.length ?? 0;

  logger.warn("Evidence truncated due to token budget (actual)", {
    originalLogCount,
    truncatedLogCount: verifiedLogCount,
    logsRemoved: originalLogCount - verifiedLogCount,
    actualTokens,
    templateOverhead,
    maxTokens,
    evidenceTokenBudget,
  });

  return verified;
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

const estimatePRDiffChars = (prDiffContext: Evidence["prDiffContext"]): number =>
  prDiffContext
    ? prDiffContext.diff.length +
      prDiffContext.changedFiles.reduce((sum, file) => sum + file.length, 0) +
      (prDiffContext.title?.length ?? 0)
    : 0;

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
  { estimate: (evidence) => estimatePRDiffChars(evidence.prDiffContext) },
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
