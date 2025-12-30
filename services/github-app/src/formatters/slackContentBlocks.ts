/**
 * Slack Content Block Builders
 *
 * Builds individual content blocks for Slack messages.
 * Extracted from slackPayloadFormatter for maintainability.
 */

import type {
  AnalyzedFailure,
  RecommendedAction,
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
} from "@kenchi/shared";
import { UI_EMOJI, DEPENDENCY_EMOJI_MAP } from "@kenchi/shared";
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

export interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
}

// ==================== Test Failures Block ====================

/**
 * Build consolidated test failures block
 */
export const buildTestFailuresBlock = (
  testFailures: readonly ConsolidatedTestFailure[]
): SlackTextBlock | null => {
  if (testFailures.length === 0) return null;

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
 * Build consolidated affected files block
 */
export const buildAnnotationsBlock = (
  annotations: readonly ConsolidatedAnnotation[]
): SlackTextBlock | null => {
  if (annotations.length === 0) return null;

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = annotations
    .slice(0, displayCount)
    .map(
      (annotation) =>
        `   ${UI_EMOJI.list} \`${annotation.path}:${annotation.line}\` — ${annotation.message}`
    )
    .join("\n");

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
  if (deps.length === 0) return null;

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
  if (configs.length === 0) return null;

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

// ==================== Actions Summary Block ====================

/**
 * Build recommended actions summary blocks
 */
export const buildActionsSummaryBlocks = (
  actions: readonly RecommendedAction[]
): SlackTextBlock[] => {
  if (actions.length === 0) return [];

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
