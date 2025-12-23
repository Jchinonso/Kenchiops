/**
 * App Home Formatter
 *
 * Builds Block Kit views for the Slack App Home tab.
 * Shows bot status, configuration, statistics, and quick actions.
 */

import type { KnownBlock, View } from "@slack/bolt";

/**
 * App Home context data
 */
export interface AppHomeContext {
  readonly botStatus: "active" | "inactive";
  readonly activeChannel?: {
    readonly id: string;
    readonly name: string;
  };
  readonly tenant?: {
    readonly githubOrg?: string;
    readonly status: string;
    readonly slackTeamName?: string;
  };
  readonly recentActivity?: {
    readonly failuresAnalyzed: number;
    readonly lastAlertTime?: string;
    readonly totalAlerts?: number;
    readonly successRate?: number;
  };
  readonly workspaceId: string;
  readonly botInfo?: {
    readonly version?: string;
    readonly uptime?: string;
  };
}

/**
 * Status emoji lookup
 */
const STATUS_EMOJI: Record<string, string> = {
  active: ":white_check_mark:",
  inactive: ":warning:",
  connected: ":link:",
  pending: ":hourglass_flowing_sand:",
  success: ":large_green_circle:",
  error: ":red_circle:",
};

/**
 * Build header section with branding
 */
const buildHeaderSection = (): KnownBlock[] => [
  {
    type: "header",
    text: {
      type: "plain_text",
      text: ":rocket: Kenchi DevOps Assistant",
      emoji: true,
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "Your AI-powered CI/CD failure analysis and notification assistant. I monitor your GitHub workflows and provide intelligent insights when things go wrong.",
    },
  },
  {
    type: "divider",
  },
];

/**
 * Build connection status section
 */
const buildConnectionStatusSection = (context: AppHomeContext): KnownBlock[] => {
  const botStatusEmoji = context.botStatus === "active" ? STATUS_EMOJI.success : STATUS_EMOJI.error;
  const githubConnected = context.tenant?.githubOrg && context.tenant?.status === "active";
  const githubStatusEmoji = githubConnected ? STATUS_EMOJI.success : STATUS_EMOJI.pending;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*:electric_plug: Connection Status*",
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Slack Bot*\n${botStatusEmoji} ${context.botStatus === "active" ? "Connected & Running" : "Disconnected"}`,
        },
        {
          type: "mrkdwn",
          text: `*GitHub App*\n${githubStatusEmoji} ${githubConnected ? `Connected to *${context.tenant?.githubOrg}*` : "Not connected"}`,
        },
      ],
    },
  ];
};

/**
 * Build active channel section
 */
const buildChannelSection = (context: AppHomeContext): KnownBlock[] => {
  const channelText = context.activeChannel
    ? `<#${context.activeChannel.id}>`
    : "_No channel configured_";

  const statusText = context.activeChannel
    ? ":large_green_circle: Notifications will be sent here"
    : ":warning: Invite me to a channel to receive alerts";

  return [
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*:hash: Notification Channel*",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${channelText}\n${statusText}`,
      },
    },
  ];
};

/**
 * Build statistics section
 */
const buildStatisticsSection = (context: AppHomeContext): KnownBlock[] => {
  const activity = context.recentActivity;
  const failuresAnalyzed = activity?.failuresAnalyzed ?? 0;
  const totalAlerts = activity?.totalAlerts ?? 0;

  return [
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*:bar_chart: Statistics*",
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Failures Analyzed*\n:mag: ${failuresAnalyzed} today`,
        },
        {
          type: "mrkdwn",
          text: `*Alerts Sent*\n:bell: ${totalAlerts} total`,
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: activity?.lastAlertTime
            ? `:clock1: Last alert: ${activity.lastAlertTime}`
            : ":clock1: No alerts sent yet",
        },
      ],
    },
  ];
};

/**
 * Build features section
 */
const buildFeaturesSection = (): KnownBlock[] => [
  {
    type: "divider",
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*:sparkles: What I Can Do*",
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        ":one: *Analyze CI Failures* - AI-powered root cause analysis\n" +
        ":two: *Smart Notifications* - Get alerted with actionable insights\n" +
        ":three: *Fix Suggestions* - Receive recommended solutions\n" +
        ":four: *Context Gathering* - Automatic log and code analysis",
    },
  },
];

/**
 * Build quick actions section
 */
const buildQuickActionsSection = (context: AppHomeContext): KnownBlock[] => {
  const githubConnected = context.tenant?.githubOrg && context.tenant?.status === "active";

  const actionButtons: Array<{
    type: "button";
    text: { type: "plain_text"; text: string; emoji: boolean };
    action_id: string;
    url?: string;
    style?: "primary" | "danger";
  }> = [
    {
      type: "button",
      text: {
        type: "plain_text",
        text: ":arrows_counterclockwise: Refresh",
        emoji: true,
      },
      action_id: "refresh_home",
    },
    {
      type: "button",
      text: {
        type: "plain_text",
        text: ":test_tube: Test Connection",
        emoji: true,
      },
      action_id: "test_connection",
    },
  ];

  // Add GitHub connect button if not connected
  if (!githubConnected) {
    actionButtons.push({
      type: "button",
      text: {
        type: "plain_text",
        text: ":github: Connect GitHub",
        emoji: true,
      },
      action_id: "connect_github",
      url: `https://github.com/apps/kenchi-devops/installations/new?state=${context.workspaceId}`,
      style: "primary",
    });
  }

  return [
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*:zap: Quick Actions*",
      },
    },
    {
      type: "actions",
      elements: actionButtons,
    },
  ];
};

/**
 * Build commands reference section
 */
const buildCommandsSection = (): KnownBlock[] => [
  {
    type: "divider",
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*:keyboard: Available Commands*",
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "`/kenchi help` - Show all available commands\n" +
        "`/kenchi status` - Check bot and connection status\n" +
        "`/kenchi analyze <url>` - Analyze a specific CI failure\n" +
        "`@kenchi` - Mention me in a channel for help",
    },
  },
];

/**
 * Build help and resources section
 */
const buildResourcesSection = (): KnownBlock[] => [
  {
    type: "divider",
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*:books: Resources*",
    },
  },
  {
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: ":book: Documentation",
          emoji: true,
        },
        url: "https://github.com/kenchiops/kenchi#readme",
        action_id: "view_docs",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: ":speech_balloon: Get Support",
          emoji: true,
        },
        url: "https://github.com/kenchiops/kenchi/issues",
        action_id: "get_support",
      },
    ],
  },
];

/**
 * Build footer section
 */
const buildFooterSection = (context: AppHomeContext): KnownBlock[] => [
  {
    type: "divider",
  },
  {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `:bulb: *Tip:* Invite me to your team channel to start receiving CI failure notifications`,
      },
    ],
  },
  {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Workspace: \`${context.workspaceId}\` • ${context.tenant?.slackTeamName ?? "Kenchi DevOps"}`,
      },
    ],
  },
];

/**
 * Build the complete App Home view
 */
export const buildAppHomeView = (context: AppHomeContext): View => {
  const blocks: KnownBlock[] = [
    ...buildHeaderSection(),
    ...buildConnectionStatusSection(context),
    ...buildChannelSection(context),
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
 * Build a loading view while fetching data
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
 * Build an error view
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
