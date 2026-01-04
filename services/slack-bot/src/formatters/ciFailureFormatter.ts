/**
 * CI Failure Formatting Utilities
 *
 * Formats CI failure analysis into Slack Block Kit blocks
 * and attachments for rich, branded notifications.
 */

import {
  PRIORITY_EMOJI,
  PRIORITY_NUMERIC_MAP,
  getConfidenceColor,
  getConfidenceLabel,
  getConfidenceEmoji,
  collectCIErrors,
  DISPLAY_DEFAULTS,
  truncateText,
  getFirstSentence,
  SLACK_FAILURE_TEMPLATES,
  FORMATTER_DISPLAY_LIMITS,
} from "@kenchi/shared";
import type { SlackBlock, CIFailureAnalysis, CIAnnotation } from "../types/slackTypes.js";

/**
 * Slack attachment type compatible with Slack API.
 */
export interface MessageAttachment {
  color: string;
  fallback: string;
  blocks: SlackBlock[];
}

type DependencyChange =
  | NonNullable<CIFailureAnalysis["detectedDependencyChanges"]>[number]
  | NonNullable<CIFailureAnalysis["dependencyChanges"]>[number];
type BuildConfigChange = NonNullable<CIFailureAnalysis["detectedBuildConfigChanges"]>[number];
type RecommendedAction = NonNullable<CIFailureAnalysis["recommended_actions"]>[number];

/**
 * Gets priority emoji for action priority.
 *
 * @param priority - Priority level (critical, high, medium, low) or numeric (1=critical, 2=high, 3=medium, 4=low)
 * @returns Emoji string for the priority level
 */
export const getPriorityEmoji = (priority: string | number): string => {
  // Handle numeric priorities using centralized mapping
  if (typeof priority === "number") {
    const priorityKey =
      PRIORITY_NUMERIC_MAP[priority as keyof typeof PRIORITY_NUMERIC_MAP] || "low";
    return PRIORITY_EMOJI[priorityKey];
  }
  const p = priority.toLowerCase() as keyof typeof PRIORITY_EMOJI;
  return PRIORITY_EMOJI[p] || PRIORITY_EMOJI.low;
};

const resolveAnnotations = (analysis: CIFailureAnalysis): readonly CIAnnotation[] => {
  if (analysis.annotations && analysis.annotations.length > 0) {
    return analysis.annotations;
  }

  const aiAnnotations = analysis.full_analysis?.codeAnnotations ?? [];
  return aiAnnotations.map((annotation) => ({
    path: annotation.path,
    startLine: annotation.line,
    level: annotation.level,
    message: annotation.message,
    title: annotation.title,
    suggestedFix: annotation.suggestedFix,
  }));
};

const resolveDependencyChanges = (analysis: CIFailureAnalysis): readonly DependencyChange[] => {
  if (analysis.detectedDependencyChanges && analysis.detectedDependencyChanges.length > 0) {
    return analysis.detectedDependencyChanges;
  }

  const aiChanges = analysis.full_analysis?.detectedDependencyChanges;
  if (aiChanges && aiChanges.length > 0) {
    return aiChanges;
  }

  return analysis.dependencyChanges ?? [];
};

const resolveBuildConfigChanges = (analysis: CIFailureAnalysis): readonly BuildConfigChange[] => {
  if (analysis.detectedBuildConfigChanges && analysis.detectedBuildConfigChanges.length > 0) {
    return analysis.detectedBuildConfigChanges;
  }

  const aiChanges = analysis.full_analysis?.detectedBuildConfigChanges;
  if (aiChanges && aiChanges.length > 0) {
    return aiChanges;
  }

  return [];
};

const resolveRecommendedActions = (analysis: CIFailureAnalysis): readonly RecommendedAction[] => {
  if (analysis.recommended_actions && analysis.recommended_actions.length > 0) {
    return analysis.recommended_actions;
  }

  return (
    analysis.full_analysis?.recommendedActions?.map((action) => ({
      description: action.description,
      priority: action.priority,
      actionType: action.actionType,
      reasoning: action.reasoning,
    })) ?? []
  );
};

