/**
 * Chat Preparation
 *
 * Runs all pre-stream steps: conversation creation, budget guard,
 * history loading, and pipeline building. Returns everything the
 * streaming step needs, or an error to short-circuit.
 *
 * @module chat/chatPrepare
 */

import type { RequestContext } from "../core/types.js";
import type {
  ChatCompletionInput,
  ChatStreamChunk,
  ChatRepositoryPort,
  ChatBudgetPort,
  ChatContextPort,
  PrepareCompletionResult,
} from "./types.js";
import { ensureConversation, loadHistoryAndSaveUserMessage } from "./chatConversation.js";
import { checkBudgetGuard } from "./chatBudgetGuard.js";
import { buildCompletionPipeline } from "./chatPipeline.js";

/**
 * Prepares everything needed before LLM streaming begins.
 *
 * Runs steps 1–4 of the chat pipeline:
 * 1. Ensure conversation exists
 * 2. Budget guard (fail-open)
 * 3. Load history, validate limits, save user message
 * 4. Build completion pipeline (off-topic or full)
 *
 * @returns Ok with prepared state + pre-stream chunks to emit, or error.
 */
export const prepareCompletion = async (
  chatRepository: ChatRepositoryPort,
  budgetPort: ChatBudgetPort | undefined,
  contextPort: ChatContextPort | undefined,
  input: ChatCompletionInput,
  context: RequestContext
): Promise<PrepareCompletionResult> => {
  // Step 1: Budget guard — checked BEFORE conversation creation to avoid orphaned records
  const budgetResult = await checkBudgetGuard(budgetPort, input.tenantId, input.planTier, context);
  if (budgetResult.exhausted) {
    return { ok: false, error: budgetResult.exhaustionMessage ?? "Budget exhausted." };
  }

  // Step 2: Ensure conversation
  const conversationResult = await ensureConversation(chatRepository, input, context);
  if (!conversationResult.ok) {
    return { ok: false, error: conversationResult.error };
  }

  const { conversationId } = conversationResult;

  // Step 3: Load history + validate + save user message
  const historyResult = await loadHistoryAndSaveUserMessage(
    chatRepository,
    conversationId,
    input.tenantId,
    input.userMessage,
    context
  );
  if (!historyResult.ok) {
    return { ok: false, error: historyResult.error };
  }

  // Step 4: Build completion pipeline
  const pipeline = await buildCompletionPipeline(
    contextPort,
    conversationId,
    input,
    historyResult.history,
    context
  );

  // Build pre-stream chunks immutably (at most 3 elements)
  const preStreamChunks: ReadonlyArray<ChatStreamChunk> = [
    ...(conversationResult.isNew
      ? [{ type: "conversation_created" as const, conversationId }]
      : []),
    ...(budgetResult.warning ? [budgetResult.warning] : []),
    ...(pipeline.ragSources.length > 0
      ? [{ type: "rag_sources" as const, sources: pipeline.ragSources }]
      : []),
  ];

  return {
    ok: true,
    state: {
      conversationId,
      pipeline,
      userTokenCount: historyResult.userTokenCount,
      preStreamChunks,
    },
  };
};
