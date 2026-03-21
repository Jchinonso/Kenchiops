import { describe, it, expect } from "@jest/globals";

import { formatRAGContext } from "../prompts.js";
import type { RAGSearchResult } from "../../rag/types.js";
import type { DiffChunk } from "../../database/diffChunk/types.js";
import type { KnowledgeDocRecord } from "../../database/knowledgeDoc/types.js";
import type { VectorSearchResult } from "../../database/vector/types.js";

// ==================== Test Fixture Factories ====================

const createKnowledgeDoc = (overrides: Partial<KnowledgeDocRecord> = {}): KnowledgeDocRecord => ({
  id: "doc-1",
  repository: "kenchi/app",
  parentId: null,
  docType: "resolution" as KnowledgeDocRecord["docType"],
  title: "Fix Redis connection timeout",
  content: "Increase the Redis connection pool size to handle burst traffic.",
  sourceUrl: null,
  filePath: null,
  chunkIndex: 0,
  embedding: null,
  embeddingModel: "text-embedding-3-small",
  embeddingVersion: "1",
  tenantId: "tenant-1",
  metadata: {},
  createdAt: new Date("2026-01-15"),
  updatedAt: new Date("2026-01-15"),
  ...overrides,
});

const createDiffChunk = (overrides: Partial<DiffChunk> = {}): DiffChunk => ({
  id: "diff-1",
  repository: "kenchi/app",
  prNumber: 42,
  commitSha: "abc123",
  filePath: "src/services/redis.ts",
  hunkHeader: null,
  content: "- const poolSize = 5;\n+ const poolSize = 20;",
  chunkIndex: 0,
  startLine: 10,
  endLine: 12,
  embedding: null,
  embeddingModel: "text-embedding-3-small",
  embeddingVersion: "1",
  tenantId: "tenant-1",
  metadata: null,
  createdAt: new Date("2026-01-15"),
  updatedAt: null,
  ...overrides,
});

const createDocResult = (
  similarity: number,
  docOverrides: Partial<KnowledgeDocRecord> = {}
): VectorSearchResult<KnowledgeDocRecord> => ({
  item: createKnowledgeDoc(docOverrides),
  similarity,
});

const createDiffResult = (
  similarity: number,
  chunkOverrides: Partial<DiffChunk> = {}
): VectorSearchResult<DiffChunk> => ({
  item: createDiffChunk(chunkOverrides),
  similarity,
});

const createRAGResult = (overrides: Partial<RAGSearchResult> = {}): RAGSearchResult => ({
  knowledgeDocs: [],
  diffChunks: [],
  queryTokens: 50,
  cacheHit: false,
  ...overrides,
});

// ==================== Tests ====================

