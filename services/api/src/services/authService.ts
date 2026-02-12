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
  updateUserTenant,
  upsertOAuthIdentity,
  // Refresh tokens
  createRefreshToken,
  findRefreshTokenByHash,
  revokeTokenFamily,
  rotateRefreshTokenAtomically,
  // Tenant lookup
  findByGitHubOrg,
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
]);

// ==================== Service Factory ====================

/**
 * Create the authentication service.
 *
 * Returns an object of pure business-logic methods for OAuth login,
 * token management, and user account linking.
 */
export const createAuthService = () => ({
  /**
   * Look up or create a user from an OAuth provider profile.
   *
   * Resolution order:
   * 1. Match by existing OAuth identity (provider + providerUserId + instanceUrl)
   * 2. Match by verified email for account linking
   * 3. Create a new user
   */
  findOrCreateUser: async (
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

    // Attempt account linking by email
    const emailMatch = profile.email ? await findUserByEmail(profile.email) : null;

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
  },

  /**
   * Auto-link a user to a tenant based on their OAuth provider organizations.
   *
   * Only runs for providers that expose organization APIs (GitHub, GitLab).
   * Skips silently if the user already has a tenant assignment.
   */
  autoLinkTenant: async (
    user: Readonly<{ readonly id: string; readonly tenantId: string | null }>,
    provider: OAuthProvider,
    accessToken: string,
    instanceUrl: string | null,
    context: RequestContext
  ): Promise<void> => {
    if (!ORG_CAPABLE_PROVIDERS.has(provider)) {
      return;
    }

    if (user.tenantId !== null) {
      return;
    }

    const adapter = getOAuthAdapter(provider);
    const orgs = await adapter.getUserOrganizations(accessToken, instanceUrl, context);

    // for...of: early-exit on first tenant match
    for (const org of orgs) {
      const tenant = await findByGitHubOrg(org.login);

      if (tenant) {
        await updateUserTenant(user.id, tenant.id);

        logger.info("User auto-linked to tenant", {
          ...context,
          userId: user.id,
          linkedTenantId: tenant.id,
          provider,
          orgLogin: org.login,
        });

        return;
      }
    }
  },

  /**
   * Generate an access/refresh token pair for an authenticated user.
   *
   * Creates a new token family for the refresh token. The raw refresh token
   * is returned to the client; only the SHA-256 hash is stored.
   */
  generateTokenPair: async (
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
  },

  /**
   * Rotate a refresh token, returning a new token pair.
   *
   * Implements refresh token rotation with family-based reuse detection:
   * - If the token was already revoked, the entire family is revoked (breach response)
   * - Otherwise the old token is replaced and a new pair is issued
   */
  refreshTokens: async (
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
  },

  /**
   * Revoke all tokens in the same family as the given refresh token.
   *
   * Idempotent: silently succeeds if the token is not found (already revoked or expired).
   */
  revokeUserTokens: async (rawRefreshToken: string, context: RequestContext): Promise<void> => {
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
  },
});

// ==================== Helpers ====================

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
  tokenExpiresAt: tokens.expiresIn !== null ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
  scopes: tokens.scope.split(/[,\s]+/).filter((scope) => scope.length > 0),
  rawProfile: profile.rawProfile,
});
