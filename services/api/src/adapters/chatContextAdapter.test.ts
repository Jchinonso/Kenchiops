/**
 * Tests for adapters/chatContextAdapter — fetches analysis/incident context and RAG results.
 *
 * Mocks shared database functions (getAnalysisById, getAlertById, searchKnowledgeDocs).
 *
 * @module adapters/chatContextAdapter.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext } from "@kenchi/shared";

// ==================== Mocks ====================

const mockGetAnalysisById = jest.fn();
const mockGetAlertById = jest.fn();
const mockSearchKnowledgeDocs = jest.fn();
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
    getAnalysisById: (...args: unknown[]) => mockGetAnalysisById(...args),
    getAlertById: (...args: unknown[]) => mockGetAlertById(...args),
    searchKnowledgeDocs: (...args: unknown[]) => mockSearchKnowledgeDocs(...args),
    createLogger: () => mockLogger,
  };
});

import { createChatContextAdapter } from "./chatContextAdapter.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-req-id",
  tenantId: "test-tenant",
};

const createAnalysisFixture = (overrides = {}) => ({
  id: "a-1",
  summary: "Build failed on main branch",
  identifiedCause: "Missing dependency in package.json",
  recommendedActions: ["Add lodash to dependencies", "Re-run pipeline"],
  ...overrides,
});

const createAlertFixture = (overrides = {}) => ({
  id: "alert-1",
  title: "High CPU on prod-api-01",
  description: "CPU usage above 95% for 10 minutes",
  severity: "critical",
  status: "firing",
  serviceName: "api-gateway",
  environment: "production",
  ...overrides,
});

// ==================== Tests ====================

describe("createChatContextAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAnalysisContext", () => {
    it("should return ChatContextData when analysis is found", async () => {
      const analysis = createAnalysisFixture();
      mockGetAnalysisById.mockResolvedValue(analysis);

      const adapter = createChatContextAdapter();
      const result = await adapter.getAnalysisContext("a-1", "test-tenant", testContext);

      expect(result).not.toBeNull();
      expect(result?.entityType).toBe("analysis");
      expect(result?.title).toBe("Build failed on main branch");
      expect(result?.summary).toBe("Missing dependency in package.json");
      expect(result?.details).toContain("Root Cause");
      expect(result?.details).toContain("Recommended Actions");
    });

    it("should return null when analysis is not found", async () => {
      mockGetAnalysisById.mockResolvedValue(null);

      const adapter = createChatContextAdapter();
      const result = await adapter.getAnalysisContext("nonexistent", "test-tenant", testContext);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
        expect.objectContaining({
          provider: "database",
          operation: "getAnalysisContext",
          durationMs: expect.any(Number),
          entityId: "nonexistent",
        })
      );
    });

    it("should return null on error (fail-safe)", async () => {
      mockGetAnalysisById.mockRejectedValue(new Error("DB timeout"));

      const adapter = createChatContextAdapter();
      const result = await adapter.getAnalysisContext("a-1", "test-tenant", testContext);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch analysis"),
        expect.objectContaining({
          provider: "database",
          operation: "getAnalysisContext",
          durationMs: expect.any(Number),
          error: "DB timeout",
        })
      );
    });

    it("should handle analysis with no identifiedCause or recommendedActions", async () => {
      const analysis = createAnalysisFixture({
        identifiedCause: null,
        recommendedActions: [],
      });
      mockGetAnalysisById.mockResolvedValue(analysis);

      const adapter = createChatContextAdapter();
      const result = await adapter.getAnalysisContext("a-1", "test-tenant", testContext);

      expect(result).not.toBeNull();
      expect(result?.details).toBeNull();
      expect(result?.summary).toBeNull();
    });

    it("should log success with mandatory adapter fields", async () => {
      mockGetAnalysisById.mockResolvedValue(createAnalysisFixture());

      const adapter = createChatContextAdapter();
      await adapter.getAnalysisContext("a-1", "test-tenant", testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Fetched analysis context"),
        expect.objectContaining({
          provider: "database",
          operation: "getAnalysisContext",
          durationMs: expect.any(Number),
          entityId: "a-1",
          requestId: "test-req-id",
          tenantId: "test-tenant",
        })
      );
    });
  });

  describe("getIncidentContext", () => {
    it("should return ChatContextData with severity/status details", async () => {
      mockGetAlertById.mockResolvedValue(createAlertFixture());

      const adapter = createChatContextAdapter();
      const result = await adapter.getIncidentContext("alert-1", "test-tenant", testContext);

      expect(result).not.toBeNull();
      expect(result?.entityType).toBe("incident");
      expect(result?.title).toBe("High CPU on prod-api-01");
      expect(result?.summary).toBe("CPU usage above 95% for 10 minutes");
      expect(result?.details).toContain("**Severity:** critical");
      expect(result?.details).toContain("**Status:** firing");
      expect(result?.details).toContain("**Service:** api-gateway");
      expect(result?.details).toContain("**Environment:** production");
    });

    it("should return null when incident is not found", async () => {
      mockGetAlertById.mockResolvedValue(null);

      const adapter = createChatContextAdapter();
      const result = await adapter.getIncidentContext("missing", "test-tenant", testContext);

      expect(result).toBeNull();
    });

    it("should return null on error (fail-safe)", async () => {
      mockGetAlertById.mockRejectedValue(new Error("Connection refused"));

      const adapter = createChatContextAdapter();
      const result = await adapter.getIncidentContext("alert-1", "test-tenant", testContext);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch incident"),
        expect.objectContaining({
          provider: "database",
          operation: "getIncidentContext",
          error: "Connection refused",
        })
      );
    });

    it("should omit optional fields when serviceName and environment are null", async () => {
      const alert = createAlertFixture({
        serviceName: null,
        environment: null,
      });
      mockGetAlertById.mockResolvedValue(alert);

      const adapter = createChatContextAdapter();
      const result = await adapter.getIncidentContext("alert-1", "test-tenant", testContext);

      expect(result?.details).not.toContain("**Service:**");
      expect(result?.details).not.toContain("**Environment:**");
    });

    it("should log success with mandatory adapter fields", async () => {
      mockGetAlertById.mockResolvedValue(createAlertFixture());

      const adapter = createChatContextAdapter();
      await adapter.getIncidentContext("alert-1", "test-tenant", testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Fetched incident context"),
        expect.objectContaining({
          provider: "database",
          operation: "getIncidentContext",
          durationMs: expect.any(Number),
          entityId: "alert-1",
          requestId: "test-req-id",
          tenantId: "test-tenant",
        })
      );
    });
  });

  describe("searchRAG", () => {
    it("should return formatted results with sources", async () => {
      mockSearchKnowledgeDocs.mockResolvedValue({
        results: [
          {
            item: {
              title: "Fix TS compile errors",
              docType: "resolution",
              content: "Install missing deps...",
            },
            similarity: 0.92,
          },
        ],
      });

      const adapter = createChatContextAdapter();
      const result = await adapter.searchRAG("typescript error", "test-tenant", testContext);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe("Fix TS compile errors");
      expect(result.sources[0].similarity).toBe(0.92);
      expect(result.formattedContext).toContain("Relevant Knowledge Base Context");
      expect(result.formattedContext).toContain("92% match");
    });

    it("should return empty result when no docs match", async () => {
      mockSearchKnowledgeDocs.mockResolvedValue({ results: [] });

      const adapter = createChatContextAdapter();
      const result = await adapter.searchRAG("obscure query", "test-tenant", testContext);

      expect(result.sources).toHaveLength(0);
      expect(result.formattedContext).toBe("");
    });

    it("should return empty result on error (fail-safe)", async () => {
      mockSearchKnowledgeDocs.mockRejectedValue(new Error("Embedding service down"));

      const adapter = createChatContextAdapter();
      const result = await adapter.searchRAG("test query", "test-tenant", testContext);

      expect(result.formattedContext).toBe("");
      expect(result.sources).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("RAG search failed"),
        expect.objectContaining({
          provider: "rag",
          operation: "searchKnowledgeDocs",
          durationMs: expect.any(Number),
          error: "Embedding service down",
        })
      );
    });

    it("should truncate long content in RAG docs", async () => {
      const longContent = "a".repeat(10_000);
      mockSearchKnowledgeDocs.mockResolvedValue({
        results: [
          {
            item: {
              title: "Long doc",
              docType: "runbook",
              content: longContent,
            },
            similarity: 0.8,
          },
        ],
      });

      const adapter = createChatContextAdapter();
      const result = await adapter.searchRAG("query", "test-tenant", testContext);

      expect(result.formattedContext).toContain("...<TRUNCATED>");
      expect(result.formattedContext.length).toBeLessThan(longContent.length);
    });

    it("should log success with mandatory adapter fields", async () => {
      mockSearchKnowledgeDocs.mockResolvedValue({ results: [] });

      const adapter = createChatContextAdapter();
      await adapter.searchRAG("query", "test-tenant", testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("RAG search completed"),
        expect.objectContaining({
          provider: "rag",
          operation: "searchKnowledgeDocs",
          durationMs: expect.any(Number),
          resultCount: 0,
          requestId: "test-req-id",
          tenantId: "test-tenant",
        })
      );
    });

    it("should limit results to MAX_RAG_RESULTS", async () => {
      // Return more results than the limit
      const manyResults = Array.from({ length: 20 }, (_, i) => ({
        item: {
          title: `Doc ${i}`,
          docType: "resolution",
          content: `Content ${i}`,
        },
        similarity: 0.9 - i * 0.01,
      }));
      mockSearchKnowledgeDocs.mockResolvedValue({
        results: manyResults,
      });

      const adapter = createChatContextAdapter();
      const result = await adapter.searchRAG("query", "test-tenant", testContext);

      // Should be capped by MAX_RAG_RESULTS (5 by default)
      expect(result.sources.length).toBeLessThanOrEqual(5);
    });
  });
});
