/**
 * Chat Budget Service
 *
 * Business logic for checking and tracking daily chat token budgets.
 * Accepts a ChatTokenUsageRepositoryPort for persistence (injected, not imported).
 *
 * @module chat/chatBudget
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { CHAT_TOKEN_BUDGET_BY_PLAN, CHAT_BUDGET_WARNING_THRESHOLD } from "../constants/api.js";
import type { RequestContext } from "../core/types.js";
import type { ChatBudgetStatus, ChatTokenUsageRepositoryPort } from "./types.js";

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

// ==================== Factory ====================

/**
 * Creates chat budget functions backed by the given token usage repository port.
 * Decouples budget logic from the concrete repository implementation.
 */
export const createChatBudgetFunctions = (
  tokenUsageRepo: ChatTokenUsageRepositoryPort
): {
  readonly checkChatBudget: (
    tenantId: string,
    planTier: string,
    context: RequestContext
  ) => Promise<ChatBudgetStatus>;
  readonly incrementChatTokenUsage: (
    tenantId: string,
    tokensConsumed: number,
    context: RequestContext
  ) => Promise<void>;
} => ({
  checkChatBudget: async (
    tenantId: string,
    planTier: string,
    context: RequestContext
  ): Promise<ChatBudgetStatus> => {
    const usage = await tokenUsageRepo.getTodayTokenUsage(tenantId, context);

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
  },

  incrementChatTokenUsage: async (
    tenantId: string,
    tokensConsumed: number,
    context: RequestContext
  ): Promise<void> => {
    try {
      await tokenUsageRepo.incrementTokenUsage(tenantId, tokensConsumed, context);
    } catch (error: unknown) {
      // Fail open — budget tracking should not block chat
      logger.warn("Failed to increment chat token usage — continuing", {
        error: getErrorMessage(error),
        tokensConsumed,
        ...context,
      });
    }
  },
});

// ==================== Backward-Compatible Defaults ====================

// Default instance using the concrete repository for backward compatibility.
// New code should use createChatBudgetFunctions() with injected dependencies.
import { getTodayTokenUsage, incrementTokenUsage } from "../database/chatTokenUsage/repository.js";

const defaultTokenUsageRepo: ChatTokenUsageRepositoryPort = {
  getTodayTokenUsage,
  incrementTokenUsage,
};

const defaultBudgetFunctions = createChatBudgetFunctions(defaultTokenUsageRepo);

/** @deprecated Use createChatBudgetFunctions() with injected dependencies instead. */
export const checkChatBudget = defaultBudgetFunctions.checkChatBudget;
/** @deprecated Use createChatBudgetFunctions() with injected dependencies instead. */
export const incrementChatTokenUsage = defaultBudgetFunctions.incrementChatTokenUsage;
