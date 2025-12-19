/**
 * GitHub App Type Definitions
 *
 * Types specific to the GitHub App service
 */

/**
 * GitHub webhook actions for pull requests
 */
export const GITHUB_PR_ACTIONS = {
  OPENED: 'opened',
  CLOSED: 'closed',
  REOPENED: 'reopened',
  SYNCHRONIZE: 'synchronize',
} as const;

export type GitHubPRAction = (typeof GITHUB_PR_ACTIONS)[keyof typeof GITHUB_PR_ACTIONS];

/**
 * GitHub webhook actions for check runs
 */
export const GITHUB_CHECK_ACTIONS = {
  COMPLETED: 'completed',
  CREATED: 'created',
  REREQUESTED: 'rerequested',
} as const;

export type GitHubCheckAction =
  (typeof GITHUB_CHECK_ACTIONS)[keyof typeof GITHUB_CHECK_ACTIONS];

/**
 * GitHub check run conclusions
 */
export const GITHUB_CHECK_CONCLUSIONS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  NEUTRAL: 'neutral',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
  TIMED_OUT: 'timed_out',
  ACTION_REQUIRED: 'action_required',
} as const;

export type GitHubCheckConclusion =
  (typeof GITHUB_CHECK_CONCLUSIONS)[keyof typeof GITHUB_CHECK_CONCLUSIONS];

/**
 * Pull request webhook payload
 */
export interface PullRequestWebhook {
  readonly action: string;
  readonly pull_request: {
    readonly number: number;
    readonly title: string;
    readonly body: string | null;
    readonly head: {
      readonly sha: string;
      readonly ref: string;
    };
    readonly base: {
      readonly sha: string;
      readonly ref: string;
    };
    readonly user: {
      readonly login: string;
    };
  };
  readonly repository: {
    readonly full_name: string;
    readonly owner: {
      readonly login: string;
    };
    readonly name: string;
  };
  readonly installation?: {
    readonly id: number;
  };
}

/**
 * Check run webhook payload
 */
export interface CheckRunWebhook {
  readonly action: string;
  readonly check_run: {
    readonly id: number;
    readonly name: string;
    readonly conclusion: string | null;
    readonly output: {
      readonly title: string | null;
      readonly summary: string | null;
      readonly text: string | null;
    };
  };
  readonly repository: {
    readonly full_name: string;
    readonly owner: {
      readonly login: string;
    };
    readonly name: string;
  };
  readonly installation?: {
    readonly id: number;
  };
}

/**
 * GitHub installation info
 */
export interface GitHubInstallation {
  readonly id: number;
  readonly owner: string;
  readonly repo?: string;
}

/**
 * Health check response
 */
export interface HealthResponse {
  readonly status: 'ok' | 'error';
  readonly service: string;
  readonly timestamp: string;
  readonly uptime: number;
  readonly environment: string;
}
