/**
 * Investigation Service Helpers
 *
 * Pure helper functions for investigation intent validation,
 * evidence sorting, correlation pattern detection, and
 * fallback diagnosis generation.
 *
 * @module investigation/helpers
 */

import type {
  InvestigationIntent,
  InvestigationEvidenceItem,
  InvestigationCorrelation,
  InvestigationDiagnosis,
  InvestigationSymptom,
  TimelineEvent,
  SuggestedInvestigationAction,
} from "./types.js";
import {
  INVESTIGATION_PIPELINE_DEFAULTS,
  INVESTIGATION_PATTERN_THRESHOLDS,
  VALID_SYMPTOMS,
  FALLBACK_ACTIONS_BY_SYMPTOM,
  FALLBACK_DIAGNOSIS_CONFIDENCE,
  COMMON_FACTOR_CONFIG,
} from "./constants.js";
import { MONITORING_DEFAULTS } from "./monitoringConstants.js";

// ==================== Shared Utilities ====================

/** Checks whether an array has no elements */
const isEmpty = (arr: readonly unknown[]): boolean => {
  const { length: count } = arr;
  return count === 0;
};

// ==================== Fallback Values ====================

/**
 * Fallback intent returned when LLM parsing fails.
 */
export const FALLBACK_INTENT: InvestigationIntent = {
  symptom: "unknown",
  confidenceScore: 0,
  serviceName: null,
  endpoint: null,
  environment: "production",
  timeRangeFrom: null,
  timeRangeTo: null,
} as const;

// ==================== Intent Parsing ====================

/**
 * Type guard for valid investigation symptom values.
 */
const isValidSymptom = (value: unknown): value is InvestigationSymptom =>
  typeof value === "string" && VALID_SYMPTOMS.includes(value as InvestigationSymptom);

/**
 * Validates and extracts a confidence score from a parsed value.
 * Clamps to [0, 1] range.
 */
const extractConfidence = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

/**
 * Extracts an optional string field from parsed LLM output.
 */
const extractOptionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

/**
 * Validates the parsed intent object has required fields.
 * Returns a valid InvestigationIntent or null on failure.
 */
export const validateParsedIntent = (
  parsed: Readonly<Record<string, unknown>>
): InvestigationIntent | null => {
  const {
    symptom,
    confidenceScore,
    serviceName,
    endpoint,
    environment,
    timeRangeFrom,
    timeRangeTo,
  } = parsed;

  if (!isValidSymptom(symptom)) {
    return null;
  }

  return {
    symptom,
    confidenceScore: extractConfidence(confidenceScore),
    serviceName: extractOptionalString(serviceName),
    endpoint: extractOptionalString(endpoint),
    environment: extractOptionalString(environment) ?? "production",
    timeRangeFrom: extractOptionalString(timeRangeFrom),
    timeRangeTo: extractOptionalString(timeRangeTo),
  };
};

// ==================== Evidence Sorting ====================

/**
 * Compares two evidence items for sorting: by relevance (desc), then timestamp (desc).
 */
export const compareEvidence = (
  itemA: InvestigationEvidenceItem,
  itemB: InvestigationEvidenceItem
): number => {
  const relevanceDiff = itemB.relevance - itemA.relevance;
  if (relevanceDiff !== 0) {
    return relevanceDiff;
  }
  return new Date(itemB.timestamp).getTime() - new Date(itemA.timestamp).getTime();
};

// ==================== Correlation Helpers ====================

/**
 * Extracts the service name from evidence metadata, handling both camelCase and snake_case keys.
 */
const getEvidenceServiceName = (item: InvestigationEvidenceItem): string | null => {
  const { metadata } = item;
  const raw = metadata.serviceName ?? metadata.service_name;
  return typeof raw === "string" ? raw : null;
};

/**
 * Extracts unique, non-null service names from evidence metadata.
 */
export const extractServiceNames = (
  evidence: readonly InvestigationEvidenceItem[]
): readonly string[] => {
  const allNames = evidence.flatMap((item) => {
    const name = getEvidenceServiceName(item);
    return name === null ? [] : [name];
  });
  return [...new Set(allNames)];
};

/**
 * Builds a frequency map of service name occurrences across evidence items.
 */
const buildServiceFrequencyMap = (
  evidence: readonly InvestigationEvidenceItem[]
): ReadonlyMap<string, number> =>
  evidence.reduce<ReadonlyMap<string, number>>((acc, item) => {
    const svc = getEvidenceServiceName(item);
    if (svc === null) {
      return acc;
    }
    const current = acc.get(svc) ?? 0;
    return new Map([...acc, [svc, current + 1]]);
  }, new Map());

/**
 * Counts how many evidence items reference each service name.
 * Uses a pre-built frequency map for O(n) instead of O(n*m).
 */
