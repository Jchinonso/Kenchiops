/**
 * PR Context Correlation
 *
 * Extracts linked issues from commit messages and correlates
 * PR changed files with failing test files to provide context.
 */

import { PR_CONTEXT_CORRELATION } from "../constants/github.js";

// ==================== Types ====================

/**
 * Correlated failure showing relationship between changed files and test failures.
 */
export interface CorrelatedFailure {
  /** The changed file in the PR */
  readonly changedFile: string;
  /** Test files that might be related to this change */
  readonly relatedTestFiles: readonly string[];
  /** Confidence score for the correlation */
  readonly correlationScore: number;
}

/**
 * Result of PR context correlation.
 */
export interface PRCorrelationResult {
  /** Linked issues extracted from commit message */
  readonly linkedIssues: readonly string[];
  /** Files changed in the PR that correlate with failures */
  readonly correlatedFailures: readonly CorrelatedFailure[];
  /** Whether meaningful correlation was found */
  readonly hasCorrelation: boolean;
}

// ==================== Issue Extraction ====================

/**
 * Extracts linked issue references from a commit message.
 * Supports GitHub issues, Jira tickets, and keyword links.
 *
 * @param commitMessage - The commit message to parse
 * @returns Array of unique issue references
 */
export const extractLinkedIssues = (commitMessage: string | undefined): readonly string[] => {
  if (!commitMessage) {
    return [];
  }

  const issues = new Set<string>();

  // Extract standard issue references using matchAll and forEach
  Array.from(commitMessage.matchAll(/#(\d+)/g)).forEach((match) => {
    issues.add(`#${match[1]}`);
  });

  // Extract Jira-style references
  Array.from(commitMessage.matchAll(/([A-Z]+-\d+)/g)).forEach((match) => {
    issues.add(match[1]);
  });

  // Extract full repo references
  Array.from(commitMessage.matchAll(/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)#(\d+)/g)).forEach((match) => {
    issues.add(`${match[1]}#${match[2]}`);
  });

  return Array.from(issues);
};

// ==================== File Correlation ====================

/**
 * Extracts the base name (without extension and test suffix) from a file path.
 */
const getFileBaseName = (filePath: string): string => {
  const fileName = filePath.split("/").pop() ?? "";
  // Remove test suffixes and extensions
  return fileName
    .replace(/\.(test|spec)\.[jt]sx?$/, "")
    .replace(/\.[jt]sx?$/, "")
    .replace(/_test\.[a-z]+$/, "")
    .replace(/\.test\.[a-z]+$/, "");
};

/**
 * Extracts the directory path from a file path.
 */
const getDirectoryPath = (filePath: string): string => {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : "";
};

/**
 * Calculates correlation score between a changed file and a test file.
 * Higher score = stronger correlation.
 *
 * Scoring factors:
 * - Same base name (e.g., auth.ts and auth.test.ts): high correlation
 * - Same directory: medium correlation
 * - Same service/module: low correlation
 */
const calculateCorrelationScore = (changedFile: string, testFile: string): number => {
  const changedBase = getFileBaseName(changedFile);
  const testBase = getFileBaseName(testFile);
  const changedDir = getDirectoryPath(changedFile);
  const testDir = getDirectoryPath(testFile);

  let score = 0;

  // Same base name is strong correlation
  if (changedBase === testBase) {
    score += PR_CONTEXT_CORRELATION.SCORE_SAME_BASE_NAME;
  }

  // Same directory adds to correlation
  if (changedDir === testDir) {
    score += PR_CONTEXT_CORRELATION.SCORE_SAME_DIRECTORY;
  } else if (
    changedDir &&
    testDir &&
    (testDir.includes(changedDir) || changedDir.includes(testDir))
  ) {
    // Parent/child directory relationship
    score += PR_CONTEXT_CORRELATION.SCORE_PARENT_CHILD_DIR;
  }

  // Same service (first path component under services/)
  const changedService = changedFile.match(/services\/([^/]+)/)?.[1];
  const testService = testFile.match(/services\/([^/]+)/)?.[1];
  if (changedService && testService && changedService === testService) {
    score += PR_CONTEXT_CORRELATION.SCORE_SAME_SERVICE;
  }

  return Math.min(score, PR_CONTEXT_CORRELATION.MAX_SCORE);
};

