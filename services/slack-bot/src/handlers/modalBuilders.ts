/**
 * Modal Builders
 *
 * Provides factory functions for creating Slack modal views
 * for repository selection and unconfiguration flows.
 */

import { SLACK_MODAL_CALLBACKS, SLACK_ACTION_IDS, SLACK_BLOCK_IDS } from "@kenchi/shared";
import type { SlackModalView } from "../types/slackTypes.js";
import type { RepositoryOption, RepositoryMapping } from "./modalBuildersTypes.js";

export type { RepositoryOption, RepositoryMapping } from "./modalBuildersTypes.js";

// Re-export for backward compatibility with existing imports
export const REPO_SELECT_MODAL_CALLBACK = SLACK_MODAL_CALLBACKS.REPO_SELECT;
export const REPO_SELECT_ACTION_ID = SLACK_ACTION_IDS.REPO_SELECT;
export const UNCONFIGURE_MODAL_CALLBACK = SLACK_MODAL_CALLBACKS.UNCONFIGURE;
export const UNCONFIGURE_SELECT_ACTION_ID = SLACK_ACTION_IDS.UNCONFIGURE_SELECT;

// ==================== Modal Builders ====================

/**
 * Build the repository selection modal view.
 * Displays a dropdown of available repositories for channel configuration.
 */
export const buildRepoSelectModal = (
  channelId: string,
  channelName: string,
  repositories: readonly RepositoryOption[],
  messageTs?: string
): SlackModalView => ({
  type: "modal",
  callback_id: SLACK_MODAL_CALLBACKS.REPO_SELECT,
  private_metadata: JSON.stringify({ channelId, channelName, messageTs }),
  title: {
    type: "plain_text",
    text: "Select Repository",
    emoji: true,
  },
  submit: {
    type: "plain_text",
    text: "Connect",
    emoji: true,
  },
  close: {
    type: "plain_text",
    text: "Cancel",
    emoji: true,
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Choose which repository should send CI notifications to *#${channelName}*`,
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: SLACK_BLOCK_IDS.REPO_SELECT,
      element: {
        type: "static_select",
        action_id: SLACK_ACTION_IDS.REPO_SELECT,
        placeholder: {
          type: "plain_text",
          text: "Select a repository",
          emoji: true,
        },
        options: repositories.map((repo) => ({
          text: {
            type: "plain_text",
            text: repo.fullName,
            emoji: true,
          },
          value: repo.fullName,
        })),
      },
      label: {
        type: "plain_text",
        text: "Repository",
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Each channel can receive updates from one repository. You can configure multiple channels for different repos.",
        },
      ],
    },
  ],
});

/**
 * Build a loading modal shown while repositories are being fetched.
 * This is opened immediately on button click to avoid trigger_id expiration.
 */
export const buildLoadingReposModal = (channelName: string): SlackModalView => ({
  type: "modal",
  callback_id: SLACK_MODAL_CALLBACKS.REPO_SELECT,
  title: {
    type: "plain_text",
    text: "Select Repository",
    emoji: true,
  },
  close: {
    type: "plain_text",
    text: "Cancel",
    emoji: true,
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Loading available repositories for *#${channelName}*...`,
      },
    },
  ],
});

/**
 * Build modal when no repositories are available.
 * Shows a message explaining why no repos can be selected.
 */
export const buildNoReposModal = (channelName: string): SlackModalView => ({
  type: "modal",
  callback_id: SLACK_MODAL_CALLBACKS.NO_REPOS,
  title: {
    type: "plain_text",
    text: "No Repositories",
    emoji: true,
  },
  close: {
    type: "plain_text",
    text: "Close",
    emoji: true,
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `No repositories available for *#${channelName}*`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "All repositories may already be configured in other channels, or the GitHub App may not have access to any repositories.",
        },
      ],
    },
  ],
});

/**
 * Build the unconfigure selection modal view.
 * Displays a list of currently configured repositories to remove.
 */
export const buildUnconfigureModal = (mappings: readonly RepositoryMapping[]): SlackModalView => ({
  type: "modal",
  callback_id: SLACK_MODAL_CALLBACKS.UNCONFIGURE,
  title: {
    type: "plain_text",
    text: "Remove Repository",
    emoji: true,
  },
  submit: {
    type: "plain_text",
    text: "Remove",
    emoji: true,
  },
  close: {
    type: "plain_text",
    text: "Cancel",
    emoji: true,
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Select which repository configuration to remove:",
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: SLACK_BLOCK_IDS.UNCONFIGURE_SELECT,
      element: {
        type: "static_select",
        action_id: SLACK_ACTION_IDS.UNCONFIGURE_SELECT,
        placeholder: {
          type: "plain_text",
          text: "Select a repository",
          emoji: true,
        },
        options: mappings.map((mapping) => ({
          text: {
            type: "plain_text",
            text: `${mapping.repository} → #${mapping.channelName ?? mapping.channelId}`,
            emoji: true,
          },
          value: JSON.stringify({ repository: mapping.repository, channelId: mapping.channelId }),
        })),
      },
      label: {
        type: "plain_text",
        text: "Repository",
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "This will stop CI notifications for the selected repository in its channel.",
        },
      ],
    },
  ],
});

/**
 * Build modal when no repositories are configured.
 * Instructs user how to configure a repository.
 */
export const buildNoConfiguredReposModal = (): SlackModalView => ({
  type: "modal",
  callback_id: SLACK_MODAL_CALLBACKS.NO_CONFIGURED_REPOS,
  title: {
    type: "plain_text",
    text: "No Repositories",
    emoji: true,
  },
  close: {
    type: "plain_text",
    text: "Close",
    emoji: true,
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No repositories are currently configured.",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Use `/kenchi configure` in a channel to set up a repository.",
        },
      ],
    },
  ],
});
