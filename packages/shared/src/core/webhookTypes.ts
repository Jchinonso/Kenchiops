/**
 * Legacy Webhook Event Types
 *
 * These types are kept for backward compatibility with existing services.
 * New code should prefer the Event/Evidence/LLMAnalysisResult types.
 *
 * @module core/webhookTypes
 */

// ==================== Legacy Webhook Event Types ====================

/**
 * Generic webhook event from external sources.
 * @deprecated Use Event type instead for new code
 */
export interface WebhookEvent {
  source: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp?: string;
}

/**
 * CI failure event from GitHub Actions or similar CI systems.
 * @deprecated Use Event with type="CICD_FAILURE" instead
 */
export interface CIFailureEvent {
  repository: string;
  branch: string;
  commit: string;
  failureLog: string;
  jobName?: string;
  timestamp: string;
}

/**
 * Slack message event for interactive messages.
 * @deprecated Use Event with source="slack" instead
 */
export interface SlackMessageEvent {
  channel: string;
  user: string;
  text: string;
  timestamp: string;
  threadTs?: string;
}

/**
 * GitHub pull request event.
 * @deprecated Use Event with source="github" instead
 */
export interface GitHubPREvent {
  action: string;
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
  pull_request: {
    number: number;
    title: string;
    body?: string;
    head: { sha: string; ref: string };
    base: { ref: string };
  };
}
