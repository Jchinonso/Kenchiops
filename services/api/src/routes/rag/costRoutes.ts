/**
 * RAG Cost Routes - Tier Config, Cache, Cost Estimation
 *
 * @module routes/rag/costRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  COST_CONTROL_CONFIG,
  VALID_EMBEDDING_TIERS,
  type EmbeddingTierName,
  getTenantTierConfig,
  setTenantTierConfig,
  getRAGCacheStats,
  clearCache,
  clearExpiredCache,
  estimateEmbeddingCost,
  estimateMonthlyCost,
  recommendTier,
} from "@kenchi/shared";
import type {
  UpdateTierConfigRequestBody,
  CacheClearRequestBody,
  CostEstimateRequestBody,
  CacheClearResponse,
  CostEstimateResponse,
  CostStatsResponse,
} from "./types.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Type Guards ====================

/** Type guard for valid embedding tier */
const isValidTier = (value: unknown): value is EmbeddingTierName =>
  typeof value === "string" && VALID_EMBEDDING_TIERS.has(value);

// ==================== Validation Rules ====================

/** Validation rule: optional valid tier */
const validateOptionalTier = (fieldValue: unknown): boolean | string =>
  fieldValue === undefined || isValidTier(fieldValue) || "Invalid embedding tier";

/** Validation rule: optional non-negative number */
const validateOptionalNonNegativeNumber = (fieldValue: unknown): boolean | string =>
  fieldValue === undefined ||
  (typeof fieldValue === "number" && fieldValue >= 0) ||
  "Must be a non-negative number";

/** Validation rule: optional boolean */
const validateOptionalBoolean = (fieldValue: unknown): boolean | string =>
  fieldValue === undefined || typeof fieldValue === "boolean" || "Must be a boolean";

/** Validation rule: required positive number */
const validateRequiredPositiveNumber = (fieldValue: unknown): boolean | string => {
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return (typeof fieldValue === "number" && fieldValue > 0) || "Must be a positive number";
};

// ==================== Response Builders ====================

/** Builds cache clear response */
const buildCacheClearResponse = (type: "expired" | "full", cleared?: number): CacheClearResponse =>
  type === "expired" ? { cleared, type } : { type };

/** Builds cost estimate response */
const buildCostEstimateResponse = (
  tokenCount: number,
  tier: string,
  estimatedCostUsd: number,
  monthlyProjection?: number,
  recommendation?: unknown
): CostEstimateResponse => ({
  tokenCount,
  tier,
  estimatedCostUsd,
  ...(monthlyProjection !== undefined && { monthlyProjection }),
  ...(recommendation !== undefined && { recommendation }),
});

/** Builds cost stats response */
const buildCostStatsResponse = (
  tenantId: string,
  tierConfig: unknown,
  cacheStats: unknown
): CostStatsResponse => ({
  tenantId,
  tierConfig,
  cacheStats,
});

// ==================== Route Handlers ====================

/**
 * Handles tenant tier config retrieval.
 */
const handleGetTierConfig = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.params;

  if (!tenantId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "tenantId is required",
    });
    return;
  }

  const tierConfig = await getTenantTierConfig(tenantId);

  logger.info("Tenant tier config retrieved", {
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: tierConfig,
  });
};

/**
 * Handles tenant tier config update.
 */
const handleUpdateTierConfig = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.params;
  const body = req.body as UpdateTierConfigRequestBody;

  if (!tenantId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "tenantId is required",
    });
    return;
  }

  const currentConfig = await getTenantTierConfig(tenantId);
  const updatedConfig = {
    tenantId,
    preferredTier: (body.preferredTier as EmbeddingTierName) ?? currentConfig.preferredTier,
    monthlyBudgetUsd: body.monthlyBudgetUsd ?? currentConfig.monthlyBudgetUsd,
    allowPremium: body.allowPremium ?? currentConfig.allowPremium,
    degradeOnBudgetWarning: body.degradeOnBudgetWarning ?? currentConfig.degradeOnBudgetWarning,
  };

  await setTenantTierConfig(updatedConfig);

  logger.info("Tenant tier config updated", {
    tenantId,
    preferredTier: updatedConfig.preferredTier,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: updatedConfig,
  });
};

