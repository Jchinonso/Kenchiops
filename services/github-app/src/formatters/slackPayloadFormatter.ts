/**
 * Slack Payload Formatter
 *
 * Formats aggregated CI failures into Slack Block Kit payloads.
 * Creates visually rich messages with failure details, annotations,
 * and recommended actions with interactive approve/reject buttons.
 */

import type { AggregatedFailures, AnalyzedFailure, RecommendedAction } from "@kenchi/shared";
import {
  DISPLAY_LIMITS,
  getPriorityEmoji,
  calculateAverageConfidence,
  mergeRecommendedActions,
  getConfidenceEmoji,
} from "./formatterUtils.js";

// ==================== Types ====================

/**
 * Slack Block Kit text block types
 */
interface SlackTextBlock {
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

/**
 * Slack Block Kit button element
 */
interface SlackButtonElement {
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

/**
 * Slack Block Kit actions block for interactive buttons
 */
interface SlackActionsBlock {
  readonly type: "actions";
  readonly block_id?: string;
  readonly elements: readonly SlackButtonElement[];
}

/**
 * Combined block type for all Slack blocks
 */
type SlackBlock = SlackTextBlock | SlackActionsBlock;

/**
 * Return type for buildConsolidatedSlackPayload
 */
export interface ConsolidatedSlackPayload {
  readonly blocks: readonly SlackBlock[];
  readonly text: string;
  readonly metadata: {
    readonly repository: string;
    readonly commitSha: string;
    readonly failureCount: number;
    readonly checkNames: readonly string[];
    readonly avgConfidence: number;
    readonly isConsolidated: boolean;
  };
}

/**
 * Action button value payload for JSON encoding
 */
interface ActionButtonValue {
  readonly actionId: string;
  readonly actionType: string;
  readonly description: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly installationId: number;
  readonly priority: string | number;
  readonly checkRunId?: number;
}

// ==================== Constants ====================

/**
 * Maximum actions to show buttons for
 */
const MAX_ACTION_BUTTONS = 3;

/**
 * Action types that can be auto-executed (safe actions)
 */
const EXECUTABLE_ACTION_TYPES = new Set([
  "rerun_pipeline",
  "notify_team",
  "post_comment",
  "manual_investigation",
  "run_diagnostic",
]);

// ==================== Helper Functions ====================

/**
 * Consolidated test failure with source check info
 */
interface ConsolidatedTestFailure {
  readonly testName: string;
  readonly file?: string;
}

/**
 * Consolidated annotation with source check info
 */
interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
}

/**
 * Consolidate test failures across all checks, deduplicating by testName
 */
const consolidateTestFailures = (
  failures: readonly AnalyzedFailure[]
): ConsolidatedTestFailure[] => {
  const seen = new Set<string>();
  return failures
    .flatMap((f) => f.testFailures ?? [])
    .filter((tf) => {
      const key = `${tf.testName}|${tf.file ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/**
 * Consolidate annotations across all checks, deduplicating by path:line
 */
const consolidateAnnotations = (failures: readonly AnalyzedFailure[]): ConsolidatedAnnotation[] => {
  const seen = new Set<string>();
  return failures
    .flatMap((f) => f.annotations)
    .filter((a) => {
      const key = `${a.path}:${a.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((a) => ({ path: a.path, line: a.line, message: a.message }));
};

/**
 * Generate a unique action ID from commit sha and index
 */
const generateActionId = (commitSha: string, index: number): string =>
  `act_${commitSha.substring(0, 8)}_${index}`;

/**
 * Create action button value payload
 */
const createActionButtonValue = (
  action: RecommendedAction,
  actionId: string,
  aggregation: AggregatedFailures,
  checkRunId?: number
): ActionButtonValue => ({
  actionId,
  actionType: action.actionType ?? "manual_investigation",
  description: action.description,
  repository: aggregation.repository.fullName,
  commitSha: aggregation.commitSha,
  installationId: aggregation.installationId,
  priority: action.priority,
  checkRunId,
});

/**
 * Convert snake_case to Title Case for display
 */
const toTitleCase = (snakeCase: string): string =>
  snakeCase
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

/**
 * Create execute buttons block for all actions
 */
const createExecuteButtonsBlock = (
  actions: readonly RecommendedAction[],
  aggregation: AggregatedFailures,
  checkRunId?: number
): SlackActionsBlock => {
  const executeButtons = actions.map((action, index) => {
    const actionId = generateActionId(aggregation.commitSha, index);
    const buttonValue = JSON.stringify(
      createActionButtonValue(action, actionId, aggregation, checkRunId)
    );
    const buttonLabel = toTitleCase(action.actionType ?? "Action");

    return {
      type: "button" as const,
      text: { type: "plain_text" as const, text: buttonLabel, emoji: true },
      style: "primary" as const,
      value: buttonValue,
      action_id: `approve_action_${actionId}`,
    };
  });

  return {
    type: "actions",
    block_id: "execute_actions_block",
    elements: executeButtons,
  };
};

/**
 * Build action blocks with clean layout.
 * Shows action descriptions, then grouped Execute buttons at the bottom.
 * Deduplicates by actionType to avoid showing multiple similar buttons.
 */
const buildActionBlocks = (
  actions: readonly RecommendedAction[],
  aggregation: AggregatedFailures
): SlackBlock[] => {
  // Filter to executable actions, deduplicate by actionType, and limit count
  const seenTypes = new Set<string>();
  const executableActions = actions
    .filter((a) => {
      const actionType = a.actionType ?? "";
      if (!EXECUTABLE_ACTION_TYPES.has(actionType) || seenTypes.has(actionType)) {
        return false;
      }
      seenTypes.add(actionType);
      return true;
    })
    .slice(0, MAX_ACTION_BUTTONS);

  if (executableActions.length === 0) {
    return [];
  }

  // Get checkRunId from first failure (for rerun actions)
  const primaryCheckRunId = aggregation.failures[0]?.checkRunId;

  const blocks: SlackBlock[] = [
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*🎯 Quick Actions*" },
    },
  ];

  // Add action descriptions
  executableActions.forEach((action) => {
    const priorityEmoji = getPriorityEmoji(action.priority);
    const actionLabel = toTitleCase(action.actionType ?? "Action");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${priorityEmoji} *${actionLabel}*: ${action.description}`,
      },
    });
  });

  // Add grouped execute buttons at the bottom
  blocks.push(createExecuteButtonsBlock(executableActions, aggregation, primaryCheckRunId));

  return blocks;
};

/**
 * Build consolidated test failures block
 */
const buildConsolidatedTestFailuresBlock = (
  testFailures: ConsolidatedTestFailure[]
): SlackTextBlock | null => {
  if (testFailures.length === 0) return null;

  const testLines = testFailures
    .slice(0, DISPLAY_LIMITS.slackAnnotationsPerCheck)
    .map((t) => `   • \`${t.testName}\`${t.file ? ` (${t.file})` : ""}`)
    .join("\n");

  const moreTests =
    testFailures.length > DISPLAY_LIMITS.slackAnnotationsPerCheck
      ? `\n   _...and ${testFailures.length - DISPLAY_LIMITS.slackAnnotationsPerCheck} more_`
      : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `🧪 *Failed Tests (${testFailures.length}):*\n${testLines}${moreTests}`,
      },
    ],
  };
};

/**
 * Build consolidated affected files block
 */
const buildConsolidatedAnnotationsBlock = (
  annotations: ConsolidatedAnnotation[]
): SlackTextBlock | null => {
  if (annotations.length === 0) return null;

  const annotationLines = annotations
    .slice(0, DISPLAY_LIMITS.slackAnnotationsPerCheck)
    .map((a) => `   • \`${a.path}:${a.line}\` — ${a.message}`)
    .join("\n");

  const moreAnnotations =
    annotations.length > DISPLAY_LIMITS.slackAnnotationsPerCheck
      ? `\n   _...and ${annotations.length - DISPLAY_LIMITS.slackAnnotationsPerCheck} more_`
      : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `📍 *Affected Files:*\n${annotationLines}${moreAnnotations}`,
      },
    ],
  };
};

