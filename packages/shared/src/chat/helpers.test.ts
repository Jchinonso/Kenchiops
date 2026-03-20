/**
 * Tests for chat/helpers — pure utility functions for the chat service.
 *
 * @module chat/helpers.test
 */

import { describe, it, expect } from "@jest/globals";
import { CHAT_DEFAULTS } from "../constants/api.js";
import type { ChatLLMMessage, ChatContextData, ChatRAGResult, ChatRAGSource } from "./types.js";
import {
  estimateTokens,
  buildSystemPrompt,
  extractRAGSources,
  buildLLMMessages,
  trimMessagesToFit,
  deriveTitle,
} from "./helpers.js";

// ==================== Fixtures ====================

const createContextData = (overrides: Partial<ChatContextData> = {}): ChatContextData => ({
  entityType: "analysis",
  title: "Build failed on main",
  summary: "TypeScript compilation error",
  details: "**Root Cause:** Missing type export",
  ...overrides,
});

const createRAGResult = (overrides: Partial<ChatRAGResult> = {}): ChatRAGResult => ({
  formattedContext: "## Relevant Knowledge Base Context\n\nSome docs here.",
  sources: [{ title: "Fix TS errors", docType: "resolution", similarity: 0.92 }],
  ...overrides,
});

const createMessage = (role: ChatLLMMessage["role"], content: string): ChatLLMMessage => ({
  role,
  content,
});

// ==================== estimateTokens ====================

describe("estimateTokens", () => {
  it("should return 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should return 1 for a short string under CHARS_PER_TOKEN", () => {
    // "hi" = 2 chars, ceil(2/4) = 1
    expect(estimateTokens("hi")).toBe(1);
  });

  it("should return correct estimate for a longer string", () => {
    // 100 chars / 4 = 25 tokens
    const text = "a".repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it("should ceil when not evenly divisible", () => {
    // 5 chars / 4 = 1.25 → 2
    expect(estimateTokens("hello")).toBe(2);
  });

  it("should handle a very long string", () => {
    const text = "x".repeat(100_000);
    expect(estimateTokens(text)).toBe(25_000);
  });

  it("should not mutate the input", () => {
    const input = Object.freeze("test string");
    expect(() => estimateTokens(input)).not.toThrow();
  });
});

// ==================== buildSystemPrompt ====================

describe("buildSystemPrompt", () => {
  it("should return only the base prompt when no context and no RAG", () => {
    const result = buildSystemPrompt(null, null);
    expect(result).toContain("Kenchi Copilot");
    expect(result).not.toContain("##");
  });

  it("should include analysis context section when pageContextData is provided", () => {
    const data = createContextData({ entityType: "analysis" });
    const result = buildSystemPrompt(data, null);
    expect(result).toContain("## Current Analysis Context");
    expect(result).toContain("**Title:** Build failed on main");
    expect(result).toContain("**Summary:** TypeScript compilation error");
    expect(result).toContain("**Details:**");
  });

  it("should include incident context section for incident entityType", () => {
    const data = createContextData({ entityType: "incident" });
    const result = buildSystemPrompt(data, null);
    expect(result).toContain("## Current Incident Context");
  });

  it("should include RAG context when ragResult is provided", () => {
    const rag = createRAGResult();
    const result = buildSystemPrompt(null, rag);
    expect(result).toContain("## Relevant Knowledge Base Context");
  });

  it("should include both context and RAG when both provided", () => {
    const data = createContextData();
    const rag = createRAGResult();
    const result = buildSystemPrompt(data, rag);
    expect(result).toContain("## Current Analysis Context");
    expect(result).toContain("## Relevant Knowledge Base Context");
  });

  it("should skip context section when summary and details are null", () => {
    const data = createContextData({ summary: null, details: null });
    const result = buildSystemPrompt(data, null);
    expect(result).toContain("**Title:** Build failed on main");
    expect(result).not.toContain("**Summary:**");
    expect(result).not.toContain("**Details:**");
  });

  it("should skip RAG section when formattedContext is empty string", () => {
    const rag: ChatRAGResult = { formattedContext: "", sources: [] };
    const result = buildSystemPrompt(null, rag);
    // Should only have the base prompt, no extra sections
    expect(result).not.toContain("##");
  });

  it("should not mutate inputs", () => {
    const data = Object.freeze(createContextData());
    const rag = Object.freeze(createRAGResult());
    expect(() => buildSystemPrompt(data, rag)).not.toThrow();
  });
});

// ==================== extractRAGSources ====================

describe("extractRAGSources", () => {
  it("should return empty array when ragResult is null", () => {
    expect(extractRAGSources(null)).toEqual([]);
  });

  it("should return empty array when ragResult has empty sources", () => {
    const rag: ChatRAGResult = { formattedContext: "", sources: [] };
    expect(extractRAGSources(rag)).toEqual([]);
  });

  it("should return sources from ragResult", () => {
    const sources: readonly ChatRAGSource[] = [
      { title: "Doc A", docType: "runbook", similarity: 0.85 },
      { title: "Doc B", docType: "resolution", similarity: 0.72 },
    ];
    const rag: ChatRAGResult = { formattedContext: "ctx", sources };
    expect(extractRAGSources(rag)).toEqual(sources);
  });
});

// ==================== buildLLMMessages ====================

describe("buildLLMMessages", () => {
  it("should build messages with empty history", () => {
    const result = buildLLMMessages("sys prompt", [], "Hello");
    expect(result).toEqual([
      { role: "system", content: "sys prompt" },
      { role: "user", content: "Hello" },
    ]);
  });

  it("should include history messages in order between system and user", () => {
    const history = [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ];
    const result = buildLLMMessages("sys", history, "second question");
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ role: "system", content: "sys" });
    expect(result[1]).toEqual({ role: "user", content: "first question" });
    expect(result[2]).toEqual({ role: "assistant", content: "first answer" });
    expect(result[3]).toEqual({ role: "user", content: "second question" });
  });

  it("should return a new array (not mutating inputs)", () => {
    const history = Object.freeze([Object.freeze({ role: "user", content: "q" })]);
    const result = buildLLMMessages("sys", history, "msg");
    expect(result).not.toBe(history);
    expect(result).toHaveLength(3);
  });

  it("should preserve role types from history", () => {
    const history = [{ role: "assistant", content: "response" }];
    const result = buildLLMMessages("sys", history, "user msg");
    expect(result[1].role).toBe("assistant");
  });
});

