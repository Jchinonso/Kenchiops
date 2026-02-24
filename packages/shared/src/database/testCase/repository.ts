/**
 * RAG Test Case Repository
 *
 * Database operations for RAG test cases used in automated QA.
 * Supports regression testing and drift detection.
 *
 * @module database/testCase/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  PARSE_INT_RADIX,
  RAG_TEST_CASE_CONFIG,
  TEST_CASE_DEFAULTS,
  TEST_CASE_QUERIES,
} from "../common.js";
import type {
  TestCaseRow,
  CountRow,
  DocIdRow,
  RAGTestCase,
  CreateTestCaseInput,
  TestResultInput,
  ValidateExpectedDocIdsResult,
} from "./types.js";
import {
  mapRowToTestCase,
  createEmptyValidationResult,
  createValidationResult,
  validateCreateTestCaseInput,
  validateId,
  validatePositiveNumber,
} from "./helpers.js";

const logger = createLogger("test-case-repository");

// ==================== Public API ====================

/**
 * Creates a new test case.
 *
 * @param input - Test case data
 * @returns The created test case
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createTestCase = async (input: CreateTestCaseInput): Promise<RAGTestCase> => {
  validateCreateTestCaseInput(input);

  const id = generateEventId();

  try {
    const result = await query<TestCaseRow>(TEST_CASE_QUERIES.INSERT, [
      id,
      input.tenantId ?? null,
      input.name,
      input.description ?? null,
      input.queryText,
      [...input.expectedDocIds],
      input.expectedMinRecall ?? RAG_TEST_CASE_CONFIG.DEFAULT_MIN_RECALL,
      input.category ?? TEST_CASE_DEFAULTS.DEFAULT_CATEGORY,
      input.priority ?? RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    ]);

    logger.info("Created RAG test case", { id, name: input.name, category: input.category });
    return mapRowToTestCase(result.rows[0]);
  } catch (error) {
    logger.error("Failed to create test case", {
      name: input.name,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets a test case by ID.
 *
 * @param testCaseId - Test case ID
 * @returns Test case or null if not found
 * @throws ValidationError if testCaseId is empty
 * @throws Error if database operation fails
 */
