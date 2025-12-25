/**
 * Modal Builders
 *
 * Provides factory functions for creating Slack modal views
 * for repository selection and unconfiguration flows.
 */

import type { SlackModalView } from "../types/slackTypes.js";

// ==================== Constants ====================

/**
 * Modal callback ID for repository selection
 */
export const REPO_SELECT_MODAL_CALLBACK = "repo_select_modal";

/**
 * Action ID for repository dropdown
 */
export const REPO_SELECT_ACTION_ID = "repo_select_action";

/**
 * Modal callback ID for unconfigure selection
 */
export const UNCONFIGURE_MODAL_CALLBACK = "unconfigure_modal";

/**
 * Action ID for unconfigure dropdown
 */
export const UNCONFIGURE_SELECT_ACTION_ID = "unconfigure_select_action";

// ==================== Types ====================

/**
 * Repository option for selection
 */
export interface RepositoryOption {
  readonly fullName: string;
  readonly name: string;
}

/**
 * Repository mapping for unconfigure modal
 */
export interface RepositoryMapping {
  readonly repository: string;
  readonly channelId: string;
  readonly channelName: string | null;
}

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
  callback_id: REPO_SELECT_MODAL_CALLBACK,
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
      block_id: "repo_select_block",
      element: {
        type: "static_select",
        action_id: REPO_SELECT_ACTION_ID,
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
 * Build modal when no repositories are available.
 * Shows a message explaining why no repos can be selected.
 */
export const buildNoReposModal = (channelName: string): SlackModalView => ({
  type: "modal",
  callback_id: "no_repos_modal",
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
export const buildUnconfigureModal = (
  mappings: readonly RepositoryMapping[]
): SlackModalView => ({
  type: "modal",
  callback_id: UNCONFIGURE_MODAL_CALLBACK,
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
      block_id: "unconfigure_select_block",
      element: {
        type: "static_select",
        action_id: UNCONFIGURE_SELECT_ACTION_ID,
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
  callback_id: "no_configured_repos_modal",
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
