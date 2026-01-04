/**
 * Prompt Formatters
 *
 * Formats various evidence types (logs, metrics, git history, etc.)
 * for inclusion in LLM prompts. Every evidence item gets a stable,
 * citeable ID for traceability.
 *
 * ID Format:
 * - Logs: [log#N]
 * - Commits: [commit#sha]
 * - Metrics: [metric#key]
 * - System State: [state#section.key]
 * - Related Events: [event#eventId]
 * - Knowledge Docs: [doc#id]
 *
 * @module integrations/promptFormatters
 */

import type {
  Evidence,
  LogEntry,
  GitCommit,
  KnowledgeDocument,
  MetricsSummary,
  SystemState,
  Event,
  RelatedEvent,
} from "../core/types.js";
import { UI_CONSTANTS } from "../constants/index.js";
import { sanitizeIdPart } from "../formatting/uiHelpers.js";

// ==================== Constants ====================

/** Maximum lines to show from a stack trace before truncation */
const MAX_STACK_TRACE_LINES = 40;

/** Separator between evidence items */
const ITEM_SEPARATOR = "-----";

/** Maximum characters for event payload before truncation */
const MAX_PAYLOAD_CHARS = 4000;

// ==================== Event Formatting ====================

/**
 * Formats event details for inclusion in the prompt.
 * Uses delimiters instead of code fences to avoid model pattern-copying.
 *
 * @param event - The event to format
 * @returns Formatted event section string
 */
export const formatEvent = (event: Event): string => {
  const rawPayload = JSON.stringify(event.payload, null, 2);
  const payload =
    rawPayload.length > MAX_PAYLOAD_CHARS
      ? `${rawPayload.slice(0, MAX_PAYLOAD_CHARS)}\n...<PAYLOAD_TRUNCATED>...`
      : rawPayload;

  return `## EVENT DETAILS
[event#1] Event ID: ${event.id}
  Type: ${event.type}
  Source: ${event.source}
  Timestamp: ${event.timestamp}
  Severity: ${event.severity || "medium"}${event.title ? `\n  Title: ${event.title}` : ""}

[event#1] Event Payload (JSON):
${payload}
`;
};

// ==================== Stack Trace Truncation ====================

/**
 * Truncates a stack trace to a reasonable size while preserving
 * the most important lines (beginning and end).
 *
 * @param stackTrace - Full stack trace string
 * @returns Truncated stack trace
 */
const truncateStackTrace = (stackTrace: string): string => {
  const lines = stackTrace.split("\n");
  if (lines.length <= MAX_STACK_TRACE_LINES) {
    return stackTrace;
  }

  // Preserve more head (20 lines) than tail (10 lines) - top of trace usually most important
  const head = lines.slice(0, 20);
  const tail = lines.slice(-10);

  return [...head, "...<STACK_TRACE_TRUNCATED>...", ...tail].join("\n");
};

// ==================== Log Formatting ====================

/**
 * Formats log entries for inclusion in LLM prompts.
 * Each log entry is prefixed with an evidence ID for traceability.
 * Stack traces are truncated to prevent prompt bloat.
 *
 * Note: Log IDs are stable within this formatted evidence output,
 * but depend on array order. For globally stable IDs, add an `id`
 * field to LogEntry and use it instead of the index.
 *
 * @param logs - Array of log entries to format
 * @returns Formatted logs string with evidence IDs
 */
export const formatLogs = (logs: LogEntry[]): string =>
  logs
    .map((log, index) => {
      // Use stable log.id if available, otherwise fall back to index
      const logId = sanitizeIdPart(log.id ?? String(index + 1));
      const evidenceId = `[log#${logId}]`;
      const timestamp = log.timestamp || "unknown time";
      const level = log.level || "INFO";
      const source = log.source || "unknown";
      const stack = log.stackTrace ? `\n${truncateStackTrace(log.stackTrace)}` : "";
      return `${evidenceId} [${timestamp}] [${level}] ${source}\n${log.message}${stack}\n${ITEM_SEPARATOR}`;
    })
    .join("\n");

// ==================== Metrics Formatting ====================

/**
 * Metric field definition for data-driven formatting.
 */
interface MetricField {
  readonly key: keyof MetricsSummary;
  readonly label: string;
  readonly suffix?: string;
}

/**
 * Standard metrics lookup table for consistent formatting.
 */