const getServiceOccurrences = (
  evidence: readonly InvestigationEvidenceItem[]
): ReadonlyArray<readonly [string, number]> => {
  const serviceNames = extractServiceNames(evidence);
  const frequencyMap = buildServiceFrequencyMap(evidence);
  return serviceNames.map((name) => [name, frequencyMap.get(name) ?? 0] as const);
};

/**
 * Checks whether evidence shows increasing severity over time.
 * Looks at the last 3 chronological items for rising relevance.
 */
const hasEscalatingSeverity = (evidence: readonly InvestigationEvidenceItem[]): boolean => {
  const sorted = [...evidence].sort(
    (itemA, itemB) => new Date(itemA.timestamp).getTime() - new Date(itemB.timestamp).getTime()
  );

  if (sorted.length < 3) {
    return false;
  }

  const recent = sorted.slice(-3);
  return recent[0].relevance < recent[1].relevance && recent[1].relevance < recent[2].relevance;
};

/**
 * Detects patterns from evidence items.
 * Pure function -- deterministic, no I/O.
 */
export const detectPatterns = (
  evidence: readonly InvestigationEvidenceItem[]
): readonly string[] => {
  const serviceOccurrences = getServiceOccurrences(evidence);
  const now = Date.now();
  const recentThresholdMs = INVESTIGATION_PATTERN_THRESHOLDS.RECENT_HOURS * 60 * 60 * 1000;

  const recurringPatterns = serviceOccurrences
    .filter(([, count]) => count >= INVESTIGATION_PATTERN_THRESHOLDS.RECURRING_SERVICE_MIN)
    .map(
      ([name, count]) => `recurring_service: ${name} appears in ${String(count)} evidence items`
    );

  const recentCount = evidence.filter(
    (item) => now - new Date(item.timestamp).getTime() < recentThresholdMs
  ).length;
  const recentPatterns =
    recentCount >= INVESTIGATION_PATTERN_THRESHOLDS.RECENT_FAILURES_MIN
      ? [
          `recent_failures: ${String(recentCount)} evidence items within the last ${String(INVESTIGATION_PATTERN_THRESHOLDS.RECENT_HOURS)} hours`,
        ]
      : [];

  const uniqueServices = extractServiceNames(evidence);
  const crossServicePatterns =
    uniqueServices.length >= INVESTIGATION_PATTERN_THRESHOLDS.CROSS_SERVICE_MIN
      ? [
          `cross_service: ${String(uniqueServices.length)} different services involved (${uniqueServices.join(", ")})`,
        ]
      : [];

  const escalatingPatterns = hasEscalatingSeverity(evidence)
    ? ["escalating: evidence shows increasing severity over time"]
    : [];

  return [...recurringPatterns, ...recentPatterns, ...crossServicePatterns, ...escalatingPatterns];
};

/**
 * Builds a sorted timeline from evidence items.
 */
export const buildTimeline = (
  evidence: readonly InvestigationEvidenceItem[]
): readonly TimelineEvent[] =>
  [...evidence]
    .sort(
      (itemA, itemB) => new Date(itemA.timestamp).getTime() - new Date(itemB.timestamp).getTime()
    )
    .map((item) => ({
      timestamp: item.timestamp,
      type: item.source,
      description: item.title,
      sourceId: item.id,
    }));

// ==================== Common Factor Extraction ====================

/* eslint-disable @typescript-eslint/naming-convention -- stop words are lowercase by definition */
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "was",
  "were",
  "are",
  "been",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "and",
  "but",
  "or",
  "nor",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "too",
  "very",
  "just",
  "about",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "my",
  "your",
]);
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Extracts unique meaningful words from a text summary.
 */
const extractUniqueWords = (summary: string): ReadonlySet<string> => {
  const words = summary
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length >= COMMON_FACTOR_CONFIG.MIN_WORD_LENGTH && !STOP_WORDS.has(word));
  return new Set(words);
};

/**
 * Extracts common keywords from evidence summaries.
 * A keyword is "common" if it appears in 2+ evidence item summaries.
 */
export const extractCommonFactors = (
  evidence: readonly InvestigationEvidenceItem[]
): readonly string[] => {
  const wordSets = evidence.map((item) => extractUniqueWords(item.summary));
  const allUniqueWords = [...new Set(wordSets.flatMap((wordSet) => [...wordSet]))];

  const wordWithCounts = allUniqueWords.map((word) => ({
    word,
    count: wordSets.filter((wordSet) => wordSet.has(word)).length,
  }));

  return wordWithCounts
    .filter(({ count }) => count >= COMMON_FACTOR_CONFIG.MIN_OCCURRENCES)
    .sort((entryA, entryB) => entryB.count - entryA.count)
    .slice(0, COMMON_FACTOR_CONFIG.MAX_FACTORS)
    .map(({ word }) => word);
};

// ==================== Diagnosis Validation ====================

/** Valid priority values for investigation actions */
const VALID_PRIORITIES = new Set(["immediate", "short_term", "long_term"]);

/**
 * Validates a suggested action from the LLM response.
 */
