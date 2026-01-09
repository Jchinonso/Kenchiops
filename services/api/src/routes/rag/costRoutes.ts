/**
 * RAG Cost Routes - Tier Config, Cache, Cost Estimation
 *
 * @module routes/rag/costRoutes
 */

import { Router } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
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

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

const VALID_TIERS = ["LIGHT", "STANDARD", "PREMIUM"];
const DAYS_IN_MONTH = 30;

/**
 * GET /api/rag/tenant/:tenantId/tier - Get tenant tier config
 */
router.get(
  API_ROUTES.RAG_TENANT_TIER,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;

    if (!tenantId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "tenantId is required",
      });
      return;
    }

    logger.info("Fetching tenant tier config", { tenantId });

    const tierConfig = await getTenantTierConfig(tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: tierConfig,
    });
  })
);

/**
 * PUT /api/rag/tenant/:tenantId/tier - Update tenant tier config
 */
router.put(
  API_ROUTES.RAG_TENANT_TIER,
  validate({
    body: {
      preferredTier: (value) => !value || VALID_TIERS.includes(value as string),
      monthlyBudgetUsd: (value) => value === undefined || (typeof value === "number" && value >= 0),
      allowPremium: (value) => value === undefined || typeof value === "boolean",
      degradeOnBudgetWarning: (value) => value === undefined || typeof value === "boolean",
    },
  }),
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const body = req.body as {
      preferredTier?: EmbeddingTierName;
      monthlyBudgetUsd?: number;
      allowPremium?: boolean;
      degradeOnBudgetWarning?: boolean;
    };

    if (!tenantId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "tenantId is required",
      });
      return;
    }

    logger.info("Updating tenant tier config", { tenantId, ...body });

    const currentConfig = await getTenantTierConfig(tenantId);
    const updatedConfig = {
      tenantId,
      preferredTier: body.preferredTier ?? currentConfig.preferredTier,
      monthlyBudgetUsd: body.monthlyBudgetUsd ?? currentConfig.monthlyBudgetUsd,
      allowPremium: body.allowPremium ?? currentConfig.allowPremium,
      degradeOnBudgetWarning: body.degradeOnBudgetWarning ?? currentConfig.degradeOnBudgetWarning,
    };

    await setTenantTierConfig(updatedConfig);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: updatedConfig,
    });
  })
);

/**
 * GET /api/rag/cache/stats - Get cache statistics
 */
router.get(
  API_ROUTES.RAG_CACHE_STATS,
  asyncHandler(async (_req, res) => {
    logger.info("Fetching cache stats");

    const stats = getRAGCacheStats();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats,
    });
  })
);

/**
 * POST /api/rag/cache/clear - Clear cache
 */
router.post(
  API_ROUTES.RAG_CACHE_CLEAR,
  asyncHandler(async (req, res) => {
    const { expiredOnly } = req.body as { expiredOnly?: boolean };

    logger.info("Clearing cache", { expiredOnly });

    if (expiredOnly) {
      const cleared = clearExpiredCache();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { cleared, type: "expired" },
      });
    } else {
      clearCache();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { type: "full" },
      });
    }
  })
);

/**
 * POST /api/rag/cost/estimate - Estimate embedding costs
 */
router.post(
  API_ROUTES.RAG_COST_ESTIMATE,
  validate({
    body: {
      tokenCount: (value) => validators.required(value) && typeof value === "number" && value > 0,
      tier: (value) => !value || VALID_TIERS.includes(value as string),
    },
  }),
  asyncHandler(async (req, res) => {
    const { tokenCount, tier, dailyTokens, monthlyBudget } = req.body as {
      tokenCount: number;
      tier?: EmbeddingTierName;
      dailyTokens?: number;
      monthlyBudget?: number;
    };

    logger.info("Estimating costs", { tokenCount, tier });

    const selectedTier = tier ?? "STANDARD";
    const estimatedCost = estimateEmbeddingCost(tokenCount, selectedTier);

    const response: Record<string, unknown> = {
      tokenCount,
      tier: selectedTier,
      estimatedCostUsd: estimatedCost,
    };

    if (dailyTokens) {
      response.monthlyProjection = estimateMonthlyCost(dailyTokens, selectedTier);
    }

    if (monthlyBudget && dailyTokens) {
      const expectedMonthlyTokens = dailyTokens * DAYS_IN_MONTH;
      response.recommendation = recommendTier(monthlyBudget, expectedMonthlyTokens);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: response,
    });
  })
);

/**
 * GET /api/rag/cost-stats - Get cost tracking stats
 */
router.get(
  API_ROUTES.RAG_COST_STATS,
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;

    if (!tenantId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "tenantId query parameter is required",
      });
      return;
    }

    logger.info("Fetching cost stats", { tenantId });

    const [tierConfig, cacheStats] = await Promise.all([
      getTenantTierConfig(tenantId),
      Promise.resolve(getRAGCacheStats()),
    ]);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        tenantId,
        tierConfig,
        cacheStats,
      },
    });
  })
);

export { router as ragCostRoutes };
