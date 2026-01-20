/**
 * Dataset Builder for Fine-Tuning
 *
 * Constructs anonymized training datasets from analyses and feedback.
 * Supports multiple output formats for different fine-tuning approaches.
 *
 * @module finetuning/datasetBuilder
 */

import { createLogger } from "../core/logger.js";
import { redactSecrets } from "../security/redaction.js";
import type { LLMAnalysisResult, Evidence } from "../core/types.js";
import type { FeedbackRecord, FeedbackType } from "../database/index.js";
import type {
  TrainingExample,
  TrainingExampleInput,
  DatasetStats,
  DatasetBuildOptions,
  FeedbackQualityLabel,
  FeedbackCounts,
  FeedbackLabelHandler,
  EvidenceSummarizer,
  FilterCondition,
  OpenAITrainingRow,
} from "./types.js";

const logger = createLogger("dataset-builder");

// ==================== Feedback Quality Mapping ====================

const POSITIVE_FEEDBACK_TYPES: ReadonlySet<FeedbackType> = new Set(["correct", "rag_helpful"]);

const NEGATIVE_FEEDBACK_TYPES: ReadonlySet<FeedbackType> = new Set([
  "incorrect",
  "rag_not_helpful",
]);

const NEUTRAL_FEEDBACK_TYPES: ReadonlySet<FeedbackType> = new Set([
  "flaky",
  "needs_more_context",
  "rag_partially_helpful",
]);

/** Ordered handlers for feedback label determination (first match wins). */
const FEEDBACK_LABEL_HANDLERS: readonly FeedbackLabelHandler[] = [
  {
    condition: (counts) => counts.positive > counts.negative && counts.positive > counts.neutral,
    label: "positive",
  },
  {
    condition: (counts) => counts.negative > counts.positive && counts.negative > counts.neutral,
    label: "negative",
  },
  {
    condition: (counts) => counts.neutral > 0 || counts.positive > 0 || counts.negative > 0,
    label: "neutral",
  },
];

/**
 * Counts feedback by category.
 */
const countFeedbackByCategory = (feedback: readonly FeedbackRecord[]): FeedbackCounts => ({
  positive: feedback.filter((fb) => POSITIVE_FEEDBACK_TYPES.has(fb.feedbackType)).length,
  negative: feedback.filter((fb) => NEGATIVE_FEEDBACK_TYPES.has(fb.feedbackType)).length,
  neutral: feedback.filter((fb) => NEUTRAL_FEEDBACK_TYPES.has(fb.feedbackType)).length,
});

/**
 * Determines quality label from feedback records using handler pattern.
 */
const determineFeedbackLabel = (feedback: readonly FeedbackRecord[]): FeedbackQualityLabel => {
  // Early return for empty feedback
  if (feedback.length === 0) {
    return "unlabeled";
  }

  const counts = countFeedbackByCategory(feedback);
  const matchedHandler = FEEDBACK_LABEL_HANDLERS.find((handler) => handler.condition(counts));

  return matchedHandler?.label ?? "unlabeled";
};

// ==================== Evidence Summarization ====================

/** Handlers for summarizing different evidence types. */
const EVIDENCE_SUMMARIZERS: readonly EvidenceSummarizer[] = [
  {
    getData: (evidence) => evidence.logs,
    format: (_evidence, logs) => {
      const typedLogs = logs as NonNullable<Evidence["logs"]>;
      const logSummary = typedLogs.slice(0, 5).map((log) => ({
        level: log.level,
        message: redactSecrets(log.message).slice(0, 200),
      }));
      return `Logs (${typedLogs.length} entries): ${JSON.stringify(logSummary)}`;
    },
  },
  {
    getData: (evidence) => evidence.gitHistory,
    format: (_evidence, commits) => {
      const typedCommits = commits as NonNullable<Evidence["gitHistory"]>;
      const commitSummary = typedCommits.slice(0, 3).map((commit) => ({
        message: redactSecrets(commit.message).slice(0, 100),
        filesChanged: commit.filesChanged?.length ?? 0,
      }));
      return `Git commits (${typedCommits.length}): ${JSON.stringify(commitSummary)}`;
    },
  },
  {
    getData: (evidence) => evidence.relatedDocs,
    format: (_evidence, docs) => {
      const typedDocs = docs as NonNullable<Evidence["relatedDocs"]>;
      const docSummary = typedDocs.slice(0, 3).map((doc) => ({
        type: doc.type,
        title: doc.title,
        similarity: doc.similarity,
      }));
      return `Related docs (${typedDocs.length}): ${JSON.stringify(docSummary)}`;
    },
  },
];

/**
 * Summarizes evidence for training (anonymized) using handler pattern.
 */
const summarizeEvidence = (evidence: Evidence): string =>
  EVIDENCE_SUMMARIZERS.map((summarizer) => {
    const data = summarizer.getData(evidence);
    return data && data.length > 0 ? summarizer.format(evidence, data) : null;
  })
    .filter((part): part is string => part !== null)
    .join("\n");

/**
 * Formats analysis output for training (anonymized).
 */
