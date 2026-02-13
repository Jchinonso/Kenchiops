/**
 * Unit tests for http/authMiddleware.ts
 *
 * Tests the Express JWT authentication middleware covering:
 * - Public route bypassing (health, auth, webhooks)
 * - Missing/malformed Authorization header
 * - Invalid/expired token handling
 * - Successful authentication with req.user and req.context enrichment
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { AuthenticationError } from "../../core/errors.js";
import type { AuthenticatedUser } from "../../database/user/types.js";
import type { RequestContext } from "../../core/types.js";

// ==================== Mocks ====================

const mockVerifyAccessToken = jest.fn<(token: string) => AuthenticatedUser>();

jest.mock("../../security/jwt.js", () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(args[0] as string),
}));

jest.mock("../../core/index.js", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  AuthenticationError,
}));

// Import after mock setup
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
  overrides: Partial<Request> & { context?: RequestContext } = {}
): Request => {
  const { context, ...rest } = overrides;
  const req = {
    path: "/api/v1/analyses",
    headers: {},
    ...rest,
  } as unknown as Request;

  if (context) {
    (req as Request & { context: RequestContext }).context = context;
  }

  return req;
};

const createMockResponse = (): Response =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as unknown as Response;

const createMockNext = (): jest.Mock<NextFunction> => jest.fn<NextFunction>();

// ==================== Tests ====================

describe("http/authMiddleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("public route bypass", () => {
    it("should call next() without authentication for /health", () => {
      const req = createMockRequest({ path: "/health" });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    });

    it("should call next() without authentication for /live", () => {
      const req = createMockRequest({ path: "/live" });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    });

    it("should call next() without authentication for /ready", () => {
      const req = createMockRequest({ path: "/ready" });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("should call next() without authentication for /auth/ routes", () => {
      const authPaths = [
        "/auth/github/login",
        "/auth/github/callback",
        "/auth/gitlab/login",
        "/auth/bitbucket/callback",
        "/auth/azure_devops/login",
        "/auth/refresh",
        "/auth/logout",
      ];

      authPaths.forEach((path) => {
        const req = createMockRequest({ path });
        const res = createMockResponse();
        const next = createMockNext();

        authMiddleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(mockVerifyAccessToken).not.toHaveBeenCalled();
      });
    });

    it("should call next() without authentication for /webhooks/ routes", () => {
      const webhookPaths = ["/webhooks/github", "/webhooks/slack", "/api/webhooks/github"];

      webhookPaths.forEach((path) => {
        const req = createMockRequest({ path });
        const res = createMockResponse();
        const next = createMockNext();

        authMiddleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    it("should NOT skip auth for /auth/me (requires JWT)", () => {
      const req = createMockRequest({ path: "/auth/me", headers: {} });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
    });
  });

  describe("missing or malformed Authorization header", () => {
    it("should pass AuthenticationError to next() when no Authorization header is present", () => {
      const req = createMockRequest({ path: "/api/v1/analyses", headers: {} });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
      expect((passedError as AuthenticationError).message).toBe(
        "Missing or malformed Authorization header"
      );
    });

    it("should pass AuthenticationError to next() when Authorization header is not Bearer", () => {
      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
    });

    it("should pass AuthenticationError to next() when Bearer token is empty", () => {
      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer " },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
    });

    it("should not attempt token verification when Authorization header is missing", () => {
      const req = createMockRequest({ path: "/api/v1/analyses" });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    });
  });

  describe("invalid/expired token handling", () => {
    it("should pass AuthenticationError to next() when verifyAccessToken throws AuthenticationError", () => {
      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer invalid-token" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      mockVerifyAccessToken.mockImplementation(() => {
        throw new AuthenticationError("Access token expired", {
          operation: "verifyAccessToken",
        });
      });

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
      expect((passedError as AuthenticationError).message).toBe("Access token expired");
    });

    it("should wrap non-AuthenticationError exceptions as AuthenticationError", () => {
      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer some-token" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      mockVerifyAccessToken.mockImplementation(() => {
        throw new Error("Unexpected internal error");
      });

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const passedError = next.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(AuthenticationError);
      expect((passedError as AuthenticationError).message).toBe("Token verification failed");
    });
  });

  describe("successful authentication", () => {
    it("should set req.user with AuthenticatedUser when token is valid", () => {
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer valid-jwt-token" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(req.user).toEqual(authenticatedUser);
      expect(next).toHaveBeenCalledWith();
    });

    it("should call next() without error argument on success", () => {
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer valid-jwt-token" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it("should update req.context.actor and req.context.tenantId from JWT claims", () => {
      const authenticatedUser = createTestAuthenticatedUser({
        userId: "usr_jwt-user",
        tenantId: "tenant-from-jwt",
      });
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const originalContext: RequestContext = {
        requestId: "req-123",
        tenantId: "original-tenant",
      };

      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer valid-jwt-token" },
        context: originalContext,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const enrichedReq = req as Request & { context: RequestContext };
      expect(enrichedReq.context.actor).toBe("usr_jwt-user");
      expect(enrichedReq.context.tenantId).toBe("tenant-from-jwt");
      // Original requestId should be preserved
      expect(enrichedReq.context.requestId).toBe("req-123");
    });

    it("should preserve req.context.requestId when enriching with auth info", () => {
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const originalContext: RequestContext = {
        requestId: "preserved-request-id",
        tenantId: "original",
      };

      const req = createMockRequest({
        path: "/api/v1/data",
        headers: { authorization: "Bearer valid-token" },
        context: originalContext,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const enrichedReq = req as Request & { context: RequestContext };
      expect(enrichedReq.context.requestId).toBe("preserved-request-id");
    });

    it("should not update tenantId when user tenantId is null", () => {
      const authenticatedUser = createTestAuthenticatedUser({ tenantId: null });
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const originalContext: RequestContext = {
        requestId: "req-123",
        tenantId: "original-tenant",
      };

      const req = createMockRequest({
        path: "/api/v1/data",
        headers: { authorization: "Bearer valid-token" },
        context: originalContext,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      const enrichedReq = req as Request & { context: RequestContext };
      // tenantId should remain the original since user.tenantId is null
      expect(enrichedReq.context.tenantId).toBe("original-tenant");
      expect(enrichedReq.context.actor).toBe(authenticatedUser.userId);
    });

    it("should still set req.user even when req.context is not set", () => {
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer valid-token" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(req.user).toEqual(authenticatedUser);
      expect(next).toHaveBeenCalledWith();
    });

    it("should pass the token string (not the header) to verifyAccessToken", () => {
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer the-actual-jwt-token-value" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      expect(mockVerifyAccessToken).toHaveBeenCalledWith("the-actual-jwt-token-value");
    });
  });

  describe("edge cases", () => {
    it("should require auth for paths that do not match any public route prefix", () => {
      const privatePaths = [
        "/api/v1/analyses",
        "/api/v1/events",
        "/dashboard",
        "/authentication", // does not start with "/auth/"
      ];

      privatePaths.forEach((path) => {
        jest.clearAllMocks();
        const req = createMockRequest({ path, headers: {} });
        const res = createMockResponse();
        const next = createMockNext();

        authMiddleware(req, res, next);

        const passedError = next.mock.calls[0]![0];
        expect(passedError).toBeInstanceOf(AuthenticationError);
      });
    });

    it("should handle Authorization header with extra spaces after Bearer", () => {
      // "Bearer  token" -- note the double space; slice(7) gives " token"
      // extractBearerToken checks startsWith("Bearer ") which is true
      // then slices from index 7, giving " token" which has length > 0
      const authenticatedUser = createTestAuthenticatedUser();
      mockVerifyAccessToken.mockReturnValue(authenticatedUser);

      const req = createMockRequest({
        path: "/api/v1/analyses",
        headers: { authorization: "Bearer  token-with-leading-space" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authMiddleware(req, res, next);

      // The token passed to verify will include the leading space
      expect(mockVerifyAccessToken).toHaveBeenCalled();
    });
  });
});
