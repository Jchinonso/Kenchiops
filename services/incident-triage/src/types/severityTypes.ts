/**
 * Severity Scoring Types
 *
 * Type definitions for deterministic severity classification of alerts.
 */

import type { RequestContext } from "@kenchi/shared";
import type { AlertSeverity } from "./incidentTypes.js";

// ==================== Severity Score ====================

/**
 * Complete severity assessment result with traceable factor breakdown.
 */
export interface SeverityScore {
  readonly total: number;
  readonly label: AlertSeverity;
  readonly factors: readonly SeverityFactor[];
}

/**
 * Individual scoring factor contributing to the total severity score.
 */
export interface SeverityFactor {
  readonly name: string;
  readonly weight: number;
  readonly score: number;
  readonly maxScore: number;
  readonly reason: string;
}

// ==================== Configuration ====================

/**
 * Configurable severity classification parameters.
 */
export interface SeverityConfig {
  readonly serviceTiers: Readonly<Record<string, ServiceTier>>;
  readonly environmentScores: Readonly<Record<string, number>>;
  readonly keywordPatterns: readonly KeywordPattern[];
  readonly sourceSeverityMap: Readonly<Record<string, number>>;
  readonly severityThresholds: readonly SeverityThreshold[];
}

/**
 * Service criticality tier assignment.
 */
export type ServiceTier = "tier1" | "tier2" | "tier3" | "tier4";

/**
 * Keyword pattern that boosts severity when matched in alert text.
 */
export interface KeywordPattern {
  readonly pattern: RegExp;
  readonly boost: number;
  readonly label: string;
}

/**
 * Maps a minimum score threshold to a severity label.
 */
export interface SeverityThreshold {
  readonly minScore: number;
  readonly label: AlertSeverity;
}

// ==================== Worker Types ====================

/**
 * Internal mutable state for the triage worker.
 * Uses mutable fields since these are modified during the polling loop.
 */
export interface TriageWorkerState {
  running: boolean; // Mutable: toggled by stop()
  totalProcessed: number; // Mutable: incremented per job
  totalErrors: number; // Mutable: incremented per error
  totalDeduped: number; // Mutable: incremented per dedup
}

/**
 * Statistics snapshot returned by the worker control interface.
 */
export interface TriageWorkerStats {
  readonly totalProcessed: number;
  readonly totalErrors: number;
  readonly totalDeduped: number;
  readonly isRunning: boolean;
}

/**
 * Control interface for the triage worker.
 */
export interface TriageWorkerControl {
  readonly stop: () => void;
  readonly getStats: () => TriageWorkerStats;
}

// ==================== Deduplication Types ====================

/**
 * Result of a deduplication check.
 */
export interface DedupCheckResult {
  readonly isDuplicate: boolean;
  readonly existingAlertId?: string;
}

/**
 * Public interface for the deduplication service returned by createDeduplicationService.
 */
export interface DeduplicationService {
  readonly checkDuplicate: (
    fingerprint: string,
    tenantId: string,
    context: RequestContext
  ) => Promise<DedupCheckResult>;
  readonly registerAlert: (
    fingerprint: string,
    tenantId: string,
    alertId: string,
    windowMinutes: number | undefined,
    context: RequestContext
  ) => Promise<void>;
}

/**
 * Port interface for dedup repository operations.
 * Allows the dedup service to be decoupled from the repository implementation.
 */
export interface DedupRepositoryPort {
  readonly findByFingerprint: (
    fingerprint: string,
    tenantId: string
  ) => Promise<{ readonly alertId: string; readonly expiresAt: Date } | null>;
  readonly upsertDedupEntry: (
    fingerprint: string,
    tenantId: string,
    alertId: string,
    expiresAt: Date
  ) => Promise<void>;
}
