/**
 * Cost Tracking Module
 *
 * Database operations for RAG cost tracking and budget management.
 *
 * @module database/costTracking
 */

// Types
export type {
  CostOperationType,
  BudgetStatusLevel,
  CostTrackingRow,
  MonthlySummaryRow,
  TierBreakdownRow,
  DailyCostRow,
  TopConsumerRow,
  CostRecord,
  RecordCostInput,
  TierCostBreakdown,
  CostSummary,
  BudgetStatus,
  DailyCostEntry,
  TopConsumerEntry,
} from "./types.js";

// Helpers (includes row mappers and validation)
export {
  // Row mappers
  mapRowToCostRecord,
  mapTierRow,
  mapDailyCostRow,
  mapTopConsumerRow,
  mapSummaryRow,
  // Validation
  validateRecordCostInput,
  validateTenantId,
  validateDays,
  validateLimit,
  // Constants
  VALID_OPERATION_TYPES,
  VALID_EMBEDDING_TIERS,
  BUDGET_STATUS_THRESHOLDS,
  // Helpers
  calculateCost,
  determineBudgetStatus,
  createEmptyTierBreakdown,
  buildTierBreakdown,
  createEmptyCostSummary,
} from "./helpers.js";

// Repository operations
export {
  recordCost,
  getMonthlyCostSummary,
  getBudgetStatus,
  getDailyCostTrend,
  getTopCostConsumers,
  cleanupOldCostRecords,
} from "./repository.js";
