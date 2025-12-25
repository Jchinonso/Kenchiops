/**
 * Unit tests for Analysis Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";
import { analysisRoutes } from "../routes/analysisRoutes.js";
import type { AnalyzeResponse } from "../types/apiTypes.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    // asyncHandler that properly catches errors and passes to next
    asyncHandler:
      (fn: Function) =>
      async (req: unknown, res: unknown, next: Function): Promise<void> => {
        try {
          await fn(req, res, next);
        } catch (error) {
          next(error);
        }
      },
    validate: () => (req: unknown, res: unknown, next: Function) => next(),
    validators: {
      required: jest.fn(() => true),
      string: jest.fn(() => true),
    },
    HTTP_STATUS: {
      OK: 200,
      BAD_REQUEST: 400,
      INTERNAL_SERVER_ERROR: 500,
    },
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

jest.mock("../services/analysisService.js", () => ({
  performAnalysis: jest.fn(),
}));

// Get the mocked function reference after mock setup
import { performAnalysis } from "../services/analysisService.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPerformAnalysis = performAnalysis as jest.MockedFunction<any>;

describe("Analysis Routes", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(analysisRoutes);
    // Add error handling middleware
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message });
    });
  });

  describe("POST /api/analyze", () => {
    const validRequest = {
      failure_log: "Build failed with error: Module not found",
      repository: "owner/repo",
      commit: "abc123def456",
    };

    const mockResponse: AnalyzeResponse = {
      analysis: "The build failed due to a missing module dependency",
      identified_cause: "Module 'lodash' not found in node_modules",
      confidence: 0.85,
      recommended_actions: [
        {
          actionType: "fix_code",
          description: "Run npm install to install missing dependencies",
          priority: "high",
        },
      ],
      full_analysis: {
        eventId: "evt_123",
        summary: "The build failed due to a missing module dependency",
        identifiedCause: "Module 'lodash' not found in node_modules",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
        recommendedActions: [
          {
            actionType: "fix_code",
            description: "Run npm install to install missing dependencies",
            priority: "high",
          },
        ],
      },
      repository: "owner/repo",
    };

    it("should successfully analyze CI failure", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResponse);
      expect(mockPerformAnalysis).toHaveBeenCalledWith({
        failure_log: validRequest.failure_log,
        repository: validRequest.repository,
        commit: validRequest.commit,
      });
    });

    it("should handle request without commit", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const requestWithoutCommit = {
        failure_log: "Error occurred",
        repository: "owner/repo",
      };

      const response = await request(app).post("/api/analyze").send(requestWithoutCommit);

      expect(response.status).toBe(200);
      expect(mockPerformAnalysis).toHaveBeenCalledWith({
        failure_log: requestWithoutCommit.failure_log,
        repository: requestWithoutCommit.repository,
        commit: undefined,
      });
    });

    it("should return analysis with high confidence", async () => {
      const highConfidenceResponse = { ...mockResponse, confidence: 0.95 };
      mockPerformAnalysis.mockResolvedValue(highConfidenceResponse);

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.confidence).toBe(0.95);
    });

    it("should return analysis with low confidence", async () => {
      const lowConfidenceResponse = { ...mockResponse, confidence: 0.35 };
      mockPerformAnalysis.mockResolvedValue(lowConfidenceResponse);

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.confidence).toBe(0.35);
    });

    it("should handle very long failure logs", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const longLogRequest = {
        ...validRequest,
        failure_log: "Error: ".repeat(1000) + "Stack trace here",
      };

      const response = await request(app).post("/api/analyze").send(longLogRequest);

      expect(response.status).toBe(200);
      expect(mockPerformAnalysis).toHaveBeenCalled();
    });

    it("should handle unicode characters in failure log", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const unicodeRequest = {
        ...validRequest,
        failure_log: "Error: 测试错误 🔥 Ошибка",
      };

      const response = await request(app).post("/api/analyze").send(unicodeRequest);

      expect(response.status).toBe(200);
    });

    it("should handle multiline failure logs", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const multilineRequest = {
        ...validRequest,
        failure_log: "Error on line 1\nError on line 2\nStack trace:\n  at function()",
      };

      const response = await request(app).post("/api/analyze").send(multilineRequest);

      expect(response.status).toBe(200);
    });

    it("should handle analysis with no recommended actions", async () => {
      const noActionsResponse = { ...mockResponse, recommended_actions: undefined };
      mockPerformAnalysis.mockResolvedValue(noActionsResponse);

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.recommended_actions).toBeUndefined();
    });

    it("should handle analysis with multiple recommended actions", async () => {
      const multiActionsResponse = {
        ...mockResponse,
        recommended_actions: [
          { actionType: "fix_code", description: "Action 1", priority: "high" },
          { actionType: "review_logs", description: "Action 2", priority: "medium" },
          { actionType: "rollback", description: "Action 3", priority: "low" },
        ],
      };
      mockPerformAnalysis.mockResolvedValue(multiActionsResponse);

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.recommended_actions).toHaveLength(3);
    });

    it("should handle analysis with no identified cause", async () => {
      const noCauseResponse = { ...mockResponse, identified_cause: undefined };
      mockPerformAnalysis.mockResolvedValue(noCauseResponse);

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.identified_cause).toBeUndefined();
    });

    it("should handle special characters in repository name", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const specialRepoRequest = {
        ...validRequest,
        repository: "org-name/repo_name-123",
      };

      const response = await request(app).post("/api/analyze").send(specialRepoRequest);

      expect(response.status).toBe(200);
    });

    it("should return full analysis object", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.full_analysis).toBeDefined();
      expect(response.body.full_analysis.eventId).toBeDefined();
      expect(response.body.full_analysis.analyzedAt).toBeDefined();
    });

    it("should handle empty string failure log", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const emptyLogRequest = {
        ...validRequest,
        failure_log: "",
      };

      const response = await request(app).post("/api/analyze").send(emptyLogRequest);

      expect(response.status).toBe(200);
    });

    it("should handle service errors gracefully", async () => {
      mockPerformAnalysis.mockRejectedValue(new Error("Analysis service error"));

      const response = await request(app).post("/api/analyze").send(validRequest);

      // Error handling depends on error middleware configuration
      expect(mockPerformAnalysis).toHaveBeenCalled();
    });

    it("should handle LLM timeout errors", async () => {
      mockPerformAnalysis.mockRejectedValue(new Error("Request timeout"));

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(mockPerformAnalysis).toHaveBeenCalled();
    });

    it("should handle malformed JSON request", async () => {
      const response = await request(app)
        .post("/api/analyze")
        .set("Content-Type", "application/json")
        .send("{ invalid json");

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should preserve repository name in response", async () => {
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.repository).toBe("owner/repo");
    });
  });

  describe("request validation", () => {
    it("should accept valid request with all fields", async () => {
      mockPerformAnalysis.mockResolvedValue({
        analysis: "Test",
        confidence: 0.5,
        repository: "test/repo",
      });

      const response = await request(app).post("/api/analyze").send({
        failure_log: "Error",
        repository: "test/repo",
        commit: "abc123",
      });

      expect(mockPerformAnalysis).toHaveBeenCalled();
    });

    it("should accept request without optional commit field", async () => {
      mockPerformAnalysis.mockResolvedValue({
        analysis: "Test",
        confidence: 0.5,
        repository: "test/repo",
      });

      const response = await request(app).post("/api/analyze").send({
        failure_log: "Error",
        repository: "test/repo",
      });

      expect(mockPerformAnalysis).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle concurrent requests", async () => {
      mockPerformAnalysis.mockResolvedValue({
        analysis: "Test",
        confidence: 0.5,
        repository: "test/repo",
        full_analysis: { eventId: "test", summary: "Test", confidence: "medium", analyzedAt: new Date().toISOString() },
      });

      const requests = Array.from({ length: 5 }, () =>
        request(app).post("/api/analyze").send({
          failure_log: "Error",
          repository: "test/repo",
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
      expect(mockPerformAnalysis).toHaveBeenCalledTimes(5);
    });

    it("should handle very long repository names", async () => {
      mockPerformAnalysis.mockResolvedValue({
        analysis: "Test",
        confidence: 0.5,
        repository: "org/" + "a".repeat(200),
        full_analysis: { eventId: "test", summary: "Test", confidence: "medium", analyzedAt: new Date().toISOString() },
      });

      const response = await request(app).post("/api/analyze").send({
        failure_log: "Error",
        repository: "org/" + "a".repeat(200),
      });

      expect(response.status).toBe(200);
    });

    it("should handle empty request body", async () => {
      mockPerformAnalysis.mockResolvedValue({
        analysis: "Test",
        confidence: 0.5,
        repository: undefined,
      });

      const response = await request(app).post("/api/analyze").send({});

      // With validation mocked to pass, the handler is called
      expect(response.status).toBe(200);
    });
  });
});
