/**
 * Diagnostic RAG Enrichment
 *
 * Enriches diagnostic analysis with relevant past incidents, runbooks,
 * and documentation retrieved via vector search. Used by both Pipeline A
 * (Log Analysis) and Pipeline B (Alert Context Analysis).
 *
 * Fail-safe: returns empty context on any error to never block analysis.
 *
 * @module diagnostics/ragEnrichment
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import type { RequestContext } from "../core/types.js";
import { searchKnowledgeDocs } from "../rag/search.js";
import { expandWithRelatedDocs } from "../rag/multiHop.js";
import { estimateTokenCount } from "../rag/chunking.js";
import { KNOWLEDGE_DOC_TYPES } from "../constants/ragConstants.js";
import type { KnowledgeDocRecord } from "../database/knowledgeDoc/types.js";
import type { VectorSearchResult } from "../database/vector/types.js";
import type {
  DiagnosticRAGContext,
  RAGEnrichmentInput,
  IncidentRef,
  RunbookRef,
  DocRef,
} from "./types.js";

const logger = createLogger("diagnostic-rag-enrichment");

// ==================== Constants ====================

const RAG_ENRICHMENT_CONFIG = {
  /** Token budget allocated for RAG context in LLM prompt */
  TOKEN_BUDGET: 8_000,
  /** Maximum results to retrieve per category */
  MAX_RESULTS_PER_CATEGORY: 5,
} as const;

/** Doc types that map to past incidents */
const INCIDENT_DOC_TYPES: readonly string[] = [
  KNOWLEDGE_DOC_TYPES.POSTMORTEM,
  KNOWLEDGE_DOC_TYPES.KNOWN_ISSUES,
] as const;

/** Doc types that map to runbooks */
const RUNBOOK_DOC_TYPES: readonly string[] = [
  KNOWLEDGE_DOC_TYPES.RUNBOOK,
  KNOWLEDGE_DOC_TYPES.SOP,
  KNOWLEDGE_DOC_TYPES.TROUBLESHOOTING,
] as const;

/** Doc types that map to documentation */
const DOCUMENTATION_DOC_TYPES: readonly string[] = [
  KNOWLEDGE_DOC_TYPES.DOCUMENTATION,
  KNOWLEDGE_DOC_TYPES.API_DOCS,
  KNOWLEDGE_DOC_TYPES.ARCHITECTURE,
  KNOWLEDGE_DOC_TYPES.CONFIG_GUIDE,
] as const;

// ==================== Empty Context ====================

const EMPTY_RAG_CONTEXT: DiagnosticRAGContext = {
  pastIncidents: [],
  runbooks: [],
  documentation: [],
  totalTokens: 0,
} as const;

// ==================== Query Building ====================

/**
 * Builds a search query string from enrichment input fields.
 */
const buildSearchQuery = (input: RAGEnrichmentInput): string => {
  const parts: readonly string[] = [
    input.rootCauseSummary,
    ...(input.alertTitle ? [input.alertTitle] : []),
    ...(input.serviceName ? [`service: ${input.serviceName}`] : []),
  ];
  return parts.join(" ");
};

// ==================== Result Mapping ====================

/**
 * Maps a knowledge doc search result to an IncidentRef.
 */
const toIncidentRef = (result: VectorSearchResult<KnowledgeDocRecord>): IncidentRef => ({
  id: result.item.id,
  title: result.item.title,
  similarity: result.similarity,
  resolvedAt: result.item.updatedAt?.toISOString(),
  resolution: truncateContent(result.item.content),
});

/**
 * Maps a knowledge doc search result to a RunbookRef.
 */
const toRunbookRef = (result: VectorSearchResult<KnowledgeDocRecord>): RunbookRef => ({
  id: result.item.id,
  title: result.item.title,
  url: result.item.sourceUrl ?? undefined,
  relevance: result.similarity,
});

/**
 * Maps a knowledge doc search result to a DocRef.
 */
const toDocRef = (result: VectorSearchResult<KnowledgeDocRecord>): DocRef => ({
  id: result.item.id,
  title: result.item.title,
  url: result.item.sourceUrl ?? undefined,
  relevance: result.similarity,
});

/**
 * Truncates content to a short excerpt for incident resolution summaries.
 */
const truncateContent = (content: string): string => {
  const MAX_EXCERPT_LENGTH = 300;
  const trimmed = content.trim();
  return trimmed.length <= MAX_EXCERPT_LENGTH
    ? trimmed
    : `${trimmed.substring(0, MAX_EXCERPT_LENGTH)}...`;
};

// ==================== Token Budget Enforcement ====================

/**
 * Sorts incidents by similarity descending and drops the last (lowest) entry.
 */
