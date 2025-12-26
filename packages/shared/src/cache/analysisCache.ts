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
  CACHE_TTL,
} from "./cacheClient.js";
import { analysisCacheKeys } from "./cacheKeys.js";
import { createLogger } from "../core/logger.js";

const logger = createLogger("analysis-cache");

// ==================== Types ====================

/**
 * Cached code annotation
 */
export interface CachedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly level: "failure" | "warning" | "notice";
  readonly message: string;
  readonly title?: string;
}

/**
 * Cached recommended action
 */
export interface CachedAction {
  readonly description: string;
  readonly priority: string | number;
  readonly actionType?: string;
  readonly reasoning?: string;
}

/**
 * Cached analysis result
 */
export interface CachedAnalysis {
  readonly repository: string;
  readonly commitSha: string;
  readonly checkName: string;
  readonly confidence: number;
  readonly identifiedCause: string;
  readonly analysis: string;
  readonly annotations: readonly CachedAnnotation[];
  readonly recommendedActions: readonly CachedAction[];
  readonly analyzedAt: string;
}

/**
 * Consolidated analysis for a commit
 */
export interface CachedConsolidatedAnalysis {
  readonly repository: string;
  readonly commitSha: string;
  readonly checkCount: number;
  readonly analyses: readonly CachedAnalysis[];
  readonly consolidatedAt: string;
}

// ==================== Hash Generation ====================

/**
 * Generate a hash of the log content for deduplication
 */
export const generateLogHash = (logContent: string): string => {
  // Normalize the log content to handle minor variations
  const normalized = logContent
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "") // Remove timestamps
    .replace(/\b[0-9a-f]{40}\b/g, "") // Remove SHA hashes
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  return crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16);
};

// ==================== Single Check Analysis Cache ====================

/**
 * Get cached analysis for a specific check
 */
export const getCachedCheckAnalysis = async (
  repository: string,
  commitSha: string,
  checkName: string
): Promise<CachedAnalysis | null> => {
  const result = await cacheGet<CachedAnalysis>(
    analysisCacheKeys.byCommitAndCheck(repository, commitSha, checkName)
  );
  return result.data;
};

/**
 * Cache analysis for a specific check
 */
export const cacheCheckAnalysis = async (analysis: CachedAnalysis): Promise<void> => {
  await cacheSet(
    analysisCacheKeys.byCommitAndCheck(analysis.repository, analysis.commitSha, analysis.checkName),
    analysis,
    { ttlSeconds: CACHE_TTL.LONG }
  );

  logger.debug("Cached check analysis", {
    repository: analysis.repository,
    commitSha: analysis.commitSha.substring(0, 7),
    checkName: analysis.checkName,
    confidence: analysis.confidence,
  });
};

/**
 * Get or fetch analysis for a specific check
 */
export const getOrFetchCheckAnalysis = async (
  repository: string,
  commitSha: string,
  checkName: string,
  fetcher: () => Promise<CachedAnalysis>
): Promise<CachedAnalysis> =>
  cacheGetOrSet(analysisCacheKeys.byCommitAndCheck(repository, commitSha, checkName), fetcher, {
    ttlSeconds: CACHE_TTL.LONG,
  });

// ==================== Consolidated Analysis Cache ====================

/**
 * Get cached consolidated analysis for a commit
 */
export const getCachedConsolidatedAnalysis = async (
  repository: string,
  commitSha: string
): Promise<CachedConsolidatedAnalysis | null> => {
  const result = await cacheGet<CachedConsolidatedAnalysis>(
    analysisCacheKeys.byCommit(repository, commitSha)
  );
  return result.data;
};

/**
 * Cache consolidated analysis for a commit
 */
export const cacheConsolidatedAnalysis = async (
  analysis: CachedConsolidatedAnalysis
): Promise<void> => {
  await cacheSet(analysisCacheKeys.byCommit(analysis.repository, analysis.commitSha), analysis, {
    ttlSeconds: CACHE_TTL.LONG,
  });

  logger.debug("Cached consolidated analysis", {
    repository: analysis.repository,
    commitSha: analysis.commitSha.substring(0, 7),
    checkCount: analysis.checkCount,
  });
};

/**
 * Get or fetch consolidated analysis
 */
