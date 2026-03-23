/**
 * Chat Token Usage Helpers
 *
 * Row mapper for chat token usage repository operations.
 *
 * @module database/chatTokenUsage/helpers
 */

import { PARSE_INT_RADIX } from "../common.js";
import type { ChatTokenUsageRow, ChatTokenUsage } from "./types.js";

// ==================== Row Mappers ====================

/**
 * Maps a database row to a ChatTokenUsage domain object.
 */
export const mapRowToTokenUsage = (row: ChatTokenUsageRow): ChatTokenUsage => ({
  id: row.id,
  tenantId: row.tenant_id,
  usageDate: row.usage_date,
  tokensUsed: parseInt(row.tokens_used, PARSE_INT_RADIX),
  messageCount: row.message_count,
  budgetLimit: row.budget_limit === null ? null : parseInt(row.budget_limit, PARSE_INT_RADIX),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
