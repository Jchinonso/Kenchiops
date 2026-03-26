/**
 * Ingestion Buffer Types
 *
 * Type definitions for the Redis-backed ingestion buffer,
 * windowed processing, and incremental summarization.
 *
 * @module ingestion/types
 */

import type { RequestContext } from "../core/types.js";
import type { DeployPlatform, LogLine } from "../ports/deployLogSourcePort.js";

// ==================== Buffer Types ====================

/** Metadata tracked per active ingestion buffer. */
export interface BufferMetadata {
  readonly entityId: string;
  readonly tenantId: string;
  readonly platform: DeployPlatform;
  readonly status: "active" | "closed";
  readonly createdAt: string;
  readonly lastFlushAt: string | null;
  readonly windowCount: number;
  readonly totalLinesIngested: number;
}

/** Result of appending lines to the buffer. */
export interface AppendResult {
  readonly linesAccepted: number;
  readonly linesDeduplicated: number;
  readonly estimatedBufferTokens: number;
  readonly linesEvicted: number;
}

/** Result of flushing the buffer (retrieving lines since last flush). */
export interface FlushResult {
  readonly lines: readonly string[];
  readonly lineCount: number;
  readonly estimatedTokens: number;
  readonly windowNumber: number;
  readonly previousSummary: IncidentSummary | null;
}

/** Result of evaluating flush triggers. */
export interface FlushTriggerResult {
  readonly shouldFlush: boolean;
  readonly reason: "time_elapsed" | "volume_exceeded" | "event_trigger" | "none";
  readonly estimatedBufferTokens: number;
  readonly timeSinceLastFlushMs: number;
}

// ==================== Summary Types ====================

/** Incremental summary carried forward between window analyses. */
export interface IncidentSummary {
  readonly version: number;
  readonly windowCount: number;
  readonly timeRange: {
    readonly start: string;
    readonly end: string;
  };
  readonly currentStatus: string;
  readonly keyFindings: readonly string[];
  readonly errorTimeline: readonly TimelineEntry[];
  readonly unresolvedIssues: readonly string[];
  readonly metricsSnapshot: string;
  readonly tokenCount: number;
}

/** A single entry in the error timeline. */
export interface TimelineEntry {
  readonly timestamp: string;
  readonly severity: "critical" | "warning" | "info";
  readonly message: string;
}

// ==================== Port Interface ====================

/** Port interface for the Redis-backed ingestion buffer. */
export interface IngestionBufferPort {
  /** Append log lines to the buffer. Handles dedup and eviction internally. */
  readonly append: (
    entityId: string,
    tenantId: string,
    platform: DeployPlatform,
    lines: readonly LogLine[],
    context: RequestContext
  ) => Promise<AppendResult>;

  /** Flush buffered lines since last flush. Returns lines + previous summary. */
  readonly flush: (
    entityId: string,
    tenantId: string,
    context: RequestContext
  ) => Promise<FlushResult>;

  /** Get buffer metadata (null if no active buffer). */
  readonly getMetadata: (entityId: string, tenantId: string) => Promise<BufferMetadata | null>;

  /** Get the current carry-forward summary (null if no summary yet). */
  readonly getSummary: (entityId: string, tenantId: string) => Promise<IncidentSummary | null>;

  /** Store an updated carry-forward summary after window analysis. */
  readonly updateSummary: (
    entityId: string,
    tenantId: string,
    summary: IncidentSummary
  ) => Promise<void>;

  /** Close the buffer and clean up Redis keys. */
  readonly close: (entityId: string, tenantId: string, context: RequestContext) => Promise<void>;

  /** Evaluate whether flush triggers have been met. budgetRatio (0-1) enables throttling. */
  readonly checkFlushTriggers: (
    entityId: string,
    tenantId: string,
    platform: DeployPlatform,
    budgetRatio?: number
  ) => Promise<FlushTriggerResult>;
}
