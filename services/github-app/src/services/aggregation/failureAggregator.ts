/**
 * Failure Aggregator Service
 *
 * Aggregates multiple CI check run failures for a single commit
 * before posting a consolidated analysis to GitHub and Slack.
 *
 * Uses debounce pattern to wait for related failures to arrive
 * before triggering consolidated posting.
 */

import { createLogger, ValidationError } from "@kenchi/shared";
import type {
  AggregatedFailures,
  AggregationKey,
  AggregationConfig,
  AnalyzedFailure,
  PendingAggregation,
  RepositoryInfo,
  PRContext,
  WorkflowContext,
  ConsolidatedPostResult,
} from "./types.js";
import { serializeAggregationKey, DEFAULT_AGGREGATION_CONFIG } from "./types.js";

const logger = createLogger("github-app");

/**
 * Callback type for when aggregation is ready to be posted
 */
export type AggregationReadyCallback = (
  aggregation: AggregatedFailures
) => Promise<ConsolidatedPostResult>;

/**
 * Creates a new aggregated failures object
 */
const createAggregatedFailures = (
  key: AggregationKey,
  repositoryInfo: RepositoryInfo,
  installationId: number,
  pullRequestNumbers: readonly number[],
  prContext: PRContext | null,
  workflowContext: WorkflowContext | null
): AggregatedFailures => ({
  commitSha: key.commitSha,
  repository: repositoryInfo,
  installationId,
  pullRequestNumbers,
  failures: [],
  prContext,
  workflowContext,
  firstFailureAt: new Date(),
  lastFailureAt: new Date(),
});

/**
 * Adds a failure to an aggregation, returning updated aggregation
 */
const addFailureToAggregation = (
  aggregation: AggregatedFailures,
  failure: AnalyzedFailure,
  maxFailures: number
): AggregatedFailures => {
  // Skip if we already have this check run
  const existingIndex = aggregation.failures.findIndex((f) => f.checkRunId === failure.checkRunId);

  if (existingIndex >= 0) {
    // Update existing failure
    const updatedFailures = [...aggregation.failures];
    updatedFailures[existingIndex] = failure;
    return {
      ...aggregation,
      failures: updatedFailures,
      lastFailureAt: new Date(),
    };
  }

  // Add new failure (up to max)
  if (aggregation.failures.length >= maxFailures) {
    logger.warn("Max failures reached for aggregation", {
      commitSha: aggregation.commitSha.substring(0, 7),
      maxFailures,
      currentCount: aggregation.failures.length,
    });
    return aggregation;
  }

  return {
    ...aggregation,
    failures: [...aggregation.failures, failure],
    lastFailureAt: new Date(),
  };
};

/**
 * Failure Aggregator
 *
 * Manages aggregation of CI failures across check runs for a commit.
 * Uses debounce to wait for related failures before posting.
 */
export class FailureAggregator {
  private readonly pending: Map<string, PendingAggregation> = new Map();
  private readonly config: AggregationConfig;
  private readonly onReady: AggregationReadyCallback;
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(onReady: AggregationReadyCallback, config: Partial<AggregationConfig> = {}) {
    this.config = { ...DEFAULT_AGGREGATION_CONFIG, ...config };
    this.onReady = onReady;
    this.startCleanupInterval();
  }

  /**
   * Add a failure to the aggregator.
   * Starts or resets the debounce timer for this commit.
   */
  addFailure(
    key: AggregationKey,
    failure: AnalyzedFailure,
    repositoryInfo: RepositoryInfo,
    installationId: number,
    pullRequestNumbers: readonly number[],
    prContext: PRContext | null,
    workflowContext: WorkflowContext | null
  ): void {
    const serializedKey = serializeAggregationKey(key);
    const existing = this.pending.get(serializedKey);

    if (existing) {
      // Update existing aggregation
      this.updateExistingAggregation(existing, failure);
    } else {
      // Create new aggregation
      this.createNewAggregation(
        key,
        serializedKey,
        failure,
        repositoryInfo,
        installationId,
        pullRequestNumbers,
        prContext,
        workflowContext
      );
    }

    logger.info("Failure added to aggregation", {
      repository: key.repositoryFullName,
      commitSha: key.commitSha.substring(0, 7),
      checkName: failure.checkName,
      totalFailures: this.pending.get(serializedKey)?.data.failures.length ?? 0,
      debounceMs: this.config.debounceMs,
    });
  }

  /**
   * Force flush all pending aggregations immediately.
   * Useful for graceful shutdown.
   */
  async flushAll(): Promise<void> {
    const entries = Array.from(this.pending.entries());

    logger.info("Flushing all pending aggregations", {
      count: entries.length,
    });

    await Promise.all(entries.map(([key, pending]) => this.flushAggregation(key, pending)));
  }

  /**
   * Force flush a specific aggregation immediately.
   */
  async flushByKey(key: AggregationKey): Promise<void> {
    const serializedKey = serializeAggregationKey(key);
    const pending = this.pending.get(serializedKey);

    if (pending) {
      await this.flushAggregation(serializedKey, pending);
    }
  }

  /**
   * Get current aggregation status for monitoring.
   */
  getStatus(): { pendingCount: number; keys: string[] } {
    return {
      pendingCount: this.pending.size,
      keys: Array.from(this.pending.keys()),
    };
  }

  /**
   * Cleanup resources on shutdown.
   */
  destroy(): void {
    // Clear cleanup interval
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    // Clear all pending timers using functional pattern
    Array.from(this.pending.values())
      .filter((pending) => pending.timerId !== null)
      .map((pending) => clearTimeout(pending.timerId!));
    this.pending.clear();

    logger.info("FailureAggregator destroyed");
  }

