/**
 * VectorStore interface and in-memory placeholder implementation.
 *
 * NOTE:
 * - This implementation is intentionally simple and not suitable for production.
 * - In future, this should be backed by a real vector database (e.g. Postgres + pgvector, Chroma, etc.).
 * - Any heavy lifting (indexing, similarity search) should be done deterministically in a trusted component.
 */

/**
 * Interface for vector store operations.
 */
export abstract class VectorStore {
  /**
   * Upsert a document embedding into the vector store.
   *
   * @param id - Unique identifier for the document
   * @param content - The document content to store
   * @returns Promise that resolves when the operation completes
   */
  abstract upsertDocumentEmbedding(id: string, content: string): Promise<void>;

  /**
   * Query for similar documents based on text.
   *
   * @param text - The query text
   * @returns Promise that resolves to an array of document IDs
   */
  abstract querySimilar(text: string): Promise<string[]>;
}

/**
 * Very naive in-memory implementation for local development and tests.
 * Stores raw content strings keyed by ID and returns all IDs on query.
 */
export class InMemoryVectorStore extends VectorStore {
  private docs: Map<string, string>;

  constructor() {
    super();
    this.docs = new Map();
  }

  async upsertDocumentEmbedding(id: string, content: string): Promise<void> {
    // TODO: Replace with real embedding generation + vector DB upsert.
    this.docs.set(id, content);
  }

  async querySimilar(text: string): Promise<string[]> {
    // TODO: Replace with real similarity search against a vector DB.
    // For now, we just return all IDs deterministically.
    return Array.from(this.docs.keys());
  }
}

