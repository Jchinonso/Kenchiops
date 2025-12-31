/**
 * Cost Controls Module
 *
 * Provides tiered embedding selection and query caching for cost optimization.
 * Manages embedding budgets and implements early-exit strategies.
 *
 * @module rag/costControls
 */

import { createLogger } from "../core/logger.js";
import {
  COST_CONTROL_CONFIG,
  EMBEDDING_TIERS,
  type EmbeddingTierName,
} from "../constants/index.js";
import {
  recordCost,
  getBudgetStatus,
  type BudgetStatus,
} from "../database/costTrackingRepository.js";

const logger = createLogger("rag-cost-controls");

// ==================== Types ====================

/**
 * Embedding tier selection result.
 */
export interface TierSelectionResult {
  readonly selectedTier: EmbeddingTierName;
  readonly model: string;
  readonly dimension: number;
  readonly reason: string;
  readonly budgetStatus: BudgetStatus;
}

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
  let cleared = 0;
  const keysToDelete: string[] = [];

  queryCache.forEach((entry, key) => {
    if (isExpired(entry)) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => {
    queryCache.delete(key);
    cleared++;
  });

  logger.debug("Cleared expired cache entries", { cleared });
  return cleared;
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

// ==================== Tier Selection ====================

/**
 * Default tenant tier configuration.
 */
const DEFAULT_TIER_CONFIG: Omit<TenantTierConfig, "tenantId"> = {
  preferredTier: "STANDARD",
  monthlyBudgetUsd: COST_CONTROL_CONFIG.DEFAULT_MONTHLY_BUDGET_USD,
  degradeOnBudgetWarning: true,
  allowPremium: false,
};

/**
 * Tier configurations stored by tenant.
 */
const tenantConfigs = new Map<string, TenantTierConfig>();

/**
 * Sets tier configuration for a tenant.
 */
export const setTenantTierConfig = (config: TenantTierConfig): void => {
  tenantConfigs.set(config.tenantId, config);
  logger.info("Set tenant tier config", {
    tenantId: config.tenantId,
    preferredTier: config.preferredTier,
    budget: config.monthlyBudgetUsd,
  });
};

/**
 * Gets tier configuration for a tenant.
 */
export const getTenantTierConfig = (tenantId: string): TenantTierConfig => {
  const config = tenantConfigs.get(tenantId);
  return config ?? { ...DEFAULT_TIER_CONFIG, tenantId };
};

/**
 * Selects appropriate embedding tier based on budget and configuration.
 */
export const selectEmbeddingTier = async (
  tenantId: string,
  _tokenCount: number
): Promise<TierSelectionResult> => {
  const config = getTenantTierConfig(tenantId);
  const budgetStatus = await getBudgetStatus(tenantId, config.monthlyBudgetUsd);

  // Default to preferred tier
  let selectedTier = config.preferredTier;
  let reason = `Using preferred tier: ${config.preferredTier}`;

  // Check budget constraints
  if (config.monthlyBudgetUsd > 0 && config.degradeOnBudgetWarning) {
    if (budgetStatus.status === "exceeded") {
      selectedTier = "LIGHT";
      reason = "Budget exceeded, using LIGHT tier";
    } else if (budgetStatus.status === "critical") {
      selectedTier = selectedTier === "PREMIUM" ? "STANDARD" : "LIGHT";
      reason = "Budget critical, degrading tier";
    } else if (budgetStatus.status === "warning" && selectedTier === "PREMIUM") {
      selectedTier = "STANDARD";
      reason = "Budget warning, avoiding PREMIUM tier";
    }
  }

  // Enforce premium restrictions
  if (selectedTier === "PREMIUM" && !config.allowPremium) {
    selectedTier = "STANDARD";
    reason = "PREMIUM tier not allowed for tenant";
  }

  const tierConfig = EMBEDDING_TIERS[selectedTier];

  logger.debug("Selected embedding tier", {
    tenantId,
    selectedTier,
    reason,
    budgetStatus: budgetStatus.status,
    percentUsed: budgetStatus.percentUsed,
  });

  return {
    selectedTier,
    model: tierConfig.model,
    dimension: tierConfig.dimension,
    reason,
    budgetStatus,
  };
};

// ==================== Cost Tracking Integration ====================

/**
 * Records embedding cost after operation.
 */
export const recordEmbeddingCost = async (
  tenantId: string,
  tier: EmbeddingTierName,
  tokenCount: number
): Promise<void> => {
  await recordCost({
    tenantId,
    operationType: "embedding",
    embeddingTier: tier,
    tokenCount,
  });
};

/**
 * Records query cost after operation.
 */
export const recordQueryCost = async (
  tenantId: string,
  tier: EmbeddingTierName,
  tokenCount: number
): Promise<void> => {
  await recordCost({
    tenantId,
    operationType: "query",
    embeddingTier: tier,
    tokenCount,
  });
};

// ==================== Early Exit Optimization ====================

/**
 * Keyword patterns for early exit optimization.
 */
const EARLY_EXIT_KEYWORDS: readonly string[] = [
  "error",
  "exception",
  "failed",
  "failure",
  "timeout",
  "crash",
  "bug",
  "issue",
  "broken",
  "fix",
];

/**
 * Checks if query qualifies for early exit (skip expensive search).
 */
export const shouldSkipExpensiveSearch = (
  query: string,
  existingResultCount: number
): { skip: boolean; reason: string } => {
  const lowerQuery = query.toLowerCase();

  // If we already have sufficient results, skip
  if (existingResultCount >= COST_CONTROL_CONFIG.EARLY_EXIT_MIN_KEYWORD_MATCHES * 2) {
    return { skip: true, reason: "Sufficient results already found" };
  }

  // Check if query contains enough specific keywords
  const matchedKeywords = EARLY_EXIT_KEYWORDS.filter((keyword) => lowerQuery.includes(keyword));

  if (matchedKeywords.length >= COST_CONTROL_CONFIG.EARLY_EXIT_MIN_KEYWORD_MATCHES) {
    return { skip: false, reason: "Query contains actionable keywords" };
  }

  // Very short queries might not benefit from expensive search
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount < COST_CONTROL_CONFIG.EARLY_EXIT_MIN_KEYWORD_MATCHES) {
    return { skip: true, reason: "Query too short for comprehensive search" };
  }

  return { skip: false, reason: "Normal search processing" };
};

