/**
 * Slack Block Kit Formatter
 *
 * Pure function that formats triage results into Slack Block Kit messages.
 * Deterministic sections (severity, signals, scores) are visually separated
 * from AI-generated summary content.
 *
 * No I/O -- all inputs provided as arguments.
 *
 * @module formatters/slackFormatter
 */

import type { SlackFormatterInput, MatchedRule } from "../types/policyTypes.js";
import type { AlertSeverity } from "../types/incidentTypes.js";

// ==================== Severity Emoji Mapping ====================

const SEVERITY_EMOJI: Readonly<Record<AlertSeverity, string>> = {
  critical: ":rotating_light:",
  high: ":warning:",
  medium: ":large_yellow_circle:",
  low: ":large_blue_circle:",
  info: ":information_source:",
} as const;

const severityEmoji = (label: AlertSeverity): string => SEVERITY_EMOJI[label] ?? ":grey_question:";

// ==================== Block Builders ====================

/**
 * Header block with severity emoji and headline.
 */
const buildHeaderBlock = (
  headline: string,
  severityLabel: AlertSeverity
): Record<string, unknown> => ({
  type: "header",
  text: {
    type: "plain_text",
    text: `${severityEmoji(severityLabel)} ${headline}`,
    emoji: true,
  },
});

/**
 * Divider block.
 */
const dividerBlock = (): Record<string, unknown> => ({
  type: "divider",
});

/**
 * Deterministic metadata section: severity, environment, service.
 */
const buildMetadataSection = (input: SlackFormatterInput): Record<string, unknown> => ({
  type: "section",
  fields: [
    {
      type: "mrkdwn",
      text: `*Severity:* ${input.severityLabel.toUpperCase()} (score: ${String(input.severityScore)})`,
    },
    {
      type: "mrkdwn",
      text: `*Environment:* ${input.environment ?? "Unknown"}`,
    },
    {
      type: "mrkdwn",
      text: `*Service:* ${input.serviceName ?? "Unknown"}`,
    },
    {
      type: "mrkdwn",
      text: `*Alert ID:* \`${input.alertId}\``,
    },
  ],
});

/**
 * Deterministic scores section: confidence and completeness.
 */
const buildScoresSection = (input: SlackFormatterInput): Record<string, unknown> => ({
  type: "section",
  fields: [
    {
      type: "mrkdwn",
      text: `*Confidence:* ${String(Math.round(input.confidence * 100))}%`,
    },
    {
      type: "mrkdwn",
      text: `*Completeness:* ${String(Math.round(input.completeness * 100))}%`,
    },
  ],
});

/**
 * AI summary section with visual distinction marker.
 */
const buildSummarySection = (
  rootCauseSummary: string,
  impactAssessment: string,
  summarySource: "ai" | "fallback"
): ReadonlyArray<Record<string, unknown>> => {
  const sourceLabel =
    summarySource === "ai" ? ":robot_face: AI Summary" : ":clipboard: Template Summary";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${sourceLabel}*`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Root Cause:*\n${rootCauseSummary}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Impact:*\n${impactAssessment}`,
      },
    },
  ];
};

/**
 * Routing context block showing which rules matched.
 */
const buildRoutingContext = (matchedRules: readonly MatchedRule[]): Record<string, unknown> => ({
  type: "context",
  elements: [
    {
      type: "mrkdwn",
      text: `Routed by: ${matchedRules.map(({ ruleName }) => ruleName).join(", ")}`,
    },
  ],
});

// ==================== Public API ====================

/**
 * Formats a triage result into Slack Block Kit blocks.
 *
 * This is a pure function: deterministic, no side effects, no I/O.
 *
 * The output visually distinguishes:
 * - Deterministic sections (severity, metadata, scores)
 * - AI/template-generated sections (summary, impact, root cause)
 * - Routing context (which policy rules matched)
 *
 * @param input - The triage result data to format
 * @returns Array of Slack Block Kit block objects
 */
export const formatSlackBlocks = (
  input: SlackFormatterInput
): ReadonlyArray<Record<string, unknown>> => [
  buildHeaderBlock(input.headline, input.severityLabel),
  dividerBlock(),
  buildMetadataSection(input),
  buildScoresSection(input),
  dividerBlock(),
  ...buildSummarySection(input.rootCauseSummary, input.impactAssessment, input.summarySource),
  dividerBlock(),
  buildRoutingContext(input.matchedRules),
];
