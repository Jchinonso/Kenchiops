/**
 * RAG Cost Tracking Repository
 *
 * Database operations for tracking embedding and query costs.
 * Supports budget management and cost optimization.
 *
 * @module database/costTrackingRepository
 */

import { query } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import {
  COST_CONTROL_CONFIG,
  DRIFT_DETECTION_THRESHOLDS,
  EMBEDDING_TIERS,
  type EmbeddingTierName,
} from "../constants/index.js";

const logger = createLogger("cost-tracking-repository");

// ==================== Types ====================

/**
 * Database row for cost tracking.
 */
interface CostTrackingRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly operation_type: string;
  readonly embedding_tier: string;
  readonly token_count: number;
  readonly cost_usd: string;
  readonly recorded_at: string;
  readonly created_at: string;
}

/**
 * Cost record.
 */
export interface CostRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly operationType: "embedding" | "query";
  readonly embeddingTier: EmbeddingTierName;
  readonly tokenCount: number;
  readonly costUsd: number;
  readonly recordedAt: string;
  readonly createdAt: string;
}

/**
 * Input for recording a cost.
 */
export interface RecordCostInput {
  readonly tenantId: string;
  readonly operationType: "embedding" | "query";
  readonly embeddingTier: EmbeddingTierName;
  readonly tokenCount: number;
}

/**
 * Cost summary for a period.
 */
export interface CostSummary {
  readonly tenantId: string;
  readonly totalCostUsd: number;
  readonly totalTokens: number;
  readonly embeddingCost: number;
  readonly queryCost: number;
  readonly byTier: Record<EmbeddingTierName, { tokens: number; cost: number }>;
}

/**
 * Budget status for a tenant.
 */
export interface BudgetStatus {
  readonly tenantId: string;
  readonly monthlyBudgetUsd: number;
  readonly currentSpendUsd: number;
  readonly percentUsed: number;
  readonly status: "ok" | "warning" | "critical" | "exceeded";
  readonly remainingBudgetUsd: number;
}

// ==================== SQL Queries ====================

const COST_QUERIES = {
  INSERT: `
    INSERT INTO rag_cost_tracking (
      id, tenant_id, operation_type, embedding_tier, token_count, cost_usd, recorded_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING *
  `,

  GET_MONTHLY_SUMMARY: `
    SELECT
      tenant_id,
      SUM(cost_usd::numeric) as total_cost,
      SUM(token_count) as total_tokens,
      SUM(CASE WHEN operation_type = 'embedding' THEN cost_usd::numeric ELSE 0 END) as embedding_cost,
      SUM(CASE WHEN operation_type = 'query' THEN cost_usd::numeric ELSE 0 END) as query_cost
    FROM rag_cost_tracking
    WHERE tenant_id = $1
      AND recorded_at >= DATE_TRUNC('month', NOW())
    GROUP BY tenant_id
  `,

  GET_MONTHLY_BY_TIER: `
    SELECT
      embedding_tier,
      SUM(token_count) as total_tokens,
      SUM(cost_usd::numeric) as total_cost
    FROM rag_cost_tracking
    WHERE tenant_id = $1
      AND recorded_at >= DATE_TRUNC('month', NOW())
    GROUP BY embedding_tier
  `,

  GET_DAILY_COSTS: `
    SELECT
      DATE_TRUNC('day', recorded_at) as day,
      SUM(cost_usd::numeric) as total_cost,
      SUM(token_count) as total_tokens
    FROM rag_cost_tracking
    WHERE tenant_id = $1
      AND recorded_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', recorded_at)
    ORDER BY day ASC
  `,

  DELETE_OLD: `
    DELETE FROM rag_cost_tracking
    WHERE recorded_at < NOW() - ($1 || ' days')::INTERVAL
  `,

  GET_TOP_CONSUMERS: `
    SELECT
      tenant_id,
      SUM(cost_usd::numeric) as total_cost,
      SUM(token_count) as total_tokens
    FROM rag_cost_tracking
    WHERE recorded_at >= DATE_TRUNC('month', NOW())
    GROUP BY tenant_id
    ORDER BY total_cost DESC
    LIMIT $1
  `,
} as const;

// ==================== Cost Calculation ====================

/**
 * Calculates cost for tokens based on embedding tier.
 */
const calculateCost = (tokenCount: number, tier: EmbeddingTierName): number => {
  const tierConfig = EMBEDDING_TIERS[tier];
  return (tokenCount / COST_CONTROL_CONFIG.TOKENS_PER_COST_UNIT) * tierConfig.costPer1kTokens;
};

// ==================== Mappers ====================

/**
 * Maps database row to CostRecord.
 */
const mapRowToCostRecord = (row: CostTrackingRow): CostRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  operationType: row.operation_type as "embedding" | "query",
  embeddingTier: row.embedding_tier as EmbeddingTierName,
  tokenCount: row.token_count,
  costUsd: parseFloat(row.cost_usd),
  recordedAt: row.recorded_at,
  createdAt: row.created_at,
});

// ==================== Public API ====================

/**
 * Records a cost entry.
 */
