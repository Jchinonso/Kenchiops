/**
 * Chat Finalization
 *
 * Post-stream operations: persist assistant message, track budget usage,
 * and trim conversation history. All operations are fail-safe.
 *
 * @module chat/chatFinalize
 */

import type { RequestContext } from "../core/types.js";
import type { FinalizeCompletionInput } from "./types.js";
import { persistAssistantMessage, trimConversationSafe } from "./chatConversation.js";
import { incrementBudgetSafe } from "./chatBudgetGuard.js";

/**
 * Runs all post-stream operations: persist, budget, trim.
 *
 * @returns The assistant token count (for logging/metrics).
 */
export const finalizeCompletion = async (
  input: FinalizeCompletionInput,
  context: RequestContext
): Promise<number> => {
  const assistantTokenCount = await persistAssistantMessage(
    input.chatRepository,
    input.conversationId,
    input.tenantId,
    input.content,
    input.ragContextUsed,
    context
  );

  await incrementBudgetSafe(
    input.budgetPort,
    input.tenantId,
    input.planTier,
    input.userTokenCount + assistantTokenCount,
    input.conversationId,
    context
  );

  await trimConversationSafe(input.chatRepository, input.conversationId, context);

  return assistantTokenCount;
};