const toSuggestedAction = (
  raw: Readonly<Record<string, unknown>>
): SuggestedInvestigationAction => {
  const { action: rawAction, reasoning: rawReasoning, priority: rawPriority } = raw;
  const action = typeof rawAction === "string" ? rawAction : "";
  const reasoning = typeof rawReasoning === "string" ? rawReasoning : "";
  const priority = typeof rawPriority === "string" ? rawPriority : "short_term";

  const normalizedPriority = VALID_PRIORITIES.has(priority)
    ? (priority as "immediate" | "short_term" | "long_term")
    : "short_term";

  return { action, reasoning, priority: normalizedPriority };
};

/** Checks if a string is non-empty after trimming */
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/**
 * Validates the parsed diagnosis and returns a valid InvestigationDiagnosis or null.
 */
export const validateParsedDiagnosis = (
  parsed: Readonly<Record<string, unknown>>,
  evidence: readonly InvestigationEvidenceItem[]
): InvestigationDiagnosis | null => {
  const { summary, rootCauseHypothesis, confidence, suggestedActions, evidenceCited } = parsed;

  if (!isNonEmptyString(summary)) {
    return null;
  }

  if (typeof rootCauseHypothesis !== "string") {
    return null;
  }

  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return null;
  }

  if (!Array.isArray(suggestedActions) || isEmpty(suggestedActions)) {
    return null;
  }

  const actions: readonly SuggestedInvestigationAction[] = (
    suggestedActions as ReadonlyArray<Readonly<Record<string, unknown>>>
  ).map(toSuggestedAction);

  const citedIds: readonly string[] = Array.isArray(evidenceCited)
    ? (evidenceCited as readonly unknown[]).filter((id): id is string => typeof id === "string")
    : [];

  const evidenceIdSet = new Set(evidence.map((item) => item.id));
  const validCitations = citedIds.filter((id) => evidenceIdSet.has(id));

  return {
    summary: summary.trim(),
    rootCauseHypothesis,
    confidence: Math.max(0, Math.min(1, confidence)),
    suggestedActions: actions,
    evidenceCited: validCitations,
    diagnosisSource: "ai",
  };
};

/** Formats a relevance score for display */
const formatRelevance = (value: number): string => value.toFixed(2);

/**
 * Generates a fallback diagnosis from evidence and correlation data.
 * Used when LLM diagnosis fails.
 */
export const generateFallbackDiagnosis = (
  description: string,
  intent: InvestigationIntent,
  evidence: readonly InvestigationEvidenceItem[],
  correlation: InvestigationCorrelation
): InvestigationDiagnosis => {
  const { length: evidenceCount } = evidence;
  const { length: serviceCount } = correlation.relatedServices;

  const summary = [
    `Investigation of "${description}" found`,
    `${String(evidenceCount)} related evidence items`,
    `across ${String(serviceCount)} services.`,
  ].join(" ");

  const topEvidence = evidence.slice(0, 3);
  const rootCauseHypothesis =
    topEvidence.length > 0
      ? topEvidence
          .map(
            ({ source, title, relevance }) =>
              `[${source}] ${title} (relevance: ${formatRelevance(relevance)})`
          )
          .join("; ")
      : "Insufficient evidence to form a root cause hypothesis.";

  const symptomActions = FALLBACK_ACTIONS_BY_SYMPTOM[intent.symptom];
  const suggestedActions: readonly SuggestedInvestigationAction[] = symptomActions.map(
    (action, index) => ({
      action,
      reasoning: `Standard action for ${intent.symptom} symptom pattern`,
      priority: (index === 0 ? "immediate" : "short_term") as
        | "immediate"
        | "short_term"
        | "long_term",
    })
  );

  return {
    summary,
    rootCauseHypothesis,
    confidence: FALLBACK_DIAGNOSIS_CONFIDENCE,
    suggestedActions,
    evidenceCited: topEvidence.map(({ id }) => id),
    diagnosisSource: "fallback",
  };
};

// ==================== Lookback Calculation ====================

/**
 * Determines the lookback window in hours from the intent's time range.
 * Falls back to INVESTIGATION_PIPELINE_DEFAULTS.EVIDENCE_LOOKBACK_HOURS.
 */
export const getLookbackHours = (intent: InvestigationIntent): number => {
  if (intent.timeRangeFrom) {
    const fromMs = new Date(intent.timeRangeFrom).getTime();
    if (!Number.isNaN(fromMs)) {
      const hoursBack = (Date.now() - fromMs) / (1000 * 60 * 60);
      if (hoursBack > 0) {
        // Clamp to MAX_LOOKBACK_HOURS to prevent excessive queries to monitoring providers
        return Math.min(Math.ceil(hoursBack), MONITORING_DEFAULTS.MAX_LOOKBACK_HOURS);
      }
    }
  }
  return INVESTIGATION_PIPELINE_DEFAULTS.EVIDENCE_LOOKBACK_HOURS;
};
