/**
 * Postmortem Generator
 *
 * Builds a structured postmortem draft from an incident alert and its triage result.
 * Uses AI summary data when available, with fallbacks to alert metadata.
 *
 * @module services/postmortemGenerator
 */

import type { PostmortemContent, PostmortemActionItem } from "@kenchi/shared";

// ==================== Types ====================

interface AlertData {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly severity: string;
  readonly status: string;
  readonly source: string;
  readonly serviceName: string | null;
  readonly environment: string | null;
  readonly receivedAt: Date;
}

interface AiSummary {
  readonly headline?: string;
  readonly rootCauseSummary?: string;
  readonly impactAssessment?: string;
  readonly suggestedActions?: readonly string[];
}

interface TriageData {
  readonly aiSummary: Readonly<Record<string, unknown>> | null;
  readonly severityLabel: string | null;
  readonly evidenceCatalog: Readonly<Record<string, unknown>>;
  readonly pipelineDurationMs: number | null;
  readonly createdAt: unknown;
}

interface GeneratePostmortemInput {
  readonly alert: AlertData;
  readonly triageResult: TriageData | null;
}

interface GeneratedPostmortem {
  readonly title: string;
  readonly content: PostmortemContent;
}

// ==================== Helpers ====================

/** Safely extract AiSummary fields from the untyped JSONB record. */
const parseAiSummary = (raw: Readonly<Record<string, unknown>> | null): AiSummary | null => {
  if (!raw) {
    return null;
  }
  return {
    headline: typeof raw.headline === "string" ? raw.headline : undefined,
    rootCauseSummary: typeof raw.rootCauseSummary === "string" ? raw.rootCauseSummary : undefined,
    impactAssessment: typeof raw.impactAssessment === "string" ? raw.impactAssessment : undefined,
    suggestedActions: Array.isArray(raw.suggestedActions)
      ? raw.suggestedActions.filter((item): item is string => typeof item === "string")
      : undefined,
  };
};

/** Build a timeline narrative from timestamps. */
const buildTimeline = (alert: AlertData, triageResult: TriageData | null): string => {
  const lines: readonly string[] = [
    `- Alert received at ${new Date(alert.receivedAt).toISOString()} from ${alert.source}`,
    ...(triageResult?.createdAt
      ? [`- Triage completed at ${new Date(triageResult.createdAt as string).toISOString()}`]
      : []),
    ...(triageResult?.pipelineDurationMs !== null && triageResult?.pipelineDurationMs !== undefined
      ? [`- Triage pipeline took ${triageResult.pipelineDurationMs}ms`]
      : []),
    ...(alert.status === "resolved" ? [`- Incident resolved (status: ${alert.status})`] : []),
  ];
  return lines.join("\n");
};

/** Convert suggested actions to structured action items. */
const buildActionItems = (
  suggestedActions: readonly string[] | undefined
): readonly PostmortemActionItem[] =>
  suggestedActions
    ? suggestedActions.map((action) => ({
        action,
        owner: "",
        dueDate: null,
        status: "pending",
      }))
    : [];

/** Build a lessons learned section from evidence and resolution patterns. */
const buildLessonsLearned = (alert: AlertData, triageResult: TriageData | null): string => {
  const parts: readonly string[] = [
    `Source: ${alert.source}`,
    ...(alert.serviceName ? [`Affected service: ${alert.serviceName}`] : []),
    ...(alert.environment ? [`Environment: ${alert.environment}`] : []),
    ...(triageResult?.severityLabel ? [`Triage severity: ${triageResult.severityLabel}`] : []),
  ];
  return parts.length > 0
    ? `Key observations:\n${parts.map((part) => `- ${part}`).join("\n")}`
    : "";
};

// ==================== Public API ====================

/**
 * Generates a structured postmortem draft from an alert and its triage result.
 *
 * @param input - The alert and optional triage result data
 * @returns A generated postmortem with title and structured content
 */
export const generatePostmortemDraft = (input: GeneratePostmortemInput): GeneratedPostmortem => {
  const { alert, triageResult } = input;
  const aiSummary = triageResult ? parseAiSummary(triageResult.aiSummary) : null;

  const title = `Postmortem: ${aiSummary?.headline ?? alert.title}`;

  const summary = aiSummary?.headline
    ? `${aiSummary.headline}\n\n${aiSummary.rootCauseSummary ?? alert.description ?? ""}`
    : (alert.description ?? alert.title);

  const rootCause =
    aiSummary?.rootCauseSummary ??
    "Root cause analysis pending. Please review available evidence and update.";

  const impact =
    aiSummary?.impactAssessment ?? `Severity: ${alert.severity}. Impact assessment pending.`;

  const content: PostmortemContent = {
    summary,
    timeline: buildTimeline(alert, triageResult),
    rootCause,
    impact,
    actionItems: buildActionItems(aiSummary?.suggestedActions),
    lessonsLearned: buildLessonsLearned(alert, triageResult),
    additionalNotes: "",
  };

  return { title, content };
};
