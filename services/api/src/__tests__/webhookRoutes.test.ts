/**
 * Unit tests for Webhook Routes
 *
 * VULN-501: The generic webhook endpoint has been disabled and now returns 404
 * for all requests. Source-specific webhook endpoints (GitHub, GitLab, Stripe,
 * Slack) have their own dedicated routes with proper signature verification.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";
import { webhookRoutes } from "../routes/webhookRoutes.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    asyncHandler: (
      fn: (
        req: unknown,
        res: unknown,
        next: (error?: unknown) => void
      ) => Promise<unknown> | unknown
    ) => fn,
    HTTP_STATUS: {
      OK: 200,
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      NOT_FOUND: 404,
      INTERNAL_SERVER_ERROR: 500,
    },
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
    rateLimitByCategory: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  };
});

describe("Webhook Routes", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(webhookRoutes);
  });

  describe("POST /webhook/:source (VULN-501 disabled)", () => {
    it("should return 404 NOT_FOUND for any source", async () => {
      const response = await request(app).post("/webhook/github").send({ event: "push" });

      expect(response.status).toBe(404);
      expect(response.body.error).toHaveProperty("code", "NOT_SUPPORTED");
      expect(response.body.error.message).toContain("not supported");
    });

    it("should return 404 for slack source", async () => {
      const response = await request(app).post("/webhook/slack").send({});

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_SUPPORTED");
    });

    it("should return 404 for custom source", async () => {
      const response = await request(app).post("/webhook/custom-source").send({});

      expect(response.status).toBe(404);
    });

    it("should respond with JSON content type", async () => {
      const response = await request(app).post("/webhook/github").send({});

      expect(response.status).toBe(404);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });
  });

  describe("error handling", () => {
    it("should not accept GET requests", async () => {
      const response = await request(app).get("/webhook/github");

      expect(response.status).toBe(404);
    });

    it("should not accept PUT requests", async () => {
      const response = await request(app).put("/webhook/github").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept DELETE requests", async () => {
      const response = await request(app).delete("/webhook/github");

      expect(response.status).toBe(404);
    });
  });
});
