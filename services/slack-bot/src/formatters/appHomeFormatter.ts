/**
 * App Home Formatter
 *
 * Builds Block Kit views for the Slack App Home tab.
 * Shows bot status, configuration, statistics, and quick actions.
 *
 * This is the public API that re-exports from focused modules:
 * - appHomeSections.ts: Individual section builders
 */

import type { KnownBlock, View } from "@slack/bolt";
import {
  buildHeaderSection,
  buildConnectionStatusSection,
  buildRepositoryMappingsSection,
  buildStatisticsSection,
  buildFeaturesSection,
  buildQuickActionsSection,
  buildCommandsSection,
  buildResourcesSection,
  buildFooterSection,
} from "./appHomeSections.js";
import type { AppHomeContext } from "./appHomeFormatterTypes.js";

export type { RepositoryMappingDisplay, AppHomeContext } from "./appHomeFormatterTypes.js";

// ==================== Public API ====================

/**
 * Build the complete App Home view.
 *
 * Combines all sections into a single view:
 * - Header with branding
 * - Connection status (Slack/GitHub)
 * - Repository-channel mappings
 * - Statistics and metrics
 * - Feature list
 * - Quick actions
 * - Commands reference
 * - Resources and footer
 *
 * @param context - App home context data
 * @returns Complete Slack view object
 */
export const buildAppHomeView = (context: AppHomeContext): View => {
  const blocks: KnownBlock[] = [
    ...buildHeaderSection(),
    ...buildConnectionStatusSection(context),
    ...buildRepositoryMappingsSection(context),
    ...buildStatisticsSection(context),
    ...buildFeaturesSection(),
    ...buildQuickActionsSection(context),
    ...buildCommandsSection(),
    ...buildResourcesSection(),
    ...buildFooterSection(context),
  ];

  return {
    type: "home",
    blocks,
  };
};

/**
 * Build a loading view while fetching data.
 *
 * @returns Loading view with spinner
 */
export const buildLoadingView = (): View => ({
  type: "home",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":hourglass_flowing_sand: Loading your dashboard...",
      },
    },
  ],
});

/**
 * Build an error view when something goes wrong.
 *
 * @param errorMessage - Error message to display
 * @returns Error view with refresh button
 */
export const buildErrorView = (errorMessage: string): View => ({
  type: "home",
  blocks: [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":rocket: Kenchi DevOps Assistant",
        emoji: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: *Something went wrong*\n${errorMessage}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: ":arrows_counterclockwise: Refresh",
            emoji: true,
          },
          action_id: "refresh_home",
          style: "primary",
        },
      ],
    },
  ],
});
