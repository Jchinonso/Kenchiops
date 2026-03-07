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
  resilientPost,
  type GitLabRefreshResult,
  type RequestContext,
} from "@kenchi/shared";

import type { GitLabTokenResponse } from "./types.js";

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

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: currentRefreshToken,
    grant_type: "refresh_token",
  });

  const response = await resilientPost<GitLabTokenResponse>(tokenEndpoint, undefined, {
    rawBody: body.toString(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: GITLAB_TIMEOUT_MS,
    maxRetries: 2,
  });

  const data = response.data;

  if (data.error) {
    throw new ExternalServiceError(
      "gitlab",
      `GitLab token refresh error: ${data.error_description ?? data.error}`,
      {
        metadata: {
          operation: "refreshToken",
          errorCode: data.error,
          durationMs: response.duration,
        },
        retryable: false,
      }
    );
  }

  logger.info("GitLab token refresh completed", {
    provider: "gitlab",
    operation: "refreshToken",
    durationMs: response.duration,
    statusCode: response.status,
    ...context,
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
};
