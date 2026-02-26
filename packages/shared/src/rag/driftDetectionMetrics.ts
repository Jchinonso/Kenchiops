/**
 * Drift Detection Metrics
 *
 * Metric thresholds, test execution, and result building utilities.
 *
 * @module rag/driftDetectionMetrics
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { DRIFT_DETECTION_THRESHOLDS, RAG_METRIC_TYPES } from "../constants/index.js";
import {
  updateTestCaseResult,
  validateExpectedDocIds,
  type RAGTestCase,
  type TestResultInput,
} from "../database/index.js";
import { searchDiffChunks, searchKnowledgeDocs } from "./search.js";
import { calculateRecallAtK, calculateMRR } from "./evaluation.js";
import type { RetrievalResult, TestCaseResult, MetricAlertThreshold } from "./types.js";

const logger = createLogger("rag-drift-detection");

// ==================== Metric Thresholds ====================

/**
 * Maps metric types to their alert thresholds.
 */
export const METRIC_ALERT_THRESHOLDS: readonly MetricAlertThreshold[] = [
  {
    metricType: RAG_METRIC_TYPES.RECALL_AT_5,
    warningThreshold: DRIFT_DETECTION_THRESHOLDS.RECALL_AT_5_DROP_PERCENT,
    criticalThreshold: DRIFT_DETECTION_THRESHOLDS.RECALL_AT_5_DROP_PERCENT * 2,
    higherIsBetter: true,
  },
  {
    metricType: RAG_METRIC_TYPES.RECALL_AT_10,
    warningThreshold: DRIFT_DETECTION_THRESHOLDS.RECALL_AT_10_DROP_PERCENT,
    criticalThreshold: DRIFT_DETECTION_THRESHOLDS.RECALL_AT_10_DROP_PERCENT * 2,
    higherIsBetter: true,
  },
  {
    metricType: RAG_METRIC_TYPES.MRR,
    warningThreshold: DRIFT_DETECTION_THRESHOLDS.MRR_DROP_PERCENT,
    criticalThreshold: DRIFT_DETECTION_THRESHOLDS.MRR_DROP_PERCENT * 2,
    higherIsBetter: true,
  },
  {
    metricType: RAG_METRIC_TYPES.EMBEDDING_ERROR_RATE,
    warningThreshold: DRIFT_DETECTION_THRESHOLDS.ERROR_RATE_THRESHOLD_PERCENT,
    criticalThreshold: DRIFT_DETECTION_THRESHOLDS.ERROR_RATE_THRESHOLD_PERCENT * 2,
    higherIsBetter: false,
  },
];

// ==================== Test Execution ====================

/**
 * Builds retrieval results with relevance labels.
 */
export const buildRetrievalResults = (
  retrievedDocIds: readonly string[],
  expectedDocIds: readonly string[]
): readonly RetrievalResult[] => {
  const expectedSet = new Set(expectedDocIds);
  return retrievedDocIds.map((docId, index) => ({
    docId,
    similarity: 1 - index * 0.1, // Approximate similarity decay
    rank: index + 1,
    isRelevant: expectedSet.has(docId),
  }));
};

/**
 * Executes a single RAG test case.
 * Validates expectedDocIds exist before running the test.
 */
export const executeTestCase = async (testCase: RAGTestCase): Promise<TestCaseResult> => {
  const startTime = Date.now();

  try {
    // Validate expected document IDs exist before running test
    if (testCase.expectedDocIds.length > 0) {
      const validation = await validateExpectedDocIds(testCase.expectedDocIds);

      if (!validation.valid) {
        logger.warn("Test case skipped - missing expected documents", {
          testCaseId: testCase.id,
          name: testCase.name,
          missingCount: validation.missingIds.length,
          missingIds: validation.missingIds.slice(0, 5), // Log first 5
        });

        return {
          testCaseId: testCase.id,
          name: testCase.name,
          passed: false,
          recall: 0,
          mrr: 0,
          retrievedDocIds: Object.freeze([]),
          skipped: true,
          skipReason: `Missing ${validation.missingIds.length} expected document(s)`,
          missingDocIds: validation.missingIds,
        };
      }
    }

    // Search for relevant documents using the test query
    const [diffResponse, docResponse] = await Promise.all([
      searchDiffChunks({ queryText: testCase.queryText, topK: 10 }),
      searchKnowledgeDocs({ queryText: testCase.queryText, topK: 10 }),
    ]);

    // Combine results by document ID
    const retrievedDocIds = [
      ...diffResponse.results.map((result) => result.item.id),
      ...docResponse.results.map((result) => result.item.id),
    ];

    // Build retrieval results for metrics calculation
    const expectedDocIds = [...testCase.expectedDocIds];
    const retrievalResults = buildRetrievalResults(retrievedDocIds, expectedDocIds);

    // Calculate metrics
    const recall = calculateRecallAtK(retrievalResults, 5);
    const mrr = calculateMRR([retrievalResults]);
    const passed = recall >= testCase.expectedMinRecall;

    // Record test result
    const testResult: TestResultInput = {
      passed,
      recall,
      retrievedDocIds: Object.freeze(retrievedDocIds),
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    await updateTestCaseResult(testCase.id, testResult, testCase.tenantId ?? "system");

    return {
      testCaseId: testCase.id,
      name: testCase.name,
      passed,
      recall,
      mrr,
      retrievedDocIds: Object.freeze(retrievedDocIds),
    };
  } catch (error) {
    logger.error("Test case execution failed", {
      testCaseId: testCase.id,
      error: getErrorMessage(error),
    });

    return {
      testCaseId: testCase.id,
      name: testCase.name,
      passed: false,
      recall: 0,
      mrr: 0,
      retrievedDocIds: Object.freeze([]),
      error: getErrorMessage(error),
    };
  }
};

/**
 * Runs test cases recursively to avoid loops.
 */
export const runTestCasesRecursive = async (
  testCases: readonly RAGTestCase[],
  index: number,
  results: readonly TestCaseResult[]
): Promise<readonly TestCaseResult[]> => {
  if (index >= testCases.length) {
    return results;
  }

  const result = await executeTestCase(testCases[index]);
  return runTestCasesRecursive(testCases, index + 1, [...results, result]);
};
