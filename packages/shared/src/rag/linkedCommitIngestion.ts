/**
 * Linked Commit Ingestion Module
 *
 * Creates high-value knowledge documents that link CI failure context
 * with the commits that fixed them. When a PR merges after having
 * CI failures, this module combines:
 * - Failure context (error patterns, analysis, identified cause)
 * - Commit messages (the "why" behind the fix)
 * - PR diff summary (the "how" of the fix)
 *
 * This creates searchable units that answer: "How was this error fixed before?"
 *
 * @module rag/linkedCommitIngestion
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import {
  REDIS_KEY_PREFIXES,
  REDIS_TIMEOUTS,
  CACHE_TTL_SECONDS,
  KNOWLEDGE_DOC_TYPES,
  SOURCE_RELIABILITY_SCORES,
} from "../constants/index.js";
import { ingestKnowledgeDoc, type IngestKnowledgeDocResult } from "./ingestion.js";

const logger = createLogger("rag-linked-commit");

// ==================== Types ====================

/**
 * Summary of a CI failure for linking with commits.
 */
export interface FailureSummary {
  readonly checkName: string;
  readonly conclusion: string;
  readonly identifiedCause: string;
  readonly analysis: string;
  readonly errorPatterns: readonly string[];
  readonly testFailures: readonly string[];
  readonly timestamp: string;
  readonly confidence: number;
}

/**
 * PR failure context stored in Redis.
 */
export interface PRFailureContext {
  readonly repository: string;
  readonly prNumber: number;
  readonly failures: readonly FailureSummary[];
  readonly firstFailureAt: string;
  readonly lastFailureAt: string;
}

/**
 * Input for creating linked commit knowledge.
 */
export interface LinkedCommitInput {
  readonly repository: string;
  readonly prNumber: number;
  readonly prTitle: string;
  readonly commitSha: string;
  readonly commitMessages: readonly string[];
  readonly diffSummary: string;
  readonly changedFiles: readonly string[];
  readonly tenantId: string;
  readonly author?: string;
}

/**
 * Result of linked commit ingestion.
 */
export interface LinkedCommitResult {
  readonly success: boolean;
  readonly chunksCreated: number;
  readonly linkedFailures: number;
  readonly skipped: boolean;
  readonly reason?: string;
}

// ==================== Redis Key Helpers ====================

/**
 * Build Redis key for PR failure tracking.
 */
const buildPRFailureKey = (repository: string, prNumber: number): string =>
  `${REDIS_KEY_PREFIXES.PR_FAILURES}:${repository}:${prNumber}`;

// ==================== PR Failure Tracking ====================

/**
 * Store a failure summary for a PR.
 * Called when a CI check fails on a PR.
 */
