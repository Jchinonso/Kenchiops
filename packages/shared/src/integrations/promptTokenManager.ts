/**
 * Prompt Token Manager
 *
 * Handles token estimation and evidence truncation for LLM prompts.
 * Ensures prompts fit within token budgets while preserving important information.
 *
 * @module integrations/promptTokenManager
 */

import type { Evidence } from "../core/types.js";
import {
  SIMILARITY_THRESHOLDS,
  EVIDENCE_TRUNCATION,
  OPENAI_CONSTANTS,
} from "../constants/index.js";
import { formatLogs, formatGitHistory, formatKnowledgeDocs } from "./promptFormatters.js";

// ==================== Token Estimation ====================

/**
 * Estimates token count for text (rough approximation).
 * Uses ~4 characters per token as a general estimate.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / OPENAI_CONSTANTS.CHARS_PER_TOKEN_ESTIMATE);

// ==================== Token Budget Utilities ====================

/**
 * Result of taking items within a token budget.
 */
interface TokenBudgetResult<T> {
  readonly items: readonly T[];
  readonly remainingBudget: number;
}

/**
 * Takes items from array while they fit within token budget.
 * Uses reduce for single-pass processing.
 *
 * @param items - Items to process
 * @param tokenBudget - Available token budget
 * @param getTokens - Function to estimate tokens for an item
 * @returns Items that fit and remaining budget
 */
const takeWhileTokenBudget = <T>(
  items: readonly T[],
  tokenBudget: number,
  getTokens: (item: T) => number
): TokenBudgetResult<T> =>
  items.reduce<TokenBudgetResult<T>>(
    (accumulator, item) => {
      const tokens = getTokens(item);
      if (accumulator.remainingBudget >= tokens) {
        return {
          items: [...accumulator.items, item],
          remainingBudget: accumulator.remainingBudget - tokens,
        };
      }
      return accumulator;
    },
    { items: [], remainingBudget: tokenBudget }
  );

// ==================== Evidence Truncation ====================

/**
 * Truncates error logs to fit within remaining token budget.
 *
 * @param logs - Log entries to truncate
 * @param remainingTokens - Available token budget
 * @returns Truncated logs and remaining tokens
 */
const truncateErrorLogs = (
  logs: NonNullable<Evidence["logs"]>,
  remainingTokens: number
): { logs: NonNullable<Evidence["logs"]>; remainingTokens: number } => {
  const errorLogs = logs
    .filter((log) => log.level === "ERROR")
    .slice(0, EVIDENCE_TRUNCATION.MAX_ERROR_LOGS);

  const logSection = formatLogs(errorLogs);
  const logTokens = estimateTokens(logSection);

  if (logTokens <= remainingTokens) {
    return { logs: errorLogs, remainingTokens: remainingTokens - logTokens };
  }

  const result = takeWhileTokenBudget(errorLogs, remainingTokens, (log) =>
    estimateTokens(formatLogs([log]))
  );

  return { logs: [...result.items], remainingTokens: result.remainingBudget };
};

/**
 * Truncates git history to fit within remaining token budget.
 *
 * @param commits - Git commits to truncate
 * @param remainingTokens - Available token budget
 * @returns Truncated commits and remaining tokens
 */
const truncateGitHistory = (
  commits: NonNullable<Evidence["gitHistory"]>,
  remainingTokens: number
): { commits: NonNullable<Evidence["gitHistory"]> | undefined; remainingTokens: number } => {
  if (remainingTokens <= EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_COMMITS) {
    return { commits: undefined, remainingTokens };
  }

  const recentCommits = commits.slice(0, EVIDENCE_TRUNCATION.MAX_RECENT_COMMITS);
  const commitSection = formatGitHistory(recentCommits);
  const commitTokens = estimateTokens(commitSection);

  if (commitTokens <= remainingTokens) {
    return { commits: recentCommits, remainingTokens: remainingTokens - commitTokens };
  }

  return { commits: undefined, remainingTokens };
};

