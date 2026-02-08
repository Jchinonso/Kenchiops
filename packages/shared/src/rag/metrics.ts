/**
 * RAG Metrics Module
 *
 * Provides observability metrics for embedding and ingestion operations.
 * Tracks embeddings/minute, cost, error rates, and table growth.
 *
 * @module rag/metrics
 */

import { createLogger } from "../core/logger.js";
import type {
  EmbeddingMetrics,
  IngestionMetrics,
  RAGMetricsSnapshot,
  MetricEntry,
  IngestionEntry,
} from "./types.js";

export type { EmbeddingMetrics, IngestionMetrics, RAGMetricsSnapshot } from "./types.js";

const logger = createLogger("rag-metrics");

// ==================== Constants ====================

const METRICS_CONSTANTS = {
  /** Window size for metrics calculation in minutes */
  DEFAULT_WINDOW_MINUTES: 60,
  /** Maximum entries to keep in memory */
  MAX_ENTRIES: 10000,
  /** Cost per 1K tokens for text-embedding-3-small (as of 2024) */
  COST_PER_1K_TOKENS_USD: 0.00002,
  /** Milliseconds per minute */
  MS_PER_MINUTE: 60000,
  /** Tokens per cost calculation unit */
  TOKENS_PER_COST_UNIT: 1000,
  /** Error rate threshold for alerts (10%) */
  ERROR_RATE_ALERT_THRESHOLD: 0.1,
  /** Latency threshold for alerts in milliseconds (5 seconds) */
  LATENCY_ALERT_THRESHOLD_MS: 5000,
  /** Percentage multiplier for display */
  PERCENTAGE_MULTIPLIER: 100,
} as const;

// ==================== State ====================

/**
 * In-memory storage for metrics.
 * Uses arrays with bounded size to prevent memory leaks.
 */
const embeddingEntries: MetricEntry[] = [];
const ingestionEntries: IngestionEntry[] = [];

// ==================== Helper Functions ====================

/**
 * Gets current timestamp in milliseconds.
 */
const now = (): number => Date.now();

/**
 * Calculates window start timestamp.
 */
const getWindowStart = (windowMinutes: number): number =>
  now() - windowMinutes * METRICS_CONSTANTS.MS_PER_MINUTE;

/**
 * Filters entries within the time window.
 */
const filterByWindow = <T extends { timestamp: number }>(
  entries: readonly T[],
  windowStart: number
): readonly T[] => entries.filter((entry) => entry.timestamp >= windowStart);

/**
 * Prunes old entries to keep memory bounded.
 */
const pruneEntries = <T>(entries: T[], maxSize: number): void => {
  if (entries.length > maxSize) {
    entries.splice(0, entries.length - maxSize);
  }
};

/**
 * Calculates average from array of numbers.
 */
const calculateAverage = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  return sum / values.length;
};

/**
 * Calculates estimated cost based on tokens.
 */
const calculateCost = (tokens: number): number =>
  (tokens / METRICS_CONSTANTS.TOKENS_PER_COST_UNIT) * METRICS_CONSTANTS.COST_PER_1K_TOKENS_USD;

/**
 * Formats error rate as percentage string.
 */
const formatErrorRatePercent = (rate: number): string =>
  (rate * METRICS_CONSTANTS.PERCENTAGE_MULTIPLIER).toFixed(1);

// ==================== Public API ====================

/**
 * Records an embedding operation metric.
 *
 * @param tokens - Number of tokens processed
 * @param latencyMs - Operation latency in milliseconds
 * @param success - Whether the operation succeeded
 */
export const recordEmbeddingOperation = (
  tokens: number,
  latencyMs: number,
  success: boolean
): void => {
  embeddingEntries.push({
    timestamp: now(),
    tokens,
    latencyMs,
    success,
  });

  pruneEntries(embeddingEntries, METRICS_CONSTANTS.MAX_ENTRIES);

  logger.debug("Recorded embedding operation", {
    tokens,
    latencyMs,
    success,
  });
};

/**
 * Records an ingestion operation metric.
 *
 * @param type - Type of ingestion (diff or knowledge)
 * @param chunksCreated - Number of chunks created
 * @param chunksEmbedded - Number of chunks embedded
 * @param errorCount - Number of errors encountered
 */
export const recordIngestionOperation = (
  type: "diff" | "knowledge",
  chunksCreated: number,
  chunksEmbedded: number,
  errorCount: number
): void => {
  ingestionEntries.push({
    timestamp: now(),
    type,
    chunksCreated,
    chunksEmbedded,
    errorCount,
  });

  pruneEntries(ingestionEntries, METRICS_CONSTANTS.MAX_ENTRIES);

  logger.debug("Recorded ingestion operation", {
    type,
    chunksCreated,
    chunksEmbedded,
    errorCount,
  });
};

/**
 * Gets embedding metrics for a time window.
 *
 * @param windowMinutes - Time window in minutes
 * @returns Embedding metrics
 */
export const getEmbeddingMetrics = (
  windowMinutes: number = METRICS_CONSTANTS.DEFAULT_WINDOW_MINUTES
): EmbeddingMetrics => {
  const windowStart = getWindowStart(windowMinutes);
  const windowEntries = filterByWindow(embeddingEntries, windowStart);

  const successfulEntries = windowEntries.filter((entry) => entry.success);
  const failedEntries = windowEntries.filter((entry) => !entry.success);

  const totalTokens = windowEntries.reduce((sum, entry) => sum + entry.tokens, 0);
  const latencies = successfulEntries.map((entry) => entry.latencyMs);

  return {
    totalOperations: windowEntries.length,
    totalTokens,
    totalErrors: failedEntries.length,
    averageLatencyMs: calculateAverage(latencies),
    operationsPerMinute: windowMinutes > 0 ? windowEntries.length / windowMinutes : 0,
    estimatedCostUsd: calculateCost(totalTokens),
  };
};

