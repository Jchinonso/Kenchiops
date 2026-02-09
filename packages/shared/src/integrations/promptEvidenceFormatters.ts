/**
 * Evidence Formatters for Analysis Prompts
 *
 * Provides formatting utilities for logs, metrics, git history,
 * events, and other evidence types for inclusion in LLM prompts.
 *
 * @module integrations/promptEvidenceFormatters
 */

import type {
  Event,
  Evidence,
  LogEntry,
  Metrics,
  GitCommit,
  RelatedEvent,
  KnowledgeDocument,
} from "../core/types.js";
import {
  ARTIFACT_TYPES,
  CHARS_PER_TOKEN,
  MAX_SNIPPET_LENGTH_TRUNCATED,
  SHORT_COMMIT_SHA_LENGTH,
  PERCENTAGE_MULTIPLIER,
} from "../constants/index.js";

/**
 * Estimates token count for a string.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * Checks if a log entry represents a test_failure artifact.
 * Looks for the [test_failure] marker in the message.
 */
const isTestFailureLog = (log: LogEntry): boolean =>
  log.message.includes(`[${ARTIFACT_TYPES.TEST_FAILURE}]`);

/**
 * Truncates a log entry's message/snippet if too long.
 */
const truncateLogMessage = (log: LogEntry, maxLength: number): LogEntry => {
  if (log.message.length <= maxLength) {
    return log;
  }

  // Find where the snippet starts and truncate only the snippet portion
  const snippetStart = log.message.indexOf("Snippet:\n");
  if (snippetStart === -1) {
    // No snippet, truncate the whole message
    return {
      ...log,
      message: `${log.message.slice(0, maxLength)}...<TRUNCATED>`,
    };
  }

  // Keep the header, truncate the snippet
  const header = log.message.slice(0, snippetStart + "Snippet:\n".length);
  const snippet = log.message.slice(snippetStart + "Snippet:\n".length);
  const remainingBudget = maxLength - header.length;

  if (remainingBudget <= 0) {
    return {
      ...log,
      message: `${header}...<TRUNCATED>`,
    };
  }

  return {
    ...log,
    message: `${header}${snippet.slice(0, remainingBudget)}...<TRUNCATED>`,
  };
};

/**
 * Separates logs into test failures and others, truncating each.
 * Uses a single pass to avoid nested iteration.
 */
const separateAndTruncateLogs = (
  logs: readonly LogEntry[]
): { readonly testFailures: readonly LogEntry[]; readonly others: readonly LogEntry[] } =>
  logs.reduce<{ testFailures: LogEntry[]; others: LogEntry[] }>(
    (acc, log) => {
      const truncated = truncateLogMessage(log, MAX_SNIPPET_LENGTH_TRUNCATED);
      if (isTestFailureLog(log)) {
        acc.testFailures.push(truncated);
      } else {
        acc.others.push(truncated);
      }
      return acc;
    },
    { testFailures: [], others: [] }
  );

/**
 * Checks if candidate logs fit within the token budget.
 * Returns the evidence if it fits, or null if over budget.
 */
const tryFitLogs = (
  evidence: Evidence,
  logs: readonly LogEntry[],
  maxTokens: number
): Evidence | null => {
  const candidate = { ...evidence, logs: [...logs] };
  const tokens = estimateTokens(formatEvidence(candidate));
  return tokens <= maxTokens ? candidate : null;
};

/**
 * Reduces other logs proportionally to fit within the token budget.
 */
const reduceOtherLogs = (
  evidence: Evidence,
  testFailures: readonly LogEntry[],
  others: readonly LogEntry[],
  maxTokens: number
): Evidence | null => {
  const allLogs = [...testFailures, ...others];
  const allTokens = estimateTokens(formatEvidence({ ...evidence, logs: allLogs }));
  const ratio = maxTokens / allTokens;
  const otherLogsToKeep = Math.max(0, Math.floor(others.length * ratio));
  return tryFitLogs(evidence, [...testFailures, ...others.slice(0, otherLogsToKeep)], maxTokens);
};

