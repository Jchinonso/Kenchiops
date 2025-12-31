/**
 * External Knowledge Module
 *
 * Provides ingestion of external knowledge sources with tech stack filtering.
 * Supports cross-repo knowledge from various external platforms.
 *
 * @module rag/externalKnowledge
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import {
  EXTERNAL_SOURCE_CONFIG,
  KNOWLEDGE_DOC_TYPES,
  type ExternalSourceType,
  type TechStackTag,
} from "../constants/index.js";
import {
  getExternalSourceById,
  getSourcesDueForSync,
  updateSyncStatus,
  type ExternalSource,
} from "../database/externalSourceRepository.js";
import { ingestKnowledgeDoc, type IngestKnowledgeDocResult } from "./ingestion.js";

const logger = createLogger("rag-external-knowledge");

// ==================== Types ====================

/**
 * External document fetched from a source.
 */
export interface ExternalDocument {
  readonly title: string;
  readonly content: string;
  readonly sourceUrl: string;
  readonly techStackTags?: readonly TechStackTag[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of fetching documents from an external source.
 */
export interface FetchResult {
  readonly documents: readonly ExternalDocument[];
  readonly errorCount: number;
  readonly nextCursor?: string;
}

/**
 * External source connector interface.
 */
export interface ExternalSourceConnector {
  readonly sourceType: ExternalSourceType;
  readonly fetch: (source: ExternalSource, cursor?: string) => Promise<FetchResult>;
}

/**
 * Sync result for a single source.
 */
export interface SyncSourceResult {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly docsIngested: number;
  readonly docsSkipped: number;
  readonly errorCount: number;
  readonly durationMs: number;
}

/**
 * Sync result for all sources.
 */
export interface SyncAllResult {
  readonly sourcesProcessed: number;
  readonly totalDocsIngested: number;
  readonly totalErrors: number;
  readonly results: readonly SyncSourceResult[];
}

/**
 * Options for syncing external sources.
 */
export interface SyncOptions {
  readonly maxDocsPerSource?: number;
  readonly filterTechStack?: readonly TechStackTag[];
  readonly minCredibility?: number;
}

// ==================== Connector Registry ====================

/**
 * Registry of external source connectors.
 */
const connectorRegistry = new Map<ExternalSourceType, ExternalSourceConnector>();

/**
 * Registers an external source connector.
 */
export const registerConnector = (connector: ExternalSourceConnector): void => {
  connectorRegistry.set(connector.sourceType, connector);
  logger.info("Registered external source connector", { sourceType: connector.sourceType });
};

/**
 * Gets a connector for a source type.
 */
export const getConnector = (sourceType: ExternalSourceType): ExternalSourceConnector | null =>
  connectorRegistry.get(sourceType) ?? null;

// ==================== Tech Stack Filtering ====================

/**
 * Checks if document matches tenant tech stack filter.
 */
const matchesTechStack = (
  docTags: readonly TechStackTag[] | undefined,
  filterTags: readonly TechStackTag[] | undefined
): boolean => {
  // No filter = match all
  if (!filterTags || filterTags.length === 0) {
    return true;
  }

  // No doc tags = no match (unless no filter)
  if (!docTags || docTags.length === 0) {
    return false;
  }

  // Check for any overlapping tags
  const filterSet = new Set(filterTags);
  return docTags.some((tag) => filterSet.has(tag));
};

/**
 * Filters documents by tech stack tags.
 */
const filterByTechStack = (
  documents: readonly ExternalDocument[],
  filterTags?: readonly TechStackTag[]
): readonly ExternalDocument[] =>
  documents.filter((doc) => matchesTechStack(doc.techStackTags, filterTags));

// ==================== Ingestion ====================

/**
 * Ingests a single external document.
 */
const ingestExternalDocument = async (
  doc: ExternalDocument,
  source: ExternalSource
): Promise<IngestKnowledgeDocResult> =>
  ingestKnowledgeDoc({
    content: doc.content,
    title: doc.title,
    docType: KNOWLEDGE_DOC_TYPES.EXTERNAL,
    tenantId: source.tenantId,
    sourceUrl: doc.sourceUrl,
    metadata: {
      ...doc.metadata,
      externalSourceId: source.id,
      externalSourceType: source.sourceType,
      techStackTags: doc.techStackTags,
      credibilityScore: source.credibilityScore,
    },
  });

/**
 * Ingests documents from a fetch result.
 */
const ingestFetchedDocuments = async (
  documents: readonly ExternalDocument[],
  source: ExternalSource,
  options: SyncOptions
): Promise<{ ingested: number; skipped: number; errors: number }> => {
  // Filter by tech stack
  const filteredDocs = filterByTechStack(documents, options.filterTechStack);
  const skipped = documents.length - filteredDocs.length;

  // Limit documents per source
  const maxDocs = options.maxDocsPerSource ?? EXTERNAL_SOURCE_CONFIG.MAX_DOCS_PER_SOURCE;
  const docsToIngest = filteredDocs.slice(0, maxDocs);

  // Ingest documents recursively
  const processDoc = async (
    index: number,
    ingestedCount: number,
    errorCount: number
  ): Promise<{ ingested: number; errors: number }> => {
    if (index >= docsToIngest.length) {
      return { ingested: ingestedCount, errors: errorCount };
    }

    try {
      await ingestExternalDocument(docsToIngest[index], source);
      return processDoc(index + 1, ingestedCount + 1, errorCount);
    } catch (error) {
      logger.error("Failed to ingest external document", {
        sourceId: source.id,
        docTitle: docsToIngest[index].title,
        error: getErrorMessage(error),
      });
      return processDoc(index + 1, ingestedCount, errorCount + 1);
    }
  };

  const result = await processDoc(0, 0, 0);
  return { ingested: result.ingested, skipped, errors: result.errors };
};

// ==================== Public API ====================

/**
 * Syncs a single external source.
 *
 * @param sourceId - External source ID
 * @param options - Sync options
 * @returns Sync result
 */
export const syncExternalSource = async (
  sourceId: string,
  options: SyncOptions = {}
): Promise<SyncSourceResult | null> => {
  const startTime = Date.now();

  const source = await getExternalSourceById(sourceId);
  if (!source) {
    logger.warn("External source not found for sync", { sourceId });
    return null;
  }

  // Check credibility threshold
  const minCredibility = options.minCredibility ?? EXTERNAL_SOURCE_CONFIG.MIN_CREDIBILITY_THRESHOLD;
  if (source.credibilityScore < minCredibility) {
    logger.info("Source below credibility threshold, skipping sync", {
      sourceId,
      credibility: source.credibilityScore,
      threshold: minCredibility,
    });
    return {
      sourceId,
      sourceName: source.name,
      docsIngested: 0,
      docsSkipped: 0,
      errorCount: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Get connector
  const connector = getConnector(source.sourceType);
  if (!connector) {
    logger.warn("No connector registered for source type", { sourceType: source.sourceType });
    return {
      sourceId,
      sourceName: source.name,
      docsIngested: 0,
      docsSkipped: 0,
      errorCount: 1,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Fetch documents
    const fetchResult = await connector.fetch(source);

    // Ingest documents
    const ingestResult = await ingestFetchedDocuments(fetchResult.documents, source, options);

    // Update sync status
    await updateSyncStatus(
      sourceId,
      source.docCount + ingestResult.ingested,
      fetchResult.errorCount + ingestResult.errors
    );

    logger.info("Completed external source sync", {
      sourceId,
      sourceName: source.name,
      docsIngested: ingestResult.ingested,
      docsSkipped: ingestResult.skipped,
      errors: ingestResult.errors,
    });

    return {
      sourceId,
      sourceName: source.name,
      docsIngested: ingestResult.ingested,
      docsSkipped: ingestResult.skipped,
      errorCount: fetchResult.errorCount + ingestResult.errors,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error("External source sync failed", {
      sourceId,
      error: getErrorMessage(error),
    });

    await updateSyncStatus(sourceId, source.docCount, source.errorCount + 1);

    return {
      sourceId,
      sourceName: source.name,
      docsIngested: 0,
      docsSkipped: 0,
      errorCount: 1,
      durationMs: Date.now() - startTime,
    };
  }
};

/**
 * Syncs all sources that are due for synchronization.
 *
 * @param options - Sync options
 * @param limit - Maximum sources to sync
 * @returns Aggregate sync result
 */
export const syncDueSources = async (
  options: SyncOptions = {},
  limit: number = 10
): Promise<SyncAllResult> => {
  const sourcesDue = await getSourcesDueForSync(limit);

  logger.info("Starting sync of due external sources", { count: sourcesDue.length });

  // Process sources recursively
  const processSource = async (
    index: number,
    results: readonly SyncSourceResult[]
  ): Promise<readonly SyncSourceResult[]> => {
    if (index >= sourcesDue.length) {
      return results;
    }

    const source = sourcesDue[index];
    const result = await syncExternalSource(source.id, options);

    const newResults = result ? [...results, result] : results;
    return processSource(index + 1, newResults);
  };

  const results = await processSource(0, []);

  // Aggregate results
  const totalDocsIngested = results.reduce((sum, result) => sum + result.docsIngested, 0);
  const totalErrors = results.reduce((sum, result) => sum + result.errorCount, 0);

  logger.info("Completed sync of due external sources", {
    sourcesProcessed: results.length,
    totalDocsIngested,
    totalErrors,
  });

  return {
    sourcesProcessed: results.length,
    totalDocsIngested,
    totalErrors,
    results: Object.freeze(results),
  };
};

/**
 * Gets sync status summary for a tenant's external sources.
 */
export const getTenantSyncStatus = async (
  tenantId: string,
  sources: readonly ExternalSource[]
): Promise<{
  totalSources: number;
  enabledSources: number;
  totalDocs: number;
  totalErrors: number;
  lastSyncAt?: string;
}> => {
  const enabledSources = sources.filter((source) => source.isEnabled);
  const totalDocs = sources.reduce((sum, source) => sum + source.docCount, 0);
  const totalErrors = sources.reduce((sum, source) => sum + source.errorCount, 0);

  // Find most recent sync
  const syncTimes = sources
    .filter((source) => source.lastSyncAt)
    .map((source) => source.lastSyncAt as string)
    .sort()
    .reverse();

  return {
    totalSources: sources.length,
    enabledSources: enabledSources.length,
    totalDocs,
    totalErrors,
    lastSyncAt: syncTimes[0],
  };
};
