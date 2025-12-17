/**
 * Common type definitions used across the monorepo.
 */

/**
 * Result from LLM analysis
 */
export interface LLMAnalysisResult {
  analysis: string;
  confidence?: number;
  suggestions?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Webhook event payload structure
 */
export interface WebhookEvent {
  source: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp?: string;
}

/**
 * CI failure event structure
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
 * Slack message event structure
 */
export interface SlackMessageEvent {
  channel: string;
  user: string;
  text: string;
  timestamp: string;
  threadTs?: string;
}

/**
 * GitHub PR event structure
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

