/**
 * Auth Service
 *
 * Business logic for OAuth login flows, token management,
 * and user account linking. Orchestrates database operations,
 * JWT generation, and external OAuth provider interactions.
 *
 * @module services/authService
 */

import crypto from "node:crypto";
import {
  createLogger,
  AuthenticationError,
  JWT_CONFIG,
  USER_STATUS,
  // User lookups
  findUserById,
  findUserByEmail,
  findOAuthIdentity,
  // User lifecycle
  createUser,
  updateLastLogin,
  switchUserOrganization,
  upsertOAuthIdentity,
  // Refresh tokens
  createRefreshToken,
  findRefreshTokenByHash,
  revokeTokenFamily,
  rotateRefreshTokenAtomically,
  // Tenant lookup (provider-scoped)
  findByOrgNameAndProvider,
  // Audit logging
  logAuditEvent,
  AUDIT_ACTIONS,
  // Organization membership
  findOrganizationsByUser,
  countOwnersByTenant,
  removeMemberFromTenant,
  // Tenant creation / update
  createFromGitHubLogin,
  updateTenantOrgName,
  markTenantAsPersonal,
  createFromGitLabGroup,
  createFromBitbucketWorkspace,
  createFromAzureDevOpsAccount,
  // Type guards
  assertUnreachable,
  getErrorMessage,
  // User organization
  addUserOrganization,
  findUserOrgRole,
  // Plan limits
  checkPlanLimit,
  // Tenant member count
  countTenantMembers,
  // Provider role mapping
  resolveAutoLinkRole,
  // JWT utilities
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  // Types
  type OAuthProvider,
  type OAuthProviderProfile,
  type OAuthTokenResponse,
  type RequestContext,
  type TokenPair,
  type UpsertOAuthIdentityInput,
} from "@kenchi/shared";

import { getOAuthAdapter } from "../adapters/oauthAdapterRegistry.js";
import type { TokenMeta, FindOrCreateUserResult } from "./authServiceTypes.js";

const logger = createLogger("auth-service");

// ==================== Constants ====================

/** Providers that expose organization membership APIs for tenant auto-linking. */
const ORG_CAPABLE_PROVIDERS: ReadonlySet<OAuthProvider> = new Set<OAuthProvider>([
  "github",
  "gitlab",
  "bitbucket",
  "azure_devops",
]);

/** Numeric hierarchy for Kenchi roles (higher = more privileged). */
const ROLE_HIERARCHY: Readonly<Record<string, number>> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * Ensure the first user of a new tenant gets at least "admin" level access.
 * If the provider-mapped role is already admin or owner, it passes through.
 * This prevents privilege escalation (no unconditional "owner") while ensuring
 * the tenant creator has enough access to manage the organization.
 */
const elevateToMinimumAdmin = (role: string): string =>
  (ROLE_HIERARCHY[role] ?? 0) >= (ROLE_HIERARCHY.admin ?? 2) ? role : "admin";

// ==================== Extracted Service Methods ====================

/**
 * Look up or create a user from an OAuth provider profile.
 *
 * Resolution order:
 * 1. Match by existing OAuth identity (provider + providerUserId + instanceUrl)
 * 2. Match by verified email for account linking
 * 3. Create a new user
 */
