/**
 * Incident Triage Result Types
 *
 * Type definitions for incident triage result storage and retrieval.
 *
 * @module database/incidentTriageResult/types
 */

// ==================== Database Row Types ====================

/**
 * Database row type for incident_triage_results table.
 */
export interface IncidentTriageResultRow {
  readonly id: string;
  readonly alert_id: string;
  readonly tenant_id: string | null;
  readonly severity_score: number | null;
  readonly severity_label: string | null;
  readonly severity_factors: readonly Record<string, unknown>[];
  readonly confidence: number | null;
  readonly completeness: number | null;
  readonly missing_fields: readonly string[];
  readonly matched_runbooks: readonly Record<string, unknown>[];
  readonly correlated_incidents: readonly Record<string, unknown>[];
  readonly evidence_catalog: Readonly<Record<string, unknown>>;
  readonly ai_summary: Readonly<Record<string, unknown>> | null;
  readonly summary_source: string;
  readonly routing_decision: Readonly<Record<string, unknown>> | null;
  readonly dispatched_to: readonly Record<string, unknown>[];
  readonly pipeline_duration_ms: number | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types ====================

/**
 * Domain record for an incident triage result.
 */
export interface IncidentTriageResultRecord {
  readonly id: string;
  readonly alertId: string;
  readonly tenantId: string | null;
  readonly severityScore: number | null;
  readonly severityLabel: string | null;
  readonly severityFactors: readonly Record<string, unknown>[];
  readonly confidence: number | null;
  readonly completeness: number | null;
  readonly missingFields: readonly string[];
  readonly matchedRunbooks: readonly Record<string, unknown>[];
  readonly correlatedIncidents: readonly Record<string, unknown>[];
  readonly evidenceCatalog: Readonly<Record<string, unknown>>;
  readonly aiSummary: Readonly<Record<string, unknown>> | null;
  readonly summarySource: string;
  readonly routingDecision: Readonly<Record<string, unknown>> | null;
  readonly dispatchedTo: readonly Record<string, unknown>[];
  readonly pipelineDurationMs: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ==================== Input Types ====================

/**
 * Input for creating an initial triage result (Phase 2: severity only).
 */
export interface CreateTriageResultInput {
  readonly alertId: string;
  readonly tenantId?: string | null;
  readonly severityScore: number;
  readonly severityLabel: string;
  readonly severityFactors: readonly Record<string, unknown>[];
  readonly pipelineDurationMs: number;
}

/**
 * Input for updating a triage result with Phase 3 enrichment data.
 */
export interface UpdateTriageEnrichmentInput {
  readonly triageResultId: string;
  readonly confidence: number;
  readonly completeness: number;
  readonly missingFields: readonly string[];
  readonly matchedRunbooks: readonly Record<string, unknown>[];
  readonly correlatedIncidents: readonly Record<string, unknown>[];
  readonly evidenceCatalog: Readonly<Record<string, unknown>>;
  readonly alertEmbedding: readonly number[];
  readonly pipelineDurationMs: number;
}

/**
 * Row type returned by the similarity search query (extends base row with joined fields).
 */
export interface TriageResultSimilarityRow extends IncidentTriageResultRow {
  readonly joined_service_name: string | null;
  readonly similarity: number;
}

/**
 * Domain result from a triage similarity search.
 */
export interface TriageSimilarityResult {
  readonly triageResultId: string;
  readonly alertId: string;
  readonly similarity: number;
  readonly severityLabel: string | null;
  readonly serviceName: string | null;
  readonly createdAt: Date;
}
