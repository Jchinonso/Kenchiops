/**
 * RAG Test Case Repository
 *
 * Database operations for RAG test cases used in automated QA.
 * Supports regression testing and drift detection.
 *
 * @module database/testCaseRepository
 */

import { query } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import { RAG_TEST_CASE_CONFIG } from "../constants/index.js";

const logger = createLogger("test-case-repository");

// ==================== Types ====================

/**
 * Database row for RAG test case.
 */
interface TestCaseRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly query_text: string;
  readonly expected_doc_ids: readonly string[];
  readonly expected_min_recall: string;
  readonly category: string;
  readonly is_active: boolean;
  readonly priority: number;
  readonly last_run_at: string | null;
  readonly last_result: Record<string, unknown> | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * RAG test case record.
 */
export interface RAGTestCase {
  readonly id: string;
  readonly tenantId?: string;
  readonly name: string;
  readonly description?: string;
  readonly queryText: string;
  readonly expectedDocIds: readonly string[];
  readonly expectedMinRecall: number;
  readonly category: string;
  readonly isActive: boolean;
  readonly priority: number;
  readonly lastRunAt?: string;
  readonly lastResult?: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Input for creating a test case.
 */
export interface CreateTestCaseInput {
  readonly tenantId?: string;
  readonly name: string;
  readonly description?: string;
  readonly queryText: string;
  readonly expectedDocIds: readonly string[];
  readonly expectedMinRecall?: number;
  readonly category?: string;
  readonly priority?: number;
}

/**
 * Test result to store.
 */
export interface TestResultInput {
  readonly passed: boolean;
  readonly recall: number;
  readonly retrievedDocIds: readonly string[];
  readonly duration: number;
  readonly timestamp: string;
}

// ==================== SQL Queries ====================

const TEST_CASE_QUERIES = {
  INSERT: `
    INSERT INTO rag_test_cases (
      id, tenant_id, name, description, query_text, expected_doc_ids,
      expected_min_recall, category, is_active, priority
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
    RETURNING *
  `,

  GET_BY_ID: `SELECT * FROM rag_test_cases WHERE id = $1`,

  GET_ACTIVE: `
    SELECT * FROM rag_test_cases
    WHERE is_active = TRUE
    ORDER BY priority ASC, created_at ASC
  `,

  GET_ACTIVE_BY_TENANT: `
    SELECT * FROM rag_test_cases
    WHERE is_active = TRUE AND (tenant_id = $1 OR tenant_id IS NULL)
    ORDER BY priority ASC, created_at ASC
  `,

  GET_BY_CATEGORY: `
    SELECT * FROM rag_test_cases
    WHERE is_active = TRUE AND category = $1
    ORDER BY priority ASC
  `,

  UPDATE_RESULT: `
    UPDATE rag_test_cases SET
      last_run_at = NOW(),
      last_result = $2,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  SET_ACTIVE: `
    UPDATE rag_test_cases SET
      is_active = $2,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  DELETE: `DELETE FROM rag_test_cases WHERE id = $1`,

  COUNT_BY_TENANT: `
    SELECT COUNT(*) as count FROM rag_test_cases
    WHERE tenant_id = $1
  `,

  GET_FAILED_RECENT: `
    SELECT * FROM rag_test_cases
    WHERE last_result IS NOT NULL
      AND (last_result->>'passed')::boolean = FALSE
    ORDER BY last_run_at DESC
    LIMIT $1
  `,
} as const;

// ==================== Mappers ====================

/**
 * Maps database row to RAGTestCase.
 */
const mapRowToTestCase = (row: TestCaseRow): RAGTestCase => ({
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

// ==================== Public API ====================

/**
 * Creates a new test case.
 */
export const createTestCase = async (input: CreateTestCaseInput): Promise<RAGTestCase> => {
  const id = generateEventId();

  const result = await query<TestCaseRow>(TEST_CASE_QUERIES.INSERT, [
    id,
    input.tenantId ?? null,
    input.name,
    input.description ?? null,
    input.queryText,
    [...input.expectedDocIds],
    input.expectedMinRecall ?? RAG_TEST_CASE_CONFIG.DEFAULT_MIN_RECALL,
    input.category ?? "general",
    input.priority ?? RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
  ]);

  logger.info("Created RAG test case", { id, name: input.name, category: input.category });
  return mapRowToTestCase(result.rows[0]);
};

/**
 * Gets a test case by ID.
 */
export const getTestCaseById = async (testCaseId: string): Promise<RAGTestCase | null> => {
  const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_BY_ID, [testCaseId]);
  return result.rows.length === 0 ? null : mapRowToTestCase(result.rows[0]);
};

/**
 * Gets all active test cases.
 */
export const getActiveTestCases = async (): Promise<readonly RAGTestCase[]> => {
  const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_ACTIVE, []);
  return Object.freeze(result.rows.map(mapRowToTestCase));
};

/**
 * Gets active test cases for a tenant (includes global test cases).
 */
export const getActiveTestCasesByTenant = async (
  tenantId: string
): Promise<readonly RAGTestCase[]> => {
  const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_ACTIVE_BY_TENANT, [tenantId]);
  return Object.freeze(result.rows.map(mapRowToTestCase));
};

/**
 * Gets test cases by category.
 */
export const getTestCasesByCategory = async (category: string): Promise<readonly RAGTestCase[]> => {
  const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_BY_CATEGORY, [category]);
  return Object.freeze(result.rows.map(mapRowToTestCase));
};

/**
 * Updates test case with run result.
 */
export const updateTestCaseResult = async (
  testCaseId: string,
  testResult: TestResultInput
): Promise<RAGTestCase | null> => {
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
};

/**
 * Sets test case active status.
 */
export const setTestCaseActive = async (
  testCaseId: string,
  isActive: boolean
): Promise<RAGTestCase | null> => {
  const result = await query<TestCaseRow>(TEST_CASE_QUERIES.SET_ACTIVE, [testCaseId, isActive]);
  if (result.rows.length === 0) {
    return null;
  }
  logger.info("Updated test case active status", { testCaseId, isActive });
  return mapRowToTestCase(result.rows[0]);
};

/**
 * Deletes a test case.
 */
export const deleteTestCase = async (testCaseId: string): Promise<boolean> => {
  const result = await query(TEST_CASE_QUERIES.DELETE, [testCaseId]);
  if (result.rowCount === 0) {
    return false;
  }
  logger.info("Deleted test case", { testCaseId });
  return true;
};

/**
 * Gets count of test cases for a tenant.
 */
export const getTestCaseCount = async (tenantId: string): Promise<number> => {
  const result = await query<{ count: string }>(TEST_CASE_QUERIES.COUNT_BY_TENANT, [tenantId]);
  return parseInt(result.rows[0]?.count ?? "0", 10);
};

/**
 * Gets recently failed test cases.
 */
export const getRecentlyFailedTestCases = async (
  limit: number = 10
): Promise<readonly RAGTestCase[]> => {
  const result = await query<TestCaseRow>(TEST_CASE_QUERIES.GET_FAILED_RECENT, [limit]);
  return Object.freeze(result.rows.map(mapRowToTestCase));
};
