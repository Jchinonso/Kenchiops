/**
 * Tests for Stripe webhook handler.
 *
 * Covers:
 * - processStripeWebhook: idempotency, event routing, context propagation, error handling
 * - cleanupOldBillingEvents: default/custom retention, return value, logging
 * - Individual event handlers: checkout, invoice paid, payment failed,
 *   subscription updated, subscription deleted
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext } from "../core/types.js";
import type { StripeWebhookEvent } from "./types.js";

// ==================== Mocks ====================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock("../database/common.js", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../core/index.js", () => ({
  createLogger: jest.fn(() => mockLogger),
  getErrorMessage: jest.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

const mockLogAuditEvent = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock("../database/tenant/audit.js", () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

jest.mock("../constants/tenant.js", () => ({
  AUDIT_ACTIONS: {
    PLAN_CHANGED: "plan_changed",
    PAYMENT_FAILED: "payment_failed",
  },
}));

jest.mock("../constants/subscription.js", () => ({
  DEFAULT_PLAN_ID: "free",
}));

// ==================== Import module under test ====================

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let handler: typeof import("./webhookHandler.js");

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-req-001",
  tenantId: "system",
};

const createEvent = (
  type: StripeWebhookEvent["type"],
  objectData: Record<string, unknown> = {},
  eventId = "evt_test_001"
): StripeWebhookEvent => ({
  id: eventId,
  type,
  data: { object: objectData },
});

// ==================== Tests ====================

describe("billing/webhookHandler", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    handler = await import("./webhookHandler.js");
  });

  // ==================== processStripeWebhook ====================

  describe("processStripeWebhook", () => {
    it("should skip duplicate events (idempotency check)", async () => {
      // isEventProcessed returns true
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "existing" }] });

      const event = createEvent("checkout.session.completed", {
        metadata: { tenantId: "t-1" },
        customer: "cus_abc",
        subscription: "sub_def",
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result).toEqual({
        processed: false,
        eventType: "checkout.session.completed",
        action: "duplicate",
      });
      // Only 1 query call: the idempotency check
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should log duplicate events with context spread", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "existing" }] });

      const event = createEvent("invoice.paid", {}, "evt_dup_123");

      await handler.processStripeWebhook(event, testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Duplicate Stripe event, skipping",
        expect.objectContaining({
          provider: "stripe",
          operation: "processStripeWebhook",
          eventId: "evt_dup_123",
          requestId: "test-req-001",
          tenantId: "system",
        })
      );
    });

    it("should return unhandled_event_type for unknown event types", async () => {
      // isEventProcessed returns false
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Force an unhandled type by casting
      const event = {
        id: "evt_unknown",
        type: "payment_intent.created" as StripeWebhookEvent["type"],
        data: { object: {} },
      };

      const result = await handler.processStripeWebhook(event as StripeWebhookEvent, testContext);

      expect(result).toEqual({
        processed: false,
        eventType: "payment_intent.created",
        action: "unhandled_event_type",
      });
    });

    it("should propagate context in error logging when handler throws", async () => {
      // isEventProcessed returns false
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Make the handler's internal query fail (checkout handler calls multiple queries)
      mockQuery.mockRejectedValueOnce(new Error("DB connection lost"));

      // recordBillingEvent best-effort also needs a mock
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = createEvent("checkout.session.completed", {
        metadata: { tenantId: "t-1" },
        customer: "cus_abc",
        subscription: "sub_def",
      });

      await expect(handler.processStripeWebhook(event, testContext)).rejects.toThrow(
        "DB connection lost"
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to process Stripe webhook",
        expect.objectContaining({
          provider: "stripe",
          operation: "processStripeWebhook",
          eventId: "evt_test_001",
          requestId: "test-req-001",
          tenantId: "system",
        })
      );
    });

    it("should record failure event on best-effort basis when handler throws", async () => {
      // idempotency check: not processed
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // handler query fails
      mockQuery.mockRejectedValueOnce(new Error("Boom"));
      // recordBillingEvent best-effort call
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = createEvent("checkout.session.completed", {
        metadata: { tenantId: "t-1" },
        customer: "cus_abc",
        subscription: "sub_def",
      });

      await expect(handler.processStripeWebhook(event, testContext)).rejects.toThrow("Boom");

      // The last mockQuery call should be the billing_events INSERT
      const lastCallArgs = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      const lastCallParams = lastCallArgs[1] as unknown[];
      expect(lastCallParams[0]).toBe("system"); // tenant_id for failed events
      expect(lastCallParams[1]).toBe("evt_test_001"); // stripe_event_id
      expect(lastCallParams[3]).toBe("failed"); // status
    });

    it("should not throw if best-effort failure recording also fails", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockRejectedValueOnce(new Error("Primary failure")); // handler
      mockQuery.mockRejectedValueOnce(new Error("Recording also failed")); // best-effort

      const event = createEvent("checkout.session.completed", {
        metadata: { tenantId: "t-1" },
        customer: "cus_abc",
        subscription: "sub_def",
      });

      // Should throw the primary failure, not the recording failure
      await expect(handler.processStripeWebhook(event, testContext)).rejects.toThrow(
        "Primary failure"
      );
    });
  });

  // ==================== handleCheckoutCompleted ====================

  describe("checkout.session.completed", () => {
    it("should activate subscription and log audit event", async () => {
      // idempotency check
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // UPDATE_STRIPE_CUSTOMER
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // UPDATE_STRIPE_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [{}] });
      // recordBillingEvent INSERT
      mockQuery.mockResolvedValueOnce({ rows: [{}] });

      const event = createEvent("checkout.session.completed", {
        metadata: { tenantId: "tenant-123", planId: "pro" },
        customer: "cus_abc",
        subscription: "sub_def",
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result).toEqual(
        expect.objectContaining({
          processed: true,
          tenantId: "tenant-123",
          action: "subscription_activated",
        })
      );

      // Verify audit event was logged
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        "tenant-123",
        "plan_changed",
        expect.objectContaining({
          newPlanId: "pro",
          source: "stripe_checkout",
        })
      );
    });

    it("should skip when tenantId is missing from metadata and client_reference_id", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency

      const event = createEvent("checkout.session.completed", {
        metadata: {},
        // No client_reference_id, no tenantId in metadata
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result).toEqual(
        expect.objectContaining({
          processed: false,
          action: "skipped_no_tenant",
        })
      );
    });

    it("should fall back to client_reference_id when metadata has no tenantId", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE_STRIPE_CUSTOMER
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // UPDATE_STRIPE_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // recordBillingEvent

      const event = createEvent("checkout.session.completed", {
        metadata: {},
        client_reference_id: "tenant-from-ref",
        customer: "cus_xyz",
        subscription: "sub_xyz",
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result.tenantId).toBe("tenant-from-ref");
      expect(result.processed).toBe(true);
    });

    it("should default to free plan when planId not in metadata", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE_STRIPE_CUSTOMER
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // UPDATE_STRIPE_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // recordBillingEvent

      const event = createEvent("checkout.session.completed", {
        metadata: { tenantId: "t-1" },
        customer: "cus_a",
        subscription: "sub_a",
      });

      await handler.processStripeWebhook(event, testContext);

      // The subscription update query should use DEFAULT_PLAN_ID = "free"
      const subUpdateArgs = mockQuery.mock.calls[2][1] as unknown[];
      expect(subUpdateArgs[2]).toBe("free"); // planId param
    });
  });

  // ==================== handleInvoicePaid ====================

  describe("invoice.paid", () => {
    it("should update period end when subscription found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: "t-1" }] }); // FIND_BY_STRIPE_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE_PERIOD_END
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // recordBillingEvent

      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 30;
      const event = createEvent("invoice.paid", {
        subscription: "sub_abc",
        period_end: periodEnd,
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result).toEqual(
        expect.objectContaining({
          processed: true,
          tenantId: "t-1",
          action: "period_extended",
        })
      );
    });

    it("should skip when subscription ID is missing", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency

      const event = createEvent("invoice.paid", {
        // no subscription field
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result).toEqual(
        expect.objectContaining({
          processed: false,
          action: "skipped_no_subscription",
        })
      );
    });

    it("should skip when subscription is unknown", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [] }); // FIND_BY_STRIPE_SUBSCRIPTION (no match)

      const event = createEvent("invoice.paid", {
        subscription: "sub_unknown",
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result.action).toBe("skipped_unknown_subscription");
    });
  });

  // ==================== handlePaymentFailed ====================

  describe("invoice.payment_failed", () => {
    it("should set subscription to past_due and log audit event", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: "t-1" }] }); // FIND_BY_STRIPE_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SET_PAST_DUE
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // recordBillingEvent

      const event = createEvent("invoice.payment_failed", {
        subscription: "sub_fail",
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result).toEqual(
        expect.objectContaining({
          processed: true,
          tenantId: "t-1",
          action: "set_past_due",
        })
      );

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        "t-1",
        "payment_failed",
        expect.objectContaining({
          subscriptionId: "sub_fail",
          source: "stripe_webhook",
        })
      );
    });

    it("should skip when subscription is not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [] }); // FIND_BY_STRIPE_SUBSCRIPTION

      const event = createEvent("invoice.payment_failed", {
        subscription: "sub_ghost",
      });

      const result = await handler.processStripeWebhook(event, testContext);
      expect(result.action).toBe("skipped_unknown_subscription");
    });
  });

  // ==================== handleSubscriptionUpdated ====================

  describe("customer.subscription.updated", () => {
    it("should sync plan changes when planId is in metadata", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: "t-1", plan_id: "free" }] }); // FIND_BY_STRIPE_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // UPDATE_STRIPE_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // recordBillingEvent

      const event = createEvent("customer.subscription.updated", {
        id: "sub_updated",
        metadata: { planId: "team" },
        status: "active",
        customer: "cus_abc",
        current_period_end: 1700000000,
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result).toEqual(
        expect.objectContaining({
          processed: true,
          action: "subscription_synced",
        })
      );
    });

    it("should skip when subscription ID is missing", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency

      const event = createEvent("customer.subscription.updated", {
        // no id
      });

      const result = await handler.processStripeWebhook(event, testContext);
      expect(result.action).toBe("skipped_no_id");
    });

    it("should skip when subscription is unknown", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [] }); // FIND_BY_STRIPE_SUBSCRIPTION

      const event = createEvent("customer.subscription.updated", {
        id: "sub_unknown",
      });

      const result = await handler.processStripeWebhook(event, testContext);
      expect(result.action).toBe("skipped_unknown_subscription");
    });

    it("should map non-active status to past_due", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: "t-1", plan_id: "pro" }] }); // find
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // UPDATE_STRIPE_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // recordBillingEvent

      const event = createEvent("customer.subscription.updated", {
        id: "sub_pastdue",
        metadata: { planId: "pro" },
        status: "past_due",
        customer: "cus_xyz",
      });

      await handler.processStripeWebhook(event, testContext);

      // The 4th param ($4) to UPDATE_STRIPE_SUBSCRIPTION is status
      const subUpdateArgs = mockQuery.mock.calls[2][1] as unknown[];
      expect(subUpdateArgs[3]).toBe("past_due");
    });
  });

  // ==================== handleSubscriptionDeleted ====================

  describe("customer.subscription.deleted", () => {
    it("should cancel subscription and downgrade to free", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({
        rows: [{ tenant_id: "t-1", plan_id: "pro" }],
      }); // CANCEL_SUBSCRIPTION
      mockQuery.mockResolvedValueOnce({ rows: [] }); // downgrade to free
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // recordBillingEvent

      const event = createEvent("customer.subscription.deleted", {
        id: "sub_canceled",
      });

      const result = await handler.processStripeWebhook(event, testContext);

      expect(result).toEqual(
        expect.objectContaining({
          processed: true,
          tenantId: "t-1",
          action: "downgraded_to_free",
        })
      );

      // Should log audit event with previous plan
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        "t-1",
        "plan_changed",
        expect.objectContaining({
          previousPlanId: "pro",
          newPlanId: "free",
          reason: "stripe_subscription_deleted",
        })
      );
    });

    it("should skip when subscription not found during cancellation", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // idempotency
      mockQuery.mockResolvedValueOnce({ rows: [] }); // CANCEL_SUBSCRIPTION returns nothing

      const event = createEvent("customer.subscription.deleted", {
        id: "sub_ghost",
      });

      const result = await handler.processStripeWebhook(event, testContext);
      expect(result.action).toBe("skipped_unknown_subscription");
    });
  });

  // ==================== cleanupOldBillingEvents ====================

  describe("cleanupOldBillingEvents", () => {
    it("should use default 90-day retention when no argument provided", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handler.cleanupOldBillingEvents();

      const queryArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(queryArgs[0]).toBe("90 days");
    });

    it("should use custom retention days when provided", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handler.cleanupOldBillingEvents(30);

      const queryArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(queryArgs[0]).toBe("30 days");
    });

    it("should return the count of deleted rows", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "1" }, { id: "2" }, { id: "3" }],
      });

      const count = await handler.cleanupOldBillingEvents();
      expect(count).toBe(3);
    });

    it("should return 0 when no rows are deleted", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const count = await handler.cleanupOldBillingEvents();
      expect(count).toBe(0);
    });

    it("should log when rows are deleted", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "1" }, { id: "2" }],
      });

      await handler.cleanupOldBillingEvents(60);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Cleaned up old billing events",
        expect.objectContaining({
          provider: "stripe",
          operation: "cleanupOldBillingEvents",
          deletedCount: 2,
          retentionDays: 60,
        })
      );
    });

    it("should not log when no rows are deleted", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handler.cleanupOldBillingEvents();

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it("should call the correct CLEANUP query", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handler.cleanupOldBillingEvents(7);

      const sqlQuery = mockQuery.mock.calls[0][0] as string;
      expect(sqlQuery).toContain("DELETE FROM billing_events");
      expect(sqlQuery).toContain("$1::interval");
      expect(sqlQuery).toContain("RETURNING id");
    });
  });
});
