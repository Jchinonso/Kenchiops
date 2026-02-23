/**
 * Severity Classifier
 *
 * Pure, deterministic severity scoring for normalized alerts.
 * No LLM calls, no side effects, no I/O. All scoring factors are
 * traceable with human-readable reasons.
 *
 * @module services/severityClassifier
 */

import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import type { SeverityScore, SeverityFactor, SeverityConfig } from "../types/severityTypes.js";
import {
  SEVERITY_WEIGHTS,
  SERVICE_TIER_SCORES,
  UNKNOWN_ENVIRONMENT_SCORE,
  BUSINESS_HOURS_START_UTC,
  BUSINESS_HOURS_END_UTC,
  BUSINESS_HOURS_SCORE,
  OFF_HOURS_SCORE,
  METRICS_BREACH_SCORE,
  METRICS_NO_BREACH_SCORE,
} from "../constants/triageConstants.js";

// ==================== Factor Scoring Functions ====================

/**
 * Scores the alert based on its source-reported severity/urgency.
 */
const scoreSourceSeverity = (alert: NormalizedAlert, config: SeverityConfig): SeverityFactor => {
  const severityKey = alert.severity.toLowerCase();
  const rawScore = config.sourceSeverityMap[severityKey] ?? 0;
  const normalizedScore = Math.round((rawScore / 100) * SEVERITY_WEIGHTS.SOURCE_SEVERITY);

  return {
    name: "source_severity",
    weight: SEVERITY_WEIGHTS.SOURCE_SEVERITY,
    score: normalizedScore,
    maxScore: SEVERITY_WEIGHTS.SOURCE_SEVERITY,
    reason: `Source severity "${alert.severity}" maps to base score ${rawScore}/100`,
  };
};

/**
 * Scores based on the criticality tier of the affected service.
 */
const scoreServiceCriticality = (
  alert: NormalizedAlert,
  config: SeverityConfig
): SeverityFactor => {
  const serviceName = alert.serviceName?.toLowerCase() ?? "";
  const tier = serviceName ? (config.serviceTiers[serviceName] ?? "unknown") : "unknown";
  const score = SERVICE_TIER_SCORES[tier];
  const maxWeight = SEVERITY_WEIGHTS.SERVICE_CRITICALITY;

  return {
    name: "service_criticality",
    weight: maxWeight,
    score,
    maxScore: maxWeight,
    reason: serviceName
      ? `Service "${alert.serviceName}" is ${tier} (score ${score}/${maxWeight})`
      : `No service name provided (unknown tier, score ${score}/${maxWeight})`,
  };
};

/**
 * Scores based on the environment where the alert occurred.
 */
const scoreEnvironment = (alert: NormalizedAlert, config: SeverityConfig): SeverityFactor => {
  const envKey = alert.environment?.toLowerCase() ?? "";
  const score = envKey
    ? (config.environmentScores[envKey] ?? UNKNOWN_ENVIRONMENT_SCORE)
    : UNKNOWN_ENVIRONMENT_SCORE;
  const maxWeight = SEVERITY_WEIGHTS.ENVIRONMENT;

  return {
    name: "environment",
    weight: maxWeight,
    score,
    maxScore: maxWeight,
    reason: alert.environment
      ? `Environment "${alert.environment}" scores ${score}/${maxWeight}`
      : `No environment specified (score ${score}/${maxWeight})`,
  };
};

/**
 * Finds the highest-boosting keyword match from the given text.
 */
const findBestKeywordMatch = (
  searchText: string,
  patterns: SeverityConfig["keywordPatterns"]
): { readonly boost: number; readonly label: string } | null => {
  const matches = patterns.filter((kp) => kp.pattern.test(searchText));
  const { length: matchCount } = matches;

  if (matchCount === 0) {
    return null;
  }

  return matches.reduce(
    (best, current) => (current.boost > best.boost ? current : best),
    matches[0]
  );
};

/**
 * Scores based on keyword patterns found in alert title and description.
 * Returns the highest-boosting match only (not cumulative).
 */
