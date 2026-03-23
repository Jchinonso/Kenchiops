/**
 * Chat Budget Service
 *
 * Business logic for checking and tracking daily chat token budgets.
 * Uses the chatTokenUsage repository for persistence and plan-tier
 * defaults from constants.
 *
 * @module chat/chatBudget
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { CHAT_TOKEN_BUDGET_BY_PLAN, CHAT_BUDGET_WARNING_THRESHOLD } from "../constants/api.js";
import { getTodayTokenUsage, incrementTokenUsage } from "../database/chatTokenUsage/repository.js";
import type { RequestContext } from "../core/types.js";
import type { ChatBudgetStatus } from "./types.js";

const logger = createLogger("chat-budget");

// ==================== Helpers ====================

/**
 * Resolves the daily budget limit for a tenant.
 * Uses per-tenant override if set, otherwise falls back to plan-tier default.
 */
const resolveBudgetLimit = (planTier: string, overrideLimit: number | null): number => {
  if (overrideLimit !== null) {
    return overrideLimit;
  }
  const knownTier = planTier as keyof typeof CHAT_TOKEN_BUDGET_BY_PLAN;
  return knownTier in CHAT_TOKEN_BUDGET_BY_PLAN
    ? CHAT_TOKEN_BUDGET_BY_PLAN[knownTier]
    : CHAT_TOKEN_BUDGET_BY_PLAN.free;
};

// ==================== Public API ====================

/**
 * Checks the current chat token budget status for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param planTier - Subscription plan tier (free, pro, team, enterprise)
 * @param context - Request context for logging
 * @returns Budget status with usage, limits, and warning/exhaustion flags
 */
export const checkChatBudget = async (
  tenantId: string,
  planTier: string,
  context: RequestContext
): Promise<ChatBudgetStatus> => {
  const usage = await getTodayTokenUsage(tenantId, context);

  const tokensUsed = usage?.tokensUsed ?? 0;
  const budgetLimit = resolveBudgetLimit(planTier, usage?.budgetLimit ?? null);
  const remaining = Math.max(0, budgetLimit - tokensUsed);
  const ratioUsed = budgetLimit > 0 ? tokensUsed / budgetLimit : 0;
  const isWarning = ratioUsed >= CHAT_BUDGET_WARNING_THRESHOLD;
  const isExhausted = ratioUsed >= 1;

  if (isExhausted) {
    logger.warn("Chat token budget exhausted for tenant", {
      tokensUsed,
      budgetLimit,
      planTier,
      ...context,
    });
  }

  return {
    tokensUsed,
    budgetLimit,
    remaining,
    ratioUsed,
    isWarning,
    isExhausted,
  };
};

/**
 * Increments the daily chat token usage for a tenant.
 * Delegates to the repository for atomic upsert.
 *
 * @param tenantId - Tenant ID
 * @param tokensConsumed - Total tokens (input + output) consumed
 * @param context - Request context for logging
 */
export const incrementChatTokenUsage = async (
  tenantId: string,
  tokensConsumed: number,
  context: RequestContext
): Promise<void> => {
  try {
    await incrementTokenUsage(tenantId, tokensConsumed, context);
  } catch (error: unknown) {
    // Fail open — budget tracking should not block chat
    logger.warn("Failed to increment chat token usage — continuing", {
      error: getErrorMessage(error),
      tokensConsumed,
      ...context,
    });
  }
};
