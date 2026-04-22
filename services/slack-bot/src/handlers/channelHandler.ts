/**
 * Channel Event Handler
 *
 * Handles Slack channel-related events, specifically when
 * the bot joins or leaves channels. Auto-maps all available
 * repositories when the bot joins a channel.
 */

import {
  logger,
  config,
  findTenantBySlackWorkspace,
  findGitHubAppConnection,
  getMappedRepositories,
  fetchInstallationRepositories,
  createMapping,
  getErrorMessage,
  AuthorizationError,
  type Tenant,
} from "@kenchi/shared";
import { type SlackClient } from "../services/channelService.js";
import type { RepositoryOption } from "./modalBuilders.js";

// Re-export modal constants and builders for backward compatibility
export {
  REPO_SELECT_MODAL_CALLBACK,
  REPO_SELECT_ACTION_ID,
  UNCONFIGURE_MODAL_CALLBACK,
  UNCONFIGURE_SELECT_ACTION_ID,
  buildRepoSelectModal,
  buildNoReposModal,
  buildUnconfigureModal,
  buildNoConfiguredReposModal,
  buildLoadingReposModal,
} from "./modalBuilders.js";

// ==================== GitHub Install URL ====================

/**
 * Build GitHub App install URL with workspace ID for linking.
 * The workspace ID is passed as a state parameter so we can link
 * the GitHub installation to the correct Slack workspace after install.
 */
export const getGitHubInstallUrl = (workspaceId: string): string => {
  const appSlug = config.GITHUB_APP_SLUG || "kenchi-devops";
  return `https://github.com/apps/${appSlug}/installations/new?state=${workspaceId}`;
};

// ==================== Message Templates ====================

/**
 * Build message prompting GitHub installation
 */
const buildConnectGitHubMessage = (workspaceId: string): string => {
  const githubInstallUrl = getGitHubInstallUrl(workspaceId);
  return (
    `*Hello! I'm the Kenchi DevOps Assistant*\n\n` +
    `To receive CI failure notifications in this channel, you need to connect GitHub first.\n\n` +
    `<${githubInstallUrl}|Install GitHub App>\n\n` +
    `After installing, add me to this channel again and I'll help you configure which repository to monitor.`
  );
};

/**
 * Build success message after repo selection
 */
export const buildRepoConfiguredMessage = (repository: string, channelName: string): string =>
  `*Repository Connected!*\n\n` +
  `This channel will now receive CI failure notifications for \`${repository}\`.\n\n` +
  `When a CI check fails, I'll:\n` +
  `• Analyze the logs and identify the root cause\n` +
  `• Post a detailed breakdown with fix suggestions\n` +
  `• Highlight the specific files and lines causing issues\n\n` +
  `Notifications will be posted here in #${channelName}.`;

// ==================== Repository Cache ====================

const REPO_CACHE_TTL_MS = 60_000; // 60 seconds

interface RepoCacheEntry {
  readonly repositories: readonly RepositoryOption[];
  readonly expiresAt: number;
}

/** In-memory cache keyed by `installationId:tenantId` */
const repoCache = new Map<string, RepoCacheEntry>();

/**
 * Invalidate the repository cache for a tenant, or all entries if no tenantId.
 * Call after creating or deleting a repo-channel mapping.
 */
export const clearRepoCache = (tenantId?: string): void => {
  if (!tenantId) {
    repoCache.clear();
    return;
  }
  for (const key of repoCache.keys()) {
    if (key.endsWith(`:${tenantId}`)) {
      repoCache.delete(key);
    }
  }
};

// ==================== Helper Functions ====================

/**
 * Get available repositories from GitHub for the installation.
 * Filters out already-mapped repositories.
 * Results are cached for 60s to prevent redundant API calls on rapid clicks.
 */
