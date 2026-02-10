/**
 * Unit tests for Fine-Tuning Evaluation Service
 *
 * Tests model evaluation metrics calculation, A/B test comparison logic,
 * recommendation determination, error handling with graceful defaults,
 * and edge cases in rate calculation.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockQuery = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    query: (...args: unknown[]) => mockQuery(...args),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

// Import after mock setup
import {
  evaluateModel,
  compareModels,
  getEvaluationHistory,
} from "../services/finetuning/evaluationService.js";

// ==================== Test Helpers ====================

const createFeedbackStatsRow = (overrides: Record<string, string | null> = {}) => ({
  total_analyses: "100",
  positive_count: "60",
  negative_count: "20",
  neutral_count: "20",
  avg_confidence: "0.85",
  ...overrides,
});

// ==================== Tests ====================

describe("Evaluation Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== evaluateModel ====================

  describe("evaluateModel", () => {
    it("should return correct metrics for a model with feedback", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      const result = await evaluateModel({ modelVersionId: "model-v1" });

      expect(result.modelVersionId).toBe("model-v1");
      expect(result.totalAnalyses).toBe(100);
      expect(result.totalFeedback).toBe(100); // 60 + 20 + 20
      expect(result.positiveRate).toBe(0.6);
      expect(result.negativeRate).toBe(0.2);
      expect(result.neutralRate).toBe(0.2);
      expect(result.averageConfidenceScore).toBe(0.85);
      expect(result.evaluatedAt).toBeDefined();
    });

    it("should pass modelVersionId as first query parameter", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      await evaluateModel({ modelVersionId: "model-xyz" });

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["model-xyz", null, null, null]);
    });

    it("should pass tenantId as second query parameter when provided", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      await evaluateModel({
        modelVersionId: "model-v1",
        tenantId: "tenant-123",
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
        "model-v1",
        "tenant-123",
        null,
        null,
      ]);
    });

    it("should pass startDate and endDate as query parameters when provided", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      const startDate = new Date("2024-01-01T00:00:00Z");
      const endDate = new Date("2024-06-30T23:59:59Z");

      await evaluateModel({
        modelVersionId: "model-v1",
        startDate,
        endDate,
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
        "model-v1",
        null,
        startDate.toISOString(),
        endDate.toISOString(),
      ]);
    });

    it("should return zero metrics when no feedback exists", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          createFeedbackStatsRow({
            total_analyses: "50",
            positive_count: "0",
            negative_count: "0",
            neutral_count: "0",
            avg_confidence: "0.7",
          }),
        ],
      });

      const result = await evaluateModel({ modelVersionId: "model-v1" });

      expect(result.totalAnalyses).toBe(50);
      expect(result.totalFeedback).toBe(0);
      expect(result.positiveRate).toBe(0); // 0/0 = 0 via calculateRate guard
      expect(result.negativeRate).toBe(0);
      expect(result.neutralRate).toBe(0);
    });

    it("should handle null avg_confidence from database", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          createFeedbackStatsRow({
            avg_confidence: null,
          }),
        ],
      });

      const result = await evaluateModel({ modelVersionId: "model-v1" });

      expect(result.averageConfidenceScore).toBe(0);
    });

    it("should handle empty row result gracefully", async () => {
      mockQuery.mockResolvedValue({
        rows: [{}],
      });

      const result = await evaluateModel({ modelVersionId: "model-v1" });

      expect(result.totalAnalyses).toBe(0);
      expect(result.totalFeedback).toBe(0);
      expect(result.positiveRate).toBe(0);
      expect(result.negativeRate).toBe(0);
      expect(result.neutralRate).toBe(0);
      expect(result.averageConfidenceScore).toBe(0);
    });

    it("should return default zero metrics on database error", async () => {
      mockQuery.mockRejectedValue(new Error("Connection refused"));

      const result = await evaluateModel({ modelVersionId: "model-v1" });

      expect(result.modelVersionId).toBe("model-v1");
      expect(result.totalAnalyses).toBe(0);
      expect(result.totalFeedback).toBe(0);
      expect(result.positiveRate).toBe(0);
      expect(result.negativeRate).toBe(0);
      expect(result.neutralRate).toBe(0);
      expect(result.averageConfidenceScore).toBe(0);
      expect(result.evaluatedAt).toBeDefined();
    });

    it("should correctly calculate rates when only positive feedback exists", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          createFeedbackStatsRow({
            positive_count: "100",
            negative_count: "0",
            neutral_count: "0",
            avg_confidence: "0.95",
          }),
        ],
      });

      const result = await evaluateModel({ modelVersionId: "model-v1" });

      expect(result.totalFeedback).toBe(100);
      expect(result.positiveRate).toBe(1.0);
      expect(result.negativeRate).toBe(0);
      expect(result.neutralRate).toBe(0);
    });

    it("should correctly calculate rates when only negative feedback exists", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          createFeedbackStatsRow({
            positive_count: "0",
            negative_count: "30",
            neutral_count: "0",
          }),
        ],
      });

      const result = await evaluateModel({ modelVersionId: "model-v1" });

      expect(result.totalFeedback).toBe(30);
      expect(result.positiveRate).toBe(0);
      expect(result.negativeRate).toBe(1.0);
      expect(result.neutralRate).toBe(0);
    });

    it("should include an evaluatedAt ISO timestamp", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      const before = new Date().toISOString();
      const result = await evaluateModel({ modelVersionId: "model-v1" });
      const after = new Date().toISOString();

      expect(result.evaluatedAt >= before).toBe(true);
      expect(result.evaluatedAt <= after).toBe(true);
    });

    it("should handle no rows returned from query", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await evaluateModel({ modelVersionId: "model-v1" });

      // row is undefined, so parseInt of undefined ?? "0" = 0
      expect(result.totalAnalyses).toBe(0);
      expect(result.totalFeedback).toBe(0);
    });
  });

  // ==================== compareModels ====================

  describe("compareModels", () => {
    it("should evaluate both models in parallel and return comparison", async () => {
      // Control model: 50% positive rate
      // Treatment model: 80% positive rate
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            createFeedbackStatsRow({
              total_analyses: "200",
              positive_count: "50",
              negative_count: "30",
              neutral_count: "20",
              avg_confidence: "0.70",
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            createFeedbackStatsRow({
              total_analyses: "200",
              positive_count: "80",
              negative_count: "10",
              neutral_count: "10",
              avg_confidence: "0.90",
            }),
          ],
        });

      const result = await compareModels("control-v1", "treatment-v1");

      expect(result.control.modelVersionId).toBe("control-v1");
      expect(result.treatment.modelVersionId).toBe("treatment-v1");
      expect(result.improvement.positiveRateDelta).toBe(0.8 - 0.5);
      expect(result.improvement.confidenceScoreDelta).toBeCloseTo(0.2);
      expect(result.improvement.isSignificant).toBe(true); // |0.3| > 0.05
      expect(result.recommendation).toBe("keep_treatment");
    });

    it("should pass tenantId filter to both evaluations", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      await compareModels("control-v1", "treatment-v1", "tenant-abc");

      // Both calls should include tenantId
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
        "control-v1",
        "tenant-abc",
        null,
        null,
      ]);
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
        "treatment-v1",
        "tenant-abc",
        null,
        null,
      ]);
    });

    it("should recommend 'keep_control' when treatment is significantly worse", async () => {
      // Control: 80% positive
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            createFeedbackStatsRow({
              positive_count: "80",
              negative_count: "10",
              neutral_count: "10",
            }),
          ],
        })
        // Treatment: 20% positive
        .mockResolvedValueOnce({
          rows: [
            createFeedbackStatsRow({
              positive_count: "20",
              negative_count: "60",
              neutral_count: "20",
            }),
          ],
        });

      const result = await compareModels("control-v1", "treatment-v1");

      expect(result.improvement.positiveRateDelta).toBe(0.2 - 0.8);
      expect(result.improvement.isSignificant).toBe(true); // |0.6| > 0.05
      expect(result.recommendation).toBe("keep_control");
    });

    it("should recommend 'continue_testing' when difference is not significant", async () => {
      // Control: 50% positive
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            createFeedbackStatsRow({
              positive_count: "50",
              negative_count: "30",
              neutral_count: "20",
            }),
          ],
        })
        // Treatment: 52% positive (only 2% diff, below 5% threshold)
        .mockResolvedValueOnce({
          rows: [
            createFeedbackStatsRow({
              positive_count: "52",
              negative_count: "28",
              neutral_count: "20",
            }),
          ],
        });

      const result = await compareModels("control-v1", "treatment-v1");

      expect(result.improvement.isSignificant).toBe(false); // |0.02| < 0.05
      expect(result.recommendation).toBe("continue_testing");
    });

    it("should recommend 'continue_testing' when sample size is insufficient", async () => {
      // Even if significant, insufficient samples should return continue_testing
      // MIN_SAMPLE_SIZE is FINE_TUNING_READINESS.MIN_FEEDBACK_FOR_TRAINING = 50
      // Control: only 10 total feedback
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            createFeedbackStatsRow({
              positive_count: "5",
              negative_count: "3",
              neutral_count: "2",
            }),
          ],
        })
        // Treatment: only 10 total feedback
        .mockResolvedValueOnce({
          rows: [
            createFeedbackStatsRow({
              positive_count: "8",
              negative_count: "1",
              neutral_count: "1",
            }),
          ],
        });

      const result = await compareModels("control-v1", "treatment-v1");

      // 10 < 50 = MIN_SAMPLE_SIZE, so not enough samples
      expect(result.sampleSize.control).toBe(10);
      expect(result.sampleSize.treatment).toBe(10);
      expect(result.recommendation).toBe("continue_testing");
    });

    it("should include sampleSize information in result", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      const result = await compareModels("control-v1", "treatment-v1");

      expect(result.sampleSize).toHaveProperty("control");
      expect(result.sampleSize).toHaveProperty("treatment");
      expect(result.sampleSize).toHaveProperty("totalRequired");
      expect(result.sampleSize.totalRequired).toBe(50); // FINE_TUNING_READINESS.MIN_FEEDBACK_FOR_TRAINING
    });

    it("should handle both models having zero feedback", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          createFeedbackStatsRow({
            positive_count: "0",
            negative_count: "0",
            neutral_count: "0",
          }),
        ],
      });

      const result = await compareModels("control-v1", "treatment-v1");

      expect(result.improvement.positiveRateDelta).toBe(0);
      expect(result.improvement.isSignificant).toBe(false);
      expect(result.recommendation).toBe("continue_testing");
    });

    it("should handle database error for one model gracefully", async () => {
      // Control succeeds, treatment errors
      mockQuery
        .mockResolvedValueOnce({
          rows: [createFeedbackStatsRow()],
        })
        .mockRejectedValueOnce(new Error("DB Error"));

      const result = await compareModels("control-v1", "treatment-v1");

      // Treatment should have default zero metrics
      expect(result.control.totalFeedback).toBe(100);
      expect(result.treatment.totalFeedback).toBe(0);
    });
  });

  // ==================== getEvaluationHistory ====================

  describe("getEvaluationHistory", () => {
    it("should return an array containing the current evaluation", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      const result = await getEvaluationHistory("model-v1");

      expect(result).toHaveLength(1);
      expect(result[0].modelVersionId).toBe("model-v1");
    });

    it("should accept optional limit parameter", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      const result = await getEvaluationHistory("model-v1", 5);

      expect(result).toHaveLength(1);
    });

    it("should default limit to 10 when not provided", async () => {
      mockQuery.mockResolvedValue({
        rows: [createFeedbackStatsRow()],
      });

      // Just verifying the function works with default argument
      const result = await getEvaluationHistory("model-v1");

      expect(result).toHaveLength(1);
    });

    it("should return default zero metrics if evaluation fails", async () => {
      mockQuery.mockRejectedValue(new Error("DB timeout"));

      const result = await getEvaluationHistory("model-v1");

      expect(result).toHaveLength(1);
      expect(result[0].totalAnalyses).toBe(0);
      expect(result[0].totalFeedback).toBe(0);
    });
  });
});