const dropLowestIncident = (incidents: readonly IncidentRef[]): readonly IncidentRef[] =>
  [...incidents].sort((left, right) => right.similarity - left.similarity).slice(0, -1);

/**
 * Sorts runbooks by relevance descending and drops the last (lowest) entry.
 */
const dropLowestRunbook = (runbooks: readonly RunbookRef[]): readonly RunbookRef[] =>
  [...runbooks].sort((left, right) => right.relevance - left.relevance).slice(0, -1);

/**
 * Sorts docs by relevance descending and drops the last (lowest) entry.
 */
const dropLowestDoc = (docs: readonly DocRef[]): readonly DocRef[] =>
  [...docs].sort((left, right) => right.relevance - left.relevance).slice(0, -1);

/**
 * Removes the lowest-similarity/relevance item from the specified category.
 */
const trimLowestFromCategory = (
  context: DiagnosticRAGContext,
  category: "pastIncidents" | "runbooks" | "documentation"
): DiagnosticRAGContext => {
  if (category === "pastIncidents") {
    return { ...context, pastIncidents: dropLowestIncident(context.pastIncidents) };
  }
  if (category === "runbooks") {
    return { ...context, runbooks: dropLowestRunbook(context.runbooks) };
  }
  return { ...context, documentation: dropLowestDoc(context.documentation) };
};

/**
 * Estimates total token count for the RAG context.
 */
const estimateContextTokens = (context: DiagnosticRAGContext): number => {
  const incidentText = context.pastIncidents
    .map((inc) => `${inc.title} ${inc.resolution ?? ""}`)
    .join("\n");
  const runbookText = context.runbooks.map((rb) => rb.title).join("\n");
  const docText = context.documentation.map((doc) => doc.title).join("\n");

  return estimateTokenCount(`${incidentText}\n${runbookText}\n${docText}`);
};

/**
 * Trims results across all categories to fit within the token budget.
 * Iteratively removes the lowest-similarity item from the largest category
 * until total tokens are within budget.
 */
const enforceTokenBudget = (context: DiagnosticRAGContext): DiagnosticRAGContext => {
  const totalTokens = estimateContextTokens(context);
  if (totalTokens <= RAG_ENRICHMENT_CONFIG.TOKEN_BUDGET) {
    return { ...context, totalTokens };
  }

  // let: iterative reduction algorithm — must mutate accumulator each pass
  let current = context; // let: iterative token budget reduction
  let currentTokens = totalTokens; // let: recomputed each iteration

  while (currentTokens > RAG_ENRICHMENT_CONFIG.TOKEN_BUDGET) {
    const { pastIncidents, runbooks, documentation } = current;

    // Nothing left to trim
    const totalItems = pastIncidents.length + runbooks.length + documentation.length;
    if (totalItems === 0) {
      break;
    }

    // Find the category with the most items and remove its lowest-scored entry
    const categories = [
      { name: "pastIncidents" as const, count: pastIncidents.length },
      { name: "runbooks" as const, count: runbooks.length },
      { name: "documentation" as const, count: documentation.length },
    ];

    const largest = categories.reduce((max, cat) => (cat.count > max.count ? cat : max));

    current = trimLowestFromCategory(current, largest.name);
    currentTokens = estimateContextTokens(current);
  }

  return { ...current, totalTokens: currentTokens };
};

// ==================== Search Helpers ====================

/**
 * Searches for knowledge docs of specific types, returning mapped results.
 * Returns empty array on failure.
 */
const searchByDocTypes = async (
  queryText: string,
  docTypes: readonly string[],
  tenantId: string | undefined,
  context: RequestContext
): Promise<ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>> => {
  // Search with the first doc type as primary filter
  // Knowledge search only supports a single docType filter
  const firstDocType = docTypes[0];
  if (!firstDocType) {
    return [];
  }

  try {
    const { results } = await searchKnowledgeDocs({
      queryText,
      tenantId,
      docType: firstDocType,
      topK: RAG_ENRICHMENT_CONFIG.MAX_RESULTS_PER_CATEGORY,
    });
    return results;
  } catch (error) {
    logger.warn("RAG category search failed", {
      docType: firstDocType,
      error: getErrorMessage(error),
      ...context,
    });
    return [];
  }
};

// ==================== Public API ====================

/**
 * Enriches diagnostic analysis with RAG-retrieved context.
 *
 * Runs 3 parallel searches (past incidents, runbooks, documentation),
 * maps results to diagnostic reference types, and enforces token budget.
 *
 * Fail-safe: returns empty context on any error to never block analysis.
 *
 * @param input - Root cause summary and optional metadata for query building
 * @param context - Request context for tracing
 * @returns RAG context with past incidents, runbooks, and documentation
 */
