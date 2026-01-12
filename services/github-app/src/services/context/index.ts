/**
 * Context module.
 *
 * Provides utilities for gathering context from GitHub
 * for AI-assisted CI failure analysis.
 *
 * Simplified pipeline: Only workflow log fetching is needed.
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

// Workflow log fetching (used by simplified pipeline)
export { fetchWorkflowLogs, fetchWorkflowTiming } from "./workflowFetcher.js";

// Annotation fetching (used for GitHub check annotations)
export { fetchCheckRunAnnotations } from "./annotationFetcher.js";

// Log parsing utilities
export { extractFileReferences, extractTestFailures, truncateWithContext } from "./logParser.js";
