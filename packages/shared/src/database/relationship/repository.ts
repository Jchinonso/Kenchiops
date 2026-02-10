/**
 * Incident Relationship Repository
 *
 * Database operations for document relationships supporting multi-hop RAG.
 * Enables graph-based retrieval across related incidents and knowledge documents.
 *
 * @module database/relationship/repository
 */

import {
  query,
  transaction,
  createLogger,
  generateEventId,
  getErrorMessage,
  MULTI_HOP_CONFIG,
  PARSE_INT_RADIX,
  RELATIONSHIP_DEFAULTS,
  RELATIONSHIP_QUERIES,
  type RelationshipType,
} from "../common.js";
import type {
  RelationshipRow,
  RelationshipTypeCountRow,
  CountRow,
  IncidentRelationship,
  CreateRelationshipInput,
} from "./types.js";
import {
  mapRowToRelationship,
  mapRowsToDistribution,
  validateCreateRelationshipInput,
  validateId,
  validatePositiveNumber,
  isValidRelationshipType,
} from "./helpers.js";

const logger = createLogger("relationship-repository");

// ==================== Public API ====================

/**
 * Creates or updates an incident relationship.
 *
 * @param input - Relationship data
 * @returns The created or updated relationship
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createRelationship = async (
  input: CreateRelationshipInput
): Promise<IncidentRelationship> => {
  validateCreateRelationshipInput(input);

  const id = generateEventId();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  try {
    const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.INSERT, [
      id,
      input.fromDocId,
      input.toDocId,
      input.relationshipType,
      input.strength ?? RELATIONSHIP_DEFAULTS.DEFAULT_STRENGTH,
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
  } catch (error) {
    logger.error("Failed to create incident relationship", {
      fromDocId: input.fromDocId,
      toDocId: input.toDocId,
      type: input.relationshipType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Creates multiple relationships in a single transaction.
 *
 * @param inputs - Array of relationship data
 * @returns Array of created relationships
 * @throws ValidationError if any input is invalid
 * @throws Error if database operation fails
 */