export const getAvailableRepositories = async (
  installationId: number,
  tenantId: string
): Promise<RepositoryOption[]> => {
  const cacheKey = `${installationId}:${tenantId}`;
  const cached = repoCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    logger.info("Returning cached repositories", {
      installationId,
      availableRepos: cached.repositories.length,
      cacheHit: true,
    });
    return [...cached.repositories];
  }

  try {
    const [allRepositories, mappedRepos] = await Promise.all([
      fetchInstallationRepositories(installationId),
      getMappedRepositories(tenantId),
    ]);

    const availableRepositories = allRepositories
      .filter((repo) => !mappedRepos.has(repo.fullName))
      .map((repo) => ({ fullName: repo.fullName, name: repo.name }));

    repoCache.set(cacheKey, {
      repositories: availableRepositories,
      expiresAt: Date.now() + REPO_CACHE_TTL_MS,
    });

    logger.info("Fetched available repositories", {
      installationId,
      totalRepos: allRepositories.length,
      mappedRepos: mappedRepos.size,
      availableRepos: availableRepositories.length,
      cacheHit: false,
    });

    return availableRepositories;
  } catch (error) {
    logger.error("Failed to fetch available repositories", {
      installationId,
      tenantId,
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Get channel info for display
 */
const getChannelName = async (client: SlackClient, channelId: string): Promise<string> => {
  try {
    const result = await client.conversations.info({ channel: channelId });
    return (result.channel as { name?: string })?.name ?? channelId;
  } catch {
    return channelId;
  }
};

// ==================== Auto-Mapping Result ====================

interface AutoMapResult {
  readonly mapped: readonly string[];
  readonly failed: readonly string[];
  readonly planLimitHit: boolean;
}

/**
 * Build the confirmation message after auto-mapping repositories.
 */
const buildAutoMapConfirmation = (result: AutoMapResult): string => {
  if (result.mapped.length === 0 && !result.planLimitHit) {
    return (
      `*Kenchi DevOps is ready!*\n\n` +
      `No new repositories to connect \u2014 all your repositories are already mapped to channels.\n\n` +
      `Use \`/kenchi configure\` in another channel to set up more repositories.`
    );
  }

  const repoList = result.mapped.map((repo) => `\u2022 \`${repo}\``).join("\n");
  const planNote = result.planLimitHit
    ? `\n\n_Some repositories were skipped due to your plan limit. Upgrade to connect more._`
    : "";
  const failNote =
    result.failed.length > 0
      ? `\n\n_${String(result.failed.length)} repository mapping(s) failed and were skipped._`
      : "";

  return (
    `*Kenchi DevOps is ready!*\n\n` +
    `I've connected ${String(result.mapped.length)} repositor${result.mapped.length === 1 ? "y" : "ies"} to this channel for CI failure notifications:\n${
      repoList
    }\n\nWhen a CI check fails, I'll analyze the logs and post root cause analysis here.\n\n` +
    `Use \`/kenchi unconfigure\` to remove a repository.${planNote}${failNote}`
  );
};

/**
 * Auto-map all available repositories to the channel.
 * Stops early if the plan limit is hit. Continues past individual failures.
 */
const autoMapRepositories = async (
  repositories: readonly RepositoryOption[],
  tenantId: string,
  channelId: string,
  channelName: string
): Promise<AutoMapResult> => {
  const mapped: string[] = []; // let: accumulated per-repo in sequential loop with early-exit
  const failed: string[] = []; // let: accumulated per-repo in sequential loop with early-exit

  // Sequential to respect plan limits — each createMapping checks the limit
  for (const repo of repositories) {
    try {
      await createMapping({
        tenantId,
        repository: repo.fullName,
        slackChannelId: channelId,
        slackChannelName: channelName,
        createdBy: "auto",
      });
      mapped.push(repo.fullName);
    } catch (error) {
      // Plan limit hit — stop mapping further repos
      if (error instanceof AuthorizationError) {
        logger.info("Plan limit reached during auto-mapping", {
          tenantId,
          channelId,
          mappedCount: mapped.length,
          remainingCount: repositories.length - mapped.length - failed.length,
        });
        return { mapped, failed, planLimitHit: true };
      }

      logger.error("Failed to auto-map repository", {
        tenantId,
        channelId,
        repository: repo.fullName,
        error: getErrorMessage(error),
      });
      failed.push(repo.fullName);
    }
  }

  return { mapped, failed, planLimitHit: false };
};

// ==================== Auto-Map Flow ====================

/**
 * Auto-map all available repositories and post confirmation for a connected tenant.
 */
const autoMapAndConfirm = async (
  client: SlackClient,
  channelId: string,
  tenant: Tenant,
  installationId: number
): Promise<void> => {
  const [repositories, channelName] = await Promise.all([
    getAvailableRepositories(installationId, tenant.id),
    getChannelName(client, channelId),
  ]);

  const result =
    repositories.length > 0
      ? await autoMapRepositories(repositories, tenant.id, channelId, channelName)
      : { mapped: [] as readonly string[], failed: [] as readonly string[], planLimitHit: false };

  // Invalidate cache after mapping changes
  if (result.mapped.length > 0) {
    clearRepoCache(tenant.id);
  }

  const confirmationMessage = buildAutoMapConfirmation(result);
  await client.chat.postMessage({
    channel: channelId,
    text: confirmationMessage,
    mrkdwn: true,
  });

  logger.info("Auto-mapped repositories on bot join", {
    channelId,
    channelName,
    tenantId: tenant.id,
    availableCount: repositories.length,
    mappedCount: result.mapped.length,
    failedCount: result.failed.length,
    planLimitHit: result.planLimitHit,
  });
};

// ==================== Main Handler ====================

/**
 * Handles the member_joined_channel event when the bot joins a channel.
 *
 * Flow:
 * 1. Check if GitHub is connected (tenant exists with installation)
 * 2. If not connected, prompt to install GitHub App
 * 3. If connected, auto-map all available repositories and post confirmation
 */
export const handleBotJoinedChannel = async (
  client: SlackClient,
  channelId: string,
  workspaceId: string
): Promise<void> => {
  try {
    logger.info("Bot joined channel", { channelId, workspaceId });

    const tenant = await findTenantBySlackWorkspace(workspaceId);
    const ghConn = tenant ? await findGitHubAppConnection(tenant.id) : null;
    const installationId = ghConn?.externalOrgId ? Number(ghConn.externalOrgId) : null;

    // GitHub not connected - prompt to install
    if (!tenant || !installationId) {
      await client.chat.postMessage({
        channel: channelId,
        text: buildConnectGitHubMessage(workspaceId),
        mrkdwn: true,
      });

      logger.info("Prompted user to connect GitHub", {
        channelId,
        workspaceId,
        hasTenant: !!tenant,
      });
      return;
    }

    await autoMapAndConfirm(client, channelId, tenant, installationId);
  } catch (error) {
    const errorDetails = error as { data?: { needed?: string; provided?: string } };
    logger.error("Failed to handle member_joined_channel event", {
      error: getErrorMessage(error),
      channel: channelId,
      needed: errorDetails?.data?.needed,
      provided: errorDetails?.data?.provided,
    });
  }
};
