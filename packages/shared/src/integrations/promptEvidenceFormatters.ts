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
  const formatted = formatEvidence(evidence);
  const currentTokens = estimateTokens(formatted);

  if (currentTokens <= maxTokens) {
    return evidence;
  }

  if (!evidence.logs || evidence.logs.length === 0) {
    return evidence;
  }

  // Step 1: Separate test_failure logs from others
  const testFailureLogs = evidence.logs.filter(isTestFailureLog);
  const otherLogs = evidence.logs.filter((log) => !isTestFailureLog(log));

  // Step 2: Truncate snippets in all logs to reduce size
  const truncatedTestFailures = testFailureLogs.map((log) =>
    truncateLogMessage(log, MAX_SNIPPET_LENGTH_TRUNCATED)
  );
  const truncatedOthers = otherLogs.map((log) =>
    truncateLogMessage(log, MAX_SNIPPET_LENGTH_TRUNCATED)
  );

  // Step 3: Try with truncated logs (all test failures + all others)
  let candidateLogs = [...truncatedTestFailures, ...truncatedOthers];
  let candidateEvidence = { ...evidence, logs: candidateLogs };
  let candidateTokens = estimateTokens(formatEvidence(candidateEvidence));

  if (candidateTokens <= maxTokens) {
    return candidateEvidence;
  }

  // Step 4: Start removing non-test-failure logs
  // Keep reducing other logs until we fit or run out
  const ratio = maxTokens / candidateTokens;
  const otherLogsToKeep = Math.max(0, Math.floor(truncatedOthers.length * ratio));

  candidateLogs = [...truncatedTestFailures, ...truncatedOthers.slice(0, otherLogsToKeep)];
  candidateEvidence = { ...evidence, logs: candidateLogs };
  candidateTokens = estimateTokens(formatEvidence(candidateEvidence));

  if (candidateTokens <= maxTokens) {
    return candidateEvidence;
  }

  // Step 5: If still over budget, keep only test failures (remove all others)
  candidateLogs = truncatedTestFailures;
  candidateEvidence = { ...evidence, logs: candidateLogs };
  candidateTokens = estimateTokens(formatEvidence(candidateEvidence));

  if (candidateTokens <= maxTokens) {
    return candidateEvidence;
  }

  // Step 6: If STILL over budget, we have to reduce test failures too
  // Keep as many as possible within budget
  const testRatio = maxTokens / candidateTokens;
  const testFailuresToKeep = Math.max(1, Math.floor(truncatedTestFailures.length * testRatio));

  return {
    ...evidence,
    logs: truncatedTestFailures.slice(0, testFailuresToKeep),
  };
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