const formatAnalysisOutput = (analysis: LLMAnalysisResult): string => {
  const output = {
    summary: redactSecrets(analysis.summary),
    identifiedCause: analysis.identifiedCause ? redactSecrets(analysis.identifiedCause) : null,
    confidence: analysis.confidence,
    confidenceScore: analysis.confidenceScore,
    reasoning: analysis.reasoning ? redactSecrets(analysis.reasoning) : null,
    impactAssessment: analysis.impactAssessment,
    actionsCount: analysis.recommendedActions?.length ?? 0,
    annotationsCount: analysis.codeAnnotations?.length ?? 0,
  };

  return JSON.stringify(output, null, 2);
};

// ==================== Training Example Building ====================

/**
 * Builds a training example from analysis data.
 */
export const buildTrainingExample = (input: TrainingExampleInput): TrainingExample => ({
  id: `train_${input.analysis.eventId}_${Date.now()}`,
  eventType: input.event.type,
  evidenceSummary: summarizeEvidence(input.evidence),
  analysisOutput: formatAnalysisOutput(input.analysis),
  feedbackLabel: determineFeedbackLabel(input.feedback),
  metadata: {
    analysisId: input.analysis.eventId,
    eventId: input.event.id,
    confidenceScore: input.analysis.confidenceScore ?? 0,
    feedbackCount: input.feedback.length,
    ragDocsUsed: input.evidence.relatedDocs?.length ?? 0,
    actionsProposed: input.actions?.length ?? 0,
    createdAt: new Date().toISOString(),
  },
});

/**
 * Converts training example to OpenAI fine-tuning format.
 */
export const toOpenAIFormat = (example: TrainingExample): OpenAITrainingRow => {
  const systemPrompt = `You are an AI assistant analyzing CI/CD failures.
Analyze the evidence and provide a structured analysis with root cause, impact assessment, and recommended actions.`;

  const userContent = `Event Type: ${example.eventType}

Evidence:
${example.evidenceSummary}

Provide a detailed analysis.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
      { role: "assistant", content: example.analysisOutput },
    ],
  };
};

/**
 * Converts training examples to JSONL format for OpenAI fine-tuning.
 */
export const toJSONL = (examples: readonly TrainingExample[]): string =>
  examples.map((example) => JSON.stringify(toOpenAIFormat(example))).join("\n");

// ==================== Dataset Filtering ====================

/** Filter conditions for training examples. */
const FILTER_CONDITIONS: readonly FilterCondition[] = [
  {
    // Exclude unlabeled unless explicitly included
    shouldExclude: (example, options) =>
      !options.includeUnlabeled && example.feedbackLabel === "unlabeled",
  },
  {
    // Exclude low confidence examples
    shouldExclude: (example, options) =>
      options.minConfidence !== undefined &&
      example.metadata.confidenceScore < options.minConfidence,
  },
  {
    // Exclude examples not matching specified event types
    shouldExclude: (example, options) =>
      options.eventTypes !== undefined &&
      options.eventTypes.length > 0 &&
      !options.eventTypes.includes(example.eventType),
  },
];

/**
 * Checks if example passes all filter conditions.
 */
const passesAllFilters = (example: TrainingExample, options: DatasetBuildOptions): boolean =>
  !FILTER_CONDITIONS.some((condition) => condition.shouldExclude(example, options));

/**
 * Filters training examples based on options using handler pattern.
 */
export const filterExamples = (
  examples: readonly TrainingExample[],
  options: DatasetBuildOptions = {}
): readonly TrainingExample[] => {
  const filtered = examples.filter((example) => passesAllFilters(example, options));

  // Apply limit if specified
  return options.maxExamples !== undefined && filtered.length > options.maxExamples
    ? filtered.slice(0, options.maxExamples)
    : filtered;
};

// ==================== Dataset Statistics ====================

/**
 * Calculates dataset statistics using reduce.
 */
export const calculateDatasetStats = (examples: readonly TrainingExample[]): DatasetStats => {
  const initialState = {
    eventTypeDistribution: {} as Record<string, number>,
    totalConfidence: 0,
    labelCounts: { positive: 0, negative: 0, neutral: 0, unlabeled: 0 },
  };

  const stats = examples.reduce((accumulator, example) => {
    // Update event type distribution
    const currentCount = accumulator.eventTypeDistribution[example.eventType] ?? 0;

    return {
      eventTypeDistribution: {
        ...accumulator.eventTypeDistribution,
        [example.eventType]: currentCount + 1,
      },
      totalConfidence: accumulator.totalConfidence + example.metadata.confidenceScore,
      labelCounts: {
        ...accumulator.labelCounts,
        [example.feedbackLabel]: accumulator.labelCounts[example.feedbackLabel] + 1,
      },
    };
  }, initialState);

  return {
    totalExamples: examples.length,
    positiveExamples: stats.labelCounts.positive,
    negativeExamples: stats.labelCounts.negative,
    neutralExamples: stats.labelCounts.neutral,
    unlabeledExamples: stats.labelCounts.unlabeled,
    averageConfidence: examples.length > 0 ? stats.totalConfidence / examples.length : 0,
    eventTypeDistribution: stats.eventTypeDistribution,
  };
};

/**
 * Logs dataset statistics.
 */
export const logDatasetStats = (stats: DatasetStats): void => {
  logger.info("Dataset statistics", {
    total: stats.totalExamples,
    positive: stats.positiveExamples,
    negative: stats.negativeExamples,
    neutral: stats.neutralExamples,
    unlabeled: stats.unlabeledExamples,
    avgConfidence: stats.averageConfidence.toFixed(3),
    eventTypes: Object.keys(stats.eventTypeDistribution).length,
  });
};
