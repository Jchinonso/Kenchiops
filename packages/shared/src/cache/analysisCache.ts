/**
 * AI Analysis Result Cache
 *
 * Caches AI-generated analysis results to avoid duplicate
 * OpenAI API calls for the same CI failures.
 *
 * @module cache/analysisCache
 */

import * as crypto from "crypto";
import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheGetOrSet,
  cacheExists,
  CACHE_TTL,
} from "./cacheClient.js";
import { analysisCacheKeys } from "./cacheKeys.js";
import { createLogger } from "../core/logger.js";
import {
  DISPLAY_DEFAULTS,
  PLACEHOLDER_CONFIDENCE_SCORE,
  LOG_NORMALIZATION_PATTERNS,
  ANALYSIS_HASH_ALGORITHM,
} from "../constants/index.js";
import type {
  CachedAnalysis,
  CachedConsolidatedAnalysis,
  CachedAnnotation,
  CachedAction,
  AnalysisApiResponse,
  CacheResult,
  CheckAnalysisFetcher,
  ConsolidatedAnalysisFetcher,
  AnnotationLevel,
} from "./types.js";

const logger = createLogger("analysis-cache");

// ==================== Helper Functions ====================

/**
 * Extracts data from cache result.
 */
const extractCacheData = <T>(result: CacheResult<T>): T | null => result.data;

/**
 * Truncates SHA for display in logs.
 */
const truncateSha = (sha: string): string => sha.substring(0, DISPLAY_DEFAULTS.SHA_DISPLAY_LENGTH);

/**
 * Logs analysis cache operation for debugging.
 */
const logAnalysisCacheOperation = (
  operation: string,
  repository: string,
  commitSha: string,
  checkName?: string,
  extraContext?: Record<string, unknown>
): void => {
  logger.debug(`Analysis cache ${operation}`, {
    repository,
    commitSha: truncateSha(commitSha),
    ...(checkName && { checkName }),
    ...extraContext,
  });
};

// ==================== Hash Generation ====================

/**
 * Generate a hash of the log content for deduplication.
 *
 * Normalizes log content by removing timestamps, SHA hashes, and
 * excess whitespace before hashing to identify semantically
 * identical logs.
 *
 * @param logContent - Raw log content to hash
 * @returns Truncated hash of normalized content
 */
export const generateLogHash = (logContent: string): string => {
  // Normalize the log content to handle minor variations
  const normalized = logContent
    .replace(LOG_NORMALIZATION_PATTERNS.TIMESTAMP, "") // Remove timestamps
    .replace(LOG_NORMALIZATION_PATTERNS.FULL_SHA, "") // Remove SHA hashes
    .replace(LOG_NORMALIZATION_PATTERNS.WHITESPACE, " ") // Normalize whitespace
    .trim();

  return crypto
    .createHash(ANALYSIS_HASH_ALGORITHM)
    .update(normalized)
    .digest("hex")
    .substring(0, DISPLAY_DEFAULTS.LOG_HASH_LENGTH);
};

// ==================== Single Check Analysis Cache ====================

/**
 * Get cached analysis for a specific check.
 *
 * @param repository - Repository full name (owner/repo)
 * @param commitSha - Git commit SHA
 * @param checkName - Name of the CI check
 * @returns Cached analysis or null if not found
 */
export const getCachedCheckAnalysis = async (
  repository: string,
  commitSha: string,
  checkName: string
): Promise<CachedAnalysis | null> => {
  const cacheKey = analysisCacheKeys.byCommitAndCheck(repository, commitSha, checkName);
  const result = await cacheGet<CachedAnalysis>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache analysis for a specific check.
 *
 * @param analysis - Analysis data to cache
 */
export const cacheCheckAnalysis = async (analysis: CachedAnalysis): Promise<void> => {
  const cacheKey = analysisCacheKeys.byCommitAndCheck(
    analysis.repository,
    analysis.commitSha,
    analysis.checkName
  );

  await cacheSet(cacheKey, analysis, { ttlSeconds: CACHE_TTL.LONG });

  logAnalysisCacheOperation(
    "set:check",
    analysis.repository,
    analysis.commitSha,
    analysis.checkName,
    {
      confidence: analysis.confidence,
    }
  );
};

/**
 * Get or fetch analysis for a specific check.
 *
 * @param repository - Repository full name (owner/repo)
 * @param commitSha - Git commit SHA
 * @param checkName - Name of the CI check
 * @param fetcher - Function to fetch analysis if not cached
 * @returns Cached or freshly fetched analysis
 */
export const getOrFetchCheckAnalysis = async (
  repository: string,
  commitSha: string,
  checkName: string,
  fetcher: CheckAnalysisFetcher
): Promise<CachedAnalysis> => {
  const cacheKey = analysisCacheKeys.byCommitAndCheck(repository, commitSha, checkName);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.LONG });
};

