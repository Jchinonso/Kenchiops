/**
 * Slack Payload Formatter
 *
 * Formats aggregated CI failures into Slack Block Kit payloads.
 * Creates visually rich messages with failure details, annotations,
 * and recommended actions with interactive approve/reject buttons.
 */

import type { AggregatedFailures, AnalyzedFailure, RecommendedAction } from "@kenchi/shared";
import { deduplicateByKey, UI_EMOJI } from "@kenchi/shared";
import {
  DISPLAY_LIMITS,
  getPriorityEmoji,
  calculateAverageConfidence,
  mergeRecommendedActions,
  getConfidenceEmoji,
} from "./formatterUtils.js";

// ==================== Types ====================

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

interface SlackActionsBlock {
  readonly type: "actions";
  readonly block_id?: string;
  readonly elements: readonly SlackButtonElement[];
}

type SlackBlock = SlackTextBlock | SlackActionsBlock;

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

interface ConsolidatedTestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
}

interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
}

// ==================== Constants ====================

const MAX_ACTION_BUTTONS = 3;

const EXECUTABLE_ACTION_TYPES = new Set([
  "rerun_pipeline",
  "notify_team",
  "post_comment",
  "manual_investigation",
  "run_diagnostic",
]);

// ==================== Pure Helper Functions ====================

/**
 * Convert snake_case to Title Case for display
 */
const toTitleCase = (snakeCaseString: string): string =>
  snakeCaseString
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

/**
 * Generate unique action ID from commit sha and index
 */
const generateActionId = (commitSha: string, index: number): string =>
  `act_${commitSha.substring(0, 8)}_${index}`;

/**
 * Consolidate test failures across checks using Map-based deduplication
 */
const consolidateTestFailures = (failures: readonly AnalyzedFailure[]): ConsolidatedTestFailure[] =>
  deduplicateByKey(
    failures.flatMap((failure) => failure.testFailures ?? []),
    (testFailure) => `${testFailure.testName}|${testFailure.file ?? ""}`
  );

/**
 * Consolidate annotations across checks using Map-based deduplication
 */
const consolidateAnnotations = (failures: readonly AnalyzedFailure[]): ConsolidatedAnnotation[] =>
  deduplicateByKey(
    failures.flatMap((failure) => failure.annotations),
    (annotation) => `${annotation.path}:${annotation.line}`
  ).map((annotation) => ({
    path: annotation.path,
    line: annotation.line,
    message: annotation.message,
  }));

/**
 * Extract unique causes from failures
 */
const extractUniqueCauses = (failures: readonly AnalyzedFailure[]): string[] =>
  deduplicateByKey(
    failures.map((failure) => failure.identifiedCause ?? failure.analysis ?? "").filter(Boolean),
    (cause) => cause
  );

// ==================== Block Builders ====================

/**
 * Build action button value payload
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
 * Create button element for an action
 */
const createActionButton = (
  action: RecommendedAction,
  index: number,
  aggregation: AggregatedFailures,
  checkRunId?: number
): SlackButtonElement => {
  const actionId = generateActionId(aggregation.commitSha, index);
  return {
    type: "button",
    text: { type: "plain_text", text: toTitleCase(action.actionType ?? "Action"), emoji: true },
    style: "primary",
    value: JSON.stringify(createActionButtonValue(action, actionId, aggregation, checkRunId)),
    action_id: `approve_action_${actionId}`,
  };
};

/**
 * Build execute buttons block for actions
 */
const buildExecuteButtonsBlock = (
  actions: readonly RecommendedAction[],
  aggregation: AggregatedFailures,
  checkRunId?: number
): SlackActionsBlock => ({
  type: "actions",
  block_id: "execute_actions_block",
  elements: actions.map((action, index) =>
    createActionButton(action, index, aggregation, checkRunId)
  ),
});

/**
 * Filter and deduplicate executable actions
 */
const getExecutableActions = (actions: readonly RecommendedAction[]): RecommendedAction[] =>
  deduplicateByKey(
    actions.filter((action) => EXECUTABLE_ACTION_TYPES.has(action.actionType ?? "")),
    (action) => action.actionType ?? ""
  ).slice(0, MAX_ACTION_BUTTONS);

/**
 * Build action description block
 */
const buildActionDescriptionBlock = (action: RecommendedAction): SlackTextBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: `${getPriorityEmoji(action.priority)} *${toTitleCase(action.actionType ?? "Action")}*: ${action.description}`,
  },
});

/**
 * Build action blocks with descriptions and buttons
 */