// ==================== Cost Estimation ====================

/**
 * Estimates cost for an embedding operation.
 */
export const estimateEmbeddingCost = (tokenCount: number, tier: EmbeddingTierName): number => {
  const tierConfig = EMBEDDING_TIERS[tier];
  return (tokenCount / COST_CONTROL_CONFIG.TOKENS_PER_COST_UNIT) * tierConfig.costPer1kTokens;
};

/**
 * Estimates monthly cost at current rate.
 */
export const estimateMonthlyCost = (dailyTokens: number, tier: EmbeddingTierName): number => {
  const dailyCost = estimateEmbeddingCost(dailyTokens, tier);
  return dailyCost * COST_CONTROL_CONFIG.DEFAULT_TREND_DAYS;
};

/**
 * Recommends tier based on budget and expected usage.
 */
export const recommendTier = (
  monthlyBudgetUsd: number,
  expectedMonthlyTokens: number
): { tier: EmbeddingTierName; estimatedCost: number; withinBudget: boolean } => {
  // Try tiers from premium to light
  const tierOrder: readonly EmbeddingTierName[] = ["PREMIUM", "STANDARD", "LIGHT"];

  const findSuitableTier = (
    index: number
  ): { tier: EmbeddingTierName; estimatedCost: number; withinBudget: boolean } => {
    if (index >= tierOrder.length) {
      // Even LIGHT is over budget, but return it anyway
      const lightCost = estimateEmbeddingCost(expectedMonthlyTokens, "LIGHT");
      return { tier: "LIGHT", estimatedCost: lightCost, withinBudget: false };
    }

    const tier = tierOrder[index];
    const estimatedCost = estimateEmbeddingCost(expectedMonthlyTokens, tier);

    if (monthlyBudgetUsd === 0 || estimatedCost <= monthlyBudgetUsd) {
      return { tier, estimatedCost, withinBudget: true };
    }

    return findSuitableTier(index + 1);
  };

  return findSuitableTier(0);
};
