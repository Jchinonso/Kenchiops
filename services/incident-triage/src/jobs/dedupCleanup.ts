/**
 * Dedup Cleanup Job
 *
 * Periodic cleanup of expired entries in the incident_dedup_window table.
 * Runs on a configurable interval and removes entries whose expires_at has passed.
 *
 * @module jobs/dedupCleanup
 */

import {
  createLogger,
  cleanupExpiredDedupEntries,
  getErrorMessage,
  INCIDENT_ALERT_DEFAULTS,
} from "@kenchi/shared";

const logger = createLogger("dedup-cleanup");

/**
 * Return type for the dedup cleanup job, allowing external stop/status.
 */
interface DedupCleanupJob {
  /** Stops the periodic cleanup */
  readonly stop: () => void;
  /** Returns whether the job is currently running */
  readonly isRunning: () => boolean;
}

/**
 * Executes a single cleanup pass, removing all expired dedup window entries.
 * Returns the number of entries removed.
 */
const runCleanupPass = async (): Promise<number> => {
  const startTime = Date.now();

  try {
    const deletedCount = await cleanupExpiredDedupEntries();
    const durationMs = Date.now() - startTime;

    logger.info("Dedup cleanup pass completed", {
      deletedCount,
      durationMs,
    });

    return deletedCount;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error("Dedup cleanup pass failed", {
      durationMs,
      error: getErrorMessage(error),
    });
    return 0;
  }
};

/**
 * Starts the periodic dedup cleanup job.
 *
 * @param intervalMs - Cleanup interval in milliseconds (default from shared constants)
 * @returns Job handle with stop() and isRunning() methods
 */
export const startDedupCleanup = (
  intervalMs: number = INCIDENT_ALERT_DEFAULTS.DEDUP_CLEANUP_INTERVAL_MS
): DedupCleanupJob => {
  // let: timer reference must be reassignable for stop/start lifecycle
  let timer: ReturnType<typeof setInterval> | null = null; // let: cleared on stop

  logger.info("Starting dedup cleanup job", { intervalMs });

  // Run initial cleanup after a short delay to let the service warm up
  const initialDelay = setTimeout(() => {
    void runCleanupPass();
  }, INCIDENT_ALERT_DEFAULTS.DEDUP_CLEANUP_INITIAL_DELAY_MS);

  timer = setInterval(() => {
    void runCleanupPass();
  }, intervalMs);

  return {
    stop: (): void => {
      clearTimeout(initialDelay);
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      logger.info("Dedup cleanup job stopped");
    },
    isRunning: (): boolean => timer !== null,
  };
};
