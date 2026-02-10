/**
 * Relationship Module
 *
 * Database operations for document relationships supporting multi-hop RAG.
 *
 * @module database/relationship
 */

// Types
export type {
  RelationshipRow,
  RelationshipTypeCountRow,
  CountRow,
  IncidentRelationship,
  CreateRelationshipInput,
} from "./types.js";

// Helpers (includes row mappers and validation)
export {
  // Row mappers
  mapRowToRelationship,
  mapRowsToDistribution,
  // Validation
  isValidRelationshipType,
  validateCreateRelationshipInput,
  validateId,
  validatePositiveNumber,
} from "./helpers.js";

// Repository operations
export {
  createRelationship,
  createRelationshipsBatch,
  getRelationshipById,
  getOutgoingRelationships,
  getIncomingRelationships,
  getBidirectionalRelationships,
  getRelationshipsByType,
  deleteRelationship,
  deleteRelationshipsByDoc,
  getRelationshipCount,
  getRelationshipTypeDistribution,
} from "./repository.js";