// ==================== Consolidated Analysis Cache ====================

/**
 * Get cached consolidated analysis for a commit.
 *
 * @param repository - Repository full name (owner/repo)
 * @param commitSha - Git commit SHA
 * @returns Cached consolidated analysis or null if not found
 */
export const getCachedConsolidatedAnalysis = async (
  repository: string,
  commitSha: string
): Promise<CachedConsolidatedAnalysis | null> => {
  const cacheKey = analysisCacheKeys.byCommit(repository, commitSha);
  const result = await cacheGet<CachedConsolidatedAnalysis>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache consolidated analysis for a commit.
 *
 * @param analysis - Consolidated analysis data to cache
 */
export const cacheConsolidatedAnalysis = async (
  analysis: CachedConsolidatedAnalysis
): Promise<void> => {
  const cacheKey = analysisCacheKeys.byCommit(analysis.repository, analysis.commitSha);

  await cacheSet(cacheKey, analysis, { ttlSeconds: CACHE_TTL.LONG });

  logAnalysisCacheOperation(
    "set:consolidated",
    analysis.repository,
    analysis.commitSha,
    undefined,
    { checkCount: analysis.checkCount }
  );
};

/**
 * Get or fetch consolidated analysis.
 *
 * @param repository - Repository full name (owner/repo)
 * @param commitSha - Git commit SHA
 * @param fetcher - Function to fetch consolidated analysis if not cached
 * @returns Cached or freshly fetched consolidated analysis
 */
export const getOrFetchConsolidatedAnalysis = async (
  repository: string,
  commitSha: string,
  fetcher: ConsolidatedAnalysisFetcher
): Promise<CachedConsolidatedAnalysis> => {
  const cacheKey = analysisCacheKeys.byCommit(repository, commitSha);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.LONG });
};

// ==================== Log Hash Deduplication ====================

/**
 * Check if analysis exists for a log hash.
 *
 * @param logHash - Hash of the log content
 * @returns Cached analysis or null if not found
 */
