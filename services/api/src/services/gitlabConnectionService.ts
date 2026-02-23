/**
 * GitLab CI Connection Service
 *
 * Business logic for connecting/disconnecting GitLab CI as a provider.
 * Uses the user's existing GitLab OAuth identity to create a provider_connections
 * record with a generated webhook secret and the user's access token.
 *
 * @module services/gitlabConnectionService
 */

import crypto from "node:crypto";
import {
  createLogger,
  NotFoundError,
  ValidationError,
  findOAuthIdentitiesByUser,
  findByTenantAndProvider,
  createProviderConnection,
  deactivateConnection,
  config,
  type RequestContext,
} from "@kenchi/shared";

import type {
  GitLabConnectionResult,
  GitLabConnectionStatus,
} from "./gitlabConnectionServiceTypes.js";

// ==================== Constants ====================

/** Number of random bytes used to generate webhook secrets. */
const WEBHOOK_SECRET_BYTES = 32;

/** The CI provider type stored in the provider_connections table. */
const GITLAB_CI_PROVIDER = "gitlab_ci" as const;

// ==================== Helpers ====================

/** Generate a random webhook secret as a hex string. */
const generateWebhookSecret = (): string =>
  crypto.randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");

/** Compute the GitLab webhook URL. */
const getGitLabWebhookUrl = (): string => `${config.OAUTH_CALLBACK_BASE_URL}/webhooks/gitlab`;

// ==================== Service Interface ====================

interface GitLabConnectionService {
  readonly connectGitLab: (
    userId: string,
    tenantId: string,
    context: RequestContext
  ) => Promise<GitLabConnectionResult>;
  readonly getGitLabConnectionStatus: (
    tenantId: string,
    context: RequestContext
  ) => Promise<GitLabConnectionStatus>;
  readonly disconnectGitLab: (tenantId: string, context: RequestContext) => Promise<void>;
}

// ==================== Service Factory ====================

/**
 * Create the GitLab CI connection service.
 *
 * Unlike the OAuth-based integration service (Vercel/Netlify), GitLab CI
 * connections reuse the user's existing GitLab OAuth identity rather than
 * initiating a separate OAuth flow. The user must have logged in via GitLab
 * OAuth before connecting GitLab CI.
 */
export const createGitLabConnectionService = (): GitLabConnectionService => {
  const logger = createLogger("gitlab-connection-service");

  return {
    /**
     * Connect GitLab CI for a tenant.
     *
     * Flow: verify no existing connection -> find GitLab OAuth identity ->
     * generate webhook secret -> store provider connection.
     */
    connectGitLab: async (
      userId: string,
      tenantId: string,
      context: RequestContext
    ): Promise<GitLabConnectionResult> => {
      // 1. Check for existing active connection
      const existing = await findByTenantAndProvider(tenantId, GITLAB_CI_PROVIDER);
      if (existing) {
        throw new ValidationError("GitLab CI is already connected for this organization", {
          operation: "connectGitLab",
          metadata: { connectionId: existing.id },
        });
      }

      // 2. Look up user's GitLab OAuth identity
      const identities = await findOAuthIdentitiesByUser(userId);
      const gitlabIdentity = identities.find((identity) => identity.provider === "gitlab");

      if (!gitlabIdentity?.accessToken) {
        throw new ValidationError(
          "No GitLab OAuth identity found. Please log in with GitLab first.",
          { operation: "connectGitLab" }
        );
      }

      // 3. Generate webhook secret
      const webhookSecret = generateWebhookSecret();

      // 4. Create provider connection
      const connection = await createProviderConnection({
        tenantId,
        provider: GITLAB_CI_PROVIDER,
        connectionName: "GitLab CI/CD",
        externalOrgId: gitlabIdentity.providerUsername,
        baseUrl: gitlabIdentity.instanceUrl,
        webhookSecret,
        accessToken: gitlabIdentity.accessToken,
        tokenExpiresAt: gitlabIdentity.tokenExpiresAt,
      });

      const webhookUrl = getGitLabWebhookUrl();

      logger.info("GitLab CI connected", {
        connectionId: connection.id,
        ...context,
      });

      return {
        connectionId: connection.id,
        webhookUrl,
        webhookSecret,
        status: "connected",
      };
    },

    /**
     * Get the current GitLab CI connection status for a tenant.
     */
    getGitLabConnectionStatus: async (
      tenantId: string,
      context: RequestContext
    ): Promise<GitLabConnectionStatus> => {
      const connection = await findByTenantAndProvider(tenantId, GITLAB_CI_PROVIDER);

      if (!connection) {
        return {
          connected: false,
          connectionId: null,
          webhookUrl: null,
          connectedAt: null,
          instanceUrl: null,
        };
      }

      logger.info("GitLab connection status checked", { ...context });

      return {
        connected: true,
        connectionId: connection.id,
        webhookUrl: getGitLabWebhookUrl(),
        connectedAt: connection.createdAt.toISOString(),
        instanceUrl: connection.baseUrl,
      };
    },

    /**
     * Disconnect GitLab CI for a tenant.
     *
     * Soft-deletes the provider connection record.
     */
    disconnectGitLab: async (tenantId: string, context: RequestContext): Promise<void> => {
      const connection = await findByTenantAndProvider(tenantId, GITLAB_CI_PROVIDER);

      if (!connection) {
        throw new NotFoundError("No GitLab CI connection found", {
          operation: "disconnectGitLab",
        });
      }

      await deactivateConnection(connection.id);

      logger.info("GitLab CI disconnected", {
        connectionId: connection.id,
        ...context,
      });
    },
  };
};
