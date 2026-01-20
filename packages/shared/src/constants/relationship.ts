/**
 * Relationship Repository Constants
 *
 * SQL queries and configuration for incident relationship operations.
 *
 * @module constants/relationship
 */

// ==================== Default Values ====================

/**
 * Default configuration for relationship operations.
 */
export const RELATIONSHIP_DEFAULTS = {
  /** Default relationship strength when not specified. */
  DEFAULT_STRENGTH: 1.0,
  /** Minimum valid query limit. */
  MIN_QUERY_LIMIT: 1,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for relationship operations.
 */
export const RELATIONSHIP_QUERIES = {
  INSERT: `
    INSERT INTO incident_relationships (
      id, from_doc_id, to_doc_id, relationship_type, strength,
      metadata, created_by, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    ON CONFLICT (from_doc_id, to_doc_id, relationship_type)
    DO UPDATE SET
      strength = EXCLUDED.strength,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM incident_relationships WHERE id = $1
  `,

  GET_OUTGOING: `
    SELECT * FROM incident_relationships
    WHERE from_doc_id = $1 AND strength >= $2
    ORDER BY strength DESC
    LIMIT $3
  `,

  GET_INCOMING: `
    SELECT * FROM incident_relationships
    WHERE to_doc_id = $1 AND strength >= $2
    ORDER BY strength DESC
    LIMIT $3
  `,

  GET_BIDIRECTIONAL: `
    SELECT * FROM incident_relationships
    WHERE (from_doc_id = $1 OR to_doc_id = $1) AND strength >= $2
    ORDER BY strength DESC
    LIMIT $3
  `,

  GET_BY_TYPE: `
    SELECT * FROM incident_relationships
    WHERE from_doc_id = $1 AND relationship_type = $2 AND strength >= $3
    ORDER BY strength DESC
    LIMIT $4
  `,

  DELETE_BY_ID: `
    DELETE FROM incident_relationships WHERE id = $1
  `,

  DELETE_BY_DOC: `
    DELETE FROM incident_relationships
    WHERE from_doc_id = $1 OR to_doc_id = $1
  `,

  COUNT_BY_DOC: `
    SELECT COUNT(*) as count FROM incident_relationships
    WHERE from_doc_id = $1 OR to_doc_id = $1
  `,

  GET_RELATIONSHIP_TYPES: `
    SELECT relationship_type, COUNT(*) as count
    FROM incident_relationships
    GROUP BY relationship_type
  `,
} as const;
