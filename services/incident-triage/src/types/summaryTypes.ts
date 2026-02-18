/**
 * AI Summary Types
 *
 * Type definitions for the AI summarizer, output validator,
 * fallback summary generator, and LLM completion port.
 *
 * @module types/summaryTypes
 */

import type { RequestContext } from "@kenchi/shared";
import type { EvidenceCatalog } from "./evidenceTypes.js";
import type { NormalizedAlert } from "./incidentTypes.js";
import type { SeverityScore } from "./severityTypes.js";
import type { RunbookMatch } from "./runbookTypes.js";
import type { CorrelatedIncident } from "./correlationTypes.js";

// ==================== Summary Source ====================

/**
 * Discriminator for how the summary was produced.
 */
export type SummarySource = "ai" | "fallback";

// ==================== Suggested Action ====================

/**
 * An individual action item with evidence citation.
 */
export interface SuggestedAction {
  readonly action: string;
  readonly reasoning: string;
  readonly priority: "immediate" | "short_term" | "long_term";
}

// ==================== Incident Summary Response ====================

/**
 * Structured AI output schema for the incident summary.
 * This shape is both what the LLM is asked to produce and what is stored.
 */
export interface IncidentSummaryResponse {
  readonly headline: string;
  readonly rootCauseSummary: string;
  readonly impactAssessment: string;
  readonly suggestedActions: readonly SuggestedAction[];
  readonly evidencesCited: readonly string[];
  readonly summarySource: SummarySource;
}

// ==================== Validation ====================

/**
 * Identifies a specific validation rule violation.
 */
export interface ValidationViolation {
  readonly rule: string;
  readonly message: string;
  readonly field?: string;
}

/**
 * Result of output validation against the evidence catalog.
 */
export interface SummaryValidationResult {
  readonly valid: boolean;
  readonly violations: readonly ValidationViolation[];
}

// ==================== LLM Completion Port ====================

/**
 * Options for an LLM completion call.
 */
export interface LLMCompletionOptions {
  readonly model: string;
  readonly timeoutMs: number;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

/**
 * Port interface for LLM text completion.
 * Keeps the OpenAI SDK out of the service layer.
 */
export interface LLMCompletionPort {
  readonly complete: (
    systemPrompt: string,
    userPrompt: string,
    options: LLMCompletionOptions,
    context: RequestContext
  ) => Promise<string>;
}

// ==================== Fallback Summary Input ====================

/**
 * Input for the fallback summary generator.
 */
export interface FallbackSummaryInput {
  readonly alert: NormalizedAlert;
  readonly severity: SeverityScore;
  readonly runbooks: readonly RunbookMatch[];
  readonly evidenceCatalog: EvidenceCatalog;
}

// ==================== Triage User Prompt Input ====================

/**
 * Input for building the triage user prompt.
 */
export interface TriageUserPromptInput {
  readonly alert: NormalizedAlert;
  readonly severity: SeverityScore;
  readonly runbooks: readonly RunbookMatch[];
  readonly correlations: readonly CorrelatedIncident[];
  readonly evidenceCatalog: EvidenceCatalog;
}

// ==================== AI Summarizer Input ====================

/**
 * Full input to the AI summarizer, gathered from all pipeline stages.
 */
export interface AiSummarizerInput {
  readonly alert: NormalizedAlert;
  readonly severity: SeverityScore;
  readonly runbooks: readonly RunbookMatch[];
  readonly correlations: readonly CorrelatedIncident[];
  readonly evidenceCatalog: EvidenceCatalog;
}

// ==================== AI Summarizer Service Interface ====================

/**
 * Public interface for the AI summarizer service.
 */
export interface AiSummarizerService {
  readonly summarize: (
    input: AiSummarizerInput,
    context: RequestContext
  ) => Promise<IncidentSummaryResponse>;
}

// ==================== Summary Length Limits ====================

/**
 * Maximum character lengths for summary text sections.
 */
export interface SummaryLengthLimits {
  readonly headline: number;
  readonly rootCauseSummary: number;
  readonly impactAssessment: number;
  readonly actionText: number;
  readonly actionReasoning: number;
}

// ==================== Summary Constants ====================

/**
 * Default length limits for summary validation.
 */
export const SUMMARY_LENGTH_LIMITS: SummaryLengthLimits = {
  headline: 200,
  rootCauseSummary: 1000,
  impactAssessment: 500,
  actionText: 300,
  actionReasoning: 500,
} as const;

/**
 * Min/max constraints for suggested actions.
 */
export const SUGGESTED_ACTIONS_LIMITS = {
  MIN: 1,
  MAX: 5,
} as const;

/**
 * Valid priority values for suggested actions.
 */
export const VALID_ACTION_PRIORITIES = ["immediate", "short_term", "long_term"] as const;

/**
 * AI summarizer timeout (hard limit via Promise.race).
 */
export const AI_SUMMARIZER_TIMEOUT_MS = 60000;