/**
 * Handles cache statistics retrieval.
 */
const handleGetCacheStats = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  const stats = getRAGCacheStats();

  logger.info("Cache stats retrieved", {
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: stats,
  });
};

/**
 * Handles cache clear operations.
 */
const handleClearCache = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as CacheClearRequestBody;

  if (body.expiredOnly) {
    const cleared = clearExpiredCache();

    logger.info("Expired cache cleared", {
      cleared,
      durationMs: Date.now() - startTime,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: buildCacheClearResponse("expired", cleared),
    });
  } else {
    clearCache();

    logger.info("Full cache cleared", {
      durationMs: Date.now() - startTime,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: buildCacheClearResponse("full"),
    });
  }
};

/**
 * Handles cost estimation requests.
 */
const handleCostEstimate = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as CostEstimateRequestBody;

  const selectedTier = (body.tier as EmbeddingTierName) ?? "STANDARD";
  const estimatedCost = estimateEmbeddingCost(body.tokenCount, selectedTier);

  let monthlyProjection: number | undefined;
  let recommendation: unknown | undefined;

  if (body.dailyTokens) {
    monthlyProjection = estimateMonthlyCost(body.dailyTokens, selectedTier);
  }

  if (body.monthlyBudget && body.dailyTokens) {
    const expectedMonthlyTokens = body.dailyTokens * COST_CONTROL_CONFIG.DAYS_IN_MONTH;
    recommendation = recommendTier(body.monthlyBudget, expectedMonthlyTokens);
  }

  logger.info("Cost estimate calculated", {
    tokenCount: body.tokenCount,
    tier: selectedTier,
    estimatedCost,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildCostEstimateResponse(
      body.tokenCount,
      selectedTier,
      estimatedCost,
      monthlyProjection,
      recommendation
    ),
  });
};

/**
 * Handles cost stats retrieval.
 */
const handleGetCostStats = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const tenantId = req.query.tenantId as string | undefined;

  if (!tenantId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "tenantId query parameter is required",
    });
    return;
  }

  const [tierConfig, cacheStats] = await Promise.all([
    getTenantTierConfig(tenantId),
    Promise.resolve(getRAGCacheStats()),
  ]);

  logger.info("Cost stats retrieved", {
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildCostStatsResponse(tenantId, tierConfig, cacheStats),
  });
};

// ==================== Route Definitions ====================

/** GET /api/rag/tenant/:tenantId/tier - Get tenant tier config */
router.get(API_ROUTES.RAG_TENANT_TIER, asyncHandler(handleGetTierConfig));

/** PUT /api/rag/tenant/:tenantId/tier - Update tenant tier config */
router.put(
  API_ROUTES.RAG_TENANT_TIER,
  validate({
    body: {
      preferredTier: validateOptionalTier,
      monthlyBudgetUsd: validateOptionalNonNegativeNumber,
      allowPremium: validateOptionalBoolean,
      degradeOnBudgetWarning: validateOptionalBoolean,
    },
  }),
  asyncHandler(handleUpdateTierConfig)
);

/** GET /api/rag/cache/stats - Get cache statistics */
router.get(API_ROUTES.RAG_CACHE_STATS, asyncHandler(handleGetCacheStats));

/** POST /api/rag/cache/clear - Clear cache */
router.post(API_ROUTES.RAG_CACHE_CLEAR, asyncHandler(handleClearCache));

/** POST /api/rag/cost/estimate - Estimate embedding costs */
router.post(
  API_ROUTES.RAG_COST_ESTIMATE,
  validate({
    body: {
      tokenCount: validateRequiredPositiveNumber,
      tier: validateOptionalTier,
    },
  }),
  asyncHandler(handleCostEstimate)
);

/** GET /api/rag/cost-stats - Get cost tracking stats */
router.get(API_ROUTES.RAG_COST_STATS, asyncHandler(handleGetCostStats));

export { router as ragCostRoutes };