export const recordCost = async (input: RecordCostInput): Promise<CostRecord> => {
  const id = generateEventId();
  const costUsd = calculateCost(input.tokenCount, input.embeddingTier);

  const result = await query<CostTrackingRow>(COST_QUERIES.INSERT, [
    id,
    input.tenantId,
    input.operationType,
    input.embeddingTier,
    input.tokenCount,
    costUsd.toFixed(8),
  ]);

  logger.debug("Recorded cost", {
    tenantId: input.tenantId,
    operationType: input.operationType,
    tier: input.embeddingTier,
    tokens: input.tokenCount,
    cost: costUsd,
  });

  return mapRowToCostRecord(result.rows[0]);
};

/**
 * Gets monthly cost summary for a tenant.
 */
export const getMonthlyCostSummary = async (tenantId: string): Promise<CostSummary> => {
  const [summaryResult, tierResult] = await Promise.all([
    query<{
      tenant_id: string;
      total_cost: string;
      total_tokens: string;
      embedding_cost: string;
      query_cost: string;
    }>(COST_QUERIES.GET_MONTHLY_SUMMARY, [tenantId]),
    query<{
      embedding_tier: string;
      total_tokens: string;
      total_cost: string;
    }>(COST_QUERIES.GET_MONTHLY_BY_TIER, [tenantId]),
  ]);

  // Initialize tier breakdown
  const byTier: Record<EmbeddingTierName, { tokens: number; cost: number }> = {
    LIGHT: { tokens: 0, cost: 0 },
    STANDARD: { tokens: 0, cost: 0 },
    PREMIUM: { tokens: 0, cost: 0 },
  };

  // Populate tier breakdown
  tierResult.rows.forEach((row) => {
    const tierName = row.embedding_tier.toUpperCase() as EmbeddingTierName;
    if (byTier[tierName]) {
      byTier[tierName] = {
        tokens: parseInt(row.total_tokens, 10),
        cost: parseFloat(row.total_cost),
      };
    }
  });

  if (summaryResult.rows.length === 0) {
    return {
      tenantId,
      totalCostUsd: 0,
      totalTokens: 0,
      embeddingCost: 0,
      queryCost: 0,
      byTier,
    };
  }

  const summary = summaryResult.rows[0];
  return {
    tenantId,
    totalCostUsd: parseFloat(summary.total_cost),
    totalTokens: parseInt(summary.total_tokens, 10),
    embeddingCost: parseFloat(summary.embedding_cost),
    queryCost: parseFloat(summary.query_cost),
    byTier,
  };
};

/**
 * Gets budget status for a tenant.
 */
export const getBudgetStatus = async (
  tenantId: string,
  monthlyBudgetUsd: number = COST_CONTROL_CONFIG.DEFAULT_MONTHLY_BUDGET_USD
): Promise<BudgetStatus> => {
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

  let status: "ok" | "warning" | "critical" | "exceeded" = "ok";
  if (normalizedPercent >= DRIFT_DETECTION_THRESHOLDS.PERCENTAGE_MULTIPLIER) {
    status = "exceeded";
  } else if (normalizedPercent >= COST_CONTROL_CONFIG.BUDGET_CRITICAL_THRESHOLD_PERCENT) {
    status = "critical";
  } else if (normalizedPercent >= COST_CONTROL_CONFIG.BUDGET_ALERT_THRESHOLD_PERCENT) {
    status = "warning";
  }

  return {
    tenantId,
    monthlyBudgetUsd,
    currentSpendUsd: currentSpend,
    percentUsed: normalizedPercent,
    status,
    remainingBudgetUsd: Math.max(0, monthlyBudgetUsd - currentSpend),
  };
};

/**
 * Gets daily cost trend.
 */
export const getDailyCostTrend = async (
  tenantId: string,
  days: number = COST_CONTROL_CONFIG.DEFAULT_TREND_DAYS
): Promise<ReadonlyArray<{ day: string; cost: number; tokens: number }>> => {
  const result = await query<{
    day: string;
    total_cost: string;
    total_tokens: string;
  }>(COST_QUERIES.GET_DAILY_COSTS, [tenantId, days]);

  return Object.freeze(
    result.rows.map((row) => ({
      day: row.day,
      cost: parseFloat(row.total_cost),
      tokens: parseInt(row.total_tokens, 10),
    }))
  );
};

/**
 * Gets top cost consumers.
 */
export const getTopCostConsumers = async (
  limit: number = COST_CONTROL_CONFIG.DEFAULT_TOP_CONSUMERS_LIMIT
): Promise<ReadonlyArray<{ tenantId: string; cost: number; tokens: number }>> => {
  const result = await query<{
    tenant_id: string;
    total_cost: string;
    total_tokens: string;
  }>(COST_QUERIES.GET_TOP_CONSUMERS, [limit]);

  return Object.freeze(
    result.rows.map((row) => ({
      tenantId: row.tenant_id,
      cost: parseFloat(row.total_cost),
      tokens: parseInt(row.total_tokens, 10),
    }))
  );
};

/**
 * Cleans up old cost records.
 */
export const cleanupOldCostRecords = async (
  retentionDays: number = COST_CONTROL_CONFIG.DEFAULT_COST_RETENTION_DAYS
): Promise<number> => {
  const result = await query(COST_QUERIES.DELETE_OLD, [retentionDays]);
  logger.info("Cleaned up old cost records", { deleted: result.rowCount });
  return result.rowCount;
};
