/**
 * Investigation Service
 *
 * Factory function that creates the investigation service.
 * Orchestrates intent parsing, evidence gathering, deterministic
 * correlation, and LLM-powered diagnosis.
 *
 * @module investigation/service
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { parseJsonObject } from "../llm/jsonExtraction.js";
import type { RequestContext } from "../core/types.js";
import {
  INVESTIGATION_LLM_TIMEOUT_MS,
  type LLMCompletionPort,
  type InvestigationService,
  type InvestigationSearchPort,
  type InvestigationIntent,
  type InvestigationEvidenceItem,
  type InvestigationCorrelation,
  type InvestigationDiagnosis,
  type InvestigationServiceOptions,
} from "./types.js";
import type { MonitoringPort } from "./monitoringTypes.js";
import {
  INVESTIGATION_INTENT_SYSTEM_PROMPT,
  buildIntentUserPrompt,
} from "./prompts/intentPrompt.js";
import {
  INVESTIGATION_DIAGNOSIS_SYSTEM_PROMPT,
  buildDiagnosisUserPrompt,
} from "./prompts/diagnosisPrompt.js";
import { INVESTIGATION_PIPELINE_DEFAULTS } from "./constants.js";
import {
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
} from "./helpers.js";

const serviceLogger = createLogger("investigation-service");

// ==================== Pipeline Steps ====================

/**
 * Parses a natural-language investigation description into structured intent.
 * Falls back to FALLBACK_INTENT on validation failure or LLM error.
 */
const parseIntent = async (
  llmPort: LLMCompletionPort,
  llmModel: string,
  description: string,
  context: RequestContext
): Promise<InvestigationIntent> => {
  const startTime = Date.now();

  try {
    const rawResponse = await llmPort.complete(
      INVESTIGATION_INTENT_SYSTEM_PROMPT,
      buildIntentUserPrompt(description),
      {
        model: llmModel,
        timeoutMs: INVESTIGATION_LLM_TIMEOUT_MS,
        temperature: 0,
        operationName: "parseIntent",
      },
      context
    );

    const parsed = parseJsonObject(rawResponse);
    const intent = validateParsedIntent(parsed);

    if (!intent) {
      const durationMs = Date.now() - startTime;
      serviceLogger.warn("Intent parsing validation failed, using fallback", {
        durationMs,
        ...context,
      });
      return FALLBACK_INTENT;
    }

    const durationMs = Date.now() - startTime;
    serviceLogger.info("Intent parsed successfully", {
      durationMs,
      symptom: intent.symptom,
      confidenceScore: intent.confidenceScore,
      serviceName: intent.serviceName,
      ...context,
    });

    return intent;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    serviceLogger.warn("Intent parsing failed, using fallback", {
      durationMs,
      error: getErrorMessage(error),
      ...context,
    });
    return FALLBACK_INTENT;
  }
};

/**
 * Queries all evidence sources in parallel, sorts by relevance, and truncates.
 * Includes monitoring evidence from external providers when configured.
 */
const gatherEvidence = async (
  searchPort: InvestigationSearchPort,
  monitoringPort: MonitoringPort,
  intent: InvestigationIntent,
  tenantId: string,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const startTime = Date.now();

  const hoursBack = getLookbackHours(intent);
  const perSourceLimit = INVESTIGATION_PIPELINE_DEFAULTS.PER_SOURCE_LIMIT;

  const [incidents, analyses, triageResults, monitoringEvidence] = await Promise.all([
    searchPort.searchRecentIncidents(
      tenantId,
      intent.serviceName,
      hoursBack,
      perSourceLimit,
      context
    ),
    searchPort.searchRecentAnalyses(
      tenantId,
      intent.serviceName,
      hoursBack,
      perSourceLimit,
      context
    ),
    searchPort.searchRecentTriageResults(
      tenantId,
      intent.serviceName,
      hoursBack,
      perSourceLimit,
      context
    ),
    monitoringPort.gatherMetrics(
      {
        tenantId,
        serviceName: intent.serviceName,
        environment: intent.environment,
        symptom: intent.symptom,
        hoursBack,
        limit: perSourceLimit,
      },
      context
    ),
  ]);

  const allEvidence = [...incidents, ...analyses, ...triageResults, ...monitoringEvidence];
  const sorted = [...allEvidence].sort(compareEvidence);
  const truncated = sorted.slice(0, INVESTIGATION_PIPELINE_DEFAULTS.MAX_EVIDENCE_ITEMS);

  const durationMs = Date.now() - startTime;
  serviceLogger.info("Evidence gathered", {
    durationMs,
    incidentCount: incidents.length,
    analysisCount: analyses.length,
    triageCount: triageResults.length,
    monitoringCount: monitoringEvidence.length,
    totalBeforeTruncation: allEvidence.length,
    totalAfterTruncation: truncated.length,
    hoursBack,
    ...context,
  });

  return truncated;
};