/**
 * Gets ingestion metrics for a time window.
 *
 * @param windowMinutes - Time window in minutes
 * @returns Ingestion metrics
 */
export const getIngestionMetrics = (
  windowMinutes: number = METRICS_CONSTANTS.DEFAULT_WINDOW_MINUTES
): IngestionMetrics => {
  const windowStart = getWindowStart(windowMinutes);
  const windowEntries = filterByWindow(ingestionEntries, windowStart);

  const diffEntries = windowEntries.filter((entry) => entry.type === "diff");
  const knowledgeEntries = windowEntries.filter((entry) => entry.type === "knowledge");

  return {
    diffChunksCreated: diffEntries.reduce((sum, entry) => sum + entry.chunksCreated, 0),
    diffChunksEmbedded: diffEntries.reduce((sum, entry) => sum + entry.chunksEmbedded, 0),
    diffIngestionErrors: diffEntries.reduce((sum, entry) => sum + entry.errorCount, 0),
    knowledgeDocsCreated: knowledgeEntries.reduce((sum, entry) => sum + entry.chunksCreated, 0),
    knowledgeDocsEmbedded: knowledgeEntries.reduce((sum, entry) => sum + entry.chunksEmbedded, 0),
    knowledgeIngestionErrors: knowledgeEntries.reduce((sum, entry) => sum + entry.errorCount, 0),
  };
};

/**
 * Gets a complete RAG metrics snapshot.
 *
 * @param windowMinutes - Time window in minutes
 * @returns Complete metrics snapshot
 */
export const getRAGMetricsSnapshot = (
  windowMinutes: number = METRICS_CONSTANTS.DEFAULT_WINDOW_MINUTES
): RAGMetricsSnapshot => ({
  embedding: getEmbeddingMetrics(windowMinutes),
  ingestion: getIngestionMetrics(windowMinutes),
  timestamp: new Date().toISOString(),
  windowMinutes,
});

/**
 * Logs current RAG metrics for monitoring.
 * Should be called periodically (e.g., every minute) for dashboards.
 *
 * @param windowMinutes - Time window in minutes
 */
export const logRAGMetrics = (
  windowMinutes: number = METRICS_CONSTANTS.DEFAULT_WINDOW_MINUTES
): void => {
  const snapshot = getRAGMetricsSnapshot(windowMinutes);

  logger.info("RAG metrics snapshot", {
    embedding: snapshot.embedding,
    ingestion: snapshot.ingestion,
    windowMinutes: snapshot.windowMinutes,
  });
};

/**
 * Checks for metric anomalies and logs alerts.
 * Returns list of detected alerts.
 *
 * @param windowMinutes - Time window in minutes
 * @returns List of alert messages
 */
export const checkRAGAlerts = (
  windowMinutes: number = METRICS_CONSTANTS.DEFAULT_WINDOW_MINUTES
): readonly string[] => {
  const alerts: string[] = [];
  const embedding = getEmbeddingMetrics(windowMinutes);
  const ingestion = getIngestionMetrics(windowMinutes);

  // Check embedding error rate
  const errorRate =
    embedding.totalOperations > 0 ? embedding.totalErrors / embedding.totalOperations : 0;

  if (errorRate > METRICS_CONSTANTS.ERROR_RATE_ALERT_THRESHOLD) {
    const message = `High embedding error rate: ${formatErrorRatePercent(errorRate)}%`;
    alerts.push(message);
    logger.warn(`RAG alert: ${message}`, { errorRate, totalOperations: embedding.totalOperations });
  }

  // Check average latency
  if (embedding.averageLatencyMs > METRICS_CONSTANTS.LATENCY_ALERT_THRESHOLD_MS) {
    const message = `High embedding latency: ${embedding.averageLatencyMs.toFixed(0)}ms`;
    alerts.push(message);
    logger.warn(`RAG alert: ${message}`, { averageLatencyMs: embedding.averageLatencyMs });
  }

  // Check diff ingestion error rate
  const diffErrorRate =
    ingestion.diffChunksCreated > 0
      ? ingestion.diffIngestionErrors / ingestion.diffChunksCreated
      : 0;

  if (diffErrorRate > METRICS_CONSTANTS.ERROR_RATE_ALERT_THRESHOLD) {
    const message = `High diff ingestion error rate: ${formatErrorRatePercent(diffErrorRate)}%`;
    alerts.push(message);
    logger.warn(`RAG alert: ${message}`, {
      diffErrorRate,
      diffChunksCreated: ingestion.diffChunksCreated,
    });
  }

  // Check knowledge doc ingestion error rate
  const knowledgeErrorRate =
    ingestion.knowledgeDocsCreated > 0
      ? ingestion.knowledgeIngestionErrors / ingestion.knowledgeDocsCreated
      : 0;

  if (knowledgeErrorRate > METRICS_CONSTANTS.ERROR_RATE_ALERT_THRESHOLD) {
    const message = `High knowledge doc ingestion error rate: ${formatErrorRatePercent(knowledgeErrorRate)}%`;
    alerts.push(message);
    logger.warn(`RAG alert: ${message}`, {
      knowledgeErrorRate,
      knowledgeDocsCreated: ingestion.knowledgeDocsCreated,
    });
  }

  return Object.freeze(alerts);
};

/**
 * Resets all metrics (for testing purposes).
 */
export const resetMetrics = (): void => {
  embeddingEntries.length = 0;
  ingestionEntries.length = 0;
  logger.debug("Reset RAG metrics");
};