const STANDARD_METRICS: readonly MetricField[] = [
  { key: "errorRate", label: "Error Rate" },
  { key: "requestRate", label: "Request Rate", suffix: " req/s" },
  { key: "cpuUsage", label: "CPU Usage", suffix: "%" },
  { key: "memoryUsage", label: "Memory Usage", suffix: "%" },
  { key: "latencyP50", label: "Latency P50", suffix: "ms" },
  { key: "latencyP95", label: "Latency P95", suffix: "ms" },
  { key: "latencyP99", label: "Latency P99", suffix: "ms" },
] as const;

/**
 * Set of standard metric keys for efficient lookup.
 */
const STANDARD_METRIC_KEYS = new Set<string>(
  STANDARD_METRICS.map((metric) => metric.key as string)
);

/**
 * Formats metrics summary with evidence IDs for each metric.
 * Each metric line is prefixed with [metric#key] for citation.
 *
 * @param summary - Metrics summary to format
 * @returns Formatted metrics string with evidence IDs
 */
export const formatMetrics = (summary: MetricsSummary): string => {
  const standardLines = STANDARD_METRICS.filter(({ key }) => summary[key] !== undefined).map(
    ({ key, label, suffix }) =>
      `[metric#${String(key)}] ${label}: ${String(summary[key])}${suffix ?? ""}`
  );

  const customLines = Object.entries(summary)
    .filter(([key]) => !STANDARD_METRIC_KEYS.has(key))
    .map(([key, value]) => `[metric#${sanitizeIdPart(key)}] ${key}: ${String(value)}`);

  return [...standardLines, ...customLines].join("\n");
};

// ==================== Git History Formatting ====================

/**
 * Formats git commit history.
 * Each commit is prefixed with a stable evidence ID for traceability.
 *
 * @param commits - Array of git commits to format
 * @returns Formatted git history string with evidence IDs
 */
export const formatGitHistory = (commits: GitCommit[]): string =>
  commits
    .map((commit) => {
      const shortSha = commit.sha.slice(0, 12);
      const evidenceId = `[commit#${sanitizeIdPart(shortSha)}]`;
      const lines = [
        `${evidenceId} Commit: ${commit.sha}`,
        `  Author: ${commit.author}`,
        `  Date: ${commit.timestamp}`,
        `  Message: ${commit.message}`,
      ];

      if (commit.filesChanged && commit.filesChanged.length > 0) {
        lines.push(`  Files Changed: ${commit.filesChanged.join(", ")}`);
      }

      if (commit.additions !== undefined && commit.deletions !== undefined) {
        lines.push(`  +${commit.additions} -${commit.deletions}`);
      }

      if (commit.url) {
        lines.push(`  URL: ${commit.url}`);
      }

      return lines.join("\n");
    })
    .join(`\n${ITEM_SEPARATOR}\n`);

// ==================== System State Formatting ====================

/**
 * Deployment status field configuration.
 */
const DEPLOYMENT_FIELDS: ReadonlyArray<{
  readonly key: keyof NonNullable<SystemState["deploymentStatus"]>;
  readonly label: string;
}> = [
  { key: "currentVersion", label: "Current Version" },
  { key: "previousVersion", label: "Previous Version" },
  { key: "deployedAt", label: "Deployed At" },
  { key: "deployedBy", label: "Deployed By" },
];

/**
 * Formats system state information with evidence IDs.
 * Each state item is prefixed with [state#section.key] for citation.
 *
 * @param systemState - System state to format
 * @returns Formatted system state string with evidence IDs
 */
export const formatSystemState = (systemState: SystemState): string => {
  const sections: string[] = [];

  if (systemState.deploymentStatus) {
    const { deploymentStatus } = systemState;
    sections.push("**Deployment:**");
    const deploymentLines = DEPLOYMENT_FIELDS.filter(({ key }) => deploymentStatus[key]).map(
      ({ key, label }) => `[state#deployment.${key}] ${label}: ${deploymentStatus[key]}`
    );
    sections.push(...deploymentLines);
  }

  if (systemState.serviceHealth) {
    sections.push("\n**Service Health:**");
    const healthLines = Object.entries(systemState.serviceHealth).map(
      ([service, status]) =>
        `[state#serviceHealth.${sanitizeIdPart(service)}] ${service}: ${status}`
    );
    sections.push(...healthLines);
  }

  if (systemState.dependencies?.length) {
    sections.push("\n**Dependencies:**");
    const depLines = systemState.dependencies.map((dependency) => {
      const responseTime = dependency.responseTime ? ` (${dependency.responseTime}ms)` : "";
      const sanitizedName = sanitizeIdPart(dependency.name);
      return `[state#dependency.${sanitizedName}] ${dependency.name}: ${dependency.status}${responseTime}`;
    });
    sections.push(...depLines);
  }

  return sections.join("\n");
};

