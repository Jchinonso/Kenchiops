/**
 * Chat Context Adapter
 *
 * Implements the ChatContextPort interface for enriching Copilot Drawer
 * prompts with page context (analysis/incident data) and RAG search results.
 *
 * @module adapters/chatContextAdapter
 */

import {
  getAnalysisById,
  getAlertById,
  searchKnowledgeDocs,
  createLogger,
  getErrorMessage,
  truncateText,
  CHAT_DEFAULTS,
  type ChatContextPort,
  type ChatContextData,
  type ChatRAGResult,
  type ChatRAGSource,
  type RequestContext,
} from "@kenchi/shared";

const PROVIDER = "database" as const;
const logger = createLogger("chat-context-adapter");

/**
 * Formats RAG knowledge doc results into a prompt section and source citations.
 */
const formatRAGResults = (
  results: ReadonlyArray<{
    readonly item: { readonly title: string; readonly docType: string; readonly content: string };
    readonly similarity: number;
  }>
): ChatRAGResult => {
  if (results.length === 0) {
    return { formattedContext: "", sources: [] };
  }

  const topResults = results.slice(0, CHAT_DEFAULTS.MAX_RAG_RESULTS);

  const sources: readonly ChatRAGSource[] = topResults.map(({ item, similarity }) => ({
    title: item.title,
    docType: item.docType,
    similarity,
  }));

  const docEntries = topResults.map(({ item, similarity }) => {
    const pct = (similarity * CHAT_DEFAULTS.RAG_PERCENTAGE_MULTIPLIER).toFixed(0);
    const content =
      item.content.length > CHAT_DEFAULTS.MAX_RAG_DOC_CONTENT
        ? `${item.content.slice(0, CHAT_DEFAULTS.MAX_RAG_DOC_CONTENT)}...<TRUNCATED>`
        : item.content;
    return `- [${item.docType}] ${item.title} (${pct}% match)\n  ${content}`;
  });

  const formattedContext = [
    "## Relevant Knowledge Base Context",
    "",
    "The following are relevant past resolutions and knowledge docs.",
    "Use these to inform your response if applicable.",
    "",
    docEntries.join("\n\n"),
  ].join("\n");

  return { formattedContext, sources };
};

/**
 * Creates a ChatContextPort adapter backed by the shared database
 * repositories and RAG search.
 */
export const createChatContextAdapter = (): ChatContextPort => ({
  getAnalysisContext: async (
    entityId: string,
    tenantId: string,
    context: RequestContext
  ): Promise<ChatContextData | null> => {
    const startTime = Date.now();

    try {
      const analysis = await getAnalysisById(entityId, tenantId, context);
      const durationMs = Date.now() - startTime;

      if (!analysis) {
        logger.info("Analysis not found for chat context", {
          provider: PROVIDER,
          operation: "getAnalysisContext",
          durationMs,
          entityId,
          ...context,
        });
        return null;
      }

      const { summary, identifiedCause, recommendedActions } = analysis;
      const detailParts: readonly string[] = [
        ...(identifiedCause ? [`**Root Cause:** ${identifiedCause}`] : []),
        ...(recommendedActions && recommendedActions.length > 0
          ? [
              `**Recommended Actions:**\n${recommendedActions.map((action) => `- ${action}`).join("\n")}`,
            ]
          : []),
      ];

      const details =
        detailParts.length > 0
          ? truncateText(detailParts.join("\n\n"), CHAT_DEFAULTS.MAX_CONTEXT_DETAILS_LENGTH)
          : null;

      logger.info("Fetched analysis context for chat", {
        provider: PROVIDER,
        operation: "getAnalysisContext",
        durationMs,
        entityId,
        ...context,
      });

      return {
        entityType: "analysis",
        title: summary,
        summary: identifiedCause,
        details,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      logger.warn("Failed to fetch analysis context", {
        provider: PROVIDER,
        operation: "getAnalysisContext",
        durationMs,
        entityId,
        error: getErrorMessage(error),
        ...context,
      });
      return null;
    }
  },

  getIncidentContext: async (
    entityId: string,
    tenantId: string,
    context: RequestContext
  ): Promise<ChatContextData | null> => {
    const startTime = Date.now();

    try {
      const alert = await getAlertById(entityId, tenantId, context);
      const durationMs = Date.now() - startTime;

      if (!alert) {
        logger.info("Incident not found for chat context", {
          provider: PROVIDER,
          operation: "getIncidentContext",
          durationMs,
          entityId,
          ...context,
        });
        return null;
      }

      const { title, description, severity, status, serviceName, environment } = alert;
      const detailParts: readonly string[] = [
        `**Severity:** ${severity}`,
        `**Status:** ${status}`,
        ...(serviceName ? [`**Service:** ${serviceName}`] : []),
        ...(environment ? [`**Environment:** ${environment}`] : []),
      ];

      const details = truncateText(
        detailParts.join("\n"),
        CHAT_DEFAULTS.MAX_CONTEXT_DETAILS_LENGTH
      );

      logger.info("Fetched incident context for chat", {
        provider: PROVIDER,
        operation: "getIncidentContext",
        durationMs,
        entityId,
        ...context,
      });

      return {
        entityType: "incident",
        title,
        summary: description,
        details,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      logger.warn("Failed to fetch incident context", {
        provider: PROVIDER,
        operation: "getIncidentContext",
        durationMs,
        entityId,
        error: getErrorMessage(error),
        ...context,
      });
      return null;
    }
  },

  searchRAG: async (
    queryText: string,
    tenantId: string,
    context: RequestContext
  ): Promise<ChatRAGResult> => {
    const startTime = Date.now();

    try {
      const { results } = await searchKnowledgeDocs({
        queryText,
        tenantId,
        topK: CHAT_DEFAULTS.MAX_RAG_RESULTS,
      });
      const durationMs = Date.now() - startTime;

      logger.info("RAG search completed for chat", {
        provider: "rag",
        operation: "searchKnowledgeDocs",
        durationMs,
        resultCount: results.length,
        ...context,
      });

      return formatRAGResults(results);
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      logger.warn("RAG search failed for chat context", {
        provider: "rag",
        operation: "searchKnowledgeDocs",
        durationMs,
        error: getErrorMessage(error),
        ...context,
      });
      return { formattedContext: "", sources: [] };
    }
  },
});
