/**
 * Cost Tracking Helpers
 *
 * Validation functions and row mappers for cost tracking repository.
 *
 * @module database/costTracking/helpers
 */

import {
  ValidationError,
  PARSE_INT_RADIX,
  COST_CONTROL_CONFIG,
  DRIFT_DETECTION_THRESHOLDS,
  EMBEDDING_TIERS,
  COST_TRACKING_DEFAULTS,
  type EmbeddingTierName,
} from "../common.js";
import type {
  CostTrackingRow,
  MonthlySummaryRow,
  TierBreakdownRow,
  DailyCostRow,
  TopConsumerRow,
  CostRecord,
  CostOperationType,
  TierCostBreakdown,
  CostSummary,
  DailyCostEntry,
  TopConsumerEntry,
  BudgetStatusLevel,
  RecordCostInput,
} from "./types.js";

// ==================== Validation Constants ====================

/** Valid operation types. */
export const VALID_OPERATION_TYPES: ReadonlySet<CostOperationType> = new Set([
  "embedding",
  "query",
]);

/** Valid embedding tier names. */
export const VALID_EMBEDDING_TIERS: ReadonlySet<string> = new Set(["LIGHT", "STANDARD", "PREMIUM"]);

// ==================== Budget Status Thresholds ====================

/** Budget status threshold rules ordered by priority (highest threshold first). */
export const BUDGET_STATUS_THRESHOLDS: ReadonlyArray<{
  readonly minPercent: number;
  readonly status: BudgetStatusLevel;
}> = [
  { minPercent: DRIFT_DETECTION_THRESHOLDS.PERCENTAGE_MULTIPLIER, status: "exceeded" },
  { minPercent: COST_CONTROL_CONFIG.BUDGET_CRITICAL_THRESHOLD_PERCENT, status: "critical" },
  { minPercent: COST_CONTROL_CONFIG.BUDGET_ALERT_THRESHOLD_PERCENT, status: "warning" },
];

// ==================== Validation Rule Types ====================

/** Validation rule for RecordCostInput fields. */
interface CostInputValidationRule {
  readonly field: keyof RecordCostInput;
  readonly isInvalid: (input: RecordCostInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: RecordCostInput) => unknown;
}

/** Validation rules for RecordCostInput. */
const COST_INPUT_VALIDATION_RULES: readonly CostInputValidationRule[] = [
  {
    field: "tenantId",
    isInvalid: (input) => input.tenantId.trim().length === 0,
    message: "Tenant ID cannot be empty",
  },
  {
    field: "operationType",
    isInvalid: (input) => !VALID_OPERATION_TYPES.has(input.operationType),
    message: "Invalid operation type",
    getValue: (input) => input.operationType,
  },
  {
    field: "embeddingTier",
    isInvalid: (input) => !VALID_EMBEDDING_TIERS.has(input.embeddingTier),
    message: "Invalid embedding tier",
    getValue: (input) => input.embeddingTier,
  },
  {
    field: "tokenCount",
    isInvalid: (input) =>
      !Number.isFinite(input.tokenCount) ||
      input.tokenCount < COST_TRACKING_DEFAULTS.MIN_TOKEN_COUNT,
    message: "Token count must be a non-negative number",
    getValue: (input) => input.tokenCount,
  },
];

// ==================== Input Validation ====================

/**
 * Validates RecordCostInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateRecordCostInput = (input: RecordCostInput): void => {
  const failedRule = COST_INPUT_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(input);
  }

  throw new ValidationError(failedRule.message, { operation: "validateRecordCostInput", metadata });
};

/**
 * Validates tenant ID is non-empty.
 *
 * @throws ValidationError if tenant ID is empty
 */
export const validateTenantId = (tenantId: string): void => {
  if (tenantId.trim().length === 0) {
    throw new ValidationError("Tenant ID cannot be empty", { operation: "validateTenantId" });
  }
};

/**
 * Validates days parameter is positive.
 *
 * @throws ValidationError if days is not positive
 */
export const validateDays = (days: number): void => {
  if (!Number.isFinite(days) || days < COST_TRACKING_DEFAULTS.MIN_DAYS) {
    throw new ValidationError(`Days must be at least ${COST_TRACKING_DEFAULTS.MIN_DAYS}`, {
      operation: "validateDays",
      metadata: { days, minimum: COST_TRACKING_DEFAULTS.MIN_DAYS },
    });
  }
};

