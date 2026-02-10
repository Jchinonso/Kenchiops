/**
 * Test Case Module
 *
 * Database operations for RAG test cases used in automated QA.
 *
 * @module database/testCase
 */

// Types
export type {
  TestCaseRow,
  CountRow,
  DocIdRow,
  RAGTestCase,
  CreateTestCaseInput,
  TestResultInput,
  ValidateExpectedDocIdsResult,
} from "./types.js";

// Helpers (includes validation and row mappers)
export {
  // Validation
  validateCreateTestCaseInput,
  validateId,
  validatePositiveNumber,
  // Row mappers
  mapRowToTestCase,
  createEmptyValidationResult,
  createValidationResult,
} from "./helpers.js";

// Repository operations
export {
  createTestCase,
  getTestCaseById,
  getActiveTestCases,
  getActiveTestCasesByTenant,
  getTestCasesByCategory,
  updateTestCaseResult,
  setTestCaseActive,
  deleteTestCase,
  getTestCaseCount,
  getRecentlyFailedTestCases,
  validateExpectedDocIds,
  validateTestCase,
} from "./repository.js";