export const createRelationshipsBatch = async (
  inputs: readonly CreateRelationshipInput[]
): Promise<readonly IncidentRelationship[]> => {
  if (inputs.length === 0) {
    return [];
  }

  // Validate all inputs before starting transaction
  inputs.forEach(validateCreateRelationshipInput);

  try {
    return await transaction(async (client) => {
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
          input.strength ?? RELATIONSHIP_DEFAULTS.DEFAULT_STRENGTH,
          metadataJson,
          input.createdBy ?? null,
        ]);

        return processInput(index + 1, [...results, mapRowToRelationship(result.rows[0])]);
      };

      const results = await processInput(0, []);
      logger.info("Created relationships batch", { count: results.length });
      return Object.freeze(results);
    });
  } catch (error) {
    logger.error("Failed to create relationships batch", {
      inputCount: inputs.length,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets a relationship by ID.
 *
 * @param relationshipId - Relationship ID
 * @returns Relationship or null if not found
 * @throws ValidationError if relationshipId is empty
 * @throws Error if database operation fails
 */
export const getRelationshipById = async (
  relationshipId: string
): Promise<IncidentRelationship | null> => {
  validateId(relationshipId, "relationshipId");

  try {
    const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_BY_ID, [relationshipId]);
    return result.rows.length === 0 ? null : mapRowToRelationship(result.rows[0]);
  } catch (error) {
    logger.error("Failed to get relationship by ID", {
      relationshipId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets outgoing relationships from a document.
 *
 * @param docId - Source document ID
 * @param minStrength - Minimum relationship strength filter
 * @param limit - Maximum number of results
 * @returns Array of outgoing relationships
 * @throws ValidationError if docId is empty or parameters are invalid
 * @throws Error if database operation fails
 */
export const getOutgoingRelationships = async (
  docId: string,
  minStrength: number = MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH,
  limit: number = MULTI_HOP_CONFIG.MAX_DOCS_PER_HOP
): Promise<readonly IncidentRelationship[]> => {
  validateId(docId, "docId");
  validatePositiveNumber(minStrength, "minStrength");
  validatePositiveNumber(limit, "limit");

  try {
    const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_OUTGOING, [
      docId,
      minStrength,
      limit,
    ]);
    return Object.freeze(result.rows.map(mapRowToRelationship));
  } catch (error) {
    logger.error("Failed to get outgoing relationships", {
      docId,
      minStrength,
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets incoming relationships to a document.
 *
 * @param docId - Target document ID
 * @param minStrength - Minimum relationship strength filter
 * @param limit - Maximum number of results
 * @returns Array of incoming relationships
 * @throws ValidationError if docId is empty or parameters are invalid
 * @throws Error if database operation fails
 */
export const getIncomingRelationships = async (
  docId: string,
  minStrength: number = MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH,
  limit: number = MULTI_HOP_CONFIG.MAX_DOCS_PER_HOP
): Promise<readonly IncidentRelationship[]> => {
  validateId(docId, "docId");
  validatePositiveNumber(minStrength, "minStrength");
  validatePositiveNumber(limit, "limit");

  try {
    const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_INCOMING, [
      docId,
      minStrength,
      limit,
    ]);
    return Object.freeze(result.rows.map(mapRowToRelationship));
  } catch (error) {
    logger.error("Failed to get incoming relationships", {
      docId,
      minStrength,
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets all relationships (both directions) for a document.
 *
 * @param docId - Document ID
 * @param minStrength - Minimum relationship strength filter
 * @param limit - Maximum number of results
 * @returns Array of bidirectional relationships
 * @throws ValidationError if docId is empty or parameters are invalid
 * @throws Error if database operation fails
 */
export const getBidirectionalRelationships = async (
  docId: string,
  minStrength: number = MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH,
  limit: number = MULTI_HOP_CONFIG.MAX_DOCS_PER_HOP
): Promise<readonly IncidentRelationship[]> => {
  validateId(docId, "docId");
  validatePositiveNumber(minStrength, "minStrength");
  validatePositiveNumber(limit, "limit");

  try {
    const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_BIDIRECTIONAL, [
      docId,
      minStrength,
      limit,
    ]);
    return Object.freeze(result.rows.map(mapRowToRelationship));
  } catch (error) {
    logger.error("Failed to get bidirectional relationships", {
      docId,
      minStrength,
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets relationships of a specific type from a document.
 *
 * @param docId - Source document ID
 * @param relationshipType - Type of relationship to filter
 * @param minStrength - Minimum relationship strength filter
 * @param limit - Maximum number of results
 * @returns Array of relationships of the specified type
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const getRelationshipsByType = async (
  docId: string,
  relationshipType: RelationshipType,
  minStrength: number = MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH,
  limit: number = MULTI_HOP_CONFIG.MAX_DOCS_PER_HOP
): Promise<readonly IncidentRelationship[]> => {
  validateId(docId, "docId");
  validatePositiveNumber(minStrength, "minStrength");
  validatePositiveNumber(limit, "limit");

  if (!isValidRelationshipType(relationshipType)) {
    logger.warn("Invalid relationship type requested", { relationshipType });
    return [];
  }

  try {
    const result = await query<RelationshipRow>(RELATIONSHIP_QUERIES.GET_BY_TYPE, [
      docId,
      relationshipType,
      minStrength,
      limit,
    ]);
    return Object.freeze(result.rows.map(mapRowToRelationship));
  } catch (error) {
    logger.error("Failed to get relationships by type", {
      docId,
      relationshipType,
      minStrength,
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes a relationship by ID.
 *
 * @param relationshipId - Relationship ID to delete
 * @returns True if deleted, false if not found
 * @throws ValidationError if relationshipId is empty
 * @throws Error if database operation fails
 */
export const deleteRelationship = async (relationshipId: string): Promise<boolean> => {
  validateId(relationshipId, "relationshipId");

  try {
    const result = await query(RELATIONSHIP_QUERIES.DELETE_BY_ID, [relationshipId]);
    if (result.rowCount === 0) {
      return false;
    }
    logger.info("Deleted relationship", { relationshipId });
    return true;
  } catch (error) {
    logger.error("Failed to delete relationship", {
      relationshipId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes all relationships for a document.
 *
 * @param docId - Document ID whose relationships to delete
 * @returns Number of deleted relationships
 * @throws ValidationError if docId is empty
 * @throws Error if database operation fails
 */
export const deleteRelationshipsByDoc = async (docId: string): Promise<number> => {
  validateId(docId, "docId");

  try {
    const result = await query(RELATIONSHIP_QUERIES.DELETE_BY_DOC, [docId]);
    logger.info("Deleted relationships for document", { docId, deletedCount: result.rowCount });
    return result.rowCount;
  } catch (error) {
    logger.error("Failed to delete relationships by document", {
      docId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets the count of relationships for a document.
 *
 * @param docId - Document ID
 * @returns Count of relationships
 * @throws ValidationError if docId is empty
 * @throws Error if database operation fails
 */
export const getRelationshipCount = async (docId: string): Promise<number> => {
  validateId(docId, "docId");

  try {
    const result = await query<CountRow>(RELATIONSHIP_QUERIES.COUNT_BY_DOC, [docId]);
    return parseInt(result.rows[0]?.count ?? "0", PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to get relationship count", {
      docId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets relationship type distribution.
 *
 * @returns Record mapping relationship types to their counts
 * @throws Error if database operation fails
 */
export const getRelationshipTypeDistribution = async (): Promise<Record<string, number>> => {
  try {
    const result = await query<RelationshipTypeCountRow>(
      RELATIONSHIP_QUERIES.GET_RELATIONSHIP_TYPES,
      []
    );
    return mapRowsToDistribution(result.rows, PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to get relationship type distribution", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};
