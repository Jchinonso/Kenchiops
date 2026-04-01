/**
 * Tests for adapters/chatInvestigationAdapter — bridges investigation service into chat context.
 *
 * Tests the 4-stage pipeline (intent → evidence → correlate → diagnose),
 * markdown formatting, truncation, evidence capping, graceful degradation,
 * and structured logging.
 *
 * @module adapters/chatInvestigationAdapter.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type {
  RequestContext,
  InvestigationService,
  InvestigationIntent,
  InvestigationEvidenceItem,
  InvestigationCorrelation,
  InvestigationDiagnosis,
} from "@kenchi/shared";

// ==================== Mocks ====================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual<typeof import("@kenchi/shared")>("@kenchi/shared");
  return {
    ...actual,
    createLogger: () => mockLogger,
  };
});

import { createChatInvestigationAdapter } from "./chatInvestigationAdapter.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-req-id",
  tenantId: "test-tenant",
};

const createIntent = (overrides: Partial<InvestigationIntent> = {}): InvestigationIntent => ({
  serviceName: "api-gateway",
  endpoint: null,
  symptom: "slow_response",
  environment: "production",
  timeRangeFrom: null,
  timeRangeTo: null,
  confidenceScore: 0.9,
  ...overrides,
});

const createEvidenceItem = (
  overrides: Partial<InvestigationEvidenceItem> = {},
  index = 0
): InvestigationEvidenceItem => ({
  id: `ev-${index}`,
  source: "datadog_metrics" as InvestigationEvidenceItem["source"],
  title: `Evidence item ${index}`,
  summary: `Summary for evidence item ${index}`,
  relevance: 0.95 - index * 0.05,
  timestamp: "2026-03-30T14:00:00Z",
  metadata: {},
  ...overrides,
});

const createCorrelation = (
  overrides: Partial<InvestigationCorrelation> = {}
): InvestigationCorrelation => ({
  patterns: ["Recurring failures in api-gateway (5 in 24h)"],
  timelineEvents: [],
  relatedServices: ["api-gateway", "reporting-service"],
  commonFactors: ["high traffic"],
  ...overrides,
});

const createDiagnosis = (
  overrides: Partial<InvestigationDiagnosis> = {}
): InvestigationDiagnosis => ({
  summary: "DB connection pool exhaustion",
  rootCauseHypothesis: "Long-running queries saturated connection pool",
  confidence: 0.87,
  suggestedActions: [
    { action: "Scale up DB pool", priority: "immediate", reasoning: "Pool at 100%" },
    { action: "Add query timeout", priority: "short_term", reasoning: "Prevent future saturation" },
  ],
  evidenceCited: ["ev-0", "ev-1"],
  diagnosisSource: "ai",
  ...overrides,
});

const createMockInvestigationService = (
  overrides: Partial<InvestigationService> = {}
): InvestigationService => ({
  parseIntent: jest.fn<InvestigationService["parseIntent"]>().mockResolvedValue(createIntent()),
  gatherEvidence: jest
    .fn<InvestigationService["gatherEvidence"]>()
    .mockResolvedValue([createEvidenceItem({}, 0), createEvidenceItem({}, 1)]),
  correlateEvidence: jest
    .fn<InvestigationService["correlateEvidence"]>()
    .mockResolvedValue(createCorrelation()),
  diagnose: jest.fn<InvestigationService["diagnose"]>().mockResolvedValue(createDiagnosis()),
  ...overrides,
});

// ==================== Tests ====================

describe("createChatInvestigationAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("investigate", () => {
    it("should run the 4-stage investigation pipeline successfully", async () => {
      const mockService = createMockInvestigationService();
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate(
        "why is the system slow?",
        "alert-1",
        "t-1",
        testContext
      );

      expect(mockService.parseIntent).toHaveBeenCalledWith("why is the system slow?", testContext);
      expect(mockService.gatherEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ symptom: "slow_response" }),
        "t-1",
        testContext
      );
      expect(mockService.correlateEvidence).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ symptom: "slow_response" }),
        testContext
      );
      expect(mockService.diagnose).toHaveBeenCalledWith(
        expect.objectContaining({ symptom: "slow_response" }),
        expect.any(Array),
        expect.objectContaining({ patterns: expect.any(Array) }),
        testContext
      );

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.evidenceCount).toBe(2);
      expect(result?.diagnosis).toEqual(
        expect.objectContaining({
          summary: "DB connection pool exhaustion",
          rootCauseHypothesis: "Long-running queries saturated connection pool",
          confidence: 0.87,
        })
      );
    });

    it("should format investigation result as markdown for prompt", async () => {
      const mockService = createMockInvestigationService();
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate("why slow?", "alert-1", "t-1", testContext);

      expect(result?.formattedContext).toContain("## Live Investigation Results");
      expect(result?.formattedContext).toContain("### Diagnosis");
      expect(result?.formattedContext).toContain("**Root Cause Hypothesis:**");
      expect(result?.formattedContext).toContain("**Confidence:** 87%");
      expect(result?.formattedContext).toContain("**Symptom Detected:** slow response");
      expect(result?.formattedContext).toContain("**Affected Service:** api-gateway");
      expect(result?.formattedContext).toContain("### Suggested Actions");
      expect(result?.formattedContext).toContain("[URGENT] Scale up DB pool");
      expect(result?.formattedContext).toContain("[SHORT-TERM] Add query timeout");
      expect(result?.formattedContext).toContain("### Monitoring Evidence");
      expect(result?.formattedContext).toContain("### Detected Patterns");
      expect(result?.formattedContext).toContain("### Related Services:");
    });

    it("should truncate formatted context at MAX_INVESTIGATION_CONTEXT_TOKENS", async () => {
      const longHypothesis = "A".repeat(20_000);
      const mockService = createMockInvestigationService({
        diagnose: jest
          .fn<InvestigationService["diagnose"]>()
          .mockResolvedValue(createDiagnosis({ rootCauseHypothesis: longHypothesis })),
      });
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate("why?", "alert-1", "t-1", testContext);

      // MAX_INVESTIGATION_CONTEXT_TOKENS (4000) * CHARS_PER_TOKEN (4) = 16000 chars
      expect(result?.formattedContext.length).toBeLessThanOrEqual(16_000);
    });

    it("should cap evidence to MAX_INVESTIGATION_EVIDENCE_IN_PROMPT (10)", async () => {
      const manyEvidence = Array.from({ length: 15 }, (_, idx) => createEvidenceItem({}, idx));
      const mockService = createMockInvestigationService({
        gatherEvidence: jest
          .fn<InvestigationService["gatherEvidence"]>()
          .mockResolvedValue(manyEvidence),
      });
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate("why?", "alert-1", "t-1", testContext);

      // Should include only first 10 evidence items in formatted context
      const evidenceMatches = result?.formattedContext.match(/\[datadog_metrics\]/g);
      expect(evidenceMatches?.length ?? 0).toBeLessThanOrEqual(10);
      // But evidenceCount in the result should reflect all 15
      expect(result?.evidenceCount).toBe(15);
    });

    it("should strip reasoning from suggestedActions in the diagnosis payload", async () => {
      const mockService = createMockInvestigationService();
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate("why?", "alert-1", "t-1", testContext);

      const actions = result?.diagnosis?.suggestedActions ?? [];
      expect(actions.length).toBe(2);
      // Each action should have action + priority but NOT reasoning
      for (const action of actions) {
        expect(action).toHaveProperty("action");
        expect(action).toHaveProperty("priority");
        expect(action).not.toHaveProperty("reasoning");
      }
    });

    it("should deduplicate evidence sources in the diagnosis", async () => {
      const evidence = [
        createEvidenceItem({ source: "datadog_metrics" as InvestigationEvidenceItem["source"] }, 0),
        createEvidenceItem({ source: "datadog_metrics" as InvestigationEvidenceItem["source"] }, 1),
        createEvidenceItem(
          { source: "pagerduty_incidents" as InvestigationEvidenceItem["source"] },
          2
        ),
      ];
      const mockService = createMockInvestigationService({
        gatherEvidence: jest
          .fn<InvestigationService["gatherEvidence"]>()
          .mockResolvedValue(evidence),
      });
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate("why?", "alert-1", "t-1", testContext);

      expect(result?.diagnosis?.evidenceSources).toEqual([
        "datadog_metrics",
        "pagerduty_incidents",
      ]);
    });

    it("should return null on error (graceful degradation)", async () => {
      const mockService = createMockInvestigationService({
        parseIntent: jest
          .fn<InvestigationService["parseIntent"]>()
          .mockRejectedValue(new Error("LLM timeout")),
      });
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate("why?", "alert-1", "t-1", testContext);

      expect(result).toBeNull();
    });

    it("should log with correct provider/operation/durationMs on success", async () => {
      const mockService = createMockInvestigationService();
      const adapter = createChatInvestigationAdapter(mockService);

      await adapter.investigate("why?", "alert-1", "t-1", testContext);

      // Intent parsed log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Investigation intent parsed",
        expect.objectContaining({
          provider: "llm",
          operation: "parseInvestigationIntent",
          durationMs: expect.any(Number),
        })
      );

      // Completion log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Investigation completed for chat",
        expect.objectContaining({
          provider: "llm",
          operation: "chatInvestigation",
          durationMs: expect.any(Number),
          evidenceCount: 2,
          diagnosisConfidence: 0.87,
          diagnosisSource: "ai",
        })
      );
    });

    it("should log with correct fields on failure", async () => {
      const mockService = createMockInvestigationService({
        gatherEvidence: jest
          .fn<InvestigationService["gatherEvidence"]>()
          .mockRejectedValue(new Error("network error")),
      });
      const adapter = createChatInvestigationAdapter(mockService);

      await adapter.investigate("why?", "alert-1", "t-1", testContext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Investigation failed for chat, falling back to static context",
        expect.objectContaining({
          provider: "llm",
          operation: "chatInvestigation",
          durationMs: expect.any(Number),
        })
      );
    });

    it("should handle empty evidence gracefully", async () => {
      const mockService = createMockInvestigationService({
        gatherEvidence: jest.fn<InvestigationService["gatherEvidence"]>().mockResolvedValue([]),
      });
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate("why?", "alert-1", "t-1", testContext);

      expect(result?.success).toBe(true);
      expect(result?.evidenceCount).toBe(0);
      expect(result?.formattedContext).not.toContain("### Monitoring Evidence");
    });

    it("should omit affected service when serviceName is null", async () => {
      const mockService = createMockInvestigationService({
        parseIntent: jest
          .fn<InvestigationService["parseIntent"]>()
          .mockResolvedValue(createIntent({ serviceName: null })),
      });
      const adapter = createChatInvestigationAdapter(mockService);

      const result = await adapter.investigate("why?", "alert-1", "t-1", testContext);

      expect(result?.formattedContext).not.toContain("**Affected Service:**");
    });
  });
});
