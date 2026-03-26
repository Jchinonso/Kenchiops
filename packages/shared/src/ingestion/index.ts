/**
 * Ingestion Module
 *
 * Redis-backed ingestion buffer for continuous log stream processing.
 *
 * @module ingestion
 */

export type {
  IngestionBufferPort,
  BufferMetadata,
  AppendResult,
  FlushResult,
  FlushTriggerResult,
  IncidentSummary,
  TimelineEntry,
} from "./types.js";

export { createIngestionBuffer } from "./buffer.js";

export {
  buildBufferKey,
  buildMetadataKey,
  buildSummaryKey,
  buildFlushLockKey,
  hashLogLine,
  buildMember,
  extractMessage,
  estimateTokens,
  estimateLinesTokens,
  getFlushConfig,
  getAdaptiveFlushConfig,
  serializeMetadata,
  deserializeMetadata,
} from "./helpers.js";
