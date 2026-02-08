/**
 * OpenAI Extraction Adapter
 *
 * Wraps OpenAI SDK for chunk extraction operations.
 * Supports OpenRouter and other OpenAI-compatible providers.
 * Keeps vendor SDK out of the service layer per CLAUDE.md.
 *
 * @module adapters/openaiExtraction
 */

import OpenAI from "openai";
import { config, OPENROUTER_DEFAULTS } from "@kenchi/shared";

// ==================== Types ====================

/**
 * Options for extraction calls.
 */
export interface ExtractionOptions {
  readonly timeoutMs: number;
  readonly model: string;
}

/**
 * Extractor function signature.
 */
export type ExtractorFunction = (
  systemPrompt: string,
  userPrompt: string,
  options: ExtractionOptions
) => Promise<string>;

// ==================== Provider Configuration ====================

/**
 * Checks if we're using OpenRouter provider.
 */
const isOpenRouterProvider = (): boolean => config.LLM_PROVIDER === "openrouter";

/**
 * Gets the effective base URL for the LLM provider.
 */
const getEffectiveBaseUrl = (): string | undefined => {
  if (config.LLM_BASE_URL) {
    return config.LLM_BASE_URL;
  }
  if (isOpenRouterProvider()) {
    return OPENROUTER_DEFAULTS.BASE_URL;
  }
  return undefined;
};

// ==================== Singleton Client ====================

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

// ==================== Timeout Utilities ====================

/**
 * Wraps a promise with a hard timeout using Promise.race.
 * Guarantees the promise resolves or rejects within timeoutMs,
 * since the OpenAI SDK timeout is not reliably enforced.
 */
const withHardTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Extraction timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);

// ==================== Extractor Factory ====================

/**
 * Creates an extractor function for chunk artifact extraction.
 */
export const createOpenAIExtractor = (): ExtractorFunction => {
  const client = getClient();

  return async (
    systemPrompt: string,
    userPrompt: string,
    options: ExtractionOptions
  ): Promise<string> => {
    const apiCall = client.chat.completions.create(
      {
        model: options.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
      },
      { timeout: options.timeoutMs }
    );

    const response = await withHardTimeout(apiCall, options.timeoutMs);
    return response.choices[0]?.message?.content ?? "[]";
  };
};
