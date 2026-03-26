/**
 * Chat Budget Guard
 *
 * Fail-open budget checking and usage tracking for chat completions.
 * Wraps the budget port with safe error handling so budget failures
 * never block the chat flow.
 *
 * @module chat/chatBudgetGuard
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import type { RequestContext } from "../core/types.js";
import type { ChatBudgetPort, BudgetGuardResult } from "./types.js";

const logger = createLogger("chat-budget-guard");

/**
 * Checks budget status (fail-open).
 * Returns exhaustion status and optional warning chunk.
 * Budget check errors are logged and swallowed — chat proceeds.
 */
export const checkBudgetGuard = async (
  budgetPort: ChatBudgetPort | undefined,
  tenantId: string,
  planTier: string | undefined,
  context: RequestContext
): Promise<BudgetGuardResult> => {
  if (!budgetPort || !planTier) {
    return { exhausted: false };
  }

  try {
    const budget = await budgetPort.checkBudget(tenantId, planTier, context);

    if (budget.isExhausted) {
      return {
        exhausted: true,
        exhaustionMessage:
          "You have reached your daily chat token budget. Please try again tomorrow or upgrade your plan.",
      };
    }

    return budget.isWarning
      ? {
          exhausted: false,
          warning: {
            type: "budget_warning",
            ratioUsed: budget.ratioUsed,
            remaining: budget.remaining,
          },
        }
      : { exhausted: false };
  } catch (error: unknown) {
    logger.warn("Budget check failed — proceeding without enforcement", {
      error: getErrorMessage(error),
      ...context,
    });
    return { exhausted: false };
  }
};

/**
 * Increments budget usage (fail-open).
 * Errors are logged and swallowed — budget tracking never blocks chat.
 */
export const incrementBudgetSafe = async (
  budgetPort: ChatBudgetPort | undefined,
  tenantId: string,
  planTier: string | undefined,
  totalTokens: number,
  conversationId: string,
  context: RequestContext
): Promise<void> => {
  if (!budgetPort || !planTier) {
    return;
  }

  try {
    await budgetPort.incrementUsage(tenantId, totalTokens, context);
  } catch (error: unknown) {
    logger.warn("Budget increment skipped", {
      error: getErrorMessage(error),
      conversationId,
      ...context,
    });
  }
};
