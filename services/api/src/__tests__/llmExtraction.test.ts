/**
 * Unit tests for LLM Extraction Adapter
 *
 * Tests the extractor factory, timeout behavior, and provider configuration.
 * Mocks getLLMSDKClient and withTimeout from @kenchi/shared to isolate
 * the adapter from real LLM SDK and timer behavior.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockCreate = jest.fn();

const mockLLMClient = {
  chat: {
    completions: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
};

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    getLLMSDKClient: jest.fn(() => mockLLMClient),
    config: {
      OPENAI_API_KEY: "test-api-key",
      LLM_PROVIDER: "openai",
      LLM_BASE_URL: "",
      LLM_MODEL: "gpt-4o-mini",
      EXTRACTION_MODEL: "",
    },
  };
});

// Import after mock setup
import { createLLMExtractor } from "../adapters/llmExtraction.js";
import type { ExtractionOptions, ExtractorFunction } from "../adapters/llmExtraction.js";

// ==================== Tests ====================

describe("LLM Extraction Adapter", () => {
  // let: reassigned in beforeEach for fresh extractor per test
  let extractor: ExtractorFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    extractor = createLLMExtractor();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== createLLMExtractor ====================

  describe("createLLMExtractor", () => {
    it("should return a function", () => {
      expect(typeof extractor).toBe("function");
    });

    it("should call OpenAI chat completions with correct parameters", async () => {
      jest.useRealTimers();
      const mockResponse = {
        choices: [{ message: { content: '[{"type": "test_failure"}]' } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const options: ExtractionOptions = {
        timeoutMs: 30000,
        model: "gpt-4o-mini",
      };

      await extractor("system prompt", "user prompt", options);

      expect(mockCreate).toHaveBeenCalledWith(
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "system prompt" },
            { role: "user", content: "user prompt" },
          ],
          temperature: 0,
        },
        { timeout: 30000 }
      );
    });

    it("should return message content from response", async () => {
      jest.useRealTimers();
      const mockResponse = {
        choices: [{ message: { content: '[{"type": "build_error"}]' } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const options: ExtractionOptions = {
        timeoutMs: 30000,
        model: "gpt-4o-mini",
      };

      const result = await extractor("system", "user", options);

      expect(result).toBe('[{"type": "build_error"}]');
    });

    it("should return empty array string when response content is null", async () => {
      jest.useRealTimers();
      const mockResponse = {
        choices: [{ message: { content: null } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const options: ExtractionOptions = {
        timeoutMs: 30000,
        model: "gpt-4o-mini",
      };

      const result = await extractor("system", "user", options);

      expect(result).toBe("[]");
    });

    it("should return empty array string when choices array is empty", async () => {
      jest.useRealTimers();
      const mockResponse = { choices: [] };
      mockCreate.mockResolvedValue(mockResponse);

      const options: ExtractionOptions = {
        timeoutMs: 30000,
        model: "gpt-4o-mini",
      };

      const result = await extractor("system", "user", options);

      expect(result).toBe("[]");
    });

    it("should propagate API errors", async () => {
      jest.useRealTimers();
      mockCreate.mockRejectedValue(new Error("Rate limit exceeded"));

      const options: ExtractionOptions = {
        timeoutMs: 30000,
        model: "gpt-4o-mini",
      };

      await expect(extractor("system", "user", options)).rejects.toThrow("Rate limit exceeded");
    });

    it("should use specified model in API call", async () => {
      jest.useRealTimers();
      const mockResponse = {
        choices: [{ message: { content: "[]" } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const options: ExtractionOptions = {
        timeoutMs: 30000,
        model: "anthropic/claude-3.5-haiku",
      };

      await extractor("system", "user", options);

      const callArgs = mockCreate.mock.calls[0] as unknown[];
      const requestBody = callArgs[0] as { model: string };
      expect(requestBody.model).toBe("anthropic/claude-3.5-haiku");
    });

    it("should pass timeout to SDK options", async () => {
      jest.useRealTimers();
      const mockResponse = {
        choices: [{ message: { content: "[]" } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const options: ExtractionOptions = {
        timeoutMs: 60000,
        model: "gpt-4o-mini",
      };

      await extractor("system", "user", options);

      const callArgs = mockCreate.mock.calls[0] as unknown[];
      const sdkOptions = callArgs[1] as { timeout: number };
      expect(sdkOptions.timeout).toBe(60000);
    });
  });

  // ==================== withHardTimeout (via extractor) ====================

  describe("hard timeout behavior", () => {
    it("should reject with timeout error when API call exceeds timeout", async () => {
      // Create a promise that never resolves to simulate a hanging API call
      mockCreate.mockReturnValue(new Promise(() => {}));

      const options: ExtractionOptions = {
        timeoutMs: 1000,
        model: "gpt-4o-mini",
      };

      const extractionPromise = extractor("system", "user", options);

      // Advance timers past the timeout
      jest.advanceTimersByTime(1001);

      await expect(extractionPromise).rejects.toThrow("Extraction timeout after 1000ms");
    });

    it("should resolve normally when API call completes before timeout", async () => {
      jest.useRealTimers();
      const mockResponse = {
        choices: [{ message: { content: "result" } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const options: ExtractionOptions = {
        timeoutMs: 30000,
        model: "gpt-4o-mini",
      };

      const result = await extractor("system", "user", options);

      expect(result).toBe("result");
    });
  });

  // ==================== ExtractionOptions type ====================

  describe("ExtractionOptions", () => {
    it("should accept valid options", async () => {
      jest.useRealTimers();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "[]" } }],
      });

      const options: ExtractionOptions = {
        timeoutMs: 5000,
        model: "test-model",
      };

      // Should not throw
      await expect(extractor("system", "user", options)).resolves.toBe("[]");
    });
  });
});
