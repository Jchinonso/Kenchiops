/**
 * Reactivation Validator
 *
 * Validates the health of a tenant's integrations and subscription
 * before reactivation. Always allows reactivation but returns warnings
 * about issues that may affect service quality.
 *
 * @module database/tenant/reactivationValidator
 */

import { findByTenant } from "../providerConnection/repository.js";
import { getSubscriptionWithPlan } from "../subscription/repository.js";
import type { ProviderConnection } from "../providerConnection/types.js";
import type { SubscriptionWithPlan } from "../subscription/types.js";
import type { ReactivationWarning, ReactivationReport } from "./reactivationValidatorTypes.js";

/**
 * Check provider connections for expired tokens.
 * Returns a warning for each connection whose token has expired.
 */
const checkExpiredTokens = (
  connections: readonly ProviderConnection[]
): readonly ReactivationWarning[] =>
  connections
    .filter(
      (conn): boolean => conn.tokenExpiresAt !== null && conn.tokenExpiresAt.getTime() < Date.now()
    )
    .map(
      (conn): ReactivationWarning => ({
        type: "expired_token",
        provider: conn.provider,
        message: `The ${conn.provider} access token for "${conn.connectionName}" expired on ${conn.tokenExpiresAt?.toISOString() ?? "unknown"}. Re-authenticate to restore access.`,
      })
    );

/**
 * Check whether any platform provider connection exists (github_app, gitlab, bitbucket, azure_devops).
 * Returns a warning if no platform installation is found.
 */
const PLATFORM_PROVIDERS: ReadonlySet<string> = new Set([
  "github_app",
  "gitlab",
  "bitbucket",
  "azure_devops",
]);

const checkMissingInstallation = (
  connections: readonly ProviderConnection[]
): readonly ReactivationWarning[] => {
  const hasPlatform = connections.some((conn) => PLATFORM_PROVIDERS.has(conn.provider));
  return hasPlatform
    ? []
    : [
        {
          type: "missing_installation",
          message:
            "No active platform integration found (GitHub App, GitLab, Bitbucket, or Azure DevOps). Install one to enable CI analysis.",
        },
      ];
};

/**
 * Check subscription health. Returns warnings for past_due, canceled,
 * or expired trial subscriptions.
 */
const checkSubscriptionHealth = (
  subscriptionWithPlan: SubscriptionWithPlan | null
): readonly ReactivationWarning[] => {
  if (!subscriptionWithPlan) {
    return [];
  }

  const { subscription } = subscriptionWithPlan;
  const { status, trialEndsAt } = subscription;

  if (status === "past_due" || status === "canceled") {
    return [
      {
        type: "expired_subscription",
        message: `Subscription is "${status}". Resolve billing to avoid service interruption.`,
      },
    ];
  }

  if (status === "trialing" && trialEndsAt !== null && trialEndsAt.getTime() < Date.now()) {
    return [
      {
        type: "expired_trial",
        message: `Trial expired on ${trialEndsAt.toISOString()}. Upgrade to a paid plan to retain full access.`,
      },
    ];
  }

  return [];
};

/**
 * Validate a tenant's integrations and subscription for reactivation.
 *
 * Always returns `canActivate: true` — the caller decides whether to
 * proceed based on the warnings. This keeps the activation path
 * permissive while surfacing actionable information.
 *
 * @param tenantId - The tenant to validate
 * @returns Report with canActivate flag and any warnings
 */
export const validateReactivation = async (tenantId: string): Promise<ReactivationReport> => {
  const [connections, subscriptionWithPlan] = await Promise.all([
    findByTenant(tenantId),
    getSubscriptionWithPlan(tenantId),
  ]);

  const warnings: readonly ReactivationWarning[] = [
    ...checkExpiredTokens(connections),
    ...checkMissingInstallation(connections),
    ...checkSubscriptionHealth(subscriptionWithPlan),
  ];

  return {
    canActivate: true,
    warnings,
  };
};
