/**
 * Cost Controls - Cache Management
 *
 * Query cache and tenant config cache for cost optimization.
 *
 * @module rag/costControlsCache
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import {
  COST_CONTROL_CONFIG,
  CACHE_TTL_SECONDS,
  type EmbeddingTierName,
} from "../constants/index.js";
import { getRAGBudgetConfig } from "../database/tenantRagConfig.js";

const logger = createLogger("rag-cost-controls");

// ==================== Types ====================

/**
 * Query cache entry.
 */
interface CacheEntry {
  readonly embedding: readonly number[];
  readonly timestamp: number;
  readonly tier: EmbeddingTierName;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
}

/**
 * Tiered embedding configuration for a tenant.
 */
export interface TenantTierConfig {
  readonly tenantId: string;
  readonly preferredTier: EmbeddingTierName;
  readonly monthlyBudgetUsd: number;
  readonly degradeOnBudgetWarning: boolean;
  readonly allowPremium: boolean;
}

// ==================== Query Cache ====================

/**
 * In-memory query cache with TTL.
 */
const queryCache = new Map<string, CacheEntry>();
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Generates cache key from query text.
 */
const generateCacheKey = (query: string, tenantId?: string): string => {
  const normalizedQuery = query.toLowerCase().trim();
  return tenantId ? `${tenantId}:${normalizedQuery}` : normalizedQuery;
};

/**
 * Checks if cache entry is expired.
 */
const isExpired = (entry: CacheEntry): boolean => {
  const ttlMs = COST_CONTROL_CONFIG.QUERY_CACHE_TTL_SECONDS * COST_CONTROL_CONFIG.MS_PER_SECOND;
  return Date.now() - entry.timestamp > ttlMs;
};

/**
 * Gets cached embedding if available.
 */
export const getCachedEmbedding = (
  query: string,
  tenantId?: string
): { embedding: readonly number[]; tier: EmbeddingTierName } | null => {
  const key = generateCacheKey(query, tenantId);
  const entry = queryCache.get(key);

  if (!entry) {
    cacheMisses++;
    return null;
  }

  if (isExpired(entry)) {
    queryCache.delete(key);
    cacheMisses++;
    return null;
  }

  cacheHits++;
  return { embedding: entry.embedding, tier: entry.tier };
};

/**
 * Caches an embedding result.
 */
export const cacheEmbedding = (
  query: string,
  embedding: readonly number[],
  tier: EmbeddingTierName,
  tenantId?: string
): void => {
  const key = generateCacheKey(query, tenantId);
  queryCache.set(key, {
    embedding: Object.freeze([...embedding]),
    timestamp: Date.now(),
    tier,
  });
};

/**
 * Clears expired cache entries.
 */
export const clearExpiredCache = (): number => {
  // Filter keys to identify expired entries using immutable pattern
  const keysToDelete = [...queryCache.entries()]
    .filter(([, entry]) => isExpired(entry))
    .map(([cacheKey]) => cacheKey);

  // Delete expired entries
  keysToDelete.forEach((cacheKey) => queryCache.delete(cacheKey));

  logger.debug("Cleared expired cache entries", { cleared: keysToDelete.length });
  return keysToDelete.length;
};

/**
 * Clears entire cache.
 */
export const clearCache = (): void => {
  queryCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  logger.info("Cache cleared");
};

/**
 * Clears cache entries for a specific tenant.
 *
 * @param tenantId - The tenant ID to clear cache for
 * @returns Number of entries cleared
 */
export const clearCacheForTenant = (tenantId: string): number => {
  const keysToDelete = [...queryCache.keys()].filter((cacheKey) =>
    cacheKey.startsWith(`${tenantId}:`)
  );
  keysToDelete.forEach((cacheKey) => queryCache.delete(cacheKey));
  logger.info("Cleared tenant cache entries", { tenantId, cleared: keysToDelete.length });
  return keysToDelete.length;
};

/**
 * Gets cache statistics.
 */
export const getCacheStats = (): CacheStats => {
  const total = cacheHits + cacheMisses;
  return {
    size: queryCache.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total === 0 ? 0 : cacheHits / total,
  };
};

// ==================== Tenant Config Cache ====================

/**
 * Default tenant tier configuration.
 */
export const DEFAULT_TIER_CONFIG: Omit<TenantTierConfig, "tenantId"> = {
  preferredTier: "STANDARD",
  monthlyBudgetUsd: COST_CONTROL_CONFIG.DEFAULT_MONTHLY_BUDGET_USD,
  degradeOnBudgetWarning: true,
  allowPremium: false,
};

/**
 * In-memory cache for tenant configs (TTL: 5 minutes).
 * Reduces database calls for frequently accessed tenants.
 */
const tenantConfigCache = new Map<string, { config: TenantTierConfig; expiresAt: number }>();
const CONFIG_CACHE_TTL_MS = CACHE_TTL_SECONDS.MEDIUM * COST_CONTROL_CONFIG.MS_PER_SECOND;

/**
 * Clears cached config for a tenant (call after updates).
 */
export const clearTenantConfigCache = (tenantId: string): void => {
  tenantConfigCache.delete(tenantId);
};

/**
 * Sets tier configuration for a tenant (updates database).
 * For backwards compatibility - prefer using updateRAGBudgetConfig from tenantRagConfig.
 */
export const setTenantTierConfig = async (config: TenantTierConfig): Promise<void> => {
  // Import dynamically to avoid circular dependency
  const { updateRAGBudgetConfig } = await import("../database/tenantRagConfig.js");

  await updateRAGBudgetConfig({
    tenantId: config.tenantId,
    monthlyBudgetUsd: config.monthlyBudgetUsd,
    preferredTier: config.preferredTier,
    allowPremium: config.allowPremium,
    degradeOnBudgetWarning: config.degradeOnBudgetWarning,
  });

  // Update cache
  tenantConfigCache.set(config.tenantId, {
    config,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  });

  logger.info("Set tenant tier config", {
    tenantId: config.tenantId,
    preferredTier: config.preferredTier,
    budget: config.monthlyBudgetUsd,
  });
};

/**
 * Gets tier configuration for a tenant from database (with caching).
 */
export const getTenantTierConfig = async (tenantId: string): Promise<TenantTierConfig> => {
  // Check cache first
  const cached = tenantConfigCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  // Fetch from database
  try {
    const dbConfig = await getRAGBudgetConfig(tenantId);

    if (dbConfig) {
      const config: TenantTierConfig = {
        tenantId: dbConfig.tenantId,
        preferredTier: dbConfig.preferredTier,
        monthlyBudgetUsd: dbConfig.monthlyBudgetUsd,
        allowPremium: dbConfig.allowPremium,
        degradeOnBudgetWarning: dbConfig.degradeOnBudgetWarning,
      };

      // Cache the result
      tenantConfigCache.set(tenantId, {
        config,
        expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
      });

      return config;
    }
  } catch (error) {
    logger.warn("Failed to fetch tenant config from database, using defaults", {
      tenantId,
      error: getErrorMessage(error),
    });
  }

  // Return defaults if not found or error
  return { ...DEFAULT_TIER_CONFIG, tenantId };
};
