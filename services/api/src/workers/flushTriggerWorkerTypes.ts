/**
 * Flush Trigger Worker Types
 *
 * @module workers/flushTriggerWorkerTypes
 */

/** Control handle for the flush trigger worker. */
export interface FlushTriggerWorkerControl {
  /** Stops the worker gracefully. */
  readonly stop: () => void;
}
