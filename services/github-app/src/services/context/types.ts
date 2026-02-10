/**
 * Type definitions for enriched context data.
 *
 * These types describe the additional context gathered from GitHub
 * for AI-assisted CI failure analysis.
 */

/**
 * Check run annotation from GitHub
 */
export interface CheckRunAnnotation {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly level: "notice" | "warning" | "failure";
  readonly message: string;
  readonly title?: string;
}

/**
 * Dependency change detected in package.json
 */
export interface DependencyChange {
  readonly name: string;
  readonly type: "added" | "removed" | "updated";
  readonly oldVersion?: string;
  readonly newVersion?: string;
}

/**
 * Build config change
 */
export interface BuildConfigChange {
  readonly file: string;
  readonly diff: string;
}

/**
 * Pull request metadata
 */
export interface PRMetadata {
  readonly number: number;
  readonly title: string;
  readonly description: string | null;
  readonly author: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly labels: readonly string[];
  readonly isDraft: boolean;
  readonly reviewStatus: "approved" | "changes_requested" | "pending" | "review_required";
  readonly reviewers: readonly string[];
  readonly comments: readonly {
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }[];
}

/**
 * Repository metadata
 */
export interface RepositoryMetadata {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly owner: string;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
  readonly language: string | null;
}

/**
 * Workflow/CI timing information
 */
export interface WorkflowTiming {
  readonly workflowName: string;
  readonly jobName: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly conclusion: string | null;
}

/**
 * Commit information
 */
export interface CommitInfo {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly committer: string;
  readonly timestamp: string;
  readonly changedFiles: readonly string[];
}

/**
 * Source file with optional line context
 */
export interface SourceFile {
  readonly path: string;
  readonly content: string;
  readonly startLine?: number;
  readonly endLine?: number;
}

/**
 * Test failure information
 */
export interface TestFailure {
  readonly testName: string;
  readonly error: string;
  readonly file?: string;
  readonly line?: number;
}

/**
 * File reference extracted from logs
 */
export interface FileReference {
  readonly path: string;
  readonly line?: number;
}

/**
 * Enriched context for AI analysis
 */
export interface EnrichedContext {
  readonly workflowLogs: string | null;
  readonly prDiff: string | null;
  readonly sourceFiles: readonly SourceFile[];
  readonly commitInfo: CommitInfo | null;
  readonly annotations: readonly CheckRunAnnotation[];
  readonly dependencyChanges: readonly DependencyChange[];
  readonly buildConfigChanges: readonly BuildConfigChange[];
  readonly testFailures: readonly TestFailure[];
  readonly prMetadata: PRMetadata | null;
  readonly repositoryMetadata: RepositoryMetadata | null;
  readonly workflowTiming: WorkflowTiming | null;
}

// ==================== Workflow Fetcher Types ====================

/**
 * Job logs result containing job name and log content
 */
export interface JobLogsResult {
  readonly jobName: string;
  readonly jobId: number;
  readonly logs: string;
}

/**
 * Combined logs result for all failed jobs
 */
export interface AllFailedJobsLogs {
  readonly workflowName: string;
  readonly workflowRunId: number;
  readonly jobs: readonly JobLogsResult[];
  /** Combined logs with job name headers for LLM analysis */
  readonly combinedLogs: string;
}
