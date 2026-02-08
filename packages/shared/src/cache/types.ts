/**
 * Cache Types
 *
 * Consolidated type definitions for all cache operations.
 *
 * @module cache/types
 */

import type { CodeAnnotation, RecommendedAction } from "../aggregation/types.js";
import type { getRedisClient } from "../queue/redisClient.js";

// ==================== Core Cache Types ====================

/**
 * Cache entry with metadata.
 */
export interface CacheEntry<T> {
  readonly data: T;
  readonly cachedAt: string;
  readonly expiresAt: string;
}

/**
 * Internal statistics state for cache tracking.
 */
export interface CacheStatsState {
  hits: number;
  misses: number;
}

/**
 * Result of deserializing cached data.
 */
export type DeserializeResult<T> =
  | { readonly success: true; readonly entry: CacheEntry<T> }
  | { readonly success: false };

/**
 * Result of checking Redis client readiness.
 */
export type RedisClientReadyResult<TClient> =
  | { readonly ready: true; readonly client: TClient }
  | { readonly ready: false };

/** Redis client type derived from the client factory. */
export type RedisClient = ReturnType<typeof getRedisClient>;

/** Specialized client readiness result for cache operations. */
export type CacheClientReadyResult = RedisClientReadyResult<RedisClient>;

/**
 * Cache operation result.
 */
export interface CacheResult<T> {
  readonly hit: boolean;
  readonly data: T | null;
  readonly cachedAt?: string;
}

/**
 * Cache options for set operations.
 */
export interface CacheSetOptions {
  /** Time to live in seconds */
  readonly ttlSeconds: number;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
}

// ==================== GitHub Cache Types ====================

/**
 * Cached pull request metadata.
 */
export interface CachedPullRequest {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly author: string;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly headSha: string;
  readonly labels: readonly string[];
  readonly state: string;
  readonly draft: boolean;
}

/**
 * Cached PR comment structure.
 */
export interface CachedComment {
  /** Comment ID. */
  readonly id: number;
  /** Comment body text. */
  readonly body: string;
  /** Username of comment author. */
  readonly user: string;
  /** ISO timestamp of when comment was created. */
  readonly createdAt: string;
}

/**
 * Cached PR reference structure (for commit-to-PR lookups).
 */
export interface CachedPRReference {
  /** PR number. */
  readonly number: number;
  /** PR title. */
  readonly title: string;
  /** PR state (open, closed, merged). */
  readonly state: string;
}

/**
 * Cached check annotation structure.
 */
export interface CachedCheckAnnotation {
  /** File path relative to repository root. */
  readonly path: string;
  /** Starting line number. */
  readonly startLine: number;
  /** Ending line number. */
  readonly endLine: number;
  /** Annotation level (notice, warning, failure). */
  readonly annotationLevel: string;
  /** Annotation message. */
  readonly message: string;
  /** Optional annotation title. */
  readonly title?: string;
}

// ==================== Tenant Cache Types ====================

/**
 * Cached tenant (subset of full tenant for cache efficiency).
 */
export interface CachedTenant {
  readonly id: string;
  readonly githubInstallationId: number | null;
  readonly githubOrg: string;
  readonly slackWorkspaceId: string | null;
  readonly slackTeamName: string | null;
  readonly status: string;
  readonly createdAt: string;
}

/**
 * Cached mapping info.
 */
export interface CachedMapping {
  readonly id: string;
  readonly tenantId: string;
  readonly repository: string;
  readonly slackChannelId: string;
  readonly slackChannelName: string | null;
}

/**
 * Tenant statistics (cached separately due to volatility).
 */
export interface CachedTenantStats {
  readonly totalAlerts: number;
  readonly lastAlertTime: string | null;
  readonly mappingCount: number;
}

// ==================== Fetcher Function Types ====================

/** Fetcher function type for pull request. */
export type PullRequestFetcher = () => Promise<CachedPullRequest>;

/** Fetcher function type for diff content. */
export type DiffFetcher = () => Promise<string>;

/** Fetcher function type for PR commits (returns SHA strings). */
export type CommitsFetcher = () => Promise<readonly string[]>;

/** Fetcher function type for PR files (returns file paths). */
export type FilesFetcher = () => Promise<readonly string[]>;

/** Fetcher function type for PR comments. */
export type CommentsFetcher = () => Promise<readonly CachedComment[]>;

/** Fetcher function type for commit-to-PR lookups. */
export type CommitPRsFetcher = () => Promise<readonly CachedPRReference[]>;

/** Fetcher function type for check annotations. */
export type AnnotationsFetcher = () => Promise<readonly CachedCheckAnnotation[]>;

/** Fetcher function type for tenant (nullable). */
export type TenantFetcher = () => Promise<CachedTenant | null>;

/** Fetcher function type for tenant stats. */
export type TenantStatsFetcher = () => Promise<CachedTenantStats>;

/** Fetcher function type for single mapping (nullable). */
export type MappingFetcher = () => Promise<CachedMapping | null>;

/** Fetcher function type for mapping array. */
export type MappingArrayFetcher = () => Promise<readonly CachedMapping[]>;

/** Fetcher function type for single check analysis. */
export type CheckAnalysisFetcher = () => Promise<CachedAnalysis>;

/** Fetcher function type for consolidated analysis. */
export type ConsolidatedAnalysisFetcher = () => Promise<CachedConsolidatedAnalysis>;

// ==================== Analysis Cache Types ====================

/** Annotation level type from API response. */
export type AnnotationLevel = "failure" | "warning" | "notice";

// Re-export types under cache-specific names for backward compatibility
export type CachedAnnotation = CodeAnnotation;
export type CachedAction = RecommendedAction;

/**
 * Cached analysis result for a single check.
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
 * Consolidated analysis for a commit (multiple checks).
 */
export interface CachedConsolidatedAnalysis {
  readonly repository: string;
  readonly commitSha: string;
  readonly checkCount: number;
  readonly analyses: readonly CachedAnalysis[];
  readonly consolidatedAt: string;
}

// ==================== Analysis Result Types ====================

/**
 * Result type for cache operations.
 * Distinguishes between success, not found, and error states.
 */
export type CacheOperationResult<T> =
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "not_found" }
  | { readonly status: "error"; readonly error: string };

/**
 * Result type for cache write operations.
 */
export type CacheWriteResult =
  | { readonly status: "success" }
  | { readonly status: "error"; readonly error: string };

// ==================== API Response Types ====================

/**
 * Raw API response structure for building cached analysis.
 */
export interface AnalysisApiResponse {
  readonly confidence?: number;
  readonly identified_cause?: string;
  readonly analysis?: string;
  readonly recommended_actions?: ReadonlyArray<{
    readonly description: string;
    readonly priority: string | number;
    readonly actionType?: string;
    readonly reasoning?: string;
  }>;
  readonly full_analysis?: {
    readonly codeAnnotations?: ReadonlyArray<{
      readonly path: string;
      readonly line: number;
      readonly level: "failure" | "warning" | "notice";
      readonly message: string;
      readonly title?: string;
    }>;
  };
}

// ==================== Log Context Types ====================

/**
 * Context for analysis cache logging operations.
 */
export interface AnalysisCacheLogContext {
  readonly repository: string;
  readonly commitSha: string;
  readonly checkName?: string;
}

// ==================== Cache Key Types ====================

/**
 * Parsed cache key structure.
 */
export interface ParsedCacheKey {
  readonly namespace: string;
  readonly parts: readonly string[];
}