  /**
   * Updates an existing aggregation with a new failure.
   */
  private updateExistingAggregation(existing: PendingAggregation, failure: AnalyzedFailure): void {
    // Clear existing timer
    if (existing.timerId) {
      clearTimeout(existing.timerId);
    }

    // Update aggregation data
    existing.data = addFailureToAggregation(
      existing.data,
      failure,
      this.config.maxFailuresPerCommit
    );

    // Check if max wait time exceeded
    const elapsed = Date.now() - existing.data.firstFailureAt.getTime();
    if (elapsed >= this.config.maxWaitMs) {
      // Flush immediately - we've waited long enough
      this.scheduleFlush(existing, 0);
    } else {
      // Reset debounce timer
      this.scheduleFlush(existing, this.config.debounceMs);
    }
  }

  /**
   * Creates a new aggregation entry.
   */
  private createNewAggregation(
    key: AggregationKey,
    serializedKey: string,
    failure: AnalyzedFailure,
    repositoryInfo: RepositoryInfo,
    installationId: number,
    pullRequestNumbers: readonly number[],
    prContext: PRContext | null,
    workflowContext: WorkflowContext | null
  ): void {
    const aggregation = createAggregatedFailures(
      key,
      repositoryInfo,
      installationId,
      pullRequestNumbers,
      prContext,
      workflowContext
    );

    const withFailure = addFailureToAggregation(
      aggregation,
      failure,
      this.config.maxFailuresPerCommit
    );

    const pending: PendingAggregation = {
      key,
      data: withFailure,
      timerId: null,
    };

    this.pending.set(serializedKey, pending);
    this.scheduleFlush(pending, this.config.debounceMs);
  }

  /**
   * Schedules a flush for an aggregation after delay.
   */
  private scheduleFlush(pending: PendingAggregation, delayMs: number): void {
    const serializedKey = serializeAggregationKey(pending.key);

    pending.timerId = setTimeout(() => {
      this.flushAggregation(serializedKey, pending).catch((error) => {
        logger.error("Error during scheduled flush", {
          key: serializedKey,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
    }, delayMs);
  }

  /**
   * Flushes an aggregation - posts consolidated analysis and removes from pending.
   */
  private async flushAggregation(
    serializedKey: string,
    pending: PendingAggregation
  ): Promise<void> {
    // Clear timer if exists
    if (pending.timerId) {
      clearTimeout(pending.timerId);
      pending.timerId = null;
    }

    // Remove from pending
    this.pending.delete(serializedKey);

    const { data } = pending;

    // Skip if no failures (shouldn't happen, but defensive)
    if (data.failures.length === 0) {
      logger.warn("Skipping flush - no failures in aggregation", {
        key: serializedKey,
      });
      return;
    }

    logger.info("Flushing aggregation - posting consolidated analysis", {
      repository: data.repository.fullName,
      commitSha: data.commitSha.substring(0, 7),
      failureCount: data.failures.length,
      checkNames: data.failures.map((f) => f.checkName),
      waitedMs: Date.now() - data.firstFailureAt.getTime(),
    });

    try {
      const result = await this.onReady(data);

      logger.info("Consolidated analysis posted", {
        repository: data.repository.fullName,
        commitSha: data.commitSha.substring(0, 7),
        success: result.success,
        prCommentsPosted: result.prCommentsPosted,
        slackMessageSent: result.slackMessageSent,
        errors: result.errors,
      });
    } catch (error) {
      logger.error("Failed to post consolidated analysis", {
        repository: data.repository.fullName,
        commitSha: data.commitSha.substring(0, 7),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Starts periodic cleanup of stale entries.
   */
  private startCleanupInterval(): void {
    // Run cleanup every minute
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupStaleEntries();
    }, 60_000);
  }

  /**
   * Removes entries that have been pending too long (safety net).
   * Uses functional pattern to identify and flush stale entries.
   */
  private cleanupStaleEntries(): void {
    const now = Date.now();

    // Find stale entries using functional filter
    const staleEntries = Array.from(this.pending.entries()).filter(
      ([, pending]) => now - pending.data.firstFailureAt.getTime() > this.config.staleEntryMs
    );

    if (staleEntries.length === 0) {
      return;
    }

    const staleKeys = staleEntries.map(([key]) => key);

    logger.warn("Cleaning up stale aggregation entries", {
      count: staleKeys.length,
      keys: staleKeys,
    });

    // Flush stale entries using map
    staleEntries.map(([key, pending]) =>
      this.flushAggregation(key, pending).catch((error) => {
        logger.error("Error flushing stale entry", {
          key,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      })
    );
  }
}

/**
 * Singleton instance for the failure aggregator.
 * Initialized lazily when first needed.
 */
let aggregatorInstance: FailureAggregator | null = null;

/**
 * Initializes the singleton aggregator with the given callback.
 * Must be called before using getAggregator().
 */
export const initializeAggregator = (
  onReady: AggregationReadyCallback,
  config?: Partial<AggregationConfig>
): FailureAggregator => {
  if (aggregatorInstance) {
    aggregatorInstance.destroy();
  }
  aggregatorInstance = new FailureAggregator(onReady, config);
  return aggregatorInstance;
};

/**
 * Gets the singleton aggregator instance.
 * Throws if not initialized.
 */
export const getAggregator = (): FailureAggregator => {
  if (!aggregatorInstance) {
    throw new ValidationError("FailureAggregator not initialized. Call initializeAggregator() first.");
  }
  return aggregatorInstance;
};

/**
 * Destroys the singleton aggregator instance.
 * Should be called on graceful shutdown.
 */
export const destroyAggregator = async (): Promise<void> => {
  if (aggregatorInstance) {
    await aggregatorInstance.flushAll();
    aggregatorInstance.destroy();
    aggregatorInstance = null;
  }
};