/**
 * Validates limit parameter is positive.
 *
 * @throws ValidationError if limit is not positive
 */
export const validateLimit = (limit: number): void => {
  if (!Number.isFinite(limit) || limit < COST_TRACKING_DEFAULTS.MIN_LIMIT) {
    throw new ValidationError(`Limit must be at least ${COST_TRACKING_DEFAULTS.MIN_LIMIT}`, {
      operation: "validateLimit",
      metadata: { limit, minimum: COST_TRACKING_DEFAULTS.MIN_LIMIT },
    });
  }
};

// ==================== Helper Functions ====================

/**
 * Calculates cost for tokens based on embedding tier.
 */
export const calculateCost = (tokenCount: number, tier: EmbeddingTierName): number => {
  const tierConfig = EMBEDDING_TIERS[tier];
  return (tokenCount / COST_CONTROL_CONFIG.TOKENS_PER_COST_UNIT) * tierConfig.costPer1kTokens;
};

/**
 * Determines budget status based on percentage used.
 */
export const determineBudgetStatus = (percentUsed: number): BudgetStatusLevel => {
  const matched = BUDGET_STATUS_THRESHOLDS.find((threshold) => percentUsed >= threshold.minPercent);
  return matched?.status ?? "ok";
};

/**
 * Creates initial tier breakdown with zero values.
 */
export const createEmptyTierBreakdown = (): Record<EmbeddingTierName, TierCostBreakdown> => ({
  LIGHT: { tokens: 0, cost: 0 },
  STANDARD: { tokens: 0, cost: 0 },
  PREMIUM: { tokens: 0, cost: 0 },
});

/**
 * Builds tier breakdown from query results.
 */
export const buildTierBreakdown = (
  rows: readonly TierBreakdownRow[]
): Record<EmbeddingTierName, TierCostBreakdown> =>
  rows.reduce((accumulator, row) => {
    const tierName = row.embedding_tier.toUpperCase() as EmbeddingTierName;
    return VALID_EMBEDDING_TIERS.has(tierName)
      ? { ...accumulator, [tierName]: mapTierRow(row) }
      : accumulator;
  }, createEmptyTierBreakdown());

/**
 * Creates empty cost summary for tenant with no data.
 */
export const createEmptyCostSummary = (
  tenantId: string,
  byTier: Record<EmbeddingTierName, TierCostBreakdown>
): CostSummary => ({
  tenantId,
  totalCostUsd: 0,
  totalTokens: 0,
  embeddingCost: 0,
  queryCost: 0,
  byTier,
});

// ==================== Row Mappers ====================

/**
 * Maps database row to CostRecord.
 */
export const mapRowToCostRecord = (row: CostTrackingRow): CostRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  operationType: row.operation_type as CostOperationType,
  embeddingTier: row.embedding_tier as EmbeddingTierName,
  tokenCount: row.token_count,
  costUsd: parseFloat(row.cost_usd),
  recordedAt: row.recorded_at,
  createdAt: row.created_at,
});

/**
 * Maps tier breakdown row to TierCostBreakdown.
 */
export const mapTierRow = (row: TierBreakdownRow): TierCostBreakdown => ({
  tokens: parseInt(row.total_tokens, PARSE_INT_RADIX),
  cost: parseFloat(row.total_cost),
});

/**
 * Maps daily cost row to DailyCostEntry.
 */
export const mapDailyCostRow = (row: DailyCostRow): DailyCostEntry => ({
  day: row.day,
  cost: parseFloat(row.total_cost),
  tokens: parseInt(row.total_tokens, PARSE_INT_RADIX),
});

/**
 * Maps top consumer row to TopConsumerEntry.
 */
export const mapTopConsumerRow = (row: TopConsumerRow): TopConsumerEntry => ({
  tenantId: row.tenant_id,
  cost: parseFloat(row.total_cost),
  tokens: parseInt(row.total_tokens, PARSE_INT_RADIX),
});

/**
 * Maps summary row to CostSummary.
 */
export const mapSummaryRow = (
  row: MonthlySummaryRow,
  byTier: Record<EmbeddingTierName, TierCostBreakdown>
): CostSummary => ({
  tenantId: row.tenant_id,
  totalCostUsd: parseFloat(row.total_cost),
  totalTokens: parseInt(row.total_tokens, PARSE_INT_RADIX),
  embeddingCost: parseFloat(row.embedding_cost),
  queryCost: parseFloat(row.query_cost),
  byTier,
});
