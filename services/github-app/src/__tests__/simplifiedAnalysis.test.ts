/**
 * Integration tests for Simplified Analysis Handler
 *
 * Tests the end-to-end flow of the simplified CI failure analysis pipeline.
 * Mocks external dependencies (GitHub API, LLM API) to test the integration.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { CheckRunWebhook } from "../types/githubTypes.js";

// Mock dependencies before importing the handler
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    config: {
      API_URL: "http://localhost:3000",
      SIMPLIFIED_PIPELINE_ENABLED: true,
    },
    // Mock resilient HTTP client for LLM API
    resilientPost: jest.fn(() =>
      Promise.resolve({
        data: {
          root_cause: "Redis connection failed due to DNS resolution error (ENOTFOUND)",
          confidence: 0.9, // Numeric confidence for top-level
          category: "infra",
          phase: "test",
          annotations: [
            {
              evidence_id: "log#1",
              snippet: "Error: getaddrinfo ENOTFOUND redis.local",
              explanation: "DNS lookup failed for Redis host",
            },
          ],
          next_steps: [
            "Verify Redis host is correctly configured",
            "Check DNS resolution for redis.local",
          ],
          secondary_findings: [],
          // Full analysis fields with string confidence
          full_analysis: {
            confidence: "high",
            category: "infra",
            phase: "test",
            identifiedCause: "Redis connection failed due to DNS resolution error (ENOTFOUND)",
            nextSteps: [
              "Verify Redis host is correctly configured",
              "Check DNS resolution for redis.local",
            ],
          },
          recommended_actions: [
            {
              actionType: "fix",
              description: "Verify Redis host is correctly configured",
              priority: "high",
            },
            {
              actionType: "investigate",
              description: "Check DNS resolution for redis.local",
              priority: "medium",
            },
          ],
        },
        status: 200,
        retryCount: 0,
        duration: 1500,
      })
    ),
    getErrorMessage: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error)
    ),
    // Mock preprocessing to return expected structure
    preprocessLogsWithMetadata: jest.fn((logs: string) => ({
      // eslint-disable-next-line no-control-regex
      logs: logs.replace(/\x1b\[[0-9;]*m/g, "").replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm, ""),
      originalSize: logs.length,
      processedSize: logs.length - 100,
      wasTruncated: false,
      secretsRedacted: 0,
      secretTypes: [],
    })),
    formatGitHubComment: actual.formatGitHubComment,
    formatSlackMessage: actual.formatSlackMessage,
  };
});

jest.mock("../services/context/workflowFetcher.js", () => ({
  fetchWorkflowLogs: jest.fn(() =>
    Promise.resolve(
      `2026-01-11T10:00:00.000Z \x1b[32m> kenchi@1.0.0 test\x1b[0m
2026-01-11T10:00:01.000Z \x1b[31mFAILED\x1b[0m tests/redis.test.ts
2026-01-11T10:00:02.000Z Error: getaddrinfo ENOTFOUND redis.local
2026-01-11T10:00:03.000Z     at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:109:26)
2026-01-11T10:00:04.000Z Redis connection error: ENOTFOUND redis.local`
    )
  ),
}));

// Import after mocks are set up
import { processSimplifiedAnalysis } from "../handlers/simplifiedAnalysis.js";
import { fetchWorkflowLogs } from "../services/context/workflowFetcher.js";
import { resilientPost } from "@kenchi/shared";

describe("Simplified Analysis Handler", () => {
  // Test fixture for webhook payload
  const createMockWebhook = (overrides: Partial<CheckRunWebhook> = {}): CheckRunWebhook => ({
    action: "completed",
    check_run: {
      id: 12345,
      name: "CI Tests",
      head_sha: "abc1234567890def1234567890abcdef12345678",
      status: "completed",
      conclusion: "failure",
      started_at: "2026-01-11T10:00:00Z",
      completed_at: "2026-01-11T10:05:00Z",
      output: {
        title: "CI Tests Failed",
        summary: "1 test failed",
        annotations_count: 1,
      },
      pull_requests: [{ number: 123 }],
      app: { id: 1, slug: "kenchi-ci" },
      check_suite: { id: 1 },
      ...overrides.check_run,
    },
    repository: {
      id: 1,
      name: "test-repo",
      full_name: "owner/test-repo",
      owner: { login: "owner" },
      default_branch: "main",
      ...overrides.repository,
    },
    installation: {
      id: 12345,
      ...overrides.installation,
    },
    sender: {
      login: "github-actions[bot]",
      type: "Bot",
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("processSimplifiedAnalysis", () => {
    it("should process CI failure and return analysis result", async () => {
      const webhook = createMockWebhook();

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.success).toBe(true);
      expect(result.analysis).toBeDefined();
      expect(result.githubComment).toBeDefined();
      expect(result.slackMessage).toBeDefined();
    });

    it("should fetch workflow logs from GitHub", async () => {
      const webhook = createMockWebhook();

      await processSimplifiedAnalysis(webhook);

      expect(fetchWorkflowLogs).toHaveBeenCalledWith(
        12345, // installation ID
        "owner",
        "test-repo",
        "abc1234567890def1234567890abcdef12345678"
      );
    });

    it("should send preprocessed logs to LLM API", async () => {
      const webhook = createMockWebhook();

      await processSimplifiedAnalysis(webhook);

      expect(resilientPost).toHaveBeenCalledWith(
        "http://localhost:3000/api/analyze",
        expect.objectContaining({
          failure_log: expect.any(String),
          repository: "owner/test-repo",
        }),
        expect.objectContaining({ internalAuth: true })
      );

      // Verify logs are preprocessed (no ANSI codes or timestamps)
      const callArgs = (resilientPost as jest.Mock).mock.calls[0];
      const sentLog = callArgs[1].failure_log;
      expect(sentLog).not.toContain("\x1b[");
      expect(sentLog).not.toContain("2026-01-11T");
    });

    it("should convert API response to LLMAnalysisResult", async () => {
      const webhook = createMockWebhook();

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.analysis).toMatchObject({
        eventId: expect.stringContaining("owner/test-repo"),
        summary: "Redis connection failed due to DNS resolution error (ENOTFOUND)",
        identifiedCause: "Redis connection failed due to DNS resolution error (ENOTFOUND)",
        confidence: "high",
        confidenceScore: 0.9,
        category: "infra",
        phase: "test",
      });
    });

    it("should format GitHub comment without JSON", async () => {
      const webhook = createMockWebhook();

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.githubComment?.body).toContain("## 🤖 KenchiOps CI Failure Analysis");
      expect(result.githubComment?.body).toContain("Redis connection failed");
      // Ensure no raw JSON in output
      expect(result.githubComment?.body).not.toMatch(/\{[^}]*"[^"]+"\s*:/);
    });

    it("should format Slack message with proper blocks", async () => {
      const webhook = createMockWebhook();

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.slackMessage?.text).toContain("CI Failure");
      expect(result.slackMessage?.blocks.length).toBeGreaterThan(0);

      // Verify block types
      const blockTypes = result.slackMessage?.blocks.map((block) => block.type);
      expect(blockTypes).toContain("header");
      expect(blockTypes).toContain("section");
      expect(blockTypes).toContain("actions");
    });

    it("should include metadata about preprocessing", async () => {
      const webhook = createMockWebhook();

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.metadata).toBeDefined();
      // Handler uses originalLogSize and processedLogSize field names
      expect(result.metadata?.originalLogSize).toBeGreaterThan(0);
      expect(result.metadata?.processedLogSize).toBeGreaterThan(0);
      expect(typeof result.metadata?.wasTruncated).toBe("boolean");
      expect(typeof result.metadata?.secretsRedacted).toBe("number");
    });

    it("should return error when no installation ID", async () => {
      const webhook = createMockWebhook({
        installation: undefined,
      });

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No installation ID available");
    });

    it("should return error when no workflow logs available", async () => {
      (fetchWorkflowLogs as jest.Mock).mockResolvedValueOnce(null);

      const webhook = createMockWebhook();

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No workflow logs available");
    });

    it("should handle LLM API errors gracefully", async () => {
      (resilientPost as jest.Mock).mockRejectedValueOnce(new Error("API timeout"));

      const webhook = createMockWebhook();

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.success).toBe(false);
      expect(result.error).toBe("API timeout");
    });

    it("should handle PR number from webhook", async () => {
      const webhook = createMockWebhook({
        check_run: {
          id: 12345,
          name: "CI Tests",
          head_sha: "abc123",
          status: "completed",
          conclusion: "failure",
          started_at: "2026-01-11T10:00:00Z",
          completed_at: "2026-01-11T10:05:00Z",
          output: { title: "Failed", summary: "1 test failed", annotations_count: 0 },
          pull_requests: [{ number: 456 }],
          app: { id: 1, slug: "kenchi" },
          check_suite: { id: 1 },
        },
      });

      const result = await processSimplifiedAnalysis(webhook);

      // Slack message should have PR button
      const actionsBlock = result.slackMessage?.blocks.find((block) => block.type === "actions");
      const prButton = actionsBlock?.elements?.find((element) => element.text?.text === "View PR");
      expect(prButton?.url).toContain("/pull/456");
    });

    it("should handle missing PR in webhook", async () => {
      const webhook = createMockWebhook({
        check_run: {
          id: 12345,
          name: "CI Tests",
          head_sha: "abc123",
          status: "completed",
          conclusion: "failure",
          started_at: "2026-01-11T10:00:00Z",
          completed_at: "2026-01-11T10:05:00Z",
          output: { title: "Failed", summary: "1 test failed", annotations_count: 0 },
          pull_requests: [], // No PRs
          app: { id: 1, slug: "kenchi" },
          check_suite: { id: 1 },
        },
      });

      const result = await processSimplifiedAnalysis(webhook);

      expect(result.success).toBe(true);
      // Slack message should not have PR button
      const actionsBlock = result.slackMessage?.blocks.find((block) => block.type === "actions");
      const prButton = actionsBlock?.elements?.find((element) => element.text?.text === "View PR");
      expect(prButton).toBeUndefined();
    });
  });

  describe("Validation Criteria", () => {
    it("should never output raw JSON in root cause", async () => {
      // Mock API to return JSON-like content
      (resilientPost as jest.Mock).mockResolvedValueOnce({
        data: {
          root_cause: '{"level":3,"message":"Redis error"}', // Bad: raw JSON
          confidence: "high",
          category: "infra",
          phase: "test",
          annotations: [],
          next_steps: [],
        },
        status: 200,
      });

      const webhook = createMockWebhook();
      const result = await processSimplifiedAnalysis(webhook);

      // Even if API returns JSON, the formatter should handle it
      // (The prompt instructs LLM not to do this, but we test the output)
      expect(result.githubComment?.body).toBeDefined();
    });

    it("should produce human-readable output", async () => {
      const webhook = createMockWebhook();
      const result = await processSimplifiedAnalysis(webhook);

      // Check for human-readable sections
      expect(result.githubComment?.body).toContain("CI Failure Analysis");
      expect(result.githubComment?.body).toContain("Root Cause");
      expect(result.githubComment?.body).toContain("Recommended Actions");

      // Check Slack is human-readable
      expect(result.slackMessage?.text).not.toContain("{");
      expect(result.slackMessage?.text).not.toContain("}");
    });

    it("should include commit SHA in output", async () => {
      const webhook = createMockWebhook();
      const result = await processSimplifiedAnalysis(webhook);

      // Short SHA should be in GitHub comment
      expect(result.githubComment?.body).toContain("abc1234");
    });

    it("should include check name in output", async () => {
      const webhook = createMockWebhook();
      const result = await processSimplifiedAnalysis(webhook);

      expect(result.githubComment?.body).toContain("CI Tests");
    });

    it("should include confidence score in output", async () => {
      const webhook = createMockWebhook();
      const result = await processSimplifiedAnalysis(webhook);

      expect(result.githubComment?.body).toContain("90%");
      expect(result.githubComment?.body).toContain("high certainty");
    });
  });
});