/**
 * Truncates related documents to fit within remaining token budget.
 *
 * @param docs - Knowledge documents to truncate
 * @param remainingTokens - Available token budget
 * @returns Truncated documents and remaining tokens
 */
const truncateRelatedDocs = (
  docs: NonNullable<Evidence["relatedDocs"]>,
  remainingTokens: number
): { docs: NonNullable<Evidence["relatedDocs"]> | undefined; remainingTokens: number } => {
  if (remainingTokens <= EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_DOCS) {
    return { docs: undefined, remainingTokens };
  }

  const topDocs = docs
    .filter((doc) => doc.similarity > SIMILARITY_THRESHOLDS.MINIMUM_FOR_FILTERING)
    .slice(0, EVIDENCE_TRUNCATION.MAX_HIGH_SIMILARITY_DOCS);

  const docSection = formatKnowledgeDocs(topDocs);
  const docTokens = estimateTokens(docSection);

  if (docTokens <= remainingTokens) {
    return { docs: topDocs, remainingTokens: remainingTokens - docTokens };
  }

  return { docs: undefined, remainingTokens };
};

/**
 * Adds additional non-error logs if token budget allows.
 *
 * @param allLogs - All original logs
 * @param currentLogs - Currently truncated logs
 * @param remainingTokens - Available token budget
 * @returns Combined logs with additional entries
 */
const addAdditionalLogs = (
  allLogs: NonNullable<Evidence["logs"]>,
  currentLogs: NonNullable<Evidence["logs"]> | undefined,
  remainingTokens: number
): NonNullable<Evidence["logs"]> | undefined => {
  if (remainingTokens <= EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_COMMITS) {
    return currentLogs;
  }

  const additionalLogs = allLogs
    .filter((log) => log.level !== "ERROR")
    .slice(0, EVIDENCE_TRUNCATION.MAX_ADDITIONAL_LOGS);

  const result = takeWhileTokenBudget(additionalLogs, remainingTokens, (log) =>
    estimateTokens(formatLogs([log]))
  );

  const baseLogs = currentLogs || [];
  return result.items.length > 0 ? [...baseLogs, ...result.items] : currentLogs;
};

/**
 * Truncates evidence to fit within token budget while prioritizing important information.
 * Processes evidence in priority order: error logs, git history, related docs, additional logs.
 *
 * @param evidence - Evidence to truncate
 * @param maxTokens - Maximum allowed tokens
 * @returns Truncated evidence that fits within budget
 */
export const truncateEvidence = (evidence: Evidence, maxTokens: number): Evidence => {
  const truncated: Evidence = {
    ...evidence,
    logs: undefined,
    gitHistory: undefined,
    relatedDocs: undefined,
  };

  let remainingTokens = maxTokens;

  // Priority 1: Error logs (most important)
  if (evidence.logs) {
    const logResult = truncateErrorLogs(evidence.logs, remainingTokens);
    truncated.logs = logResult.logs;
    remainingTokens = logResult.remainingTokens;
  }

  // Priority 2: Git history (context for changes)
  if (evidence.gitHistory) {
    const commitResult = truncateGitHistory(evidence.gitHistory, remainingTokens);
    truncated.gitHistory = commitResult.commits;
    remainingTokens = commitResult.remainingTokens;
  }

  // Priority 3: Related documents (knowledge base)
  if (evidence.relatedDocs) {
    const docResult = truncateRelatedDocs(evidence.relatedDocs, remainingTokens);
    truncated.relatedDocs = docResult.docs;
    remainingTokens = docResult.remainingTokens;
  }

  // Always include metrics (small size)
  truncated.metrics = evidence.metrics;

  // Priority 4: Additional non-error logs if space permits
  if (evidence.logs) {
    truncated.logs = addAdditionalLogs(evidence.logs, truncated.logs, remainingTokens);
  }

  // Always include system state and related events (small size)
  truncated.systemState = evidence.systemState;
  truncated.relatedEvents = evidence.relatedEvents;

  return truncated;
};
