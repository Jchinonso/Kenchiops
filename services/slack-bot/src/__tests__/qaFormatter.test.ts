/**
 * Unit tests for Q&A Response Formatter.
 * Tests Slack Block Kit message formatting for RAG search results.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  formatQAResponse,
  formatSearchingMessage,
  formatQAErrorMessage,
} from "../formatters/qaFormatter.js";
import type { QASearchResponse, QASearchResult } from "../services/qaService.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  QA_ACTION_IDS: {
    QA_HELPFUL: "qa_feedback_helpful",
    QA_NOT_HELPFUL: "qa_feedback_not_helpful",
  },
  QA_MESSAGES: {
    NO_RESULTS: "I couldn't find any relevant information in our knowledge base for that question.",
    QUERY_TOO_SHORT: "Please provide a more detailed question (at least 10 characters).",
    SEARCHING: "Searching our knowledge base...",
    SEARCH_ERROR: "Sorry, I encountered an error while searching. Please try again.",
  },
  QA_CONFIG: {
    MAX_DISPLAY_QUERY_LENGTH: 50,
  },
  UI_CONSTANTS: {
    PERCENTAGE_MULTIPLIER: 100,
  },
  UI_EMOJI: {
    success: "✅",
    warning: "⚠️",
    error: "❌",
    thumbsUp: "👍",
    thumbsDown: "👎",
    book: "📚",
    mag: "🔎",
    hourglass: "⏳",
    document: "📄",
    runbook: "📘",
    postmortem: "📋",
    troubleshooting: "🔧",
    sop: "📝",
    branch: "🌿",
    chat: "💬",
    lesson: "🎓",
    external: "🌐",
    num1: "1️⃣",
    num2: "2️⃣",
    num3: "3️⃣",
    num4: "4️⃣",
    num5: "5️⃣",
  },
  DOC_TYPE_EMOJI_MAP: {
    runbook: "📘",
    postmortem: "📋",
    troubleshooting: "🔧",
    sop: "📝",
    pr_fix: "🌿",
    slack_resolution: "💬",
    analysis_lesson: "🎓",
    pr_diff: "📄",
    external: "🌐",
  } as Record<string, string>,
  NUMBER_EMOJI_LIST: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"],
}));

describe("Q&A Formatter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test fixtures
  const createMockResult = (overrides: Partial<QASearchResult> = {}): QASearchResult => ({
    id: "doc-1",
    title: "How to Restart Services",
    snippet: "Step 1: Stop the service using systemctl stop\nStep 2: Start the service",
    sourceUrl: "https://docs.example.com/restart",
    docType: "runbook",
    similarity: 0.85,
    sourceType: "knowledge",
    ...overrides,
  });

  const createMockResponse = (overrides: Partial<QASearchResponse> = {}): QASearchResponse => ({
    success: true,
    query: "how do I restart the service?",
    results: [createMockResult()],
    totalFound: 5,
    cacheHit: false,
    ...overrides,
  });

  describe("formatQAResponse", () => {
    describe("successful responses with results", () => {
      it("should return array of blocks", () => {
        const response = createMockResponse();
        const blocks = formatQAResponse(response, "qa-123");

        expect(Array.isArray(blocks)).toBe(true);
        expect(blocks.length).toBeGreaterThan(0);
      });

      it("should include header with book emoji", () => {
        const response = createMockResponse();
        const blocks = formatQAResponse(response, "qa-123");

        const headerBlock = blocks.find((block) => block.type === "header");
        expect(headerBlock).toBeDefined();
        expect(JSON.stringify(headerBlock)).toContain("Knowledge Base Results");
      });

      it("should include result title with link when sourceUrl provided", () => {
        const response = createMockResponse({
          results: [
            createMockResult({
              title: "Restart Guide",
              sourceUrl: "https://docs.example.com/guide",
            }),
          ],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Restart Guide");
        expect(content).toContain("https://docs.example.com/guide");
      });

      it("should include result title without link when no sourceUrl", () => {
        const response = createMockResponse({
          results: [
            createMockResult({
              title: "No Link Guide",
              sourceUrl: undefined,
            }),
          ],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("No Link Guide");
      });

      it("should include snippet as quoted text", () => {
        const response = createMockResponse({
          results: [
            createMockResult({
              snippet: "This is the snippet content",
            }),
          ],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("This is the snippet content");
      });

      it("should include doc type label with emoji", () => {
        const response = createMockResponse({
          results: [createMockResult({ docType: "runbook" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Runbook");
      });

      it("should include similarity score as percentage", () => {
        const response = createMockResponse({
          results: [createMockResult({ similarity: 0.85 })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("85% match");
      });

      it("should format postmortem doc type", () => {
        const response = createMockResponse({
          results: [createMockResult({ docType: "postmortem" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Postmortem");
      });

      it("should format troubleshooting doc type", () => {
        const response = createMockResponse({
          results: [createMockResult({ docType: "troubleshooting" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Troubleshooting");
      });

      it("should format pr_diff doc type", () => {
        const response = createMockResponse({
          results: [createMockResult({ docType: "pr_diff" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Pr Diff");
      });

      it("should include number emoji for results", () => {
        const response = createMockResponse({
          results: [createMockResult(), createMockResult({ id: "doc-2" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("1️⃣");
        expect(content).toContain("2️⃣");
      });

      it("should include dividers between results", () => {
        const response = createMockResponse({
          results: [
            createMockResult(),
            createMockResult({ id: "doc-2" }),
            createMockResult({ id: "doc-3" }),
          ],
        });
        const blocks = formatQAResponse(response, "qa-123");

        const dividers = blocks.filter((block) => block.type === "divider");
        expect(dividers.length).toBeGreaterThan(0);
      });

      it("should include footer with metadata", () => {
        const response = createMockResponse({
          totalFound: 10,
          results: [createMockResult(), createMockResult({ id: "doc-2" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Found 10 relevant documents");
        expect(content).toContain("Showing top 2");
      });

      it("should include cache indicator when cacheHit is true", () => {
        const response = createMockResponse({ cacheHit: true });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("cached");
      });

      it("should not include cache indicator when cacheHit is false", () => {
        const response = createMockResponse({ cacheHit: false });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).not.toContain("cached");
      });

      it("should include feedback buttons", () => {
        const response = createMockResponse();
        const blocks = formatQAResponse(response, "qa-123");

        const actionsBlock = blocks.find((block) => block.type === "actions");
        expect(actionsBlock).toBeDefined();
      });

      it("should include helpful button with correct action_id", () => {
        const response = createMockResponse();
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("qa_feedback_helpful");
        expect(content).toContain("Helpful");
      });

      it("should include not helpful button with correct action_id", () => {
        const response = createMockResponse();
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("qa_feedback_not_helpful");
        expect(content).toContain("Not helpful");
      });

      it("should include queryId in feedback button values", () => {
        const response = createMockResponse();
        const blocks = formatQAResponse(response, "custom-query-id-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("custom-query-id-123");
      });
    });

    describe("no results", () => {
      it("should show no results message when empty", () => {
        const response = createMockResponse({
          results: [],
          totalFound: 0,
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("I couldn't find any relevant information");
      });

      it("should include query context in no results message", () => {
        const response = createMockResponse({
          query: "how do I restart?",
          results: [],
          totalFound: 100,
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Searched 100 documents");
        expect(content).toContain("how do I restart?");
      });

      it("should truncate long queries in no results message", () => {
        const longQuery =
          "how do I restart the service after a long failure that requires many steps to fix?";
        const response = createMockResponse({
          query: longQuery,
          results: [],
          totalFound: 0,
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        // Should truncate at 50 characters
        expect(content).toContain("...");
      });

      it("should not show feedback buttons for no results", () => {
        const response = createMockResponse({
          results: [],
        });
        const blocks = formatQAResponse(response, "qa-123");

        const actionsBlock = blocks.find((block) => block.type === "actions");
        expect(actionsBlock).toBeUndefined();
      });
    });

    describe("error responses", () => {
      it("should show error message when success is false", () => {
        const response = createMockResponse({
          success: false,
          error: "Database connection failed",
          results: [],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Database connection failed");
      });

      it("should include warning emoji for errors", () => {
        const response = createMockResponse({
          success: false,
          error: "Search failed",
          results: [],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("⚠️");
      });

      it("should not show feedback buttons for errors", () => {
        const response = createMockResponse({
          success: false,
          error: "Error",
          results: [],
        });
        const blocks = formatQAResponse(response, "qa-123");

        const actionsBlock = blocks.find((block) => block.type === "actions");
        expect(actionsBlock).toBeUndefined();
      });
    });

    describe("multiple results", () => {
      it("should format multiple results correctly", () => {
        const response = createMockResponse({
          results: [
            createMockResult({ id: "doc-1", title: "First Doc" }),
            createMockResult({ id: "doc-2", title: "Second Doc" }),
            createMockResult({ id: "doc-3", title: "Third Doc" }),
          ],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("First Doc");
        expect(content).toContain("Second Doc");
        expect(content).toContain("Third Doc");
      });

      it("should show number emojis in order", () => {
        const response = createMockResponse({
          results: [
            createMockResult({ id: "doc-1" }),
            createMockResult({ id: "doc-2" }),
            createMockResult({ id: "doc-3" }),
          ],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        // Check that number emojis appear in correct positions
        const firstIndex = content.indexOf("1️⃣");
        const secondIndex = content.indexOf("2️⃣");
        const thirdIndex = content.indexOf("3️⃣");

        expect(firstIndex).toBeLessThan(secondIndex);
        expect(secondIndex).toBeLessThan(thirdIndex);
      });
    });

    describe("edge cases", () => {
      it("should handle empty title", () => {
        const response = createMockResponse({
          results: [createMockResult({ title: "" })],
        });

        expect(() => formatQAResponse(response, "qa-123")).not.toThrow();
      });

      it("should handle empty snippet", () => {
        const response = createMockResponse({
          results: [createMockResult({ snippet: "" })],
        });

        expect(() => formatQAResponse(response, "qa-123")).not.toThrow();
      });

      it("should handle special characters in title", () => {
        const response = createMockResponse({
          results: [createMockResult({ title: "Fix <script>alert('xss')</script>" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Fix");
      });

      it("should handle newlines in snippet", () => {
        const response = createMockResponse({
          results: [createMockResult({ snippet: "Line 1\nLine 2\nLine 3" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Line 1");
        expect(content).toContain("Line 2");
      });

      it("should handle unicode in results", () => {
        const response = createMockResponse({
          results: [
            createMockResult({
              title: "日本語タイトル",
              snippet: "内容はこちらです 🎉",
            }),
          ],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("日本語タイトル");
      });

      it("should handle zero similarity", () => {
        const response = createMockResponse({
          results: [createMockResult({ similarity: 0 })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("0% match");
      });

      it("should handle 100% similarity", () => {
        const response = createMockResponse({
          results: [createMockResult({ similarity: 1.0 })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("100% match");
      });

      it("should handle unknown doc type", () => {
        const response = createMockResponse({
          results: [createMockResult({ docType: "unknown_type" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        // Should format as title case
        expect(content).toContain("Unknown Type");
      });

      it("should handle doc type with underscores", () => {
        const response = createMockResponse({
          results: [createMockResult({ docType: "some_custom_type" })],
        });
        const blocks = formatQAResponse(response, "qa-123");
        const content = JSON.stringify(blocks);

        expect(content).toContain("Some Custom Type");
      });

      it("should handle very long title", () => {
        const longTitle = "A".repeat(500);
        const response = createMockResponse({
          results: [createMockResult({ title: longTitle })],
        });

        expect(() => formatQAResponse(response, "qa-123")).not.toThrow();
      });

      it("should handle very long snippet", () => {
        const longSnippet = "B".repeat(2000);
        const response = createMockResponse({
          results: [createMockResult({ snippet: longSnippet })],
        });

        expect(() => formatQAResponse(response, "qa-123")).not.toThrow();
      });
    });
  });

  describe("formatSearchingMessage", () => {
    it("should return array of blocks", () => {
      const blocks = formatSearchingMessage();

      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should include searching message", () => {
      const blocks = formatSearchingMessage();
      const content = JSON.stringify(blocks);

      expect(content).toContain("Searching our knowledge base");
    });

    it("should include hourglass emoji", () => {
      const blocks = formatSearchingMessage();
      const content = JSON.stringify(blocks);

      expect(content).toContain("⏳");
    });

    it("should return section block", () => {
      const blocks = formatSearchingMessage();

      expect(blocks[0].type).toBe("section");
    });
  });

  describe("formatQAErrorMessage", () => {
    it("should return array of blocks", () => {
      const blocks = formatQAErrorMessage("Test error");

      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should include error message", () => {
      const blocks = formatQAErrorMessage("Connection timeout");
      const content = JSON.stringify(blocks);

      expect(content).toContain("Connection timeout");
    });

    it("should include warning emoji", () => {
      const blocks = formatQAErrorMessage("Error");
      const content = JSON.stringify(blocks);

      expect(content).toContain("⚠️");
    });

    it("should include Error header", () => {
      const blocks = formatQAErrorMessage("Something went wrong");
      const content = JSON.stringify(blocks);

      expect(content).toContain("Error");
    });

    it("should include retry suggestion", () => {
      const blocks = formatQAErrorMessage("Failed");
      const content = JSON.stringify(blocks);

      expect(content).toContain("try again");
    });

    it("should handle empty error message", () => {
      const blocks = formatQAErrorMessage("");

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle special characters in error", () => {
      const blocks = formatQAErrorMessage("Error: <&> special");
      const content = JSON.stringify(blocks);

      expect(content).toContain("Error:");
    });

    it("should handle very long error message", () => {
      const longError = "E".repeat(1000);
      const blocks = formatQAErrorMessage(longError);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle unicode in error message", () => {
      const blocks = formatQAErrorMessage("エラー: データベース接続失敗");
      const content = JSON.stringify(blocks);

      expect(content).toContain("エラー");
    });

    it("should include context block with instructions", () => {
      const blocks = formatQAErrorMessage("Error");

      const contextBlock = blocks.find((block) => block.type === "context");
      expect(contextBlock).toBeDefined();
    });
  });

  describe("block structure validation", () => {
    it("should have valid block types", () => {
      const response = createMockResponse();
      const blocks = formatQAResponse(response, "qa-123");

      const validTypes = ["header", "section", "context", "divider", "actions"];
      blocks.forEach((block) => {
        expect(validTypes).toContain(block.type);
      });
    });

    it("should have text property on section blocks", () => {
      const response = createMockResponse();
      const blocks = formatQAResponse(response, "qa-123");

      const sectionBlocks = blocks.filter((block) => block.type === "section");
      sectionBlocks.forEach((block) => {
        expect(block).toHaveProperty("text");
      });
    });

    it("should have elements property on actions blocks", () => {
      const response = createMockResponse();
      const blocks = formatQAResponse(response, "qa-123");

      const actionsBlocks = blocks.filter((block) => block.type === "actions");
      actionsBlocks.forEach((block) => {
        expect(block).toHaveProperty("elements");
      });
    });

    it("should have elements property on context blocks", () => {
      const response = createMockResponse({
        results: [],
        totalFound: 0,
      });
      const blocks = formatQAResponse(response, "qa-123");

      const contextBlocks = blocks.filter((block) => block.type === "context");
      contextBlocks.forEach((block) => {
        expect(block).toHaveProperty("elements");
      });
    });

    it("should have text property on header blocks", () => {
      const response = createMockResponse();
      const blocks = formatQAResponse(response, "qa-123");

      const headerBlocks = blocks.filter((block) => block.type === "header");
      headerBlocks.forEach((block) => {
        expect(block).toHaveProperty("text");
      });
    });
  });
});
