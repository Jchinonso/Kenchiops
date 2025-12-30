/**
 * Context aggregator.
 *
 * Orchestrates gathering of all enriched context for CI failure analysis.
 */

import {
  createLogger,
  GITHUB_CONTEXT_LIMITS,
  redactSecrets,
  redactSecretsWithStats,
  deduplicateByKey,
} from "@kenchi/shared";
import { truncateWithContext, extractFileReferences, extractTestFailures } from "./logParser.js";
import type { CheckRunWebhook } from "../../types/githubTypes.js";
import type { EnrichedContext, FileReference } from "./types.js";
import { fetchWorkflowLogs, fetchWorkflowTiming } from "./workflowFetcher.js";
import { fetchPRDiff, fetchPRMetadata, fetchChangedFiles } from "./prFetcher.js";
import { fetchCommitInfo, fetchSourceFile, fetchRepositoryMetadata } from "./commitFetcher.js";
import { fetchCheckRunAnnotations } from "./annotationFetcher.js";

const logger = createLogger("github-app");

/**
 * Redact secrets from enriched context before sending to LLM.
 *
 * This is a CRITICAL security function that ensures no secrets
 * are leaked to external services like OpenAI.
 */
const redactEnrichedContext = (context: EnrichedContext): EnrichedContext => {
  let totalRedacted = 0;
  const allRedactedTypes: string[] = [];

  // Helper to redact and track stats
  const redactWithTracking = (text: string | null): string | null => {
    if (!text) {
      return text;
    }
    const result = redactSecretsWithStats(text);
    totalRedacted += result.redactedCount;
    allRedactedTypes.push(...result.redactedTypes);
    return result.text;
  };

  const redactedContext: EnrichedContext = {
    workflowLogs: redactWithTracking(context.workflowLogs),
    prDiff: redactWithTracking(context.prDiff),
    sourceFiles: context.sourceFiles.map((file) => ({
      ...file,
      content: redactSecrets(file.content),
    })),
    commitInfo: context.commitInfo
      ? {
          ...context.commitInfo,
          message: redactSecrets(context.commitInfo.message),
        }
      : null,
    annotations: context.annotations.map((ann) => ({
      ...ann,
      message: redactSecrets(ann.message),
      title: ann.title ? redactSecrets(ann.title) : undefined,
    })),
    dependencyChanges: context.dependencyChanges,
    buildConfigChanges: context.buildConfigChanges.map((change) => ({
      ...change,
      diff: redactSecrets(change.diff),
    })),
    testFailures: context.testFailures.map((failure) => ({
      ...failure,
      error: redactSecrets(failure.error),
    })),
    prMetadata: context.prMetadata
      ? {
          ...context.prMetadata,
          description: context.prMetadata.description
            ? redactSecrets(context.prMetadata.description)
            : null,
          comments: context.prMetadata.comments.map((comment) => ({
            ...comment,
            body: redactSecrets(comment.body),
          })),
        }
      : null,
    repositoryMetadata: context.repositoryMetadata,
    workflowTiming: context.workflowTiming,
  };

  // Log redaction statistics
  if (totalRedacted > 0) {
    const uniqueTypes = [...new Set(allRedactedTypes)];
    logger.warn("Secrets redacted from context before LLM analysis", {
      totalRedacted,
      secretTypes: uniqueTypes,
    });
  }

  return redactedContext;
};

/**
 * Creates an empty enriched context.
 *
 * Used when context cannot be gathered (e.g., no installation ID).
 */
const createEmptyContext = (): EnrichedContext => ({
  workflowLogs: null,
  prDiff: null,
  sourceFiles: [],
  commitInfo: null,
  annotations: [],
  dependencyChanges: [],
  buildConfigChanges: [],
  testFailures: [],
  prMetadata: null,
  repositoryMetadata: null,
  workflowTiming: null,
});

/**
 * Gather all enriched context for a check run.
 *
 * Fetches workflow logs, PR diff, source files, commit info,
 * annotations, dependency changes, and more in parallel for
 * efficient data gathering.
 *
 * @param webhook - The check run webhook payload
 * @returns Enriched context for AI analysis
 */
