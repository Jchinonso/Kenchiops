/**
 * Output Module
 *
 * Formatters for transforming LLM analysis results into
 * platform-specific output formats (GitHub, Slack).
 *
 * @module formatting/output
 */

// Types
export type {
  OutputContext,
  GitHubCommentOutput,
  SlackTextElement,
  SlackBlockElement,
  SlackBlock,
  SlackMessageOutput,
} from "./types.js";

// GitHub Formatter
export { formatGitHubComment } from "./githubFormatter.js";

// Slack Formatter
export { formatSlackMessage } from "./slackFormatter.js";
