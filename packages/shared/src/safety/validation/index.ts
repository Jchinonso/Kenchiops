/**
 * Validation Module
 *
 * Provides validation utilities for LLM outputs including:
 * - Uncertainty detection (hedging language)
 * - Evidence alignment (does analysis match provided data?)
 * - Completeness assessment (is analysis thorough?)
 * - Knowledge base validation (matches past incidents?)
 * - Hallucination detection (fabricated claims?)
 * - Output sanitization (XSS, secrets, commands)
 *
 * @module safety/validation
 */

// ==================== Types ====================
export type { RedactSensitiveResult } from "./types.js";

// ==================== Uncertainty Detection ====================
export { detectUncertainty } from "./uncertaintyDetection.js";

// ==================== Evidence Validation ====================
export { calculateEvidenceAlignment, assessCompleteness } from "./evidenceValidation.js";

// ==================== Knowledge Base Validation ====================
export { validateAgainstKnowledgeBase } from "./knowledgeValidation.js";

// ==================== Hallucination Detection ====================
export {
  checkForHallucinations,
  isLikelyHallucinated,
  getHallucinationRiskLevel,
} from "./hallucination.js";

// ==================== Output Sanitization ====================
export {
  sanitizeLLMOutput,
  validateCommand,
  hasCodeInjection,
  sanitizeFilePath,
  redactSecrets,
} from "./sanitization.js";
