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
  GITHUB_COMMENT_DISPLAY,
  FILE_PATH_VALIDATION,
  FORMATTER_DISPLAY_LIMITS,
  SLACK_ACTION_IDS,
  type AnalyzedFailure,
  type RecommendedAction,
  type LLMDetectedDependencyChange,
  type LLMDetectedBuildConfigChange,
  type RelatedKnowledgeDoc,
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

export interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly suggestedFix?: string;
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

// ==================== Annotations Block ====================

/**
 * Truncates a display string to max length with ellipsis.
 */
const truncateDisplay = (
  text: string,
  maxLength: number = FORMATTER_DISPLAY_LIMITS.SLACK_MAX_LINE_CHARS
): string => (text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`);

/**
 * Extracts and validates file location from annotation path and line.
 * Returns null if the path doesn't look like a valid file path.
 * Handles cases where error text is accidentally included in the path field.
 *
 * @param path - Raw path string from annotation
 * @param line - Line number from annotation
 * @returns Formatted location string (e.g., "src/index.ts:42") or null if invalid
 */
const extractValidFileLocation = (path: string, line: number): string | null => {
  if (!path || path === "unknown" || path.length > GITHUB_COMMENT_DISPLAY.MAX_FILE_PATH_LENGTH) {
    return null;
  }

  const trimmedPath = path.trim();

  // Try to extract file:line pattern from the path itself (handles embedded line numbers)
  const embeddedMatch = trimmedPath.match(FILE_PATH_VALIDATION.LOCATION_PATTERN);
  if (embeddedMatch) {
    const extractedPath = embeddedMatch[1];
    const extractedLine = parseInt(embeddedMatch[2], 10);
    if (FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(extractedPath)) {
      return `${extractedPath}:${extractedLine}`;
    }
  }

  // Validate the path looks like a real file path (not error text)
  if (!FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(trimmedPath)) {
    return null;
  }

  // Return path with line if valid
  return line > 0 ? `${trimmedPath}:${line}` : trimmedPath;
};

const normalizeAnnotationMessage = (message: string): string => {
  const stripped = message.replace(FILE_PATH_VALIDATION.EVIDENCE_PREFIX_PATTERN, "").trim();
  const lines = stripped.split("\n").map((line) => line.trim());
  const firstLine = lines.find((line) => line.length > 0 && !/^TEST_ERROR_/i.test(line)) ?? "";
  return truncateDisplay(firstLine, 60);
};

/**
 * Formats an annotation entry showing error and fix compactly.
 * Shows: `path:line` — error (Fix: short fix)
 * Returns null if no valid file location.
 */
const formatAnnotationEntry = (annotation: ConsolidatedAnnotation): string | null => {
  const location = extractValidFileLocation(annotation.path, annotation.line);
  if (!location) {
    return null;
  }

  // Build compact display: error first, then fix if present
  const errorSummary = normalizeAnnotationMessage(annotation.message);
  const fixNote = annotation.suggestedFix
    ? ` _(Fix: ${normalizeAnnotationMessage(annotation.suggestedFix)})_`
    : "";

  return `   ${UI_EMOJI.list} \`${location}\` — ${errorSummary}${fixNote}`;
};

/**
 * Formats a test failure entry.
 * Test failures should be pre-normalized via normalizeTestFailure() at consolidation.
 * Validates file paths to prevent error text from appearing in location.
 */
const formatTestFailureEntry = (testFailure: ConsolidatedTestFailure): string | null => {
  const location = testFailure.file
    ? extractValidFileLocation(testFailure.file, testFailure.line ?? 0)
    : null;
  if (!location) {
    return null;
  }

  const truncatedTestName = truncateDisplay(testFailure.testName, 50);
  const display =
    testFailure.file && testFailure.file === testFailure.testName
      ? "Test failed"
      : `Test failed: ${truncatedTestName}`;
  return `   ${UI_EMOJI.list} \`${location}\` — ${display}`;
};

/**
 * Build consolidated affected files block
 * Combines annotations and test failures into a single unified view.
 * Applies display limits and shows "...and N more" for overflow.
 */
export const buildAnnotationsBlock = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[] = []
): SlackTextBlock | null => {
  const displayLimit = DISPLAY_LIMITS.slackAnnotationsPerCheck;

  const formattedAnnotations = annotations
    .map((annotation) => formatAnnotationEntry(annotation))
    .filter((line): line is string => Boolean(line));

  const formattedTestFailures = testFailures
    .map((testFailure) => formatTestFailureEntry(testFailure))
    .filter((line): line is string => Boolean(line));

  const totalCount = formattedAnnotations.length + formattedTestFailures.length;
  if (totalCount === 0) {
    return null;
  }

  // Format annotation entries (prioritize these first)
  const annotationLines = formattedAnnotations.slice(0, displayLimit);

  // Calculate remaining slots for test failures
  const remainingSlots = Math.max(0, displayLimit - annotationLines.length);
  const testFailureLines = formattedTestFailures.slice(0, remainingSlots);

  const displayedLines = [...annotationLines, ...testFailureLines];
  const displayedCount = displayedLines.length;
  const overflowCount = totalCount - displayedCount;

  const moreText = overflowCount > 0 ? `\n   _...and ${overflowCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.location} *Affected Files (${totalCount}):*\n${displayedLines.join("\n")}${moreText}`,
      },
    ],
  };
};

