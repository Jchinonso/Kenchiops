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
import {
  formatLogs,
  formatGitHistory,
  formatKnowledgeDocs,
  formatRelatedEvents,
} from "./promptFormatters.js";

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

/** Number of context lines to preserve before the first error */
const PRE_ERROR_CONTEXT_LINES = 3;

/**
 * Safely parses a timestamp to milliseconds.
 *
 * @param timestamp - Timestamp string to parse
 * @returns Milliseconds since epoch, or 0 if invalid
 */
const parseTimestamp = (timestamp?: string): number => {
  const parsed = timestamp ? new Date(timestamp).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Sorts logs chronologically (oldest first) to ensure earliest causal errors are preserved.
 *
 * @param logs - Log entries to sort
 * @returns Logs sorted by timestamp, oldest first
 */
const sortLogsChronologically = (
  logs: NonNullable<Evidence["logs"]>
): NonNullable<Evidence["logs"]> =>
  [...logs].sort((logA, logB) => {
    const timeA = parseTimestamp(logA.timestamp);
    const timeB = parseTimestamp(logB.timestamp);
    return timeA - timeB;
  });

/**
 * Sorts commits by timestamp (newest first) to prioritize recent changes.
 *
 * @param commits - Git commits to sort
 * @returns Commits sorted by timestamp, newest first
 */
const sortCommitsByTimestamp = (
  commits: NonNullable<Evidence["gitHistory"]>
): NonNullable<Evidence["gitHistory"]> =>
  [...commits].sort((commitA, commitB) => {
    const timeA = parseTimestamp(commitA.timestamp);
    const timeB = parseTimestamp(commitB.timestamp);
    return timeB - timeA;
  });

/**
 * Sorts related events chronologically (oldest first) to preserve timeline.
 *
 * @param events - Related events to sort
 * @returns Related events sorted by timestamp, oldest first
 */
const sortEventsChronologically = (
  events: NonNullable<Evidence["relatedEvents"]>
): NonNullable<Evidence["relatedEvents"]> =>
  [...events].sort((eventA, eventB) => {
    const timeA = parseTimestamp(eventA.timestamp);
    const timeB = parseTimestamp(eventB.timestamp);
    return timeA - timeB;
  });

/**
 * Extracts priority logs: errors + context before first error.
 * This ensures the "earliest causal error" and its context are preserved.
 *
 * @param logs - Chronologically sorted log entries
 * @returns Priority logs with context
 */
const extractPriorityLogs = (
  logs: NonNullable<Evidence["logs"]>
): NonNullable<Evidence["logs"]> => {
  const firstErrorIndex = logs.findIndex((log) => log.level === "ERROR");

  if (firstErrorIndex === -1) {
    // No errors - return last N logs as context
    return logs.slice(-EVIDENCE_TRUNCATION.MAX_ERROR_LOGS);
  }

  // Include context before first error + all errors
  const contextStart = Math.max(0, firstErrorIndex - PRE_ERROR_CONTEXT_LINES);
  const contextLogs = logs.slice(contextStart, firstErrorIndex);
  const errorLogs = logs.filter((log) => log.level === "ERROR");

  // Combine context + errors, limit total
  const combined = [...contextLogs, ...errorLogs];
  return combined.slice(0, EVIDENCE_TRUNCATION.MAX_ERROR_LOGS + PRE_ERROR_CONTEXT_LINES);
};

/**
 * Truncates error logs to fit within remaining token budget.
 * Preserves chronological order and context before first error.
 *
 * @param logs - Log entries to truncate
 * @param remainingTokens - Available token budget
 * @returns Truncated logs and remaining tokens
 */
const truncateErrorLogs = (
  logs: NonNullable<Evidence["logs"]>,
  remainingTokens: number
): { logs: NonNullable<Evidence["logs"]>; remainingTokens: number } => {
  // Sort oldest-first to preserve earliest causal errors
  const sortedLogs = sortLogsChronologically(logs);

  // Extract priority logs: context + errors
  const priorityLogs = extractPriorityLogs(sortedLogs);

  const logSection = formatLogs(priorityLogs);
  const logTokens = estimateTokens(logSection);

  if (logTokens <= remainingTokens) {
    return { logs: priorityLogs, remainingTokens: remainingTokens - logTokens };
  }

  // If priority logs don't fit, take as many as possible (still oldest-first)
  const result = takeWhileTokenBudget(priorityLogs, remainingTokens, (log) =>
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

  const recentCommits = sortCommitsByTimestamp(commits).slice(
    0,
    EVIDENCE_TRUNCATION.MAX_RECENT_COMMITS
  );
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
 * Truncates related events to fit within remaining token budget.
 *
 * @param events - Related events to truncate
 * @param remainingTokens - Available token budget
 * @returns Truncated events and remaining tokens
 */
const truncateRelatedEvents = (
  events: NonNullable<Evidence["relatedEvents"]>,
  remainingTokens: number
): { events: NonNullable<Evidence["relatedEvents"]> | undefined; remainingTokens: number } => {
  if (remainingTokens <= EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_RELATED_EVENTS) {
    return { events: undefined, remainingTokens };
  }

  const sortedEvents = sortEventsChronologically(events);
  const eventSection = formatRelatedEvents(sortedEvents);
  const eventTokens = estimateTokens(eventSection);

  if (eventTokens <= remainingTokens) {
    return { events: sortedEvents, remainingTokens: remainingTokens - eventTokens };
  }

  const result = takeWhileTokenBudget(sortedEvents, remainingTokens, (event) =>
    estimateTokens(formatRelatedEvents([event]))
  );

  return {
    events: result.items.length > 0 ? [...result.items] : undefined,
    remainingTokens: result.remainingBudget,
  };
};

/**
 * Adds additional non-error logs if token budget allows.
 * Preserves chronological order and avoids duplicates.
 *
 * @param allLogs - All original logs
 * @param currentLogs - Currently truncated logs
 * @param remainingTokens - Available token budget
 * @returns Combined logs with additional entries, sorted chronologically
 */
const addAdditionalLogs = (
  allLogs: NonNullable<Evidence["logs"]>,
  currentLogs: NonNullable<Evidence["logs"]> | undefined,
  remainingTokens: number
): NonNullable<Evidence["logs"]> | undefined => {
  if (remainingTokens <= EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_ADDITIONAL_LOGS) {
    return currentLogs;
  }

  // Build set of already-included log messages to avoid duplicates
  const includedMessages = new Set(
    (currentLogs ?? []).map((log) => `${log.timestamp}:${log.message}`)
  );

  // Sort all logs chronologically, filter to non-errors not already included
  const sortedLogs = sortLogsChronologically(allLogs);
  const additionalLogs = sortedLogs
    .filter(
      (log) => log.level !== "ERROR" && !includedMessages.has(`${log.timestamp}:${log.message}`)
    )
    .slice(0, EVIDENCE_TRUNCATION.MAX_ADDITIONAL_LOGS);

  const result = takeWhileTokenBudget(additionalLogs, remainingTokens, (log) =>
    estimateTokens(formatLogs([log]))
  );

  if (result.items.length === 0) {
    return currentLogs;
  }

  // Merge and re-sort to maintain chronological order
  const baseLogs = currentLogs ?? [];
  const merged = [...baseLogs, ...result.items];
  return sortLogsChronologically(merged);
};

/**
 * Truncates evidence to fit within token budget while prioritizing important information.
 * Processes evidence in priority order: error logs, git history, related docs, related events,
 * additional logs.
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
    relatedEvents: undefined,
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

  // Priority 4: Related events (timeline context)
  if (evidence.relatedEvents) {
    const eventResult = truncateRelatedEvents(evidence.relatedEvents, remainingTokens);
    truncated.relatedEvents = eventResult.events;
    remainingTokens = eventResult.remainingTokens;
  }

  // Always include metrics (small size)
  truncated.metrics = evidence.metrics;

  // Priority 5: Additional non-error logs if space permits
  if (evidence.logs) {
    truncated.logs = addAdditionalLogs(evidence.logs, truncated.logs, remainingTokens);
  }

  // Always include system state (small size)
  truncated.systemState = evidence.systemState;

  return truncated;
};
