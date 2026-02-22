/**
 * GitLab Setup Service
 *
 * Orchestrates webhook creation on selected GitLab projects.
 * Uses the user's existing GitLab OAuth identity to authenticate
 * API calls and creates/updates the provider connection record.
 *
 * @module services/gitlabSetupService
 */

import crypto from "node:crypto";
import {
  createLogger,
  ValidationError,
  getErrorMessage,
  config,
  mapWithConcurrency,
  findOAuthIdentitiesByUser,
  findByTenantAndProvider,
  createProviderConnection,
  updateProviderConnection,
  type RequestContext,
} from "@kenchi/shared";

import type { GitLabProjectsPort } from "../ports/gitlabProjectsPort.js";
import type { GitLabSetupResult, GitLabProjectSetupResult } from "./gitlabSetupServiceTypes.js";

// ==================== Constants ====================

/** Number of random bytes for webhook secret generation. */
const WEBHOOK_SECRET_BYTES = 32;

/** Maximum concurrent webhook creation requests to GitLab API. */
const WEBHOOK_CREATION_CONCURRENCY = 3;

/** The CI provider type stored in the provider_connections table. */
const GITLAB_CI_PROVIDER = "gitlab_ci" as const;

// ==================== Helpers ====================

/** Generate a random webhook secret as a hex string. */
const generateWebhookSecret = (): string =>
  crypto.randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");

/** Compute the GitLab webhook URL from config. */
const getGitLabWebhookUrl = (): string => `${config.OAUTH_CALLBACK_BASE_URL}/webhooks/gitlab`;

// ==================== Service Interface ====================

interface GitLabSetupService {
  readonly setupProjects: (
    userId: string,
    tenantId: string,
    projectIds: readonly number[],
    context: RequestContext
  ) => Promise<GitLabSetupResult>;
}

// ==================== Service Factory ====================

/**
 * Create the GitLab project setup service.
 *
 * Accepts a GitLabProjectsPort adapter for creating webhooks on
 * individual GitLab projects. Creates or updates a provider_connections
 * record for the tenant.
 */
export const createGitLabSetupService = (
  projectsAdapter: GitLabProjectsPort
): GitLabSetupService => {
  const logger = createLogger("gitlab-setup-service");

  return {
    setupProjects: async (
      userId: string,
      tenantId: string,
      projectIds: readonly number[],
      context: RequestContext
    ): Promise<GitLabSetupResult> => {
      // 1. Look up user's GitLab OAuth identity
      const identities = await findOAuthIdentitiesByUser(userId);
      const gitlabIdentity = identities.find((identity) => identity.provider === "gitlab");

      if (!gitlabIdentity?.accessToken) {
        throw new ValidationError(
          "No GitLab OAuth identity found. Please log in with GitLab first.",
          { operation: "setupProjects" }
        );
      }

      const { accessToken } = gitlabIdentity;

      // 2. Verify projects belong to user (fetch user's projects and validate IDs)
      const userProjects = await projectsAdapter.getProjects(
        accessToken,
        gitlabIdentity.instanceUrl,
        context
      );
      const validProjectIds = new Set(userProjects.map((project) => project.id));
      const invalidIds = projectIds.filter((projectId) => !validProjectIds.has(projectId));

      if (invalidIds.length > 0) {
        throw new ValidationError(
          `Invalid project IDs: ${invalidIds.join(", ")}. You must have Maintainer access.`,
          {
            operation: "setupProjects",
            metadata: { invalidIds },
          }
        );
      }

      // 3. Check for existing connection -- reuse its webhook secret if present
      const existingConnection = await findByTenantAndProvider(tenantId, GITLAB_CI_PROVIDER);
      const webhookSecret = existingConnection?.webhookSecret ?? generateWebhookSecret();
      const webhookUrl = getGitLabWebhookUrl();

      // 4. Create webhooks on selected projects with bounded concurrency
      const projectMap = new Map(userProjects.map((project) => [project.id, project]));

      const results = await mapWithConcurrency(
        projectIds,
        async (projectId): Promise<GitLabProjectSetupResult> => {
          const project = projectMap.get(projectId);
          const projectName = project?.name ?? String(projectId);

          try {
            const webhook = await projectsAdapter.createProjectWebhook(
              accessToken,
              gitlabIdentity.instanceUrl,
              projectId,
              webhookUrl,
              webhookSecret,
              context
            );

            return {
              projectId,
              projectName,
              success: true,
              webhookId: webhook.id,
            };
          } catch (error) {
            logger.warn("Webhook creation failed for project", {
              projectId,
              projectName,
              error: getErrorMessage(error),
              ...context,
            });

            return {
              projectId,
              projectName,
              success: false,
              error: getErrorMessage(error),
            };
          }
        },
        WEBHOOK_CREATION_CONCURRENCY
      );

      // 5. Create or update provider connection
      const successfulResults = results.filter((result) => result.success);
      const successfulWebhookIds = successfulResults
        .filter(
          (result): result is GitLabProjectSetupResult & { readonly webhookId: number } =>
            typeof result.webhookId === "number"
        )
        .map((result) => result.webhookId);

      // let: existing config may contain project IDs from prior setup calls
      let connectionId: string; // let: assigned in either branch of the conditional

      if (existingConnection) {
        const existingConfig = existingConnection.config;
        const existingProjectWebhooks =
          (existingConfig.projectWebhooks as
            | ReadonlyArray<Readonly<Record<string, unknown>>>
            | undefined) ?? [];

        const newProjectWebhooks = successfulResults.map((result) => ({
          projectId: result.projectId,
          webhookId: result.webhookId,
        }));

        // Always refresh access token from the user's current OAuth identity
        // in case they re-authenticated with GitLab since the connection was created
        await updateProviderConnection({
          id: existingConnection.id,
          accessToken: gitlabIdentity.accessToken,
          tokenExpiresAt: gitlabIdentity.tokenExpiresAt,
          config: {
            ...existingConfig,
            projectWebhooks: [...existingProjectWebhooks, ...newProjectWebhooks],
          },
        });

        connectionId = existingConnection.id;
      } else {
        const connection = await createProviderConnection({
          tenantId,
          provider: GITLAB_CI_PROVIDER,
          connectionName: "GitLab CI/CD",
          externalOrgId: gitlabIdentity.providerUsername,
          baseUrl: gitlabIdentity.instanceUrl,
          webhookSecret,
          accessToken: gitlabIdentity.accessToken,
          tokenExpiresAt: gitlabIdentity.tokenExpiresAt,
          config: {
            projectWebhooks: successfulResults.map((result) => ({
              projectId: result.projectId,
              webhookId: result.webhookId,
            })),
          },
        });

        connectionId = connection.id;
      }

      logger.info("GitLab project setup completed", {
        connectionId,
        totalProjects: projectIds.length,
        successCount: successfulResults.length,
        failedCount: projectIds.length - successfulResults.length,
        webhookIds: successfulWebhookIds,
        ...context,
      });

      return {
        connectionId,
        webhookUrl,
        results,
      };
    },
  };
};
