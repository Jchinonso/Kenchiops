/**
 * Diagnostics Framework
 *
 * Structured types for problem diagnosis from log data and alert context.
 *
 * @module diagnostics
 */

export type {
  // Problem classification
  ProblemCategory,
  ProblemSubcategory,
  // Supporting types
  Action,
  ArtifactSummary,
  IncidentRef,
  RunbookRef,
  DocRef,
  // Diagnostic result components
  RootCauseAnalysis,
  CausalityChain,
  DiagnosticImpact,
  DiagnosticRecommendations,
  DiagnosticRelatedContext,
  // Result types
  DiagnosticResult,
  DegradedReason,
  PartialAnalysis,
  DegradedResult,
  DiagnosticOutput,
  // RAG enrichment types
  DiagnosticRAGContext,
  RAGEnrichmentInput,
  // Cross-pipeline correlation types
  CorrelatedDeployEvent,
  CorrelatedAlertEvent,
  CorrelatedIncident,
} from "./types.js";

export { enrichDiagnosticWithRAG, formatRAGContextForPrompt } from "./ragEnrichment.js";

export { mapLLMAnalysisToDiagnostic, buildDegradedFromPipelineFailure } from "./mapper.js";

export type { ErrorSignature, PatternMatchResult } from "./patternMatcher.js";

export { matchKnownPattern, buildDiagnosticFromPattern } from "./patternMatcher.js";

export {
  calculateCorrelationScore,
  correlateEvents,
  findCorrelatedIncidents,
} from "./correlation.js";
