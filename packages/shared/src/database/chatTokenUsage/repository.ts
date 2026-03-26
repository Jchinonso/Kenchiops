/**
 * Chat Token Usage Repository
 *
 * Database operations for tracking daily chat token consumption per tenant.
 * Used by the budget enforcement system in the chat service.
 *
 * @module database/chatTokenUsage/repository
 */

import { query, createLogger, generateEventId, validateNonEmptyString } from "../common.js";
import type { RequestContext } from "../../core/types.js";
import type { ChatTokenUsageRow, ChatTokenUsage } from "./types.js";
import { mapRowToTokenUsage } from "./helpers.js";
import { CHAT_DEFAULTS } from "../../constants/api.js";

const logger = createLogger("chat-token-usage-repository");

// ==================== Query Helpers ====================

/**
 * Builds the SELECT query for today's token usage.
 * Separated to avoid SQL string interpolation in the main function.
 */
const SELECT_TODAY_USAGE = [
  "SELECT * FROM chat_token_usage",
  "WHERE tenant_id = $1 AND usage_date = CURRENT_DATE",
].join(" ");

/**
 * Builds the UPSERT query for incrementing token usage.
 * Uses ON CONFLICT to atomically insert or update the daily row.
 */
const UPSERT_TOKEN_USAGE = [
  "INSERT INTO chat_token_usage (id, tenant_id, usage_date, tokens_used, message_count)",
  "VALUES ($1, $2, CURRENT_DATE, $3, 1)",
  "ON CONFLICT (tenant_id, usage_date) DO UPDATE",
  "SET tokens_used = chat_token_usage.tokens_used + EXCLUDED.tokens_used,",
  "message_count = chat_token_usage.message_count + 1,",
  "updated_at = NOW()",
].join(" ");

// ==================== Repository Operations ====================

/**
 * Gets today's token usage for a tenant.
 *
 * @param tenantId - Tenant ID for isolation
 * @returns Today's usage record or null if no usage yet
 */
export const getTodayTokenUsage = async (
  tenantId: string,
  _context: RequestContext
): Promise<ChatTokenUsage | null> => {
  validateNonEmptyString(tenantId, "tenantId");

  const result = await query<ChatTokenUsageRow>(SELECT_TODAY_USAGE, [tenantId]);

  return result.rows.length > 0 ? mapRowToTokenUsage(result.rows[0]) : null;
};

/**
 * Atomically increments today's token usage for a tenant.
 * Creates the daily row if it doesn't exist yet.
 *
 * @param tenantId - Tenant ID for isolation
 * @param tokensConsumed - Number of tokens to add
 * @param context - Request context for logging
 */
export const incrementTokenUsage = async (
  tenantId: string,
  tokensConsumed: number,
  context: RequestContext
): Promise<void> => {
  validateNonEmptyString(tenantId, "tenantId");

  if (!Number.isFinite(tokensConsumed) || tokensConsumed <= 0) {
    logger.warn("Invalid tokensConsumed value — skipping increment", {
      tokensConsumed,
      ...context,
    });
    return;
  }

  if (tokensConsumed > CHAT_DEFAULTS.MAX_TOKENS_PER_INCREMENT) {
    logger.warn("tokensConsumed exceeds maximum — clamping to cap", {
      tokensConsumed,
      capped: CHAT_DEFAULTS.MAX_TOKENS_PER_INCREMENT,
      ...context,
    });
  }

  const cappedTokens = Math.min(tokensConsumed, CHAT_DEFAULTS.MAX_TOKENS_PER_INCREMENT);

  const id = generateEventId("ctu");

  await query(UPSERT_TOKEN_USAGE, [id, tenantId, cappedTokens]);

  logger.info("Incremented chat token usage", {
    tokensConsumed: cappedTokens,
    ...context,
  });
};
