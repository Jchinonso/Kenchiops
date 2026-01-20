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
import type { LLMAnalysisResult, Evidence, Event, ActionProposal } from "../core/types.js";
import type { FeedbackRecord, FeedbackType } from "../database/index.js";

const logger = createLogger("dataset-builder");

// ==================== Types ====================

/**
 * Training example for fine-tuning.
 */
export interface TrainingExample {
  readonly id: string;
  readonly eventType: string;
  readonly evidenceSummary: string;
  readonly analysisOutput: string;
  readonly feedbackLabel: FeedbackQualityLabel;
  readonly metadata: TrainingExampleMetadata;
}

/**
 * Quality label derived from feedback.
 */
export type FeedbackQualityLabel = "positive" | "negative" | "neutral" | "unlabeled";

/**
 * Metadata for training example provenance.
 */
export interface TrainingExampleMetadata {
  readonly analysisId: string;
  readonly eventId: string;
  readonly confidenceScore: number;
  readonly feedbackCount: number;
  readonly ragDocsUsed: number;
  readonly actionsProposed: number;
  readonly createdAt: string;
}

/**
 * OpenAI fine-tuning format (chat completion).
 */
export interface OpenAITrainingRow {
  readonly messages: readonly OpenAIMessage[];
}

/**
 * OpenAI message in chat format.
 */
interface OpenAIMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/**
 * Input for building a training example.
 */
export interface TrainingExampleInput {
  readonly event: Event;
  readonly evidence: Evidence;
  readonly analysis: LLMAnalysisResult;
  readonly feedback: readonly FeedbackRecord[];
  readonly actions?: readonly ActionProposal[];
}

/**
 * Dataset statistics.
 */
export interface DatasetStats {
  readonly totalExamples: number;
  readonly positiveExamples: number;
  readonly negativeExamples: number;
  readonly neutralExamples: number;
  readonly unlabeledExamples: number;
  readonly averageConfidence: number;
  readonly eventTypeDistribution: Record<string, number>;
}

/**
 * Options for dataset building.
 */
export interface DatasetBuildOptions {
  readonly includeUnlabeled?: boolean;
  readonly minConfidence?: number;
  readonly maxExamples?: number;
  readonly eventTypes?: readonly string[];
}

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

/**
 * Determines quality label from feedback records.
 */
const determineFeedbackLabel = (feedback: readonly FeedbackRecord[]): FeedbackQualityLabel => {
  if (feedback.length === 0) {
    return "unlabeled";
  }

  const posCount = feedback.filter((fb) => POSITIVE_FEEDBACK_TYPES.has(fb.feedbackType)).length;
  const negCount = feedback.filter((fb) => NEGATIVE_FEEDBACK_TYPES.has(fb.feedbackType)).length;
  const neutralCount = feedback.filter((fb) => NEUTRAL_FEEDBACK_TYPES.has(fb.feedbackType)).length;

  // Majority voting with ties going to neutral
  if (posCount > negCount && posCount > neutralCount) {
    return "positive";
  }
  if (negCount > posCount && negCount > neutralCount) {
    return "negative";
  }
  if (neutralCount > 0 || posCount > 0 || negCount > 0) {
    return "neutral";
  }
  return "unlabeled";
};

// ==================== Anonymization ====================

/**
 * Anonymizes event data for training.
 * @internal Reserved for future use in advanced anonymization.
 */
const _anonymizeEvent = (event: Event): string =>
  JSON.stringify({
    type: event.type,
    severity: event.severity,
    title: redactSecrets(event.title ?? ""),
    source: event.source,
  });

/**
 * Summarizes evidence for training (anonymized).
 */