// ==================== Knowledge Docs Formatting ====================

/**
 * Formats knowledge base documents with evidence IDs.
 * Each document is prefixed with [doc#N] for citation.
 *
 * @param docs - Array of knowledge documents to format
 * @returns Formatted documents string with evidence IDs
 */
export const formatKnowledgeDocs = (docs: KnowledgeDocument[]): string =>
  docs
    .map((doc, index) => {
      const evidenceId = `[doc#${sanitizeIdPart(doc.id || String(index + 1))}]`;
      const similarity = (doc.similarity * UI_CONSTANTS.PERCENTAGE_MULTIPLIER).toFixed(0);
      const lines = [
        `${evidenceId} [${doc.type}] ${doc.title} (Similarity: ${similarity}%)`,
        doc.excerpt,
        doc.url && `  URL: ${doc.url}`,
        doc.metadata?.tags?.length && `  Tags: ${doc.metadata.tags.join(", ")}`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join(`\n${ITEM_SEPARATOR}\n`);

// ==================== Related Events Formatting ====================

/**
 * Formats related events with evidence IDs.
 * Each event is prefixed with [event#eventId] for citation.
 *
 * @param events - Array of related events to format
 * @returns Formatted related events string with evidence IDs
 */
export const formatRelatedEvents = (events: RelatedEvent[]): string =>
  events
    .map((event) => {
      const evidenceId = `[event#${sanitizeIdPart(event.eventId)}]`;
      const lines = [
        `${evidenceId} Event ID: ${event.eventId}`,
        `  Type: ${event.type}`,
        `  Timestamp: ${event.timestamp}`,
        `  Correlation: ${event.correlation}`,
      ];
      return lines.join("\n");
    })
    .join(`\n${ITEM_SEPARATOR}\n`);

// ==================== Evidence Formatting ====================

/**
 * Evidence section configuration for data-driven formatting.
 */
interface EvidenceSectionConfig {
  readonly title: string;
  readonly emptyMessage: string;
  readonly hasData: (evidence: Evidence) => boolean;
  readonly format: (evidence: Evidence) => string;
}

/**
 * Evidence sections configuration - enables easy addition/removal of sections.
 */
const EVIDENCE_SECTIONS: readonly EvidenceSectionConfig[] = [
  {
    title: "### Error Logs",
    emptyMessage: "No error logs available.",
    hasData: (evidence) => Boolean(evidence.logs?.length),
    format: (evidence) => formatLogs(evidence.logs ?? []),
  },
  {
    title: "### System Metrics (at time of event)",
    emptyMessage: "No metrics available.",
    hasData: (evidence) => Boolean(evidence.metrics?.summary),
    format: (evidence) => {
      const summary = evidence.metrics?.summary;
      return summary ? formatMetrics(summary) : "";
    },
  },
  {
    title: "### Recent Git History",
    emptyMessage: "No recent commits available.",
    hasData: (evidence) => Boolean(evidence.gitHistory?.length),
    format: (evidence) => formatGitHistory(evidence.gitHistory ?? []),
  },
  {
    title: "### System State",
    emptyMessage: "No system state available.",
    hasData: (evidence) => Boolean(evidence.systemState),
    format: (evidence) => {
      const { systemState } = evidence;
      return systemState ? formatSystemState(systemState) : "";
    },
  },
  {
    title: "### Related Events",
    emptyMessage: "No related events available.",
    hasData: (evidence) => Boolean(evidence.relatedEvents?.length),
    format: (evidence) => formatRelatedEvents(evidence.relatedEvents ?? []),
  },
  {
    title: "### Related Knowledge Base Documents",
    emptyMessage: "No related documents found in knowledge base.",
    hasData: (evidence) => Boolean(evidence.relatedDocs?.length),
    format: (evidence) => formatKnowledgeDocs(evidence.relatedDocs ?? []),
  },
];

/**
 * Formats all evidence sections for inclusion in the prompt.
 * Uses data-driven configuration with functional patterns.
 *
 * @param evidence - Evidence to format
 * @returns Formatted evidence section string
 */
export const formatEvidence = (evidence: Evidence): string => {
  const evidenceSections = EVIDENCE_SECTIONS.flatMap((config) => {
    if (config.hasData(evidence)) {
      return [config.title, config.format(evidence)];
    }
    return config.emptyMessage ? [`${config.title}\n${config.emptyMessage}`] : [];
  });

  return ["## COLLECTED EVIDENCE", ...evidenceSections].join("\n\n");
};
