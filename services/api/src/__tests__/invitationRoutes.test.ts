/**
 * Unit tests for Invitation Routes
 *
 * Tests the invitation acceptance flow with plan limit enforcement (GAP-4):
 * - Accept invitation when team has capacity -> succeeds (200)
 * - Accept invitation when team is at capacity -> fails (403 PLAN_LIMIT_EXCEEDED)
 *
 * Also covers validation, not-found, expired, and already-processed paths
 * for handleAcceptInvitation.
 *
 * @module __tests__/invitationRoutes.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { RequestContext } from "@kenchi/shared";

// ==================== Mock Functions ====================

const mockCreateInvitation = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFindInvitationByToken = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFindPendingInvitationsByTenant = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockFindPendingInvitationsByEmail = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockAcceptInvitation = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDeclineInvitation = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRevokeInvitation = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLogAuditEvent = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockEnforcePlanLimit = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockAddUserOrganization = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFindUserById = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFindById = jest.fn<(...args: unknown[]) => Promise<unknown>>();

// ==================== Module Mock ====================

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
    asyncHandler:
      (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          await fn(req, res, next);
        } catch (error) {
          next(error);
        }
      },
    // Middleware passthrough — auth/permission is not under test here
    requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    rateLimitByCategory: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    // Repository / service functions
    createInvitation: (...args: unknown[]) => mockCreateInvitation(...args),
    findInvitationByToken: (...args: unknown[]) => mockFindInvitationByToken(...args),
    findPendingInvitationsByTenant: (...args: unknown[]) =>
      mockFindPendingInvitationsByTenant(...args),
    findPendingInvitationsByEmail: (...args: unknown[]) =>
      mockFindPendingInvitationsByEmail(...args),
    acceptInvitation: (...args: unknown[]) => mockAcceptInvitation(...args),
    declineInvitation: (...args: unknown[]) => mockDeclineInvitation(...args),
    revokeInvitation: (...args: unknown[]) => mockRevokeInvitation(...args),
    logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
    enforcePlanLimit: (...args: unknown[]) => mockEnforcePlanLimit(...args),
    addUserOrganization: (...args: unknown[]) => mockAddUserOrganization(...args),
    findUserById: (...args: unknown[]) => mockFindUserById(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    // requireTenantId reads from req.user.tenantId — keep real implementation
    requireTenantId: (req: Request) => {
      const tenantId = (req as unknown as { user?: { tenantId?: string } }).user?.tenantId;
      if (!tenantId) {
        const { AuthorizationError: AuthzError } = actual as {
          AuthorizationError: new (msg: string, opts?: unknown) => Error;
        };
        throw new AuthzError("No organization linked", { operation: "requireTenantId" });
      }
      return tenantId;
    },
  };
});

// Import error classes after mock setup
import { ValidationError, NotFoundError, AuthorizationError } from "@kenchi/shared";

// ==================== Test Helpers ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

/**
 * Middleware that injects auth context (user + context) for tests.
 * Mirrors what the real auth middleware does in production.
 */
const injectTestAuth = (userId: string | undefined, tenantId: string | undefined) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    Object.assign(req, {
      user: userId ? { userId, tenantId } : undefined,
      context: {
        requestId: testContext.requestId,
        tenantId: tenantId ?? "test-tenant",
      },
    });
    next();
  };
};

const createTestInvitation = (overrides: Record<string, unknown> = {}) => ({
  id: "inv_test-123",
  tenantId: "tenant-abc",
  email: "invitee@example.com",
  role: "member",
  status: "pending",
  token: "valid-token-abc",
  invitedBy: "usr_admin",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  createdAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

/**
 * Sets up Express app with invitation routes and error handling middleware.
 */
const setupApp = async (
  userId: string | undefined = "usr_test-user",
  tenantId: string | undefined = "tenant-abc"
): Promise<Express> => {
  const { invitationRoutes } = await import("../routes/invitationRoutes.js");
  const app = express();
  app.use(express.json());
  app.use(injectTestAuth(userId, tenantId));
  app.use(invitationRoutes);

  // Error handling middleware matching production behavior
  app.use(
    (
      err: Error & { statusCode?: number; metadata?: unknown },
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: err.message },
        });
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: err.message },
        });
        return;
      }
      if (err instanceof AuthorizationError) {
        const { metadata } = err as unknown as { metadata?: Record<string, unknown> };
        const code = (metadata?.code as string) ?? "FORBIDDEN";
        res.status(403).json({
          error: { code, message: err.message },
        });
        return;
      }
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  );

  return app;
};

