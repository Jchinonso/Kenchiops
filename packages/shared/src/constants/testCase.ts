/**
 * Test Case Repository Constants
 *
 * SQL queries and configuration for RAG test case operations.
 *
 * @module constants/testCase
 */

// ==================== Default Values ====================

/**
 * Default configuration for test case operations.
 */
export const TEST_CASE_DEFAULTS = {
  /** Default category when not specified. */
  DEFAULT_CATEGORY: "general",
  /** Default limit for failed test cases query. */
  DEFAULT_FAILED_LIMIT: 10,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for test case operations.
 * All queries use parameterized statements for SQL injection prevention.
 */
export const TEST_CASE_QUERIES = {
  INSERT: `
    INSERT INTO rag_test_cases (
      id, tenant_id, name, description, query_text, expected_doc_ids,
      expected_min_recall, category, is_active, priority
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
    RETURNING *
  `,

  GET_BY_ID: `SELECT * FROM rag_test_cases WHERE id = $1 AND tenant_id = $2`,

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

  VALIDATE_DOC_IDS: `
    SELECT id FROM (
      SELECT id FROM diff_chunks WHERE id = ANY($1)
      UNION
      SELECT id FROM knowledge_documents WHERE id = ANY($1)
    ) combined
  `,
} as const;
