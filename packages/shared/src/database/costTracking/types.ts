/**
 * Cost Tracking Types
 *
 * Type definitions and mappers for RAG cost tracking and budget management.
 *
 * @module database/costTracking/types
 */

import type { EmbeddingTierName } from "../common.js";

// ==================== Operation Types ====================

/**
 * Types of operations that incur costs.
 */
export type CostOperationType = "embedding" | "query";

/**
 * Budget status levels.
 */
export type BudgetStatusLevel = "ok" | "warning" | "critical" | "exceeded";

// ==================== Database Row Types ====================

/**
 * Database row for cost tracking.
 */
export interface CostTrackingRow {
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
 * Database row for monthly summary query.
 */
export interface MonthlySummaryRow {
  readonly tenant_id: string;
  readonly total_cost: string;
  readonly total_tokens: string;
  readonly embedding_cost: string;
  readonly query_cost: string;
}

/**
 * Database row for tier breakdown query.
 */
export interface TierBreakdownRow {
  readonly embedding_tier: string;
  readonly total_tokens: string;
  readonly total_cost: string;
}

/**
 * Database row for daily costs query.
 */
export interface DailyCostRow {
  readonly day: string;
  readonly total_cost: string;
  readonly total_tokens: string;
}

/**
 * Database row for top consumers query.
 */
export interface TopConsumerRow {
  readonly tenant_id: string;
  readonly total_cost: string;
  readonly total_tokens: string;
}

// ==================== Record Types ====================

/**
 * Cost record.
 */
export interface CostRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly operationType: CostOperationType;
  readonly embeddingTier: EmbeddingTierName;
  readonly tokenCount: number;
  readonly costUsd: number;
  readonly recordedAt: string;
  readonly createdAt: string;
}

// ==================== Input Types ====================

/**
 * Input for recording a cost.
 */
export interface RecordCostInput {
  readonly tenantId: string;
  readonly operationType: CostOperationType;
  readonly embeddingTier: EmbeddingTierName;
  readonly tokenCount: number;
}

// ==================== Summary Types ====================

/**
 * Cost breakdown by tier.
 */
export interface TierCostBreakdown {
  readonly tokens: number;
  readonly cost: number;
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
  readonly byTier: Record<EmbeddingTierName, TierCostBreakdown>;
}

/**
 * Budget status for a tenant.
 */
export interface BudgetStatus {
  readonly tenantId: string;
  readonly monthlyBudgetUsd: number;
  readonly currentSpendUsd: number;
  readonly percentUsed: number;
  readonly status: BudgetStatusLevel;
  readonly remainingBudgetUsd: number;
}

/**
 * Daily cost entry.
 */
export interface DailyCostEntry {
  readonly day: string;
  readonly cost: number;
  readonly tokens: number;
}

/**
 * Top consumer entry.
 */
export interface TopConsumerEntry {
  readonly tenantId: string;
  readonly cost: number;
  readonly tokens: number;
}

// ==================== Validation Types ====================

/**
 * Validation rule for RecordCostInput fields.
 */
export interface CostInputValidationRule {
  readonly field: keyof RecordCostInput;
  readonly isInvalid: (input: RecordCostInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: RecordCostInput) => unknown;
}
