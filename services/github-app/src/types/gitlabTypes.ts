/**
 * GitLab Type Definitions
 *
 * Types for GitLab CI job webhook payloads and API responses.
 * GitLab sends "Job Hook" events with object_kind: "build"
 * when a CI/CD job completes.
 *
 * @module types/gitlabTypes
 */

// ==================== Webhook Payload Types ====================

/**
 * GitLab commit info embedded in job webhook payload.
 */
export interface GitLabWebhookCommit {
  readonly sha: string;
  readonly message: string;
  readonly author_name: string;
}

/**
 * GitLab repository info embedded in job webhook payload.
 */
export interface GitLabWebhookRepository {
  readonly name: string;
  readonly url: string;
  readonly homepage: string;
}

/**
 * GitLab merge request info (present only when the pipeline
 * was triggered by a merge request).
 */
export interface GitLabWebhookMergeRequest {
  readonly iid: number;
  readonly title: string;
  readonly source_branch: string;
  readonly target_branch: string;
}

/**
 * GitLab user info embedded in job webhook payload.
 */
export interface GitLabWebhookUser {
  readonly name: string;
  readonly username: string;
}

/**
 * GitLab "Job Hook" webhook payload (object_kind: "build").
 *
 * @see https://docs.gitlab.com/ee/user/project/integrations/webhook_events.html#job-events
 */
export interface GitLabJobWebhook {
  readonly object_kind: "build";
  readonly build_id: number;
  readonly build_name: string;
  readonly build_status: string;
  readonly build_stage: string;
  readonly build_duration: number | null;
  readonly pipeline_id: number;
  readonly project_id: number;
  readonly project_name: string;
  readonly sha: string;
  readonly ref: string;
  readonly commit: GitLabWebhookCommit;
  readonly repository: GitLabWebhookRepository;
  readonly merge_request?: GitLabWebhookMergeRequest;
  readonly user: GitLabWebhookUser;
  readonly environment?: string | null;
}

// ==================== GitLab Log Fetcher Types ====================

/**
 * Resolved GitLab connection credentials for API access.
 */
export interface ResolvedGitLabConnection {
  readonly accessToken: string;
  readonly baseUrl: string;
}

// ==================== GitLab API Response Types ====================

/**
 * GitLab pipeline summary returned by the Pipelines API.
 * Only the fields we need for log fetching.
 *
 * @see https://docs.gitlab.com/ee/api/pipelines.html#list-project-pipelines
 */
export interface GitLabPipelineSummary {
  readonly id: number;
  readonly sha: string;
  readonly status: string;
  readonly ref: string;
}

/**
 * GitLab job summary returned by the Pipeline Jobs API.
 * Only the fields we need for log fetching.
 *
 * @see https://docs.gitlab.com/ee/api/jobs.html#list-pipeline-jobs
 */
export interface GitLabJobSummary {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly stage: string;
  readonly duration: number | null;
}
