/**
 * Diagnostics Framework Types
 *
 * Structured types for diagnosing problems from log data and alert context.
 * Used by both Pipeline A (Log Analysis) and Pipeline B (Alert Context Analysis).
 *
 * @module diagnostics/types
 */

// ==================== Problem Classification ====================

/**
 * Top-level problem category from the diagnostics taxonomy.
 */
export type ProblemCategory =
  | "infrastructure"
  | "configuration"
  | "application"
  | "deployment"
  | "external";

/**
 * Problem subcategory — specific failure mode within a category.
 *
 * Infrastructure: resource_exhaustion, network_failure, service_unavailable, permission_auth
 * Configuration: missing_environment, invalid_config, version_mismatch, feature_flag
 * Application: code_error, test_failure, build_failure, lint_format, migration
 * Deployment: rollout_failure, container_error, orchestration, traffic_management
 * External: third_party_api, provider_issue, upstream_dependency
 */
export type ProblemSubcategory =
  // Infrastructure
  | "resource_exhaustion"
  | "network_failure"
  | "service_unavailable"
  | "permission_auth"
  // Configuration
  | "missing_environment"
  | "invalid_config"
  | "version_mismatch"
  | "feature_flag"
  // Application
  | "code_error"
  | "test_failure"
  | "build_failure"
  | "lint_format"
  | "migration"
  // Deployment
  | "rollout_failure"
  | "container_error"
  | "orchestration"
  | "traffic_management"
  // External
  | "third_party_api"
  | "provider_issue"
  | "upstream_dependency";

// ==================== Supporting Types ====================

/**
 * Recommended action to take (immediate, preventive, or investigative).
 */
export interface Action {
  readonly description: string;
  readonly priority: "immediate" | "high" | "medium" | "low";
  readonly reasoning?: string;
}

/**
 * Summary of an artifact in the causality chain.
 */
export interface ArtifactSummary {
  readonly type: string;
  readonly summary: string;
  readonly evidence?: readonly string[];
}

/**
 * Reference to a past incident from RAG retrieval.
 */
export interface IncidentRef {
  readonly id: string;
  readonly title: string;
  readonly similarity: number;
  readonly resolvedAt?: string;
  readonly resolution?: string;
}

/**
 * Reference to a runbook from RAG retrieval.
 */
export interface RunbookRef {
  readonly id: string;
  readonly title: string;
  readonly url?: string;
  readonly relevance: number;
}

/**
 * Reference to documentation from RAG retrieval.
 */
export interface DocRef {
  readonly id: string;
  readonly title: string;
  readonly url?: string;
  readonly relevance: number;
}

// ==================== Diagnostic Result ====================

/**
 * Root cause identification from diagnostic analysis.
 */
export interface RootCauseAnalysis {
  readonly category: ProblemCategory;
  readonly subcategory: ProblemSubcategory;
  readonly summary: string;
  readonly confidence: "high" | "medium" | "low";
  readonly evidence: readonly string[];
}

/**
 * Causality chain linking primary failure to downstream effects.
 */
export interface CausalityChain {
  readonly primary: ArtifactSummary;
  readonly secondary: readonly ArtifactSummary[];
  readonly explanation: string;
}

/**
 * Impact assessment of the diagnosed problem.
 */
export interface DiagnosticImpact {
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly scope: string;
  readonly duration: string;
  readonly usersAffected: string;
}

/**
 * Grouped recommendations for remediation.
 */
export interface DiagnosticRecommendations {
  readonly immediate: readonly Action[];
  readonly preventive: readonly Action[];
  readonly investigative: readonly Action[];
}

/**
 * Related context from RAG retrieval for enrichment.
 */
export interface DiagnosticRelatedContext {
  readonly pastIncidents: readonly IncidentRef[];
  readonly runbooks: readonly RunbookRef[];
  readonly documentation: readonly DocRef[];
}

/**
 * Full diagnostic result produced by both pipelines.
 * Discriminated via `status: "complete"` against DegradedResult.
 */
export interface DiagnosticResult {
  readonly status: "complete";
  readonly rootCause: RootCauseAnalysis;
  readonly causalityChain: CausalityChain;
  readonly impact: DiagnosticImpact;
  readonly recommendations: DiagnosticRecommendations;
  readonly relatedContext: DiagnosticRelatedContext;
}

// ==================== Degraded Result ====================

/**
 * Reason why analysis was degraded.
 */
export type DegradedReason =
  | "chunk_extraction_failure"
  | "context_fetch_failed"
  | "token_budget_exceeded";

/**
 * Partial analysis available during degraded mode.
 */
export interface PartialAnalysis {
  readonly rawPreview: string;
  readonly detectedPatterns: readonly string[];
  readonly suggestedCategory: string;
}

/**
 * Degraded diagnostic result when full analysis is not possible.
 * Discriminated via `status: "degraded"` against DiagnosticResult.
 */
export interface DegradedResult {
  readonly status: "degraded";
  readonly reason: DegradedReason;
  readonly partialAnalysis: PartialAnalysis;
  readonly confidence: "low";
  readonly recommendation: string;
}

// ==================== RAG Enrichment Types ====================

/**
 * RAG-enriched context assembled from vector search results.
 * Contains past incidents, runbooks, and documentation relevant to the diagnosis.
 */
export interface DiagnosticRAGContext {
  readonly pastIncidents: readonly IncidentRef[];
  readonly runbooks: readonly RunbookRef[];
  readonly documentation: readonly DocRef[];
  readonly totalTokens: number;
}

/**
 * Input for RAG enrichment of diagnostic analysis.
 * Assembled from the root cause summary and alert metadata.
 */
export interface RAGEnrichmentInput {
  readonly rootCauseSummary: string;
  readonly alertTitle?: string;
  readonly serviceName?: string;
  readonly tenantId?: string;
}

// ==================== Cross-Pipeline Correlation ====================

/** A deploy event reference for correlation. */
export interface CorrelatedDeployEvent {
  readonly eventId: string;
  readonly repository: string;
  readonly commit: string;
  readonly platform: string;
  readonly failedAt: string;
}

/** An alert event reference for correlation. */
export interface CorrelatedAlertEvent {
  readonly alertId: string;
  readonly source: string;
  readonly title: string;
  readonly severity: string;
  readonly triggeredAt: string;
}

/**
 * A group of temporally correlated events across pipelines.
 * Links deploy failures with alert spikes in the same time window.
 */
export interface CorrelatedIncident {
  readonly deployEvent?: CorrelatedDeployEvent;
  readonly alertEvents: readonly CorrelatedAlertEvent[];
  readonly correlationScore: number;
  readonly explanation: string;
}

// ==================== Discriminated Union ====================

/**
 * Discriminated union of complete and degraded diagnostic outputs.
 * Use `output.status` to narrow: "complete" | "degraded".
 */
export type DiagnosticOutput = DiagnosticResult | DegradedResult;