export const getTestCaseById = async (
  testCaseId: string,
  tenantId: string
): Promise<RAGTestCase | null> => {
  validateId(testCaseId, "testCaseId");
  validateId(tenantId, "tenantId");

  try {
    const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_BY_ID, [testCaseId, tenantId]);
    return result.rows.length === 0 ? null : mapRowToTestCase(result.rows[0]);
  } catch (error) {
    logger.error("Failed to get test case by ID", {
      testCaseId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets all active test cases.
 *
 * @returns Array of active test cases
 * @throws Error if database operation fails
 */
export const getActiveTestCases = async (): Promise<readonly RAGTestCase[]> => {
  try {
    const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_ACTIVE, []);
    return Object.freeze(result.rows.map(mapRowToTestCase));
  } catch (error) {
    logger.error("Failed to get active test cases", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets active test cases for a tenant (includes global test cases).
 *
 * @param tenantId - Tenant ID
 * @returns Array of active test cases for tenant
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const getActiveTestCasesByTenant = async (
  tenantId: string
): Promise<readonly RAGTestCase[]> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_ACTIVE_BY_TENANT, [tenantId]);
    return Object.freeze(result.rows.map(mapRowToTestCase));
  } catch (error) {
    logger.error("Failed to get active test cases by tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets test cases by category.
 *
 * @param category - Category to filter by
 * @returns Array of test cases in category
 * @throws ValidationError if category is empty
 * @throws Error if database operation fails
 */
export const getTestCasesByCategory = async (category: string): Promise<readonly RAGTestCase[]> => {
  validateId(category, "category");

  try {
    const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_BY_CATEGORY, [category]);
    return Object.freeze(result.rows.map(mapRowToTestCase));
  } catch (error) {
    logger.error("Failed to get test cases by category", {
      category,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates test case with run result.
 *
 * @param testCaseId - Test case ID
 * @param testResult - Result of the test run
 * @returns Updated test case or null if not found
 * @throws ValidationError if testCaseId is empty
 * @throws Error if database operation fails
 */
export const updateTestCaseResult = async (
  testCaseId: string,
  testResult: TestResultInput
): Promise<RAGTestCase | null> => {
  validateId(testCaseId, "testCaseId");

  try {
    const result = await query<TestCaseRow>(TEST_CASE_QUERIES.UPDATE_RESULT, [
      testCaseId,
      JSON.stringify(testResult),
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    logger.debug("Updated test case result", {
      testCaseId,
      passed: testResult.passed,
      recall: testResult.recall,
    });

    return mapRowToTestCase(result.rows[0]);
  } catch (error) {
    logger.error("Failed to update test case result", {
      testCaseId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Sets test case active status.
 *
 * @param testCaseId - Test case ID
 * @param isActive - New active status
 * @returns Updated test case or null if not found
 * @throws ValidationError if testCaseId is empty
 * @throws Error if database operation fails
 */
export const setTestCaseActive = async (
  testCaseId: string,
  isActive: boolean
): Promise<RAGTestCase | null> => {
  validateId(testCaseId, "testCaseId");

  try {
    const result = await query<TestCaseRow>(TEST_CASE_QUERIES.SET_ACTIVE, [testCaseId, isActive]);
    if (result.rows.length === 0) {
      return null;
    }
    logger.info("Updated test case active status", { testCaseId, isActive });
    return mapRowToTestCase(result.rows[0]);
  } catch (error) {
    logger.error("Failed to set test case active status", {
      testCaseId,
      isActive,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes a test case.
 *
 * @param testCaseId - Test case ID to delete
 * @returns True if deleted, false if not found
 * @throws ValidationError if testCaseId is empty
 * @throws Error if database operation fails
 */
export const deleteTestCase = async (testCaseId: string): Promise<boolean> => {
  validateId(testCaseId, "testCaseId");

  try {
    const result = await query(TEST_CASE_QUERIES.DELETE, [testCaseId]);
    if (result.rowCount === 0) {
      return false;
    }
    logger.info("Deleted test case", { testCaseId });
    return true;
  } catch (error) {
    logger.error("Failed to delete test case", {
      testCaseId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets count of test cases for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Count of test cases
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const getTestCaseCount = async (tenantId: string): Promise<number> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<CountRow>(TEST_CASE_QUERIES.COUNT_BY_TENANT, [tenantId]);
    return parseInt(result.rows[0]?.count ?? "0", PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to get test case count", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets recently failed test cases.
 *
 * @param limit - Maximum number of results
 * @returns Array of recently failed test cases
 * @throws ValidationError if limit is invalid
 * @throws Error if database operation fails
 */
export const getRecentlyFailedTestCases = async (
  limit: number = TEST_CASE_DEFAULTS.DEFAULT_FAILED_LIMIT
): Promise<readonly RAGTestCase[]> => {
  validatePositiveNumber(limit, "limit");

  try {
    const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_FAILED_RECENT, [limit]);
    return Object.freeze(result.rows.map(mapRowToTestCase));
  } catch (error) {
    logger.error("Failed to get recently failed test cases", {
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Document Validation ====================

/**
 * Validates that expected document IDs exist in the database.
 * Checks both diff_chunks and knowledge_documents tables.
 *
 * @param expectedDocIds - Array of document IDs to validate
 * @returns Validation result with existing and missing IDs
 * @throws Error if database operation fails
 */
export const validateExpectedDocIds = async (
  expectedDocIds: readonly string[]
): Promise<ValidateExpectedDocIdsResult> => {
  if (expectedDocIds.length === 0) {
    return createEmptyValidationResult();
  }

  try {
    const result = await query<DocIdRow>(TEST_CASE_QUERIES.VALIDATE_DOC_IDS, [[...expectedDocIds]]);
    const existingIds = new Set(result.rows.map((row) => row.id));

    const missingIds = expectedDocIds.filter((docId) => !existingIds.has(docId));

    logger.debug("Validated expected document IDs", {
      totalIds: expectedDocIds.length,
      existingCount: existingIds.size,
      missingCount: missingIds.length,
    });

    return createValidationResult(existingIds, missingIds);
  } catch (error) {
    logger.error("Failed to validate expected document IDs", {
      docIdCount: expectedDocIds.length,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Validates a test case's expected document IDs.
 *
 * @param testCase - The test case to validate
 * @returns Validation result
 * @throws Error if database operation fails
 */
export const validateTestCase = async (
  testCase: RAGTestCase
): Promise<ValidateExpectedDocIdsResult> => validateExpectedDocIds(testCase.expectedDocIds);
