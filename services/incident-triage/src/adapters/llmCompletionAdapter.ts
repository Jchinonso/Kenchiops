/**
 * LLM Completion Adapter
 *
 * Implements the LLMCompletionPort using the OpenAI SDK (compatible with
 * OpenRouter and other providers). Keeps vendor SDK calls isolated per CLAUDE.md.
 *
 * Uses lazy-initialized singleton client and hard timeout via Promise.race
 * since the OpenAI SDK timeout is unreliable.
 *
 * @module adapters/llmCompletionAdapter
 */

import OpenAI from "openai";
import {
  config,
  OPENROUTER_DEFAULTS,
  createLogger,
  ExternalServiceError,
  getErrorMessage,
  type RequestContext,
} from "@kenchi/shared";
import type { LLMCompletionPort, LLMCompletionOptions } from "../types/summaryTypes.js";

// ==================== Provider Configuration ====================

const isOpenRouterProvider = (): boolean => config.LLM_PROVIDER === "openrouter";

const getEffectiveBaseUrl = (): string | undefined => {
  if (config.LLM_BASE_URL) {
    return config.LLM_BASE_URL;
  }
  return isOpenRouterProvider() ? OPENROUTER_DEFAULTS.BASE_URL : undefined;
};

// ==================== Singleton Client ====================

// let: lazy-initialized singleton, assigned once on first call
let clientInstance: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (!clientInstance) {
    const baseURL = getEffectiveBaseUrl();
    clientInstance = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      ...(baseURL && { baseURL }),
    });
  }
  return clientInstance;
};

// ==================== Hard Timeout ====================

/**
 * Wraps a promise with a hard timeout using Promise.race.
 * Guarantees the promise resolves or rejects within timeoutMs,
 * since the OpenAI SDK timeout is not reliably enforced.
 */
const withHardTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`LLM completion timeout after ${String(timeoutMs)}ms`)),
        timeoutMs
      );
    }),
  ]);

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
    const client = getClient();

    const temperature = options.temperature ?? 0;
    const maxTokens = options.maxTokens ?? OPENROUTER_DEFAULTS.MAX_TOKENS;

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

      const response = await withHardTimeout(apiCall, options.timeoutMs);
      const durationMs = Date.now() - startTime;
      const content = response.choices[0]?.message?.content ?? "";

      adapterLogger.info("LLM completion succeeded", {
        provider: "openai",
        operation: "generateTriageSummary",
        durationMs,
        model: options.model,
        responseLength: content.length,
        ...context,
      });

      return content;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      const isTimeout = errorMsg.includes("timeout");

      adapterLogger.error("LLM completion failed", {
        provider: "openai",
        operation: "generateTriageSummary",
        durationMs,
        model: options.model,
        category: isTimeout ? "retryable" : "unknown",
        retryable: isTimeout,
        ...context,
      });

      throw new ExternalServiceError("openai", `LLM completion failed: ${errorMsg}`, {
        retryable: isTimeout,
      });
    }
  },
});
