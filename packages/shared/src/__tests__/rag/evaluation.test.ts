import { describe, it, expect, jest } from "@jest/globals";
import {
  calculateRecallAtK,
  calculateMRR,
  calculateHelpfulRate,
  recordRAGFeedback,
  runRAGTestCase,
  getRAGEvaluationMetrics,
  type RetrievalResult,
  type RAGFeedbackInput,
  type RAGTestCase,
} from "../../rag/evaluation.js";

// Mock logger to prevent console output during tests
jest.mock("../../core/logger.js", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock database functions - using inline mock to avoid hoisting issues
jest.mock("../../database/feedback/repository.js", () => ({
  createRAGFeedback: jest.fn().mockResolvedValue({
    id: "feedback_123",
    analysisId: "analysis-123",
    feedbackType: "rag_helpful",
    userId: "user-789",
    tenantId: "tenant-default",
    createdAt: new Date().toISOString(),
  }),
  getRAGFeedbackMetrics: jest.fn().mockResolvedValue({
    totalFeedback: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    partiallyHelpfulCount: 0,
    helpfulRate: 0,
    averageSimilarity: 0,
  }),
}));

// ==================== Test Fixtures ====================

/**
 * Creates a retrieval result for testing.
 */
const createRetrievalResult = (
  docId: string,
  similarity: number,
  rank: number,
  isRelevant: boolean
): RetrievalResult => ({
  docId,
  similarity,
  rank,
  isRelevant,
});

/**
 * Creates a valid RAG feedback input for testing.
 */
const createValidFeedbackInput = (overrides: Partial<RAGFeedbackInput> = {}): RAGFeedbackInput => ({
  analysisId: "analysis-123",
  knowledgeDocId: "doc-456",
  relevance: "helpful",
  retrievalSimilarity: 0.85,
  retrievalRank: 1,
  userId: "user-789",
  ...overrides,
});

/**
 * Creates a RAG test case for testing.
 */
const createTestCase = (overrides: Partial<RAGTestCase> = {}): RAGTestCase => ({
  testId: "test-001",
  queryText: "How to fix authentication errors",
  expectedDocIds: ["doc-1", "doc-2"],
  repository: "org/repo",
  eventType: "ci_failure",
  ...overrides,
});

// ==================== calculateRecallAtK Tests ====================

describe("calculateRecallAtK", () => {
  it("should return 1.0 when all relevant docs are in top K", () => {
    const results: RetrievalResult[] = [
      createRetrievalResult("doc-1", 0.9, 1, true),
      createRetrievalResult("doc-2", 0.85, 2, true),
      createRetrievalResult("doc-3", 0.8, 3, false),
    ];

    expect(calculateRecallAtK(results, 3)).toBe(1.0);
  });

  it("should return 0.5 when half of relevant docs are in top K", () => {
    const results: RetrievalResult[] = [
      createRetrievalResult("doc-1", 0.9, 1, true),
      createRetrievalResult("doc-2", 0.85, 2, false),
      createRetrievalResult("doc-3", 0.8, 3, true),
    ];

    // Only doc-1 is in top 1, but 2 total relevant docs exist
    expect(calculateRecallAtK(results, 1)).toBe(0.5);
  });

  it("should return 0 when no relevant docs are in top K", () => {
    const results: RetrievalResult[] = [
      createRetrievalResult("doc-1", 0.9, 1, false),
      createRetrievalResult("doc-2", 0.85, 2, false),
      createRetrievalResult("doc-3", 0.8, 3, true),
    ];

    expect(calculateRecallAtK(results, 2)).toBe(0);
  });

  it("should return 0 when no relevant docs exist", () => {
    const results: RetrievalResult[] = [
      createRetrievalResult("doc-1", 0.9, 1, false),
      createRetrievalResult("doc-2", 0.85, 2, false),
    ];

    expect(calculateRecallAtK(results, 2)).toBe(0);
  });

  it("should handle empty results array", () => {
    expect(calculateRecallAtK([], 5)).toBe(0);
  });

  it("should handle K larger than results length", () => {
    const results: RetrievalResult[] = [
      createRetrievalResult("doc-1", 0.9, 1, true),
      createRetrievalResult("doc-2", 0.85, 2, true),
    ];

    expect(calculateRecallAtK(results, 10)).toBe(1.0);
  });

  it("should handle K of 1 correctly", () => {
    const results: RetrievalResult[] = [
      createRetrievalResult("doc-1", 0.9, 1, true),
      createRetrievalResult("doc-2", 0.85, 2, true),
      createRetrievalResult("doc-3", 0.8, 3, true),
    ];

    // 1 relevant in top 1, 3 total relevant = 1/3
    expect(calculateRecallAtK(results, 1)).toBeCloseTo(0.333, 2);
  });

  it("should calculate correctly with mixed relevance", () => {
    const results: RetrievalResult[] = [
      createRetrievalResult("doc-1", 0.95, 1, true),
      createRetrievalResult("doc-2", 0.9, 2, false),
      createRetrievalResult("doc-3", 0.85, 3, true),
      createRetrievalResult("doc-4", 0.8, 4, false),
      createRetrievalResult("doc-5", 0.75, 5, true),
    ];

    // Top 3: doc-1 (relevant), doc-2 (not), doc-3 (relevant) = 2 relevant
    // Total relevant: 3
    // Recall@3 = 2/3
    expect(calculateRecallAtK(results, 3)).toBeCloseTo(0.667, 2);
  });
});

// ==================== calculateMRR Tests ====================

describe("calculateMRR", () => {
  it("should return 1.0 when first result is relevant for all queries", () => {
    const queryResults: RetrievalResult[][] = [
      [createRetrievalResult("doc-1", 0.9, 1, true)],
      [createRetrievalResult("doc-2", 0.85, 1, true)],
    ];

    expect(calculateMRR(queryResults)).toBe(1.0);
  });

  it("should return 0.5 when first relevant is at rank 2", () => {
    const queryResults: RetrievalResult[][] = [
      [
        createRetrievalResult("doc-1", 0.9, 1, false),
        createRetrievalResult("doc-2", 0.85, 2, true),
      ],
    ];

    expect(calculateMRR(queryResults)).toBe(0.5);
  });

  it("should return 0 when no relevant results exist", () => {
    const queryResults: RetrievalResult[][] = [
      [
        createRetrievalResult("doc-1", 0.9, 1, false),
        createRetrievalResult("doc-2", 0.85, 2, false),
      ],
    ];

    expect(calculateMRR(queryResults)).toBe(0);
  });

  it("should return 0 for empty query results", () => {
    expect(calculateMRR([])).toBe(0);
  });

  it("should calculate average across multiple queries", () => {
    const queryResults: RetrievalResult[][] = [
      // Query 1: first relevant at rank 1 -> RR = 1
      [createRetrievalResult("doc-1", 0.9, 1, true)],
      // Query 2: first relevant at rank 2 -> RR = 0.5
      [
        createRetrievalResult("doc-2", 0.9, 1, false),
        createRetrievalResult("doc-3", 0.85, 2, true),
      ],
      // Query 3: first relevant at rank 3 -> RR = 0.333
      [
        createRetrievalResult("doc-4", 0.9, 1, false),
        createRetrievalResult("doc-5", 0.85, 2, false),
        createRetrievalResult("doc-6", 0.8, 3, true),
      ],
    ];

    // MRR = (1 + 0.5 + 0.333) / 3 = 0.611
    expect(calculateMRR(queryResults)).toBeCloseTo(0.611, 2);
  });

  it("should handle queries with no results", () => {
    const queryResults: RetrievalResult[][] = [
      [createRetrievalResult("doc-1", 0.9, 1, true)],
      [], // Empty query results
    ];

    // Query 1: RR = 1, Query 2: RR = 0
    // MRR = (1 + 0) / 2 = 0.5
    expect(calculateMRR(queryResults)).toBe(0.5);
  });

  it("should handle mixed query success", () => {
    const queryResults: RetrievalResult[][] = [
      // Query with relevant result
      [createRetrievalResult("doc-1", 0.9, 1, true)],
      // Query with no relevant results
      [
        createRetrievalResult("doc-2", 0.9, 1, false),
        createRetrievalResult("doc-3", 0.85, 2, false),
      ],
    ];

    // MRR = (1 + 0) / 2 = 0.5
    expect(calculateMRR(queryResults)).toBe(0.5);
  });
});

// ==================== calculateHelpfulRate Tests ====================

describe("calculateHelpfulRate", () => {
  it("should return 1.0 when all feedback is helpful", () => {
    expect(calculateHelpfulRate(10, 10)).toBe(1.0);
  });

  it("should return 0 when no feedback is helpful", () => {
    expect(calculateHelpfulRate(0, 10)).toBe(0);
  });

  it("should return 0.5 when half is helpful", () => {
    expect(calculateHelpfulRate(5, 10)).toBe(0.5);
  });

  it("should return 0 when total count is 0", () => {
    expect(calculateHelpfulRate(0, 0)).toBe(0);
  });

  it("should handle non-integer rates", () => {
    expect(calculateHelpfulRate(1, 3)).toBeCloseTo(0.333, 2);
  });

  it("should handle large numbers", () => {
    expect(calculateHelpfulRate(750, 1000)).toBe(0.75);
  });
});

// ==================== recordRAGFeedback Tests ====================

describe("recordRAGFeedback", () => {
  it("should successfully record valid feedback", async () => {
    const input = createValidFeedbackInput();

    const result = await recordRAGFeedback(input);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should fail when analysisId is missing", async () => {
    const input = createValidFeedbackInput({ analysisId: "" });

    const result = await recordRAGFeedback(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Analysis ID is required");
  });

  it("should fail when knowledgeDocId is missing", async () => {
    const input = createValidFeedbackInput({ knowledgeDocId: "" });

    const result = await recordRAGFeedback(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Knowledge doc ID is required");
  });

  it("should fail when userId is missing", async () => {
    const input = createValidFeedbackInput({ userId: "" });

    const result = await recordRAGFeedback(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe("User ID is required");
  });

  it("should fail when similarity is negative", async () => {
    const input = createValidFeedbackInput({ retrievalSimilarity: -0.5 });

    const result = await recordRAGFeedback(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Similarity must be between 0 and 1");
  });

  it("should fail when similarity is greater than 1", async () => {
    const input = createValidFeedbackInput({ retrievalSimilarity: 1.5 });

    const result = await recordRAGFeedback(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Similarity must be between 0 and 1");
  });

  it("should fail when rank is less than 1", async () => {
    const input = createValidFeedbackInput({ retrievalRank: 0 });

    const result = await recordRAGFeedback(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Rank must be at least 1");
  });

  it("should accept all valid relevance values", async () => {
    const relevanceValues = ["helpful", "not_helpful", "partially_helpful"] as const;

    for (const relevance of relevanceValues) {
      const input = createValidFeedbackInput({ relevance });
      const result = await recordRAGFeedback(input);
      expect(result.success).toBe(true);
    }
  });

  it("should accept boundary similarity values", async () => {
    // Test similarity of 0
    const inputZero = createValidFeedbackInput({ retrievalSimilarity: 0 });
    const resultZero = await recordRAGFeedback(inputZero);
    expect(resultZero.success).toBe(true);

    // Test similarity of 1
    const inputOne = createValidFeedbackInput({ retrievalSimilarity: 1 });
    const resultOne = await recordRAGFeedback(inputOne);
    expect(resultOne.success).toBe(true);
  });

  it("should accept optional slack channel and message timestamp", async () => {
    const input = createValidFeedbackInput({
      slackChannel: "C12345",
      slackMessageTs: "1234567890.123456",
    });

    const result = await recordRAGFeedback(input);

    expect(result.success).toBe(true);
  });
});

// ==================== runRAGTestCase Tests ====================

describe("runRAGTestCase", () => {
  it("should pass when expected doc is in top 5", async () => {
    const testCase = createTestCase({ expectedDocIds: ["doc-1"] });
    const mockSearchFn = jest
      .fn()
      .mockResolvedValue([
        createRetrievalResult("doc-1", 0.9, 1, false),
        createRetrievalResult("doc-2", 0.85, 2, false),
      ]);

    const result = await runRAGTestCase(testCase, mockSearchFn);

    expect(result.passed).toBe(true);
    expect(result.testId).toBe("test-001");
  });

  it("should fail when no expected docs are retrieved", async () => {
    const testCase = createTestCase({ expectedDocIds: ["doc-999"] });
    const mockSearchFn = jest
      .fn()
      .mockResolvedValue([
        createRetrievalResult("doc-1", 0.9, 1, false),
        createRetrievalResult("doc-2", 0.85, 2, false),
      ]);

    const result = await runRAGTestCase(testCase, mockSearchFn);

    expect(result.passed).toBe(false);
  });

  it("should calculate recall metrics correctly", async () => {
    const testCase = createTestCase({ expectedDocIds: ["doc-1", "doc-3"] });
    const mockSearchFn = jest
      .fn()
      .mockResolvedValue([
        createRetrievalResult("doc-1", 0.9, 1, false),
        createRetrievalResult("doc-2", 0.85, 2, false),
        createRetrievalResult("doc-3", 0.8, 3, false),
        createRetrievalResult("doc-4", 0.75, 4, false),
        createRetrievalResult("doc-5", 0.7, 5, false),
      ]);

    const result = await runRAGTestCase(testCase, mockSearchFn);

    // doc-1 at rank 1, doc-3 at rank 3
    // Recall@1: 1/2 = 0.5
    // Recall@3: 2/2 = 1.0
    // Recall@5: 2/2 = 1.0
    expect(result.recallAt1).toBe(0.5);
    expect(result.recallAt3).toBe(1.0);
    expect(result.recallAt5).toBe(1.0);
  });

  it("should pass query text and repository to search function", async () => {
    const testCase = createTestCase({
      queryText: "test query",
      repository: "org/test-repo",
    });
    const mockSearchFn = jest.fn().mockResolvedValue([]);

    await runRAGTestCase(testCase, mockSearchFn);

    expect(mockSearchFn).toHaveBeenCalledWith("test query", "org/test-repo");
  });

  it("should return retrieved doc IDs", async () => {
    const testCase = createTestCase();
    const mockSearchFn = jest
      .fn()
      .mockResolvedValue([
        createRetrievalResult("doc-a", 0.9, 1, false),
        createRetrievalResult("doc-b", 0.85, 2, false),
        createRetrievalResult("doc-c", 0.8, 3, false),
      ]);

    const result = await runRAGTestCase(testCase, mockSearchFn);

    expect(result.retrievedDocIds).toEqual(["doc-a", "doc-b", "doc-c"]);
  });

  it("should handle empty search results", async () => {
    const testCase = createTestCase();
    const mockSearchFn = jest.fn().mockResolvedValue([]);

    const result = await runRAGTestCase(testCase, mockSearchFn);

    expect(result.passed).toBe(false);
    expect(result.recallAt1).toBe(0);
    expect(result.recallAt3).toBe(0);
    expect(result.recallAt5).toBe(0);
    expect(result.retrievedDocIds).toEqual([]);
  });

  it("should handle test case without repository", async () => {
    const testCase = createTestCase({ repository: undefined });
    const mockSearchFn = jest.fn().mockResolvedValue([]);

    await runRAGTestCase(testCase, mockSearchFn);

    expect(mockSearchFn).toHaveBeenCalledWith(testCase.queryText, undefined);
  });
});

// ==================== getRAGEvaluationMetrics Tests ====================

describe("getRAGEvaluationMetrics", () => {
  it("should return default metrics when no data available", async () => {
    const metrics = await getRAGEvaluationMetrics();

    expect(metrics.totalFeedback).toBe(0);
    expect(metrics.helpfulCount).toBe(0);
    expect(metrics.notHelpfulCount).toBe(0);
    expect(metrics.partiallyHelpfulCount).toBe(0);
    expect(metrics.helpfulRate).toBe(0);
    expect(metrics.mrr).toBe(0);
    expect(metrics.averageSimilarity).toBe(0);
  });

  it("should return recallAtK object with default values", async () => {
    const metrics = await getRAGEvaluationMetrics();

    expect(metrics.recallAtK).toEqual({ 1: 0, 3: 0, 5: 0 });
  });

  it("should include timestamp in metrics", async () => {
    const beforeTimestamp = new Date().toISOString();
    const metrics = await getRAGEvaluationMetrics();
    const afterTimestamp = new Date().toISOString();

    expect(metrics.timestamp).toBeDefined();
    expect(metrics.timestamp >= beforeTimestamp).toBe(true);
    expect(metrics.timestamp <= afterTimestamp).toBe(true);
  });

  it("should accept custom window minutes parameter", async () => {
    // Just verify it doesn't throw with different values
    await expect(getRAGEvaluationMetrics(30)).resolves.toBeDefined();
    await expect(getRAGEvaluationMetrics(120)).resolves.toBeDefined();
    await expect(getRAGEvaluationMetrics(1440)).resolves.toBeDefined();
  });

  it("should use default 60 minutes when no parameter provided", async () => {
    // This tests the default parameter
    const metrics = await getRAGEvaluationMetrics();
    expect(metrics).toBeDefined();
  });
});

// ==================== Integration Tests ====================

describe("RAG Evaluation Integration", () => {
  it("should work together for a complete evaluation workflow", async () => {
    // 1. Record some feedback
    const feedbackInputs = [
      createValidFeedbackInput({ relevance: "helpful" }),
      createValidFeedbackInput({
        analysisId: "analysis-2",
        relevance: "not_helpful",
      }),
      createValidFeedbackInput({
        analysisId: "analysis-3",
        relevance: "partially_helpful",
      }),
    ];

    for (const input of feedbackInputs) {
      const result = await recordRAGFeedback(input);
      expect(result.success).toBe(true);
    }

    // 2. Calculate helpful rate
    const helpfulRate = calculateHelpfulRate(1, 3);
    expect(helpfulRate).toBeCloseTo(0.333, 2);

    // 3. Run a test case
    const testCase = createTestCase({ expectedDocIds: ["doc-1", "doc-2"] });
    const mockSearchFn = jest
      .fn()
      .mockResolvedValue([
        createRetrievalResult("doc-1", 0.9, 1, false),
        createRetrievalResult("doc-3", 0.85, 2, false),
        createRetrievalResult("doc-2", 0.8, 3, false),
      ]);

    const testResult = await runRAGTestCase(testCase, mockSearchFn);
    expect(testResult.passed).toBe(true);
    expect(testResult.recallAt3).toBe(1.0);
  });

  it("should calculate MRR for multiple test case results", () => {
    // Simulate results from multiple test cases
    const queryResults: RetrievalResult[][] = [
      // Test 1: relevant at rank 1
      [createRetrievalResult("doc-1", 0.9, 1, true), createRetrievalResult("doc-2", 0.8, 2, false)],
      // Test 2: relevant at rank 3
      [
        createRetrievalResult("doc-3", 0.9, 1, false),
        createRetrievalResult("doc-4", 0.85, 2, false),
        createRetrievalResult("doc-5", 0.8, 3, true),
      ],
      // Test 3: no relevant results
      [
        createRetrievalResult("doc-6", 0.9, 1, false),
        createRetrievalResult("doc-7", 0.85, 2, false),
      ],
    ];

    const mrr = calculateMRR(queryResults);
    // MRR = (1 + 0.333 + 0) / 3 = 0.444
    expect(mrr).toBeCloseTo(0.444, 2);
  });
});