export const gatherEnrichedContext = async (webhook: CheckRunWebhook): Promise<EnrichedContext> => {
  const { check_run, repository, installation } = webhook;
  const installationId = installation?.id;

  if (!installationId) {
    logger.warn("No installation ID in webhook, cannot fetch additional context");
    return createEmptyContext();
  }

  const owner = repository.owner.login;
  const repo = repository.name;
  const headSha = check_run.head_sha;
  const hasPR = check_run.pull_requests.length > 0;
  const prNumber = hasPR ? check_run.pull_requests[0].number : null;

  logger.info("Gathering enriched context", {
    repository: repository.full_name,
    headSha,
    prCount: check_run.pull_requests.length,
    checkRunId: check_run.id,
  });

  // Phase 1: Fetch core data and metadata in parallel
  const [workflowLogs, commitInfo, prDiff, annotations, repositoryMetadata, workflowTiming] =
    await Promise.all([
      fetchWorkflowLogs(installationId, owner, repo, headSha),
      fetchCommitInfo(installationId, owner, repo, headSha),
      prNumber ? fetchPRDiff(installationId, owner, repo, prNumber) : Promise.resolve(null),
      fetchCheckRunAnnotations(installationId, owner, repo, check_run.id),
      fetchRepositoryMetadata(installationId, owner, repo),
      fetchWorkflowTiming(installationId, owner, repo, headSha),
    ]);

  // Phase 2: Fetch PR-specific context if we have a PR
  // Note: Dependency and build config changes are now detected by AI from the diff
  // We fetch changed file paths for context but don't pre-parse specific changes
  const [prMetadata, changedFiles] = prNumber
    ? await Promise.all([
        fetchPRMetadata(installationId, owner, repo, prNumber),
        fetchChangedFiles(installationId, owner, repo, prNumber),
      ])
    : [null, []];

  // Log changed files for debugging (AI will analyze the diff for specific changes)
  if (changedFiles.length > 0) {
    logger.info("Changed files in PR (AI will analyze diff for details)", {
      prNumber,
      fileCount: changedFiles.length,
      files: changedFiles.slice(0, 10), // Log first 10 for brevity
    });
  }

  // Extract test failures from FULL logs (before truncation to capture all failures)
  const testFailures = workflowLogs ? extractTestFailures(workflowLogs) : [];

  // Truncate logs for LLM context after test failure extraction
  const truncatedLogs = workflowLogs
    ? truncateWithContext(workflowLogs, GITHUB_CONTEXT_LIMITS.MAX_LOG_SIZE)
    : null;

  // Extract file references from logs, annotations, and check output
  const allLogs = [
    workflowLogs || "",
    check_run.output.title || "",
    check_run.output.summary || "",
    check_run.output.text || "",
  ].join("\n");

  const logFileReferences = extractFileReferences(allLogs);

  // Get files from annotations (these are high-confidence references)
  const annotationFiles: FileReference[] = annotations
    .filter((ann) => ann.level === "failure" || ann.level === "warning")
    .map((ann) => ({ path: ann.path, line: ann.startLine }));

  // Combine and dedupe file references (annotations first for priority) - no artificial limit
  const uniqueFileRefs = deduplicateByKey(
    [...annotationFiles, ...logFileReferences],
    (ref) => ref.path
  );

  // Phase 3: Fetch source files in parallel
  const sourceFilePromises = uniqueFileRefs.map((ref) =>
    fetchSourceFile(installationId, owner, repo, ref.path, headSha, ref.line)
  );

  const sourceFilesResults = await Promise.all(sourceFilePromises);
  const sourceFiles = sourceFilesResults.filter(
    (sourceFile): sourceFile is NonNullable<typeof sourceFile> => sourceFile !== null
  );

  // Detailed logging of gathered context for debugging
  logger.info("=== GATHERED CONTEXT FROM GITHUB ===", {
    repository: repository.full_name,
    headSha: headSha.substring(0, 7),
    prNumber: prNumber ?? "(no PR)",
  });

  logger.info("Context: Workflow Logs", {
    hasLogs: !!workflowLogs,
    logLength: workflowLogs?.length ?? 0,
    logPreview: workflowLogs ? workflowLogs.substring(0, 300) : "(no logs)",
  });

  logger.info("Context: Annotations from GitHub", {
    count: annotations.length,
    annotations: annotations.map((annotation) => ({
      path: annotation.path,
      line: annotation.startLine,
      level: annotation.level,
      messagePreview: annotation.message.substring(0, 80),
    })),
  });

  logger.info("Context: Test Failures Parsed from Logs", {
    count: testFailures.length,
    failures: testFailures.map((testFailure) => ({
      name: testFailure.testName,
      file: testFailure.file ?? "(unknown)",
    })),
  });

  logger.info("Context: Source Files Fetched", {
    count: sourceFiles.length,
    files: sourceFiles.map((sourceFile) => ({
      path: sourceFile.path,
      lines:
        sourceFile.startLine && sourceFile.endLine
          ? `${sourceFile.startLine}-${sourceFile.endLine}`
          : "full",
      contentLength: sourceFile.content.length,
    })),
  });

  logger.info("Context: PR & Commit Info", {
    hasCommitInfo: !!commitInfo,
    commitMessage: commitInfo?.message?.substring(0, 100),
    changedFiles: commitInfo?.changedFiles?.length ?? 0,
    hasPRDiff: !!prDiff,
    prDiffLength: prDiff?.length ?? 0,
    hasPRMetadata: !!prMetadata,
    prTitle: prMetadata?.title,
  });

  logger.info("Context: Repository & Timing", {
    repoLanguage: repositoryMetadata?.language,
    workflowName: workflowTiming?.workflowName,
    jobName: workflowTiming?.jobName,
    durationMs: workflowTiming?.durationMs,
    conclusion: workflowTiming?.conclusion,
  });

  logger.info("=== END GATHERED CONTEXT ===");

  // CRITICAL: Redact secrets before returning context for LLM analysis
  // Use truncated logs for LLM context (test failures already extracted from full logs)
  // Note: dependencyChanges and buildConfigChanges are empty - AI extracts these from prDiff
  const rawContext: EnrichedContext = {
    workflowLogs: truncatedLogs,
    prDiff,
    sourceFiles,
    commitInfo,
    annotations,
    dependencyChanges: [], // AI extracts from prDiff (language-agnostic)
    buildConfigChanges: [], // AI extracts from prDiff (language-agnostic)
    testFailures,
    prMetadata,
    repositoryMetadata,
    workflowTiming,
  };

  return redactEnrichedContext(rawContext);
};