const buildActionBlocks = (
  actions: readonly RecommendedAction[],
  aggregation: AggregatedFailures
): SlackBlock[] => {
  const executableActions = getExecutableActions(actions);
  return executableActions.length === 0
    ? []
    : [
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*${UI_EMOJI.target} Quick Actions*` } },
        ...executableActions.map(buildActionDescriptionBlock),
        buildExecuteButtonsBlock(
          executableActions,
          aggregation,
          aggregation.failures[0]?.checkRunId
        ),
      ];
};

/**
 * Build consolidated test failures block
 */
const buildTestFailuresBlock = (
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
      return `   • \`${testFailure.testName}\`${filePath ? ` (${filePath})` : ""}`;
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

/**
 * Build consolidated affected files block
 */
const buildAnnotationsBlock = (
  annotations: readonly ConsolidatedAnnotation[]
): SlackTextBlock | null => {
  if (annotations.length === 0) return null;

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = annotations
    .slice(0, displayCount)
    .map((annotation) => `   • \`${annotation.path}:${annotation.line}\` — ${annotation.message}`)
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

/**
 * Build check names list block
 */
const buildCheckNamesBlock = (failures: readonly AnalyzedFailure[]): SlackTextBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: `*Checks:* ${failures.map((failure) => `\`${failure.checkName}\``).join(", ")}`,
  },
});

/**
 * Build root cause analysis block
 */
const buildRootCauseBlock = (causes: readonly string[]): SlackTextBlock | null => {
  if (causes.length === 0) return null;

  const causeText =
    causes.length === 1
      ? causes[0]
      : causes.map((cause, index) => `${index + 1}. ${cause}`).join("\n");

  return {
    type: "section",
    text: { type: "mrkdwn", text: `*${UI_EMOJI.search} Root Cause:*\n${causeText}` },
  };
};

/**
 * Build header blocks with repository info
 */
const buildHeaderBlocks = (
  repository: AggregatedFailures["repository"],
  commitSha: string,
  prContext: AggregatedFailures["prContext"],
  confidencePercent: number
): SlackTextBlock[] => {
  const repoUrl = `https://github.com/${repository.fullName}`;
  const commitUrl = `${repoUrl}/commit/${commitSha}`;

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `${UI_EMOJI.alert} CI Build Failed`, emoji: true },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*${UI_EMOJI.package} Repository*\n<${repoUrl}|${repository.fullName}>`,
        },
        {
          type: "mrkdwn",
          text: `*${UI_EMOJI.branch} Branch*\n\`${prContext?.branch ?? "unknown"}\` → \`${prContext?.baseBranch ?? "main"}\``,
        },
        {
          type: "mrkdwn",
          text: `*${UI_EMOJI.commit} Commit*\n<${commitUrl}|\`${commitSha.substring(0, 7)}\`>`,
        },
        {
          type: "mrkdwn",
          text: `*${UI_EMOJI.details} Confidence*\n${getConfidenceEmoji(confidencePercent)} ${confidencePercent}%`,
        },
      ],
    },
  ];
};

/**
 * Build PR link block if context exists
 */
const buildPRLinkBlock = (
  repository: AggregatedFailures["repository"],
  prContext: AggregatedFailures["prContext"]
): SlackTextBlock | null => {
  if (!prContext) return null;

  const prUrl = `https://github.com/${repository.fullName}/pull/${prContext.number}`;
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${UI_EMOJI.link} Pull Request:* <${prUrl}|#${prContext.number} - ${prContext.title}>`,
    },
  };
};

/**
 * Build recommended actions summary blocks
 */
const buildActionsSummaryBlocks = (actions: readonly RecommendedAction[]): SlackTextBlock[] => {
  if (actions.length === 0) return [];

  const actionText = actions
    .slice(0, DISPLAY_LIMITS.slackMaxChecks)
    .map(
      (action, index) => `${index + 1}. ${getPriorityEmoji(action.priority)} ${action.description}`
    )
    .join("\n");

  return [
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*${UI_EMOJI.tools} Recommended Actions*` } },
    { type: "section", text: { type: "mrkdwn", text: actionText } },
  ];
};

// ==================== Public API ====================

/**
 * Build consolidated Slack payload from aggregated failures
 */
export const buildConsolidatedSlackPayload = (
  aggregation: AggregatedFailures
): ConsolidatedSlackPayload => {
  const { failures, commitSha, repository, prContext } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);
  const mergedActions = mergeRecommendedActions(failures);
  const confidencePercent = Math.round(avgConfidence * 100);

  // Pre-compute consolidated data (O(n) with Map-based deduplication)
  const testFailures = consolidateTestFailures(failures);
  const annotations = consolidateAnnotations(failures);
  const causes = extractUniqueCauses(failures);

  // Build all block sections
  const headerBlocks = buildHeaderBlocks(repository, commitSha, prContext, confidencePercent);
  const prLinkBlock = buildPRLinkBlock(repository, prContext);
  const testFailuresBlock = buildTestFailuresBlock(testFailures);
  const annotationsBlock = buildAnnotationsBlock(annotations);
  const rootCauseBlock = buildRootCauseBlock(causes);

  // Combine blocks using array spread with filter for optional blocks
  const blocks: SlackBlock[] = [
    ...headerBlocks,
    ...(prLinkBlock ? [prLinkBlock] : []),
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${UI_EMOJI.failure} Failed Checks (${failures.length})*` },
    },
    ...(failures.length > 0 ? [buildCheckNamesBlock(failures)] : []),
    ...(rootCauseBlock ? [rootCauseBlock] : []),
    ...(testFailuresBlock ? [testFailuresBlock] : []),
    ...(annotationsBlock ? [annotationsBlock] : []),
    ...buildActionsSummaryBlocks(mergedActions),
    ...buildActionBlocks(mergedActions, aggregation),
    { type: "divider" },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `${UI_EMOJI.robot} _Generated by KenchiOps DevOps Assistant_` },
      ],
    },
  ];

  return {
    blocks,
    text: `${UI_EMOJI.alert} CI Failure: ${failures.length} check(s) failed in ${repository.fullName}`,
    metadata: {
      repository: repository.fullName,
      commitSha,
      failureCount: failures.length,
      checkNames: failures.map((failure) => failure.checkName),
      avgConfidence,
      isConsolidated: true,
    },
  };
};
