/**
 * Investigation Service Helpers
 *
 * Re-exports from @kenchi/shared.
 * Canonical definitions live in packages/shared/src/investigation/helpers.ts.
 *
 * @module services/investigationServiceHelpers
 */

export {
  FALLBACK_INTENT,
  validateParsedIntent,
  compareEvidence,
  extractServiceNames,
  detectPatterns,
  buildTimeline,
  extractCommonFactors,
  validateParsedDiagnosis,
  generateFallbackDiagnosis,
  getLookbackHours,
} from "@kenchi/shared";