const findOrCreateUserImpl = async (
  provider: OAuthProvider,
  profile: OAuthProviderProfile,
  tokens: OAuthTokenResponse,
  instanceUrl: string | null,
  context: RequestContext
): Promise<FindOrCreateUserResult> => {
  const existingIdentity = await findOAuthIdentity(provider, profile.providerUserId, instanceUrl);

  if (existingIdentity) {
    await upsertOAuthIdentity(
      buildUpsertInput(existingIdentity.userId, provider, profile, tokens, instanceUrl)
    );

    const user = await findUserById(existingIdentity.userId);

    if (!user) {
      throw new AuthenticationError("User associated with OAuth identity not found", {
        operation: "findOrCreateUser",
        metadata: { provider, providerUserId: profile.providerUserId },
      });
    }

    await updateLastLogin(user.id);

    logger.info("Existing user logged in via OAuth", {
      userId: user.id,
      provider,
      isNew: false,
      ...context,
    });

    return { user, isNew: false };
  }

  // Attempt account linking by verified email only.
  // Unverified emails must NOT be used for linking to prevent account
  // takeover by an attacker who sets their OAuth profile email to a victim's address.
  const emailMatch =
    profile.email && profile.emailVerified ? await findUserByEmail(profile.email) : null;

  const isNew = emailMatch === null;

  const user =
    emailMatch ??
    (await createUser({
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      tenantId: null,
    }));

  await upsertOAuthIdentity(buildUpsertInput(user.id, provider, profile, tokens, instanceUrl));

  await updateLastLogin(user.id);

  logger.info(isNew ? "New user created via OAuth" : "Existing user linked via email", {
    userId: user.id,
    provider,
    isNew,
    ...context,
  });

  return { user, isNew };
};

/**
 * Auto-link a user to organizations based on their OAuth provider memberships.
 *
 * Only runs for providers that expose organization APIs (GitHub, GitLab).
 * Always runs (even if user already has a selected org) to discover new orgs.
 */
