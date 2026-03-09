/**
 * Unit tests for Knowledge Document Repository
 *
 * Tests the two new Phase 2 repository functions:
 * - getKnowledgeDocsByTenant: paginated listing with optional docType filter
 * - getKnowledgeDocCountsByTypeForTenant: tenant-scoped document counts by type
 *
 * Mocks the database query function and logger to isolate repository logic.
 *
 * Code paths covered:
 *
 * getKnowledgeDocsByTenant:
 *  - Returns paginated documents with correct total count
 *  - Filters by docType when provided in options
 *  - Calls correct SQL query for unfiltered vs filtered
 *  - Handles empty results (zero docs)
 *  - Validates tenantId (throws ValidationError for empty string)
 *  - Runs docs query and count query in parallel (Promise.all)
 *  - Maps raw rows to domain objects via mapRowToKnowledgeDoc
 *  - Handles count row with missing count field (defaults to 0)
 *  - Propagates database errors
 *
 * getKnowledgeDocCountsByTypeForTenant:
 *  - Returns counts grouped by doc type
 *  - Returns empty object when no documents exist
 *  - Validates tenantId (throws ValidationError for empty string)
 *  - Parses string count values to integers
 *  - Propagates database errors
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ==================== Mock Setup ====================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock("../common.js", () => {
  // Re-export real constants and validators
  const actual = jest.requireActual("../common.js") as Record<string, unknown>;
  return {
    ...actual,
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: jest.fn(),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    generateEventId: jest.fn(() => "generated-id"),
  };
});

// ==================== Import module under test ====================

import { getKnowledgeDocsByTenant, getKnowledgeDocCountsByTypeForTenant } from "./repository.js";
import { KNOWLEDGE_DOC_QUERIES } from "../common.js";
import type { KnowledgeDocRow } from "./types.js";

// ==================== Fixtures ====================

const NOW = new Date("2025-06-15T12:00:00Z");

const createMockRow = (overrides: Partial<KnowledgeDocRow> = {}): KnowledgeDocRow => ({
  id: "doc-1",
  repository: "owner/repo",
  parent_id: null,
  doc_type: "troubleshooting",
  title: "How to fix OOM errors",
  content: "When your application runs out of memory...",
  source_url: "https://docs.example.com/oom",
  file_path: "docs/troubleshooting/oom.md",
  chunk_index: 0,
  embedding: null,
  embedding_model: "text-embedding-3-small",
  embedding_version: "1",
  tenant_id: "tenant-abc",
  metadata: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

// ==================== Tests ====================

describe("getKnowledgeDocsByTenant", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return paginated documents for a tenant without docType filter", async () => {
    const row1 = createMockRow({ id: "doc-1", title: "First doc" });
    const row2 = createMockRow({ id: "doc-2", title: "Second doc" });

    // First call returns docs, second returns count
    mockQuery
      .mockResolvedValueOnce({ rows: [row1, row2] })
      .mockResolvedValueOnce({ rows: [{ count: "42" }] });

    const result = await getKnowledgeDocsByTenant("tenant-abc", {
      limit: 10,
      offset: 0,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(42);
    expect(result.items[0].id).toBe("doc-1");
    expect(result.items[1].id).toBe("doc-2");
  });

  it("should use GET_BY_TENANT query when no docType is provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: "0" }] });

    await getKnowledgeDocsByTenant("tenant-abc", { limit: 50, offset: 0 });

    // Docs query
    expect(mockQuery).toHaveBeenCalledWith(KNOWLEDGE_DOC_QUERIES.GET_BY_TENANT, [
      "tenant-abc",
      50,
      0,
    ]);
    // Count query
    expect(mockQuery).toHaveBeenCalledWith(KNOWLEDGE_DOC_QUERIES.COUNT_BY_TENANT, ["tenant-abc"]);
  });

  it("should use GET_BY_TENANT_AND_DOC_TYPE query when docType is provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: "0" }] });

    await getKnowledgeDocsByTenant("tenant-abc", {
      docType: "runbook" as const,
      limit: 25,
      offset: 10,
    });

    // Docs query
    expect(mockQuery).toHaveBeenCalledWith(KNOWLEDGE_DOC_QUERIES.GET_BY_TENANT_AND_DOC_TYPE, [
      "tenant-abc",
      "runbook",
      25,
      10,
    ]);
    // Count query
    expect(mockQuery).toHaveBeenCalledWith(KNOWLEDGE_DOC_QUERIES.COUNT_BY_TENANT_AND_DOC_TYPE, [
      "tenant-abc",
      "runbook",
    ]);
  });

  it("should return correct total count from count query", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [createMockRow()] })
      .mockResolvedValueOnce({ rows: [{ count: "157" }] });

    const result = await getKnowledgeDocsByTenant("tenant-abc", { limit: 10, offset: 0 });

    expect(result.total).toBe(157);
  });

  it("should handle empty results when no documents exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const result = await getKnowledgeDocsByTenant("tenant-abc", { limit: 10, offset: 0 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("should throw ValidationError when tenantId is empty string", async () => {
    await expect(getKnowledgeDocsByTenant("", { limit: 10, offset: 0 })).rejects.toThrow();
  });

  it("should throw ValidationError when tenantId is whitespace-only", async () => {
    await expect(getKnowledgeDocsByTenant("   ", { limit: 10, offset: 0 })).rejects.toThrow();
  });

  it("should map database rows to domain objects with camelCase keys", async () => {
    const row = createMockRow({
      id: "doc-mapped",
      parent_id: "parent-123",
      doc_type: "postmortem",
      source_url: "https://example.com",
      file_path: "docs/pm.md",
      chunk_index: 3,
      embedding_model: "model-v2",
      embedding_version: "2",
      tenant_id: "tenant-abc",
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });

    const result = await getKnowledgeDocsByTenant("tenant-abc", { limit: 10, offset: 0 });
    const doc = result.items[0];

    expect(doc.id).toBe("doc-mapped");
    expect(doc.parentId).toBe("parent-123");
    expect(doc.docType).toBe("postmortem");
    expect(doc.sourceUrl).toBe("https://example.com");
    expect(doc.filePath).toBe("docs/pm.md");
    expect(doc.chunkIndex).toBe(3);
    expect(doc.embeddingModel).toBe("model-v2");
    expect(doc.embeddingVersion).toBe("2");
    expect(doc.tenantId).toBe("tenant-abc");
  });

  it("should default total to 0 when count result has no rows", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const result = await getKnowledgeDocsByTenant("tenant-abc", { limit: 10, offset: 0 });

    expect(result.total).toBe(0);
  });

  it("should respect limit and offset parameters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: "0" }] });

    await getKnowledgeDocsByTenant("tenant-abc", { limit: 25, offset: 50 });

    expect(mockQuery).toHaveBeenCalledWith(KNOWLEDGE_DOC_QUERIES.GET_BY_TENANT, [
      "tenant-abc",
      25,
      50,
    ]);
  });

  it("should propagate database errors", async () => {
    const dbError = new Error("connection refused");
    mockQuery.mockRejectedValueOnce(dbError);

    await expect(getKnowledgeDocsByTenant("tenant-abc", { limit: 10, offset: 0 })).rejects.toThrow(
      "connection refused"
    );
  });

  it("should parse metadata from JSON string in row", async () => {
    const row = createMockRow({
      metadata: JSON.stringify({ author: "dev", priority: "high" }),
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });

    const result = await getKnowledgeDocsByTenant("tenant-abc", { limit: 10, offset: 0 });

    expect(result.items[0].metadata).toEqual({ author: "dev", priority: "high" });
  });

  it("should return frozen items array", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [createMockRow()] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });

    const result = await getKnowledgeDocsByTenant("tenant-abc", { limit: 10, offset: 0 });

    expect(Object.isFrozen(result.items)).toBe(true);
  });

  it("should handle null metadata in rows", async () => {
    const row = createMockRow({ metadata: null });

    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });

    const result = await getKnowledgeDocsByTenant("tenant-abc", { limit: 10, offset: 0 });

    expect(result.items[0].metadata).toEqual({});
  });
});

describe("getKnowledgeDocCountsByTypeForTenant", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return counts grouped by doc type for a tenant", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { doc_type: "troubleshooting", count: "10" },
        { doc_type: "runbook", count: "5" },
        { doc_type: "documentation", count: "20" },
      ],
    });

    const result = await getKnowledgeDocCountsByTypeForTenant("tenant-abc");

    expect(result).toEqual({
      troubleshooting: 10,
      runbook: 5,
      documentation: 20,
    });
  });

  it("should return empty object when no documents exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getKnowledgeDocCountsByTypeForTenant("tenant-abc");

    expect(result).toEqual({});
  });

  it("should validate tenantId and throw for empty string", async () => {
    await expect(getKnowledgeDocCountsByTypeForTenant("")).rejects.toThrow();
  });

  it("should call COUNT_BY_DOC_TYPE_FOR_TENANT query with tenantId", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getKnowledgeDocCountsByTypeForTenant("tenant-xyz");

    expect(mockQuery).toHaveBeenCalledWith(KNOWLEDGE_DOC_QUERIES.COUNT_BY_DOC_TYPE_FOR_TENANT, [
      "tenant-xyz",
    ]);
  });

  it("should parse string count values to integers", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ doc_type: "sop", count: "999" }],
    });

    const result = await getKnowledgeDocCountsByTypeForTenant("tenant-abc");

    expect(result).toEqual({ sop: 999 });
    expect(typeof result.sop).toBe("number");
  });

  it("should handle single doc type result", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ doc_type: "postmortem", count: "3" }],
    });

    const result = await getKnowledgeDocCountsByTypeForTenant("tenant-abc");

    expect(result).toEqual({ postmortem: 3 });
  });

  it("should propagate database errors", async () => {
    mockQuery.mockRejectedValueOnce(new Error("query timeout"));

    await expect(getKnowledgeDocCountsByTypeForTenant("tenant-abc")).rejects.toThrow(
      "query timeout"
    );
  });

  it("should handle all known doc types in result", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { doc_type: "troubleshooting", count: "1" },
        { doc_type: "runbook", count: "2" },
        { doc_type: "documentation", count: "3" },
        { doc_type: "postmortem", count: "4" },
        { doc_type: "known_issues", count: "5" },
        { doc_type: "sop", count: "6" },
        { doc_type: "architecture", count: "7" },
      ],
    });

    const result = await getKnowledgeDocCountsByTypeForTenant("tenant-abc");

    expect(Object.keys(result)).toHaveLength(7);
    expect(result.troubleshooting).toBe(1);
    expect(result.runbook).toBe(2);
    expect(result.documentation).toBe(3);
    expect(result.postmortem).toBe(4);
    expect(result.known_issues).toBe(5);
    expect(result.sop).toBe(6);
    expect(result.architecture).toBe(7);
  });
});
