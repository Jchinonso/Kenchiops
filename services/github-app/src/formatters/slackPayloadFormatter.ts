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
  UI_CONSTANTS,
  FORMATTER_DISPLAY_LIMITS,
  redactSecrets,
  storeActionPayload,
  normalizeTestFailure,
  countUniqueSuites,
  countUniqueFiles,
  canonicalizeEvidencePaths,
  selectMessageVariant,
  extractServiceFromPath,
  formatConfidenceWithLabel,
  clusterFailuresByService,
  type AggregatedFailures,
  type AnalyzedFailure,
  type CodeAnnotation,
  type RecommendedAction,
  type LLMDetectedDependencyChange,
  type LLMDetectedBuildConfigChange,
} from "@kenchi/shared";
import {
  calculateConfidenceWithUncertainty,
  mergeRecommendedActions,
  getConfidenceEmoji,
} from "./formatterUtils.js";
import {
  buildAnnotationsBlock,
  buildCheckNamesBlock,
  buildInfrastructureIssuesBlock,
  buildFlakyTestWarningBlock,
  buildAtAGlanceBlock,
  buildClusteredRootCauseBlock,
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
    readonly messageVariant: "COMPACT" | "STANDARD" | "EXPANDED";
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
 * Deduplicates by file:line to show each location once.
 * Keeps the entry with the most informative error (sorted first).
 */
const consolidateTestFailures = (
  testFailures: readonly ConsolidatedTestFailure[]
): ConsolidatedTestFailure[] => {
  const allFailures = [...testFailures];

  // Sort to prioritize entries with meaningful errors
  const sorted = [...allFailures].sort(
    (left, right) => Number(Boolean(right.error)) - Number(Boolean(left.error))
  );

  // Normalize first, then deduplicate by file:line
  const normalized = sorted.map((testFailure) => normalizeTestFailure(testFailure));

  return deduplicateByKey(normalized, (testFailure) => {
    // Deduplicate by file:line to show each location once
    const file = testFailure.file ?? "";
    const line = testFailure.line ?? 0;
    return file ? `${file}:${line}` : testFailure.testName;
  });
};

/**
 * Consolidate annotations across checks using Map-based deduplication
 * Key includes message to preserve multiple errors on the same line
 */
const consolidateAnnotations = (annotations: readonly CodeAnnotation[]): ConsolidatedAnnotation[] =>
  deduplicateByKey(
    annotations,
    (annotation) => `${annotation.path}:${annotation.line}:${annotation.message}`
  ).map((annotation) => ({
    path: annotation.path,
    line: annotation.line,
    message: annotation.message,
    suggestedFix: annotation.suggestedFix?.description,
  }));

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
 * Header block configuration.
 */
interface HeaderBlockConfig {
  readonly repository: AggregatedFailures["repository"];
  readonly commitSha: string;
  readonly prContext: AggregatedFailures["prContext"];
  readonly confidence: number;
  readonly uncertainty?: string;
  readonly suiteCount: number;
  readonly fileCount: number;
  readonly serviceCount: number;
}

/**
 * Build header blocks with repository info, suite/file counts, and uncertainty.
 * Voice Guide format: "72% (high certainty)"
 */
const buildHeaderBlocks = (headerConfig: HeaderBlockConfig): SlackTextBlock[] => {
  const {
    repository,
    commitSha,
    prContext,
    confidence,
    uncertainty,
    suiteCount,
    fileCount,
    serviceCount,
  } = headerConfig;
  const repoUrl = `https://github.com/${repository.fullName}`;
  const commitUrl = `${repoUrl}/commit/${commitSha}`;

  // Voice Guide: Format confidence with label phrase (e.g., "72% (high certainty)")
  const confidencePercent = Math.round(confidence * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);
  const confidenceLabel = formatConfidenceWithLabel(confidence);
  const confidenceText = uncertainty
    ? `${getConfidenceEmoji(confidencePercent)} ${confidenceLabel}\n_${uncertainty}_`
    : `${getConfidenceEmoji(confidencePercent)} ${confidenceLabel}`;

  // Format suite/file counts (only show if we have test failures)
  const suiteText =
    suiteCount > 0
      ? `*${UI_EMOJI.failure} Test Suites*\n${suiteCount} failed | ${fileCount} files | ${serviceCount} services`
      : `*${UI_EMOJI.failure} Files*\n${fileCount} affected | ${serviceCount} services`;

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
          text: `*${UI_EMOJI.details} Confidence*\n${confidenceText}`,
        },
      ],
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: suiteText }],
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

/**
 * Build "View Full Report" link block for expanded variant.
 * Links to the GitHub Actions run page for comprehensive details.
 */
