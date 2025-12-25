import { describe, it, expect, beforeEach } from "@jest/globals";
import { InMemoryVectorStore, VectorStore } from "../../integrations/vectorStore.js";

describe("VectorStore", () => {
  it("should be an abstract class with abstract methods", () => {
    // VectorStore is abstract - attempting to call abstract methods should fail
    const instance = Object.create(VectorStore.prototype);
    expect(instance.upsertDocumentEmbedding).toBeUndefined();
    expect(instance.querySimilar).toBeUndefined();
  });
});

describe("InMemoryVectorStore", () => {
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  describe("instance creation", () => {
    it("should create an instance", () => {
      expect(store).toBeInstanceOf(InMemoryVectorStore);
    });

    it("should extend VectorStore", () => {
      expect(store).toBeInstanceOf(VectorStore);
    });

    it("should initialize with empty document store", async () => {
      const results = await store.querySimilar("test");
      expect(results).toEqual([]);
    });
  });

  describe("upsertDocumentEmbedding", () => {
    it("should store a single document", async () => {
      await store.upsertDocumentEmbedding("doc1", "Content 1");

      const results = await store.querySimilar("test query");
      expect(results).toContain("doc1");
    });

    it("should store multiple documents", async () => {
      await store.upsertDocumentEmbedding("doc1", "Content 1");
      await store.upsertDocumentEmbedding("doc2", "Content 2");
      await store.upsertDocumentEmbedding("doc3", "Content 3");

      const results = await store.querySimilar("test query");
      expect(results).toContain("doc1");
      expect(results).toContain("doc2");
      expect(results).toContain("doc3");
      expect(results.length).toBe(3);
    });

    it("should update existing document when upserting with same ID", async () => {
      await store.upsertDocumentEmbedding("doc1", "Original content");
      await store.upsertDocumentEmbedding("doc1", "Updated content");

      const results = await store.querySimilar("test");
      expect(results.length).toBe(1);
      expect(results).toEqual(["doc1"]);
    });

    it("should handle empty content", async () => {
      await store.upsertDocumentEmbedding("doc1", "");

      const results = await store.querySimilar("test");
      expect(results).toContain("doc1");
    });

    it("should handle special characters in ID", async () => {
      await store.upsertDocumentEmbedding("doc-1_special.test", "Content");

      const results = await store.querySimilar("test");
      expect(results).toContain("doc-1_special.test");
    });

    it("should handle special characters in content", async () => {
      await store.upsertDocumentEmbedding("doc1", "Content with\nnewlines\tand\ttabs");

      const results = await store.querySimilar("test");
      expect(results).toContain("doc1");
    });

    it("should handle very long content", async () => {
      const longContent = "x".repeat(10000);
      await store.upsertDocumentEmbedding("doc1", longContent);

      const results = await store.querySimilar("test");
      expect(results).toContain("doc1");
    });

    it("should return promise that resolves to void", async () => {
      const result = await store.upsertDocumentEmbedding("doc1", "Content");
      expect(result).toBeUndefined();
    });
  });

  describe("querySimilar", () => {
    beforeEach(async () => {
      await store.upsertDocumentEmbedding("doc1", "Database connection error");
      await store.upsertDocumentEmbedding("doc2", "API timeout issue");
      await store.upsertDocumentEmbedding("doc3", "Memory leak detected");
    });

    it("should return all document IDs on query (placeholder behavior)", async () => {
      const results = await store.querySimilar("connection problem");
      expect(results.length).toBe(3);
      expect(results).toEqual(["doc1", "doc2", "doc3"]);
    });

    it("should return all IDs regardless of query text", async () => {
      const results1 = await store.querySimilar("database");
      const results2 = await store.querySimilar("completely unrelated query");

      expect(results1).toEqual(results2);
      expect(results1.length).toBe(3);
    });

    it("should handle empty query string", async () => {
      const results = await store.querySimilar("");
      expect(results.length).toBe(3);
    });

    it("should handle special characters in query", async () => {
      const results = await store.querySimilar("query with\nnewlines\tand\ttabs");
      expect(results.length).toBe(3);
    });

    it("should handle very long query", async () => {
      const longQuery = "query ".repeat(1000);
      const results = await store.querySimilar(longQuery);
      expect(results.length).toBe(3);
    });

    it("should return empty array when store is empty", async () => {
      const emptyStore = new InMemoryVectorStore();
      const results = await emptyStore.querySimilar("test");
      expect(results).toEqual([]);
    });

    it("should return document IDs in insertion order", async () => {
      const emptyStore = new InMemoryVectorStore();
      await emptyStore.upsertDocumentEmbedding("doc-alpha", "Content");
      await emptyStore.upsertDocumentEmbedding("doc-beta", "Content");
      await emptyStore.upsertDocumentEmbedding("doc-gamma", "Content");

      const results = await emptyStore.querySimilar("test");
      expect(results).toEqual(["doc-alpha", "doc-beta", "doc-gamma"]);
    });

    it("should return promise that resolves to string array", async () => {
      const results = await store.querySimilar("test");
      expect(Array.isArray(results)).toBe(true);
      results.forEach((id) => expect(typeof id).toBe("string"));
    });
  });

  describe("integration scenarios", () => {
    it("should handle rapid successive operations", async () => {
      const operations = Array.from({ length: 100 }, (_, i) =>
        store.upsertDocumentEmbedding(`doc${i}`, `Content ${i}`)
      );

      await Promise.all(operations);

      const results = await store.querySimilar("test");
      expect(results.length).toBe(100);
    });

    it("should maintain document IDs after multiple queries", async () => {
      await store.upsertDocumentEmbedding("doc1", "Content");

      const results1 = await store.querySimilar("query1");
      const results2 = await store.querySimilar("query2");
      const results3 = await store.querySimilar("query3");

      expect(results1).toEqual(results2);
      expect(results2).toEqual(results3);
    });

    it("should allow upserting after querying", async () => {
      await store.upsertDocumentEmbedding("doc1", "Content 1");
      await store.querySimilar("test");
      await store.upsertDocumentEmbedding("doc2", "Content 2");

      const results = await store.querySimilar("test");
      expect(results.length).toBe(2);
    });

    it("should handle mixed upsert and query operations", async () => {
      await store.upsertDocumentEmbedding("doc1", "Content 1");
      const results1 = await store.querySimilar("test");
      expect(results1.length).toBe(1);

      await store.upsertDocumentEmbedding("doc2", "Content 2");
      const results2 = await store.querySimilar("test");
      expect(results2.length).toBe(2);

      await store.upsertDocumentEmbedding("doc1", "Updated content");
      const results3 = await store.querySimilar("test");
      expect(results3.length).toBe(2);
    });
  });
});