const scoreKeywordPatterns = (alert: NormalizedAlert, config: SeverityConfig): SeverityFactor => {
  const searchText = [alert.title, alert.description ?? ""].join(" ");
  const maxWeight = SEVERITY_WEIGHTS.KEYWORD_PATTERNS;
  const bestMatch = findBestKeywordMatch(searchText, config.keywordPatterns);

  if (!bestMatch) {
    return {
      name: "keyword_patterns",
      weight: maxWeight,
      score: 0,
      maxScore: maxWeight,
      reason: "No severity-boosting keywords found in alert text",
    };
  }

  const { boost, label } = bestMatch;
  const score = Math.min(boost, maxWeight);

  return {
    name: "keyword_patterns",
    weight: maxWeight,
    score,
    maxScore: maxWeight,
    reason: `Keyword "${label}" matched (boost ${score}/${maxWeight})`,
  };
};

/**
 * Scores based on time of day (UTC).
 * Off-hours alerts score higher because fewer responders are available.
 */
const scoreTimeOfDay = (receivedAt: Date): SeverityFactor => {
  const hour = receivedAt.getUTCHours();
  const isBusinessHours = hour >= BUSINESS_HOURS_START_UTC && hour < BUSINESS_HOURS_END_UTC;
  const score = isBusinessHours ? BUSINESS_HOURS_SCORE : OFF_HOURS_SCORE;
  const maxWeight = SEVERITY_WEIGHTS.TIME_OF_DAY;

  return {
    name: "time_of_day",
    weight: maxWeight,
    score,
    maxScore: maxWeight,
    reason: isBusinessHours
      ? `Received during business hours (${hour}:00 UTC, score ${score}/${maxWeight})`
      : `Received off-hours (${hour}:00 UTC, score ${score}/${maxWeight})`,
  };
};

/**
 * Scores based on whether alert metrics breach known thresholds.
 * Currently checks for any non-empty metrics as a signal.
 */
const scoreMetricsBreach = (alert: NormalizedAlert): SeverityFactor => {
  const { length: metricCount } = Object.keys(alert.metrics);
  const hasMetrics = metricCount > 0;
  const score = hasMetrics ? METRICS_BREACH_SCORE : METRICS_NO_BREACH_SCORE;
  const maxWeight = SEVERITY_WEIGHTS.METRICS_BREACH;

  return {
    name: "metrics_breach",
    weight: maxWeight,
    score,
    maxScore: maxWeight,
    reason: hasMetrics
      ? `Metrics present (${metricCount} metric(s), score ${score}/${maxWeight})`
      : `No metrics attached to alert (score ${score}/${maxWeight})`,
  };
};

// ==================== Label Resolution ====================

/**
 * Maps a total score to a severity label using the configured thresholds.
 * Thresholds are evaluated in descending order; first match wins.
 */
const resolveLabel = (total: number, config: SeverityConfig): AlertSeverity => {
  const sorted = [...config.severityThresholds].sort(
    (left, right) => right.minScore - left.minScore
  );

  const match = sorted.find((threshold) => total >= threshold.minScore);
  return match?.label ?? "info";
};

// ==================== Public API ====================

/**
 * Classifies alert severity using weighted deterministic factors.
 *
 * This is a pure function: same input always produces same output.
 * No side effects, no I/O, no LLM.
 *
 * @param alert - The normalized alert to classify
 * @param config - Severity scoring configuration
 * @returns Severity score with traceable factor breakdown
 */
export const classifyAlertSeverity = (
  alert: NormalizedAlert,
  config: SeverityConfig
): SeverityScore => {
  const receivedAt = new Date(alert.receivedAt);

  const factors: readonly SeverityFactor[] = [
    scoreSourceSeverity(alert, config),
    scoreServiceCriticality(alert, config),
    scoreEnvironment(alert, config),
    scoreKeywordPatterns(alert, config),
    scoreTimeOfDay(receivedAt),
    scoreMetricsBreach(alert),
  ];

  const total = Math.min(
    factors.reduce((sum, factor) => sum + factor.score, 0),
    100
  );

  return {
    total,
    label: resolveLabel(total, config),
    factors,
  };
};