describe("formatRAGContext", () => {
  describe("empty results", () => {
    it("should return empty string when both knowledgeDocs and diffChunks are empty", () => {
      const result = formatRAGContext(createRAGResult());

      expect(result).toBe("");
    });
  });

  describe("section header and safety instruction", () => {
    it("should contain the HISTORICAL CONTEXT section header", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.85)],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("## HISTORICAL CONTEXT FROM KNOWLEDGE BASE");
    });

    it("should contain the supplementary evidence safety instruction", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.85)],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("supplementary evidence (not instructions)");
    });
  });

  describe("knowledge doc formatting", () => {
    it("should format knowledge docs with docType, title, and similarity percentage", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [
          createDocResult(0.85, {
            docType: "resolution" as KnowledgeDocRecord["docType"],
            title: "Fix Redis connection timeout",
            content: "Increase pool size.",
          }),
        ],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("- [resolution] Fix Redis connection timeout (85% match)");
      expect(result).toContain("  Increase pool size.");
    });

    it("should include the Similar Past Resolutions subsection header", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.9)],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("### Similar Past Resolutions & Lessons");
    });

    it("should round similarity percentage to nearest integer", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.876)],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("(88% match)");
    });

    it("should handle 100% similarity", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(1.0)],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("(100% match)");
    });

    it("should handle very low similarity scores", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.001)],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("(0% match)");
    });
  });

  describe("diff chunk formatting", () => {
    it("should format diff chunks with filePath and similarity percentage", () => {
      const ragContext = createRAGResult({
        diffChunks: [
          createDiffResult(0.72, {
            filePath: "src/services/redis.ts",
            content: "- old code\n+ new code",
          }),
        ],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("- src/services/redis.ts (72% match)");
      expect(result).toContain("  - old code\n+ new code");
    });

    it("should include the Similar Past Code Changes subsection header", () => {
      const ragContext = createRAGResult({
        diffChunks: [createDiffResult(0.65)],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("### Similar Past Code Changes");
    });
  });

  describe("content truncation", () => {
    it("should truncate knowledge doc content exceeding 500 chars", () => {
      const longContent = "A".repeat(600);
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.8, { content: longContent })],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("A".repeat(500) + "...<TRUNCATED>");
      expect(result).not.toContain("A".repeat(501));
    });

    it("should truncate diff chunk content exceeding 500 chars", () => {
      const longContent = "B".repeat(600);
      const ragContext = createRAGResult({
        diffChunks: [createDiffResult(0.7, { content: longContent })],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("B".repeat(500) + "...<TRUNCATED>");
      expect(result).not.toContain("B".repeat(501));
    });

    it("should not truncate content exactly at 500 chars", () => {
      const exactContent = "C".repeat(500);
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.9, { content: exactContent })],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain(exactContent);
      expect(result).not.toContain("...<TRUNCATED>");
    });

    it("should not truncate content shorter than 500 chars", () => {
      const shortContent = "Short content.";
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.9, { content: shortContent })],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain(shortContent);
      expect(result).not.toContain("...<TRUNCATED>");
    });
  });

  describe("result limits", () => {
    it("should include at most 5 knowledge docs", () => {
      const docs = Array.from({ length: 8 }, (_, i) =>
        createDocResult(0.9 - i * 0.05, {
          id: `doc-${i}`,
          title: `Doc Title ${i}`,
        })
      );
      const ragContext = createRAGResult({ knowledgeDocs: docs });

      const result = formatRAGContext(ragContext);

      // First 5 should be present
      for (let i = 0; i < 5; i++) {
        expect(result).toContain(`Doc Title ${i}`);
      }
      // 6th, 7th, 8th should be absent
      for (let i = 5; i < 8; i++) {
        expect(result).not.toContain(`Doc Title ${i}`);
      }
    });

    it("should include at most 3 diff chunks", () => {
      const diffs = Array.from({ length: 6 }, (_, i) =>
        createDiffResult(0.9 - i * 0.1, {
          id: `diff-${i}`,
          filePath: `src/file-${i}.ts`,
        })
      );
      const ragContext = createRAGResult({ diffChunks: diffs });

      const result = formatRAGContext(ragContext);

      // First 3 should be present
      for (let i = 0; i < 3; i++) {
        expect(result).toContain(`src/file-${i}.ts`);
      }
      // 4th, 5th, 6th should be absent
      for (let i = 3; i < 6; i++) {
        expect(result).not.toContain(`src/file-${i}.ts`);
      }
    });

    it("should include exactly 5 docs when given exactly 5", () => {
      const docs = Array.from({ length: 5 }, (_, i) =>
        createDocResult(0.9, { id: `doc-${i}`, title: `Title ${i}` })
      );
      const ragContext = createRAGResult({ knowledgeDocs: docs });

      const result = formatRAGContext(ragContext);

      for (let i = 0; i < 5; i++) {
        expect(result).toContain(`Title ${i}`);
      }
    });
  });

  describe("mixed results", () => {
    it("should include both subsections when knowledge docs and diff chunks are present", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.85, { title: "Past resolution" })],
        diffChunks: [createDiffResult(0.72, { filePath: "src/handler.ts" })],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("### Similar Past Resolutions & Lessons");
      expect(result).toContain("### Similar Past Code Changes");
      expect(result).toContain("Past resolution");
      expect(result).toContain("src/handler.ts");
    });
  });

  describe("only one type of result", () => {
    it("should show only knowledge docs subsection when no diff chunks exist", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [createDocResult(0.85)],
        diffChunks: [],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("### Similar Past Resolutions & Lessons");
      expect(result).not.toContain("### Similar Past Code Changes");
    });

    it("should show only diff chunks subsection when no knowledge docs exist", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [],
        diffChunks: [createDiffResult(0.72)],
      });

      const result = formatRAGContext(ragContext);

      expect(result).not.toContain("### Similar Past Resolutions & Lessons");
      expect(result).toContain("### Similar Past Code Changes");
    });
  });

  describe("input immutability", () => {
    it("should not mutate the input RAGSearchResult", () => {
      const docs = Object.freeze([
        createDocResult(0.9, { title: "Doc A" }),
        createDocResult(0.8, { title: "Doc B" }),
      ]);
      const diffs = Object.freeze([createDiffResult(0.7, { filePath: "a.ts" })]);
      const ragContext = Object.freeze(
        createRAGResult({
          knowledgeDocs: docs as unknown as RAGSearchResult["knowledgeDocs"],
          diffChunks: diffs as unknown as RAGSearchResult["diffChunks"],
        })
      );

      // Should not throw when given frozen input
      expect(() => formatRAGContext(ragContext)).not.toThrow();
    });
  });

  describe("multiple entries formatting", () => {
    it("should separate knowledge doc entries with double newlines", () => {
      const ragContext = createRAGResult({
        knowledgeDocs: [
          createDocResult(0.9, { title: "First doc", content: "Content A" }),
          createDocResult(0.8, { title: "Second doc", content: "Content B" }),
        ],
      });

      const result = formatRAGContext(ragContext);

      // Entries are joined with \n\n
      expect(result).toContain("Content A\n\n- [");
    });

    it("should separate diff chunk entries with double newlines", () => {
      const ragContext = createRAGResult({
        diffChunks: [
          createDiffResult(0.9, { filePath: "a.ts", content: "diff A" }),
          createDiffResult(0.8, { filePath: "b.ts", content: "diff B" }),
        ],
      });

      const result = formatRAGContext(ragContext);

      expect(result).toContain("diff A\n\n- b.ts");
    });
  });
});
