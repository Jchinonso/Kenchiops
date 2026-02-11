/**
 * App Home Handler Types
 *
 * Type definitions for App Home event handlers.
 */

import type { WebClient } from "@slack/web-api";

/**
 * Type for Slack client (subset of WebClient)
 */
export type SlackClient = Pick<WebClient, "views" | "auth">;
