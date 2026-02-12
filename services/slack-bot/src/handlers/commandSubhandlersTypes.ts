/**
 * Command Subhandlers Types
 *
 * Type definitions for slash command subhandlers.
 */

import type { SlashCommand, RespondFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";

/**
 * Command context passed to subcommand handlers
 */
export interface CommandContext {
  readonly command: SlashCommand;
  readonly args: string;
  readonly respond: RespondFn;
  readonly client: WebClient;
}

/**
 * Subcommand handler type
 */
export type SubcommandHandler = (ctx: CommandContext) => Promise<void>;