/**
 * Creates branded header block for CI failure notification.
 * Format: "❌ KenchiOps — CI Failure Detected"
 */
const createBrandedHeaderBlock = (): SlackBlock => ({
  type: "header",
  text: {
    type: "plain_text",
    text: SLACK_FAILURE_TEMPLATES.HEADER,
    emoji: true,
  },
});

/**
 * Creates summary line showing what failed.
 * Format: "📦 payment-service pipeline failed on test `should_handle_timeout`"
 */
const createSummaryBlock = (analysis: CIFailureAnalysis): SlackBlock => {
  const repoName = analysis.repository.split("/").pop() || analysis.repository;
  const checkName = analysis.checkName || "CI";

  // Find the first test failure name if available
  const firstTest = analysis.testFailures?.[0]?.testName;
  const testInfo = firstTest
    ? ` on test \`${truncateText(firstTest, FORMATTER_DISPLAY_LIMITS.SLACK_TEST_NAME_LENGTH)}\``
    : "";

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `📦 *${repoName}* ${checkName} pipeline failed${testInfo}`,
    },
  };
};

/**
 * Creates the "Why" section with bullet points explaining the failure.
 */
const createWhyBlock = (
  analysis: CIFailureAnalysis,
  annotations: readonly CIAnnotation[],
  dependencyChanges: readonly DependencyChange[],
  buildConfigChanges: readonly BuildConfigChange[]
): SlackBlock => {
  const reasons: string[] = [];

  // Add the main identified cause
  const analysisSentence = getFirstSentence(analysis.analysis ?? "");
  const cause =
    analysis.identified_cause ??
    analysis.full_analysis?.identifiedCause ??
    (analysisSentence || analysis.full_analysis?.summary || "");
  if (cause) {
    reasons.push(cause);
  }

  // Add context from test failures
  if (analysis.testFailures && analysis.testFailures.length > 0) {
    const failureCount = analysis.testFailures.length;
    if (failureCount === 1) {
      reasons.push(
        `1 test failed: \`${truncateText(analysis.testFailures[0].testName, FORMATTER_DISPLAY_LIMITS.DETAILED_TEST_NAME_LENGTH)}\``
      );
    } else {
      reasons.push(`${failureCount} tests failed in this run`);
    }
  }

  // Add annotation context
  const failureAnnotations = annotations.filter((annotation) => annotation.level === "failure");
  if (failureAnnotations.length > 0 && reasons.length < 3) {
    const firstAnn = failureAnnotations[0];
    reasons.push(`Error in \`${firstAnn.path}:${firstAnn.startLine}\``);
  }

  // Add dependency change context if available (prefer AI-extracted, fallback to legacy)
  if (dependencyChanges.length > 0) {
    const depCount = dependencyChanges.length;
    reasons.push(`${depCount} dependency change${depCount > 1 ? "s" : ""} in this PR`);
  }

  // Add build config change context if available (AI-extracted)
  if (buildConfigChanges.length > 0) {
    const configCount = buildConfigChanges.length;
    reasons.push(`${configCount} build config change${configCount > 1 ? "s" : ""} detected`);
  }

  // Ensure we have at least one reason
  if (reasons.length === 0) {
    reasons.push("CI pipeline execution failed");
  }

  const reasonsList = reasons.map((reason) => `• ${reason}`).join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*🔍 Why:*\n${reasonsList}`,
    },
  };
};

/**
 * Creates the "Secondary Findings" section when uncertainties are present.
 */
const createSecondaryFindingsBlock = (analysis: CIFailureAnalysis): SlackBlock | null => {
  const findings = analysis.full_analysis?.uncertainties ?? [];
  if (findings.length === 0) {
    return null;
  }

  const displayFindings = findings.slice(0, FORMATTER_DISPLAY_LIMITS.MAX_ERRORS_DISPLAYED);
  const moreText =
    findings.length > FORMATTER_DISPLAY_LIMITS.MAX_ERRORS_DISPLAYED
      ? `\n_...and ${findings.length - FORMATTER_DISPLAY_LIMITS.MAX_ERRORS_DISPLAYED} more findings_`
      : "";

  const findingsText = displayFindings.map((finding) => `• ${finding}`).join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*ℹ️ Secondary Findings:*\n${findingsText}${moreText}`,
    },
  };
};

