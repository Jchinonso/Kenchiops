/**
 * Alert Analysis Service (Pipeline B)
 *
 * End-to-end orchestrator for alert context analysis.
 * Fetches context from provider API → truncates to token budget →
 * enriches with RAG → calls LLM → produces DiagnosticOutput.
 *
 * @module services/alertAnalysisService
 */

import {
  createLogger,
  getErrorMessage,
  truncateAlertContext,
  enrichDiagnosticWithRAG,
  formatRAGContextForPrompt,
  checkAlertAnalysisQuota,
  incrementAlertAnalysisCount,
  type RequestContext,
  type AlertContext,
  type DiagnosticOutput,
  type DiagnosticResult,
  type DegradedResult,
} from "@kenchi/shared";
import type { NormalizedAlert, AlertSource } from "../types/incidentTypes.js";
import type { AlertContextPort } from "../ports/alertContextPort.js";
import type { LLMCompletionPort } from "../types/summaryTypes.js";

const logger = createLogger("alert-analysis");

// ==================== Prompt Building ====================

const ALERT_ANALYSIS_SYSTEM_PROMPT = [
  "You are a DevOps diagnostic assistant analyzing an alert from a monitoring system.",
  "Analyze the provided alert context and produce a structured diagnostic assessment.",
  "",
  "Your response MUST be valid JSON matching this schema:",
  "{",
  '  "rootCause": { "category": string, "subcategory": string, "summary": string, "confidence": number },',
  '  "causalityChain": { "primary": { "type": string, "summary": string }, "secondary": [], "explanation": string },',
  '  "impact": { "severity": "critical"|"high"|"medium"|"low", "scope": string, "duration": string },',
  '  "recommendations": {',
  '    "immediate": [{ "description": string, "priority": "immediate" }],',
  '    "preventive": [{ "description": string, "priority": "medium" }],',
  '    "investigative": [{ "description": string, "priority": "low" }]',
  "  }",
  "}",
  "",
  "Categories: infrastructure, configuration, application, deployment, external",
  "Be concise, accurate, and actionable.",
].join("\n");

const buildUserPrompt = (alertContext: AlertContext, ragContext: string): string => {
  const sections = [
    `## Alert: ${alertContext.title}`,
    `**Source:** ${alertContext.source}`,
    `**Severity:** ${alertContext.severity}`,
    `**Triggered:** ${alertContext.triggeredAt}`,
    alertContext.description ? `**Description:** ${alertContext.description}` : "",
    "",
  ];

  const { evidence } = alertContext;

  if (evidence.stackTraces.length > 0) {
    sections.push("## Stack Traces");
    evidence.stackTraces.forEach((frame) => {
      sections.push(`  ${frame.filename}:${String(frame.lineno ?? 0)} in ${frame.function}`);
    });
    sections.push("");
  }

  if (evidence.logs.length > 0) {
    sections.push("## Log Snippets");
    evidence.logs.forEach((log) => {
      sections.push(`[${log.level ?? "INFO"}] ${log.message}`);
    });
    sections.push("");
  }

  if (evidence.metrics.length > 0) {
    sections.push("## Metrics");
    evidence.metrics.forEach((metric) => {
      const latest = metric.values[metric.values.length - 1];
      sections.push(
        `${metric.metricName}: ${latest ? String(latest.value) : "N/A"} ${metric.unit ?? ""}`
      );
    });
    sections.push("");
  }

  if (evidence.breadcrumbs.length > 0) {
    sections.push("## Breadcrumbs (recent activity)");
    evidence.breadcrumbs.forEach((crumb) => {
      sections.push(`[${crumb.category}] ${crumb.message ?? ""}`);
    });
    sections.push("");
  }

  if (ragContext.length > 0) {
    sections.push(ragContext);
  }

  return sections.filter(Boolean).join("\n");
};

// ==================== Degraded Builders ====================

const buildDegradedFromContextFailure = (
  alert: NormalizedAlert,
  _error: string
): DegradedResult => ({
  status: "degraded",
  reason: "context_fetch_failed",
  partialAnalysis: {
    rawPreview: `${alert.title}: ${alert.description ?? ""}`.slice(0, 2000),
    detectedPatterns: [],
    suggestedCategory: alert.severity === "critical" ? "infrastructure" : "application",
  },
  confidence: "low",
  recommendation: `Context fetch failed. Review the alert directly in ${alert.source}.`,
});

const buildDegradedFromAnalysisFailure = (
  alert: NormalizedAlert,
  _error: string
): DegradedResult => ({
  status: "degraded",
  reason: "context_fetch_failed",
  partialAnalysis: {
    rawPreview: `${alert.title}: ${alert.description ?? ""}`.slice(0, 2000),
    detectedPatterns: [],
    suggestedCategory: "infrastructure",
  },
  confidence: "low",
  recommendation: "Analysis could not be completed. Review alert manually.",
});

// ==================== Response Parsing ====================

const parseAnalysisResponse = (response: string): DiagnosticResult | null => {
  try {
    // Limit input size to prevent ReDoS on large LLM responses
    const trimmed = response.length > 50_000 ? response.slice(0, 50_000) : response;

    // Find the first { and last } to extract the JSON object
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
    if (!parsed.rootCause || !parsed.impact) {
      return null;
    }

    const rootCause = parsed.rootCause as DiagnosticResult["rootCause"] | undefined;
    const causalityChain = parsed.causalityChain as DiagnosticResult["causalityChain"] | undefined;
    const impact = parsed.impact as DiagnosticResult["impact"] | undefined;
    const recommendations = parsed.recommendations as
      | DiagnosticResult["recommendations"]
      | undefined;

    if (!rootCause || !impact) {
      return null;
    }

    return {
      status: "complete",
      rootCause,
      causalityChain: causalityChain ?? {
        primary: { type: "unknown", summary: "" },
        secondary: [],
        explanation: "",
      },
      impact,
      recommendations: recommendations ?? { immediate: [], preventive: [], investigative: [] },
      relatedContext: { pastIncidents: [], runbooks: [], documentation: [] },
    };
  } catch {
    return null;
  }
};

