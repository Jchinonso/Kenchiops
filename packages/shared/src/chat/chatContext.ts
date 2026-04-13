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
 * Matches a Kenchi analysis ID in a user message.
 * IDs follow the format `ana_` followed by alphanumeric/underscore characters.
 * Works for both bare IDs (`ana_1775616179573_9pmcs8hn8`) and full URLs
 * (`https://kenchiops.app/dashboard/cicd/analyses/ana_...`).
 * Word boundary anchors ensure we don't match substrings like `banana_123`.
 */
const ANALYSIS_ID_PATTERN = /\bana_[a-zA-Z0-9_]+\b/;

/**
 * Extracts the first Kenchi analysis ID found in a user message.
 * Returns null if no match is found.
 */
export const extractAnalysisIdFromMessage = (userMessage: string): string | null => {
  const match = ANALYSIS_ID_PATTERN.exec(userMessage);
  return match ? match[0] : null;
};

/**
 * Resolves the fetcher + entity ID for a chat request.
 * Priority order:
 * 1. If the user message contains a Kenchi analysis ID (bare or URL), always
 *    use `getAnalysisContext` with that ID — users can query any analysis from
 *    any page by pasting its link.
 * 2. Otherwise fall back to `pageContext.pageType` + `pageContext.entityId`.
 *
 * Returns null when no fetcher applies (missing entity ID, unsupported page type).
 */
const resolveFetcherAndEntity = (
  pageContext: ChatPageContext,
  userMessage: string | undefined
): {
  readonly fetcher: keyof Pick<ChatContextPort, "getAnalysisContext" | "getIncidentContext">;
  readonly entityId: string;
} | null => {
  const analysisIdFromMessage =
    userMessage !== undefined ? extractAnalysisIdFromMessage(userMessage) : null;

  if (analysisIdFromMessage) {
    return { fetcher: "getAnalysisContext", entityId: analysisIdFromMessage };
  }

  const fetcher = PAGE_TYPE_FETCHERS[pageContext.pageType];
  if (!fetcher || !pageContext.entityId) {
    return null;
  }

  return { fetcher, entityId: pageContext.entityId };
};

/**
 * Fetches page context data based on the current page type and entity.
 * When a Kenchi analysis ID (or URL) appears in the user's message, that ID
 * takes precedence over `pageContext.entityId` so users can ask about any
 * analysis by pasting its link into the chat — even from pages that do not
 * natively support a page context (e.g. overview, knowledge-base).
 * Returns null on any error — never blocks the chat flow.
 */
export const fetchPageContext = async (
  contextPort: ChatContextPort | undefined,
  pageContext: ChatPageContext,
  tenantId: string,
  context: RequestContext,
  userMessage?: string
): Promise<ChatContextData | null> => {
  if (!contextPort) {
    return null;
  }

  const resolved = resolveFetcherAndEntity(pageContext, userMessage);
  if (!resolved) {
    return null;
  }

  try {
    return await contextPort[resolved.fetcher](resolved.entityId, tenantId, context);
  } catch (error: unknown) {
    logger.warn("Failed to fetch page context — proceeding without it", {
      pageType: pageContext.pageType,
      fetcher: resolved.fetcher,
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
