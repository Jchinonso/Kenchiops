/**
 * Investigation Formatter Types
 *
 * Type definitions and constants for the investigation Slack formatter.
 *
 * @module formatters/investigationFormatterTypes
 */

// ==================== Constants ====================

/**
 * Configuration for investigation formatter text truncation and display limits.
 */
export const INVESTIGATION_FORMATTER_CONFIG = {
  DESCRIPTION_MAX_LENGTH: 200,
  ROOT_CAUSE_MAX_LENGTH: 500,
  ERROR_MESSAGE_MAX_LENGTH: 300,
  MAX_EVIDENCE_ITEMS_SHOWN: 3,
  HIGH_CONFIDENCE_THRESHOLD: 0.7,
  MEDIUM_CONFIDENCE_THRESHOLD: 0.4,
  PERCENTAGE_MULTIPLIER: 100,
} as const;

// ==================== Types ====================

/**
 * Shape of the diagnosis field within an InvestigationRecord.
 * The database stores this as a generic Record<string, unknown>,
 * but the investigation worker writes this specific shape.
 */
export interface InvestigationDiagnosisShape {
  readonly summary?: string;
  readonly rootCauseHypothesis?: string;
  readonly confidence?: number;
  readonly suggestedActions?: readonly InvestigationActionShape[];
  readonly evidenceCited?: readonly string[];
  readonly diagnosisSource?: "ai" | "fallback";
}

/**
 * Shape of a single suggested action within a diagnosis.
 */
export interface InvestigationActionShape {
  readonly action: string;
  readonly reasoning: string;
  readonly priority: "immediate" | "short_term" | "long_term";
}

/**
 * Shape of a single evidence item within the InvestigationRecord evidence array.
 */
export interface InvestigationEvidenceShape {
  readonly id?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly source?: string;
  readonly relevance?: number;
}
