/**
 * GitLab Token Refresh Adapter (github-app service)
 *
 * Performs the GitLab OAuth token refresh HTTP call.
 * Implements GitLabTokenRefreshFn so it can be injected into the
 * shared refreshGitLabTokenIfNeeded utility.
 *
 * @module adapters/gitlabTokenRefresh
 */

import {
  config,
  OAUTH_PROVIDER_URLS,
  SELF_HOSTED_URL_PATTERNS,
  createLogger,
  ExternalServiceError,
  ValidationError,
  redactSecrets,
  type GitLabRefreshResult,
  type RequestContext,
} from "@kenchi/shared";

// ==================== Constants ====================

const GITLAB_TIMEOUT_MS = 10_000;

const logger = createLogger("gitlab-token-refresh");

// ==================== Internal Helpers ====================

/** Reads and validates GitLab OAuth client credentials from config. */
const ensureClientCredentials = (): {
  readonly clientId: string;
  readonly clientSecret: string;
} => {
  const clientId = config.GITLAB_OAUTH_CLIENT_ID;
  const clientSecret = config.GITLAB_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ValidationError("GitLab OAuth client credentials are not configured", {
      operation: "ensureClientCredentials",
      metadata: {
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
      },
    });
  }

  return { clientId, clientSecret };
};

/** Resolve the GitLab token endpoint URL (cloud or self-hosted). */
const getTokenEndpoint = (instanceUrl: string | null): string =>
  instanceUrl
    ? SELF_HOSTED_URL_PATTERNS.gitlab.token(instanceUrl)
    : OAUTH_PROVIDER_URLS.gitlab.token;

/** Classifies whether a fetch error is retryable based on status code. */
const isRetryableStatus = (status: number | undefined): boolean =>
  status === undefined || status >= 500 || status === 429;

// ==================== Token Refresh ====================

interface GitLabTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string | null;
  readonly expires_in: number | null;
  readonly token_type: string;
  readonly error?: string;
  readonly error_description?: string;
}

/**
 * Refresh an expired GitLab OAuth access token.
 * Works for both cloud and self-hosted instances.
 *
 * Compatible with GitLabTokenRefreshFn signature from @kenchi/shared.
 */
export const refreshGitLabToken = async (
  currentRefreshToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<GitLabRefreshResult> => {
  const { clientId, clientSecret } = ensureClientCredentials();
  const tokenEndpoint = getTokenEndpoint(instanceUrl);
  const startTime = Date.now();

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: currentRefreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(GITLAB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        "gitlab",
        `GitLab token refresh failed with status ${String(response.status)}`,
        {
          metadata: { operation: "refreshToken", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as GitLabTokenResponse;

    if (data.error) {
      throw new ExternalServiceError(
        "gitlab",
        `GitLab token refresh error: ${data.error_description ?? data.error}`,
        {
          metadata: { operation: "refreshToken", errorCode: data.error, durationMs },
          retryable: false,
        }
      );
    }

    logger.info("GitLab token refresh completed", {
      provider: "gitlab",
      operation: "refreshToken",
      durationMs,
      statusCode: response.status,
      ...context,
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitLab token refresh failed", {
      provider: "gitlab",
      operation: "refreshToken",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("gitlab", "Failed to refresh GitLab token", {
      metadata: { operation: "refreshToken", durationMs },
      retryable: true,
    });
  }
};
