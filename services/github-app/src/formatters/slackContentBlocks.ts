/**
 * Slack Content Block Builders
 *
 * Builds individual content blocks for Slack messages.
 * Extracted from slackPayloadFormatter for maintainability.
 */

import {
  UI_EMOJI,
  UI_CONSTANTS,
  DEPENDENCY_EMOJI_MAP,
  FORMATTER_DISPLAY_LIMITS,
  type AnalyzedFailure,
  type RecommendedAction,
  type LLMDetectedDependencyChange,
  type LLMDetectedBuildConfigChange,
  type RelatedKnowledgeDoc,
  type SuggestedFix,
} from "@kenchi/shared";
import { DISPLAY_LIMITS, getPriorityEmoji } from "./formatterUtils.js";

// ==================== Types ====================

export interface SlackTextBlock {
  readonly type: "section" | "header" | "divider" | "context";
  readonly text?: {
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
    readonly emoji?: boolean;
  };
  readonly fields?: ReadonlyArray<{
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
  }>;
  readonly elements?: ReadonlyArray<{
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
  }>;
  readonly accessory?: SlackButtonElement;
}

export interface SlackButtonElement {
  readonly type: "button";
  readonly text: {
    readonly type: "plain_text";
    readonly text: string;
    readonly emoji: boolean;
  };
  readonly style?: "primary" | "danger";
  readonly value: string;
  readonly action_id: string;
}

export interface SlackActionsBlock {
  readonly type: "actions";
  readonly block_id?: string;
  readonly elements: readonly SlackButtonElement[];
}

export type SlackBlock = SlackTextBlock | SlackActionsBlock;

export interface ConsolidatedTestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
}

/**
 * RAG feedback button value payload.
 * Serialized as JSON in button value for feedback recording.
 */
export interface RAGFeedbackButtonValue {
  readonly analysisId: string;
  readonly knowledgeDocId: string;
  readonly similarity: number;
  readonly rank: number;
}

export interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly suggestedFix?: SuggestedFix;
}

// ==================== Test Failures Block ====================

/**
 * Build consolidated test failures block
 */
export const buildTestFailuresBlock = (
  testFailures: readonly ConsolidatedTestFailure[]
): SlackTextBlock | null => {
  if (testFailures.length === 0) {
    return null;
  }

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const testLines = testFailures
    .slice(0, displayCount)
    .map((testFailure) => {
      const filePath = testFailure.file
        ? testFailure.line
          ? `${testFailure.file}:${testFailure.line}`
          : testFailure.file
        : null;
      return `   ${UI_EMOJI.list} \`${testFailure.testName}\`${filePath ? ` (${filePath})` : ""}`;
    })
    .join("\n");

  const moreText =
    testFailures.length > displayCount
      ? `\n   _...and ${testFailures.length - displayCount} more_`
      : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.test} *Failed Tests (${testFailures.length}):*\n${testLines}${moreText}`,
      },
    ],
  };
};

// ==================== Annotations Block ====================

/**
 * Format a single annotation line with optional fix indicator
 */
const formatAnnotationLine = (annotation: ConsolidatedAnnotation): string => {
  const baseLine = `   ${UI_EMOJI.list} \`${annotation.path}:${annotation.line}\` — ${annotation.message}`;

  // Add fix indicator if a high-confidence fix is available
  if (
    annotation.suggestedFix &&
    annotation.suggestedFix.confidence >= FORMATTER_DISPLAY_LIMITS.MIN_FIX_CONFIDENCE
  ) {
    return `${baseLine}\n      ${UI_EMOJI.tools} _Fix available: ${annotation.suggestedFix.description}_`;
  }

  return baseLine;
};

/**
 * Build consolidated affected files block
 */
export const buildAnnotationsBlock = (
  annotations: readonly ConsolidatedAnnotation[]
): SlackTextBlock | null => {
  if (annotations.length === 0) {
    return null;
  }

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = annotations.slice(0, displayCount).map(formatAnnotationLine).join("\n");

  const moreText =
    annotations.length > displayCount
      ? `\n   _...and ${annotations.length - displayCount} more_`
      : "";

  return {
    type: "context",
    elements: [
      { type: "mrkdwn", text: `${UI_EMOJI.location} *Affected Files:*\n${lines}${moreText}` },
    ],
  };
};

