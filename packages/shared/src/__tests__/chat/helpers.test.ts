/**
 * Tests for chat/helpers — pure utility functions for the chat service.
 *
 * @module chat/helpers.test
 */

import { describe, it, expect } from "@jest/globals";
import { CHAT_DEFAULTS } from "../../constants/api.js";
import type {
  ChatLLMMessage,
  ChatContextData,
  ChatRAGResult,
  ChatRAGSource,
} from "../../chat/types.js";
import {
  estimateTokens,
  buildSystemPrompt,
  extractRAGSources,
  buildLLMMessages,
  trimMessagesToFit,
  deriveTitle,
  classifyMessageTopic,
} from "../../chat/helpers.js";

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
    expect(result).toContain("## Accepted URL Formats");
    expect(result).not.toContain("## Current Analysis Context");
    expect(result).not.toContain("## Current Incident Context");
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
    // Should only have the base prompt (which includes "## Accepted URL Formats"), no extra context sections
    expect(result).not.toContain("## Current Analysis Context");
    expect(result).not.toContain("## Current Incident Context");
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

  describe("invalid role filtering via VALID_LLM_ROLES", () => {
    it("should filter out 'tool' role from history", () => {
      const history = [
        { role: "user", content: "run diagnostics" },
        { role: "tool", content: "result: all clear" },
        { role: "assistant", content: "diagnostics passed" },
      ];
      const result = buildLLMMessages("sys", history, "thanks");

      // "tool" should be dropped: system + user + assistant + current user = 4
      expect(result).toHaveLength(4);
      expect(result.find((m) => m.role === ("tool" as string))).toBeUndefined();
    });

    it("should filter out unknown/arbitrary roles from history", () => {
      const history = [
        { role: "function", content: "fn result" },
        { role: "admin", content: "override" },
        { role: "user", content: "real message" },
      ];
      const result = buildLLMMessages("sys", history, "hi");

      // Only system (added), user (from history), user (current) should remain
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe("system");
      expect(result[1].role).toBe("user");
      expect(result[2].role).toBe("user");
    });

    it("should keep 'system' role from history since VALID_LLM_ROLES includes it", () => {
      // NOTE: VALID_LLM_ROLES = { "system", "user", "assistant" }
      // "system" IS a valid role and is preserved from history.
      // This means prompt injection via a "system" message in history is possible
      // — defense must happen upstream (e.g., repository should not store system messages).
      const history = [{ role: "system", content: "injected" }];
      const result = buildLLMMessages("real sys", history, "msg");

      // system (prepended) + system (from history — valid role) + user = 3
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ role: "system", content: "real sys" });
      expect(result[1]).toEqual({ role: "system", content: "injected" });
      expect(result[2]).toEqual({ role: "user", content: "msg" });
    });

    it("should produce empty history when all history roles are invalid", () => {
      const history = [
        { role: "tool", content: "tool output" },
        { role: "function", content: "fn output" },
        { role: "developer", content: "dev note" },
      ];
      const result = buildLLMMessages("sys", history, "hello");

      // All invalid roles filtered: system + user only
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: "system", content: "sys" });
      expect(result[1]).toEqual({ role: "user", content: "hello" });
    });
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

// ==================== classifyMessageTopic ====================