/**
 * Correlates evidence items deterministically (no LLM).
 */
const correlateEvidence = async (
  evidence: readonly InvestigationEvidenceItem[],
  _intent: InvestigationIntent,
  context: RequestContext
): Promise<InvestigationCorrelation> => {
  const startTime = Date.now();

  const timelineEvents = buildTimeline(evidence);
  const patterns = detectPatterns(evidence);
  const relatedServices = extractServiceNames(evidence);
  const commonFactors = extractCommonFactors(evidence);

  const durationMs = Date.now() - startTime;
  serviceLogger.info("Evidence correlated", {
    durationMs,
    patternCount: patterns.length,
    timelineEventCount: timelineEvents.length,
    relatedServiceCount: relatedServices.length,
    commonFactorCount: commonFactors.length,
    ...context,
  });

  return { patterns, timelineEvents, relatedServices, commonFactors };
};

/**
 * Produces an LLM-powered diagnosis from evidence and correlation data.
 * Falls back to a template-based diagnosis on validation failure or LLM error.
 */
const diagnose = async (
  llmPort: LLMCompletionPort,
  llmModel: string,
  intent: InvestigationIntent,
  evidence: readonly InvestigationEvidenceItem[],
  correlation: InvestigationCorrelation,
  context: RequestContext
): Promise<InvestigationDiagnosis> => {
  const startTime = Date.now();
  const userPrompt = buildDiagnosisUserPrompt(intent, evidence, correlation);

  try {
    const rawResponse = await llmPort.complete(
      INVESTIGATION_DIAGNOSIS_SYSTEM_PROMPT,
      userPrompt,
      {
        model: llmModel,
        timeoutMs: INVESTIGATION_LLM_TIMEOUT_MS,
        temperature: 0,
        operationName: "generateDiagnosis",
      },
      context
    );

    const parsed = parseJsonObject(rawResponse);
    const diagnosis = validateParsedDiagnosis(parsed, evidence);

    if (!diagnosis) {
      const durationMs = Date.now() - startTime;
      serviceLogger.warn("Diagnosis validation failed, using fallback", {
        durationMs,
        ...context,
      });
      return generateFallbackDiagnosis(
        intent.serviceName ?? intent.symptom,
        intent,
        evidence,
        correlation
      );
    }

    const durationMs = Date.now() - startTime;
    serviceLogger.info("Diagnosis completed", {
      durationMs,
      diagnosisSource: "ai",
      confidence: diagnosis.confidence,
      actionCount: diagnosis.suggestedActions.length,
      citationCount: diagnosis.evidenceCited.length,
      ...context,
    });

    return diagnosis;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    serviceLogger.warn("Diagnosis failed, using fallback", {
      durationMs,
      error: getErrorMessage(error),
      ...context,
    });
    return generateFallbackDiagnosis(
      intent.serviceName ?? intent.symptom,
      intent,
      evidence,
      correlation
    );
  }
};

// ==================== Factory ====================

/**
 * Creates the investigation service with injected dependencies.
 *
 * @param llmPort - Port for LLM text completion
 * @param searchPort - Port for searching historical evidence
 * @param monitoringPort - Port for gathering monitoring evidence from external providers
 * @param options - Optional configuration (e.g., LLM model override)
 * @returns InvestigationService with parseIntent, gatherEvidence, correlateEvidence, diagnose
 */
export const createInvestigationService = (
  llmPort: LLMCompletionPort,
  searchPort: InvestigationSearchPort,
  monitoringPort: MonitoringPort,
  options?: InvestigationServiceOptions
): InvestigationService => {
  const llmModel = options?.llmModel ?? "gemini-2.5-flash";

  return {
    parseIntent: (description, context) => parseIntent(llmPort, llmModel, description, context),
    gatherEvidence: (intent, tenantId, context) =>
      gatherEvidence(searchPort, monitoringPort, intent, tenantId, context),
    correlateEvidence: (evidence, intent, context) => correlateEvidence(evidence, intent, context),
    diagnose: (intent, evidence, correlation, context) =>
      diagnose(llmPort, llmModel, intent, evidence, correlation, context),
  };
};
