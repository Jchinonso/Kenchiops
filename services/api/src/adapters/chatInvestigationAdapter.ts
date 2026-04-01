/**
 * Chat Investigation Adapter
 *
 * Bridges the investigation service into the chat context port interface.
 * Runs the full investigation pipeline (intent → evidence → correlate → diagnose)
 * and formats the result for prompt injection and frontend display.
 *
 * Gracefully degrades: returns null on any failure so chat continues without investigation.
 *
 * @module adapters/chatInvestigationAdapter
 */

import {
  createLogger,
  redactSecrets,
  truncateText,
  getErrorMessage,
  CHAT_DEFAULTS,
  type RequestContext,
  type InvestigationService,
  type InvestigationIntent,
  type InvestigationEvidenceItem,
  type InvestigationCorrelation,
  type InvestigationDiagnosis,
  type ChatInvestigationResult,
} from "@kenchi/shared";

const logger = createLogger("chat-investigation-adapter");

/** Type export for the adapter returned by the factory. */
export type ChatInvestigationAdapter = ReturnType<typeof createChatInvestigationAdapter>;

/**
 * Creates a chat investigation adapter that delegates to the investigation service.
 */
export const createChatInvestigationAdapter = (investigationService: InvestigationService) => ({
  investigate: async (
    userMessage: string,
    alertId: string,
    tenantId: string,
    context: RequestContext
  ): Promise<ChatInvestigationResult | null> => {
    const startTime = Date.now();

    try {
      // Stage 1: Parse user intent
      const intentStartTime = Date.now();
      const intent = await investigationService.parseIntent(userMessage, context);
      const intentDurationMs = Date.now() - intentStartTime;

      logger.info("Investigation intent parsed", {
        provider: "llm",
        operation: "parseInvestigationIntent",
        durationMs: intentDurationMs,
        symptom: intent.symptom,
        confidenceScore: intent.confidenceScore,
        ...context,
      });

      // Stage 2: Gather evidence (parallel DB + monitoring)
      const evidence = await investigationService.gatherEvidence(intent, tenantId, context);

      // Stage 3: Correlate evidence (deterministic, fast)
      const correlation = await investigationService.correlateEvidence(evidence, intent, context);

      // Stage 4: LLM diagnosis
      const diagnosis = await investigationService.diagnose(intent, evidence, correlation, context);

      const durationMs = Date.now() - startTime;
      logger.info("Investigation completed for chat", {
        provider: "llm",
        operation: "chatInvestigation",
        durationMs,
        evidenceCount: evidence.length,
        diagnosisConfidence: diagnosis.confidence,
        diagnosisSource: diagnosis.diagnosisSource,
        ...context,
      });

      // Format for prompt injection
      const formattedContext = formatInvestigationForPrompt(
        intent,
        evidence,
        correlation,
        diagnosis
      );

      return {
        formattedContext,
        diagnosis: {
          summary: diagnosis.summary,
          rootCauseHypothesis: diagnosis.rootCauseHypothesis,
          confidence: diagnosis.confidence,
          suggestedActions: diagnosis.suggestedActions.map((action) => ({
            action: action.action,
            priority: action.priority,
          })),
          evidenceSources: [...new Set(evidence.map((item) => item.source))],
        },
        evidenceCount: evidence.length,
        success: true,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      logger.warn("Investigation failed for chat, falling back to static context", {
        provider: "llm",
        operation: "chatInvestigation",
        durationMs,
        error: redactSecrets(getErrorMessage(error)),
        ...context,
      });

      return null;
    }
  },
});

/**
 * Formats investigation results as a markdown section for the system prompt.
 * Truncated to MAX_INVESTIGATION_CONTEXT_TOKENS to prevent token budget exhaustion.
 */
const formatInvestigationForPrompt = (
  intent: InvestigationIntent,
  evidence: readonly InvestigationEvidenceItem[],
  correlation: InvestigationCorrelation,
  diagnosis: InvestigationDiagnosis
): string => {
  const formatPriorityLabel = (priority: string): string =>
    priority === "immediate"
      ? "[URGENT]"
      : priority === "short_term"
        ? "[SHORT-TERM]"
        : "[LONG-TERM]";

  const headerSection = [
    "## Live Investigation Results",
    "",
    "### Diagnosis",
    `**Root Cause Hypothesis:** ${diagnosis.rootCauseHypothesis}`,
    `**Confidence:** ${Math.round(diagnosis.confidence * 100)}%`,
    `**Symptom Detected:** ${intent.symptom.replace(/_/g, " ")}`,
    ...(intent.serviceName ? [`**Affected Service:** ${intent.serviceName}`] : []),
  ];

  const actionsSection =
    diagnosis.suggestedActions.length > 0
      ? [
          "",
          "### Suggested Actions",
          ...diagnosis.suggestedActions.map((action) => {
            const reasoningSuffix = action.reasoning ? ` — ${action.reasoning}` : "";
            return `- ${formatPriorityLabel(action.priority)} ${action.action}${reasoningSuffix}`;
          }),
        ]
      : [];

  const topEvidence = evidence.slice(0, CHAT_DEFAULTS.MAX_INVESTIGATION_EVIDENCE_IN_PROMPT);
  const evidenceSection =
    topEvidence.length > 0
      ? [
          "",
          "### Monitoring Evidence",
          ...topEvidence.flatMap((item) => {
            const summary = truncateText(
              item.summary,
              CHAT_DEFAULTS.MAX_INVESTIGATION_EVIDENCE_SUMMARY_LENGTH
            );
            return [
              `- [${item.source}] ${item.title} (relevance: ${Math.round(item.relevance * 100)}%)`,
              `  ${summary}`,
            ];
          }),
        ]
      : [];

  const patternsSection =
    correlation.patterns.length > 0
      ? ["", "### Detected Patterns", ...correlation.patterns.map((pattern) => `- ${pattern}`)]
      : [];

  const servicesSection =
    correlation.relatedServices.length > 1
      ? ["", `### Related Services: ${correlation.relatedServices.join(", ")}`]
      : [];

  const formatted = [
    ...headerSection,
    ...actionsSection,
    ...evidenceSection,
    ...patternsSection,
    ...servicesSection,
  ].join("\n");

  return truncateText(
    formatted,
    CHAT_DEFAULTS.MAX_INVESTIGATION_CONTEXT_TOKENS * CHAT_DEFAULTS.CHARS_PER_TOKEN
  );
};
