/**
 * LLM Extraction Adapter
 *
 * Wraps the LLM SDK for chunk extraction operations.
 * Uses the shared LLM client factory which supports OpenRouter
 * and other compatible providers.
 * Keeps vendor SDK out of the service layer per CLAUDE.md.
 *
 * @module adapters/llmExtraction
 */

import { getLLMSDKClient, withTimeout } from "@kenchi/shared";
import type { ExtractionOptions, ExtractorFunction } from "./llmExtractionTypes.js";

export type { ExtractionOptions, ExtractorFunction };

// ==================== Extractor Factory ====================

/**
 * Creates an extractor function for chunk artifact extraction.
 */
export const createLLMExtractor = (): ExtractorFunction => {
  const client = getLLMSDKClient();

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

    const response = await withTimeout(
      apiCall,
      options.timeoutMs,
      `Extraction timeout after ${String(options.timeoutMs)}ms`
    );
    return response.choices[0]?.message?.content ?? "[]";
  };
};
