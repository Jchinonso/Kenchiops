/**
 * Formatter Exports
 *
 * Centralized exports for all formatting utilities.
 */

// Types
export type { FeedbackLinks, ErrorCategoryBreakdown } from "./prCommentTypes.js";
export { PROGRESS_BAR } from "./prCommentTypes.js";

// Test failure helpers
export {
  extractAssertionDiff,
  generateProgressBar,
  categorizeFailures,
  generateErrorBreakdownVisual,
  generateConsolidatedActions,
} from "./testFailureHelpers.js";

// PR comment formatters
export {
  buildHeaderSection,
  buildTestFailureSummary,
  buildAssertionDiffLines,
  buildTestFileGroup,
  buildTestFailuresSection,
  buildLintFileGroup,
  buildLintErrorsSection,
  buildActionsSection,
  buildFooterSection,
  buildFailureSection,
  buildConsolidatedPRComment,
} from "./prCommentFormatter.js";

// Enriched section builders (dependency changes, build config, confidence, priority)
export {
  getConfidenceBadge,
  buildDependencyChangesSection,
  buildBuildConfigChangesSection,
  formatPrioritizedAction,
  buildPrioritizedActions,
} from "./enrichedSectionBuilders.js";

// Slack payload formatters
export type { SlackBlock, SlackBlockElement, SlackPayload } from "./slackPayloadFormatter.js";
export { buildConsolidatedSlackPayload } from "./slackPayloadFormatter.js";

// Check annotation helpers
export {
  buildConsolidatedCheckAnnotations,
  buildConsolidatedCheckSummary,
} from "./checkAnnotationHelpers.js";
