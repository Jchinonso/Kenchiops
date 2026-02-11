/**
 * HTTP Routes Types
 *
 * Type definitions for HTTP route handlers.
 */

import type { WebClient } from "@slack/web-api";
import type { SlackMessageRequest, ConsolidatedMessageRequest } from "../types/slackTypes.js";

/**
 * Extended request type with installation_id
 */
export type MessageRequestWithTenant = SlackMessageRequest & { readonly installation_id?: number };

/**
 * Union type for message or consolidated request
 */
export type IncomingMessageRequest = MessageRequestWithTenant | ConsolidatedMessageRequest;

/**
 * Result of getting a Slack client
 */
export type ClientResult = { success: true; client: WebClient } | { success: false; error: string };
