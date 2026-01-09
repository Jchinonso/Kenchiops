/**
 * Incident Relationship Repository
 *
 * Database operations for document relationships supporting multi-hop RAG.
 * Enables graph-based retrieval across related incidents and knowledge documents.
 *
 * @module database/relationshipRepository
 */

import { query, transaction } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import { RELATIONSHIP_TYPES, MULTI_HOP_CONFIG, type RelationshipType } from "../constants/index.js";

const logger = createLogger("relationship-repository");

// ==================== Types ====================

/**
 * Database row for incident relationship.
 */
interface RelationshipRow {
  readonly id: string;
  readonly from_doc_id: string;
  readonly to_doc_id: string;
  readonly relationship_type: string;
  readonly strength: string;
  readonly metadata: Record<string, unknown> | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Incident relationship record.
 */
export interface IncidentRelationship {
  readonly id: string;
  readonly fromDocId: string;
  readonly toDocId: string;
  readonly relationshipType: RelationshipType;
  readonly strength: number;
  readonly metadata?: Record<string, unknown>;
  readonly createdBy?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Input for creating a relationship.
 */
export interface CreateRelationshipInput {
  readonly fromDocId: string;
  readonly toDocId: string;
  readonly relationshipType: RelationshipType;
  readonly strength?: number;
  readonly metadata?: Record<string, unknown>;
  readonly createdBy?: string;
}

// ==================== SQL Queries ====================

const RELATIONSHIP_QUERIES = {
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

// ==================== Mappers ====================

/**
 * Maps database row to IncidentRelationship.
 */
export const mapRowToRelationship = (row: RelationshipRow): IncidentRelationship => ({
  id: row.id,
  fromDocId: row.from_doc_id,
  toDocId: row.to_doc_id,
  relationshipType: row.relationship_type as RelationshipType,
  strength: parseFloat(row.strength),
  metadata: row.metadata ?? undefined,
  createdBy: row.created_by ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ==================== Validation ====================

/**
 * Validates relationship type against allowed values.
 */
const isValidRelationshipType = (type: string): type is RelationshipType =>
  Object.values(RELATIONSHIP_TYPES).includes(type as RelationshipType);

// ==================== Public API ====================

/**
 * Creates or updates an incident relationship.
 */
export const createRelationship = async (
  input: CreateRelationshipInput
): Promise<IncidentRelationship> => {
  const id = generateEventId();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.INSERT, [
    id,
    input.fromDocId,
    input.toDocId,
    input.relationshipType,
    input.strength ?? 1.0,
    metadataJson,
    input.createdBy ?? null,
  ]);

  logger.info("Created incident relationship", {
    id,
    fromDocId: input.fromDocId,
    toDocId: input.toDocId,
    type: input.relationshipType,
  });

  return mapRowToRelationship(result.rows[0]);
};

/**
 * Creates multiple relationships in a single transaction.
 */
export const createRelationshipsBatch = async (
  inputs: readonly CreateRelationshipInput[]
): Promise<readonly IncidentRelationship[]> => {
  if (inputs.length === 0) {
    return [];
  }

  return transaction(async (client) => {
    const processInput = async (
      index: number,
      results: readonly IncidentRelationship[]
    ): Promise<readonly IncidentRelationship[]> => {
      if (index >= inputs.length) {
        return results;
      }

      const input = inputs[index];
      const id = generateEventId();
      const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

      const result = await client.query<RelationshipRow>(RELATIONSHIP_QUERIES.INSERT, [
        id,
        input.fromDocId,
        input.toDocId,
        input.relationshipType,
        input.strength ?? 1.0,
        metadataJson,
        input.createdBy ?? null,
      ]);

      return processInput(index + 1, [...results, mapRowToRelationship(result.rows[0])]);
    };

    const results = await processInput(0, []);
    logger.info("Created relationships batch", { count: results.length });
    return Object.freeze(results);
  });
};

/**
 * Gets a relationship by ID.
 */
export const getRelationshipById = async (
  relationshipId: string
): Promise<IncidentRelationship | null> => {
  const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_BY_ID, [relationshipId]);
  return result.rows.length === 0 ? null : mapRowToRelationship(result.rows[0]);
};

/**
 * Gets outgoing relationships from a document.
 */
export const getOutgoingRelationships = async (
  docId: string,
  minStrength: number = MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH,
  limit: number = MULTI_HOP_CONFIG.MAX_DOCS_PER_HOP
): Promise<readonly IncidentRelationship[]> => {
  const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_OUTGOING, [
    docId,
    minStrength,
    limit,
  ]);
  return Object.freeze(result.rows.map(mapRowToRelationship));
};

/**
 * Gets incoming relationships to a document.
 */
export const getIncomingRelationships = async (
  docId: string,
  minStrength: number = MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH,
  limit: number = MULTI_HOP_CONFIG.MAX_DOCS_PER_HOP
): Promise<readonly IncidentRelationship[]> => {
  const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_INCOMING, [
    docId,
    minStrength,
    limit,
  ]);
  return Object.freeze(result.rows.map(mapRowToRelationship));
};

/**
 * Gets all relationships (both directions) for a document.
 */
export const getBidirectionalRelationships = async (
  docId: string,
  minStrength: number = MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH,
  limit: number = MULTI_HOP_CONFIG.MAX_DOCS_PER_HOP
): Promise<readonly IncidentRelationship[]> => {
  const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_BIDIRECTIONAL, [
    docId,
    minStrength,
    limit,
  ]);
  return Object.freeze(result.rows.map(mapRowToRelationship));
};

