/**
 * Evidence Aggregation Types
 *
 * Type definitions for the evidence catalog, confidence scoring,
 * and completeness scoring in the incident triage pipeline.
 */

// ==================== Evidence ID Prefixes ====================

/**
 * Discriminated prefix for evidence IDs.
 * - ALT-*: Alert-derived evidence (fields from the normalized alert)
 * - SEV-*: Severity classification evidence (factors, label)
 * - RB-*: Runbook match evidence
 * - INC-*: Correlated incident evidence
 */
export type EvidenceIdPrefix = "ALT" | "SEV" | "RB" | "INC";

// ==================== Evidence Item ====================

/**
 * A single piece of evidence in the catalog.
 * Each item is addressable by a unique evidence ID.
 */
export interface EvidenceItem {
  readonly id: string;
  readonly prefix: EvidenceIdPrefix;
  readonly label: string;
  readonly value: unknown;
  readonly source: string;
}

// ==================== Evidence Catalog ====================

/**
 * Complete evidence catalog assembled from all triage pipeline stages.
 * Maps evidence ID to evidence item for O(1) lookup.
 */
export interface EvidenceCatalog {
  readonly items: Readonly<Record<string, EvidenceItem>>;
  readonly confidence: ConfidenceScore;
  readonly completeness: CompletenessScore;
  readonly collectedAt: string;
}

// ==================== Confidence Score ====================

/**
 * Weighted confidence score derived from signal presence.
 * Range: 0.0 to 1.0.
 */
export interface ConfidenceScore {
  readonly total: number;
  readonly signals: readonly ConfidenceSignal[];
}

/**
 * Individual signal contributing to the confidence score.
 */
export interface ConfidenceSignal {
  readonly name: string;
  readonly weight: number;
  readonly present: boolean;
  readonly reason: string;
}

// ==================== Completeness Score ====================

/**
 * Field coverage score measuring how much information is available.
 * Range: 0.0 to 1.0.
 */
export interface CompletenessScore {
  readonly total: number;
  readonly requiredPresent: number;
  readonly requiredTotal: number;
  readonly expectedPresent: number;
  readonly expectedTotal: number;
  readonly optionalPresent: number;
  readonly optionalTotal: number;
  readonly missingFields: readonly string[];
}

// ==================== Confidence Signal Names ====================

/**
 * Known confidence signal names for type safety in weights configuration.
 */
export type ConfidenceSignalName =
  | "has_metrics"
  | "has_runbook"
  | "has_similar_incident"
  | "service_known"
  | "environment_known"
  | "has_description"
  | "has_labels";

// ==================== Configuration ====================

/**
 * Weights for confidence signals. Must sum to 1.0.
 */
export type ConfidenceWeights = Readonly<Record<ConfidenceSignalName, number>>;

/**
 * Field categorization for completeness scoring.
 */
export interface CompletenessFieldConfig {
  readonly required: readonly string[];
  readonly expected: readonly string[];
  readonly optional: readonly string[];
}
