/**
 * Tests for GitHub Webhook Verification Middleware
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { verifyGitHubWebhook } from "../middleware/verifyGithub.js";
import { appConfig } from "../config/appConfig.js";
import { GITHUB_SIGNATURE } from "@kenchi/shared";

// Mock the appConfig
jest.mock("../config/appConfig.js", () => ({
  appConfig: {
    github: {
      webhookSecret: "test-webhook-secret",
    },
  },
}));

describe("verifyGitHubWebhook", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  const webhookSecret = "test-webhook-secret";
  const testPayload = JSON.stringify({ action: "opened", number: 1 });

  /**
   * Generate a valid GitHub webhook signature
   */
  const generateSignature = (payload: string, secret: string): string => {
    const hmac = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    return `${GITHUB_SIGNATURE.PREFIX}${hmac}`;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRequest = {
      path: "/webhooks/github",
      headers: {},
      rawBody: Buffer.from(testPayload),
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = jest.fn();

    // Reset the mock to ensure consistent secret value
    (appConfig.github as { webhookSecret: string }).webhookSecret = webhookSecret;
  });

  describe("with valid signature", () => {
    it("should call next() for valid signature", () => {
      const signature = generateSignature(testPayload, webhookSecret);
      mockRequest.headers = {
        [GITHUB_SIGNATURE.HEADER]: signature,
      };

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it("should handle different payload content", () => {
      const differentPayload = JSON.stringify({
        action: "synchronize",
        pull_request: { number: 42 },
      });
      mockRequest.rawBody = Buffer.from(differentPayload);
      const signature = generateSignature(differentPayload, webhookSecret);
      mockRequest.headers = {
        [GITHUB_SIGNATURE.HEADER]: signature,
      };

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("with invalid signature", () => {
    it("should return 401 for invalid signature", () => {
      const invalidSignature = `${GITHUB_SIGNATURE.PREFIX}invalidhexsignature1234567890abcdef`;
      mockRequest.headers = {
        [GITHUB_SIGNATURE.HEADER]: invalidSignature,
      };

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: "Invalid webhook signature" });
    });

    it("should return 401 for signature with wrong secret", () => {
      const wrongSecret = "wrong-secret";
      const signature = generateSignature(testPayload, wrongSecret);
      mockRequest.headers = {
        [GITHUB_SIGNATURE.HEADER]: signature,
      };

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should return 401 for signature without correct prefix", () => {
      const signatureWithoutPrefix = crypto
        .createHmac("sha256", webhookSecret)
        .update(testPayload, "utf8")
        .digest("hex");
      mockRequest.headers = {
        [GITHUB_SIGNATURE.HEADER]: signatureWithoutPrefix,
      };

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should handle malformed hex in signature", () => {
      const malformedSignature = `${GITHUB_SIGNATURE.PREFIX}notvalidhex!!!`;
      mockRequest.headers = {
        [GITHUB_SIGNATURE.HEADER]: malformedSignature,
      };

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("with missing signature", () => {
    it("should return 401 when signature header is missing", () => {
      mockRequest.headers = {};

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: "Missing webhook signature" });
    });

    it("should return 401 when signature is not a string", () => {
      mockRequest.headers = {
        [GITHUB_SIGNATURE.HEADER]: ["array", "value"],
      };

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("with missing raw body", () => {
    it("should return 500 when rawBody is not available", () => {
      const signature = generateSignature(testPayload, webhookSecret);
      mockRequest.headers = {
        [GITHUB_SIGNATURE.HEADER]: signature,
      };
      mockRequest.rawBody = undefined;

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Raw body not available for verification",
      });
    });
  });

  describe("without webhook secret configured", () => {
    it("should reject with 401 when no secret configured (VULN-502 fail-closed)", () => {
      (appConfig.github as { webhookSecret: string }).webhookSecret = "";
      mockRequest.headers = {};

      verifyGitHubWebhook(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Webhook verification not configured",
      });
    });
  });
});