export const enrichDiagnosticWithRAG = async (
  input: RAGEnrichmentInput,
  context: RequestContext
): Promise<DiagnosticRAGContext> => {
  const startTime = Date.now();
  const queryText = buildSearchQuery(input);

  logger.info("Starting diagnostic RAG enrichment", {
    queryLength: queryText.length,
    hasAlertTitle: input.alertTitle !== undefined,
    hasServiceName: input.serviceName !== undefined,
    ...context,
  });

  try {
    const [incidentResults, runbookResults, docResults] = await Promise.all([
      searchByDocTypes(queryText, INCIDENT_DOC_TYPES, input.tenantId, context),
      searchByDocTypes(queryText, RUNBOOK_DOC_TYPES, input.tenantId, context),
      searchByDocTypes(queryText, DOCUMENTATION_DOC_TYPES, input.tenantId, context),
    ]);

    // Multi-hop expansion: use initial result IDs to find related docs via graph traversal
    const initialDocIds = [
      ...incidentResults.map((result) => result.item.id),
      ...runbookResults.map((result) => result.item.id),
    ];
    const expandedDocIds =
      initialDocIds.length > 0 ? await expandWithRelatedDocs(initialDocIds, { maxDepth: 2 }) : [];

    // Fetch expanded docs that aren't already in initial results
    const initialIdSet = new Set(initialDocIds);
    const newDocIds = expandedDocIds.filter((docId) => !initialIdSet.has(docId));

    // Search for the expanded docs as additional documentation
    const expandedDocs =
      newDocIds.length > 0
        ? await searchByDocTypes(
            newDocIds.slice(0, 5).join(" "),
            DOCUMENTATION_DOC_TYPES,
            input.tenantId,
            context
          )
        : [];

    const rawContext: DiagnosticRAGContext = {
      pastIncidents: incidentResults.map(toIncidentRef),
      runbooks: runbookResults.map(toRunbookRef),
      documentation: [...docResults, ...expandedDocs].map(toDocRef),
      totalTokens: 0,
    };

    const enrichedContext = enforceTokenBudget(rawContext);
    const durationMs = Date.now() - startTime;

    logger.info("Diagnostic RAG enrichment completed", {
      incidentCount: enrichedContext.pastIncidents.length,
      runbookCount: enrichedContext.runbooks.length,
      docCount: enrichedContext.documentation.length,
      totalTokens: enrichedContext.totalTokens,
      durationMs,
      ...context,
    });

    return enrichedContext;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.warn("Diagnostic RAG enrichment failed, returning empty context", {
      error: getErrorMessage(error),
      durationMs,
      ...context,
    });
    return EMPTY_RAG_CONTEXT;
  }
};

/**
 * Formats RAG context into markdown text for injection into LLM prompts.
 *
 * Produces sections for related past incidents, relevant runbooks, and
 * related documentation. Omits empty sections.
 *
 * @param ragContext - RAG context from enrichDiagnosticWithRAG
 * @returns Formatted markdown string, or empty string if no results
 */
export const formatRAGContextForPrompt = (ragContext: DiagnosticRAGContext): string => {
  const sections: readonly string[] = [
    formatIncidentSection(ragContext.pastIncidents),
    formatRunbookSection(ragContext.runbooks),
    formatDocumentationSection(ragContext.documentation),
  ].filter((section) => section.length > 0);

  return sections.join("\n\n");
};

// ==================== Formatting Helpers ====================

const formatIncidentSection = (incidents: readonly IncidentRef[]): string => {
  if (incidents.length === 0) {
    return "";
  }

  const entries = incidents.map(
    (inc) =>
      `- **${inc.title}** (similarity: ${(inc.similarity * 100).toFixed(0)}%)${
        inc.resolution ? `\n  Resolution: ${inc.resolution}` : ""
      }${inc.resolvedAt ? `\n  Resolved: ${inc.resolvedAt}` : ""}`
  );

  return `## Related Past Incidents\n\n${entries.join("\n")}`;
};

const formatRunbookSection = (runbooks: readonly RunbookRef[]): string => {
  if (runbooks.length === 0) {
    return "";
  }

  const entries = runbooks.map(
    (entry) =>
      `- **${entry.title}** (relevance: ${(entry.relevance * 100).toFixed(0)}%)${
        entry.url ? ` — [link](${entry.url})` : ""
      }`
  );

  return `## Relevant Runbooks\n\n${entries.join("\n")}`;
};

const formatDocumentationSection = (docs: readonly DocRef[]): string => {
  if (docs.length === 0) {
    return "";
  }

  const entries = docs.map(
    (entry) =>
      `- **${entry.title}** (relevance: ${(entry.relevance * 100).toFixed(0)}%)${
        entry.url ? ` — [link](${entry.url})` : ""
      }`
  );

  return `## Related Documentation\n\n${entries.join("\n")}`;
};
