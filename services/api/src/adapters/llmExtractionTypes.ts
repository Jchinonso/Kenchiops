/**
 * Types for LLM Extraction Adapter
 *
 * @module adapters/llmExtractionTypes
 */

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
