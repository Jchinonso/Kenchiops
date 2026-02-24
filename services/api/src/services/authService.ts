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
  // Tenant creation
  createFromGitHubLogin,
  createFromGitLabGroup,
  createFromBitbucketWorkspace,
  createFromAzureDevOpsAccount,
  // Type guards
  assertUnreachable,
  // User organization
  addUserOrganization,
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

  // For GitHub: if no orgs found, use the username as a personal account fallback
  const { length: orgCount } = orgs;
  const effectiveOrgs =
    orgCount === 0 && provider === "github" ? [{ login: providerUsername }] : orgs;

  const tenantIds = await ensureOrgMemberships(user.id, provider, effectiveOrgs, context);

  // If user has no selected org, set the first discovered one
  const { tenantId: currentTenantId } = user;
  const { length: tenantCount } = tenantIds;
  const firstId = tenantCount > 0 ? tenantIds[0] : null;
  if (currentTenantId === null && firstId !== null) {
    await switchUserOrganization(user.id, firstId);

    logger.info("User selected organization set", {
      ...context,
      userId: user.id,
      selectedTenantId: firstId,
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
  const accessToken = generateAccessToken(user as Parameters<typeof generateAccessToken>[0]);
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

  const accessToken = generateAccessToken(user);

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
 * Ensure user has organization memberships for each provider org.
 * For each org, finds or creates the tenant (provider-scoped) and
 * adds the user_organizations record (idempotent).
 *
 * Returns the list of tenant IDs in discovery order.
 */
const ensureOrgMemberships = async (
  userId: string,
  provider: OAuthProvider,
  orgs: ReadonlyArray<{ readonly login: string }>,
  context: RequestContext
): Promise<readonly string[]> => {
  const resolvedIds: string[] = []; // let: accumulator built sequentially to respect rate limits

  // for...of: sequential to avoid concurrent tenant creation race conditions
  for (const org of orgs) {
    const existingTenant = await findByOrgNameAndProvider(org.login, provider);

    const tenant =
      existingTenant ??
      (await (async () => {
        switch (provider) {
          case "github":
            return createFromGitHubLogin(org.login);
          case "gitlab":
            return createFromGitLabGroup({ gitlabGroupPath: org.login });
          case "bitbucket":
            return createFromBitbucketWorkspace(org.login);
          case "azure_devops":
            return createFromAzureDevOpsAccount(org.login);
          default:
            return assertUnreachable(provider);
        }
      })());

    resolvedIds.push(tenant.id);

    // Add user to org (idempotent -- ON CONFLICT DO NOTHING)
    // First user to trigger tenant creation becomes the owner
    await addUserOrganization({
      userId,
      tenantId: tenant.id,
      role: existingTenant ? "member" : "owner",
    });

    logger.info("User organization membership ensured", {
      ...context,
      userId,
      tenantId: tenant.id,
      provider,
      orgLogin: org.login,
    });
  }

  return resolvedIds;
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