// ==================== Tests ====================

describe("Invitation Routes", () => {
  // let: app is rebuilt each test for module isolation
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEnforcePlanLimit.mockResolvedValue(undefined);
    mockLogAuditEvent.mockResolvedValue(undefined);
    // Default: tenant exists and is an organization (not personal)
    mockFindById.mockResolvedValue({ id: "tenant-abc", tenantType: "organization" });
    app = await setupApp();
  });

  // ==================================================================
  // POST /api/v1/invitations/accept — plan limit enforcement (GAP-4)
  // ==================================================================

  describe("POST /api/v1/invitations/accept", () => {
    it("should accept invitation when team has capacity", async () => {
      const invitation = createTestInvitation();

      mockFindInvitationByToken.mockResolvedValue(invitation);
      mockAcceptInvitation.mockResolvedValue(invitation);
      mockEnforcePlanLimit.mockResolvedValue(undefined); // within limits
      mockAddUserOrganization.mockResolvedValue(undefined);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .send({ token: "valid-token-abc" });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          invitationId: invitation.id,
          tenantId: invitation.tenantId,
          role: invitation.role,
          status: "accepted",
        })
      );

      // Verify enforcePlanLimit was called with the invitation's tenantId
      expect(mockEnforcePlanLimit).toHaveBeenCalledWith(invitation.tenantId, "max_team_members");

      // Verify user was added to the organization
      expect(mockAddUserOrganization).toHaveBeenCalledWith({
        userId: "usr_test-user",
        tenantId: invitation.tenantId,
        role: invitation.role,
      });
    });

    it("should reject invitation acceptance when team is at capacity (403 PLAN_LIMIT_EXCEEDED)", async () => {
      const invitation = createTestInvitation();

      mockFindInvitationByToken.mockResolvedValue(invitation);
      mockAcceptInvitation.mockResolvedValue(invitation);
      // enforcePlanLimit throws AuthorizationError when limit is exceeded
      mockEnforcePlanLimit.mockRejectedValue(
        new AuthorizationError("Plan limit exceeded", {
          operation: "enforcePlanLimit",
          metadata: {
            code: "PLAN_LIMIT_EXCEEDED",
            limitKey: "max_team_members",
            currentUsage: 5,
            limit: 5,
            currentPlan: "free",
          },
        })
      );

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .send({ token: "valid-token-abc" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("PLAN_LIMIT_EXCEEDED");

      // Verify addUserOrganization was NOT called
      expect(mockAddUserOrganization).not.toHaveBeenCalled();
    });

    it("should return 400 when token is missing", async () => {
      const response = await request(app).post("/api/v1/invitations/accept").send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/token is required/i);
      expect(mockFindInvitationByToken).not.toHaveBeenCalled();
    });

    it("should return 400 when token is not a string", async () => {
      const response = await request(app).post("/api/v1/invitations/accept").send({ token: 12345 });

      expect(response.status).toBe(400);
      expect(mockFindInvitationByToken).not.toHaveBeenCalled();
    });

    it("should return 403 when user is not authenticated", async () => {
      // Build a separate app with no user injected
      const { invitationRoutes } = await import("../routes/invitationRoutes.js");
      const unauthApp = express();
      unauthApp.use(express.json());
      // Inject context but no user (simulates unauthenticated request)
      unauthApp.use((req: Request, _res: Response, next: NextFunction) => {
        Object.assign(req, {
          context: { requestId: "test-req", tenantId: "test-tenant" },
          // req.user is intentionally omitted
        });
        next();
      });
      unauthApp.use(invitationRoutes);
      unauthApp.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        if (err instanceof AuthorizationError) {
          res.status(403).json({ error: { code: "FORBIDDEN", message: err.message } });
          return;
        }
        res.status(500).json({ error: { message: "unexpected" } });
      });

      const response = await request(unauthApp)
        .post("/api/v1/invitations/accept")
        .send({ token: "valid-token-abc" });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toMatch(/authentication required/i);
    });

    it("should return 404 when invitation token is not found", async () => {
      mockFindInvitationByToken.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .send({ token: "nonexistent-token" });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toMatch(/not found/i);
    });

    it("should return 400 when invitation is already accepted", async () => {
      const invitation = createTestInvitation({ status: "accepted" });
      mockFindInvitationByToken.mockResolvedValue(invitation);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .send({ token: "valid-token-abc" });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/accepted.*cannot be accepted/i);
    });

    it("should return 400 when invitation has expired", async () => {
      const invitation = createTestInvitation({
        expiresAt: new Date("2020-01-01T00:00:00Z"), // in the past
      });
      mockFindInvitationByToken.mockResolvedValue(invitation);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .send({ token: "valid-token-abc" });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/expired/i);
    });

    it("should return 400 when acceptInvitation returns null (race condition)", async () => {
      const invitation = createTestInvitation();
      mockFindInvitationByToken.mockResolvedValue(invitation);
      mockAcceptInvitation.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .send({ token: "valid-token-abc" });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/could not accept/i);
      // enforcePlanLimit should NOT be called if acceptInvitation failed
      expect(mockEnforcePlanLimit).not.toHaveBeenCalled();
    });

    it("should call enforcePlanLimit after acceptInvitation succeeds (order matters)", async () => {
      const invitation = createTestInvitation();
      mockFindInvitationByToken.mockResolvedValue(invitation);
      mockAcceptInvitation.mockResolvedValue(invitation);
      mockEnforcePlanLimit.mockResolvedValue(undefined);
      mockAddUserOrganization.mockResolvedValue(undefined);

      await request(app).post("/api/v1/invitations/accept").send({ token: "valid-token-abc" });

      // Verify call order: acceptInvitation before enforcePlanLimit
      const acceptOrder = mockAcceptInvitation.mock.invocationCallOrder[0];
      const enforceOrder = mockEnforcePlanLimit.mock.invocationCallOrder[0];
      expect(acceptOrder).toBeLessThan(enforceOrder!);
    });
  });

  // ==================================================================
  // POST /api/v1/invitations — create invitation with plan limit
  // ==================================================================

  describe("POST /api/v1/invitations", () => {
    it("should create invitation when plan limit allows", async () => {
      const invitation = createTestInvitation();
      mockEnforcePlanLimit.mockResolvedValue(undefined);
      mockCreateInvitation.mockResolvedValue(invitation);

      const response = await request(app)
        .post("/api/v1/invitations")
        .send({ email: "new@example.com", role: "member" });

      expect(response.status).toBe(201);
      expect(response.body.data.email).toBe("invitee@example.com");
      expect(mockEnforcePlanLimit).toHaveBeenCalledWith("tenant-abc", "max_team_members");
    });

    it("should reject invitation creation when team is at capacity", async () => {
      mockEnforcePlanLimit.mockRejectedValue(
        new AuthorizationError("Plan limit exceeded", {
          operation: "enforcePlanLimit",
          metadata: {
            code: "PLAN_LIMIT_EXCEEDED",
            limitKey: "max_team_members",
            currentUsage: 5,
            limit: 5,
          },
        })
      );

      const response = await request(app)
        .post("/api/v1/invitations")
        .send({ email: "new@example.com", role: "member" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("PLAN_LIMIT_EXCEEDED");
      expect(mockCreateInvitation).not.toHaveBeenCalled();
    });

    it("should return 400 when email is missing", async () => {
      const response = await request(app).post("/api/v1/invitations").send({ role: "member" });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/email is required/i);
    });
  });
});