/**
 * Truncates evidence to fit within a token budget.
 * Prioritizes keeping test_failure artifacts over other log types.
 *
 * Truncation strategy:
 * 1. First, try keeping all logs but truncating individual snippets
 * 2. If still over budget, remove non-test-failure logs first
 * 3. Only remove test_failure logs as a last resort
 *
 * @param evidence - Evidence to truncate
 * @param maxTokens - Maximum token budget
 * @returns Truncated evidence
 */
export const truncateEvidence = (evidence: Evidence, maxTokens: number): Evidence => {
  if (estimateTokens(formatEvidence(evidence)) <= maxTokens) {
    return evidence;
  }

  if (!evidence.logs || evidence.logs.length === 0) {
    return evidence;
  }

  const { testFailures, others } = separateAndTruncateLogs(evidence.logs);

  // Try with all truncated logs
  const allTruncated = tryFitLogs(evidence, [...testFailures, ...others], maxTokens);
  if (allTruncated) {
    return allTruncated;
  }

  // Reduce non-test-failure logs proportionally
  const reduced = reduceOtherLogs(evidence, testFailures, others, maxTokens);
  if (reduced) {
    return reduced;
  }

  // Keep only test failures
  const testOnly = tryFitLogs(evidence, testFailures, maxTokens);
  if (testOnly) {
    return testOnly;
  }

  // Last resort: reduce test failures proportionally
  const testOnlyTokens = estimateTokens(formatEvidence({ ...evidence, logs: [...testFailures] }));
  const testRatio = maxTokens / testOnlyTokens;
  const testFailuresToKeep = Math.max(1, Math.floor(testFailures.length * testRatio));

  return { ...evidence, logs: testFailures.slice(0, testFailuresToKeep) };
};

// ==================== Log Formatter ====================

/**
 * Formats log entries for the prompt.
 *
 * @param logs - Log entries to format
 * @returns Formatted log string
 */
export const formatLogs = (logs: readonly LogEntry[]): string => {
  if (logs.length === 0) {
    return "";
  }

  const formattedEntries = logs.map((logEntry, index) => {
    const id = logEntry.id ?? index + 1;
    const level = logEntry.level ?? "INFO";
    const source = logEntry.source ? ` [${logEntry.source}]` : "";
    const timestamp = logEntry.timestamp ? ` ${logEntry.timestamp}` : "";
    const stack = logEntry.stackTrace ? `\n${logEntry.stackTrace}` : "";

    return `[log#${id}] ${level}${source}${timestamp}: ${logEntry.message}${stack}`;
  });

  return `### Logs\n${formattedEntries.join("\n")}`;
};

// ==================== Metrics Formatter ====================

/**
 * Formats metrics for the prompt.
 *
 * @param metrics - Metrics to format
 * @returns Formatted metrics string
 */
export const formatMetrics = (metrics: Metrics): string => {
  const timeRangeLine = metrics.timeRange
    ? [`Time Range: ${metrics.timeRange.start} to ${metrics.timeRange.end}`]
    : [];

  const summaryEntries = metrics.summary
    ? Object.entries(metrics.summary)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `[metric#${key}] ${key}: ${value}`)
    : [];

  const timeSeriesEntries =
    metrics.timeSeries && metrics.timeSeries.length > 0
      ? metrics.timeSeries.map((series) => {
          const values = series.values
            .slice(-5)
            .map((dataPoint) => dataPoint.value)
            .join(", ");
          return `[metric#${series.metricName}] ${series.metricName}: ${values}${series.unit ? ` ${series.unit}` : ""}`;
        })
      : [];

  const lines = [...timeRangeLine, ...summaryEntries, ...timeSeriesEntries];

  return lines.length > 0 ? `### Metrics\n${lines.join("\n")}` : "";
};

// ==================== Git History Formatter ====================

/**
 * Formats git history for the prompt.
 *
 * @param commits - Git commits to format
 * @returns Formatted git history string
 */
export const formatGitHistory = (commits: readonly GitCommit[]): string => {
  if (commits.length === 0) {
    return "";
  }

  const formattedCommits = commits.map((commit) => {
    const shortSha = commit.sha.substring(0, SHORT_COMMIT_SHA_LENGTH);
    const files = commit.filesChanged ? ` (${commit.filesChanged.length} files)` : "";
    return `[commit#${shortSha}] ${commit.author} - ${commit.message}${files}`;
  });

  return `### Git History\n${formattedCommits.join("\n")}`;
};