// ==================== trimMessagesToFit ====================

describe("trimMessagesToFit", () => {
  it("should return messages unchanged when under budget", () => {
    const messages: readonly ChatLLMMessage[] = [
      createMessage("system", "short"),
      createMessage("user", "hello"),
    ];
    const result = trimMessagesToFit(messages, 10_000);
    expect(result).toBe(messages); // Same reference — no trimming needed
  });

  it("should return messages unchanged when at exactly the budget", () => {
    // Create messages that total exactly the token budget
    const content = "a".repeat(CHAT_DEFAULTS.CHARS_PER_TOKEN); // 1 token
    const messages: readonly ChatLLMMessage[] = [
      createMessage("system", content),
      createMessage("user", content),
    ];
    // 2 tokens total, budget = 2
    const result = trimMessagesToFit(messages, 2);
    expect(result).toBe(messages);
  });

  it("should trim oldest history messages when over budget", () => {
    // Each message is 100 tokens. 6 messages = 600 tokens total.
    const longContent = "a".repeat(CHAT_DEFAULTS.CHARS_PER_TOKEN * 100); // 100 tokens each
    const messages: readonly ChatLLMMessage[] = [
      createMessage("system", longContent),
      createMessage("user", longContent),
      createMessage("assistant", longContent),
      createMessage("user", longContent),
      createMessage("assistant", longContent),
      createMessage("user", longContent),
    ];
    // Budget of 250 → system (100) + at most 1 more (100) = 200, need to drop some
    const result = trimMessagesToFit(messages, 250);
    // Should always keep system (first)
    expect(result[0].role).toBe("system");
    // Should have fewer messages
    expect(result.length).toBeLessThan(messages.length);
  });

  it("should not trim below MIN_MESSAGES_TO_KEEP", () => {
    const minKeep = CHAT_DEFAULTS.MIN_MESSAGES_TO_KEEP;
    // Create exactly MIN_MESSAGES_TO_KEEP messages, all very long
    const longContent = "a".repeat(CHAT_DEFAULTS.CHARS_PER_TOKEN * 10_000);
    const messages: readonly ChatLLMMessage[] = Array.from({ length: minKeep }, (_, i) =>
      createMessage(i === 0 ? "system" : "user", longContent)
    );
    // Budget is tiny — but should not drop below min
    const result = trimMessagesToFit(messages, 1);
    expect(result).toBe(messages); // length <= minKeep → returned as-is
  });

  it("should keep system message first after trimming", () => {
    const longContent = "a".repeat(CHAT_DEFAULTS.CHARS_PER_TOKEN * 500);
    const messages: readonly ChatLLMMessage[] = [
      createMessage("system", "sys prompt"),
      createMessage("user", longContent),
      createMessage("assistant", longContent),
      createMessage("user", longContent),
      createMessage("assistant", longContent),
      createMessage("user", "latest"),
    ];
    const result = trimMessagesToFit(messages, 300);
    expect(result[0]).toEqual({ role: "system", content: "sys prompt" });
  });

  it("should not mutate the original messages array", () => {
    const longContent = "a".repeat(CHAT_DEFAULTS.CHARS_PER_TOKEN * 500);
    const messages: readonly ChatLLMMessage[] = Object.freeze([
      createMessage("system", "sys"),
      createMessage("user", longContent),
      createMessage("assistant", longContent),
      createMessage("user", longContent),
      createMessage("assistant", longContent),
      createMessage("user", "latest"),
    ]);
    expect(() => trimMessagesToFit(messages, 100)).not.toThrow();
  });
});

// ==================== deriveTitle ====================

describe("deriveTitle", () => {
  const maxLen = CHAT_DEFAULTS.MAX_TITLE_LENGTH;

  it("should return the message as-is when shorter than max length", () => {
    expect(deriveTitle("Short title")).toBe("Short title");
  });

  it("should return the message when exactly max length", () => {
    const exactLength = "a".repeat(maxLen);
    expect(deriveTitle(exactLength)).toBe(exactLength);
  });

  it("should truncate with ellipsis when over max length", () => {
    const longMessage = "a".repeat(maxLen + 50);
    const result = deriveTitle(longMessage);
    expect(result).toHaveLength(maxLen);
    expect(result.endsWith("...")).toBe(true);
  });

  it("should trim leading and trailing whitespace before checking length", () => {
    expect(deriveTitle("  hello  ")).toBe("hello");
  });

  it("should handle empty string", () => {
    expect(deriveTitle("")).toBe("");
  });

  it("should handle whitespace-only string", () => {
    expect(deriveTitle("   ")).toBe("");
  });

  it("should handle string of exactly max length after trimming", () => {
    const padded = "  " + "b".repeat(maxLen) + "  ";
    expect(deriveTitle(padded)).toHaveLength(maxLen);
  });
});