/**
 * Creates the "Recommended" section with action items.
 */
const createRecommendedBlock = (analysis: CIFailureAnalysis): SlackBlock | null => {
  const actions = resolveRecommendedActions(analysis);

  if (actions.length === 0) {
    return null;
  }

  // Take top actions based on display limit
  const topActions = actions.slice(0, FORMATTER_DISPLAY_LIMITS.MAX_ACTION_BUTTONS);
  const actionsList = topActions
    .map((action, index) => {
      const emoji = getPriorityEmoji(action.priority ?? "medium");
      const prefix = index === 0 ? emoji : "•";
      return `${prefix} ${action.description}`;
    })
    .join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*🛠️ Recommended:*\n${actionsList}`,
    },
  };
};

/**
 * Creates errors section with collected CI errors.
 * Uses functional patterns - no let declarations.
 */
const createErrorsBlock = (errors: readonly string[]): SlackBlock | null => {
  if (errors.length === 0) {
    return null;
  }

  // Limit errors based on display limit
  const displayErrors = errors.slice(0, FORMATTER_DISPLAY_LIMITS.MAX_ERRORS_DISPLAYED);
  const moreText =
    errors.length > FORMATTER_DISPLAY_LIMITS.MAX_ERRORS_DISPLAYED
      ? `\n_...and ${errors.length - FORMATTER_DISPLAY_LIMITS.MAX_ERRORS_DISPLAYED} more errors_`
      : "";

  const errorText = [
    ...displayErrors.map((error) => `\`\`\`${truncateText(error, 100)}\`\`\``),
    ...(moreText ? [moreText] : []),
  ].join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*📋 Errors:*\n${errorText}`,
    },
  };
};

/**
 * Creates confidence score section with visual indicator.
 */
const createConfidenceBlock = (confidence: number): SlackBlock => {
  const percentage = Math.round(confidence * 100);
  const label = getConfidenceLabel(confidence);
  const emoji = getConfidenceEmoji(confidence);

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${emoji} *Confidence:* ${percentage}% (${label})`,
      },
    ],
  };
};

/**
 * Creates divider block.
 */
const createDivider = (): SlackBlock => ({
  type: "divider",
});

/**
 * Creates footer context block with metadata.
 */
const createFooterBlock = (analysis: CIFailureAnalysis): SlackBlock => {
  const parts: string[] = [];

  // Add check name
  if (analysis.checkName) {
    parts.push(`🔧 ${analysis.checkName}`);
  }

  // Add commit SHA
  if (analysis.headSha) {
    const shortSha = analysis.headSha.substring(0, DISPLAY_DEFAULTS.SHA_DISPLAY_LENGTH);
    parts.push(`📝 \`${shortSha}\``);
  }

  // Add PR context if available
  if (analysis.prContext) {
    parts.push(`🔀 PR #${analysis.prContext.number}`);
    if (analysis.prContext.author) {
      parts.push(`👤 ${analysis.prContext.author}`);
    }
  }

  // Add workflow duration if available
  if (analysis.workflowContext?.duration) {
    parts.push(`⏱️ ${analysis.workflowContext.duration}`);
  }

  const category = analysis.full_analysis?.category;
  const phase = analysis.full_analysis?.phase;
  const classification = [category, phase].filter(Boolean).join(" / ");
  if (classification) {
    parts.push(`🎯 ${classification}`);
  }

  // Fallback if no parts
  if (parts.length === 0) {
    parts.push("🤖 KenchiOps");
  }

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: parts.join("  •  "),
      },
    ],
  };
};

