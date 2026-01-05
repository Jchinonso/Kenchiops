/**
 * CI Failure Block Creators
 *
 * Slack Block Kit block creators for CI failure notifications.
 */

import {
  UI_EMOJI,
  getConfidenceLabel,
  getConfidenceEmoji,
  DISPLAY_DEFAULTS,
  truncateText,
  getFirstSentence,
  SLACK_FAILURE_TEMPLATES,
  FORMATTER_DISPLAY_LIMITS,
} from "@kenchi/shared";
import type { SlackBlock, CIFailureAnalysis, CIAnnotation } from "../types/slackTypes.js";
import {
  getPriorityEmoji,
  resolveRecommendedActions,
  type CIDependencyChange,
  type CIBuildConfigChange,
} from "./ciFailureHelpers.js";

// ==================== Header & Summary Blocks ====================

/**
 * Creates branded header block for CI failure notification.
 */
export const createBrandedHeaderBlock = (): SlackBlock => ({
  type: "header",
  text: {
    type: "plain_text",
    text: SLACK_FAILURE_TEMPLATES.HEADER,
    emoji: true,
  },
});

/**
 * Creates summary line showing what failed.
 */
export const createSummaryBlock = (analysis: CIFailureAnalysis): SlackBlock => {
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
      text: `${UI_EMOJI.package} *${repoName}* ${checkName} pipeline failed${testInfo}`,
    },
  };
};

// ==================== Content Blocks ====================

/**
 * Creates the "Why" section with bullet points explaining the failure.
 */
export const createWhyBlock = (
  analysis: CIFailureAnalysis,
  annotations: readonly CIAnnotation[],
  dependencyChanges: readonly CIDependencyChange[],
  buildConfigChanges: readonly CIBuildConfigChange[]
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
      text: `${SLACK_FAILURE_TEMPLATES.SECTION_WHY}\n${reasonsList}`,
    },
  };
};

/**
 * Creates the "Secondary Findings" section when uncertainties are present.
 */
export const createSecondaryFindingsBlock = (analysis: CIFailureAnalysis): SlackBlock | null => {
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
      text: `*${UI_EMOJI.info} Secondary Findings:*\n${findingsText}${moreText}`,
    },
  };
};

/**
 * Creates the "Recommended" section with action items.
 */
export const createRecommendedBlock = (analysis: CIFailureAnalysis): SlackBlock | null => {
  const actions = resolveRecommendedActions(analysis);

  if (actions.length === 0) {
    return null;
  }

  // Take top actions based on display limit
  const topActions = actions.slice(0, FORMATTER_DISPLAY_LIMITS.MAX_ACTION_BUTTONS);
  const actionsList = topActions
    .map((action, actionIndex) => {
      const emoji = getPriorityEmoji(action.priority ?? "medium");
      const prefix = actionIndex === 0 ? emoji : "•";
      return `${prefix} ${action.description}`;
    })
    .join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${SLACK_FAILURE_TEMPLATES.SECTION_RECOMMENDED}\n${actionsList}`,
    },
  };
};

/**
 * Creates errors section with collected CI errors.
 */
export const createErrorsBlock = (errors: readonly string[]): SlackBlock | null => {
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
    ...displayErrors.map(
      (error) => `\`\`\`${truncateText(error, FORMATTER_DISPLAY_LIMITS.SLACK_MAX_LINE_CHARS)}\`\`\``
    ),
    ...(moreText ? [moreText] : []),
  ].join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${SLACK_FAILURE_TEMPLATES.SECTION_ERRORS}\n${errorText}`,
    },
  };
};

// ==================== Footer & Metadata Blocks ====================

/**
 * Creates confidence score section with visual indicator.
 */
export const createConfidenceBlock = (confidence: number): SlackBlock => {
  const percentage = Math.round(confidence * FORMATTER_DISPLAY_LIMITS.CONFIDENCE_MULTIPLIER);
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
export const createDivider = (): SlackBlock => ({
  type: "divider",
});

/**
 * Creates footer context block with metadata.
 */
export const createFooterBlock = (analysis: CIFailureAnalysis): SlackBlock => {
  const parts: string[] = [];

  // Add check name
  if (analysis.checkName) {
    parts.push(`${UI_EMOJI.workflow} ${analysis.checkName}`);
  }

  // Add commit SHA
  if (analysis.headSha) {
    const shortSha = analysis.headSha.substring(0, DISPLAY_DEFAULTS.SHA_DISPLAY_LENGTH);
    parts.push(`${UI_EMOJI.commit} \`${shortSha}\``);
  }

  // Add PR context if available
  if (analysis.prContext) {
    parts.push(`${UI_EMOJI.branch} PR #${analysis.prContext.number}`);
    if (analysis.prContext.author) {
      parts.push(`${UI_EMOJI.user} ${analysis.prContext.author}`);
    }
  }

  // Add workflow duration if available
  if (analysis.workflowContext?.duration) {
    parts.push(`${UI_EMOJI.timer} ${analysis.workflowContext.duration}`);
  }

  const category = analysis.full_analysis?.category;
  const phase = analysis.full_analysis?.phase;
  const classification = [category, phase].filter(Boolean).join(" / ");
  if (classification) {
    parts.push(`${UI_EMOJI.target} ${classification}`);
  }

  // Fallback if no parts
  if (parts.length === 0) {
    parts.push(`${UI_EMOJI.robot} KenchiOps`);
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
export const createActionsBlock = (analysis: CIFailureAnalysis): SlackBlock | null => {
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
      text: `${UI_EMOJI.list} View Logs`,
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
      text: `${UI_EMOJI.depUpdated} Re-run`,
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
