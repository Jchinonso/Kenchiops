/**
 * Repository Selection Handler
 *
 * Handles the modal submission when a user selects a repository
 * for a Slack channel. Creates the mapping in the database and
 * confirms the configuration to the user.
 */

import { logger, createMapping, deleteMapping, findBySlackWorkspace, getErrorMessage } from "@kenchi/shared";
import {
  REPO_SELECT_MODAL_CALLBACK,
  REPO_SELECT_ACTION_ID,
  UNCONFIGURE_MODAL_CALLBACK,
  UNCONFIGURE_SELECT_ACTION_ID,
  buildRepoConfiguredMessage,
} from "./channelHandler.js";

// ==================== Types ====================

/**
 * Private metadata stored in the modal
 */
interface ModalMetadata {
  readonly channelId: string;
  readonly channelName: string;
  readonly messageTs?: string;
}

/**
 * View submission payload values
 */
interface ViewValues {
  readonly repo_select_block?: {
    readonly [key: string]:
      | {
          readonly selected_option?: {
            readonly value: string;
          };
        }
      | undefined;
  };
}

/**
 * Simplified view submission args type
 */
interface ViewSubmissionArgs {
  ack: () => Promise<void>;
  view: {
    private_metadata: string;
    id: string;
    state: {
      values: ViewValues;
    };
  };
  client: {
    auth: {
      test: () => Promise<{ team_id?: string }>;
    };
    chat: {
      postMessage: (args: { channel: string; text: string; mrkdwn?: boolean }) => Promise<void>;
      update: (args: { channel: string; ts: string; text: string; blocks?: unknown[] }) => Promise<void>;
    };
  };
  body: {
    user: {
      id: string;
    };
  };
}

// ==================== Handler ====================

/**
 * Handle repository selection modal submission.
 * Creates the repository-channel mapping and notifies the channel.
 */
export const handleRepoSelectSubmission = async (args: ViewSubmissionArgs): Promise<void> => {
  const { ack, view, client, body } = args;

  try {
    // Acknowledge the submission immediately
    await ack();

    // Parse metadata
    const metadata: ModalMetadata = JSON.parse(view.private_metadata || "{}");
    const { channelId, channelName, messageTs } = metadata;

    if (!channelId) {
      logger.error("Missing channelId in modal metadata");
      return;
    }

    // Extract selected repository
    const values = view.state.values;
    const repoBlock = values.repo_select_block;
    const selectedRepo = repoBlock?.[REPO_SELECT_ACTION_ID]?.selected_option?.value;

    if (!selectedRepo) {
      logger.error("No repository selected in modal submission");
      return;
    }

    // Get workspace ID and tenant
    const authResult = await client.auth.test();
    const workspaceId = authResult.team_id || "";
    const tenant = await findBySlackWorkspace(workspaceId);

    if (!tenant) {
      logger.error("Tenant not found for workspace", { workspaceId });
      return;
    }

    // Create the mapping
    await createMapping({
      tenantId: tenant.id,
      repository: selectedRepo,
      slackChannelId: channelId,
      slackChannelName: channelName,
      createdBy: body.user.id,
    });

    // Update the original welcome message to remove the button
    if (messageTs) {
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: `Repository configured: ${selectedRepo}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `👋 *Welcome!* I'm monitoring CI failures for \`${selectedRepo}\` in this channel.`,
            },
          },
        ],
      });
    }

    // Post confirmation message to the channel
    const confirmationMessage = buildRepoConfiguredMessage(selectedRepo, channelName);
    await client.chat.postMessage({
      channel: channelId,
      text: confirmationMessage,
      mrkdwn: true,
    });

    logger.info("Repository-channel mapping created via modal", {
      tenantId: tenant.id,
      repository: selectedRepo,
      channelId,
      channelName,
      userId: body.user.id,
    });
  } catch (error) {
    logger.error("Failed to handle repository selection", {
      error: getErrorMessage(error),
      viewId: view.id,
    });
  }
};

/**
 * Unconfigure view submission values
 */
interface UnconfigureViewValues {
  readonly unconfigure_select_block?: {
    readonly [key: string]:
      | {
          readonly selected_option?: {
            readonly value: string;
          };
        }
      | undefined;
  };
}

/**
 * Handle unconfigure modal submission.
 * Deletes the selected repository-channel mapping.
 */
export const handleUnconfigureSubmission = async (args: {
  ack: () => Promise<void>;
  view: {
    id: string;
    state: {
      values: UnconfigureViewValues;
    };
  };
  client: {
    auth: {
      test: () => Promise<{ team_id?: string }>;
    };
    chat: {
      postMessage: (args: { channel: string; text: string; mrkdwn?: boolean }) => Promise<void>;
    };
  };
  body: {
    user: {
      id: string;
    };
  };
}): Promise<void> => {
  const { ack, view, client, body } = args;

  try {
    await ack();

    // Extract selected mapping
    const values = view.state.values;
    const selectBlock = values.unconfigure_select_block;
    const selectedValue = selectBlock?.[UNCONFIGURE_SELECT_ACTION_ID]?.selected_option?.value;

    if (!selectedValue) {
      logger.error("No repository selected in unconfigure modal");
      return;
    }

    const { repository, channelId } = JSON.parse(selectedValue) as {
      repository: string;
      channelId: string;
    };

    // Get workspace ID and tenant
    const authResult = await client.auth.test();
    const workspaceId = authResult.team_id || "";
    const tenant = await findBySlackWorkspace(workspaceId);

    if (!tenant) {
      logger.error("Tenant not found for workspace", { workspaceId });
      return;
    }

    // Delete the mapping
    await deleteMapping(tenant.id, repository);

    // Post confirmation message to the channel
    await client.chat.postMessage({
      channel: channelId,
      text: `✅ *Repository Removed*\n\nThis channel will no longer receive CI notifications for \`${repository}\`.\n\nUse \`/kenchi configure\` to set up a different repository.`,
      mrkdwn: true,
    });

    logger.info("Repository-channel mapping removed via modal", {
      tenantId: tenant.id,
      repository,
      channelId,
      userId: body.user.id,
    });
  } catch (error) {
    logger.error("Failed to handle unconfigure submission", {
      error: getErrorMessage(error),
      viewId: view.id,
    });
  }
};

/**
 * View handler type that accepts unknown args.
 * This is necessary for Slack Bolt library interop.
 */
type ViewHandler = (args: unknown) => Promise<void>;

/**
 * Slack app type for view handler registration.
 * Uses type assertion for Slack Bolt library interop.
 */
interface SlackAppWithViews {
  readonly view: (callbackId: string, handler: ViewHandler) => void;
}

/**
 * Register the repository selection handler with the Slack app.
 * Call this during app initialization.
 */
export const registerRepoSelectHandler = (app: SlackAppWithViews): void => {
  // Type assertions needed for Slack Bolt library interop
  // Handlers are properly typed internally, cast required for generic interface
  app.view(REPO_SELECT_MODAL_CALLBACK, handleRepoSelectSubmission as ViewHandler);
  app.view(UNCONFIGURE_MODAL_CALLBACK, handleUnconfigureSubmission as ViewHandler);

  logger.info("Registered repository selection modal handler", {
    callbackId: REPO_SELECT_MODAL_CALLBACK,
  });
  logger.info("Registered unconfigure modal handler", {
    callbackId: UNCONFIGURE_MODAL_CALLBACK,
  });
};
