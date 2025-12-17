/**
 * Safety and confidence-related helpers.
 *
 * IMPORTANT:
 * - The AI (LLM) is treated as an untrusted helper.
 * - Its outputs must always be validated by deterministic logic before taking any side-effecting action.
 */

/**
 * Placeholder confidence scoring function for LLM results.
 * In the future, this could use heuristics or model-provided scores.
 *
 * @param result - The LLM result to score
 * @returns Confidence score between 0 and 1
 */
export function confidenceScore(result: unknown): number {
  // TODO: Implement real confidence scoring.
  // For now we return a fixed medium confidence.
  return 0.5;
}

/**
 * Example helper that checks if we should act on an LLM suggestion.
 * Deterministic code should call this (or similar) before doing anything.
 *
 * @param result - The LLM result to evaluate
 * @param threshold - Minimum confidence threshold (default: 0.8)
 * @returns True if confidence is above threshold
 */
export function shouldActOnResult(result: unknown, threshold: number = 0.8): boolean {
  return confidenceScore(result) >= threshold;
}

