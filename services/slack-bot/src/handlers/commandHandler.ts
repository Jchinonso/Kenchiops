/**
 * Command Handler
 *
 * Handler for Slack slash commands.
 * Processes /kenchi commands with subcommand routing.
 *
 * Subcommands:
 * - /kenchi connect - Get GitHub App install link
 * - /kenchi status - Check connection status
 * - /kenchi configure - Select repository for channel
 * - /kenchi unconfigure - Remove repository from channel
 * - /kenchi investigate <description> - Investigate a production issue
 * - /kenchi add-doc - Add document to knowledge base
 * - /kenchi help - Show available commands
 * - /kenchi <unknown> - Shows error with valid commands
 *
 * This is the public API that re-exports from focused modules:
 * - commandSubhandlers.ts: Individual subcommand handlers
 */

import type { SlashCommand, RespondFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { createLogger } from "@kenchi/shared";
import type { AckFn } from "./actionHandlerTypes.js";
import {
  type CommandContext,
  type SubcommandHandler,
  handleConnect,
  handleStatus,
  handleHelp,
  handleConfigure,
  handleUnconfigure,
  handleAddDoc,
  handleInvestigate,
} from "./commandSubhandlers.js";

// Re-export types for consumers
export type { CommandContext, SubcommandHandler } from "./commandSubhandlers.js";

const logger = createLogger("slack-bot");

// ==================== Subcommand Router ====================

/**
 * Subcommand handler lookup table
 */
const subcommandHandlers: ReadonlyMap<string, SubcommandHandler> = new Map([
  ["configure", handleConfigure],
  ["unconfigure", handleUnconfigure],
  ["connect", handleConnect],
  ["status", handleStatus],
  ["investigate", handleInvestigate],
  ["add-doc", handleAddDoc],
  ["help", handleHelp],
]);

/**
 * Parse command text into subcommand and arguments.
 */
const parseCommand = (text: string): { subcommand: string; args: string } => {
  const trimmed = text.trim();
  const spaceIndex = trimmed.indexOf(" ");

  if (spaceIndex === -1) {
    return { subcommand: trimmed.toLowerCase(), args: "" };
  }

  return {
    subcommand: trimmed.slice(0, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
};

// ==================== Main Handler ====================

/**
 * Handles /kenchi slash command with subcommand routing.
 *
 * @param command - Slack command object
 * @param ack - Acknowledge function
 * @param respond - Respond function
 * @param client - Slack Web API client
 */
export const handleKenchiCommand = async (
  command: SlashCommand,
  ack: AckFn,
  respond: RespondFn,
  client: WebClient
): Promise<void> => {
  await ack();

  const { subcommand, args } = parseCommand(command.text);

  logger.info("Slack command received", {
    subcommand,
    hasArgs: args.length > 0,
    user: command.user_id,
    channel: command.channel_id,
  });

  const ctx: CommandContext = { command, args, respond, client };

  const handler = subcommandHandlers.get(subcommand);

  if (handler) {
    await handler(ctx);
    return;
  }

  // No subcommand or empty text → show help
  if (!subcommand) {
    await handleHelp(ctx);
    return;
  }

  // Unrecognized single-word subcommand → show error with valid commands
  const validCommands = Array.from(subcommandHandlers.keys())
    .map((cmd) => `\`/kenchi ${cmd}\``)
    .join(", ");

  await respond({
    text: `Unknown command \`/kenchi ${subcommand}\`. Available commands: ${validCommands}`,
    response_type: "ephemeral",
  });
};