/**
 * Creates action buttons for quick actions.
 */
const createActionsBlock = (analysis: CIFailureAnalysis): SlackBlock | null => {
  // Only add actions if we have repository context
  if (!analysis.repository) {
    return null;
  }

  const elements: object[] = [];

  // View Logs button (if we could link to logs)
  elements.push({
    type: "button",
    text: {
      type: "plain_text",
      text: "📄 View Logs",
      emoji: true,
    },
    action_id: "view_logs",
    value: JSON.stringify({ repository: analysis.repository, headSha: analysis.headSha }),
  });

  // Re-run button
  elements.push({
    type: "button",
    text: {
      type: "plain_text",
      text: "🔄 Re-run",
      emoji: true,
    },
    action_id: "rerun_workflow",
    value: JSON.stringify({ repository: analysis.repository, headSha: analysis.headSha }),
  });

  return {
    type: "actions",
    elements,
  };
};

/**
 * Formats CI failure analysis into rich Slack Block Kit blocks.
 *
 * Structure:
 * ❌ KenchiOps — CI Failure Detected
 * 📦 repo-name pipeline failed on test `test_name`
 *
 * 🔍 Why:
 * • Reason 1
 * • Reason 2
 *
 * 🛠️ Recommended:
 * • Action 1
 * • Action 2
 *
 * 📋 Errors: (if any)
 *
 * Confidence: 85% (High)
 * --- footer with metadata ---
 *
 * @param analysis - The CI failure analysis data
 * @returns Array of Slack blocks
 */
export const formatCIFailureBlocks = (analysis: CIFailureAnalysis): SlackBlock[] => {
  const annotations = resolveAnnotations(analysis);
  const dependencyChanges = resolveDependencyChanges(analysis);
  const buildConfigChanges = resolveBuildConfigChanges(analysis);

  // Collect errors using shared utility
  const errors = collectCIErrors(annotations, analysis.testFailures, {
    includeEmoji: false,
  });

  // Build blocks array, filtering out nulls
  const blocks: SlackBlock[] = [
    createBrandedHeaderBlock(),
    createSummaryBlock(analysis),
    createDivider(),
    createWhyBlock(analysis, annotations, dependencyChanges, buildConfigChanges),
    createSecondaryFindingsBlock(analysis),
    createRecommendedBlock(analysis),
    createErrorsBlock(errors),
    createDivider(),
    createConfidenceBlock(analysis.confidence),
    createFooterBlock(analysis),
    createActionsBlock(analysis),
  ].filter((block): block is SlackBlock => block !== null);

  return blocks;
};

/**
 * Creates Slack attachments with colored border for the analysis.
 *
 * Color is based on confidence level (uses UI_CONFIDENCE_THRESHOLDS):
 * - Green for high confidence (>=0.7)
 * - Yellow for medium confidence (>=0.5)
 * - Red for low confidence (<0.5)
 *
 * The colored side border provides at-a-glance severity indication.
 *
 * @param analysis - The CI failure analysis data
 * @returns Array of message attachments
 */
export const createAnalysisAttachments = (analysis: CIFailureAnalysis): MessageAttachment[] => {
  const color = getConfidenceColor(analysis.confidence);
  const analysisText = analysis.analysis || analysis.full_analysis?.summary;
  const cause =
    analysis.identified_cause ??
    analysis.full_analysis?.identifiedCause ??
    analysisText ??
    "CI failure analysis";

  return [
    {
      color,
      fallback: `❌ CI Failure in ${analysis.repository}: ${cause}`,
      blocks: formatCIFailureBlocks(analysis),
    },
  ];
};