const autoLinkOrganizationsImpl = async (
  user: Readonly<{ readonly id: string; readonly tenantId: string | null }>,
  provider: OAuthProvider,
  accessToken: string,
  instanceUrl: string | null,
  providerUsername: string,
  context: RequestContext
): Promise<void> => {
  if (!ORG_CAPABLE_PROVIDERS.has(provider)) {
    return;
  }

  const adapter = getOAuthAdapter(provider);
  const orgs = await adapter.getUserOrganizations(accessToken, instanceUrl, context);

  logger.info("Provider org discovery results", {
    userId: user.id,
    provider,
    providerUsername,
    discoveredOrgCount: orgs.length,
    discoveredOrgs: orgs.map((org) => org.login),
    ...context,
  });

  // For GitHub: always include the user's personal account alongside organizations.
  // This ensures the personal account is available in the org switcher even when
  // the user has organization memberships. Personal account is also important as
  // a fallback when GitHub's API hides orgs due to third-party access restrictions.
  const hasPersonalInOrgs =
    provider === "github" &&
    orgs.some((org) => org.login.toLowerCase() === providerUsername.toLowerCase());
  const includePersonalAccount = provider === "github" && !hasPersonalInOrgs;
  const effectiveOrgs = includePersonalAccount ? [...orgs, { login: providerUsername }] : orgs;

  // Fetch existing memberships once — reused for reconciliation threshold below.
  const existingMemberships = await findOrganizationsByUser(user.id);

  // FLAW-13: If the user already has a personal tenant with a stale name,
  // update it to the current username instead of creating a new one.
  if (provider === "github") {
    const existingPersonal = existingMemberships.find(
      (membership) => membership.provider === "github" && membership.tenantType === "personal"
    );

    if (existingPersonal && existingPersonal.orgName !== providerUsername.toLowerCase()) {
      try {
        await updateTenantOrgName(existingPersonal.tenantId, providerUsername);
        logger.info("Personal tenant org name updated for username change", {
          userId: user.id,
          personalTenantId: existingPersonal.tenantId,
          oldName: existingPersonal.orgName,
          newName: providerUsername.toLowerCase(),
          ...context,
        });
      } catch (renameError: unknown) {
        logger.warn("Failed to rename personal tenant (non-fatal)", {
          userId: user.id,
          error: getErrorMessage(renameError),
          ...context,
        });
      }
    }
  }

  const tenantIds = await ensureOrgMemberships(user.id, provider, effectiveOrgs, context);

  logger.info("Org memberships ensured", {
    userId: user.id,
    provider,
    effectiveOrgCount: effectiveOrgs.length,
    effectiveOrgs: effectiveOrgs.map((org) => org.login),
    tenantIdCount: tenantIds.length,
    ...context,
  });

  // Self-healing: detect orphaned tenants where the tenant exists but the
  // user_organizations link is missing (e.g. from a prior partial failure).
  // Re-fetch memberships after ensureOrgMemberships to get the current state.
  try {
    const postLinkMemberships = await findOrganizationsByUser(user.id);
    const linkedTenantIds = new Set(postLinkMemberships.map((membership) => membership.tenantId));
    const orphanedTenantIds = tenantIds.filter((id) => !linkedTenantIds.has(id));

    for (const orphanedId of orphanedTenantIds) {
      logger.warn("Repairing orphaned tenant membership", {
        ...context,
        userId: user.id,
        orphanedTenantId: orphanedId,
        provider,
      });
      await addUserOrganization({
        userId: user.id,
        tenantId: orphanedId,
        role: "admin",
        isDefault: false,
      });
    }
  } catch (repairError: unknown) {
    logger.warn("Orphaned membership repair failed (non-fatal)", {
      userId: user.id,
      provider,
      error: getErrorMessage(repairError),
      ...context,
    });
  }

  // Mark the personal account's tenant as 'personal' type.
  // The personal account is always the last item in effectiveOrgs when included,
  // so its tenant ID is the last in the tenantIds array.
  if (includePersonalAccount && tenantIds.length > 0) {
    const personalTenantId = tenantIds[tenantIds.length - 1];
    try {
      await markTenantAsPersonal(personalTenantId);
    } catch (markError: unknown) {
      logger.warn("Failed to mark personal tenant type (non-fatal)", {
        userId: user.id,
        error: getErrorMessage(markError),
        ...context,
      });
    }
  }

  // Reconcile stale memberships (non-fatal) with safety check.
  // If the provider returned suspiciously few orgs compared to existing memberships,
  // skip reconciliation to avoid mass-removing legitimate memberships (FLAW-07).
  const existingProviderMemberships = existingMemberships.filter(
    (membership) => membership.provider === provider
  );
  const existingCount = existingProviderMemberships.length;
  const shouldReconcile =
    tenantIds.length > 0 && (existingCount <= 2 || tenantIds.length >= existingCount * 0.8);

  if (shouldReconcile) {
    try {
      await reconcileStaleMemberships(user.id, provider, tenantIds, existingMemberships, context);
    } catch (reconcileError: unknown) {
      logger.warn("Stale membership reconciliation failed (non-fatal)", {
        userId: user.id,
        provider,
        error: getErrorMessage(reconcileError),
        ...context,
      });
    }
  } else {
    logger.warn("Skipping reconciliation: provider returned too few orgs", {
      existingCount,
      received: tenantIds.length,
      provider,
      userId: user.id,
      ...context,
    });
  }

  // Switch to a tenant from the current login provider.
  // If the user's selected tenant belongs to a different provider (e.g. they
  // previously logged in with GitHub and now log in with GitLab), switch to the
  // first tenant from the provider they just authenticated with.
  const { tenantId: currentTenantId } = user;
  const firstProviderTenantId = tenantIds.length > 0 ? tenantIds[0] : null;
  const currentTenantBelongsToProvider =
    currentTenantId !== null && tenantIds.includes(currentTenantId);

  if (firstProviderTenantId !== null && !currentTenantBelongsToProvider) {
    await switchUserOrganization(user.id, firstProviderTenantId);

    logger.info("User selected organization switched to login provider", {
      ...context,
      userId: user.id,
      previousTenantId: currentTenantId,
      selectedTenantId: firstProviderTenantId,
      provider,
    });
  }
};

/**
 * Generate an access/refresh token pair for an authenticated user.
 *
 * Creates a new token family for the refresh token. The raw refresh token
 * is returned to the client; only the SHA-256 hash is stored.
 */
