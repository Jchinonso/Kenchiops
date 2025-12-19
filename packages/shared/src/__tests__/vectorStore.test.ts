import { describe, it, expect, beforeEach } from "@jest/globals";
import { InMemoryVectorStore } from "../vectorStore.js";

describe("InMemoryVectorStore", () => {
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  it("should create an instance", () => {
    expect(store).toBeInstanceOf(InMemoryVectorStore);
  });

  it("should upsert documents", async () => {
    await store.upsertDocumentEmbedding("doc1", "Content 1");
    await store.upsertDocumentEmbedding("doc2", "Content 2");

    // In the placeholder implementation, querySimilar returns all IDs
    const results = await store.querySimilar("test query");
    expect(results).toContain("doc1");
    expect(results).toContain("doc2");
  });

  it("should return all document IDs on query (placeholder behavior)", async () => {
    await store.upsertDocumentEmbedding("doc1", "Content 1");
    await store.upsertDocumentEmbedding("doc2", "Content 2");

    const results = await store.querySimilar("any query");
    expect(results.length).toBe(2);
    expect(results).toEqual(["doc1", "doc2"]);
  });

  it("should handle empty store", async () => {
    const results = await store.querySimilar("test");
    expect(results).toEqual([]);
  });
});
