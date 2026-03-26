/**
 * LLM SDK Client Factory
 *
 * Centralised provider detection, base URL resolution, and OpenAI SDK
 * client instantiation. Every consumer that needs an OpenAI-compatible
 * client imports from here — no duplication of provider logic.
 *
 * @module llm/providers/llmProvider/clientFactory
 */

import OpenAI from "openai";
import { config } from "../../../core/config.js";
import { LLM_DEFAULTS, OPENROUTER_DEFAULTS } from "../../../constants/index.js";

// ==================== Provider Detection ====================

/**
 * Checks if the current LLM provider is OpenRouter.
 */
export const isOpenRouterProvider = (): boolean => {
  const provider = config.LLM_PROVIDER;
  return provider === "openrouter";
};

/**
 * Resolves the effective base URL for the LLM provider.
 * Returns undefined for direct OpenAI (uses SDK default).
 */
export const getEffectiveBaseUrl = (): string | undefined => {
  const explicitUrl = config.LLM_BASE_URL;
  if (explicitUrl) {
    return explicitUrl;
  }
  return isOpenRouterProvider() ? OPENROUTER_DEFAULTS.BASE_URL : undefined;
};

// ==================== Model Resolution ====================

/**
 * Resolves the effective LLM model name using the config chain.
 * Provider-agnostic — safe to call from service layer.
 *
 * Resolution order:
 * 1. LLM_MODEL env var (explicit override)
 * 2. OPENAI_MODEL env var (legacy compat)
 * 3. Provider-specific default (OpenRouter vs standard)
 */
export const resolveLLMModel = (): string =>
  config.LLM_MODEL ||
  config.OPENAI_MODEL ||
  (isOpenRouterProvider() ? OPENROUTER_DEFAULTS.MODEL : LLM_DEFAULTS.MODEL);

// ==================== Client Instantiation ====================

/**
 * Creates a fresh OpenAI SDK client instance.
 * Supports OpenRouter and other OpenAI-compatible providers via base URL override.
 *
 * @param timeout - Optional SDK-level timeout in milliseconds
 * @returns Configured OpenAI SDK client
 */
export const createLLMSDKClient = (timeout?: number): OpenAI => {
  const baseURL = getEffectiveBaseUrl();
  const apiKey = config.OPENAI_API_KEY;

  return new OpenAI({
    apiKey,
    ...(timeout !== undefined && { timeout }),
    ...(baseURL !== undefined && { baseURL }),
  });
};

// ==================== Lazy Singleton ====================

// let: lazy-initialized singleton, assigned once on first call
let singletonClient: OpenAI | null = null;

/**
 * Returns a shared singleton OpenAI SDK client (no SDK-level timeout).
 * Use this for adapters that enforce their own hard timeout via Promise.race.
 */
export const getLLMSDKClient = (): OpenAI => {
  if (!singletonClient) {
    singletonClient = createLLMSDKClient();
  }
  return singletonClient;
};

/**
 * Resets the singleton client. Useful for testing or reconfiguration.
 */
export const resetLLMSDKClient = (): void => {
  singletonClient = null;
};
