/**
 * GitHub App Type Definitions
 *
 * Types specific to the GitHub App service
 */

import type { CIWebhookPort, CILogFetcherPort, CIOutputPort } from "@kenchi/shared";

/**
 * Bundled adapters for a CI provider.
 */
export interface CIProviderAdapters {
  readonly webhook: CIWebhookPort;
  readonly logFetcher: CILogFetcherPort;
  readonly output: CIOutputPort;
}

/**
 * GitHub webhook actions for pull requests
 */
export const GITHUB_PR_ACTIONS = {
  OPENED: "opened",
  CLOSED: "closed",
  REOPENED: "reopened",
  SYNCHRONIZE: "synchronize",
} as const;

export type GitHubPRAction = (typeof GITHUB_PR_ACTIONS)[keyof typeof GITHUB_PR_ACTIONS];

/**
 * GitHub webhook actions for check runs
 */
export const GITHUB_CHECK_ACTIONS = {
  COMPLETED: "completed",
  CREATED: "created",
  REREQUESTED: "rerequested",
} as const;

export type GitHubCheckAction = (typeof GITHUB_CHECK_ACTIONS)[keyof typeof GITHUB_CHECK_ACTIONS];

/**
 * GitHub check run conclusions
 */
export const GITHUB_CHECK_CONCLUSIONS = {
  SUCCESS: "success",
  FAILURE: "failure",
  NEUTRAL: "neutral",
  CANCELLED: "cancelled",
  SKIPPED: "skipped",
  TIMED_OUT: "timed_out",
  ACTION_REQUIRED: "action_required",
  STALE: "stale",
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
    readonly merged: boolean;
    readonly merge_commit_sha: string | null;
    readonly changed_files?: number;
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
 * Pull request reference in check run webhook
 */
export interface CheckRunPullRequest {
  readonly number: number;
  readonly head: {
    readonly sha: string;
    readonly ref: string;
  };
  readonly base: {
    readonly sha: string;
    readonly ref: string;
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
    readonly head_sha: string;
    readonly output: {
      readonly title: string | null;
      readonly summary: string | null;
      readonly text: string | null;
    };
    readonly pull_requests: readonly CheckRunPullRequest[];
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
 * GitHub webhook actions for app installations
 */
export const GITHUB_INSTALLATION_ACTIONS = {
  CREATED: "created",
  DELETED: "deleted",
  SUSPEND: "suspend",
  UNSUSPEND: "unsuspend",
  NEW_PERMISSIONS_ACCEPTED: "new_permissions_accepted",
} as const;

export type GitHubInstallationAction =
  (typeof GITHUB_INSTALLATION_ACTIONS)[keyof typeof GITHUB_INSTALLATION_ACTIONS];

/**
 * GitHub account type in installation webhook
 */
export interface GitHubAccount {
  readonly login: string;
  readonly id: number;
  readonly type: "User" | "Organization";
  readonly avatar_url?: string;
  readonly html_url?: string;
}

/**
 * Installation webhook payload
 */
export interface InstallationWebhook {
  readonly action: GitHubInstallationAction;
  readonly installation: {
    readonly id: number;
    readonly account: GitHubAccount;
    readonly app_id: number;
    readonly app_slug: string;
    readonly target_type: "User" | "Organization";
    readonly permissions: Record<string, string>;
    readonly events: readonly string[];
    readonly created_at: string;
    readonly updated_at: string;
    readonly suspended_at?: string | null;
    readonly suspended_by?: GitHubAccount | null;
  };
  readonly repositories?: readonly {
    readonly id: number;
    readonly name: string;
    readonly full_name: string;
    readonly private: boolean;
  }[];
  readonly sender: GitHubAccount;
}

/**
 * Organization member webhook payload (member_added, member_removed, member_invited)
 *
 * Fired when a member is added to, removed from, or invited to a GitHub organization.
 * See: https://docs.github.com/en/webhooks/webhook-events-and-payloads#organization
 */
export interface OrganizationMemberWebhook {
  readonly action: "member_added" | "member_removed" | "member_invited";
  readonly membership: {
    readonly user: {
      readonly id: number;
      readonly login: string;
    };
    readonly role: string;
    readonly organization: {
      readonly login: string;
      readonly id: number;
    };
  };
  readonly organization: {
    readonly login: string;
    readonly id: number;
  };
  readonly sender: {
    readonly login: string;
    readonly id: number;
  };
  readonly installation?: {
    readonly id: number;
  };
}

/**
 * Health check response
 */
export interface HealthResponse {
  readonly status: "ok" | "error";
  readonly service: string;
  readonly timestamp: string;
  readonly uptime: number;
  readonly environment: string;
}

/**
 * Push webhook payload for doc file updates
 */
export interface PushWebhook {
  readonly ref: string;
  readonly before: string;
  readonly after: string;
  readonly repository: {
    readonly full_name: string;
    readonly owner: {
      readonly login: string;
    };
    readonly name: string;
    readonly default_branch: string;
  };
  readonly pusher: {
    readonly name: string;
    readonly email?: string;
  };
  readonly commits: readonly {
    readonly id: string;
    readonly message: string;
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly modified: readonly string[];
  }[];
  readonly installation?: {
    readonly id: number;
  };
}
