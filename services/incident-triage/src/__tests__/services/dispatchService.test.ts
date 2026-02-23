/**
 * Dispatch Service Tests
 *
 * Tests for the dispatch orchestrator with mocked SlackDispatchPort
 * and PagerDutyDispatchPort.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockCreateLogger = jest.fn(() => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock("@kenchi/shared", () => ({
  ...jest.requireActual("@kenchi/shared"),
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createDispatchService } from "../../services/dispatchService.js";
import type {
  SlackDispatchPort,
  PagerDutyDispatchPort,
  RoutingDecision,
  TriagePolicyContext,
  DispatchTarget,
  DispatchResult,
} from "../../types/policyTypes.js";
import type { RequestContext } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createTriageContext = (
  overrides: Partial<TriagePolicyContext> = {}
): TriagePolicyContext => ({
  alertId: "alert-1",
  tenantId: "tenant-1",
  severityLabel: "high",
  severityScore: 72,
  environment: "production",
  serviceName: "payments-api",
  confidence: 0.85,
  completeness: 0.75,
  headline: "High CPU on payments-api",
  summarySource: "ai",
  ...overrides,
});

const createSlackTarget = (channel: string = "#alerts"): DispatchTarget => ({
  type: "slack",
  channel,
  metadata: { urgency: "high" },
});

const createPagerDutyTarget = (channel: string = "escalation"): DispatchTarget => ({
  type: "pagerduty",
  channel,
  metadata: { urgency: "high" },
});

const createRoutingDecision = (overrides: Partial<RoutingDecision> = {}): RoutingDecision => ({
  targets: [createSlackTarget()],
  matchedRules: [{ ruleId: "R1", ruleName: "Test Rule", reason: "test" }],
  suppressed: false,
  suppressionReasons: [],
  evaluatedAt: "2026-02-19T14:00:00.000Z",
  ...overrides,
});

const createSuccessResult = (target: DispatchTarget): DispatchResult => ({
  target,
  success: true,
  statusCode: 200,
  durationMs: 150,
});

const _createFailureResult = (target: DispatchTarget): DispatchResult => ({
  target,
  success: false,
  error: "Connection refused",
  durationMs: 50,
});

const testBlocks: ReadonlyArray<Record<string, unknown>> = [
  { type: "header", text: { type: "plain_text", text: "Test" } },
];

const createMockSlackPort = (): { postMessage: jest.Mock } => ({
  postMessage: jest.fn(),
});

const createMockPagerDutyPort = (): { triggerEvent: jest.Mock } => ({
  triggerEvent: jest.fn(),
});

// ==================== Tests ====================

describe("createDispatchService", () => {
  // let: mock references change per test in beforeEach
  let mockSlackPort: ReturnType<typeof createMockSlackPort>;
  let mockPagerDutyPort: ReturnType<typeof createMockPagerDutyPort>;

  beforeEach(() => {
    mockSlackPort = createMockSlackPort();
    mockPagerDutyPort = createMockPagerDutyPort();
    jest.clearAllMocks();
  });

  describe("dispatch with no targets", () => {
    it("should return empty results when routing decision has no targets", async () => {
      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );
      const decision = createRoutingDecision({ targets: [], suppressed: true });

      const result = await service.dispatch(
        decision,
        createTriageContext(),
        testBlocks,
        testContext
      );

      expect(result.results).toHaveLength(0);
      expect(result.totalTargets).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(mockSlackPort.postMessage).not.toHaveBeenCalled();
      expect(mockPagerDutyPort.triggerEvent).not.toHaveBeenCalled();
    });
  });

  describe("dispatch to Slack targets", () => {
    it("should dispatch to a Slack target via slackPort.postMessage", async () => {
      const slackTarget = createSlackTarget("#incidents-prod");
      mockSlackPort.postMessage.mockResolvedValueOnce(createSuccessResult(slackTarget));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      const result = await service.dispatch(
        createRoutingDecision({ targets: [slackTarget] }),
        createTriageContext(),
        testBlocks,
        testContext
      );

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(mockSlackPort.postMessage).toHaveBeenCalledWith(
        "#incidents-prod",
        testBlocks,
        expect.any(String),
        testContext
      );
    });
  });

  describe("dispatch to PagerDuty targets", () => {
    it("should dispatch to a PagerDuty target via pagerDutyPort.triggerEvent", async () => {
      const pdTarget = createPagerDutyTarget("escalation");
      mockPagerDutyPort.triggerEvent.mockResolvedValueOnce(createSuccessResult(pdTarget));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      const result = await service.dispatch(
        createRoutingDecision({ targets: [pdTarget] }),
        createTriageContext(),
        testBlocks,
        testContext
      );

      expect(result.successCount).toBe(1);
      expect(mockPagerDutyPort.triggerEvent).toHaveBeenCalledWith(
        "escalation",
        expect.objectContaining({
          routing_key: "escalation",
          event_action: "trigger",
        }),
        testContext
      );
    });

    it("should include triage context in PagerDuty payload", async () => {
      const pdTarget = createPagerDutyTarget("escalation");
      mockPagerDutyPort.triggerEvent.mockResolvedValueOnce(createSuccessResult(pdTarget));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      const triageCtx = createTriageContext({ severityLabel: "critical" });
      await service.dispatch(
        createRoutingDecision({ targets: [pdTarget] }),
        triageCtx,
        testBlocks,
        testContext
      );

      const payload = mockPagerDutyPort.triggerEvent.mock.calls[0][1] as Record<string, unknown>;
      const innerPayload = payload.payload as Record<string, unknown>;
      expect(innerPayload.severity).toBe("critical");
    });
  });

  describe("multiple targets", () => {
    it("should dispatch to all targets in parallel", async () => {
      const slackTarget = createSlackTarget("#alerts");
      const pdTarget = createPagerDutyTarget("escalation");
      mockSlackPort.postMessage.mockResolvedValueOnce(createSuccessResult(slackTarget));
      mockPagerDutyPort.triggerEvent.mockResolvedValueOnce(createSuccessResult(pdTarget));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      const result = await service.dispatch(
        createRoutingDecision({ targets: [slackTarget, pdTarget] }),
        createTriageContext(),
        testBlocks,
        testContext
      );

      expect(result.totalTargets).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(mockSlackPort.postMessage).toHaveBeenCalledTimes(1);
      expect(mockPagerDutyPort.triggerEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("partial failures", () => {
    it("should report partial success when one target fails", async () => {
      const slackTarget = createSlackTarget("#alerts");
      const pdTarget = createPagerDutyTarget("escalation");
      mockSlackPort.postMessage.mockResolvedValueOnce(createSuccessResult(slackTarget));
      mockPagerDutyPort.triggerEvent.mockRejectedValueOnce(new Error("PD API error"));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      const result = await service.dispatch(
        createRoutingDecision({ targets: [slackTarget, pdTarget] }),
        createTriageContext(),
        testBlocks,
        testContext
      );

      expect(result.totalTargets).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
    });

    it("should not prevent other dispatches from completing when one fails", async () => {
      const slackTarget1 = createSlackTarget("#critical");
      const slackTarget2 = createSlackTarget("#general");
      // First fails, second succeeds
      mockSlackPort.postMessage
        .mockRejectedValueOnce(new Error("Rate limited"))
        .mockResolvedValueOnce(createSuccessResult(slackTarget2));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      const result = await service.dispatch(
        createRoutingDecision({ targets: [slackTarget1, slackTarget2] }),
        createTriageContext(),
        testBlocks,
        testContext
      );

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(mockSlackPort.postMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe("all failures", () => {
    it("should report all failures when every target fails", async () => {
      const slackTarget = createSlackTarget("#alerts");
      mockSlackPort.postMessage.mockRejectedValueOnce(new Error("Slack down"));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      const result = await service.dispatch(
        createRoutingDecision({ targets: [slackTarget] }),
        createTriageContext(),
        testBlocks,
        testContext
      );

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBeDefined();
    });
  });

  describe("timing", () => {
    it("should include durationMs in the result", async () => {
      const slackTarget = createSlackTarget("#alerts");
      mockSlackPort.postMessage.mockResolvedValueOnce(createSuccessResult(slackTarget));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      const result = await service.dispatch(
        createRoutingDecision({ targets: [slackTarget] }),
        createTriageContext(),
        testBlocks,
        testContext
      );

      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("severity mapping for PagerDuty", () => {
    it("should map high severity to error for PagerDuty", async () => {
      const pdTarget = createPagerDutyTarget("key-1");
      mockPagerDutyPort.triggerEvent.mockResolvedValueOnce(createSuccessResult(pdTarget));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      await service.dispatch(
        createRoutingDecision({ targets: [pdTarget] }),
        createTriageContext({ severityLabel: "high" }),
        testBlocks,
        testContext
      );

      const payload = mockPagerDutyPort.triggerEvent.mock.calls[0][1] as Record<string, unknown>;
      const innerPayload = payload.payload as Record<string, unknown>;
      expect(innerPayload.severity).toBe("error");
    });

    it("should map medium severity to warning for PagerDuty", async () => {
      const pdTarget = createPagerDutyTarget("key-1");
      mockPagerDutyPort.triggerEvent.mockResolvedValueOnce(createSuccessResult(pdTarget));

      const service = createDispatchService(
        mockSlackPort as unknown as SlackDispatchPort,
        mockPagerDutyPort as unknown as PagerDutyDispatchPort
      );

      await service.dispatch(
        createRoutingDecision({ targets: [pdTarget] }),
        createTriageContext({ severityLabel: "medium" }),
        testBlocks,
        testContext
      );

      const payload = mockPagerDutyPort.triggerEvent.mock.calls[0][1] as Record<string, unknown>;
      const innerPayload = payload.payload as Record<string, unknown>;
      expect(innerPayload.severity).toBe("warning");
    });
  });
});