// ==================== Check Names Block ====================

/**
 * Build check names list block
 */
export const buildCheckNamesBlock = (failures: readonly AnalyzedFailure[]): SlackTextBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: `*Checks:* ${failures.map((failure) => `\`${failure.checkName}\``).join(", ")}`,
  },
});

// ==================== Root Cause Block ====================

/**
 * Build root cause analysis block
 * Always returns a block - provides fallback message if no causes identified
 */
export const buildRootCauseBlock = (
  causes: readonly string[],
  hasTestFailures: boolean = false,
  hasAnnotations: boolean = false
): SlackTextBlock => {
  // If no causes identified, provide context-appropriate fallback message
  if (causes.length === 0) {
    const fallbackMessage = hasTestFailures
      ? "Test failures detected. See details below."
      : hasAnnotations
        ? "CI check failed. See error locations below."
        : "CI check failed. Unable to determine specific root cause from available logs.";

    return {
      type: "section",
      text: { type: "mrkdwn", text: `*${UI_EMOJI.search} Root Cause:*\n${fallbackMessage}` },
    };
  }

  const causeText =
    causes.length === 1
      ? causes[0]
      : causes.map((cause, causeIndex) => `${causeIndex + 1}. ${cause}`).join("\n");

  return {
    type: "section",
    text: { type: "mrkdwn", text: `*${UI_EMOJI.search} Root Cause:*\n${causeText}` },
  };
};

// ==================== Dependency Changes Block ====================

/**
 * Build dependency changes block
 */
export const buildDependencyChangesBlock = (
  deps: readonly LLMDetectedDependencyChange[]
): SlackTextBlock | null => {
  if (deps.length === 0) {
    return null;
  }

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = deps
    .slice(0, displayCount)
    .map((dep) => {
      const emoji = DEPENDENCY_EMOJI_MAP[dep.type] ?? UI_EMOJI.package;
      const version =
        dep.oldVersion && dep.newVersion
          ? ` (${dep.oldVersion} -> ${dep.newVersion})`
          : dep.newVersion
            ? ` (${dep.newVersion})`
            : "";
      const ecosystem = dep.ecosystem ? ` [${dep.ecosystem}]` : "";
      return `   ${UI_EMOJI.list} ${emoji} \`${dep.name}\`${version}${ecosystem}`;
    })
    .join("\n");

  const moreText =
    deps.length > displayCount ? `\n   _...and ${deps.length - displayCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.depUpdated} *Dependency Changes (${deps.length}):*\n${lines}${moreText}`,
      },
    ],
  };
};

// ==================== Build Config Changes Block ====================

/**
 * Get change type emoji using UI_EMOJI constants
 */
const getChangeTypeEmoji = (changeType: string): string => {
  const changeTypeEmojiMap: Record<string, string> = {
    added: UI_EMOJI.depAdded,
    deleted: UI_EMOJI.depRemoved,
    modified: UI_EMOJI.commit,
  };
  return changeTypeEmojiMap[changeType] ?? UI_EMOJI.commit;
};

/**
 * Build build config changes block
 */
export const buildConfigChangesBlock = (
  configs: readonly LLMDetectedBuildConfigChange[]
): SlackTextBlock | null => {
  if (configs.length === 0) {
    return null;
  }

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = configs
    .slice(0, displayCount)
    .map((configChange) => {
      const emoji = getChangeTypeEmoji(configChange.changeType);
      return `   ${UI_EMOJI.list} ${emoji} \`${configChange.file}\` — ${configChange.summary}`;
    })
    .join("\n");

  const moreText =
    configs.length > displayCount ? `\n   _...and ${configs.length - displayCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.workflow} *Build Config Changes (${configs.length}):*\n${lines}${moreText}`,
      },
    ],
  };
};

// ==================== Related Knowledge Block ====================

/**
 * Get emoji for knowledge document type
 */