export const getOrFetchConsolidatedAnalysis = async (
  repository: string,
  commitSha: string,
  fetcher: () => Promise<CachedConsolidatedAnalysis>
): Promise<CachedConsolidatedAnalysis> =>
  cacheGetOrSet(analysisCacheKeys.byCommit(repository, commitSha), fetcher, {
    ttlSeconds: CACHE_TTL.LONG,
  });

// ==================== Log Hash Deduplication ====================

/**
 * Check if analysis exists for a log hash
 */
export const getCachedAnalysisByLogHash = async (
  logHash: string
): Promise<CachedAnalysis | null> => {
  const result = await cacheGet<CachedAnalysis>(analysisCacheKeys.byLogHash(logHash));
  return result.data;
};

/**
 * Cache analysis by log hash for deduplication
 */
export const cacheAnalysisByLogHash = async (
  logHash: string,
  analysis: CachedAnalysis
): Promise<void> => {
  await cacheSet(analysisCacheKeys.byLogHash(logHash), analysis, {
    ttlSeconds: CACHE_TTL.EXTENDED,
  });

  logger.debug("Cached analysis by log hash", {
    logHash,
    repository: analysis.repository,
    checkName: analysis.checkName,
  });
};

/**
 * Get or fetch analysis by log hash
 * Used to avoid re-analyzing identical log content
 */
export const getOrFetchAnalysisByLogHash = async (
  logContent: string,
  fetcher: () => Promise<CachedAnalysis>
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
 * Build a cached analysis from API response
 */
export const buildCachedAnalysis = (
  repository: string,
  commitSha: string,
  checkName: string,
  apiResponse: {
    confidence?: number;
    identified_cause?: string;
    analysis?: string;
    recommended_actions?: ReadonlyArray<{
      description: string;
      priority: string | number;
      actionType?: string;
      reasoning?: string;
    }>;
    full_analysis?: {
      codeAnnotations?: ReadonlyArray<{
        path: string;
        line: number;
        level: "failure" | "warning" | "notice";
        message: string;
        title?: string;
      }>;
    };
  }
): CachedAnalysis => ({
  repository,
  commitSha,
  checkName,
  confidence: apiResponse.confidence ?? 0.5,
  identifiedCause: apiResponse.identified_cause ?? "",
  analysis: apiResponse.analysis ?? "Analysis unavailable",
  annotations:
    apiResponse.full_analysis?.codeAnnotations?.map((a) => ({
      path: a.path,
      line: a.line,
      level: a.level,
      message: a.message,
      title: a.title,
    })) ?? [],
  recommendedActions:
    apiResponse.recommended_actions?.map((a) => ({
      description: a.description,
      priority: a.priority,
      actionType: a.actionType,
      reasoning: a.reasoning,
    })) ?? [],
  analyzedAt: new Date().toISOString(),
});

// ==================== Cache Invalidation ====================

/**
 * Invalidate all analysis cache entries for a repository
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
 * Invalidate analysis for a specific commit
 */
export const invalidateCommitAnalysis = async (
  repository: string,
  commitSha: string
): Promise<void> => {
  await cacheDelete(analysisCacheKeys.byCommit(repository, commitSha));
};

/**
 * Invalidate analysis for a specific check
 */
export const invalidateCheckAnalysis = async (
  repository: string,
  commitSha: string,
  checkName: string
): Promise<void> => {
  await cacheDelete(analysisCacheKeys.byCommitAndCheck(repository, commitSha, checkName));
};

/**
 * Invalidate analysis by log hash
 */
export const invalidateLogHashAnalysis = async (logHash: string): Promise<void> => {
  await cacheDelete(analysisCacheKeys.byLogHash(logHash));
};

// ==================== Cache Statistics ====================

/**
 * Check if analysis exists in cache (without retrieving)
 */
export const hasAnalysisInCache = async (
  repository: string,
  commitSha: string,
  checkName: string
): Promise<boolean> => {
  const result = await cacheGet<CachedAnalysis>(
    analysisCacheKeys.byCommitAndCheck(repository, commitSha, checkName)
  );
  return result.hit;
};

/**
 * Check if log hash exists in cache
 */
export const hasLogHashInCache = async (logContent: string): Promise<boolean> => {
  const logHash = generateLogHash(logContent);
  const result = await cacheGet<CachedAnalysis>(analysisCacheKeys.byLogHash(logHash));
  return result.hit;
};
