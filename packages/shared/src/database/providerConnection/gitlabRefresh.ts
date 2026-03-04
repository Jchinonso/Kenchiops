/**
 * GitLab Token Refresh Utility
 *
 * Proactively refreshes gitlab_ci provider connection access tokens
 * before they expire. The actual HTTP refresh call is injected as a
 * dependency so both the api and github-app services can use this
 * shared orchestration logic with their own adapter implementations.
 *
 * @module database/providerConnection/gitlabRefresh
 */

import { createLogger } from "../../core/logger.js";
import { getErrorMessage } from "../../core/errors.js";
import { encryptForTenant, decryptAuto } from "../../security/tenantEncryption.js";
import { findGitLabConnection, updateProviderConnection } from "./repository.js";
import type { ProviderConnection, GitLabTokenRefreshFn } from "./types.js";
import type { RequestContext } from "../../core/types.js";

// ==================== Constants ====================

/** Buffer before token expiry at which to trigger refresh (5 minutes). */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ==================== Helpers ====================

/** Safely extract a string value from a config record by key. */
const getConfigString = (
  configRecord: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const value = configRecord[key];
  return typeof value === "string" ? value : null;
};

// ==================== Core Logic ====================

const logger = createLogger("gitlab-token-refresh");

/**
 * Check if a gitlab_ci connection's token needs refresh and refresh it if so.
 *
 * Returns the current valid access token, or null if no connection exists.
 * Refresh failures never throw — they log a warning and return the current
 * (possibly expired) token so the caller can attempt the API call anyway.
 *
 * Pass `existingConnection` when the caller already has the connection object
 * to avoid a redundant DB lookup (the function fetches it otherwise).
 */
export const refreshGitLabTokenIfNeeded = async (
  tenantId: string,
  refreshFn: GitLabTokenRefreshFn,
  context: RequestContext,
  existingConnection?: ProviderConnection
): Promise<string | null> => {
  const connection = existingConnection ?? (await findGitLabConnection(tenantId));

  if (!connection || !connection.isActive || !connection.accessToken) {
    return null;
  }

  // If no expiry set, return current token (cannot know if expired)
  if (!connection.tokenExpiresAt) {
    return connection.accessToken;
  }

  const expiresInMs = connection.tokenExpiresAt.getTime() - Date.now();

  // Token is still valid beyond the buffer window
  if (expiresInMs > TOKEN_REFRESH_BUFFER_MS) {
    return connection.accessToken;
  }

  // Token expiring soon or already expired — attempt refresh
  const encryptedRefresh = getConfigString(connection.config, "refreshToken");

  if (!encryptedRefresh) {
    logger.warn("GitLab token expiring but no refresh token stored in config", {
      provider: "gitlab",
      connectionId: connection.id,
      expiresInMs,
      ...context,
    });
    return connection.accessToken;
  }

  const storedRefresh = await decryptAuto(connection.tenantId, encryptedRefresh);

  if (!storedRefresh) {
    logger.warn("GitLab refresh token decryption returned empty", {
      provider: "gitlab",
      connectionId: connection.id,
      ...context,
    });
    return connection.accessToken;
  }

  try {
    const newTokens = await refreshFn(storedRefresh, connection.baseUrl, context);

    const newExpiresAt = newTokens.expiresIn
      ? new Date(Date.now() + newTokens.expiresIn * 1000)
      : null;

    const updatedConfig = {
      ...connection.config,
      ...(newTokens.refreshToken
        ? { refreshToken: await encryptForTenant(connection.tenantId, newTokens.refreshToken) }
        : {}),
    };

    await updateProviderConnection({
      id: connection.id,
      tenantId: connection.tenantId,
      accessToken: newTokens.accessToken,
      tokenExpiresAt: newExpiresAt,
      config: updatedConfig,
    });

    logger.info("GitLab token refreshed successfully", {
      provider: "gitlab",
      operation: "refreshToken",
      connectionId: connection.id,
      ...context,
    });

    return newTokens.accessToken;
  } catch (error) {
    logger.error("GitLab token refresh failed, using existing token", {
      provider: "gitlab",
      operation: "refreshToken",
      connectionId: connection.id,
      error: getErrorMessage(error),
      ...context,
    });

    // Return current token as fallback — caller will get a 401 if truly expired
    return connection.accessToken;
  }
};
