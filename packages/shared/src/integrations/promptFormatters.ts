/**
 * Prompt Formatters
 *
 * Formats various evidence types (logs, metrics, git history, etc.)
 * for inclusion in LLM prompts.
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
} from "../core/types.js";
import { UI_CONSTANTS } from "../constants/index.js";

// ==================== Event Formatting ====================

/**
 * Formats event details for inclusion in the prompt.
 *
 * @param event - The event to format
 * @returns Formatted event section string
 */
export const formatEvent = (event: Event): string => {
  const payload = JSON.stringify(event.payload, null, 2);

  return `## EVENT DETAILS
**Event ID**: ${event.id}
**Type**: ${event.type}
**Source**: ${event.source}
**Timestamp**: ${event.timestamp}
**Severity**: ${event.severity || "medium"}
${event.title ? `\n**Title**: ${event.title}` : ""}

**Event Payload**:
\`\`\`json
${payload}
\`\`\``;
};

// ==================== Log Formatting ====================

/**
 * Formats log entries for inclusion in LLM prompts.
 *
 * @param logs - Array of log entries to format
 * @returns Formatted logs string
 */
export const formatLogs = (logs: LogEntry[]): string =>
  logs
    .map((log) => {
      const timestamp = log.timestamp || "unknown time";
      const level = log.level || "INFO";
      const source = log.source || "unknown";
      const stack = log.stackTrace ? `\n${log.stackTrace}` : "";
      return `[${timestamp}] [${level}] ${source}\n${log.message}${stack}\n---`;
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
 * Formats metrics summary using data-driven approach with functional patterns.
 *
 * @param summary - Metrics summary to format
 * @returns Formatted metrics string
 */
export const formatMetrics = (summary: MetricsSummary): string => {
  const standardLines = STANDARD_METRICS.filter(({ key }) => summary[key] !== undefined).map(
    ({ key, label, suffix }) => `- ${label}: ${summary[key]}${suffix ?? ""}`
  );

  const customLines = Object.entries(summary)
    .filter(([key]) => !STANDARD_METRIC_KEYS.has(key))
    .map(([key, value]) => `- ${key}: ${value}`);

  return [...standardLines, ...customLines].join("\n");
};

// ==================== Git History Formatting ====================

/**
 * Formats git commit history.
 *
 * @param commits - Array of git commits to format
 * @returns Formatted git history string
 */
export const formatGitHistory = (commits: GitCommit[]): string =>
  commits
    .map((commit) => {
      const lines = [
        `- Commit: ${commit.sha}`,
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
    .join("\n\n");

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
 * Formats system state information using data-driven approach with functional patterns.
 *
 * @param systemState - System state to format
 * @returns Formatted system state string
 */
export const formatSystemState = (systemState: SystemState): string => {
  const sections: string[] = [];

  if (systemState.deploymentStatus) {
    const { deploymentStatus } = systemState;
    const deploymentLines = DEPLOYMENT_FIELDS.filter(({ key }) => deploymentStatus[key]).map(
      ({ key, label }) => `- ${label}: ${deploymentStatus[key]}`
    );
    sections.push("**Deployment**:", ...deploymentLines);
  }

  if (systemState.serviceHealth) {
    const healthLines = Object.entries(systemState.serviceHealth).map(
      ([service, status]) => `- ${service}: ${status}`
    );
    sections.push("\n**Service Health**:", ...healthLines);
  }

  if (systemState.dependencies?.length) {
    const depLines = systemState.dependencies.map((dependency) => {
      const responseTime = dependency.responseTime ? ` (${dependency.responseTime}ms)` : "";
      return `- ${dependency.name}: ${dependency.status}${responseTime}`;
    });
    sections.push("\n**Dependencies**:", ...depLines);
  }

  return sections.join("\n");
};

// ==================== Knowledge Docs Formatting ====================

/**
 * Formats knowledge base documents using functional array composition.
 *
 * @param docs - Array of knowledge documents to format
 * @returns Formatted documents string
 */
export const formatKnowledgeDocs = (docs: KnowledgeDocument[]): string =>
  docs
    .map((doc) => {
      const similarity = (doc.similarity * UI_CONSTANTS.PERCENTAGE_MULTIPLIER).toFixed(0);
      const lines = [
        `**[${doc.type}] ${doc.title}** (Similarity: ${similarity}%)`,
        doc.excerpt,
        doc.url && `Full document: ${doc.url}`,
        doc.metadata?.tags?.length && `Tags: ${doc.metadata.tags.join(", ")}`,
        "---",
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n");

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
    emptyMessage: "",
    hasData: (evidence) => Boolean(evidence.systemState),
    format: (evidence) => {
      const { systemState } = evidence;
      return systemState ? formatSystemState(systemState) : "";
    },
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
