/**
 * Investigation Types
 *
 * Re-exports shared investigation types from @kenchi/shared.
 * Keeps worker-only types local to incident-triage.
 *
 * @module types/investigationTypes
 */

// Re-export shared investigation types and constants
export {
  INVESTIGATION_LLM_TIMEOUT_MS,
  type InvestigationSymptom,
  type EvidenceSourceType,
  type InvestigationIntent,
  type InvestigationEvidenceItem,
  type TimelineEvent,
  type InvestigationCorrelation,
  type SuggestedInvestigationAction,
  type InvestigationDiagnosis,
  type InvestigationSearchPort,
  type InvestigationService,
  type InvestigationServiceOptions,
} from "@kenchi/shared";

// ==================== Worker Types (local to incident-triage) ====================

/**
 * Internal mutable state for the investigation worker.
 * Uses mutable fields since these are modified during the polling loop.
 */
export interface InvestigationWorkerState {
  running: boolean; // Mutable: toggled by stop()
  totalProcessed: number; // Mutable: incremented per job
  totalErrors: number; // Mutable: incremented per error
}

/**
 * Statistics snapshot returned by the investigation worker control interface.
 */
export interface InvestigationWorkerStats {
  readonly totalProcessed: number;
  readonly totalErrors: number;
  readonly isRunning: boolean;
}

/**
 * Control interface for the investigation worker.
 */
export interface InvestigationWorkerControl {
  readonly stop: () => void;
  readonly getStats: () => InvestigationWorkerStats;
}

// ==================== Queue Payload Types ====================

/**
 * Queue message payload shape for investigation jobs.
 */
export interface InvestigationQueuePayload {
  readonly investigationId: string;
  readonly tenantId: string;
  readonly initiatedBy: string;
}

// ==================== Constants ====================

/**
 * Default configuration for the investigation worker.
 */
export const INVESTIGATION_WORKER_DEFAULTS = {
  POLL_INTERVAL_MS: 2000,
} as const;