// ==================== Related Events Formatter ====================

/**
 * Formats related events for the prompt.
 *
 * @param events - Related events to format
 * @returns Formatted related events string
 */
export const formatRelatedEvents = (events: readonly RelatedEvent[]): string => {
  if (events.length === 0) {
    return "";
  }

  const formattedEvents = events.map(
    (relatedEvent) =>
      `[event#${relatedEvent.eventId}] ${relatedEvent.type} (${relatedEvent.correlation}) at ${relatedEvent.timestamp}`
  );

  return `### Related Events\n${formattedEvents.join("\n")}`;
};

// ==================== Knowledge Docs Formatter ====================

/**
 * Formats knowledge documents for the prompt.
 *
 * @param docs - Knowledge documents to format
 * @returns Formatted knowledge docs string
 */
export const formatKnowledgeDocs = (docs: readonly KnowledgeDocument[]): string => {
  if (docs.length === 0) {
    return "";
  }

  const formattedDocs = docs.map((doc) => {
    const excerpt = doc.excerpt ? `\n  ${doc.excerpt}` : "";
    return `[doc#${doc.id}] ${doc.title} (${doc.type}, similarity: ${(doc.similarity * PERCENTAGE_MULTIPLIER).toFixed(0)}%)${excerpt}`;
  });

  return `### Knowledge Base\n${formattedDocs.join("\n")}`;
};

// ==================== Event Formatter ====================

/**
 * Formats an event for inclusion in the analysis prompt.
 *
 * @param event - Event to format
 * @returns Formatted event string
 */
export const formatEvent = (event: Event): string => {
  const baseLines = [
    `### Event Details`,
    `- **ID**: ${event.id}`,
    `- **Type**: ${event.type}`,
    `- **Source**: ${event.source}`,
    `- **Timestamp**: ${event.timestamp}`,
  ];

  const optionalLines = [
    event.severity ? `- **Severity**: ${event.severity}` : null,
    event.title ? `- **Title**: ${event.title}` : null,
  ].filter((line): line is string => line !== null);

  const payloadLines = Object.entries(event.payload)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `- **${key}**: ${String(value)}`);

  const payloadSection = payloadLines.length > 0 ? ["", "### Payload", ...payloadLines] : [];

  const lines = [...baseLines, ...optionalLines, ...payloadSection];

  return lines.join("\n");
};

// ==================== Evidence Formatter ====================

/**
 * Formats evidence for inclusion in the analysis prompt.
 *
 * @param evidence - Evidence to format
 * @returns Formatted evidence string
 */
export const formatEvidence = (evidence: Evidence): string => {
  const sections = [
    evidence.logs && evidence.logs.length > 0 ? formatLogs(evidence.logs) : null,
    evidence.metrics ? formatMetrics(evidence.metrics) || null : null,
    evidence.gitHistory && evidence.gitHistory.length > 0
      ? formatGitHistory(evidence.gitHistory)
      : null,
    evidence.relatedEvents && evidence.relatedEvents.length > 0
      ? formatRelatedEvents(evidence.relatedEvents)
      : null,
    evidence.relatedDocs && evidence.relatedDocs.length > 0
      ? formatKnowledgeDocs(evidence.relatedDocs)
      : null,
  ].filter((section): section is string => section !== null);

  return sections.length > 0 ? sections.join("\n\n") : "No evidence available.";
};

// ==================== Test Framework Hint ====================

/**
 * Builds a test framework hint section if framework was detected.
 * Provides the LLM with specific guidance on parsing assertions.
 *
 * @param evidence - Evidence containing optional test framework info
 * @returns Framework hint section or empty string
 */
export const buildTestFrameworkHint = (evidence: Evidence): string => {
  if (!evidence.testFramework) {
    return "";
  }

  const { name, language, assertionHint } = evidence.testFramework;

  return `## DETECTED TEST FRAMEWORK

The logs indicate this is a **${name}** test suite (${language}).

**Assertion parsing hint:** ${assertionHint}

Use this hint to correctly identify expected vs actual values in test failures. This takes precedence over the generic rules when parsing ${name} output.

---

`;
};
