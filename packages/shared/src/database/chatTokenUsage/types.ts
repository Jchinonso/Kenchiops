/**
 * Chat Token Usage Types
 *
 * Type definitions for chat token usage tracking
 * used by the daily budget enforcement system.
 *
 * @module database/chatTokenUsage/types
 */

// ==================== Database Row Types ====================

/**
 * Database row for chat_token_usage table.
 */
export interface ChatTokenUsageRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly usage_date: Date;
  readonly tokens_used: string; // BIGINT comes as string from pg
  readonly message_count: number;
  readonly budget_limit: string | null; // BIGINT comes as string from pg
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types ====================

/**
 * Domain object for chat token usage.
 */
export interface ChatTokenUsage {
  readonly id: string;
  readonly tenantId: string;
  readonly usageDate: Date;
  readonly tokensUsed: number;
  readonly messageCount: number;
  readonly budgetLimit: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
