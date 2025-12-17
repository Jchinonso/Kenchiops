import { config } from "./config.js";

/**
 * OpenAIClient is a thin wrapper around OpenAI's API.
 *
 * IMPORTANT SAFETY NOTE:
 * - The LLM is treated as an untrusted helper.
 * - Its outputs MUST NOT be executed directly as code or commands.
 * - Deterministic application logic is responsible for validating and deciding
 *   whether to act on any suggestion.
 */
export class OpenAIClient {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = config.OPENAI_API_KEY;
  }

  /**
   * Stub method that will eventually call OpenAI's completion/chat API.
   *
   * @param prompt - The prompt to send to OpenAI
   * @returns A promise that resolves to a placeholder analysis string
   */
  async generateAnalysis(prompt: string): Promise<string> {
    // TODO: Implement actual OpenAI API call using this.apiKey and chosen model.
    // For now, we just return a deterministic dummy response.
    return Promise.resolve(
      `[DUMMY ANALYSIS] Received prompt: "${prompt}". This is a placeholder response from OpenAIClient.`
    );
  }
}

