/**
 * RAG Integration Tests
 *
 * Verifies that RAG context flows correctly through the analysis pipeline:
 * 1. searchFromEventContext is called with the correct EventQueryContext
 * 2. RAG results are passed through to analyzeIncident
 * 3. RAG search failure does NOT block analysis (graceful degradation)
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Event, RAGSearchResult } from "@kenchi/shared";

// ==================== Mock Setup ====================

const mockSearchFromEventContext = jest.fn<() => Promise<RAGSearchResult>>();
const mockAnalyzeIncident = jest.fn();
const mockCheckForHallucinations = jest.fn(() => ({
  isLikelyHallucinated: false,
  riskScore: 0,
  indicators: [],
}));
const mockRecordHallucinationDetection = jest.fn(() => Promise.resolve());
const mockCalculateConfidenceScore = jest.fn(() => ({
  finalScore: 0.85,
  gatingDecision: "proceed",
  signals: {},
}));

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
    searchFromEventContext: (...args: unknown[]) => mockSearchFromEventContext(...args),
    checkForHallucinations: (...args: unknown[]) => mockCheckForHallucinations(...args),
    recordHallucinationDetection: (...args: unknown[]) => mockRecordHallucinationDetection(...args),
    calculateConfidenceScore: (...args: unknown[]) => mockCalculateConfidenceScore(...args),
    LLMClient: jest.fn(() => ({
      analyzeIncident: mockAnalyzeIncident,
    })),
  };
});

// Import AFTER mocks are set up
import { performAnalysis } from "../services/githubAnalysis.js";

// ==================== Test Fixtures ====================

const createTestEvent = (overrides: Partial<Event> = {}): Event => ({
  id: "test-event-1",
  type: "CICD_FAILURE",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "high",
  title: "CI Failure: unit-tests",
  payload: {
    action: "completed",
    checkName: "unit-tests",
    conclusion: "failure",
    repository: "owner/repo",
    output: { summary: "3 tests failed" },
    headSha: "abc123",
  },
  metadata: {
    owner: "owner",
    repo: "repo",
    installationId: 12345,
  },
  ...overrides,
});

const createMockRAGResult = (): RAGSearchResult => ({
  knowledgeDocs: [
    {
      item: {
        id: "doc-1",
        repository: "owner/repo",
        parentId: null,
        docType: "analysis_lesson",
        title: "Previous fix for unit test failure",
        content: "The issue was a missing mock in the test setup.",
        sourceUrl: null,
        filePath: null,
        chunkIndex: 0,
        embedding: null,
        embeddingModel: "text-embedding-3-small",
        embeddingVersion: "v1",
        tenantId: "tenant-1",
        metadata: {},
        createdAt: new Date("2024-01-01"),
      },
      similarity: 0.87,
    },
  ],
  diffChunks: [],
  queryTokens: 150,
  cacheHit: false,
});

const createMockAnalysisResult = () => ({
  summary: "Test failed due to missing mock",
  reasoning: "The unit test expected a mocked response",
  identifiedCause: "Missing mock setup",
  confidence: "high",
  category: "test",
  phase: "test",
  nextSteps: ["Add mock setup"],
  codeAnnotations: [],
  recommendedActions: [{ description: "Add mock", priority: "high" }],
});

// ==================== Tests ====================

describe("RAG Integration in performAnalysis", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyzeIncident.mockResolvedValue(createMockAnalysisResult());
  });

  it("should call searchFromEventContext with correct EventQueryContext", async () => {
    mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

    const event = createTestEvent();
    await performAnalysis(event, "tenant-1");

    expect(mockSearchFromEventContext).toHaveBeenCalledTimes(1);
    const [queryContext, tenantId] = mockSearchFromEventContext.mock.calls[0];

    expect(queryContext).toEqual({
      eventType: "CICD_FAILURE",
      repository: "owner/repo",
      errorMessage: "CI Failure: unit-tests",
      failureSummary: "3 tests failed",
    });
    expect(tenantId).toBe("tenant-1");
  });

  it("should pass RAG context to analyzeIncident", async () => {
    const mockRAG = createMockRAGResult();
    mockSearchFromEventContext.mockResolvedValue(mockRAG);

    const event = createTestEvent();
    await performAnalysis(event, "tenant-1");

    expect(mockAnalyzeIncident).toHaveBeenCalledTimes(1);
    const [passedEvent, _passedEvidence, passedTenantId, passedRagContext] =
      mockAnalyzeIncident.mock.calls[0];

    expect(passedEvent.id).toBe("test-event-1");
    expect(passedTenantId).toBe("tenant-1");
    // RAG context should be passed through
    expect(passedRagContext).toBeDefined();
    expect(passedRagContext.knowledgeDocs).toHaveLength(1);
    expect(passedRagContext.knowledgeDocs[0].item.title).toBe("Previous fix for unit test failure");
  });

  it("should complete analysis when RAG search fails", async () => {
    mockSearchFromEventContext.mockRejectedValue(new Error("Vector DB connection failed"));

    const event = createTestEvent();
    const result = await performAnalysis(event, "tenant-1");

    // Analysis should still succeed
    expect(result).toBeDefined();
    expect(result.analysis.summary).toBe("Test failed due to missing mock");
    expect(result.event.id).toBe("test-event-1");

    // analyzeIncident should be called with undefined ragContext
    expect(mockAnalyzeIncident).toHaveBeenCalledTimes(1);
    const [, , , passedRagContext] = mockAnalyzeIncident.mock.calls[0];
    expect(passedRagContext).toBeUndefined();
  });

  it("should handle empty RAG results gracefully", async () => {
    const emptyRAG: RAGSearchResult = {
      knowledgeDocs: [],
      diffChunks: [],
      queryTokens: 50,
      cacheHit: true,
    };
    mockSearchFromEventContext.mockResolvedValue(emptyRAG);

    const event = createTestEvent();
    const result = await performAnalysis(event, "tenant-1");

    expect(result).toBeDefined();
    expect(result.analysis.summary).toBe("Test failed due to missing mock");

    // Empty RAG context is still passed (not undefined)
    const [, , , passedRagContext] = mockAnalyzeIncident.mock.calls[0];
    expect(passedRagContext).toEqual(emptyRAG);
  });

  it("should work without tenantId", async () => {
    mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

    const event = createTestEvent();
    await performAnalysis(event);

    expect(mockSearchFromEventContext).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "CICD_FAILURE" }),
      undefined
    );
  });

  it("should extract failureSummary from event output", async () => {
    mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

    const event = createTestEvent({
      payload: {
        repository: "org/service",
        output: { summary: "Build failed: TypeScript compilation error" },
      },
    });
    await performAnalysis(event, "tenant-2");

    const [queryContext] = mockSearchFromEventContext.mock.calls[0];
    expect(queryContext.failureSummary).toBe("Build failed: TypeScript compilation error");
  });
});