const summarizeEvidence = (evidence: Evidence): string => {
  const parts: string[] = [];

  if (evidence.logs && evidence.logs.length > 0) {
    const logSummary = evidence.logs.slice(0, 5).map((log) => ({
      level: log.level,
      message: redactSecrets(log.message).slice(0, 200),
    }));
    parts.push(`Logs (${evidence.logs.length} entries): ${JSON.stringify(logSummary)}`);
  }

  if (evidence.gitHistory && evidence.gitHistory.length > 0) {
    const commitSummary = evidence.gitHistory.slice(0, 3).map((commit) => ({
      message: redactSecrets(commit.message).slice(0, 100),
      filesChanged: commit.filesChanged?.length ?? 0,
    }));
    parts.push(`Git commits (${evidence.gitHistory.length}): ${JSON.stringify(commitSummary)}`);
  }

  if (evidence.relatedDocs && evidence.relatedDocs.length > 0) {
    const docSummary = evidence.relatedDocs.slice(0, 3).map((doc) => ({
      type: doc.type,
      title: doc.title,
      similarity: doc.similarity,
    }));
    parts.push(`Related docs (${evidence.relatedDocs.length}): ${JSON.stringify(docSummary)}`);
  }

  return parts.join("\n");
};

/**
 * Formats analysis output for training (anonymized).
 */
const formatAnalysisOutput = (analysis: LLMAnalysisResult): string => {
  const redactedSummary = redactSecrets(analysis.summary);
  const redactedCause = analysis.identifiedCause ? redactSecrets(analysis.identifiedCause) : null;
  const redactedReasoning = analysis.reasoning ? redactSecrets(analysis.reasoning) : null;

  const output = {
    summary: redactedSummary,
    identifiedCause: redactedCause,
    confidence: analysis.confidence,
    confidenceScore: analysis.confidenceScore,
    reasoning: redactedReasoning,
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
export const buildTrainingExample = (input: TrainingExampleInput): TrainingExample => {
  const feedbackLabel = determineFeedbackLabel(input.feedback);

  return {
    id: `train_${input.analysis.eventId}_${Date.now()}`,
    eventType: input.event.type,
    evidenceSummary: summarizeEvidence(input.evidence),
    analysisOutput: formatAnalysisOutput(input.analysis),
    feedbackLabel,
    metadata: {
      analysisId: input.analysis.eventId,
      eventId: input.event.id,
      confidenceScore: input.analysis.confidenceScore ?? 0,
      feedbackCount: input.feedback.length,
      ragDocsUsed: input.evidence.relatedDocs?.length ?? 0,
      actionsProposed: input.actions?.length ?? 0,
      createdAt: new Date().toISOString(),
    },
  };
};

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

// ==================== Dataset Building ====================

/**
 * Filters training examples based on options.
 */
export const filterExamples = (
  examples: readonly TrainingExample[],
  options: DatasetBuildOptions = {}
): readonly TrainingExample[] => {
  const filtered = examples.filter((example) => {
    // Filter by labeled status
    if (!options.includeUnlabeled && example.feedbackLabel === "unlabeled") {
      return false;
    }

    // Filter by confidence
    if (
      options.minConfidence !== undefined &&
      example.metadata.confidenceScore < options.minConfidence
    ) {
      return false;
    }

    // Filter by event type
    if (options.eventTypes && options.eventTypes.length > 0) {
      if (!options.eventTypes.includes(example.eventType)) {
        return false;
      }
    }

    return true;
  });

  // Limit examples
  if (options.maxExamples !== undefined && filtered.length > options.maxExamples) {
    return filtered.slice(0, options.maxExamples);
  }

  return filtered;
};

/**
 * Calculates dataset statistics.
 */
export const calculateDatasetStats = (examples: readonly TrainingExample[]): DatasetStats => {
  const eventTypeDistribution: Record<string, number> = {};
  let totalConfidence = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let unlabeledCount = 0;

  examples.forEach((example) => {
    // Count event types
    eventTypeDistribution[example.eventType] = (eventTypeDistribution[example.eventType] ?? 0) + 1;

    // Accumulate confidence
    totalConfidence += example.metadata.confidenceScore;

    // Count labels
    const labelCounters: Record<FeedbackQualityLabel, () => void> = {
      positive: () => positiveCount++,
      negative: () => negativeCount++,
      neutral: () => neutralCount++,
      unlabeled: () => unlabeledCount++,
    };
    labelCounters[example.feedbackLabel]();
  });

  return {
    totalExamples: examples.length,
    positiveExamples: positiveCount,
    negativeExamples: negativeCount,
    neutralExamples: neutralCount,
    unlabeledExamples: unlabeledCount,
    averageConfidence: examples.length > 0 ? totalConfidence / examples.length : 0,
    eventTypeDistribution,
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
