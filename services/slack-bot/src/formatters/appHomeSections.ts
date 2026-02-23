/**
 * App Home Section Builders
 *
 * Individual section builders for the Slack App Home tab.
 * Each function creates a specific section of the App Home view.
 */

import type { KnownBlock } from "@slack/bolt";
import type { AppHomeContext } from "./appHomeFormatter.js";

// ==================== Constants ====================

/**
 * Status emoji lookup for connection indicators
 */
const STATUS_EMOJI: Readonly<Record<string, string>> = {
  active: ":white_check_mark:",
  inactive: ":warning:",
  connected: ":link:",
  pending: ":hourglass_flowing_sand:",
  success: ":large_green_circle:",
  error: ":red_circle:",
} as const;

// ==================== Header Section ====================

/**
 * Build header section with branding.
 */
export const buildHeaderSection = (): KnownBlock[] => [
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

// ==================== Connection Status Section ====================

/**
 * Build connection status section showing Slack and GitHub connection state.
 */
export const buildConnectionStatusSection = (context: AppHomeContext): KnownBlock[] => {
  const botStatusEmoji = context.botStatus === "active" ? STATUS_EMOJI.success : STATUS_EMOJI.error;
  const githubConnected = context.tenant?.orgName && context.tenant?.status === "active";
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
          text: `*GitHub App*\n${githubStatusEmoji} ${githubConnected ? `Connected to *${context.tenant?.orgName}*` : "Not connected"}`,
        },
      ],
    },
  ];
};

// ==================== Repository Mappings Section ====================

/**
 * Build repository-channel mappings section.
 */
export const buildRepositoryMappingsSection = (context: AppHomeContext): KnownBlock[] => {
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

// ==================== Statistics Section ====================

/**
 * Build statistics section showing analysis metrics.
 */
export const buildStatisticsSection = (context: AppHomeContext): KnownBlock[] => {
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

// ==================== Features Section ====================

/**
 * Build features section listing bot capabilities.
 */
export const buildFeaturesSection = (): KnownBlock[] => [
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

// ==================== Quick Actions Section ====================

/**
 * Build quick actions section with action buttons.
 */
export const buildQuickActionsSection = (context: AppHomeContext): KnownBlock[] => {
  const githubConnected = context.tenant?.orgName && context.tenant?.status === "active";

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

// ==================== Commands Section ====================

/**
 * Build commands reference section.
 */
export const buildCommandsSection = (): KnownBlock[] => [
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

// ==================== Resources Section ====================

/**
 * Build help and resources section.
 */
export const buildResourcesSection = (): KnownBlock[] => [
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

// ==================== Footer Section ====================

/**
 * Build footer section with tips and workspace info.
 */
export const buildFooterSection = (context: AppHomeContext): KnownBlock[] => [
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
