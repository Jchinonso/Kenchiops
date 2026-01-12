/**
 * Output Formatter
 *
 * Re-exports GitHub and Slack formatters for the simplified pipeline.
 * Split into separate modules for maintainability.
 */

// Types
export type {
  OutputContext,
  GitHubCommentOutput,
  SlackMessageOutput,
  SlackBlock,
  SlackBlockElement,
  SlackTextElement,
} from "./outputFormatterTypes.js";

// GitHub formatter
export { formatGitHubComment } from "./githubCommentFormatter.js";

// Slack formatter
export { formatSlackMessage } from "./slackMessageFormatter.js";
