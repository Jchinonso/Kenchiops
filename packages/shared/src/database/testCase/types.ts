/**
 * Test Case Repository Types
 *
 * Type definitions and mappers for RAG test case database operations.
 *
 * @module database/testCase/types
 */

// ==================== Database Row Types ====================

/**
 * Database row for RAG test cases table.
 */
export interface TestCaseRow {
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
 * Database row for count query.
 */
export interface CountRow {
  readonly count: string;
}

/**
 * Database row for document ID validation.
 */
export interface DocIdRow {
  readonly id: string;
}

// ==================== Domain Types ====================

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

/**
 * Result of validating expected document IDs.
 */
export interface ValidateExpectedDocIdsResult {
  readonly valid: boolean;
  readonly existingIds: readonly string[];
  readonly missingIds: readonly string[];
}
