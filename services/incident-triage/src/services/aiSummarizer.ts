/**
 * AI Summarizer Service
 *
 * Factory function that creates an AI summarizer for incident triage.
 * Takes the evidence catalog, builds a prompt, calls an LLM via port interface,
 * validates the response, and falls back to template-based summary on failure.
 *
 * The LLM is NEVER a source of truth -- it is a narrator of verified evidence.
 *
 * @module services/aiSummarizer
 */

import {
  createLogger,
  getErrorMessage,
  parseJsonObject,
  checkForHallucinations,
  type RequestContext,
} from "@kenchi/shared";
import {
  AI_SUMMARIZER_TIMEOUT_MS,
  type LLMCompletionPort,
  type AiSummarizerService,
  type AiSummarizerInput,
  type IncidentSummaryResponse,
  type SuggestedAction,
} from "../types/summaryTypes.js";
import { TRIAGE_SYSTEM_PROMPT } from "../prompts/triageSystemPrompt.js";
import { buildTriageUserPrompt } from "../prompts/triageUserPrompt.js";
import { validateSummaryOutput } from "./outputValidator.js";
import { generateFallbackSummary } from "./fallbackSummary.js";
import { appConfig } from "../config/appConfig.js";

// ==================== Response Parsing ====================

/**
 * Safely extracts a typed SuggestedAction from a raw parsed object.
 */
const toSuggestedAction = (raw: Readonly<Record<string, unknown>>): SuggestedAction => {
  const { action: rawAction, reasoning: rawReasoning, priority: rawPriority } = raw;
  const actionText = typeof rawAction === "string" ? rawAction : "";
  const reasoningText = typeof rawReasoning === "string" ? rawReasoning : "";
  const priorityText = typeof rawPriority === "string" ? rawPriority : "short_term";
  return {
    action: actionText,
    reasoning: reasoningText,
    priority: priorityText as "immediate" | "short_term" | "long_term",
  };
};

/**
 * Attempts to parse the raw LLM response into an IncidentSummaryResponse.
 * Returns null if parsing fails.
 */
const parseSummaryResponse = (rawResponse: string): IncidentSummaryResponse | null => {
  try {
    const parsed = parseJsonObject(rawResponse);
    const {
      headline: rawHeadline,
      rootCauseSummary: rawRoot,
      impactAssessment: rawImpact,
      suggestedActions: rawActions,
      evidencesCited: rawCitations,
    } = parsed;

    const headline = typeof rawHeadline === "string" ? rawHeadline : "";
    const rootCauseSummary = typeof rawRoot === "string" ? rawRoot : "";
    const impactAssessment = typeof rawImpact === "string" ? rawImpact : "";

    const suggestedActions: readonly SuggestedAction[] = Array.isArray(rawActions)
      ? (rawActions as ReadonlyArray<Readonly<Record<string, unknown>>>).map(toSuggestedAction)
      : [];

    const evidencesCited: readonly string[] = Array.isArray(rawCitations)
      ? (rawCitations as readonly unknown[]).filter((id): id is string => typeof id === "string")
      : [];

    return {
      headline,
      rootCauseSummary,
      impactAssessment,
      suggestedActions,
      evidencesCited,
      summarySource: "ai",
    };
  } catch {
    // Intentional: JSON parsing failure is expected for malformed LLM output
    return null;
  }
};

/**
 * Runs hallucination detection on the raw LLM response text.
 * Returns true if the response is likely hallucinated.
 */
const isHallucinated = (rawResponse: string, evidenceIds: readonly string[]): boolean => {
  const result = checkForHallucinations(rawResponse, {
    evidence: evidenceIds,
  });
  return result.isLikelyHallucinated;
};

// ==================== Factory ====================

/**
 * Creates an AI summarizer service.
 *
 * Uses the factory pattern with injected LLMCompletionPort dependency,
 * keeping vendor SDKs out of the service layer.
 *
 * @param llmPort - LLM completion port for making inference calls
 * @returns AiSummarizerService with a summarize method
 */
export const createAiSummarizer = (llmPort: LLMCompletionPort): AiSummarizerService => ({
  summarize: async (
    input: AiSummarizerInput,
    context: RequestContext
  ): Promise<IncidentSummaryResponse> => {
    const serviceLogger = createLogger("ai-summarizer");
    const startTime = Date.now();
    const { alert, severity, runbooks, correlations, evidenceCatalog } = input;

    // Build prompts from evidence
    const userPrompt = buildTriageUserPrompt({
      alert,
      severity,
      runbooks,
      correlations,
      evidenceCatalog,
    });

    const { triageLlmModel: model } = appConfig;

    serviceLogger.info("Starting AI summarization", {
      model,
      evidenceCount: Object.keys(evidenceCatalog.items).length,
      durationMs: 0,
      ...context,
    });

    const fallbackInput = { alert, severity, runbooks, evidenceCatalog };

    try {
      // Call LLM via port interface
      const rawResponse = await llmPort.complete(
        TRIAGE_SYSTEM_PROMPT,
        userPrompt,
        {
          model,
          timeoutMs: AI_SUMMARIZER_TIMEOUT_MS,
          temperature: 0,
        },
        context
      );

      // Parse structured response
      const parsed = parseSummaryResponse(rawResponse);
      if (!parsed) {
        const durationMs = Date.now() - startTime;
        serviceLogger.warn("AI response parsing failed, using fallback", {
          durationMs,
          responseLength: rawResponse.length,
          ...context,
        });
        return generateFallbackSummary(fallbackInput);
      }

      // Hallucination detection
      const evidenceIds = Object.keys(evidenceCatalog.items);
      if (isHallucinated(rawResponse, evidenceIds)) {
        const durationMs = Date.now() - startTime;
        serviceLogger.warn("AI response flagged as hallucinated, using fallback", {
          durationMs,
          ...context,
        });
        return generateFallbackSummary(fallbackInput);
      }

      // Validate against evidence catalog
      const validation = validateSummaryOutput(parsed, evidenceCatalog);
      if (!validation.valid) {
        const durationMs = Date.now() - startTime;
        const { violations } = validation;
        const { length: violationCount } = violations;
        serviceLogger.warn("AI response failed validation, using fallback", {
          durationMs,
          violationCount,
          violations: violations.slice(0, 5).map(({ rule, message }) => `${rule}: ${message}`),
          ...context,
        });
        return generateFallbackSummary(fallbackInput);
      }

      const durationMs = Date.now() - startTime;
      const { headline, suggestedActions, evidencesCited } = parsed;
      const { length: headlineLen } = headline;
      const { length: actionsLen } = suggestedActions;
      const { length: citationsLen } = evidencesCited;
      serviceLogger.info("AI summarization succeeded", {
        durationMs,
        headlineLength: headlineLen,
        actionsCount: actionsLen,
        citationsCount: citationsLen,
        ...context,
      });

      return parsed;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      serviceLogger.warn("AI summarization failed, using fallback", {
        durationMs,
        error: errorMsg,
        ...context,
      });
      return generateFallbackSummary(fallbackInput);
    }
  },
});