// ==================== Check Names Block ====================

/** Maximum characters for check names line to prevent Slack overflow */
const MAX_CHECK_NAMES_CHARS = 200;

/**
 * Build check names list block with truncation.
 * Shows first N checks that fit within character limit.
 */
export const buildCheckNamesBlock = (failures: readonly AnalyzedFailure[]): SlackTextBlock => {
  const displayLimit = DISPLAY_LIMITS.slackMaxChecks;
  const displayedFailures = failures.slice(0, displayLimit);

  // Build check names string with character limit
  const checkNames = displayedFailures.map((failure) => `\`${failure.checkName}\``);

  // Truncate if total string exceeds limit
  const fullText = checkNames.join(", ");
  const overflowCount = failures.length - displayedFailures.length;
  const moreText = overflowCount > 0 ? `, _+${overflowCount} more_` : "";

  const truncatedText =
    fullText.length > MAX_CHECK_NAMES_CHARS
      ? `${fullText.slice(0, MAX_CHECK_NAMES_CHARS)}...${moreText}`
      : `${fullText}${moreText}`;

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Checks:* ${truncatedText}`,
    },
  };
};

// ==================== Root Cause Block ====================

/** Maximum root causes to display (top 3 highest confidence) */
const MAX_ROOT_CAUSES = 3;

/** Maximum characters per root cause line */
const MAX_CAUSE_LINE_CHARS = 200;

/**
 * Normalizes a root cause string for consistent display and deduplication.
 * - Trims whitespace
 * - Collapses multiple spaces/newlines
 * - Removes leading/trailing punctuation
 */
const normalizeRootCause = (cause: string): string =>
  cause
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:\s]+|[.,;:\s]+$/g, "");

/**
 * Build root cause analysis block.
 * Normalizes causes, limits to top 3, and provides fallback message.
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

  // Normalize and deduplicate causes
  const normalizedCauses = causes
    .map((cause) => normalizeRootCause(cause))
    .filter((cause) => cause.length > 0);

  // Deduplicate by normalized lowercase (keeps first occurrence)
  const uniqueCauses = Array.from(
    normalizedCauses
      .reduce((seen, cause) => {
        const key = cause.toLowerCase();
        return seen.has(key) ? seen : seen.set(key, cause);
      }, new Map<string, string>())
      .values()
  );

  // Limit to top 3 and truncate each line
  const displayCauses = uniqueCauses.slice(0, MAX_ROOT_CAUSES);
  const overflowCount = uniqueCauses.length - displayCauses.length;

  const causeText =
    displayCauses.length === 1
      ? truncateDisplay(displayCauses[0], MAX_CAUSE_LINE_CHARS)
      : displayCauses
          .map(
            (cause, causeIndex) =>
              `${causeIndex + 1}. ${truncateDisplay(cause, MAX_CAUSE_LINE_CHARS)}`
          )
          .join("\n");

  const moreText = overflowCount > 0 ? `\n_...and ${overflowCount} more potential causes_` : "";

  return {
    type: "section",
    text: { type: "mrkdwn", text: `*${UI_EMOJI.search} Root Cause:*\n${causeText}${moreText}` },
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
        action_id: SLACK_ACTION_IDS.RAG_FEEDBACK_HELPFUL,
      },
      {
        type: "button",
        text: { type: "plain_text", text: `${UI_EMOJI.thumbsDown} Not Helpful`, emoji: true },
        value: valueString,
        action_id: SLACK_ACTION_IDS.RAG_FEEDBACK_NOT_HELPFUL,
      },
    ],
  };
};

/**
 * Build analysis feedback buttons block for passive learning.
 * Always shown to collect user feedback on analysis quality.
 */
export const buildAnalysisFeedbackButtonsBlock = (analysisId: string): SlackActionsBlock => ({
  type: "actions",
  block_id: "analysis_feedback_block",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: `${UI_EMOJI.thumbsUp} Helpful`, emoji: true },
      style: "primary",
      value: JSON.stringify({ analysisId, feedback: "positive" }),
      action_id: SLACK_ACTION_IDS.FEEDBACK_HELPFUL,
    },
    {
      type: "button",
      text: { type: "plain_text", text: `${UI_EMOJI.thumbsDown} Not Helpful`, emoji: true },
      value: JSON.stringify({ analysisId, feedback: "negative" }),
      action_id: SLACK_ACTION_IDS.FEEDBACK_NOT_HELPFUL,
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
