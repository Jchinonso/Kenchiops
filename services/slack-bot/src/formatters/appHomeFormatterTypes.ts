/**
 * App Home Formatter Types
 *
 * Type definitions for App Home view construction.
 */

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
    readonly orgName?: string;
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
