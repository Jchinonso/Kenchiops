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
  redactSecrets,
  storeActionPayload,
  normalizeTestFailure,
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
  buildAnnotationsBlock,
  buildCheckNamesBlock,
  buildRootCauseBlock,
  buildDependencyChangesBlock,
  buildConfigChangesBlock,
  buildRelatedKnowledgeBlock,
  buildRAGFeedbackButtonsBlock,
  buildAnalysisFeedbackButtonsBlock,
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

/**
 * Action types that require confirmation before execution.
 * These can be costly, spammy, or potentially dangerous.
 */
const CONFIRMATION_REQUIRED_ACTIONS = new Set([
  "rerun_pipeline", // Can be costly and spammy
  "notify_team", // Can spam teams
  "post_comment", // Can leak info
]);

// ==================== Constants ====================

const EXECUTABLE_ACTION_TYPES = new Set([
  "rerun_pipeline",
  "notify_team",
  "post_comment",
  "manual_investigation",
  "run_diagnostic",
]);

// ==================== Secret Scrubbing ====================

/**
 * Recursively scrubs secrets from Slack block text content.
 * Defense-in-depth to prevent leaking tokens, keys, etc. to Slack.
 */
const scrubBlockSecrets = (block: SlackBlock): SlackBlock => {
  // Handle text blocks with text property
  if ("text" in block && block.text && typeof block.text === "object" && "text" in block.text) {
    return {
      ...block,
      text: {
        ...block.text,
        text: redactSecrets(block.text.text),
      },
    } as SlackBlock;
  }

  // Handle blocks with fields array
  if ("fields" in block && block.fields) {
    return {
      ...block,
      fields: block.fields.map((field) => ({
        ...field,
        text: redactSecrets(field.text),
      })),
    } as SlackBlock;
  }

  // Handle context blocks with elements
  if ("elements" in block && block.elements && block.type === "context") {
    return {
      ...block,
      elements: (block as SlackTextBlock).elements?.map((element) => ({
        ...element,
        text: redactSecrets(element.text),
      })),
    } as SlackBlock;
  }

  return block;
};

/**
 * Scrubs secrets from all blocks in a payload.
 */
const scrubAllBlockSecrets = (blocks: readonly SlackBlock[]): SlackBlock[] =>
  blocks.map((block) => scrubBlockSecrets(block));

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
 * Consolidate test failures across checks using Map-based deduplication.
 * Normalizes test identifiers to extract file paths from test names.
 */
const consolidateTestFailures = (failures: readonly AnalyzedFailure[]): ConsolidatedTestFailure[] =>
  deduplicateByKey(
    [...failures.flatMap((failure) => failure.testFailures ?? [])].sort(
      (left, right) => Number(Boolean(right.error)) - Number(Boolean(left.error))
    ),
    (testFailure) => `${testFailure.testName}|${testFailure.file ?? ""}`
  ).map((testFailure) => normalizeTestFailure(testFailure));

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
    suggestedFix: annotation.suggestedFix?.description,
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
 * Checks if an action requires confirmation before execution.
 */
const requiresConfirmation = (actionType: string): boolean =>
  CONFIRMATION_REQUIRED_ACTIONS.has(actionType);

/**
 * Create button element for an action using opaque server-side stored payload.
 * Stores full payload server-side, puts only short opaque ID in button value.
 */
const createActionButton = (
  action: RecommendedAction,
  aggregation: AggregatedFailures,
  checkRunId?: number
): SlackButtonElement => {
  const actionType = action.actionType ?? "manual_investigation";

  // Store full payload server-side, get opaque reference
  const opaqueValue = storeActionPayload({
    actionType,
    description: action.description,
    repository: aggregation.repository.fullName,
    commitSha: aggregation.commitSha,
    installationId: aggregation.installationId,
    priority: action.priority,
    checkRunId,
  });

  // Use different action_id for confirmation-required actions
  const needsConfirmation = requiresConfirmation(actionType);
  const actionIdPrefix = needsConfirmation ? "confirm_action" : "approve_action";

  return {
    type: "button",
    text: { type: "plain_text", text: toTitleCase(actionType), emoji: true },
    style: needsConfirmation ? undefined : "primary", // No style for confirmation buttons
    value: JSON.stringify(opaqueValue), // Small opaque value instead of full payload
    action_id: `${actionIdPrefix}_${opaqueValue.id}`,
  };
};

/**
 * Build execute buttons block for actions.
 * Each button stores its payload server-side and uses an opaque ID.
 */
const buildExecuteButtonsBlock = (
  actions: readonly RecommendedAction[],
  aggregation: AggregatedFailures,
  checkRunId?: number
): SlackActionsBlock => ({
  type: "actions",
  block_id: "execute_actions_block",
  elements: actions.map((action) => createActionButton(action, aggregation, checkRunId)),
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
  // RAG-retrieved related knowledge
  const relatedKnowledge = deduplicateByKey(
    failures.flatMap((failure) => failure.relatedKnowledge ?? []),
    (doc) => doc.id
  );
  // Analysis ID for feedback tracking
  const analysisId = `${repository.fullName}:${commitSha}`;

  // Build all block sections
  const headerBlocks = buildHeaderBlocks(repository, commitSha, prContext, confidencePercent);
  const prLinkBlock = buildPRLinkBlock(repository, prContext);
  // Combine test failures and annotations into unified Affected Files block
  const annotationsBlock = buildAnnotationsBlock(annotations, testFailures);
  const rootCauseBlock = buildRootCauseBlock(
    causes,
    testFailures.length > 0,
    annotations.length > 0
  );
  // AI-extracted blocks
  const dependencyBlock = buildDependencyChangesBlock(dependencyChanges);
  const configBlock = buildConfigChangesBlock(buildConfigChanges);
  // RAG-retrieved blocks
  const relatedKnowledgeBlock = buildRelatedKnowledgeBlock(relatedKnowledge);
  // RAG feedback buttons (only shown if knowledge docs exist)
  const ragFeedbackBlock = buildRAGFeedbackButtonsBlock(relatedKnowledge, analysisId);
  // Analysis feedback buttons (always shown for passive learning)
  const analysisFeedbackBlock = buildAnalysisFeedbackButtonsBlock(analysisId);

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
    ...(annotationsBlock ? [annotationsBlock] : []),
    ...(dependencyBlock ? [dependencyBlock] : []),
    ...(configBlock ? [configBlock] : []),
    ...(relatedKnowledgeBlock ? [relatedKnowledgeBlock] : []),
    ...(ragFeedbackBlock ? [ragFeedbackBlock] : []),
    analysisFeedbackBlock,
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

  // Scrub secrets from all text content before sending to Slack
  const scrubbedBlocks = scrubAllBlockSecrets(blocks);
  const scrubbedText = redactSecrets(
    `${UI_EMOJI.alert} CI Failure: ${failures.length} check(s) failed in ${repository.fullName}`
  );

  return {
    blocks: scrubbedBlocks,
    text: scrubbedText,
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