/**
 * Build check names list block
 */
const buildCheckNamesBlock = (failures: readonly AnalyzedFailure[]): SlackTextBlock => {
  const checkNames = failures.map((f) => `\`${f.checkName}\``).join(", ");
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Checks:* ${checkNames}`,
    },
  };
};

/**
 * Build root cause analysis block - consolidate unique causes
 */
const buildRootCauseBlock = (failures: readonly AnalyzedFailure[]): SlackTextBlock | null => {
  const uniqueCauses = new Set<string>();
  const causes = failures
    .map((f) => f.identifiedCause ?? f.analysis ?? "")
    .filter((cause) => {
      if (!cause || uniqueCauses.has(cause)) return false;
      uniqueCauses.add(cause);
      return true;
    });

  if (causes.length === 0) return null;

  const causeText =
    causes.length === 1 ? causes[0] : causes.map((c, i) => `${i + 1}. ${c}`).join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*🔍 Root Cause:*\n${causeText}`,
    },
  };
};

// ==================== Public API ====================

/**
 * Build consolidated Slack payload from aggregated failures.
 * Creates a Block Kit message with all failure details.
 */
export const buildConsolidatedSlackPayload = (
  aggregation: AggregatedFailures
): ConsolidatedSlackPayload => {
  const { failures, commitSha, repository, prContext } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);
  const mergedActions = mergeRecommendedActions(failures);
  const confidencePercent = Math.round(avgConfidence * 100);

  // Build GitHub links
  const repoUrl = `https://github.com/${repository.fullName}`;
  const commitUrl = `${repoUrl}/commit/${commitSha}`;
  const prUrl = prContext ? `${repoUrl}/pull/${prContext.number}` : null;

  // Build header blocks
  const headerBlocks: SlackTextBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚨 CI Build Failed",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*📦 Repository*\n<${repoUrl}|${repository.fullName}>` },
        {
          type: "mrkdwn",
          text: `*🔀 Branch*\n\`${prContext?.branch ?? "unknown"}\` → \`${prContext?.baseBranch ?? "main"}\``,
        },
        { type: "mrkdwn", text: `*📝 Commit*\n<${commitUrl}|\`${commitSha.substring(0, 7)}\`>` },
        {
          type: "mrkdwn",
          text: `*📊 Confidence*\n${getConfidenceEmoji(confidencePercent)} ${confidencePercent}%`,
        },
      ],
    },
  ];

  // PR link block (conditional)
  const prLinkBlocks: SlackTextBlock[] =
    prContext && prUrl
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*🔗 Pull Request:* <${prUrl}|#${prContext.number} - ${prContext.title}>`,
            },
          },
        ]
      : [];

  // Failed checks header with check names
  const failedChecksHeader: SlackTextBlock[] = [
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*❌ Failed Checks (${failures.length})*` },
    },
  ];

  // Consolidated check names block
  const checkNamesBlock: SlackTextBlock[] =
    failures.length > 0 ? [buildCheckNamesBlock(failures)] : [];

  // Consolidated root cause block
  const rootCauseBlock = buildRootCauseBlock(failures);
  const rootCauseBlocks: SlackTextBlock[] = rootCauseBlock ? [rootCauseBlock] : [];

  // Consolidated test failures (deduplicated across all checks)
  const consolidatedTestFailures = consolidateTestFailures(failures);
  const testFailuresBlock = buildConsolidatedTestFailuresBlock(consolidatedTestFailures);
  const testFailuresBlocks: SlackTextBlock[] = testFailuresBlock ? [testFailuresBlock] : [];

  // Consolidated annotations (deduplicated across all checks)
  const consolidatedAnnotations = consolidateAnnotations(failures);
  const annotationsBlock = buildConsolidatedAnnotationsBlock(consolidatedAnnotations);
  const annotationsBlocks: SlackTextBlock[] = annotationsBlock ? [annotationsBlock] : [];

  // Recommended actions summary blocks
  const actionsSummaryBlocks: SlackTextBlock[] =
    mergedActions.length > 0
      ? [
          { type: "divider" },
          { type: "section", text: { type: "mrkdwn", text: "*🛠️ Recommended Actions*" } },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: mergedActions
                .slice(0, DISPLAY_LIMITS.slackMaxChecks)
                .map((a, i) => `${i + 1}. ${getPriorityEmoji(a.priority)} ${a.description}`)
                .join("\n"),
            },
          },
        ]
      : [];

  // Interactive action buttons for executable actions
  const actionButtonBlocks = buildActionBlocks(mergedActions, aggregation);

  // Footer blocks
  const footerBlocks: SlackTextBlock[] = [
    { type: "divider" },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "🤖 _Generated by KenchiOps DevOps Assistant_" }],
    },
  ];

  // Combine all blocks - consolidated view
  const blocks: SlackBlock[] = [
    ...headerBlocks,
    ...prLinkBlocks,
    ...failedChecksHeader,
    ...checkNamesBlock,
    ...rootCauseBlocks,
    ...testFailuresBlocks,
    ...annotationsBlocks,
    ...actionsSummaryBlocks,
    ...actionButtonBlocks,
    ...footerBlocks,
  ];

  return {
    blocks,
    text: `🚨 CI Failure: ${failures.length} check(s) failed in ${repository.fullName}`,
    metadata: {
      repository: repository.fullName,
      commitSha,
      failureCount: failures.length,
      checkNames: failures.map((f) => f.checkName),
      avgConfidence,
      isConsolidated: true,
    },
  };
};
