/**
 * LLM Completion Adapter
 *
 * Implements the LLMCompletionPort using the shared LLM client factory
 * (compatible with OpenRouter and other providers). Keeps vendor SDK
 * calls isolated per CLAUDE.md.
 *
 * Uses the shared singleton client and withTimeout (Promise.race)
 * since the OpenAI SDK timeout is unreliable.
 *
 * @module investigation/llmCompletionAdapter
 */

import { getLLMSDKClient } from "../llm/providers/llmProvider/clientFactory.js";
import { withTimeout } from "../core/utils.js";
import { OPENROUTER_DEFAULTS } from "../constants/llm.js";
import { createLogger } from "../core/logger.js";
import { ExternalServiceError, getErrorMessage } from "../core/errors.js";
import type { RequestContext } from "../core/types.js";
import type { LLMCompletionPort, LLMCompletionOptions } from "./types.js";

// ==================== Adapter Implementation ====================

/**
 * Creates an LLM completion adapter implementing the LLMCompletionPort interface.
 *
 * @returns LLMCompletionPort implementation backed by OpenAI SDK
 */
export const createLLMCompletionAdapter = (): LLMCompletionPort => ({
  complete: async (
    systemPrompt: string,
    userPrompt: string,
    options: LLMCompletionOptions,
    context: RequestContext
  ): Promise<string> => {
    const adapterLogger = createLogger("llm-completion-adapter");
    const startTime = Date.now();
    const client = getLLMSDKClient();

    const temperature = options.temperature ?? 0;
    const maxTokens = options.maxTokens ?? OPENROUTER_DEFAULTS.MAX_TOKENS;
    const operation = options.operationName ?? "investigationLLMCompletion";

    try {
      const apiCall = client.chat.completions.create(
        {
          model: options.model,
          messages: [
            { role: "system" as const, content: systemPrompt },
            { role: "user" as const, content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        },
        { timeout: options.timeoutMs }
      );

      const completionResult = await withTimeout(
        apiCall,
        options.timeoutMs,
        `LLM completion timeout after ${String(options.timeoutMs)}ms`
      );
      const durationMs = Date.now() - startTime;
      const content = completionResult.choices[0]?.message?.content ?? "";

      adapterLogger.info("LLM completion succeeded", {
        provider: "llm",
        operation,
        durationMs,
        model: options.model,
        responseLength: content.length,
        ...context,
      });

      return content;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      const statusCode = (error as { status?: number }).status;
      const isTimeout = errorMsg.includes("timeout");

      adapterLogger.error("LLM completion failed", {
        provider: "llm",
        operation,
        durationMs,
        statusCode,
        model: options.model,
        category: isTimeout ? "retryable" : "unknown",
        retryable: isTimeout,
        ...context,
      });

      throw new ExternalServiceError("llm", `LLM completion failed: ${errorMsg}`, {
        retryable: isTimeout,
        metadata: { statusCode, model: options.model },
      });
    }
  },
});
