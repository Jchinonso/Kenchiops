/**
 * AI Summarizer Tests
 *
 * Tests for the AI summarizer service with mocked LLMCompletionPort.
 * Verifies: successful AI summarization, parse failure fallback,
 * validation failure fallback, hallucination fallback, and LLM error fallback.
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
  checkForHallucinations: jest.fn(() => ({ isLikelyHallucinated: false })),
}));

jest.mock("../../config/appConfig.js", () => ({
  appConfig: {
    triageLlmModel: "test-model",
  },
}));

import { createAiSummarizer } from "../../services/aiSummarizer.js";
import type { LLMCompletionPort, AiSummarizerInput } from "../../types/summaryTypes.js";
import type { NormalizedAlert } from "../../types/incidentTypes.js";
import type { SeverityScore } from "../../types/severityTypes.js";
import type { EvidenceCatalog } from "../../types/evidenceTypes.js";
import type { RequestContext } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createTestAlert = (): NormalizedAlert => ({
  sourceAlertId: "alert-1",
  deliveryId: "delivery-1",
  source: "pagerduty",
  title: "High CPU on payments-api",
  description: "CPU utilization above 95%",
  severity: "high",
  fingerprint: "fp-123",
  serviceName: "payments-api",
  environment: "production",
  metrics: { cpu: 95 },
  labels: {},
  receivedAt: "2026-02-19T14:00:00.000Z",
  sourcePayload: {},
});

const createTestSeverity = (): SeverityScore => ({
  total: 72,
  label: "high",
  factors: [{ name: "source_severity", weight: 25, score: 18, maxScore: 25, reason: "high" }],
});

const createTestCatalog = (): EvidenceCatalog => ({
  items: {
    "ALT-title": {
      id: "ALT-title",
      prefix: "ALT",
      label: "Title",
      value: "High CPU",
      source: "alert",
    },
    "SEV-label": {
      id: "SEV-label",
      prefix: "SEV",
      label: "Label",
      value: "high",
      source: "classifier",
    },
  },
  confidence: { total: 0.8, signals: [] },
  completeness: {
    total: 0.7,
    requiredPresent: 4,
    requiredTotal: 4,
    expectedPresent: 3,
    expectedTotal: 3,
    optionalPresent: 1,
    optionalTotal: 4,
    missingFields: [],
  },
  collectedAt: "2026-02-19T14:00:00.000Z",
});

const createTestInput = (): AiSummarizerInput => ({
  alert: createTestAlert(),
  severity: createTestSeverity(),
  runbooks: [],
  correlations: [],
  evidenceCatalog: createTestCatalog(),
});

const createValidAiResponse = (): string =>
  JSON.stringify({
    headline: "High CPU on payments-api",
    rootCauseSummary: "CPU spike caused by increased traffic",
    impactAssessment: "High severity affecting production",
    suggestedActions: [
      {
        action: "Investigate CPU usage",
        reasoning: "CPU is at 95% (ALT-title)",
        priority: "immediate",
      },
    ],
    evidencesCited: ["ALT-title", "SEV-label"],
    summarySource: "ai",
  });

const createMockLlmPort = (): { complete: jest.Mock } => ({
  complete: jest.fn(),
});

// ==================== Tests ====================

describe("createAiSummarizer", () => {
  // let: mock reference changes per test in beforeEach
  let mockLlmPort: ReturnType<typeof createMockLlmPort>;

  beforeEach(() => {
    mockLlmPort = createMockLlmPort();
    jest.clearAllMocks();
    // Reset hallucination check to default (not hallucinated)
    const shared = jest.requireMock("@kenchi/shared") as {
      checkForHallucinations: jest.Mock;
    };
    shared.checkForHallucinations.mockReturnValue({ isLikelyHallucinated: false });
  });

  describe("successful AI summarization", () => {
    it("should return parsed AI response when valid", async () => {
      mockLlmPort.complete.mockResolvedValueOnce(createValidAiResponse());

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.summarySource).toBe("ai");
      expect(result.headline).toBe("High CPU on payments-api");
      expect(result.rootCauseSummary).toBe("CPU spike caused by increased traffic");
      expect(result.suggestedActions).toHaveLength(1);
      expect(result.evidencesCited).toContain("ALT-title");
    });

    it("should pass system prompt and user prompt to LLM port", async () => {
      mockLlmPort.complete.mockResolvedValueOnce(createValidAiResponse());

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      await summarizer.summarize(createTestInput(), testContext);

      expect(mockLlmPort.complete).toHaveBeenCalledWith(
        expect.stringContaining("incident triage"),
        expect.stringContaining("NORMALIZED ALERT"),
        expect.objectContaining({
          model: "test-model",
          temperature: 0,
        }),
        testContext
      );
    });
  });

  describe("parse failure fallback", () => {
    it("should fall back when LLM returns invalid JSON", async () => {
      mockLlmPort.complete.mockResolvedValueOnce("This is not JSON at all");

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.summarySource).toBe("fallback");
    });

    it("should fall back when LLM returns empty string", async () => {
      mockLlmPort.complete.mockResolvedValueOnce("");

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.summarySource).toBe("fallback");
    });
  });

  describe("validation failure fallback", () => {
    it("should fall back when AI response fails output validation", async () => {
      // Valid JSON but fails validation (missing required fields, wrong summarySource)
      const invalidResponse = JSON.stringify({
        headline: "",
        rootCauseSummary: "",
        impactAssessment: "",
        suggestedActions: [],
        evidencesCited: [],
        summarySource: "ai",
      });
      mockLlmPort.complete.mockResolvedValueOnce(invalidResponse);

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.summarySource).toBe("fallback");
    });

    it("should fall back when AI cites non-existent evidence IDs", async () => {
      const responseWithBadCitations = JSON.stringify({
        headline: "High CPU alert",
        rootCauseSummary: "CPU is high",
        impactAssessment: "Production affected",
        suggestedActions: [{ action: "Check CPU", reasoning: "High usage", priority: "immediate" }],
        evidencesCited: ["FAKE-evidence-id"],
        summarySource: "ai",
      });
      mockLlmPort.complete.mockResolvedValueOnce(responseWithBadCitations);

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.summarySource).toBe("fallback");
    });
  });

  describe("hallucination fallback", () => {
    it("should fall back when hallucination detection flags the response", async () => {
      mockLlmPort.complete.mockResolvedValueOnce(createValidAiResponse());
      const shared = jest.requireMock("@kenchi/shared") as {
        checkForHallucinations: jest.Mock;
      };
      shared.checkForHallucinations.mockReturnValue({ isLikelyHallucinated: true });

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.summarySource).toBe("fallback");
    });
  });

  describe("LLM error fallback", () => {
    it("should fall back when LLM port throws an error", async () => {
      mockLlmPort.complete.mockRejectedValueOnce(new Error("LLM API timeout"));

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.summarySource).toBe("fallback");
    });

    it("should fall back when LLM port throws a non-Error", async () => {
      mockLlmPort.complete.mockRejectedValueOnce("string error");

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.summarySource).toBe("fallback");
    });
  });

  describe("fallback summary quality", () => {
    it("should produce a valid fallback summary with all required fields", async () => {
      mockLlmPort.complete.mockRejectedValueOnce(new Error("LLM down"));

      const summarizer = createAiSummarizer(mockLlmPort as unknown as LLMCompletionPort);
      const result = await summarizer.summarize(createTestInput(), testContext);

      expect(result.headline.length).toBeGreaterThan(0);
      expect(result.rootCauseSummary.length).toBeGreaterThan(0);
      expect(result.impactAssessment.length).toBeGreaterThan(0);
      expect(result.suggestedActions.length).toBeGreaterThanOrEqual(1);
      expect(result.summarySource).toBe("fallback");
    });
  });
});
