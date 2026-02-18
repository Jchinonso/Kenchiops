/**
 * Incident Correlation Types
 *
 * Type definitions for correlating current alerts with past incidents
 * via vector similarity search on triage result embeddings.
 */

import type { RequestContext } from "@kenchi/shared";

// ==================== Correlation Categories ====================

/**
 * Classification of the relationship between correlated incidents.
 */
export type CorrelationType =
  | "same_root_cause"
  | "same_service"
  | "similar_symptoms"
  | "historical";

// ==================== Correlated Incident ====================

/**
 * A single correlated incident from vector similarity search.
 */
export interface CorrelatedIncident {
  readonly triageResultId: string;
  readonly alertId: string;
  readonly similarity: number;
  readonly correlationType: CorrelationType;
  readonly severityLabel: string | null;
  readonly serviceName: string | null;
  readonly createdAt: Date;
}

/**
 * Complete result from the incident correlation stage.
 */
export interface CorrelationResult {
  readonly correlations: readonly CorrelatedIncident[];
  readonly durationMs: number;
}

// ==================== Port Interface ====================

/**
 * Port for searching similar triage results by vector similarity.
 * Decouples correlator from the concrete repository implementation.
 */
export interface TriageSearchPort {
  readonly searchSimilar: (
    embedding: readonly number[],
    tenantId: string,
    excludeAlertId: string,
    limit: number,
    minSimilarity: number
  ) => Promise<readonly TriageSearchResult[]>;
}

/**
 * Result from triage result vector search.
 */
export interface TriageSearchResult {
  readonly triageResultId: string;
  readonly alertId: string;
  readonly similarity: number;
  readonly severityLabel: string | null;
  readonly serviceName: string | null;
  readonly createdAt: Date;
}

// ==================== Service Interface ====================

/**
 * Public interface for the incident correlator service.
 */
export interface IncidentCorrelatorService {
  readonly correlateIncident: (
    embedding: readonly number[],
    alertId: string,
    tenantId: string,
    serviceName: string | null,
    context: RequestContext
  ) => Promise<CorrelationResult>;
}
