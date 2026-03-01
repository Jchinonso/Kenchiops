/**
 * Unit tests for analysisService.ts — aggregationKey and fullAnalysis.repository
 *
 * Tests the Phase 1 dashboard-related changes to performAnalysis:
 * - aggregationKey is "repo:commit" when both present
 * - aggregationKey is just "repo" when commit is missing
 * - repository is embedded in fullAnalysis JSONB
 *
 * Isolated from the main analysisService.test.ts to keep concerns separated.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { LLMAnalysisResult } from "@kenchi/shared";

// ==================== Mock Functions ====================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAnalyzeIncident = jest.fn<(...args: any[]) => Promise<any>>();
const mockCreateAnalysis = jest.fn();
const mockPublish = jest.fn();

// ==================== Mocks ====================

jest.mock("@kenchi/shared", () => ({
  // Constants needed by analysisService and analysisEvidence
  EVENT_TYPES: { CICD_FAILURE: "CICD_FAILURE" },
  EVENT_SOURCES: { GITHUB_APP: "github-app" },
  EVENT_SEVERITY: { HIGH: "high" },
  EVENT_DEFAULTS: { UNKNOWN_COMMIT: "unknown" },
  SERVICE_NAMES: { API: "api" },
  PUBSUB_CHANNELS: { DASHBOARD: "dashboard" },
  DASHBOARD_EVENT_TYPES: { ANALYSIS_COMPLETE: "analysis_complete" },
  // Constants needed by analysisEvidence
  LOG_LEVELS: { INFO: "INFO", ERROR: "ERROR" },
  EVIDENCE_SOURCES: { CI: "ci" },
  ERROR_SECTION_HEADINGS: new Set(["Failed Tests", "Error Output", "Errors"]),
  SECTION_SOURCE_OVERRIDES: { Overview: "ci-overview", "Failed Tests": "ci-tests" } as Record<
    string,
    string
  >,
  EVIDENCE_LOG_TIMING: { TIMESTAMP_OFFSET_MS: 1000 },
  sanitizeIdPart: (heading: string) => heading.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  // Utilities needed by analysisService
  generateEventId: (prefix: string) =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  wrapError: (message: string, cause: unknown) =>
    `${message}: ${cause instanceof Error ? cause.message : String(cause)}`,
  LLMError: (jest.requireActual("@kenchi/shared") as Record<string, unknown>).LLMError,
  calculateConfidenceScore: jest.fn().mockReturnValue({
    finalScore: 0.85,
    breakdown: { evidenceQuality: 0.9, analysisDepth: 0.8 },
  }),
  estimateChunkTokens: jest.fn().mockReturnValue(100),
  // Mocked dependencies
  LLMClient: jest.fn().mockImplementation(() => ({
    analyzeIncident: (...args: unknown[]) => mockAnalyzeIncident(...args),
  })),
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  searchFromEventContext: jest.fn().mockResolvedValue({
    diffChunks: [],
    knowledgeDocs: [],
    queryTokens: 10,
    cacheHit: false,
  }),
  selectModel: jest.fn().mockReturnValue({
    model: "gpt-4o-mini",
    reason: "standard_analysis",
    versionId: undefined,
    modelId: "gpt-4o-mini",
  }),
  logModelSelection: jest.fn(),
  createAnalysis: (...args: unknown[]) => mockCreateAnalysis(...args),
  publish: (...args: unknown[]) => mockPublish(...args),
  enforcePlanLimit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  findEventIdByRepoAndCommit: jest.fn().mockResolvedValue(null),
}));

// Mock transitive dependencies to prevent real chunking pipeline execution
jest.mock("../services/analysisChunkingPipeline.js", () => ({
  CHUNKING_PIPELINE_CONFIG: { TOKEN_THRESHOLD: 999999 },
  executeChunkingPipeline: jest.fn(),
  convertAggregatedToEvidence: jest.fn(),
}));

jest.mock("../services/analysisRAG.js", () => ({
  retrieveRelevantKnowledge: jest.fn().mockResolvedValue([]),
}));

// Import after mock setup
import { performAnalysis } from "../services/analysisService.js";

// ==================== Test Fixtures ====================

const createMockAnalysisResult = (
  overrides: Partial<LLMAnalysisResult> = {}
): LLMAnalysisResult => ({
  eventId: "evt_test",
  summary: "Test analysis summary",
  identifiedCause: "Root cause identified",
  confidence: "high",
  analyzedAt: new Date().toISOString(),
  recommendedActions: [
    {
      actionType: "fix_code",
      description: "Fix the failing test",
      priority: "high",
    },
  ],
  ...overrides,
});

const testContext = {
  requestId: "test-req-agg-123",
  tenantId: "test-tenant",
};

// ==================== Tests ====================

describe("analysisService — aggregationKey and fullAnalysis.repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAnalysis.mockResolvedValue({
      id: "analysis_agg_123",
      eventId: null,
      createdAt: new Date().toISOString(),
    });
    mockPublish.mockResolvedValue(undefined);
  });

  describe("aggregationKey formation", () => {
    it("should create aggregationKey as 'repository:commit' when both are present", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Build failed: npm test exited with code 1",
        repository: "acme/my-app",
        commit: "abc123def456",
      };

      await performAnalysis(request, testContext);

      expect(mockCreateAnalysis).toHaveBeenCalledTimes(1);
      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      expect(createAnalysisArg.aggregationKey).toBe("acme/my-app:abc123def456");
    });

    it("should create aggregationKey as just 'repository' when commit is undefined", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Build failed: compilation error",
        repository: "acme/backend",
      };

      await performAnalysis(request, testContext);

      expect(mockCreateAnalysis).toHaveBeenCalledTimes(1);
      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      expect(createAnalysisArg.aggregationKey).toBe("acme/backend");
    });

    it("should create aggregationKey as just 'repository' when commit is empty string", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Build failed",
        repository: "org/service",
        commit: "",
      };

      await performAnalysis(request, testContext);

      expect(mockCreateAnalysis).toHaveBeenCalledTimes(1);
      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      // Empty string is falsy, so commit check fails -> aggregationKey is just repository
      expect(createAnalysisArg.aggregationKey).toBe("org/service");
    });

    it("should handle repository with owner/org prefix in aggregationKey", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Test suite failed",
        repository: "kenchi-dev/api-service",
        commit: "a1b2c3d4e5f6",
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      expect(createAnalysisArg.aggregationKey).toBe("kenchi-dev/api-service:a1b2c3d4e5f6");
    });

    it("should handle full 40-character SHA in aggregationKey", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());
      const fullSha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";

      const request = {
        failure_log: "CI failed",
        repository: "org/repo",
        commit: fullSha,
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      expect(createAnalysisArg.aggregationKey).toBe(`org/repo:${fullSha}`);
    });
  });

  describe("fullAnalysis.repository embedding", () => {
    it("should embed repository in fullAnalysis JSONB", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Error: Connection refused",
        repository: "acme/my-service",
        commit: "abc123",
      };

      await performAnalysis(request, testContext);

      expect(mockCreateAnalysis).toHaveBeenCalledTimes(1);
      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      const fullAnalysis = createAnalysisArg.fullAnalysis as Record<string, unknown>;
      expect(fullAnalysis.repository).toBe("acme/my-service");
    });

    it("should preserve LLM analysis result fields alongside repository in fullAnalysis", async () => {
      const analysisResult = createMockAnalysisResult({
        summary: "Test summary",
        identifiedCause: "Identified root cause",
        confidence: "high",
      });
      mockAnalyzeIncident.mockResolvedValue(analysisResult);

      const request = {
        failure_log: "Build failed",
        repository: "org/repo",
        commit: "sha123",
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      const fullAnalysis = createAnalysisArg.fullAnalysis as Record<string, unknown>;

      // Repository should be present
      expect(fullAnalysis.repository).toBe("org/repo");
      // LLM result fields should also be present
      expect(fullAnalysis.summary).toBe("Test summary");
      expect(fullAnalysis.identifiedCause).toBe("Identified root cause");
      expect(fullAnalysis.confidence).toBe("high");
    });

    it("should embed repository even when commit is absent", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Deployment error",
        repository: "acme/infra",
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      const fullAnalysis = createAnalysisArg.fullAnalysis as Record<string, unknown>;
      expect(fullAnalysis.repository).toBe("acme/infra");
    });
  });

  describe("createAnalysis call structure", () => {
    it("should pass all required fields to createAnalysis", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "npm ERR! test failed",
        repository: "acme/frontend",
        commit: "def456",
        tenant_id: "tenant-xyz",
      };

      await performAnalysis(request, testContext);

      expect(mockCreateAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: null,
          summary: expect.any(String),
          identifiedCause: expect.any(String),
          diagnosisConfidence: expect.any(Number),
          confidenceSignals: expect.any(Object),
          fullAnalysis: expect.objectContaining({
            repository: "acme/frontend",
          }),
          tenantId: "tenant-xyz",
          aggregationKey: "acme/frontend:def456",
        })
      );
    });

    it("should pass null tenantId when tenant_id is not in request", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Error",
        repository: "org/repo",
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      expect(createAnalysisArg.tenantId).toBeUndefined();
    });

    it("should pass recommended actions as description strings", async () => {
      const analysisResult = createMockAnalysisResult({
        recommendedActions: [
          { actionType: "fix_code", description: "Update the failing import", priority: "high" },
          { actionType: "run_tests", description: "Re-run with debug logging", priority: "medium" },
        ],
      });
      mockAnalyzeIncident.mockResolvedValue(analysisResult);

      const request = {
        failure_log: "ModuleNotFoundError",
        repository: "org/repo",
        commit: "sha1",
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      expect(createAnalysisArg.recommendedActions).toEqual([
        "Update the failing import",
        "Re-run with debug logging",
      ]);
    });

    it("should pass undefined recommendedActions when LLM returns none", async () => {
      const analysisResult = createMockAnalysisResult({
        recommendedActions: undefined,
      });
      mockAnalyzeIncident.mockResolvedValue(analysisResult);

      const request = {
        failure_log: "Error",
        repository: "org/repo",
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      expect(createAnalysisArg.recommendedActions).toBeUndefined();
    });
  });

  describe("aggregationKey used consistently with extractRepoFromKey", () => {
    it("should produce aggregationKey that extractRepoFromKey can parse back to repo", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Build failed",
        repository: "kenchi-dev/backend",
        commit: "a1b2c3d4",
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      const aggregationKey = createAnalysisArg.aggregationKey as string;

      // Simulate what extractRepoFromKey does on the frontend
      const colonIndex = aggregationKey.indexOf(":");
      const extractedRepo = colonIndex > 0 ? aggregationKey.slice(0, colonIndex) : aggregationKey;

      expect(extractedRepo).toBe("kenchi-dev/backend");
    });

    it("should produce aggregationKey without colon when commit absent that extractRepoFromKey returns directly", async () => {
      mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());

      const request = {
        failure_log: "Build failed",
        repository: "kenchi-dev/backend",
      };

      await performAnalysis(request, testContext);

      const createAnalysisArg = mockCreateAnalysis.mock.calls[0]![0] as Record<string, unknown>;
      const aggregationKey = createAnalysisArg.aggregationKey as string;

      // No colon, so extractRepoFromKey returns the full key
      const colonIndex = aggregationKey.indexOf(":");
      expect(colonIndex).toBe(-1);
      expect(aggregationKey).toBe("kenchi-dev/backend");
    });
  });
});
