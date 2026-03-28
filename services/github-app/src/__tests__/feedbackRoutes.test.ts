/**
 * Unit tests for Feedback Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

// Mock functions
const mockParseFeedbackUrl = jest.fn();
const mockCreateOrUpdateAnalysisFeedback = jest.fn();
const mockGetLatestAnalysisByAggregationKey = jest.fn();

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  config: {
    GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
  },
  UI_EMOJI: {
    success: "✅",
    failure: "❌",
  },
  parseFeedbackUrl: mockParseFeedbackUrl,
  createOrUpdateAnalysisFeedback: mockCreateOrUpdateAnalysisFeedback,
  getLatestAnalysisByAggregationKey: mockGetLatestAnalysisByAggregationKey,
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  asyncHandler:
    (fn: (...args: unknown[]) => Promise<unknown>) =>
    async (req: unknown, res: unknown, next: unknown) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        (next as (err: unknown) => void)(error);
      }
    },
  AppError: jest.fn((message: string) => {
    const error = new Error(message);
    error.name = "AppError";
    return error;
  }),
  rateLimitByCategory: jest.fn(
    () => (_req: unknown, _res: unknown, next: unknown) => (next as () => void)()
  ),
}));

// Import after mocks
import { feedbackRoutes } from "../routes/feedbackRoutes.js";

describe("Feedback Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockParseFeedbackUrl.mockResolvedValue({
      analysisId: "analysis-123",
      feedbackType: "correct",
      timestamp: Date.now(),
    });

    mockCreateOrUpdateAnalysisFeedback.mockResolvedValue({
      id: "feedback-123",
      wasUpdated: false,
    });

    mockGetLatestAnalysisByAggregationKey.mockResolvedValue({
      id: "ana_resolved-123",
      aggregationKey: "analysis-123",
      tenantId: "test-tenant",
    });

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(feedbackRoutes);
  });

  describe("GET /api/feedback", () => {
    describe("successful feedback submission", () => {
      it("should record positive feedback successfully", async () => {
        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.status).toBe(200);
        expect(response.text).toContain("Feedback Recorded");
        expect(response.text).toContain("Thanks!");
      });

      it("should record negative feedback successfully", async () => {
        mockParseFeedbackUrl.mockResolvedValue({
          analysisId: "analysis-123",
          feedbackType: "incorrect",
          timestamp: Date.now(),
        });

        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=incorrect&sig=valid"
        );

        expect(response.status).toBe(200);
        expect(response.text).toContain("Feedback Recorded");
        expect(response.text).toContain("We'll use this to improve");
      });

      it("should show update message when vote was changed", async () => {
        mockCreateOrUpdateAnalysisFeedback.mockResolvedValue({
          id: "feedback-123",
          wasUpdated: true,
        });

        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.status).toBe(200);
        expect(response.text).toContain("updated your previous vote");
      });

      it("should not show update message for new vote", async () => {
        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.status).toBe(200);
        expect(response.text).not.toContain("updated your previous vote");
      });

      it("should call createOrUpdateAnalysisFeedback with correct params", async () => {
        await request(app).get("/api/feedback?analysisId=analysis-123&type=correct&sig=valid");

        expect(mockCreateOrUpdateAnalysisFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            analysisId: "ana_resolved-123",
            feedbackType: "correct",
            userId: expect.stringMatching(/^(github:|ip:)/),
          })
        );
      });
    });

    describe("user identification", () => {
      it("should use GitHub user from header when available", async () => {
        await request(app)
          .get("/api/feedback?analysisId=analysis-123&type=correct&sig=valid")
          .set("x-github-user", "testuser");

        expect(mockCreateOrUpdateAnalysisFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "github:testuser",
          })
        );
      });

      it("should fallback to IP-based identifier", async () => {
        await request(app)
          .get("/api/feedback?analysisId=analysis-123&type=correct&sig=valid")
          .set("x-forwarded-for", "192.168.1.1");

        expect(mockCreateOrUpdateAnalysisFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "ip:192.168.1.1",
          })
        );
      });

      it("should handle multiple IPs in x-forwarded-for", async () => {
        await request(app)
          .get("/api/feedback?analysisId=analysis-123&type=correct&sig=valid")
          .set("x-forwarded-for", "10.0.0.1, 192.168.1.1");

        expect(mockCreateOrUpdateAnalysisFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: expect.stringContaining("ip:"),
          })
        );
      });
    });

    describe("invalid feedback URL", () => {
      it("should return error for invalid signature", async () => {
        mockParseFeedbackUrl.mockResolvedValue(null);

        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=invalid"
        );

        expect(response.status).toBe(400);
        expect(response.text).toContain("Feedback Error");
        expect(response.text).toContain("invalid or has expired");
      });

      it("should return error for expired link", async () => {
        mockParseFeedbackUrl.mockResolvedValue(null);

        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=expired"
        );

        expect(response.status).toBe(400);
        expect(response.text).toContain("invalid or has expired");
      });
    });

    describe("invalid feedback type", () => {
      it("should return error for unknown feedback type", async () => {
        mockParseFeedbackUrl.mockResolvedValue({
          analysisId: "analysis-123",
          feedbackType: "unknown",
          timestamp: Date.now(),
        });

        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=unknown&sig=valid"
        );

        expect(response.status).toBe(400);
        expect(response.text).toContain("Invalid feedback type");
      });

      it("should return error for empty feedback type", async () => {
        mockParseFeedbackUrl.mockResolvedValue({
          analysisId: "analysis-123",
          feedbackType: "",
          timestamp: Date.now(),
        });

        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=&sig=valid"
        );

        expect(response.status).toBe(400);
        expect(response.text).toContain("Invalid feedback type");
      });
    });

    describe("error handling", () => {
      it("should handle database errors gracefully", async () => {
        mockCreateOrUpdateAnalysisFeedback.mockRejectedValue(
          new Error("Database connection failed")
        );

        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.status).toBe(500);
        expect(response.text).toContain("error occurred");
      });

      it("should handle URL parsing errors", async () => {
        mockParseFeedbackUrl.mockRejectedValue(new Error("Invalid URL format"));

        const response = await request(app).get("/api/feedback?invalid=params");

        expect(response.status).toBe(500);
        expect(response.text).toContain("error occurred");
      });
    });

    describe("HTML response format", () => {
      it("should return valid HTML document", async () => {
        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.text).toContain("<!DOCTYPE html>");
        expect(response.text).toContain("<html>");
        expect(response.text).toContain("</html>");
      });

      it("should include success emoji for positive feedback", async () => {
        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.text).toContain("✅");
      });

      it("should include failure emoji for error", async () => {
        mockParseFeedbackUrl.mockResolvedValue(null);

        const response = await request(app).get("/api/feedback?invalid=url");

        expect(response.text).toContain("❌");
      });

      it("should include close hint", async () => {
        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.text).toContain("close this tab");
      });

      it("should include KenchiOps branding", async () => {
        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.text).toContain("KenchiOps");
      });

      it("should be mobile-responsive", async () => {
        const response = await request(app).get(
          "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
        );

        expect(response.text).toContain("viewport");
        expect(response.text).toContain("width=device-width");
      });
    });

    describe("feedback type mapping", () => {
      it("should map 'correct' to correct feedback type", async () => {
        mockParseFeedbackUrl.mockResolvedValue({
          analysisId: "analysis-123",
          feedbackType: "correct",
          timestamp: Date.now(),
        });

        await request(app).get("/api/feedback?analysisId=analysis-123&type=correct&sig=valid");

        expect(mockCreateOrUpdateAnalysisFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            feedbackType: "correct",
          })
        );
      });

      it("should map 'incorrect' to incorrect feedback type", async () => {
        mockParseFeedbackUrl.mockResolvedValue({
          analysisId: "analysis-123",
          feedbackType: "incorrect",
          timestamp: Date.now(),
        });

        await request(app).get("/api/feedback?analysisId=analysis-123&type=incorrect&sig=valid");

        expect(mockCreateOrUpdateAnalysisFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            feedbackType: "incorrect",
          })
        );
      });
    });

    describe("concurrent requests", () => {
      it("should handle concurrent feedback submissions", async () => {
        const requests = Array.from({ length: 5 }, (_, i) =>
          request(app).get(`/api/feedback?analysisId=analysis-${i}&type=correct&sig=valid`)
        );

        const responses = await Promise.all(requests);

        responses.forEach((response) => {
          expect(response.status).toBe(200);
          expect(response.text).toContain("Feedback Recorded");
        });
      });
    });

    describe("edge cases", () => {
      it("should handle very long analysis IDs", async () => {
        const longId = "a".repeat(1000);
        mockParseFeedbackUrl.mockResolvedValue({
          analysisId: longId,
          feedbackType: "correct",
          timestamp: Date.now(),
        });

        const response = await request(app).get(
          `/api/feedback?analysisId=${longId}&type=correct&sig=valid`
        );

        expect(response.status).toBe(200);
      });

      it("should handle special characters in user identifier", async () => {
        await request(app)
          .get("/api/feedback?analysisId=analysis-123&type=correct&sig=valid")
          .set("x-github-user", "user@example.com");

        expect(mockCreateOrUpdateAnalysisFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "github:user@example.com",
          })
        );
      });

      it("should handle IPv6 addresses", async () => {
        await request(app)
          .get("/api/feedback?analysisId=analysis-123&type=correct&sig=valid")
          .set("x-forwarded-for", "::1");

        expect(mockCreateOrUpdateAnalysisFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "ip:::1",
          })
        );
      });
    });
  });

  describe("missing webhook secret", () => {
    it("should handle missing webhook secret configuration", async () => {
      // Reset mock to return empty secret
      const sharedMock = jest.requireMock("@kenchi/shared") as {
        config: { GITHUB_WEBHOOK_SECRET: string };
      };
      sharedMock.config.GITHUB_WEBHOOK_SECRET = "";

      const response = await request(app).get(
        "/api/feedback?analysisId=analysis-123&type=correct&sig=valid"
      );

      expect(response.status).toBe(500);
      expect(response.text).toContain("error occurred");

      // Restore
      sharedMock.config.GITHUB_WEBHOOK_SECRET = "test-webhook-secret";
    });
  });
});
