/**
 * Tests for chat/chatContext — fail-safe fetching of page context, RAG, and investigation.
 *
 * @module chat/chatContext.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type {
  ChatContextPort,
  ChatCompletionInput,
  ChatContextData,
  ChatRAGResult,
  ChatInvestigationResult,
} from "../../chat/types.js";
import type { RequestContext } from "../../core/types.js";

// ==================== Mocks ====================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../../core/logger.js", () => ({
  createLogger: () => mockLogger,
}));

import {
  fetchPageContext,
  fetchRAGContext,
  fetchInvestigationContext,
} from "../../chat/chatContext.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-req-id",
  tenantId: "test-tenant",
};

const createInput = (overrides: Partial<ChatCompletionInput> = {}): ChatCompletionInput => ({
  userMessage: "why is the system slow?",
  pageContext: { pageType: "incident", entityId: "alert-123" },
  tenantId: "test-tenant",
  userId: "user-1",
  ...overrides,
});

const createContextData = (overrides: Partial<ChatContextData> = {}): ChatContextData => ({
  entityType: "incident",
  title: "High CPU on prod",
  summary: "CPU above 95%",
  details: "**Severity:** critical",
  ...overrides,
});

const createRAGResult = (overrides: Partial<ChatRAGResult> = {}): ChatRAGResult => ({
  formattedContext: "## Relevant Knowledge Base\n\nSome docs.",
  sources: [{ title: "Fix CPU issues", docType: "resolution", similarity: 0.9 }],
  ...overrides,
});

const createInvestigationResult = (
  overrides: Partial<ChatInvestigationResult> = {}
): ChatInvestigationResult => ({
  formattedContext: "## Investigation\n\nRoot cause found.",
  diagnosis: {
    summary: "Connection pool exhaustion",
    rootCauseHypothesis: "Saturated connections",
    confidence: 0.85,
    suggestedActions: [{ action: "Scale pool", priority: "immediate" }],
    evidenceSources: ["datadog_metrics"],
  },
  evidenceCount: 3,
  success: true,
  ...overrides,
});

const createContextPort = (overrides: Partial<ChatContextPort> = {}): ChatContextPort => ({
  getAnalysisContext: jest.fn<ChatContextPort["getAnalysisContext"]>().mockResolvedValue(null),
  getIncidentContext: jest
    .fn<ChatContextPort["getIncidentContext"]>()
    .mockResolvedValue(createContextData()),
  searchRAG: jest.fn<ChatContextPort["searchRAG"]>().mockResolvedValue(createRAGResult()),
  ...overrides,
});

// ==================== fetchInvestigationContext ====================

describe("fetchInvestigationContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return null when contextPort is undefined", async () => {
    const result = await fetchInvestigationContext(undefined, createInput(), testContext);

    expect(result).toBeNull();
  });

  it("should return null when investigateIncident method is missing", async () => {
    const port = createContextPort();
    // investigateIncident is not set

    const result = await fetchInvestigationContext(port, createInput(), testContext);

    expect(result).toBeNull();
  });

  it("should return null when pageType is not incident", async () => {
    const mockInvestigate = jest.fn<NonNullable<ChatContextPort["investigateIncident"]>>();
    const port = createContextPort({ investigateIncident: mockInvestigate });
    const input = createInput({ pageContext: { pageType: "analysis", entityId: "a-1" } });

    const result = await fetchInvestigationContext(port, input, testContext);

    expect(result).toBeNull();
    expect(mockInvestigate).not.toHaveBeenCalled();
  });

  it("should return null when entityId is missing", async () => {
    const mockInvestigate = jest.fn<NonNullable<ChatContextPort["investigateIncident"]>>();
    const port = createContextPort({ investigateIncident: mockInvestigate });
    const input = createInput({ pageContext: { pageType: "incident" } });

    const result = await fetchInvestigationContext(port, input, testContext);

    expect(result).toBeNull();
    expect(mockInvestigate).not.toHaveBeenCalled();
  });

  it("should call investigateIncident with correct args for valid incident page", async () => {
    const investigationResult = createInvestigationResult();
    const mockInvestigate = jest
      .fn<NonNullable<ChatContextPort["investigateIncident"]>>()
      .mockResolvedValue(investigationResult);
    const port = createContextPort({ investigateIncident: mockInvestigate });
    const input = createInput();

    const result = await fetchInvestigationContext(port, input, testContext);

    expect(mockInvestigate).toHaveBeenCalledWith(
      "why is the system slow?",
      "alert-123",
      "test-tenant",
      testContext
    );
    expect(result).toEqual(investigationResult);
  });

  it("should return null on error and log warning", async () => {
    const mockInvestigate = jest
      .fn<NonNullable<ChatContextPort["investigateIncident"]>>()
      .mockRejectedValue(new Error("investigation boom"));
    const port = createContextPort({ investigateIncident: mockInvestigate });

    const result = await fetchInvestigationContext(port, createInput(), testContext);

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Investigation failed — proceeding without it",
      expect.objectContaining({
        error: "investigation boom",
      })
    );
  });

  it("should return investigation result on success", async () => {
    const investigationResult = createInvestigationResult({ evidenceCount: 5 });
    const mockInvestigate = jest
      .fn<NonNullable<ChatContextPort["investigateIncident"]>>()
      .mockResolvedValue(investigationResult);
    const port = createContextPort({ investigateIncident: mockInvestigate });

    const result = await fetchInvestigationContext(port, createInput(), testContext);

    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    expect(result?.evidenceCount).toBe(5);
  });
});

// ==================== fetchPageContext ====================

describe("fetchPageContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return null when contextPort is undefined", async () => {
    const result = await fetchPageContext(
      undefined,
      { pageType: "incident", entityId: "a-1" },
      "t-1",
      testContext
    );

    expect(result).toBeNull();
  });

  it("should return null when entityId is missing", async () => {
    const port = createContextPort();
    const result = await fetchPageContext(port, { pageType: "incident" }, "t-1", testContext);

    expect(result).toBeNull();
  });

  it("should return null for unsupported page type", async () => {
    const port = createContextPort();
    const result = await fetchPageContext(
      port,
      { pageType: "overview", entityId: "x" },
      "t-1",
      testContext
    );

    expect(result).toBeNull();
  });

  it("should call getIncidentContext for incident page type", async () => {
    const contextData = createContextData();
    const port = createContextPort({
      getIncidentContext: jest
        .fn<ChatContextPort["getIncidentContext"]>()
        .mockResolvedValue(contextData),
    });

    const result = await fetchPageContext(
      port,
      { pageType: "incident", entityId: "alert-1" },
      "t-1",
      testContext
    );

    expect(port.getIncidentContext).toHaveBeenCalledWith("alert-1", "t-1", testContext);
    expect(result).toEqual(contextData);
  });

  it("should call getAnalysisContext for analysis page type", async () => {
    const contextData = createContextData({ entityType: "analysis", title: "Build failure" });
    const port = createContextPort({
      getAnalysisContext: jest
        .fn<ChatContextPort["getAnalysisContext"]>()
        .mockResolvedValue(contextData),
    });

    const result = await fetchPageContext(
      port,
      { pageType: "analysis", entityId: "a-1" },
      "t-1",
      testContext
    );

    expect(port.getAnalysisContext).toHaveBeenCalledWith("a-1", "t-1", testContext);
    expect(result).toEqual(contextData);
  });

  it("should return null and log warning on error", async () => {
    const port = createContextPort({
      getIncidentContext: jest
        .fn<ChatContextPort["getIncidentContext"]>()
        .mockRejectedValue(new Error("db error")),
    });

    const result = await fetchPageContext(
      port,
      { pageType: "incident", entityId: "alert-1" },
      "t-1",
      testContext
    );

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Failed to fetch page context — proceeding without it",
      expect.objectContaining({
        pageType: "incident",
        error: "db error",
      })
    );
  });
});

// ==================== fetchRAGContext ====================

describe("fetchRAGContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return null when contextPort is undefined", async () => {
    const result = await fetchRAGContext(undefined, "query", null, "t-1", testContext);

    expect(result).toBeNull();
  });

  it("should call searchRAG with user message when no page context", async () => {
    const ragResult = createRAGResult();
    const port = createContextPort({
      searchRAG: jest.fn<ChatContextPort["searchRAG"]>().mockResolvedValue(ragResult),
    });

    const result = await fetchRAGContext(port, "why is it slow?", null, "t-1", testContext);

    expect(port.searchRAG).toHaveBeenCalledWith("why is it slow?", "t-1", testContext);
    expect(result).toEqual(ragResult);
  });

  it("should enrich query with page context title and summary", async () => {
    const ragResult = createRAGResult();
    const port = createContextPort({
      searchRAG: jest.fn<ChatContextPort["searchRAG"]>().mockResolvedValue(ragResult),
    });
    const pageContext = createContextData({ title: "High CPU", summary: "CPU at 95%" });

    await fetchRAGContext(port, "why?", pageContext, "t-1", testContext);

    expect(port.searchRAG).toHaveBeenCalledWith("why? High CPU CPU at 95%", "t-1", testContext);
  });

  it("should enrich query with only title when summary is null", async () => {
    const ragResult = createRAGResult();
    const port = createContextPort({
      searchRAG: jest.fn<ChatContextPort["searchRAG"]>().mockResolvedValue(ragResult),
    });
    const pageContext = createContextData({ title: "Alert Title", summary: null });

    await fetchRAGContext(port, "help", pageContext, "t-1", testContext);

    expect(port.searchRAG).toHaveBeenCalledWith("help Alert Title", "t-1", testContext);
  });

  it("should return null and log warning on error", async () => {
    const port = createContextPort({
      searchRAG: jest
        .fn<ChatContextPort["searchRAG"]>()
        .mockRejectedValue(new Error("vector db down")),
    });

    const result = await fetchRAGContext(port, "query", null, "t-1", testContext);

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "RAG search failed — proceeding without context",
      expect.objectContaining({
        error: "vector db down",
      })
    );
  });
});
