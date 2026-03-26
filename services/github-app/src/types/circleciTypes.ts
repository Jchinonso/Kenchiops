/**
 * CircleCI Type Definitions
 *
 * Types for CircleCI webhook payloads and API responses.
 * CircleCI sends job-level webhooks when jobs complete.
 *
 * @see https://circleci.com/docs/webhooks/
 * @see https://circleci.com/docs/api/v2/
 * @module types/circleciTypes
 */

// ==================== Webhook Payload Types ====================

/**
 * CircleCI webhook metadata.
 */
export interface CircleCIWebhookInfo {
  readonly id: string;
  readonly name: string;
}

/**
 * CircleCI project info embedded in webhook payload.
 */
export interface CircleCIWebhookProject {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

/**
 * CircleCI organization info embedded in webhook payload.
 */
export interface CircleCIWebhookOrganization {
  readonly id: string;
  readonly name: string;
}

/**
 * CircleCI pipeline info embedded in webhook payload.
 */
export interface CircleCIWebhookPipeline {
  readonly id: string;
  readonly number: number;
  readonly created_at: string;
  readonly trigger: {
    readonly type: string;
  };
  readonly vcs?: {
    readonly provider_name: string;
    readonly origin_repository_url: string;
    readonly target_repository_url: string;
    readonly revision: string;
    readonly branch?: string;
    readonly tag?: string;
  };
}

/**
 * CircleCI workflow info embedded in webhook payload.
 */
export interface CircleCIWebhookWorkflow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly created_at: string;
  readonly stopped_at?: string;
  readonly url: string;
}

/**
 * CircleCI job info embedded in webhook payload.
 */
export interface CircleCIWebhookJob {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly number: number;
  readonly started_at: string;
  readonly stopped_at?: string;
}

/**
 * CircleCI job-completed webhook payload.
 *
 * @see https://circleci.com/docs/webhooks/#job-completed
 */
export interface CircleCIWebhookPayload {
  readonly type: string;
  readonly id: string;
  readonly happened_at: string;
  readonly webhook: CircleCIWebhookInfo;
  readonly project: CircleCIWebhookProject;
  readonly organization: CircleCIWebhookOrganization;
  readonly pipeline: CircleCIWebhookPipeline;
  readonly workflow: CircleCIWebhookWorkflow;
  readonly job: CircleCIWebhookJob;
}

// ==================== API Response Types ====================

/**
 * Single artifact entry from the CircleCI Job Artifacts API.
 *
 * @see https://circleci.com/docs/api/v2/index.html#operation/getJobArtifacts
 */
export interface CircleCIArtifact {
  readonly path: string;
  readonly url: string;
  readonly node_index: number;
}

/**
 * Response from the CircleCI Job Artifacts API.
 */
export interface CircleCIJobArtifactsResponse {
  readonly items: readonly CircleCIArtifact[];
  readonly next_page_token: string | null;
}

/**
 * Single step output entry from the CircleCI Job Details API.
 *
 * @see https://circleci.com/docs/api/v2/index.html#operation/getJobDetails
 */
export interface CircleCIStepAction {
  readonly name: string;
  readonly status: string;
  readonly output_url?: string;
  readonly step: number;
  readonly index: number;
  readonly end_time?: string;
  readonly start_time?: string;
  readonly type: string;
}

/**
 * Step in a CircleCI job, each containing one or more actions.
 */
export interface CircleCIJobStep {
  readonly name: string;
  readonly actions: readonly CircleCIStepAction[];
}

/**
 * Response from the CircleCI v1.1 job step output endpoint.
 * Used for fetching job step logs.
 */
export interface CircleCIJobStepOutput {
  readonly message: string;
  readonly type: string;
  readonly time: string;
}

/**
 * Summary of a CircleCI pipeline from the Pipelines API.
 */
export interface CircleCIPipelineSummary {
  readonly id: string;
  readonly number: number;
  readonly state: string;
  readonly created_at: string;
  readonly trigger: {
    readonly type: string;
  };
  readonly vcs?: {
    readonly revision: string;
    readonly branch?: string;
  };
}

/**
 * Summary of a CircleCI workflow from the Pipeline Workflows API.
 */
export interface CircleCIWorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly created_at: string;
  readonly stopped_at?: string;
  readonly pipeline_id: string;
  readonly pipeline_number: number;
}

/**
 * Summary of a CircleCI job from the Workflow Jobs API.
 */
export interface CircleCIJobSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly job_number: number;
  readonly started_at: string;
  readonly stopped_at?: string;
  readonly type: string;
}

/**
 * Paginated response wrapper used by CircleCI v2 API.
 */
export interface CircleCIPaginatedResponse<T> {
  readonly items: readonly T[];
  readonly next_page_token: string | null;
}

// ==================== Resolved Connection ====================

/**
 * Resolved CircleCI connection credentials for API access.
 */
export interface ResolvedCircleCIConnection {
  readonly apiToken: string;
  readonly projectSlug: string;
}