export const getCachedAnalysisByLogHash = async (
  logHash: string
): Promise<CachedAnalysis | null> => {
  const cacheKey = analysisCacheKeys.byLogHash(logHash);
  const result = await cacheGet<CachedAnalysis>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache analysis by log hash for deduplication.
 *
 * @param logHash - Hash of the log content
 * @param analysis - Analysis data to cache
 */
export const cacheAnalysisByLogHash = async (
  logHash: string,
  analysis: CachedAnalysis
): Promise<void> => {
  const cacheKey = analysisCacheKeys.byLogHash(logHash);

  await cacheSet(cacheKey, analysis, { ttlSeconds: CACHE_TTL.EXTENDED });

  logger.debug("Cached analysis by log hash", {
    logHash,
    repository: analysis.repository,
    checkName: analysis.checkName,
  });
};

/**
 * Get or fetch analysis by log hash.
 * Used to avoid re-analyzing identical log content.
 *
 * @param logContent - Raw log content to hash and look up
 * @param fetcher - Function to fetch analysis if not cached
 * @returns Cached or freshly fetched analysis
 */
export const getOrFetchAnalysisByLogHash = async (
  logContent: string,
  fetcher: CheckAnalysisFetcher
): Promise<CachedAnalysis> => {
  const logHash = generateLogHash(logContent);

  const cached = await getCachedAnalysisByLogHash(logHash);

  if (cached) {
    logger.info("Analysis cache hit by log hash", {
      logHash,
      repository: cached.repository,
      checkName: cached.checkName,
    });
    return cached;
  }

  const analysis = await fetcher();
  await cacheAnalysisByLogHash(logHash, analysis);

  return analysis;
};

// ==================== Analysis Result Helpers ====================

/**
 * Maps API annotation to cached annotation format.
 */
const mapAnnotation = (annotation: {
  readonly path: string;
  readonly line: number;
  readonly level: AnnotationLevel;
  readonly message: string;
  readonly title?: string;
}): CachedAnnotation => ({
  path: annotation.path,
  line: annotation.line,
  level: annotation.level,
  message: annotation.message,
  title: annotation.title,
});

/**
 * Maps API action to cached action format.
 */
const mapAction = (action: {
  readonly description: string;
  readonly priority: string | number;
  readonly actionType?: string;
  readonly reasoning?: string;
}): CachedAction => ({
  description: action.description,
  priority: action.priority,
  actionType: action.actionType,
  reasoning: action.reasoning,
});

/**
 * Build a cached analysis from API response.
 *
 * @param repository - Repository full name (owner/repo)
 * @param commitSha - Git commit SHA
 * @param checkName - Name of the CI check
 * @param apiResponse - Raw API response from analysis service
 * @returns Formatted cached analysis object
 */
export const buildCachedAnalysis = (
  repository: string,
  commitSha: string,
  checkName: string,
  apiResponse: AnalysisApiResponse
): CachedAnalysis => {
  const annotations = apiResponse.full_analysis?.codeAnnotations?.map(mapAnnotation) ?? [];
  const recommendedActions = apiResponse.recommended_actions?.map(mapAction) ?? [];

  return {
    repository,
    commitSha,
    checkName,
    confidence: apiResponse.confidence ?? PLACEHOLDER_CONFIDENCE_SCORE,
    identifiedCause: apiResponse.identified_cause ?? "",
    analysis: apiResponse.analysis ?? "Analysis unavailable",
    annotations,
    recommendedActions,
    analyzedAt: new Date().toISOString(),
  };
};

// ==================== Cache Invalidation ====================

/**
 * Invalidate all analysis cache entries for a repository.
 *
 * @param repository - Repository full name (owner/repo)
 * @returns Number of cache entries deleted
 */
export const invalidateRepositoryAnalysisCache = async (repository: string): Promise<number> => {
  const deleted = await cacheDeletePattern(analysisCacheKeys.repositoryPattern(repository));

  logger.info("Invalidated repository analysis cache", {
    repository,
    entriesDeleted: deleted,
  });

  return deleted;
};

/**
 * Invalidate analysis for a specific commit.
 *
 * @param repository - Repository full name (owner/repo)
 * @param commitSha - Git commit SHA
 */
export const invalidateCommitAnalysis = async (
  repository: string,
  commitSha: string
): Promise<void> => {
  const cacheKey = analysisCacheKeys.byCommit(repository, commitSha);

  await cacheDelete(cacheKey);
};

/**
 * Invalidate analysis for a specific check.
 *
 * @param repository - Repository full name (owner/repo)
 * @param commitSha - Git commit SHA
 * @param checkName - Name of the CI check
 */
export const invalidateCheckAnalysis = async (
  repository: string,
  commitSha: string,
  checkName: string
): Promise<void> => {
  const cacheKey = analysisCacheKeys.byCommitAndCheck(repository, commitSha, checkName);

  await cacheDelete(cacheKey);
};

/**
 * Invalidate analysis by log hash.
 *
 * @param logHash - Hash of the log content
 */
export const invalidateLogHashAnalysis = async (logHash: string): Promise<void> => {
  const cacheKey = analysisCacheKeys.byLogHash(logHash);

  await cacheDelete(cacheKey);
};

// ==================== Cache Statistics ====================

/**
 * Check if analysis exists in cache (without retrieving).
 *
 * @param repository - Repository full name (owner/repo)
 * @param commitSha - Git commit SHA
 * @param checkName - Name of the CI check
 * @returns True if analysis exists in cache
 */
export const hasAnalysisInCache = async (
  repository: string,
  commitSha: string,
  checkName: string
): Promise<boolean> => {
  const cacheKey = analysisCacheKeys.byCommitAndCheck(repository, commitSha, checkName);

  return cacheExists(cacheKey);
};

/**
 * Check if log hash exists in cache.
 *
 * @param logContent - Raw log content to check
 * @returns True if log hash exists in cache
 */
export const hasLogHashInCache = async (logContent: string): Promise<boolean> => {
  const logHash = generateLogHash(logContent);
  const cacheKey = analysisCacheKeys.byLogHash(logHash);

  return cacheExists(cacheKey);
};
