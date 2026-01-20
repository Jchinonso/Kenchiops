/**
 * Relationship Repository Helpers
 *
 * Validation functions and row mappers for relationship operations.
 *
 * @module database/relationship/helpers
 */

import { ValidationError, RELATIONSHIP_TYPES, type RelationshipType } from "../common.js";
import type {
  CreateRelationshipInput,
  RelationshipRow,
  RelationshipTypeCountRow,
  IncidentRelationship,
} from "./types.js";

// ==================== Validation Rules ====================

/** Validation rule for CreateRelationshipInput. */
interface CreateRelationshipValidationRule {
  readonly isInvalid: (input: CreateRelationshipInput) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}

/**
 * Validates that a relationship type is valid.
 */
export const isValidRelationshipType = (type: string): type is RelationshipType =>
  Object.values(RELATIONSHIP_TYPES).includes(type as RelationshipType);

/** Validation rules for creating relationships. */
const CREATE_RELATIONSHIP_VALIDATION_RULES: readonly CreateRelationshipValidationRule[] = [
  {
    isInvalid: (input) => input.fromDocId.trim().length === 0,
    getMessage: () => "From document ID cannot be empty",
    field: "fromDocId",
  },
  {
    isInvalid: (input) => input.toDocId.trim().length === 0,
    getMessage: () => "To document ID cannot be empty",
    field: "toDocId",
  },
  {
    isInvalid: (input) => !isValidRelationshipType(input.relationshipType),
    getMessage: () => "Invalid relationship type",
    field: "relationshipType",
  },
  {
    isInvalid: (input) =>
      input.strength !== undefined && (!Number.isFinite(input.strength) || input.strength < 0),
    getMessage: () => "Strength must be a non-negative number",
    field: "strength",
  },
];

// ==================== Input Validation ====================

/**
 * Validates CreateRelationshipInput using handler pattern.
 *
 * @param input - Input to validate
 * @throws ValidationError if input is invalid
 */
export const validateCreateRelationshipInput = (input: CreateRelationshipInput): void => {
  const failedRule = CREATE_RELATIONSHIP_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateCreateRelationshipInput",
    metadata: { field: failedRule.field },
  });
};

/**
 * Validates that an ID is non-empty.
 *
 * @param id - ID to validate
 * @param fieldName - Name of the field for error message
 * @throws ValidationError if ID is empty
 */
export const validateId = (id: string, fieldName: string): void => {
  if (id.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, {
      operation: "validateId",
      metadata: { field: fieldName },
    });
  }
};

/**
 * Validates that a number is non-negative.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error message
 * @throws ValidationError if value is invalid
 */
export const validatePositiveNumber = (value: number, fieldName: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative number`, {
      operation: "validatePositiveNumber",
      metadata: { field: fieldName, value },
    });
  }
};

// ==================== Row Mappers ====================

/**
 * Maps database row to IncidentRelationship domain object.
 *
 * @param row - Database row from incident_relationships table
 * @returns IncidentRelationship domain object
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

/**
 * Maps relationship type count rows to a distribution record.
 *
 * @param rows - Database rows from type distribution query
 * @param radix - Parse integer radix
 * @returns Record mapping relationship types to their counts
 */
export const mapRowsToDistribution = (
  rows: readonly RelationshipTypeCountRow[],
  radix: number
): Record<string, number> =>
  rows.reduce(
    (accumulator, row) => ({
      ...accumulator,
      [row.relationship_type]: parseInt(row.count, radix),
    }),
    {} as Record<string, number>
  );
