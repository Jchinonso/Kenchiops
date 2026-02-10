/**
 * Legacy Webhook Event Types.
 *
 * @deprecated Import from "./types.js" instead. This file re-exports for backward compatibility.
 * @module core/webhookTypes
 */

export type {
  WebhookEvent,
  CIFailureEvent,
  SlackMessageEvent,
  GitHubPREventRepository,
  GitHubPREventPullRequest,
  GitHubPREvent,
} from "./types.js";
