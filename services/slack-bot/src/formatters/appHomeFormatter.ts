/**
 * App Home Formatter
 *
 * Builds Block Kit views for the Slack App Home tab.
 * Shows bot status, configuration, statistics, and quick actions.
 */

import type { KnownBlock, View } from "@slack/bolt";

/**
 * Repository-channel mapping for display
 */
export interface RepositoryMappingDisplay {
  readonly repository: string;
  readonly channelId: string;
  readonly channelName: string | null;
}

/**
 * App Home context data
 */
export interface AppHomeContext {
  readonly botStatus: "active" | "inactive";
  readonly repositoryMappings: readonly RepositoryMappingDisplay[];
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
 * Build repository-channel mappings section
 */
const buildRepositoryMappingsSection = (context: AppHomeContext): KnownBlock[] => {
  const { repositoryMappings } = context;

  const blocks: KnownBlock[] = [
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*:package: Repository Channels*",
      },
    },
  ];

  if (repositoryMappings.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "_No repositories configured yet_\n:bulb: Add me to a channel and select a repository to monitor",
      },
    });
    return blocks;
  }

  // Build mapping list
  const mappingLines = repositoryMappings.map(
    (mapping) => `:package: \`${mapping.repository}\` → <#${mapping.channelId}>`
  );

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: mappingLines.join("\n"),
    },
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `:large_green_circle: ${repositoryMappings.length} ${repositoryMappings.length === 1 ? "repository" : "repositories"} configured • Add me to more channels to monitor additional repos`,
      },
    ],
  });

  return blocks;
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
        "`/kenchi configure` - Select a repository for this channel\n" +
        "`/kenchi unconfigure` - Remove the repository from this channel\n" +
        "`/kenchi connect` - Get the GitHub App install link\n" +
        "`/kenchi status` - Check connection status\n" +
        "`/kenchi help` - Show all available commands\n" +
        "`/kenchi <question>` - Ask Kenchi to analyze a CI issue",
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