/**
 * Correlates changed files from a PR with failing test files.
 * Identifies which source changes might have caused which test failures.
 *
 * @param changedFiles - Files changed in the PR
 * @param failingTestFiles - Test files that are failing
 * @returns Array of correlated failures sorted by correlation strength
 */
export const correlatePRChangesWithFailures = (
  changedFiles: readonly string[] | undefined,
  failingTestFiles: readonly string[]
): readonly CorrelatedFailure[] => {
  if (!changedFiles || changedFiles.length === 0 || failingTestFiles.length === 0) {
    return [];
  }

  // Filter out test files from changed files and build correlations
  const sourceFiles = changedFiles.filter(
    (changedFile) => !/\.(test|spec)\.[jt]sx?$/.test(changedFile)
  );

  const correlations: CorrelatedFailure[] = [];

  sourceFiles.forEach((changedFile) => {
    // Calculate scores for all failing test files
    const relatedTests = failingTestFiles
      .map((testFile) => ({
        file: testFile,
        score: calculateCorrelationScore(changedFile, testFile),
      }))
      .filter((item) => item.score > PR_CONTEXT_CORRELATION.MIN_CORRELATION_SCORE)
      .sort((left, right) => right.score - left.score);

    if (relatedTests.length > 0) {
      const avgScore =
        relatedTests.reduce((sum, item) => sum + item.score, 0) / relatedTests.length;

      correlations.push({
        changedFile,
        relatedTestFiles: relatedTests.map((item) => item.file),
        correlationScore: avgScore,
      });
    }
  });

  // Sort by correlation score descending
  return correlations.sort((left, right) => right.correlationScore - left.correlationScore);
};

// ==================== Context Building ====================

/**
 * Builds a formatted PR context section for display.
 * Shows linked issues and correlated file changes.
 *
 * @param linkedIssues - Issue references from commit message
 * @param correlations - Correlated file changes
 * @returns Array of formatted lines for display
 */
export const buildPRContextSection = (
  linkedIssues: readonly string[],
  correlations: readonly CorrelatedFailure[]
): readonly string[] => {
  const lines: string[] = [];

  // Add linked issues
  if (linkedIssues.length > 0) {
    lines.push(`**Linked Issues:** ${linkedIssues.join(", ")}`);
  }

  // Add top correlations
  const topCorrelations = correlations.slice(0, PR_CONTEXT_CORRELATION.MAX_CORRELATIONS_DISPLAYED);
  if (topCorrelations.length > 0) {
    lines.push("");
    lines.push("**Likely Related Changes:**");
    topCorrelations.forEach((correlation) => {
      const testCount = correlation.relatedTestFiles.length;
      const confidence = Math.round(
        correlation.correlationScore * PR_CONTEXT_CORRELATION.PERCENTAGE_MULTIPLIER
      );
      lines.push(
        `- \`${correlation.changedFile}\` → ${testCount} failing test${testCount > 1 ? "s" : ""} (${confidence}% match)`
      );
    });
  }

  return lines;
};

/**
 * Performs full PR context correlation.
 * Extracts linked issues and correlates changes with failures.
 *
 * @param commitMessage - Commit message for issue extraction
 * @param changedFiles - Files changed in the PR
 * @param failingTestFiles - Test files that are failing
 * @returns Complete correlation result
 */
export const correlatePRContext = (
  commitMessage: string | undefined,
  changedFiles: readonly string[] | undefined,
  failingTestFiles: readonly string[]
): PRCorrelationResult => {
  const linkedIssues = extractLinkedIssues(commitMessage);
  const correlatedFailures = correlatePRChangesWithFailures(changedFiles, failingTestFiles);

  return {
    linkedIssues,
    correlatedFailures,
    hasCorrelation: linkedIssues.length > 0 || correlatedFailures.length > 0,
  };
};