describe("classifyMessageTopic", () => {
  describe("on-topic messages (should return null)", () => {
    it("should return null for a build failure question", () => {
      expect(classifyMessageTopic("Why did my build fail?")).toBeNull();
    });

    it("should return null for a CI pipeline error question", () => {
      expect(classifyMessageTopic("How do I fix this CI pipeline error?")).toBeNull();
    });

    it("should return null for a kubernetes status question", () => {
      expect(classifyMessageTopic("What is the kubernetes pod status?")).toBeNull();
    });

    it("should return null for a deployment incident question", () => {
      expect(classifyMessageTopic("Explain this deployment incident")).toBeNull();
    });

    it("should return null when on-topic keyword overrides 'what is' pattern", () => {
      // "what is" normally matches trivia/unrelated_coding patterns,
      // but "build" and "error" are on-topic keywords
      expect(classifyMessageTopic("What is the build error in my PR?")).toBeNull();
    });

    it("should return null when on-topic keyword overrides 'calculate' pattern", () => {
      // "calculate" normally matches math pattern, but "pipeline" is on-topic
      expect(classifyMessageTopic("calculate the deployment time for my pipeline")).toBeNull();
    });

    it("should return null when on-topic keyword overrides unrelated_coding pattern", () => {
      // "how to sort a linked list" matches unrelated_coding, but "pipeline" overrides
      expect(classifyMessageTopic("how to sort a linked list in my CI pipeline")).toBeNull();
    });

    it("should return null for an empty string", () => {
      expect(classifyMessageTopic("")).toBeNull();
    });

    it("should return null for a whitespace-only string", () => {
      expect(classifyMessageTopic("   ")).toBeNull();
    });
  });

  describe("off-topic: math", () => {
    it("should return 'math' for a simple arithmetic expression", () => {
      expect(classifyMessageTopic("2+4")).toBe("math");
    });

    it("should return 'math' for 'what is' followed by arithmetic", () => {
      expect(classifyMessageTopic("what is 2+4")).toBe("math");
    });

    it("should return 'math' for division expression", () => {
      expect(classifyMessageTopic("100/5")).toBe("math");
    });
  });

  describe("off-topic: personal", () => {
    it("should return 'personal' for 'what is my name'", () => {
      expect(classifyMessageTopic("what is my name")).toBe("personal");
    });

    it("should return 'personal' for 'who am i'", () => {
      expect(classifyMessageTopic("who am i")).toBe("personal");
    });
  });

  describe("off-topic: meta_llm", () => {
    it("should return 'meta_llm' for 'what LLM are you using'", () => {
      expect(classifyMessageTopic("what LLM are you using")).toBe("meta_llm");
    });

    it("should return 'meta_llm' for 'are you GPT'", () => {
      expect(classifyMessageTopic("are you GPT")).toBe("meta_llm");
    });

    it("should return 'meta_llm' for 'what is your name'", () => {
      expect(classifyMessageTopic("what is your name")).toBe("meta_llm");
    });

    it("should return 'meta_llm' for 'who made you'", () => {
      expect(classifyMessageTopic("who made you")).toBe("meta_llm");
    });
  });

  describe("off-topic: trivia", () => {
    it("should return 'trivia' for 'what is the capital of France'", () => {
      expect(classifyMessageTopic("what is the capital of France")).toBe("trivia");
    });

    it("should return 'trivia' for 'tell me a joke'", () => {
      expect(classifyMessageTopic("tell me a joke")).toBe("trivia");
    });

    it("should return 'trivia' for 'write me a poem'", () => {
      expect(classifyMessageTopic("write me a poem")).toBe("trivia");
    });
  });

  describe("off-topic: unrelated_coding", () => {
    it("should return 'unrelated_coding' for 'write a function that sorts an array'", () => {
      expect(classifyMessageTopic("write a function that sorts an array")).toBe("unrelated_coding");
    });

    it("should return 'unrelated_coding' for 'explain recursion'", () => {
      expect(classifyMessageTopic("explain recursion")).toBe("unrelated_coding");
    });
  });

  describe("off-topic: general_knowledge", () => {
    it("should return 'general_knowledge' for 'translate hello to Spanish'", () => {
      expect(classifyMessageTopic("translate hello to Spanish")).toBe("general_knowledge");
    });
  });

  describe("case insensitivity", () => {
    it("should return 'personal' for uppercase 'WHAT IS MY NAME'", () => {
      expect(classifyMessageTopic("WHAT IS MY NAME")).toBe("personal");
    });

    it("should return 'math' for mixed case 'What Is 2+4'", () => {
      expect(classifyMessageTopic("What Is 2+4")).toBe("math");
    });

    it("should return 'meta_llm' for mixed case 'Are You GPT'", () => {
      expect(classifyMessageTopic("Are You GPT")).toBe("meta_llm");
    });
  });

  describe("on-topic keyword override edge cases", () => {
    it("should return null for 'write me a poem about kubernetes' because 'kubernetes' is an on-topic keyword", () => {
      // "write me a poem" matches the trivia pattern, but "kubernetes" is an on-topic
      // keyword that overrides the off-topic classification. This is a known tradeoff:
      // on-topic keywords are checked FIRST, so any message containing a DevOps keyword
      // will bypass off-topic detection even if the intent is clearly off-topic.
      expect(classifyMessageTopic("write me a poem about kubernetes")).toBeNull();
    });

    it("should return null for 'tell me a joke about docker' because 'docker' is an on-topic keyword", () => {
      // Same tradeoff — "tell me a joke" matches trivia, but "docker" overrides
      expect(classifyMessageTopic("tell me a joke about docker")).toBeNull();
    });

    it("should return null for 'what is the capital of Jenkins' because 'jenkins' is an on-topic keyword", () => {
      // "what is the capital of" matches trivia, but "jenkins" overrides
      expect(classifyMessageTopic("what is the capital of Jenkins")).toBeNull();
    });

    it("should return 'trivia' for 'write me a poem about flowers' (no on-topic keyword)", () => {
      // Control case: without an on-topic keyword, the off-topic pattern matches
      expect(classifyMessageTopic("write me a poem about flowers")).toBe("trivia");
    });
  });

  describe("edge cases (no pattern match, should return null)", () => {
    it("should return null for 'hello'", () => {
      expect(classifyMessageTopic("hello")).toBeNull();
    });

    it("should return null for 'how are you today'", () => {
      expect(classifyMessageTopic("how are you today")).toBeNull();
    });

    it("should return null for random gibberish", () => {
      expect(classifyMessageTopic("asdfghjkl qwerty zxcvbnm")).toBeNull();
    });
  });

  describe("immutability", () => {
    it("should not mutate the input string", () => {
      const input = Object.freeze("what is 2+4");
      expect(() => classifyMessageTopic(input)).not.toThrow();
    });
  });
});
