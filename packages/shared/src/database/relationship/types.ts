/**
 * Relationship Repository Types
 *
 * Type definitions and mappers for incident relationship database operations.
 *
 * @module database/relationship/types
 */

import type { RelationshipType } from "../common.js";

// ==================== Database Row Types ====================

/**
 * Database row for incident relationships table.
 */
export interface RelationshipRow {
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
 * Database row for relationship type count query.
 */
export interface RelationshipTypeCountRow {
  readonly relationship_type: string;
  readonly count: string;
}

/**
 * Database row for count query.
 */
export interface CountRow {
  readonly count: string;
}

// ==================== Domain Types ====================

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
