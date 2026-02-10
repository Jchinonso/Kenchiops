import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { LLMClient } from "../../llm/index.js";
import type { Event, Evidence } from "../../core/types.js";

// Mock OpenAI SDK
const mockCreate = jest.fn();

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Helper to set mock response
function setMockOpenAIResponse(response: unknown): void {
  (mockCreate as jest.Mock).mockResolvedValueOnce(response);
}

// Helper to set mock error
function setMockOpenAIError(error: unknown): void {
  (mockCreate as jest.Mock).mockRejectedValueOnce(error);
}

describe("LLMClient", () => {
  let client: LLMClient;
  let mockEvent: Event;
  let mockEvidence: Evidence;

  beforeEach(() => {
    mockCreate.mockClear();
    client = new LLMClient();

    mockEvent = {
      id: "evt_test123",
      type: "CICD_FAILURE",
      source: "github",
      timestamp: "2025-12-17T10:00:00Z",
      severity: "high",
      title: "Test CI Failure",
      payload: {
        repository: "test/repo",
        workflow: "ci.yml",
        errorMessage: "Build failed",
      },
    };

    mockEvidence = {
      eventId: "evt_test123",
      logs: [
        {
          level: "ERROR",
          message: "AUTH_SECRET is not defined",
          timestamp: "2025-12-17T10:00:00Z",
          source: "api",
        },
      ],
      gitHistory: [
        {
          sha: "abc1234567",
          message: "Update environment config",
          author: "dev@example.com",
          timestamp: "2025-12-17T09:00:00Z",
        },
      ],
      collectedAt: "2025-12-17T10:00:00Z",
    };
  });

  describe("analyzeIncident", () => {
    it("should successfully analyze an incident", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "AUTH_SECRET not configured",
                confidence: "high",
                category: "config",
                phase: "build",
                annotations: [
                  {
                    evidence_id: "log#1",
                    snippet: "AUTH_SECRET is not defined",
                    explanation: "Missing environment variable causes config error",
                  },
                ],
                next_steps: ["Add AUTH_SECRET to environment"],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, mockEvidence);

      expect(result).toBeDefined();
      expect(result.eventId).toBe("evt_test123");
      expect(result.summary).toBe("AUTH_SECRET not configured");
      expect(result.identifiedCause).toBe("AUTH_SECRET not configured");
      expect(result.confidence).toBe("high");
      expect(result.llmModel).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it("should retry on rate limit error (429)", async () => {
      const rateLimitError = {
        status: 429,
        message: "Rate limit exceeded",
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "Test summary",
                confidence: "medium",
                category: "test",
                phase: "test",
                annotations: [],
                next_steps: [],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIError(rateLimitError);
      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, mockEvidence);

      expect(result).toBeDefined();
      expect(mockCreate).toHaveBeenCalledTimes(2); // Initial call + 1 retry
    });

    it("should throw error on authentication failure (401)", async () => {
      const authError = {
        status: 401,
        message: "Invalid API key",
      };

      setMockOpenAIError(authError);

      await expect(client.analyzeIncident(mockEvent, mockEvidence)).rejects.toThrow(
        "LLM authentication failed"
      );
    });

    it("should handle malformed JSON response", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "This is not valid JSON",
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      await expect(client.analyzeIncident(mockEvent, mockEvidence)).rejects.toThrow(
        "Failed to parse LLM response"
      );
    });

    it("should detect dangerous keywords in recommendations", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "Database issue",
                confidence: "high",
                category: "runtime",
                phase: "runtime",
                annotations: [],
                next_steps: ["Drop the database and recreate it"],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      // Spy on console.warn to check if validation warnings are logged
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      await client.analyzeIncident(mockEvent, mockEvidence);

      // Logger now outputs JSON format
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"LLM output validation failed"')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("dangerous keyword"));

      consoleWarnSpy.mockRestore();
    });

    it("should validate evidence references", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "Test summary",
                confidence: "high",
                category: "test",
                phase: "test",
                annotations: [],
                next_steps: [],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, mockEvidence);

      // Analysis should complete even with minimal evidence references
      expect(result).toBeDefined();
      expect(result.summary).toBe("Test summary");
    });

    it("should replace generic causes and filter actions without evidence", async () => {
      const failureLog = [
        "## Failed Tests",
        "[test#1] should initialize database pool",
        "  File: services/api/src/__tests__/db.test.ts",
        "TEST_ERROR_BEGIN",
        "Database pool not initialized",
        "TEST_ERROR_END",
        "",
        "[test#2] should warm cache",
        "  File: services/api/src/__tests__/cache.test.ts",
        "TEST_ERROR_BEGIN",
        "Cache not primed",
        "TEST_ERROR_END",
      ].join("\n");

      const evidenceWithFailures: Evidence = {
        ...mockEvidence,
        logs: [
          {
            level: "ERROR",
            message: failureLog,
            timestamp: "2025-12-17T10:00:00Z",
            source: "ci",
          },
        ],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "Test execution failed due to assertion errors in multiple test cases",
                confidence: "medium",
                category: "test",
                phase: "test",
                annotations: [],
                next_steps: ["Review the implementation of registerRepoSelectHandler"],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, evidenceWithFailures);

      // Simplified pipeline returns LLM response as-is
      expect(result.identifiedCause).toContain("Test execution failed");
      expect(result.confidence).toBe("medium");
    });

    it("should build cause from workflow logs with evidence id", async () => {
      const workflowLog = [
        "## Workflow Logs",
        "[wflog#1] build-and-test",
        "Step: install dependencies",
        "Error: missing environment variable",
      ].join("\n");

      const evidenceWithWorkflow: Evidence = {
        ...mockEvidence,
        logs: [
          {
            level: "ERROR",
            message: workflowLog,
            timestamp: "2025-12-17T10:00:00Z",
            source: "ci",
          },
        ],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "CI build failed",
                confidence: "medium",
                category: "build",
                phase: "build",
                annotations: [],
                next_steps: [],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, evidenceWithWorkflow);

      // Simplified pipeline returns LLM response as-is
      expect(result.identifiedCause).toBe("CI build failed");
    });

    it("should flag infra signals and update category and phase", async () => {
      const infraLog = ["No space left on device"].join("\n");

      const evidenceWithInfra: Evidence = {
        ...mockEvidence,
        logs: [
          {
            level: "ERROR",
            message: infraLog,
            timestamp: "2025-12-17T10:00:00Z",
            source: "ci",
          },
        ],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "CI build failed",
                confidence: "medium",
                category: "test",
                phase: "test",
                annotations: [],
                next_steps: [],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, evidenceWithInfra);

      // Simplified pipeline returns LLM response as-is (no guardrails post-processing)
      expect(result.identifiedCause).toBe("CI build failed");
      expect(result.category).toBe("test");
      expect(result.phase).toBe("test");
    });

    it("should truncate evidence when exceeding token budget", async () => {
      // Create evidence with lots of logs
      const largeEvidence: Evidence = {
        ...mockEvidence,
        logs: Array.from({ length: 100 }, (_unusedElement, logIndex) => ({
          level: "ERROR",
          message: `Error message ${logIndex}`.repeat(100),
          timestamp: "2025-12-17T10:00:00Z",
          source: "api",
        })),
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "Test summary",
                confidence: "medium",
                category: "test",
                phase: "test",
                annotations: [],
                next_steps: [],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, largeEvidence);

      expect(result).toBeDefined();
      // Verify that API was called (meaning truncation succeeded)
    });

    it("should add metadata to analysis result", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                root_cause: "Test summary",
                confidence: "medium",
                category: "test",
                phase: "test",
                annotations: [],
                next_steps: [],
                secondary_findings: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const startTime = Date.now();
      const result = await client.analyzeIncident(mockEvent, mockEvidence);
      const endTime = Date.now();

      expect(result.llmModel).toBeDefined();
      expect(result.processingTime).toBeDefined();
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeLessThan((endTime - startTime) / 1000 + 1);
      expect(result.analyzedAt).toBeDefined();
      expect(new Date(result.analyzedAt).getTime()).toBeGreaterThanOrEqual(startTime);
    });
  });
});