export const trackPRFailure = async (
  repository: string,
  prNumber: number,
  failure: FailureSummary
): Promise<void> => {
  const redis = getRedisClient();

  if (redis.status !== "ready") {
    logger.warn("Redis not ready for PR failure tracking", { status: redis.status });
    return;
  }

  const key = buildPRFailureKey(repository, prNumber);

  try {
    // Get existing context or create new
    const existingData = await withTimeout(redis.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    const now = new Date().toISOString();
    let context: PRFailureContext;

    if (existingData) {
      const existing = JSON.parse(existingData) as PRFailureContext;
      context = {
        ...existing,
        failures: [...existing.failures, failure],
        lastFailureAt: now,
      };
    } else {
      context = {
        repository,
        prNumber,
        failures: [failure],
        firstFailureAt: now,
        lastFailureAt: now,
      };
    }

    // Store with TTL (24 hours - should cover most PR lifecycles)
    await withTimeout(
      redis.set(key, JSON.stringify(context), "EX", CACHE_TTL_SECONDS.DAILY),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    logger.info("PR failure tracked for linking", {
      repository,
      prNumber,
      checkName: failure.checkName,
      totalFailures: context.failures.length,
    });
  } catch (error) {
    logger.error("Failed to track PR failure", {
      repository,
      prNumber,
      error: getErrorMessage(error),
    });
  }
};

/**
 * Get tracked failures for a PR.
 * Called when a PR merges to check if there were failures.
 */
export const getPRFailures = async (
  repository: string,
  prNumber: number
): Promise<PRFailureContext | null> => {
  const redis = getRedisClient();

  if (redis.status !== "ready") {
    return null;
  }

  const key = buildPRFailureKey(repository, prNumber);

  try {
    const data = await withTimeout(redis.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as PRFailureContext;
  } catch (error) {
    logger.error("Failed to get PR failures", {
      repository,
      prNumber,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Clear tracked failures for a PR.
 * Called after successful ingestion or when PR is closed without merge.
 */
export const clearPRFailures = async (repository: string, prNumber: number): Promise<void> => {
  const redis = getRedisClient();

  if (redis.status !== "ready") {
    return;
  }

  const key = buildPRFailureKey(repository, prNumber);

  try {
    await withTimeout(redis.del(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
    logger.debug("Cleared PR failure tracking", { repository, prNumber });
  } catch (error) {
    logger.error("Failed to clear PR failures", {
      repository,
      prNumber,
      error: getErrorMessage(error),
    });
  }
};

// ==================== Content Formatting ====================

/**
 * Format failure context into readable content.
 */
const formatFailureContext = (failures: readonly FailureSummary[]): string => {
  const sections = failures.map((failure, index) => {
    const lines: string[] = [
      `## Failure ${index + 1}: ${failure.checkName}`,
      "",
      `**Identified Cause:** ${failure.identifiedCause}`,
      "",
      failure.analysis,
      "",
    ];

    if (failure.errorPatterns.length > 0) {
      lines.push("**Error Patterns:**");
      failure.errorPatterns.forEach((pattern) => {
        lines.push(`- ${pattern}`);
      });
      lines.push("");
    }

    if (failure.testFailures.length > 0) {
      lines.push("**Failed Tests:**");
      failure.testFailures.forEach((test) => {
        lines.push(`- ${test}`);
      });
      lines.push("");
    }

    return lines.join("\n");
  });

  return sections.join("\n---\n\n");
};

/**
 * Format commit messages into readable content.
 */
const formatCommitMessages = (messages: readonly string[]): string => {
  if (messages.length === 0) {
    return "_No commit messages available_";
  }

  return messages.map((msg, index) => `${index + 1}. ${msg}`).join("\n");
};

/**
 * Build the full linked knowledge document content.
 */
const buildLinkedKnowledgeContent = (
  input: LinkedCommitInput,
  failures: readonly FailureSummary[]
): string => {
  const sections: string[] = [
    `# Fix: ${input.prTitle}`,
    "",
    `**Repository:** ${input.repository}`,
    `**PR:** #${input.prNumber}`,
    `**Commit:** ${input.commitSha.substring(0, 7)}`,
    input.author ? `**Author:** ${input.author}` : "",
    "",
    "---",
    "",
    "# What Failed",
    "",
    formatFailureContext(failures),
    "---",
    "",
    "# How It Was Fixed",
    "",
    "## Commit Messages",
    "",
    formatCommitMessages(input.commitMessages),
    "",
    "## Changed Files",
    "",
    input.changedFiles.map((file) => `- \`${file}\``).join("\n"),
    "",
    "## Diff Summary",
    "",
    "```diff",
    input.diffSummary,
    "```",
  ].filter(Boolean);

  return sections.join("\n");
};

/**
 * Build a searchable title for the linked knowledge.
 */
const buildLinkedKnowledgeTitle = (
  input: LinkedCommitInput,
  failures: readonly FailureSummary[]
): string => {
  const mainCause = failures[0]?.identifiedCause ?? "CI failure";
  const shortCause = mainCause.length > 80 ? `${mainCause.substring(0, 77)}...` : mainCause;
  return `Fix: ${shortCause} (PR #${input.prNumber})`;
};

// ==================== Main Ingestion Function ====================

/**
 * Create linked commit knowledge when a PR merges after CI failures.
 *
 * This function:
 * 1. Checks if the PR had tracked failures
 * 2. If yes, creates a knowledge document linking:
 *    - Failure context (what broke)
 *    - Commit messages (why it was fixed)
 *    - Diff summary (how it was fixed)
 * 3. Ingests into RAG with high reliability score
 * 4. Clears the tracked failures
 */
export const ingestLinkedCommitKnowledge = async (
  input: LinkedCommitInput
): Promise<LinkedCommitResult> => {
  const { repository, prNumber, tenantId } = input;

  logger.info("Checking for linked commit knowledge", { repository, prNumber });

  try {
    // Get tracked failures for this PR
    const failureContext = await getPRFailures(repository, prNumber);

    if (!failureContext || failureContext.failures.length === 0) {
      logger.debug("No failures to link for PR", { repository, prNumber });
      return {
        success: true,
        chunksCreated: 0,
        linkedFailures: 0,
        skipped: true,
        reason: "No failures tracked for this PR",
      };
    }

    // Build the knowledge document content
    const content = buildLinkedKnowledgeContent(input, failureContext.failures);
    const title = buildLinkedKnowledgeTitle(input, failureContext.failures);

    logger.info("Creating linked commit knowledge", {
      repository,
      prNumber,
      failureCount: failureContext.failures.length,
      contentLength: content.length,
    });

    // Ingest as high-reliability knowledge
    const result: IngestKnowledgeDocResult = await ingestKnowledgeDoc({
      docType: KNOWLEDGE_DOC_TYPES.LINKED_FIX,
      title,
      content,
      repository,
      tenantId,
      metadata: {
        prNumber,
        commitSha: input.commitSha,
        author: input.author,
        changedFiles: input.changedFiles,
        failureCount: failureContext.failures.length,
        firstFailureAt: failureContext.firstFailureAt,
        lastFailureAt: failureContext.lastFailureAt,
        sourceReliability: SOURCE_RELIABILITY_SCORES.LINKED_FIX,
        checkNames: failureContext.failures.map((failure) => failure.checkName),
        errorPatterns: failureContext.failures.flatMap((failure) => failure.errorPatterns),
      },
    });

    if (result.success) {
      // Clear tracked failures after successful ingestion
      await clearPRFailures(repository, prNumber);

      logger.info("Linked commit knowledge created", {
        repository,
        prNumber,
        documentId: result.parentId,
        chunksCreated: result.chunksCreated,
        linkedFailures: failureContext.failures.length,
      });
    } else {
      logger.error("Failed to ingest linked commit knowledge", {
        repository,
        prNumber,
        errors: result.errors,
      });
    }

    return {
      success: result.success,
      chunksCreated: result.chunksCreated,
      linkedFailures: failureContext.failures.length,
      skipped: false,
    };
  } catch (error) {
    logger.error("Error in linked commit ingestion", {
      repository,
      prNumber,
      error: getErrorMessage(error),
    });

    return {
      success: false,
      chunksCreated: 0,
      linkedFailures: 0,
      skipped: false,
      reason: getErrorMessage(error),
    };
  }
};

/**
 * Create a failure summary from an analyzed failure.
 * Utility for converting check run analysis into trackable format.
 */
interface FailureSummaryInput {
  readonly checkName: string;
  readonly conclusion: string;
  readonly identifiedCause: string;
  readonly analysis: string;
  readonly confidence: number;
  readonly errorPatterns?: readonly string[];
  readonly testFailures?: readonly string[];
}

export const createFailureSummary = (input: FailureSummaryInput): FailureSummary => ({
  checkName: input.checkName,
  conclusion: input.conclusion,
  identifiedCause: input.identifiedCause,
  analysis: input.analysis,
  confidence: input.confidence,
  errorPatterns: input.errorPatterns ?? [],
  testFailures: input.testFailures ?? [],
  timestamp: new Date().toISOString(),
});