/**
 * Gets relationships of a specific type from a document.
 */
export const getRelationshipsByType = async (
  docId: string,
  relationshipType: RelationshipType,
  minStrength: number = MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH,
  limit: number = MULTI_HOP_CONFIG.MAX_DOCS_PER_HOP
): Promise<readonly IncidentRelationship[]> => {
  if (!isValidRelationshipType(relationshipType)) {
    logger.warn("Invalid relationship type requested", { relationshipType });
    return [];
  }

  const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_BY_TYPE, [
    docId,
    relationshipType,
    minStrength,
    limit,
  ]);
  return Object.freeze(result.rows.map(mapRowToRelationship));
};

/**
 * Deletes a relationship by ID.
 */
export const deleteRelationship = async (relationshipId: string): Promise<boolean> => {
  const result = await query(RELATIONSHIP_QUERIES.DELETE_BY_ID, [relationshipId]);
  if (result.rowCount === 0) {
    return false;
  }
  logger.info("Deleted relationship", { relationshipId });
  return true;
};

/**
 * Deletes all relationships for a document.
 */
export const deleteRelationshipsByDoc = async (docId: string): Promise<number> => {
  const result = await query(RELATIONSHIP_QUERIES.DELETE_BY_DOC, [docId]);
  logger.info("Deleted relationships for document", { docId, deletedCount: result.rowCount });
  return result.rowCount;
};

/**
 * Gets the count of relationships for a document.
 */
export const getRelationshipCount = async (docId: string): Promise<number> => {
  const result = await query<{ count: string }>(RELATIONSHIP_QUERIES.COUNT_BY_DOC, [docId]);
  return parseInt(result.rows[0]?.count ?? "0", 10);
};

/**
 * Gets relationship type distribution.
 */
export const getRelationshipTypeDistribution = async (): Promise<Record<string, number>> => {
  const result = await query<{ relationship_type: string; count: string }>(
    RELATIONSHIP_QUERIES.GET_RELATIONSHIP_TYPES,
    []
  );

  const distribution: Record<string, number> = {};
  result.rows.forEach((row) => {
    distribution[row.relationship_type] = parseInt(row.count, 10);
  });

  return distribution;
};
