/**
 * Test Case Repository Helpers
 *
 * Validation functions and row mappers for test case repository.
 *
 * @module database/testCase/helpers
 */

import { ValidationError } from "../common.js";
import type {
  TestCaseRow,
  RAGTestCase,
  CreateTestCaseInput,
  ValidateExpectedDocIdsResult,
} from "./types.js";

// ==================== Validation Rule Types ====================

/**
 * Validation rule for CreateTestCaseInput.
 */
interface CreateTestCaseValidationRule {
  readonly isInvalid: (input: CreateTestCaseInput) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}

// ==================== Validation Rules ====================

/**
 * Validation rules for creating test cases.
 */
const CREATE_TEST_CASE_VALIDATION_RULES: readonly CreateTestCaseValidationRule[] = [
  {
    isInvalid: (input) => input.name.trim().length === 0,
    getMessage: () => "Test case name cannot be empty",
    field: "name",
  },
  {
    isInvalid: (input) => input.queryText.trim().length === 0,
    getMessage: () => "Query text cannot be empty",
    field: "queryText",
  },
  {
    isInvalid: (input) => input.expectedDocIds.length === 0,
    getMessage: () => "Expected document IDs cannot be empty",
    field: "expectedDocIds",
  },
  {
    isInvalid: (input) =>
      input.expectedMinRecall !== undefined &&
      (!Number.isFinite(input.expectedMinRecall) ||
        input.expectedMinRecall < 0 ||
        input.expectedMinRecall > 1),
    getMessage: () => "Expected min recall must be a number between 0 and 1",
    field: "expectedMinRecall",
  },
  {
    isInvalid: (input) =>
      input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0),
    getMessage: () => "Priority must be a non-negative integer",
    field: "priority",
  },
];

// ==================== Input Validation ====================

/**
 * Validates CreateTestCaseInput using handler pattern.
 *
 * @param input - Input to validate
 * @throws ValidationError if input is invalid
 */
export const validateCreateTestCaseInput = (input: CreateTestCaseInput): void => {
  const failedRule = CREATE_TEST_CASE_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateCreateTestCaseInput",
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
 * Validates that a number is positive.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error message
 * @throws ValidationError if value is invalid
 */
export const validatePositiveNumber = (value: number, fieldName: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number`, {
      operation: "validatePositiveNumber",
      metadata: { field: fieldName, value },
    });
  }
};

// ==================== Row Mappers ====================

/**
 * Maps database row to RAGTestCase domain object.
 *
 * @param row - Database row from rag_test_cases table
 * @returns RAGTestCase domain object
 */
export const mapRowToTestCase = (row: TestCaseRow): RAGTestCase => ({
  id: row.id,
  tenantId: row.tenant_id ?? undefined,
  name: row.name,
  description: row.description ?? undefined,
  queryText: row.query_text,
  expectedDocIds: Object.freeze([...row.expected_doc_ids]),
  expectedMinRecall: parseFloat(row.expected_min_recall),
  category: row.category,
  isActive: row.is_active,
  priority: row.priority,
  lastRunAt: row.last_run_at ?? undefined,
  lastResult: row.last_result ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Creates an empty validation result for empty input.
 *
 * @returns ValidateExpectedDocIdsResult with empty arrays
 */
export const createEmptyValidationResult = (): ValidateExpectedDocIdsResult => ({
  valid: true,
  existingIds: Object.freeze([]),
  missingIds: Object.freeze([]),
});

/**
 * Creates a validation result from existing and missing IDs.
 *
 * @param existingIds - Set of existing document IDs
 * @param missingIds - Array of missing document IDs
 * @returns ValidateExpectedDocIdsResult
 */
export const createValidationResult = (
  existingIds: Set<string>,
  missingIds: readonly string[]
): ValidateExpectedDocIdsResult => ({
  valid: missingIds.length === 0,
  existingIds: Object.freeze([...existingIds]),
  missingIds: Object.freeze([...missingIds]),
});
