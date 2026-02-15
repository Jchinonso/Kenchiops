/**
 * Unit tests for http/authMiddleware.ts — HMAC internal service auth paths
 *
 * Tests the dual auth strategy added for Phase 1 dashboard:
 * - Public routes skip both HMAC and JWT
 * - Requests with valid HMAC headers bypass JWT and call next()
 * - Requests with invalid HMAC headers return AuthenticationError
 * - Requests with HMAC headers but no INTERNAL_SERVICE_SECRET fall through to JWT
 * - Requests without HMAC headers go through normal JWT flow
 * - Context enrichment with actor='service:xxx' for HMAC-authed requests
 * - rawBody vs JSON.stringify(body) for signature verification
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { AuthenticationError } from "../../core/errors.js";
import type { AuthenticatedUser } from "../../database/user/types.js";
import type { RequestContext } from "../../core/types.js";

// ==================== Mock Functions ====================

const mockVerifyAccessToken = jest.fn<(token: string) => AuthenticatedUser>();
const mockVerifyInternalSignature =
  jest.fn<(signature: string, timestamp: string, rawBody: string, secret: string) => boolean>();
const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerInfo = jest.fn();

// ==================== Mocks ====================

jest.mock("../../security/jwt.js", () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(args[0] as string),
}));

jest.mock("../../security/cookies.js", () => ({
  extractAccessToken: (req: { headers: Record<string, string | undefined> }) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      return token.length > 0 ? token : null;
    }
    return null;
  },
}));

jest.mock("../../core/index.js", () => ({
  createLogger: jest.fn(() => ({
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: jest.fn(),
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
  })),
  AuthenticationError,
}));

jest.mock("../../http/internalAuth.js", () => ({
  INTERNAL_AUTH_HEADERS: {
    SIGNATURE: "x-kenchi-signature",
    TIMESTAMP: "x-kenchi-timestamp",
    SERVICE: "x-kenchi-service",
  },
  verifyInternalSignature: (...args: unknown[]) =>
    mockVerifyInternalSignature(
      args[0] as string,
      args[1] as string,
      args[2] as string,
      args[3] as string
    ),
}));

// Mutable config reference so tests can toggle INTERNAL_SERVICE_SECRET
const mockConfig = {
  INTERNAL_SERVICE_SECRET: "test-secret-key" as string | undefined,
};

jest.mock("../../core/config.js", () => ({
  get config() {
    return mockConfig;
  },
}));

// Import after mock setup — must come after all jest.mock calls
import { authMiddleware } from "../../http/authMiddleware.js";

// ==================== Test Fixtures ====================

const createTestAuthenticatedUser = (
  overrides: Partial<AuthenticatedUser> = {}
): AuthenticatedUser => ({
  userId: "usr_test-123",
  tenantId: "tenant-abc",
  role: "member",
  tokenId: "jti-test-456",
  ...overrides,
});

const createMockRequest = (
  overrides: Partial<Request> & {
    context?: RequestContext;
    rawBody?: Buffer;
  } = {}
): Request => {
  const { context, rawBody, ...rest } = overrides;
  const req = {
    path: "/api/v1/dashboard/stats",
    headers: {},
    body: {},
    ...rest,
  } as unknown as Request;

  if (context) {
    (req as Request & { context: RequestContext }).context = context;
  }

  if (rawBody !== undefined) {
    (req as Request & { rawBody: Buffer }).rawBody = rawBody;
  }

  return req;
};

const createMockResponse = (): Response =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as unknown as Response;

const createMockNext = (): jest.Mock<NextFunction> => jest.fn<NextFunction>();

const testContext: RequestContext = {
  requestId: "test-req-id",
  tenantId: "test-tenant",
};

// ==================== Tests ====================

describe("http/authMiddleware — HMAC internal service auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.INTERNAL_SERVICE_SECRET = "test-secret-key";
  });

  describe("public routes skip both HMAC and JWT", () => {
    it("should call next() without checking HMAC headers for /health", () => {
      const req = createMockRequest({
        path: "/health",
        headers: {
          "x-kenchi-signature": "sha256=abc",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "github-app",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(mockVerifyInternalSignature).not.toHaveBeenCalled();
      expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    });

    it("should call next() without checking HMAC for /webhooks/ routes", () => {
      const req = createMockRequest({
        path: "/webhooks/github",
        headers: {
          "x-kenchi-signature": "sha256=abc",
          "x-kenchi-timestamp": "1234567890",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockVerifyInternalSignature).not.toHaveBeenCalled();
    });
  });

  describe("valid HMAC headers bypass JWT", () => {
    it("should call next() when HMAC signature is valid", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid-sig",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "github-app",
        },
        body: { key: "value" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    });

    it("should not attempt JWT verification when HMAC is valid", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/analyses",
        headers: {
          "x-kenchi-signature": "sha256=valid-sig",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "api-service",
          authorization: "Bearer some-jwt-token",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    });

    it("should pass JSON.stringify(body) to verifyInternalSignature when rawBody is absent", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const bodyPayload = { repository: "org/repo", commit: "abc123" };
      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid-sig",
          "x-kenchi-timestamp": "1234567890",
        },
        body: bodyPayload,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyInternalSignature).toHaveBeenCalledWith(
        "sha256=valid-sig",
        "1234567890",
        JSON.stringify(bodyPayload),
        "test-secret-key"
      );
    });

    it("should pass rawBody string to verifyInternalSignature when rawBody Buffer is present", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const rawBodyContent = '{"raw":"body"}';
      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid-sig",
          "x-kenchi-timestamp": "1234567890",
        },
        body: { parsed: "different" },
        rawBody: Buffer.from(rawBodyContent, "utf-8"),
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyInternalSignature).toHaveBeenCalledWith(
        "sha256=valid-sig",
        "1234567890",
        rawBodyContent,
        "test-secret-key"
      );
    });

    it("should log debug message on successful HMAC verification", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid-sig",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "github-app",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        "Internal service auth verified",
        expect.objectContaining({
          path: "/api/v1/dashboard/stats",
          service: "github-app",
        })
      );
    });
  });

  describe("invalid HMAC headers return AuthenticationError", () => {
    it("should pass AuthenticationError to next() when signature is invalid", () => {
      mockVerifyInternalSignature.mockReturnValue(false);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=bad-signature",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "rogue-service",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
      expect((passedError as AuthenticationError).message).toBe(
        "Invalid internal authentication signature"
      );
    });

    it("should log a warning with path and service name when HMAC fails", () => {
      mockVerifyInternalSignature.mockReturnValue(false);

      const req = createMockRequest({
        path: "/api/v1/dashboard/analyses",
        headers: {
          "x-kenchi-signature": "sha256=invalid",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "slack-bot",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "Internal auth signature verification failed",
        expect.objectContaining({
          path: "/api/v1/dashboard/analyses",
          service: "slack-bot",
        })
      );
    });

    it("should log service as 'unknown' when x-kenchi-service header is absent", () => {
      mockVerifyInternalSignature.mockReturnValue(false);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=invalid",
          "x-kenchi-timestamp": "1234567890",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "Internal auth signature verification failed",
        expect.objectContaining({
          service: "unknown",
        })
      );
    });

    it("should not attempt JWT verification after HMAC rejection", () => {
      mockVerifyInternalSignature.mockReturnValue(false);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=invalid",
          "x-kenchi-timestamp": "1234567890",
          authorization: "Bearer valid-jwt",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    });
  });

  describe("HMAC headers present but no INTERNAL_SERVICE_SECRET configured", () => {
    // NOTE: The authMiddleware module has a `let warnedMissingInternalSecret = false`
    // flag that is set to true after the first warning and never resets (by design,
    // to avoid log spam). Tests in this describe block run in order, and the first
    // test verifies the one-time warning. Subsequent tests will NOT see the warning
    // because the flag is already set.

    it("should log a one-time warning and fall through to JWT on first call with missing secret", () => {
      mockConfig.INTERNAL_SERVICE_SECRET = undefined;

      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=some-sig",
          "x-kenchi-timestamp": "1234567890",
          authorization: "Bearer valid-jwt-token",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      // Verify one-time warning was logged
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("INTERNAL_SERVICE_SECRET not configured")
      );
      // Verify it fell through to JWT
      expect(mockVerifyInternalSignature).not.toHaveBeenCalled();
      expect(mockVerifyAccessToken).toHaveBeenCalledWith("valid-jwt-token");
      expect(next).toHaveBeenCalledWith();
    });

    it("should NOT log the warning again on subsequent calls (one-time flag)", () => {
      mockConfig.INTERNAL_SERVICE_SECRET = undefined;

      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=some-sig",
          "x-kenchi-timestamp": "1234567890",
          authorization: "Bearer valid-jwt-token",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      // The warnedMissingInternalSecret flag was already set by the previous test,
      // so no warning should be logged this time
      expect(mockLoggerWarn).not.toHaveBeenCalledWith(
        expect.stringContaining("INTERNAL_SERVICE_SECRET not configured")
      );
      // Still falls through to JWT
      expect(mockVerifyAccessToken).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it("should return AuthenticationError if secret missing AND no JWT provided", () => {
      mockConfig.INTERNAL_SERVICE_SECRET = undefined;

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=some-sig",
          "x-kenchi-timestamp": "1234567890",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
      expect((passedError as AuthenticationError).message).toBe(
        "Missing or malformed Authorization header"
      );
    });
  });

  describe("no HMAC headers fall through to JWT flow", () => {
    it("should proceed to JWT when no HMAC headers are present", () => {
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          authorization: "Bearer valid-jwt-token",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyInternalSignature).not.toHaveBeenCalled();
      expect(mockVerifyAccessToken).toHaveBeenCalledWith("valid-jwt-token");
      expect(req.user).toEqual(authenticatedUser);
      expect(next).toHaveBeenCalledWith();
    });

    it("should fall through to JWT when only signature header is present (missing timestamp)", () => {
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=some-sig",
          authorization: "Bearer valid-jwt-token",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyInternalSignature).not.toHaveBeenCalled();
      expect(mockVerifyAccessToken).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it("should fall through to JWT when only timestamp header is present (missing signature)", () => {
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-timestamp": "1234567890",
          authorization: "Bearer valid-jwt-token",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyInternalSignature).not.toHaveBeenCalled();
      expect(mockVerifyAccessToken).toHaveBeenCalled();
    });

    it("should return AuthenticationError when no HMAC and no JWT present", () => {
      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
      expect((passedError as AuthenticationError).message).toBe(
        "Missing or malformed Authorization header"
      );
    });
  });

  describe("context enrichment for HMAC-authed requests", () => {
    it("should set actor to 'service:{name}' when HMAC valid and context exists", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "github-app",
        },
        context: testContext,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const enrichedReq = req as Request & { context: RequestContext };
      expect(enrichedReq.context.actor).toBe("service:github-app");
      expect(enrichedReq.context.requestId).toBe("test-req-id");
      expect(enrichedReq.context.tenantId).toBe("test-tenant");
    });

    it("should not modify context when x-kenchi-service header is absent", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid",
          "x-kenchi-timestamp": "1234567890",
        },
        context: testContext,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const enrichedReq = req as Request & { context: RequestContext };
      // Original context should be preserved without actor
      expect(enrichedReq.context.actor).toBeUndefined();
      expect(enrichedReq.context.requestId).toBe("test-req-id");
    });

    it("should not modify context when req.context does not exist", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "github-app",
        },
        // no context provided
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      // Should not throw and should call next without error
      expect(next).toHaveBeenCalledWith();
      // Verify context was not created from scratch
      expect((req as Request & { context?: RequestContext }).context).toBeUndefined();
    });

    it("should not set req.user for HMAC-authed requests (only JWT sets user)", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid",
          "x-kenchi-timestamp": "1234567890",
          "x-kenchi-service": "api-service",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(req.user).toBeUndefined();
    });
  });

  describe("JWT flow preserved when HMAC is not used", () => {
    it("should set req.user and enrich context via JWT when no HMAC headers", () => {
      const authenticatedUser = createTestAuthenticatedUser({
        userId: "usr_jwt-user",
        tenantId: "tenant-from-jwt",
      });
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: { authorization: "Bearer valid-jwt" },
        context: testContext,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(req.user).toEqual(authenticatedUser);
      const enrichedReq = req as Request & { context: RequestContext };
      expect(enrichedReq.context.actor).toBe("usr_jwt-user");
      expect(enrichedReq.context.tenantId).toBe("tenant-from-jwt");
      expect(enrichedReq.context.requestId).toBe("test-req-id");
    });

    it("should pass AuthenticationError when JWT is invalid", () => {
      mockVerifyAccessToken.mockImplementation(() => {
        throw new AuthenticationError("Access token expired", {
          operation: "verifyAccessToken",
        });
      });

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: { authorization: "Bearer expired-token" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
      expect((passedError as AuthenticationError).message).toBe("Access token expired");
    });

    it("should wrap unexpected JWT errors as AuthenticationError", () => {
      mockVerifyAccessToken.mockImplementation(() => {
        throw new Error("Unexpected internal error");
      });

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: { authorization: "Bearer some-token" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
      expect((passedError as AuthenticationError).message).toBe("Token verification failed");
    });
  });

  describe("edge cases", () => {
    it("should use empty rawBody Buffer correctly (not fall back to JSON.stringify)", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid",
          "x-kenchi-timestamp": "1234567890",
        },
        body: { should: "not be used" },
        rawBody: Buffer.from("", "utf-8"),
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      // Empty buffer toString gives "", so rawBody path should be taken
      expect(mockVerifyInternalSignature).toHaveBeenCalledWith(
        "sha256=valid",
        "1234567890",
        "",
        "test-secret-key"
      );
    });

    it("should handle empty body object when rawBody is absent", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid",
          "x-kenchi-timestamp": "1234567890",
        },
        body: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyInternalSignature).toHaveBeenCalledWith(
        "sha256=valid",
        "1234567890",
        "{}",
        "test-secret-key"
      );
    });

    it("should handle undefined body when rawBody is absent", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid",
          "x-kenchi-timestamp": "1234567890",
        },
      });
      // Explicitly set body to undefined to simulate missing body
      (req as unknown as Record<string, unknown>).body = undefined;
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      // JSON.stringify(undefined) returns undefined, which would be the rawBody
      expect(mockVerifyInternalSignature).toHaveBeenCalledTimes(1);
    });

    it("should log service as 'unknown' in debug message when service header absent", () => {
      mockVerifyInternalSignature.mockReturnValue(true);

      const req = createMockRequest({
        path: "/api/v1/dashboard/stats",
        headers: {
          "x-kenchi-signature": "sha256=valid",
          "x-kenchi-timestamp": "1234567890",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        "Internal service auth verified",
        expect.objectContaining({ service: "unknown" })
      );
    });
  });
});
