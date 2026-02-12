/**
 * Types for GitHub Service
 *
 * @module services/githubServiceTypes
 */

/**
 * Repository info returned from GitHub API
 */
export interface RepositoryInfo {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

/**
 * Annotation for a check run
 */
export interface CheckAnnotation {
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly annotation_level: "notice" | "warning" | "failure";
  readonly message: string;
  readonly title?: string;
}

/**
 * Options for creating a check run with annotations
 */
export interface CreateCheckRunOptions {
  readonly installationId: number;
  readonly owner: string;
  readonly repo: string;
  readonly headSha: string;
  readonly name: string;
  readonly summary: string;
  readonly annotations: readonly CheckAnnotation[];
}
