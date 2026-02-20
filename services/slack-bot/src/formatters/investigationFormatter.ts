/**
 * Investigation Formatter
 *
 * Pure formatting functions that convert investigation domain objects
 * into Slack Block Kit blocks for the `/kenchi investigate` command.
 *
 * @module formatters/investigationFormatter
 */

import { truncateText, type InvestigationRecord } from "@kenchi/shared";
import type { SlackBlock } from "../types/slackTypes.js";
import {
  INVESTIGATION_FORMATTER_CONFIG,
  type InvestigationDiagnosisShape,
  type InvestigationActionShape,
  type InvestigationEvidenceShape,
} from "./investigationFormatterTypes.js";

// ==================== Block Helpers ====================

const createSection = (text: string): SlackBlock => ({
  type: "section",
  text: { type: "mrkdwn", text },
});

const createHeader = (text: string): SlackBlock => ({
  type: "header",
  text: { type: "plain_text", text, emoji: true },
});

const createContext = (text: string): SlackBlock => ({
  type: "context",
  elements: [{ type: "mrkdwn", text }],
});

const createDivider = (): SlackBlock => ({ type: "divider" });

const createFieldsBlock = (fields: readonly string[]): SlackBlock => ({
  type: "section",
  fields: fields.map((text) => ({ type: "mrkdwn" as const, text })),
});

// ==================== Internal Helpers ====================

/**
 * Returns a confidence emoji based on the numeric confidence score.
 */
const getConfidenceEmoji = (confidence: number): string => {
  if (confidence > INVESTIGATION_FORMATTER_CONFIG.HIGH_CONFIDENCE_THRESHOLD) {
    return ":large_green_circle:";
  }
  return confidence >= INVESTIGATION_FORMATTER_CONFIG.MEDIUM_CONFIDENCE_THRESHOLD
    ? ":large_yellow_circle:"
    : ":red_circle:";
};

/**
 * Returns a priority emoji for a suggested action.
 */
const getPriorityEmoji = (priority: string): string => {
  if (priority === "immediate") {
    return ":red_circle:";
  }
  return priority === "short_term" ? ":large_yellow_circle:" : ":large_green_circle:";
};

/**
 * Safely extracts the diagnosis shape from a generic record.
 */
const extractDiagnosis = (raw: Readonly<Record<string, unknown>>): InvestigationDiagnosisShape =>
  raw as unknown as InvestigationDiagnosisShape;

/**
 * Safely extracts evidence items from the generic array.
 */
const extractEvidenceItems = (raw: readonly unknown[]): readonly InvestigationEvidenceShape[] =>
  raw as unknown as readonly InvestigationEvidenceShape[];

/**
 * Formats suggested actions into a numbered markdown list.
 */
const formatActionsText = (actions: readonly InvestigationActionShape[]): string =>
  actions
    .map(
      (actionItem, index) =>
        `${index + 1}. ${getPriorityEmoji(actionItem.priority)} ${actionItem.action}`
    )
    .join("\n");

/**
 * Formats confidence as a rounded percentage string.
 */
const formatConfidencePercent = (confidence: number): string =>
  (confidence * INVESTIGATION_FORMATTER_CONFIG.PERCENTAGE_MULTIPLIER).toFixed(0);

// ==================== Public API ====================

/**
 * Builds Slack blocks for the "investigation started" ephemeral message.
 */
export const formatInvestigationStartedBlocks = (
  investigationId: string,
  description: string
): readonly SlackBlock[] => [
  createSection(
    `:mag: *Starting investigation...*\nAnalyzing: _${truncateText(description, INVESTIGATION_FORMATTER_CONFIG.DESCRIPTION_MAX_LENGTH)}_`
  ),
  createContext(`Investigation ID: \`${investigationId}\` | Gathering evidence...`),
];

/**
 * Builds Slack blocks for a completed investigation result message.
 */
export const formatInvestigationResultBlocks = (
  investigation: InvestigationRecord
): readonly SlackBlock[] => {
  const diagnosis = extractDiagnosis(investigation.diagnosis);
  const headline = diagnosis.summary ?? investigation.description;
  const confidence = diagnosis.confidence ?? 0;
  const diagnosisSource = diagnosis.diagnosisSource ?? "unknown";

  const blocks: SlackBlock[] = [
    createHeader(":mag: Investigation Complete"),
    createDivider(),
    createSection(
      `*${truncateText(headline, INVESTIGATION_FORMATTER_CONFIG.ROOT_CAUSE_MAX_LENGTH)}*`
    ),
    createFieldsBlock([
      `*Service:* ${investigation.serviceName ?? "_unknown_"}`,
      `*Environment:* ${investigation.environment ?? "_unknown_"}`,
      `*Symptom:* ${investigation.symptom ?? "_unknown_"}`,
      `*Confidence:* ${getConfidenceEmoji(confidence)} ${formatConfidencePercent(confidence)}%`,
    ]),
    createDivider(),
  ];

  // Root cause section
  if (diagnosis.rootCauseHypothesis) {
    blocks.push(
      createSection(
        `*Root Cause*\n${truncateText(diagnosis.rootCauseHypothesis, INVESTIGATION_FORMATTER_CONFIG.ROOT_CAUSE_MAX_LENGTH)}`
      )
    );
  }

  // Suggested actions section
  const actions = diagnosis.suggestedActions ?? [];
  if (actions.length > 0) {
    blocks.push(createSection(`*Suggested Actions*\n${formatActionsText(actions)}`));
  }

  // Evidence section
  const evidenceItems = extractEvidenceItems(investigation.evidence);
  if (evidenceItems.length > 0) {
    const topItems = evidenceItems.slice(
      0,
      INVESTIGATION_FORMATTER_CONFIG.MAX_EVIDENCE_ITEMS_SHOWN
    );
    const itemsList = topItems.map((item) => `- ${item.title ?? "Untitled evidence"}`).join("\n");
    blocks.push(createSection(`*Evidence (${evidenceItems.length} items)*\n${itemsList}`));
  }

  // Footer
  blocks.push(createDivider());
  blocks.push(
    createContext(
      `Investigation \`${investigation.id}\` | ` +
        `Duration: ${investigation.durationMs ?? "?"}ms | ` +
        `Confidence: ${formatConfidencePercent(confidence)}% | ` +
        `Source: ${diagnosisSource}`
    )
  );

  return blocks;
};

/**
 * Builds Slack blocks for a failed investigation.
 */
export const formatInvestigationErrorBlocks = (
  investigationId: string,
  errorMessage: string
): readonly SlackBlock[] => [
  createSection(
    `:x: *Investigation Failed*\n${truncateText(errorMessage, INVESTIGATION_FORMATTER_CONFIG.ERROR_MESSAGE_MAX_LENGTH)}`
  ),
  createContext(`Investigation ID: \`${investigationId}\``),
];

/**
 * Builds Slack blocks when investigation times out (still running).
 */
export const formatInvestigationTimeoutBlocks = (
  investigationId: string
): readonly SlackBlock[] => [
  createSection(
    ":hourglass: *Investigation in progress*\nYour investigation is still running. Check the dashboard for results."
  ),
  createContext(`Investigation ID: \`${investigationId}\``),
];
