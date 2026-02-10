/**
 * RAG Cost Tracking Repository
 *
 * Database operations for tracking embedding and query costs.
 * Supports budget management and cost optimization.
 *
 * @module database/costTracking/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  COST_CONTROL_CONFIG,
  DRIFT_DETECTION_THRESHOLDS,
  COST_TRACKING_DEFAULTS,
  COST_TRACKING_QUERIES,
} from "../common.js";
import type {
  CostTrackingRow,
  MonthlySummaryRow,
  TierBreakdownRow,
  DailyCostRow,
  TopConsumerRow,
  CostRecord,
  RecordCostInput,
  CostSummary,
  BudgetStatus,
  DailyCostEntry,
  TopConsumerEntry,
} from "./types.js";
import {
  mapRowToCostRecord,
  mapDailyCostRow,
  mapTopConsumerRow,
  mapSummaryRow,
  validateRecordCostInput,
  validateTenantId,
  validateDays,
  validateLimit,
  calculateCost,
  determineBudgetStatus,
  buildTierBreakdown,
  createEmptyCostSummary,
} from "./helpers.js";

const logger = createLogger("cost-tracking-repository");

// ==================== Public API ====================

/**
 * Records a cost entry.
 *
 * @param input - Cost record input
 * @returns The created cost record
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const recordCost = async (input: RecordCostInput): Promise<CostRecord> => {
  validateRecordCostInput(input);

  const id = generateEventId();
  const costUsd = calculateCost(input.tokenCount, input.embeddingTier);

  try {
    const result = await query<CostTrackingRow>(COST_TRACKING_QUERIES.INSERT, [
      id,
      input.tenantId,
      input.operationType,
      input.embeddingTier.toLowerCase(),
      input.tokenCount,
      costUsd.toFixed(COST_TRACKING_DEFAULTS.COST_DECIMAL_PRECISION),
    ]);

    logger.debug("Recorded cost", {
      tenantId: input.tenantId,
      operationType: input.operationType,
      tier: input.embeddingTier,
      tokens: input.tokenCount,
      cost: costUsd,
    });

    return mapRowToCostRecord(result.rows[0]);
  } catch (error) {
    logger.error("Failed to record cost", {
      tenantId: input.tenantId,
      operationType: input.operationType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets monthly cost summary for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Cost summary for the current month
 * @throws ValidationError if tenant ID is empty
 * @throws Error if database operation fails
 */
export const getMonthlyCostSummary = async (tenantId: string): Promise<CostSummary> => {
  validateTenantId(tenantId);

  try {
    const [summaryResult, tierResult] = await Promise.all([
      query<MonthlySummaryRow>(COST_TRACKING_QUERIES.GET_MONTHLY_SUMMARY, [tenantId]),
      query<TierBreakdownRow>(COST_TRACKING_QUERIES.GET_MONTHLY_BY_TIER, [tenantId]),
    ]);

    const byTier = buildTierBreakdown(tierResult.rows);

    return summaryResult.rows.length === 0
      ? createEmptyCostSummary(tenantId, byTier)
      : mapSummaryRow(summaryResult.rows[0], byTier);
  } catch (error) {
    logger.error("Failed to get monthly cost summary", { tenantId, error: getErrorMessage(error) });
    throw error;
  }
};

/**
 * Gets budget status for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param monthlyBudgetUsd - Monthly budget in USD (0 for unlimited)
 * @returns Budget status
 * @throws ValidationError if tenant ID is empty
 * @throws Error if database operation fails
 */
export const getBudgetStatus = async (
  tenantId: string,
  monthlyBudgetUsd: number = COST_CONTROL_CONFIG.DEFAULT_MONTHLY_BUDGET_USD
): Promise<BudgetStatus> => {
  validateTenantId(tenantId);

  try {
    const summary = await getMonthlyCostSummary(tenantId);
    const currentSpend = summary.totalCostUsd;

    // Handle unlimited budget
    if (monthlyBudgetUsd === 0) {
      return {
        tenantId,
        monthlyBudgetUsd: 0,
        currentSpendUsd: currentSpend,
        percentUsed: 0,
        status: "ok",
        remainingBudgetUsd: Infinity,
      };
    }

    const normalizedPercent =
      (currentSpend / monthlyBudgetUsd) * DRIFT_DETECTION_THRESHOLDS.PERCENTAGE_MULTIPLIER;

    return {
      tenantId,
      monthlyBudgetUsd,
      currentSpendUsd: currentSpend,
      percentUsed: normalizedPercent,
      status: determineBudgetStatus(normalizedPercent),
      remainingBudgetUsd: Math.max(0, monthlyBudgetUsd - currentSpend),
    };
  } catch (error) {
    logger.error("Failed to get budget status", {
      tenantId,
      monthlyBudgetUsd,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets daily cost trend.
 *
 * @param tenantId - Tenant ID
 * @param days - Number of days to include (default: 30)
 * @returns Array of daily cost entries
 * @throws ValidationError if tenant ID is empty or days is invalid
 * @throws Error if database operation fails
 */
export const getDailyCostTrend = async (
  tenantId: string,
  days: number = COST_CONTROL_CONFIG.DEFAULT_TREND_DAYS
): Promise<readonly DailyCostEntry[]> => {
  validateTenantId(tenantId);
  validateDays(days);

  try {
    const result = await query<DailyCostRow>(COST_TRACKING_QUERIES.GET_DAILY_COSTS, [
      tenantId,
      days,
    ]);
    return Object.freeze(result.rows.map(mapDailyCostRow));
  } catch (error) {
    logger.error("Failed to get daily cost trend", {
      tenantId,
      days,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets top cost consumers.
 *
 * @param limit - Maximum number of results (default: 10)
 * @returns Array of top consumer entries
 * @throws ValidationError if limit is invalid
 * @throws Error if database operation fails
 */
export const getTopCostConsumers = async (
  limit: number = COST_CONTROL_CONFIG.DEFAULT_TOP_CONSUMERS_LIMIT
): Promise<readonly TopConsumerEntry[]> => {
  validateLimit(limit);

  try {
    const result = await query<TopConsumerRow>(COST_TRACKING_QUERIES.GET_TOP_CONSUMERS, [limit]);
    return Object.freeze(result.rows.map(mapTopConsumerRow));
  } catch (error) {
    logger.error("Failed to get top cost consumers", { limit, error: getErrorMessage(error) });
    throw error;
  }
};

/**
 * Cleans up old cost records.
 *
 * @param retentionDays - Number of days to retain (default: 90)
 * @returns Number of deleted records
 * @throws ValidationError if retention days is invalid
 * @throws Error if database operation fails
 */
export const cleanupOldCostRecords = async (
  retentionDays: number = COST_CONTROL_CONFIG.DEFAULT_COST_RETENTION_DAYS
): Promise<number> => {
  validateDays(retentionDays);

  try {
    const result = await query(COST_TRACKING_QUERIES.DELETE_OLD, [retentionDays]);
    logger.info("Cleaned up old cost records", { deleted: result.rowCount });
    return result.rowCount;
  } catch (error) {
    logger.error("Failed to cleanup old cost records", {
      retentionDays,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
