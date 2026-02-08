/**
 * Test Case Seeding Module
 *
 * Provides seed data for RAG test cases used in drift detection.
 * Creates baseline test cases for common CI failure scenarios.
 *
 * @module rag/testCaseSeeding
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { RAG_TEST_CASE_CONFIG } from "../constants/index.js";
import { createTestCase, getActiveTestCases, type CreateTestCaseInput } from "../database/index.js";
import type { SeedTestCasesResult, TestCaseTemplate } from "./types.js";

export type { SeedTestCasesResult } from "./types.js";

const logger = createLogger("rag-test-case-seeding");

// ==================== Seed Data ====================

/**
 * Common CI failure scenario test cases.
 * These cover typical error patterns that should match knowledge docs.
 */
const CI_FAILURE_TEST_CASES: readonly TestCaseTemplate[] = [
  {
    name: "TypeScript compilation error",
    description: "Matches TypeScript type errors and compilation failures",
    queryText: "TypeScript error TS2345 type is not assignable cannot find module",
    category: "typescript",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_HIGH,
    expectedMinRecall: 0.6,
  },
  {
    name: "Jest test timeout",
    description: "Matches Jest test timeout and async test failures",
    queryText: "Jest test timeout exceeded async callback was not invoked within timeout",
    category: "testing",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_HIGH,
    expectedMinRecall: 0.6,
  },
  {
    name: "ESLint errors blocking build",
    description: "Matches ESLint rule violations that fail CI",
    queryText: "ESLint error unexpected console statement no-unused-vars parsing error",
    category: "linting",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    expectedMinRecall: 0.5,
  },
  {
    name: "npm install failure",
    description: "Matches npm dependency resolution and install failures",
    queryText: "npm ERR ERESOLVE unable to resolve dependency tree peer dependency conflict",
    category: "dependencies",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_HIGH,
    expectedMinRecall: 0.6,
  },
  {
    name: "Docker build failure",
    description: "Matches Docker build errors and image creation failures",
    queryText: "Docker build failed COPY failed file not found Dockerfile error",
    category: "docker",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    expectedMinRecall: 0.5,
  },
  {
    name: "Database connection timeout",
    description: "Matches database connection errors in tests or migrations",
    queryText: "connection timeout postgres connection refused ECONNREFUSED database",
    category: "database",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_HIGH,
    expectedMinRecall: 0.6,
  },
  {
    name: "Memory limit exceeded",
    description: "Matches out of memory errors and heap limit issues",
    queryText: "JavaScript heap out of memory FATAL ERROR allocation failed OOM",
    category: "resources",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_HIGH,
    expectedMinRecall: 0.5,
  },
  {
    name: "API rate limiting",
    description: "Matches rate limit errors from external APIs",
    queryText: "rate limit exceeded 429 too many requests API quota",
    category: "api",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    expectedMinRecall: 0.5,
  },
  {
    name: "Git authentication failure",
    description: "Matches Git auth errors in CI",
    queryText: "fatal authentication failed git clone permission denied repository",
    category: "git",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    expectedMinRecall: 0.5,
  },
  {
    name: "Environment variable missing",
    description: "Matches missing env var errors",
    queryText: "environment variable undefined process.env missing required config",
    category: "config",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    expectedMinRecall: 0.5,
  },
];

/**
 * Language-specific failure patterns.
 */
const LANGUAGE_SPECIFIC_TEST_CASES: readonly TestCaseTemplate[] = [
  {
    name: "Python import error",
    description: "Matches Python import and module errors",
    queryText: "ModuleNotFoundError ImportError No module named python pip install",
    category: "python",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    expectedMinRecall: 0.5,
  },
  {
    name: "Go compilation error",
    description: "Matches Go build and compilation errors",
    queryText: "go build failed undefined cannot use type incompatible go mod",
    category: "golang",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    expectedMinRecall: 0.5,
  },
  {
    name: "Java compilation error",
    description: "Matches Java/Maven/Gradle build errors",
    queryText: "java compilation failed cannot find symbol maven build failure gradle",
    category: "java",
    priority: RAG_TEST_CASE_CONFIG.PRIORITY_MEDIUM,
    expectedMinRecall: 0.5,
  },
];

/**
 * All seed test cases combined.
 */
const ALL_SEED_TEST_CASES: readonly TestCaseTemplate[] = [
  ...CI_FAILURE_TEST_CASES,
  ...LANGUAGE_SPECIFIC_TEST_CASES,
];

// ==================== Public API ====================

/**
 * Seeds the database with baseline test cases for drift detection.
 * Skips test cases that already exist (by name).
 *
 * @param tenantId - Optional tenant ID for tenant-specific test cases
 * @returns Seeding result with counts
 */
export const seedTestCases = async (tenantId?: string): Promise<SeedTestCasesResult> => {
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  logger.info("Starting test case seeding", {
    tenantId,
    totalTemplates: ALL_SEED_TEST_CASES.length,
  });

  try {
    // Get existing test cases to avoid duplicates
    const existingCases = await getActiveTestCases();
    const existingNames = new Set(existingCases.map((testCase) => testCase.name));

    // Process each template
    const processTemplate = async (index: number): Promise<void> => {
      if (index >= ALL_SEED_TEST_CASES.length) {
        return;
      }

      const template = ALL_SEED_TEST_CASES[index];

      // Skip if already exists
      if (existingNames.has(template.name)) {
        skipped++;
        return processTemplate(index + 1);
      }

      try {
        const input: CreateTestCaseInput = {
          tenantId,
          name: template.name,
          description: template.description,
          queryText: template.queryText,
          expectedDocIds: [], // Will be populated as knowledge is ingested
          expectedMinRecall: template.expectedMinRecall,
          category: template.category,
          priority: template.priority,
        };

        await createTestCase(input);
        created++;
      } catch (error) {
        errors.push(`Failed to create "${template.name}": ${getErrorMessage(error)}`);
      }

      return processTemplate(index + 1);
    };

    await processTemplate(0);

    logger.info("Test case seeding complete", {
      created,
      skipped,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      created,
      skipped,
      errors: Object.freeze(errors),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Test case seeding failed", { error: errorMessage });
    errors.push(errorMessage);

    return {
      success: false,
      created,
      skipped,
      errors: Object.freeze(errors),
    };
  }
};

/**
 * Gets the list of available seed test case templates.
 * Useful for previewing what will be seeded.
 */
export const getSeedTestCaseTemplates = (): readonly TestCaseTemplate[] => ALL_SEED_TEST_CASES;

/**
 * Gets seed templates by category.
 */
export const getSeedTemplatesByCategory = (category: string): readonly TestCaseTemplate[] =>
  ALL_SEED_TEST_CASES.filter((template) => template.category === category);

/**
 * Gets all available categories.
 */
export const getSeedCategories = (): readonly string[] => {
  const categories = new Set(ALL_SEED_TEST_CASES.map((template) => template.category));
  return Object.freeze([...categories]);
};
