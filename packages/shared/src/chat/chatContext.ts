/**
 * Chat Context
 *
 * Fail-safe fetching of page context and RAG search results.
 * Never throws — returns null on any error to avoid blocking chat flow.
 *
 * @module chat/chatContext
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import type { RequestContext } from "../core/types.js";
import type {
  ChatContextPort,
  ChatContextData,
  ChatPageContext,
  ChatRAGResult,
  ChatCompletionInput,
  ChatInvestigationResult,
} from "./types.js";

const logger = createLogger("chat-context");

/** Lookup table mapping page types to their context fetcher method. */
const PAGE_TYPE_FETCHERS: Readonly<
  Record<string, keyof Pick<ChatContextPort, "getAnalysisContext" | "getIncidentContext">>
> = {
  analysis: "getAnalysisContext",
  incident: "getIncidentContext",
};

/**
 * Fetches page context data based on the current page type and entity.
 * Returns null on any error — never blocks the chat flow.
 */
export const fetchPageContext = async (
  contextPort: ChatContextPort | undefined,
  pageContext: ChatPageContext,
  tenantId: string,
  context: RequestContext
): Promise<ChatContextData | null> => {
  if (!contextPort || !pageContext.entityId) {
    return null;
  }

  const fetcher = PAGE_TYPE_FETCHERS[pageContext.pageType];
  if (!fetcher) {
    return null;
  }

  try {
    return await contextPort[fetcher](pageContext.entityId, tenantId, context);
  } catch (error: unknown) {
    logger.warn("Failed to fetch page context — proceeding without it", {
      pageType: pageContext.pageType,
      error: getErrorMessage(error),
      ...context,
    });
    return null;
  }
};

/** Builds a RAG query string enriched with page context when available. */
const buildRAGQuery = (userMessage: string, pageContextData: ChatContextData | null): string => {
  if (!pageContextData) {
    return userMessage;
  }

  const contextSuffix = pageContextData.summary
    ? ` ${pageContextData.title} ${pageContextData.summary}`
    : ` ${pageContextData.title}`;

  return userMessage + contextSuffix;
};

/**
 * Performs RAG search, optionally enriched with page context.
 * Returns null on any error — never blocks the chat flow.
 */
export const fetchRAGContext = async (
  contextPort: ChatContextPort | undefined,
  userMessage: string,
  pageContextData: ChatContextData | null,
  tenantId: string,
  context: RequestContext
): Promise<ChatRAGResult | null> => {
  if (!contextPort) {
    return null;
  }

  try {
    const queryText = buildRAGQuery(userMessage, pageContextData);
    return await contextPort.searchRAG(queryText, tenantId, context);
  } catch (error: unknown) {
    logger.warn("RAG search failed — proceeding without context", {
      error: getErrorMessage(error),
      ...context,
    });
    return null;
  }
};

/**
 * Runs the investigation pipeline for an incident page.
 * Returns null when not applicable, not configured, or on any error.
 * Never blocks the chat flow — follows the same fail-safe pattern as fetchPageContext/fetchRAGContext.
 */
export const fetchInvestigationContext = async (
  contextPort: ChatContextPort | undefined,
  input: ChatCompletionInput,
  context: RequestContext
): Promise<ChatInvestigationResult | null> => {
  if (!contextPort?.investigateIncident) {
    return null;
  }

  const { entityId } = input.pageContext;
  if (input.pageContext.pageType !== "incident" || !entityId) {
    return null;
  }

  try {
    return await contextPort.investigateIncident(
      input.userMessage,
      entityId,
      input.tenantId,
      context
    );
  } catch (error: unknown) {
    logger.warn("Investigation failed — proceeding without it", {
      error: getErrorMessage(error),
      ...context,
    });
    return null;
  }
};
