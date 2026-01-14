/**
 * Unit tests for formatting/outputFormatter.ts
 *
 * Tests the output formatter for GitHub and Slack messages.
 */
import { describe, it, expect } from "@jest/globals";
import {
  formatGitHubComment,
  formatSlackMessage,
  type OutputContext,
} from "../../formatting/outputFormatter.js";
import type { LLMAnalysisResult } from "../../core/types.js";

describe("Output Formatter", () => {
  // Test fixtures
  const createMockAnalysis = (overrides: Partial<LLMAnalysisResult> = {}): LLMAnalysisResult => ({
    eventId: "test-event-123",
    summary: "Test failure summary",
    identifiedCause: "Redis connection failed due to DNS resolution error",
    confidence: "high",
    confidenceScore: 0.85,
    category: "infra",
    phase: "test",
    codeAnnotations: [
      {
        path: "services/redis/src/redis.ts",
        line: 42,
        level: "failure",
        message: "Connection refused",
        title: "ECONNREFUSED 127.0.0.1:6379",
      },
    ],
    nextSteps: ["Check Redis service is running", "Verify DNS configuration"],
    analyzedAt: "2026-01-11T10:00:00.000Z",
    ...overrides,
  });

  const createMockContext = (overrides: Partial<OutputContext> = {}): OutputContext => ({
    repository: "owner/repo",
    commitSha: "abc1234567890def",
    checkName: "CI Tests",
    prNumber: 123,
    ...overrides,
  });

  describe("formatGitHubComment", () => {
    it("should format a complete GitHub comment with rich header", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("## 🤖 KenchiOps CI Failure Analysis");
      expect(result.body).toContain("**Commit:** `abc1234`");
      expect(result.body).toContain("**Check:** CI Tests");
      expect(result.body).toContain("85%");
      expect(result.body).toContain("high certainty");
    });

    it("should include root cause section with emoji and category", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("### 🔍 Root Cause");
      expect(result.body).toContain("Redis connection failed due to DNS resolution error");
      expect(result.body).toContain("**Category:** infra");
      expect(result.body).toContain("**Phase:** test");
      expect(result.body).toContain("🏗️"); // infra emoji
    });

    it("should include affected files section grouped by service", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("### 📁 Affected Files");
      expect(result.body).toContain("services/redis");
      expect(result.body).toContain("❌");
    });

    it("should include recommended actions with numbered format", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("### 🛠️ Recommended Actions");
      expect(result.body).toContain("1. Check Redis service is running");
      expect(result.body).toContain("2. Verify DNS configuration");
    });

    it("should include feedback section", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("Was this analysis helpful?");
      expect(result.body).toContain("👍 Yes · 👎 No");
      expect(result.body).toContain("Share your fix");
    });

    it("should include footer", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("---");
      expect(result.body).toContain("KenchiOps DevOps Assistant");
    });

    it("should include branch name with backticks when provided", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext({ branchName: "feature/test-branch" });

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("**Branch:** `feature/test-branch`");
    });

    it("should show branch with arrow when both branch and base provided", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext({
        branchName: "feature/test-branch",
        baseBranch: "main",
      });

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("`feature/test-branch` → `main`");
    });

    it("should handle missing optional fields", () => {
      const analysis = createMockAnalysis({
        identifiedCause: undefined,
        codeAnnotations: undefined,
        nextSteps: undefined,
        confidenceScore: undefined,
      });
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("## 🤖 KenchiOps CI Failure Analysis");
      expect(result.body).toContain("0%");
      expect(result.body).toContain("Test failure summary");
    });

    it("should not include JSON in output", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).not.toMatch(/\{[^}]*"[^"]+"\s*:/);
    });

    it("should truncate long annotation messages", () => {
      const longMessage = "A".repeat(200);
      const analysis = createMockAnalysis({
        codeAnnotations: [
          {
            path: "src/file.ts",
            line: 1,
            level: "failure",
            message: longMessage,
            title: "Error",
          },
        ],
      });
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body.length).toBeLessThan(longMessage.length + 1000);
    });

    it("should group multiple annotations by service", () => {
      const analysis = createMockAnalysis({
        codeAnnotations: [
          { path: "services/api/src/a.ts", line: 1, level: "failure", message: "Error 1" },
          { path: "services/api/src/b.ts", line: 2, level: "failure", message: "Error 2" },
          { path: "packages/shared/src/c.ts", line: 3, level: "failure", message: "Error 3" },
        ],
      });
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("**services/api**");
      expect(result.body).toContain("**packages/shared**");
    });
  });

  describe("formatSlackMessage", () => {
    it("should format a complete Slack message with emoji", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      expect(result.text).toContain("🔴 CI Failure: owner/repo");
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    it("should include header block with emoji", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      const headerBlock = result.blocks.find((block) => block.type === "header");
      expect(headerBlock).toBeDefined();
      expect(headerBlock?.text?.text).toContain("🔴 CI Failure: owner/repo");
    });

    it("should include summary section with fields", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      const sectionBlock = result.blocks.find((block) => block.type === "section" && block.fields);
      expect(sectionBlock).toBeDefined();

      const fieldTexts = sectionBlock?.fields?.map((field) => field.text) ?? [];
      expect(fieldTexts.some((text) => text.includes("abc1234"))).toBe(true);
      expect(fieldTexts.some((text) => text.includes("CI Tests"))).toBe(true);
      expect(fieldTexts.some((text) => text.includes("85%"))).toBe(true);
      expect(fieldTexts.some((text) => text.includes("infra"))).toBe(true);
    });

    it("should include root cause section with emoji", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      const rootCauseBlock = result.blocks.find(
        (block) => block.type === "section" && block.text?.text?.includes("Root Cause")
      );
      expect(rootCauseBlock).toBeDefined();
      expect(rootCauseBlock?.text?.text).toContain("🔍 Root Cause");
      expect(rootCauseBlock?.text?.text).toContain("Redis connection failed");
    });

    it("should include quick actions section", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      const actionsBlock = result.blocks.find(
        (block) => block.type === "section" && block.text?.text?.includes("Quick Actions")
      );
      expect(actionsBlock).toBeDefined();
      expect(actionsBlock?.text?.text).toContain("Check Redis service");
    });

    it("should include action buttons", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      const actionsBlock = result.blocks.find((block) => block.type === "actions");
      expect(actionsBlock).toBeDefined();
      expect(actionsBlock?.elements?.length).toBeGreaterThan(0);
    });

    it("should include View PR button when prNumber provided", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext({ prNumber: 456 });

      const result = formatSlackMessage(analysis, context);

      const actionsBlock = result.blocks.find((block) => block.type === "actions");
      const prButton = actionsBlock?.elements?.find((element) => element.text?.text === "View PR");
      expect(prButton).toBeDefined();
      expect(prButton?.url).toContain("/pull/456");
    });

    it("should not include View PR button when prNumber not provided", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext({ prNumber: undefined });

      const result = formatSlackMessage(analysis, context);

      const actionsBlock = result.blocks.find((block) => block.type === "actions");
      const prButton = actionsBlock?.elements?.find((element) => element.text?.text === "View PR");
      expect(prButton).toBeUndefined();
    });

    it("should include View Logs button", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext({ prNumber: undefined });

      const result = formatSlackMessage(analysis, context);

      const actionsBlock = result.blocks.find((block) => block.type === "actions");
      const logsButton = actionsBlock?.elements?.find(
        (element) => element.text?.text === "View Logs"
      );
      expect(logsButton).toBeDefined();
      expect(logsButton?.url).toContain("/commit/abc1234567890def/checks");
    });

    it("should handle missing optional fields", () => {
      const analysis = createMockAnalysis({
        identifiedCause: undefined,
        nextSteps: undefined,
        confidenceScore: undefined,
      });
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      expect(result.text).toBeDefined();
      expect(result.blocks.length).toBeGreaterThan(0);
      expect(result.text).toContain("Test failure summary");
    });

    it("should provide plain text fallback with emoji", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      expect(result.text).toBe(
        "🔴 CI Failure: owner/repo - Redis connection failed due to DNS resolution error"
      );
    });

    it("should use summary when identifiedCause is missing", () => {
      const analysis = createMockAnalysis({
        identifiedCause: undefined,
        summary: "Build failed with exit code 1",
      });
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      expect(result.text).toContain("Build failed with exit code 1");
    });

    it("should include divider blocks", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext();

      const result = formatSlackMessage(analysis, context);

      const dividers = result.blocks.filter((block) => block.type === "divider");
      expect(dividers.length).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty annotations array", () => {
      const analysis = createMockAnalysis({ codeAnnotations: [] });
      const context = createMockContext();

      const githubResult = formatGitHubComment(analysis, context);
      const slackResult = formatSlackMessage(analysis, context);

      expect(githubResult.body).not.toContain("### 📁 Affected Files");
      expect(slackResult.blocks.length).toBeGreaterThan(0);
    });

    it("should handle empty nextSteps array", () => {
      const analysis = createMockAnalysis({ nextSteps: [] });
      const context = createMockContext();

      const githubResult = formatGitHubComment(analysis, context);
      const slackResult = formatSlackMessage(analysis, context);

      expect(githubResult.body).not.toContain("### 🛠️ Recommended Actions");

      const quickActionsBlock = slackResult.blocks.find((block) =>
        block.text?.text?.includes("Quick Actions")
      );
      expect(quickActionsBlock).toBeUndefined();
    });

    it("should handle very long root cause text", () => {
      const longCause = "A".repeat(500);
      const analysis = createMockAnalysis({ identifiedCause: longCause });
      const context = createMockContext();

      const slackResult = formatSlackMessage(analysis, context);

      const rootCauseBlock = slackResult.blocks.find((block) =>
        block.text?.text?.includes("Root Cause")
      );
      expect(rootCauseBlock?.text?.text?.length).toBeLessThan(longCause.length + 50);
    });

    it("should handle special characters in root cause", () => {
      const analysis = createMockAnalysis({
        identifiedCause: "Error: Cannot find module '@kenchi/shared'",
      });
      const context = createMockContext();

      const githubResult = formatGitHubComment(analysis, context);
      const slackResult = formatSlackMessage(analysis, context);

      expect(githubResult.body).toContain("@kenchi/shared");
      expect(slackResult.text).toContain("@kenchi/shared");
    });

    it("should handle unknown category and phase", () => {
      const analysis = createMockAnalysis({
        category: "unknown",
        phase: "unknown",
      });
      const context = createMockContext();

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("**Category:** unknown");
      expect(result.body).toContain("**Phase:** unknown");
      expect(result.body).toContain("❓"); // unknown emoji
    });

    it("should include check status when provided", () => {
      const analysis = createMockAnalysis();
      const context = createMockContext({
        passedChecks: ["Build"],
        failedChecks: ["Test"],
      });

      const result = formatGitHubComment(analysis, context);

      expect(result.body).toContain("✅ Build");
      expect(result.body).toContain("❌ Test");
    });
  });
});