const buildFullReportLinkBlock = (
  repository: AggregatedFailures["repository"],
  commitSha: string
): SlackTextBlock => {
  const actionsUrl = `https://github.com/${repository.fullName}/commit/${commitSha}/checks`;
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.link} <${actionsUrl}|View Full Report on GitHub> — _Complete logs and annotations_`,
      },
    ],
  };
};

// ==================== Public API ====================

/**
 * Build consolidated Slack payload from aggregated failures.
 * Includes suite/file counts, multi-module uncertainty detection, and evidence IDs.
 */
export const buildConsolidatedSlackPayload = (
  aggregation: AggregatedFailures
): ConsolidatedSlackPayload => {
  const { failures, commitSha, repository, prContext } = aggregation;

  // Phase 5: Select message variant based on failure complexity
  // Derive service from first test failure path for each check
  const variantResult = selectMessageVariant(
    failures.map((failure) => {
      const firstTestPath = failure.testFailures?.[0]?.file;
      const service = firstTestPath ? extractServiceFromPath(firstTestPath) : undefined;
      return { checkName: failure.checkName, service };
    })
  );

  // Phase 4: Calculate confidence with multi-module uncertainty detection
  const { confidence, uncertainty } = calculateConfidenceWithUncertainty(failures);
  const mergedActions = mergeRecommendedActions(failures);

  // Pre-compute consolidated data (O(n) with Map-based deduplication)
  const rawTestFailures = failures.flatMap((failure) => failure.testFailures ?? []);
  const rawAnnotations = failures.flatMap((failure) => failure.annotations ?? []);
  const { testFailures: canonicalTestFailures, annotations: canonicalAnnotations } =
    canonicalizeEvidencePaths(rawTestFailures, rawAnnotations);
  const testFailures = consolidateTestFailures(canonicalTestFailures);
  const annotations = consolidateAnnotations(canonicalAnnotations);
  // Phase 2: Calculate suite, file, and service counts
  const suiteCount = countUniqueSuites(testFailures);
  const fileCount = countUniqueFiles(testFailures, annotations);
  const serviceClusters = clusterFailuresByService(failures);
  const serviceCount = serviceClusters.size;
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

  // Build all block sections with suite/file counts and uncertainty
  const headerBlocks = buildHeaderBlocks({
    repository,
    commitSha,
    prContext,
    confidence,
    uncertainty,
    suiteCount,
    fileCount,
    serviceCount,
  });
  const prLinkBlock = buildPRLinkBlock(repository, prContext);
  // Voice Guide: Infrastructure issues as separate top-level section BEFORE At a Glance
  const infrastructureBlock = buildInfrastructureIssuesBlock(testFailures);
  // Voice Guide: Flaky test warnings after infrastructure issues
  const flakyWarningBlock = buildFlakyTestWarningBlock(testFailures);
  // Combine test failures and annotations into unified Affected Files block
  const annotationsBlock = buildAnnotationsBlock(annotations, testFailures);
  // Build "At a Glance" summary block (Voice Guide) - skipped for COMPACT variant
  const atAGlanceBlock = buildAtAGlanceBlock(failures, variantResult.variant);
  // Use clustered root cause block for per-service grouping with evidence IDs
  const rootCauseBlock = buildClusteredRootCauseBlock(failures);
  // AI-extracted blocks
  const dependencyBlock = buildDependencyChangesBlock(dependencyChanges);
  const configBlock = buildConfigChangesBlock(buildConfigChanges);
  // RAG-retrieved blocks
  const relatedKnowledgeBlock = buildRelatedKnowledgeBlock(relatedKnowledge);
  // RAG feedback buttons (only shown if knowledge docs exist)
  const ragFeedbackBlock = buildRAGFeedbackButtonsBlock(relatedKnowledge, analysisId);
  // Analysis feedback buttons (always shown for passive learning)
  const analysisFeedbackBlock = buildAnalysisFeedbackButtonsBlock(analysisId);
  // Phase 5: Full report link for expanded variant
  const fullReportBlock = variantResult.showFullReportLink
    ? buildFullReportLinkBlock(repository, commitSha)
    : null;

  // Combine blocks using array spread with filter for optional blocks
  // Voice Guide order: Header → Failed Checks → Infrastructure → Flaky Warnings → At a Glance → Root Cause → Affected Files
  const blocks: SlackBlock[] = [
    ...headerBlocks,
    ...(prLinkBlock ? [prLinkBlock] : []),
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${UI_EMOJI.failure} Failed Checks (${failures.length})*` },
    },
    ...(failures.length > 0 ? [buildCheckNamesBlock(failures)] : []),
    // Voice Guide: Infrastructure issues BEFORE At a Glance
    ...(infrastructureBlock ? [infrastructureBlock] : []),
    // Voice Guide: Flaky warnings after infrastructure
    ...(flakyWarningBlock ? [flakyWarningBlock] : []),
    ...(atAGlanceBlock ? [atAGlanceBlock] : []),
    rootCauseBlock,
    ...(annotationsBlock ? [annotationsBlock] : []),
    ...(dependencyBlock ? [dependencyBlock] : []),
    ...(configBlock ? [configBlock] : []),
    ...(relatedKnowledgeBlock ? [relatedKnowledgeBlock] : []),
    ...(ragFeedbackBlock ? [ragFeedbackBlock] : []),
    analysisFeedbackBlock,
    ...buildActionsSummaryBlocks(mergedActions),
    ...buildActionBlocks(mergedActions, aggregation),
    ...(fullReportBlock ? [fullReportBlock] : []),
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
      avgConfidence: confidence,
      isConsolidated: true,
      messageVariant: variantResult.variant,
    },
  };
};
