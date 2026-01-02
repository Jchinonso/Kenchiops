/**
 * Context module.
 *
 * Provides utilities for gathering enriched context from GitHub
 * for AI-assisted CI failure analysis.
 */

// Re-export types
export type {
  CheckRunAnnotation,
  DependencyChange,
  BuildConfigChange,
  PRMetadata,
  RepositoryMetadata,
  WorkflowTiming,
  CommitInfo,
  SourceFile,
  TestFailure,
  FileReference,
  EnrichedContext,
} from "./types.js";

// Re-export main aggregator function
export { gatherEnrichedContext } from "./contextAggregator.js";

// Re-export individual fetchers for testing and direct use
export { fetchWorkflowLogs, fetchWorkflowTiming } from "./workflowFetcher.js";
export {
  fetchPRDiff,
  fetchPRMetadata,
  fetchChangedFiles,
  fetchPRsByCommit,
  fetchPRCommits,
} from "./prFetcher.js";
export { fetchCommitInfo, fetchSourceFile, fetchRepositoryMetadata } from "./commitFetcher.js";
export { fetchCheckRunAnnotations } from "./annotationFetcher.js";
export { extractFileReferences, extractTestFailures, truncateWithContext } from "./logParser.js";