const generateTokenPairImpl = async (
  user: Readonly<{
    readonly id: string;
    readonly tenantId: string | null;
    readonly role: string;
  }>,
  meta: TokenMeta,
  context: RequestContext
): Promise<TokenPair> => {
  const orgRole = user.tenantId ? await findUserOrgRole(user.id, user.tenantId) : null;
  const accessToken = generateAccessToken(
    user as Parameters<typeof generateAccessToken>[0],
    orgRole ?? undefined
  );
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const familyId = crypto.randomUUID();

  await createRefreshToken({
    userId: user.id,
    tokenHash,
    familyId,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  logger.info("Token pair generated", {
    userId: user.id,
    familyId,
    ...context,
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS,
  };
};

/**
 * Rotate a refresh token, returning a new token pair.
 *
 * Implements refresh token rotation with family-based reuse detection:
 * - If the token was already revoked, the entire family is revoked (breach response)
 * - Otherwise the old token is replaced and a new pair is issued
 */
const refreshTokensImpl = async (
  rawToken: string,
  meta: TokenMeta,
  context: RequestContext
): Promise<TokenPair> => {
  const currentHash = hashRefreshToken(rawToken);
  const newRawToken = generateRefreshToken();
  const newHash = hashRefreshToken(newRawToken);

  const rotationResult = await rotateRefreshTokenAtomically({
    tokenHash: currentHash,
    newTokenHash: newHash,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  if (!rotationResult) {
    throw new AuthenticationError("Invalid or expired refresh token", {
      operation: "refreshTokens",
    });
  }

  const { status, oldToken } = rotationResult;

  if (status === "reused") {
    logger.warn("Refresh token reuse detected, family revoked", {
      familyId: oldToken.familyId,
      userId: oldToken.userId,
      ...context,
    });

    throw new AuthenticationError("Refresh token reuse detected", {
      operation: "refreshTokens",
      metadata: { familyId: oldToken.familyId },
    });
  }

  const user = await findUserById(oldToken.userId);

  if (!user) {
    throw new AuthenticationError("User not found for refresh token", {
      operation: "refreshTokens",
    });
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw new AuthenticationError("User account is not active", {
      operation: "refreshTokens",
      metadata: { status: user.status },
    });
  }

  const orgRole = user.tenantId ? await findUserOrgRole(user.id, user.tenantId) : null;
  const accessToken = generateAccessToken(user, orgRole ?? undefined);

  logger.info("Refresh token rotated", {
    userId: user.id,
    familyId: oldToken.familyId,
    ...context,
  });

  return {
    accessToken,
    refreshToken: newRawToken,
    expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS,
  };
};

/**
 * Revoke all tokens in the same family as the given refresh token.
 *
 * Idempotent: silently succeeds if the token is not found (already revoked or expired).
 */
const revokeUserTokensImpl = async (
  rawRefreshToken: string,
  context: RequestContext
): Promise<void> => {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const storedToken = await findRefreshTokenByHash(tokenHash);

  if (!storedToken) {
    return;
  }

  await revokeTokenFamily(storedToken.familyId);

  logger.info("User tokens revoked", {
    userId: storedToken.userId,
    familyId: storedToken.familyId,
    ...context,
  });
};

// ==================== Service Factory ====================

/**
 * Create the authentication service.
 *
 * Returns an object of pure business-logic methods for OAuth login,
 * token management, and user account linking.
 */
export const createAuthService = (): {
  readonly findOrCreateUser: typeof findOrCreateUserImpl;
  readonly autoLinkOrganizations: typeof autoLinkOrganizationsImpl;
  readonly generateTokenPair: typeof generateTokenPairImpl;
  readonly refreshTokens: typeof refreshTokensImpl;
  readonly revokeUserTokens: typeof revokeUserTokensImpl;
} => ({
  findOrCreateUser: (...args) => findOrCreateUserImpl(...args),
  autoLinkOrganizations: (...args) => autoLinkOrganizationsImpl(...args),
  generateTokenPair: (...args) => generateTokenPairImpl(...args),
  refreshTokens: (...args) => refreshTokensImpl(...args),
  revokeUserTokens: (...args) => revokeUserTokensImpl(...args),
});

// ==================== Helpers ====================

/**
 * Maximum serialized size for rawProfile stored in the database.
 * Prevents unbounded external data from bloating the JSONB column.
 * 8 KB is sufficient for standard OAuth profile fields.
 */
const RAW_PROFILE_MAX_BYTES = 8192;

/**
 * Truncate a raw profile object to prevent storing unbounded external data.
 * If the serialized size exceeds the limit, stores a marker indicating truncation.
 */
const sanitizeRawProfile = (rawProfile: Record<string, unknown>): Record<string, unknown> => {
  const serialized = JSON.stringify(rawProfile);
  return serialized.length <= RAW_PROFILE_MAX_BYTES
    ? rawProfile
    : { _truncated: true, _originalSize: serialized.length };
};

/**
 * Find or create a tenant for the given provider and org login.
 * Provider-scoped: a GitHub "acme" and GitLab "acme" are separate tenants.
 */
const findOrCreateTenant = async (
  provider: OAuthProvider,
  orgLogin: string
): Promise<{ readonly tenant: Readonly<{ readonly id: string }>; readonly isNew: boolean }> => {
  const existingTenant = await findByOrgNameAndProvider(orgLogin, provider);
  if (existingTenant) {
    return { tenant: existingTenant, isNew: false };
  }

  const created = await ((): Promise<Readonly<{ readonly id: string }>> => {
    switch (provider) {
      case "github":
        return createFromGitHubLogin(orgLogin);
      case "gitlab":
        return createFromGitLabGroup({ gitlabGroupPath: orgLogin });
      case "bitbucket":
        return createFromBitbucketWorkspace(orgLogin);
      case "azure_devops":
        return createFromAzureDevOpsAccount(orgLogin);
      default:
        return assertUnreachable(provider);
    }
  })();

  return { tenant: created, isNew: true };
};

/**
 * Process a single org membership: find/create tenant, check limits, assign role.
 * Returns the tenant ID (always resolves — limit violations skip membership but track the tenant).
 */
const processOrgMembership = async (
  userId: string,
  provider: OAuthProvider,
  org: Readonly<{ readonly login: string; readonly role?: string }>,
  context: RequestContext
): Promise<string> => {
  const { tenant, isNew } = await findOrCreateTenant(provider, org.login);

  // Check team size limit before adding new memberships.
  // For new tenants, skip the check only if this is the very first member
  // (the tenant creator). For existing tenants, always check.
  const shouldCheckLimit = !isNew || (await countTenantMembers(tenant.id)) > 0;
  if (shouldCheckLimit) {
    const existingMembership = await findUserOrgRole(userId, tenant.id);
    if (!existingMembership) {
      try {
        const limitCheck = await checkPlanLimit(tenant.id, "max_team_members");
        if (!limitCheck.allowed) {
          logger.warn("Team size limit reached, skipping membership", {
            ...context,
            userId,
            tenantId: tenant.id,
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
          });
          return tenant.id;
        }
      } catch (limitError: unknown) {
        // Fail-open: don't block login for plan check failures
        logger.warn("Plan limit check failed, proceeding", {
          ...context,
          userId,
          tenantId: tenant.id,
          error: getErrorMessage(limitError),
        });
      }
    }
  }

  // Map provider role to Kenchi role. For new tenants (first user), ensure
  // at least "admin" so the creator can manage the tenant. The "owner" role
  // is only assigned if the provider explicitly reports an owner-level role
  // (e.g., GitLab "owner"). This prevents privilege escalation where a
  // regular member who signs up first gets unconditional owner access.
  const mappedRole = resolveAutoLinkRole(provider, org.role);
  const memberRole = isNew ? elevateToMinimumAdmin(mappedRole) : mappedRole;
  const membership = await addUserOrganization({
    userId,
    tenantId: tenant.id,
    role: memberRole,
  });

  if (membership === null) {
    logger.error(
      "Failed to create user organization membership — addUserOrganization returned null",
      {
        ...context,
        userId,
        tenantId: tenant.id,
        provider,
        orgLogin: org.login,
        isNew,
      }
    );
  } else {
    logger.info("User organization membership ensured", {
      ...context,
      userId,
      tenantId: tenant.id,
      provider,
      orgLogin: org.login,
    });
  }

  return tenant.id;
};

/**
 * Ensure user has organization memberships for each provider org.
 * For each org, finds or creates the tenant (provider-scoped) and
 * adds the user_organizations record (idempotent).
 *
 * Returns the list of tenant IDs in discovery order.
 */
const ensureOrgMemberships = async (
  userId: string,
  provider: OAuthProvider,
  orgs: ReadonlyArray<{ readonly login: string; readonly role?: string }>,
  context: RequestContext
): Promise<readonly string[]> => {
  // Local mutable accumulator: built sequentially then returned as readonly.
  // push() is used instead of spread to avoid O(n²) array copying per iteration.
  const resolvedIds: string[] = [];

  // for...of: sequential to avoid concurrent tenant creation race conditions
  for (const org of orgs) {
    const tenantId = await processOrgMembership(userId, provider, org, context);
    resolvedIds.push(tenantId);
  }

  return resolvedIds;
};

/**
 * Remove stale organization memberships that no longer match the provider's current orgs.
 *
 * For each DB membership under the same provider that is NOT in `currentTenantIds`,
 * removes the membership (unless the user is the last owner).
 * Non-fatal: errors are logged but do not block the login flow.
 */
const reconcileStaleMemberships = async (
  userId: string,
  provider: OAuthProvider,
  currentTenantIds: readonly string[],
  existingMemberships: ReadonlyArray<
    Readonly<{ readonly provider: string; readonly tenantId: string; readonly role: string }>
  >,
  context: RequestContext
): Promise<void> => {
  const providerMemberships = existingMemberships.filter(
    (membership) => membership.provider === provider
  );
  const activeTenantIdSet: ReadonlySet<string> = new Set(currentTenantIds);

  // for...of: sequential to respect rate limits and maintain ordering of removals
  for (const membership of providerMemberships) {
    if (activeTenantIdSet.has(membership.tenantId)) {
      continue;
    }

    // Last-owner protection: do not remove the last owner of a tenant
    if (membership.role === "owner") {
      const ownerCount = await countOwnersByTenant(membership.tenantId);
      if (ownerCount <= 1) {
        logger.info("Skipping stale membership removal — last owner", {
          ...context,
          userId,
          tenantId: membership.tenantId,
        });
        continue;
      }
    }

    try {
      await removeMemberFromTenant(membership.tenantId, userId);

      // Best-effort audit log
      try {
        await logAuditEvent(
          membership.tenantId,
          AUDIT_ACTIONS.MEMBERSHIP_RECONCILED,
          { userId, provider, reason: "no_longer_in_provider_org" },
          "system"
        );
      } catch {
        // Non-fatal audit log failure — already logged by logAuditEvent
      }

      logger.info("Stale membership removed", {
        ...context,
        userId,
        tenantId: membership.tenantId,
        provider,
      });
    } catch (removeError: unknown) {
      logger.warn("Failed to remove stale membership, continuing", {
        ...context,
        userId,
        tenantId: membership.tenantId,
        provider,
        error: getErrorMessage(removeError),
      });
    }
  }
};

/** Build the UpsertOAuthIdentityInput from OAuth profile and token data. */
const buildUpsertInput = (
  userId: string,
  provider: OAuthProvider,
  profile: OAuthProviderProfile,
  tokens: OAuthTokenResponse,
  instanceUrl: string | null
): UpsertOAuthIdentityInput => ({
  userId,
  provider,
  providerUserId: profile.providerUserId,
  providerUsername: profile.username,
  providerEmail: profile.email,
  providerAvatarUrl: profile.avatarUrl,
  instanceUrl,
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  tokenExpiresAt: tokens.expiresIn === null ? null : new Date(Date.now() + tokens.expiresIn * 1000),
  scopes: tokens.scope.split(/[,\s]+/).filter((scope) => scope.length > 0),
  rawProfile: sanitizeRawProfile(profile.rawProfile),
});
