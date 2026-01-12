/**
 * Slack Content Block Builders
 *
 * Barrel export for all Slack content block building functions.
 * Individual implementations are split into focused modules:
 * - slackBlockTypes.ts: Type definitions
 * - slackAnnotationBlocks.ts: Annotations and check names
 * - slackAnalysisBlocks.ts: Root cause, dependencies, config changes, knowledge
 * - slackFeedbackBlocks.ts: Feedback buttons and actions summary
 */

// Types
export type {
  SlackTextBlock,
  SlackButtonElement,
  SlackActionsBlock,
  SlackBlock,
  ConsolidatedTestFailure,
  ConsolidatedAnnotation,
  RAGFeedbackButtonValue,
} from "./slackBlockTypes.js";

// Annotation blocks
export {
  buildAnnotationsBlock,
  buildCheckNamesBlock,
  buildInfrastructureIssuesBlock,
  buildFlakyTestWarningBlock,
} from "./slackAnnotationBlocks.js";

// Analysis blocks
export {
  buildRootCauseBlock,
  buildAtAGlanceBlock,
  buildClusteredRootCauseBlock,
  buildDependencyChangesBlock,
  buildConfigChangesBlock,
  buildRelatedKnowledgeBlock,
} from "./slackAnalysisBlocks.js";

// Feedback blocks
export {
  buildRAGFeedbackButtonsBlock,
  buildAnalysisFeedbackButtonsBlock,
  buildActionsSummaryBlocks,
} from "./slackFeedbackBlocks.js";
