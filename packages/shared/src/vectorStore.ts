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
 * In-memory implementation of vector store for development and testing.
 *
 * **WARNING**: This implementation is NOT suitable for production use.
 * It does not perform actual vector similarity search - it simply stores
 * raw text and returns all document IDs on any query.
 *
 * **For Production**: Use a real vector database such as:
 * - Postgres with pgvector extension
 * - Chroma
 * - Pinecone
 * - Weaviate
 * - Qdrant
 *
 * @example
 * ```typescript
 * const store = new InMemoryVectorStore();
 *
 * // Store documents
 * await store.upsertDocumentEmbedding('doc-1', 'Database connection error');
 * await store.upsertDocumentEmbedding('doc-2', 'API timeout issue');
 *
 * // Query (returns all document IDs in development)
 * const similar = await store.querySimilar('connection problem');
 * console.log(similar); // ['doc-1', 'doc-2']
 * ```
 */
export class InMemoryVectorStore extends VectorStore {
  private docs: Map<string, string>;

  constructor() {
    super();
    this.docs = new Map();
  }

  readonly upsertDocumentEmbedding = async (id: string, content: string): Promise<void> => {
    // TODO: Replace with real embedding generation + vector DB upsert.
    this.docs.set(id, content);
  };

  readonly querySimilar = async (_text: string): Promise<string[]> => {
    // TODO: Replace with real similarity search against a vector DB.
    // For now, we just return all IDs deterministically.
    return Array.from(this.docs.keys());
  };
}
