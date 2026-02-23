/**
 * LLM Completion Port
 *
 * Re-exports the port interface defined in summaryTypes.
 * Adapters implement this interface to keep vendor SDKs out of services.
 *
 * @module ports/llmCompletionPort
 */

export type { LLMCompletionPort, LLMCompletionOptions } from "../types/summaryTypes.js";
