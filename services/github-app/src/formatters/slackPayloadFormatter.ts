/**
 * Slack Payload Formatter
 *
 * Formats aggregated CI failures into Slack Block Kit payloads.
 * Creates visually rich messages with failure details, annotations,
 * and recommended actions with interactive approve/reject buttons.
 */

import {
  deduplicateByKey,
  UI_EMOJI,
  FORMATTER_DISPLAY_LIMITS,
  type AggregatedFailures,
  type AnalyzedFailure,
  type RecommendedAction,
  type LLMDetectedDependencyChange,
  type LLMDetectedBuildConfigChange,
} from "@kenchi/shared";
import {
  calculateAverageConfidence,
  mergeRecommendedActions,
  getConfidenceEmoji,
} from "./formatterUtils.js";
import {
  buildTestFailuresBlock,
  buildAnnotationsBlock,
  buildCheckNamesBlock,
  buildRootCauseBlock,
  buildDependencyChangesBlock,
  buildConfigChangesBlock,
  buildActionsSummaryBlocks,
  type SlackBlock,
  type SlackTextBlock,
  type SlackButtonElement,
  type SlackActionsBlock,
  type ConsolidatedTestFailure,
  type ConsolidatedAnnotation,
} from "./slackContentBlocks.js";

// ==================== Types ====================

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

// ==================== Constants ====================

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
 * Key includes message to preserve multiple errors on the same line
 */
const consolidateAnnotations = (failures: readonly AnalyzedFailure[]): ConsolidatedAnnotation[] =>
  deduplicateByKey(
    failures.flatMap((failure) => failure.annotations),
    (annotation) => `${annotation.path}:${annotation.line}:${annotation.message}`
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

/**
 * Consolidate detected dependency changes across failures
 */
const consolidateDependencyChanges = (
  failures: readonly AnalyzedFailure[]
): LLMDetectedDependencyChange[] =>
  deduplicateByKey(
    failures.flatMap((failure) => failure.detectedDependencyChanges ?? []),
    (dep) => `${dep.name}|${dep.type}|${dep.ecosystem ?? ""}`
  );

/**
 * Consolidate detected build config changes across failures
 */
const consolidateBuildConfigChanges = (
  failures: readonly AnalyzedFailure[]
): LLMDetectedBuildConfigChange[] =>
  deduplicateByKey(
    failures.flatMap((failure) => failure.detectedBuildConfigChanges ?? []),
    (configChange) => configChange.file
  );

// ==================== Action Button Builders ====================

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
  ).slice(0, FORMATTER_DISPLAY_LIMITS.MAX_ACTION_BUTTONS);

/**
 * Build action blocks with buttons only (no duplicate descriptions)
 */
const buildActionBlocks = (
  actions: readonly RecommendedAction[],
  aggregation: AggregatedFailures
): SlackBlock[] => {
  const executableActions = getExecutableActions(actions);
  return executableActions.length === 0
    ? []
    : [
        buildExecuteButtonsBlock(
          executableActions,
          aggregation,
          aggregation.failures[0]?.checkRunId
        ),
      ];
};

// ==================== Header Block Builders ====================

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
          text: `*${UI_EMOJI.branch} Branch*\n\`${prContext?.branch ?? "unknown"}\` -> \`${prContext?.baseBranch ?? "main"}\``,
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
  if (!prContext) {
    return null;
  }

  const prUrl = `https://github.com/${repository.fullName}/pull/${prContext.number}`;
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${UI_EMOJI.link} Pull Request:* <${prUrl}|#${prContext.number} - ${prContext.title}>`,
    },
  };
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
  // AI-extracted context (Phase 4 - Language Agnostic)
  const dependencyChanges = consolidateDependencyChanges(failures);
  const buildConfigChanges = consolidateBuildConfigChanges(failures);

  // Build all block sections
  const headerBlocks = buildHeaderBlocks(repository, commitSha, prContext, confidencePercent);
  const prLinkBlock = buildPRLinkBlock(repository, prContext);
  const testFailuresBlock = buildTestFailuresBlock(testFailures);
  const annotationsBlock = buildAnnotationsBlock(annotations);
  const rootCauseBlock = buildRootCauseBlock(
    causes,
    testFailures.length > 0,
    annotations.length > 0
  );
  // AI-extracted blocks
  const dependencyBlock = buildDependencyChangesBlock(dependencyChanges);
  const configBlock = buildConfigChangesBlock(buildConfigChanges);

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
    rootCauseBlock,
    ...(testFailuresBlock ? [testFailuresBlock] : []),
    ...(annotationsBlock ? [annotationsBlock] : []),
    ...(dependencyBlock ? [dependencyBlock] : []),
    ...(configBlock ? [configBlock] : []),
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
