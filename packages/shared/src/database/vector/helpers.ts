/**
 * Vector Helpers
 *
 * Shared utility functions for vector embedding operations.
 * Used by diff chunk and knowledge document type mappers.
 *
 * @module database/vector/helpers
 */

// ==================== Parsing Functions ====================

/**
 * Parses a PostgreSQL vector string to number array.
 * Format: "[0.1,0.2,0.3,...]"
 */
export const parseEmbeddingVector = (
  vectorString: string | null | undefined
): readonly number[] | null => {
  if (vectorString === null || vectorString === undefined) {
    return null;
  }

  const cleanString = vectorString.replace(/^\[|\]$/g, "");
  return Object.freeze(cleanString.split(",").map(Number));
};

/**
 * Parses a JSONB field from PostgreSQL.
 * PostgreSQL JSONB columns return objects directly when using the pg driver.
 * This handles both cases: string (needs parsing) or already-parsed object.
 */
export const parseJsonbField = (
  value: string | Record<string, unknown> | null
): Record<string, unknown> | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    // Intentional: returns null for malformed JSON metadata — callers handle the null case
    return null;
  }
};

// ==================== Formatting Functions ====================

/**
 * Formats a number array as PostgreSQL vector string.
 */
export const formatEmbeddingVector = (embedding: readonly number[]): string =>
  `[${embedding.join(",")}]`;