// ==================== Service Factory ====================

/** Dependencies for the alert analysis service. */
interface AlertAnalysisServiceDeps {
  readonly contextAdapters: Readonly<Partial<Record<AlertSource, AlertContextPort>>>;
  readonly llmPort: LLMCompletionPort;
}

/** Return type of createAlertAnalysisService. */
export interface AlertAnalysisService {
  readonly analyzeAlert: (
    alert: NormalizedAlert,
    context: RequestContext
  ) => Promise<DiagnosticOutput>;
}

/**
 * Creates the alert analysis service (Pipeline B orchestrator).
 */
export const createAlertAnalysisService = (
  deps: AlertAnalysisServiceDeps
): AlertAnalysisService => {
  const { contextAdapters, llmPort } = deps;

  /**
   * Analyzes an alert end-to-end: fetch context → truncate → RAG → LLM → DiagnosticOutput.
   */
  const analyzeAlert = async (
    alert: NormalizedAlert,
    context: RequestContext
  ): Promise<DiagnosticOutput> => {
    const logContext = { ...context };
    const startTime = Date.now();

    // Step 0: Budget check (fail-open)
    const quotaCheck = await checkAlertAnalysisQuota(context.tenantId, undefined, context);
    if (!quotaCheck.allowed) {
      const durationMs = Date.now() - startTime;
      logger.warn("Alert analysis quota exceeded", {
        provider: alert.source,
        operation: "analyzeAlert",
        durationMs,
        alertId: alert.sourceAlertId,
        reason: quotaCheck.reason,
        ...logContext,
      });
      return buildDegradedFromContextFailure(alert, quotaCheck.reason ?? "Analysis quota exceeded");
    }

    // Step 1: Resolve context adapter
    const contextAdapter = contextAdapters[alert.source];
    if (!contextAdapter) {
      const durationMs = Date.now() - startTime;
      logger.warn("No context adapter for alert source — producing degraded result", {
        provider: alert.source,
        operation: "analyzeAlert",
        durationMs,
        alertId: alert.sourceAlertId,
        ...logContext,
      });
      return buildDegradedFromContextFailure(alert, `No context adapter for ${alert.source}`);
    }

    // Step 2: Fetch AlertContext
    let alertContext: AlertContext; // let: assigned in try, used across steps
    try {
      alertContext = await contextAdapter.fetchContext(alert, context);
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      logger.warn("Alert context fetch failed — producing degraded result", {
        provider: alert.source,
        operation: "analyzeAlert",
        durationMs,
        alertId: alert.sourceAlertId,
        error: getErrorMessage(error),
        ...logContext,
      });
      return buildDegradedFromContextFailure(alert, getErrorMessage(error));
    }

    // Step 3: Truncate to 20K token budget
    const truncatedContext = truncateAlertContext(alertContext);

    // Step 4: RAG enrichment (fail-safe)
    const ragResult = await enrichDiagnosticWithRAG(
      { rootCauseSummary: alert.title, alertTitle: alert.title, tenantId: context.tenantId },
      context
    );
    const ragPromptText = formatRAGContextForPrompt(ragResult);

    // Step 5: Build prompt and call LLM
    const userPrompt = buildUserPrompt(truncatedContext, ragPromptText);

    try {
      const response = await llmPort.complete(
        ALERT_ANALYSIS_SYSTEM_PROMPT,
        userPrompt,
        { model: "gemini-2.5-flash", timeoutMs: 90_000, maxTokens: 4096, temperature: 0 },
        context
      );

      // Step 6: Parse response
      const diagnostic = parseAnalysisResponse(response);
      if (!diagnostic) {
        const durationMs = Date.now() - startTime;
        logger.warn("Failed to parse LLM diagnostic response", {
          provider: alert.source,
          operation: "analyzeAlert",
          durationMs,
          alertId: alert.sourceAlertId,
          responseLength: response.length,
          ...logContext,
        });
        return buildDegradedFromAnalysisFailure(alert, "Failed to parse LLM response");
      }

      // Enrich with RAG context
      const enrichedDiagnostic: DiagnosticResult = {
        ...diagnostic,
        relatedContext: {
          pastIncidents: ragResult.pastIncidents,
          runbooks: ragResult.runbooks,
          documentation: ragResult.documentation,
        },
      };

      // Track usage after successful analysis
      await incrementAlertAnalysisCount(context.tenantId, context);

      const durationMs = Date.now() - startTime;
      logger.info("Alert analysis completed", {
        provider: alert.source,
        operation: "analyzeAlert",
        durationMs,
        alertId: alert.sourceAlertId,
        rootCauseCategory: enrichedDiagnostic.rootCause.category,
        confidence: enrichedDiagnostic.rootCause.confidence,
        ragDocsUsed: ragResult.pastIncidents.length + ragResult.runbooks.length,
        ...logContext,
      });

      return enrichedDiagnostic;
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      logger.error("Alert LLM analysis failed", {
        provider: alert.source,
        operation: "analyzeAlert",
        durationMs,
        alertId: alert.sourceAlertId,
        error: getErrorMessage(error),
        ...logContext,
      });
      return buildDegradedFromAnalysisFailure(alert, getErrorMessage(error));
    }
  };

  return { analyzeAlert };
};