const getKnowledgeTypeEmoji = (docType: string): string => {
  const typeEmojiMap: Record<string, string> = {
    runbook: UI_EMOJI.book,
    past_incident: UI_EMOJI.history,
    documentation: UI_EMOJI.book,
    best_practice: UI_EMOJI.success,
    playbook: UI_EMOJI.tools,
    postmortem: UI_EMOJI.history,
    troubleshooting: UI_EMOJI.search,
    sop: UI_EMOJI.book,
  };
  return typeEmojiMap[docType] ?? UI_EMOJI.book;
};

/**
 * Build related knowledge documents block
 */
export const buildRelatedKnowledgeBlock = (
  docs: readonly RelatedKnowledgeDoc[]
): SlackTextBlock | null => {
  if (docs.length === 0) {
    return null;
  }

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = docs
    .slice(0, displayCount)
    .map((doc) => {
      const emoji = getKnowledgeTypeEmoji(doc.type);
      const similarity = Math.round(doc.similarity * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);
      const link = doc.url ? `<${doc.url}|${doc.title}>` : doc.title;
      return `   ${UI_EMOJI.list} ${emoji} ${link} _(${similarity}% match)_`;
    })
    .join("\n");

  const moreText =
    docs.length > displayCount ? `\n   _...and ${docs.length - displayCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.book} *Related Knowledge (${docs.length}):*\n${lines}${moreText}`,
      },
    ],
  };
};

/**
 * Build RAG feedback buttons block for knowledge documents.
 * Allows users to rate whether retrieved knowledge was helpful.
 */
export const buildRAGFeedbackButtonsBlock = (
  docs: readonly RelatedKnowledgeDoc[],
  analysisId: string
): SlackActionsBlock | null => {
  if (docs.length === 0) {
    return null;
  }

  // Create feedback value with first doc info (most relevant)
  const topDoc = docs[0];
  const feedbackValue: RAGFeedbackButtonValue = {
    analysisId,
    knowledgeDocId: topDoc.id,
    similarity: topDoc.similarity,
    rank: 1,
  };

  const valueString = JSON.stringify(feedbackValue);

  return {
    type: "actions",
    block_id: "rag_feedback_block",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: `${UI_EMOJI.thumbsUp} Helpful`, emoji: true },
        style: "primary",
        value: valueString,
        action_id: "rag_feedback_helpful",
      },
      {
        type: "button",
        text: { type: "plain_text", text: `${UI_EMOJI.thumbsDown} Not Helpful`, emoji: true },
        value: valueString,
        action_id: "rag_feedback_not_helpful",
      },
    ],
  };
};

// ==================== Analysis Feedback Block ====================

/**
 * Analysis feedback button value payload.
 * Simple string analysisId for main analysis feedback.
 */
export interface AnalysisFeedbackButtonValue {
  readonly analysisId: string;
}

/**
 * Build analysis feedback buttons block.
 * Always displayed to allow users to mark the analysis as helpful/not helpful.
 * This enables passive learning even before any RAG documents exist.
 */
export const buildAnalysisFeedbackButtonsBlock = (analysisId: string): SlackActionsBlock => ({
  type: "actions",
  block_id: "analysis_feedback_block",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: `${UI_EMOJI.thumbsUp} Helpful`, emoji: true },
      style: "primary",
      value: analysisId,
      action_id: "feedback_helpful",
    },
    {
      type: "button",
      text: { type: "plain_text", text: `${UI_EMOJI.thumbsDown} Not Helpful`, emoji: true },
      value: analysisId,
      action_id: "feedback_not_helpful",
    },
  ],
});

// ==================== Actions Summary Block ====================

/**
 * Build recommended actions summary blocks
 */
export const buildActionsSummaryBlocks = (
  actions: readonly RecommendedAction[]
): SlackTextBlock[] => {
  if (actions.length === 0) {
    return [];
  }

  const actionText = actions
    .slice(0, DISPLAY_LIMITS.slackMaxChecks)
    .map(
      (action, actionIndex) =>
        `${actionIndex + 1}. ${getPriorityEmoji(action.priority)} ${action.description}`
    )
    .join("\n");

  return [
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*${UI_EMOJI.tools} Recommended Actions*` } },
    { type: "section", text: { type: "mrkdwn", text: actionText } },
  ];
};
