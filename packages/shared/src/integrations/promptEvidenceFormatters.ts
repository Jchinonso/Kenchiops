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

// ==================== Token Estimation ====================

/** Approximate characters per token for GPT models */
const CHARS_PER_TOKEN = 4;

/**
 * Estimates token count for a string.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * Truncates evidence to fit within a token budget.
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

  // Calculate reduction ratio
  const ratio = maxTokens / currentTokens;

  // Truncate logs if they exist
  const truncatedLogs = evidence.logs
    ? evidence.logs.slice(0, Math.max(1, Math.floor(evidence.logs.length * ratio)))
    : undefined;

  return {
    ...evidence,
    logs: truncatedLogs,
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

/** Length of short SHA for display */
const SHORT_SHA_LENGTH = 7;

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
    const shortSha = commit.sha.substring(0, SHORT_SHA_LENGTH);
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

/** Percentage multiplier for similarity display */
const PERCENTAGE_MULTIPLIER = 100;

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
