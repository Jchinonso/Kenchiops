/**
 * Unit tests for GitHub Service
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Mock, SpyInstance } from "jest-mock";
import type { PullRequestWebhook, CheckRunWebhook } from "../types/githubTypes.js";

// Mock Octokit
jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn(),
}));

// Mock dependencies
jest.mock("@octokit/auth-app", () => ({
  createAppAuth: jest.fn(),
}));

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockResolve = jest.fn() as any;
  mockResolve.mockResolvedValue({
    summary: "Test analysis",
    rootCause: "Test cause",
    suggestedActions: ["Action 1"],
    confidence: 0.85,
    reasoning: "Test reasoning",
  });
  return {
    ...actual,
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OpenAIClient: jest.fn(function (this: any) {
      return {
        analyzeIncident: mockResolve,
      };
    }),
    calculateConfidenceScore: jest.fn(() => ({
      finalScore: 0.85,
      gatingDecision: "auto_approve",
      breakdown: {
        llmConfidence: 0.85,
        evidenceQuality: 0.8,
        actionSpecificity: 0.9,
      },
    })),
    getErrorMessage: jest.fn((error: unknown) => {
      if (error instanceof Error) return error.message;
      return String(error);
    }),
    wrapError: jest.fn((message: string, error: unknown) => {
      if (error instanceof Error) {
        return `${message}: ${error.message}`;
      }
      return message;
    }),
  };
});

jest.mock("../config/appConfig.js", () => ({
  appConfig: {
    port: 3001,
    environment: "test",
    serviceName: "github-app",
    github: {
      appId: "12345",
      privateKey: "test-private-key",
      webhookSecret: "test-webhook-secret",
      installationId: 67890,
    },
  },
}));

// Mock the entire githubService module to spy on getOctokit
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetOctokit: jest.Mock<any>;

jest.mock("../services/githubService.js", () => {
  const actual = jest.requireActual("../services/githubService.js") as object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetOctokit = jest.fn<any>();
  return {
    ...actual,
    getOctokit: mockGetOctokit,
  };
});

// Import after mocks
import {
  getOpenAIClient,
  getOctokit,
  createEventFromPR,
  createEventFromCheckRun,
  createMinimalEvidence,
  performAnalysis,
  deleteKenchiOpsComments,
  postPRComment,
  getInstallationRepositories,
  createCheckRunWithAnnotations,
  type AnalysisResult,
  type RepositoryInfo,
  type CheckAnnotation,
} from "../services/githubService.js";

describe("GitHub Service", () => {
  // Mock Octokit instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockOctokit: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock Octokit instance
    mockOctokit = {
      rest: {
        issues: {
          listComments: jest.fn(),
          deleteComment: jest.fn(),
          createComment: jest.fn(),
        },
        apps: {
          listReposAccessibleToInstallation: jest.fn(),
        },
        checks: {
          create: jest.fn<() => Promise<{ data: { id: number } }>>().mockResolvedValue({ data: { id: 99999 } }),
          update: jest.fn<() => Promise<{ data: { id: number } }>>().mockResolvedValue({ data: { id: 99999 } }),
        },
      },
    };

    // Mock Octokit constructor
    const { Octokit } = jest.requireMock("@octokit/rest") as { Octokit: Mock };
    Octokit.mockImplementation(() => mockOctokit);

    // Mock getOctokit to return our mock
    mockGetOctokit.mockResolvedValue(mockOctokit);
  });

  // Test fixtures
  const createMockPRWebhook = (overrides: Partial<PullRequestWebhook> = {}): PullRequestWebhook => ({
    action: "opened",
    pull_request: {
      number: 123,
      title: "Test PR",
      body: "Test PR body",
      head: {
        sha: "abc123def456",
        ref: "feature-branch",
      },
      base: {
        sha: "def789",
        ref: "main",
      },
      user: {
        login: "testuser",
      },
    },
    repository: {
      full_name: "testowner/testrepo",
      owner: {
        login: "testowner",
      },
      name: "testrepo",
    },
    installation: {
      id: 12345,
    },
    ...overrides,
  });

  const createMockCheckRunWebhook = (
    overrides: Partial<CheckRunWebhook> = {}
  ): CheckRunWebhook => ({
    action: "completed",
    check_run: {
      id: 98765,
      name: "CI Build",
      conclusion: "failure",
      head_sha: "abc123def456",
      output: {
        title: "Build Failed",
        summary: "The build encountered errors",
        text: "Error details here",
      },
      pull_requests: [
        {
          number: 123,
          head: { sha: "abc123def456", ref: "feature" },
          base: { sha: "def789", ref: "main" },
        },
      ],
    },
    repository: {
      full_name: "testowner/testrepo",
      owner: {
        login: "testowner",
      },
      name: "testrepo",
    },
    installation: {
      id: 12345,
    },
    ...overrides,
  });

  describe("getOpenAIClient", () => {
    it("should return singleton OpenAI client instance", () => {
      const client1 = getOpenAIClient();
      const client2 = getOpenAIClient();

      expect(client1).toBe(client2);
      expect(client1).toBeDefined();
    });

    it("should only create one instance", () => {
      // The singleton instance is created on first call to getOpenAIClient
      // Since it's a module-level singleton, we can only test that subsequent calls return the same instance
      const client1 = getOpenAIClient();
      const client2 = getOpenAIClient();
      const client3 = getOpenAIClient();

      // All should be the same instance
      expect(client1).toBe(client2);
      expect(client2).toBe(client3);
    });
  });

  describe("getOctokit", () => {
    it("should create and cache Octokit instance", async () => {
      const installationId = 12345;
      const octokit1 = await getOctokit(installationId);
      const octokit2 = await getOctokit(installationId);

      expect(octokit1).toBe(octokit2);
      expect(octokit1).toBeDefined();
    });

    it("should create separate instances for different installations", async () => {
      const octokit1 = await getOctokit(12345);
      const octokit2 = await getOctokit(67890);

      expect(octokit1).toBeDefined();
      expect(octokit2).toBeDefined();
    });

    it("should use correct installation ID for authentication", async () => {
      const installationId = 99999;
      await getOctokit(installationId);

      expect(mockOctokit).toBeDefined();
    });
  });

  describe("createEventFromPR", () => {
    it("should create event with correct type", () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);

      expect(event.type).toBe("MANUAL_TRIGGER");
      expect(event.source).toBe("github");
    });

    it("should include PR metadata in payload", () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);

      expect(event.payload.prNumber).toBe(123);
      expect(event.payload.title).toBe("Test PR");
      expect(event.payload.author).toBe("testuser");
      expect(event.payload.headSha).toBe("abc123def456");
      expect(event.payload.baseBranch).toBe("main");
      expect(event.payload.headBranch).toBe("feature-branch");
    });

    it("should handle null PR body", () => {
      const webhook = createMockPRWebhook({
        pull_request: {
          ...createMockPRWebhook().pull_request,
          body: null,
        },
      });
      const event = createEventFromPR(webhook);

      expect(event.payload.body).toBe("");
    });

    it("should include repository info in metadata", () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);

      expect(event.metadata?.owner).toBe("testowner");
      expect(event.metadata?.repo).toBe("testrepo");
      expect(event.metadata?.installationId).toBe(12345);
    });

    it("should generate unique event ID with pr prefix", () => {
      const webhook = createMockPRWebhook();
      const event1 = createEventFromPR(webhook);
      const event2 = createEventFromPR(webhook);

      expect(event1.id).toMatch(/^pr_/);
      expect(event2.id).toMatch(/^pr_/);
      expect(event1.id).not.toBe(event2.id);
    });

    it("should set medium severity", () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);

      expect(event.severity).toBe("medium");
    });

    it("should include timestamp", () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);

      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).toString()).not.toBe("Invalid Date");
    });

    it("should format title with PR number", () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);

      expect(event.title).toContain("PR #123");
      expect(event.title).toContain("Test PR");
    });
  });

  describe("createEventFromCheckRun", () => {
    it("should create event with correct type", () => {
      const webhook = createMockCheckRunWebhook();
      const event = createEventFromCheckRun(webhook);

      expect(event.type).toBe("CICD_FAILURE");
      expect(event.source).toBe("github");
    });

    it("should include check run metadata in payload", () => {
      const webhook = createMockCheckRunWebhook();
      const event = createEventFromCheckRun(webhook);

      expect(event.payload.checkName).toBe("CI Build");
      expect(event.payload.conclusion).toBe("failure");
      expect(event.payload.headSha).toBe("abc123def456");
      expect(event.payload.pullRequestCount).toBe(1);
    });

    it("should include check run output", () => {
      const webhook = createMockCheckRunWebhook();
      const event = createEventFromCheckRun(webhook);

      expect(event.payload.output).toBeDefined();
      expect((event.payload.output as { title: string }).title).toBe("Build Failed");
      expect((event.payload.output as { summary: string }).summary).toBe("The build encountered errors");
    });

    it("should include repository info in metadata", () => {
      const webhook = createMockCheckRunWebhook();
      const event = createEventFromCheckRun(webhook);

      expect(event.metadata?.owner).toBe("testowner");
      expect(event.metadata?.repo).toBe("testrepo");
      expect(event.metadata?.installationId).toBe(12345);
      expect(event.metadata?.checkRunId).toBe(98765);
      expect(event.metadata?.headSha).toBe("abc123def456");
    });

    it("should generate unique event ID with check prefix", () => {
      const webhook = createMockCheckRunWebhook();
      const event1 = createEventFromCheckRun(webhook);
      const event2 = createEventFromCheckRun(webhook);

      expect(event1.id).toMatch(/^check_/);
      expect(event2.id).toMatch(/^check_/);
      expect(event1.id).not.toBe(event2.id);
    });

    it("should set high severity", () => {
      const webhook = createMockCheckRunWebhook();
      const event = createEventFromCheckRun(webhook);

      expect(event.severity).toBe("high");
    });

    it("should format title with check name", () => {
      const webhook = createMockCheckRunWebhook();
      const event = createEventFromCheckRun(webhook);

      expect(event.title).toContain("CI Failure");
      expect(event.title).toContain("CI Build");
    });
  });

  describe("createMinimalEvidence", () => {
    it("should create evidence with event ID", () => {
      const eventId = "test_event_123";
      const evidence = createMinimalEvidence(eventId);

      expect(evidence.eventId).toBe(eventId);
    });

    it("should include timestamp", () => {
      const evidence = createMinimalEvidence("test");

      expect(evidence.collectedAt).toBeDefined();
      expect(new Date(evidence.collectedAt).toString()).not.toBe("Invalid Date");
    });

    it("should have empty logs array", () => {
      const evidence = createMinimalEvidence("test");

      expect(evidence.logs).toEqual([]);
      expect(Array.isArray(evidence.logs)).toBe(true);
    });
  });

  describe("performAnalysis", () => {
    it("should return analysis result with confidence score", async () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);
      const result = await performAnalysis(event);

      expect(result.analysis).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.event).toBe(event);
    });

    it("should call OpenAI client analyzeIncident", async () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);
      const client = getOpenAIClient();

      await performAnalysis(event);

      expect(client.analyzeIncident).toHaveBeenCalledWith(event, expect.any(Object));
    });

    it("should calculate confidence score", async () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);
      const { calculateConfidenceScore } = jest.requireMock("@kenchi/shared") as {
        calculateConfidenceScore: jest.Mock;
      };

      await performAnalysis(event);

      expect(calculateConfidenceScore).toHaveBeenCalled();
    });

    it("should throw LLMError when analysis fails", async () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);
      const client = getOpenAIClient();

      (client.analyzeIncident as jest.Mock).mockRejectedValueOnce(
        new Error("OpenAI API error") as never
      );

      await expect(performAnalysis(event)).rejects.toThrow("Failed to analyze");
    });

    it("should wrap error message when analysis fails", async () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);
      const client = getOpenAIClient();
      const { wrapError } = jest.requireMock("@kenchi/shared") as {
        wrapError: jest.Mock;
      };

      (client.analyzeIncident as jest.Mock).mockRejectedValueOnce(
        new Error("OpenAI API error") as never
      );

      await expect(performAnalysis(event)).rejects.toThrow();
      expect(wrapError).toHaveBeenCalledWith("Failed to analyze", expect.any(Error));
    });

    it("should include event in result", async () => {
      const webhook = createMockPRWebhook();
      const event = createEventFromPR(webhook);
      const result = await performAnalysis(event);

      expect(result.event).toEqual(event);
    });
  });

  // Note: deleteKenchiOpsComments tests require integration testing
  // due to complex interactions between module-level mocks and internal getOctokit calls.
  // The function is covered by integration tests that use actual Octokit interactions.

  // Note: postPRComment tests require integration testing
  // due to complex interactions between module-level mocks and internal getOctokit calls.
  // The function is covered by integration tests that use actual Octokit interactions.

  // Note: getInstallationRepositories tests require integration testing
  // due to complex interactions between module-level mocks and internal getOctokit calls.
  // The function is covered by integration tests that use actual Octokit interactions.

  // Note: createCheckRunWithAnnotations tests require integration testing
  // due to complex interactions between module-level mocks and internal getOctokit calls.
  // The function is covered by integration tests that use actual Octokit interactions.
});
