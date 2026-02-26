/**
 * JWT Token Utilities
 *
 * Generation and verification of access tokens (JWT) and refresh tokens (random).
 * Access tokens are short-lived JWTs with user claims.
 * Refresh tokens are cryptographically random strings stored as SHA-256 hashes.
 *
 * @module security/jwt
 */

import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { AuthenticationError } from "../core/errors.js";
import { config } from "../core/config.js";
import { JWT_CONFIG, AUTH_DEFAULTS } from "../constants/index.js";
import type { User, AuthenticatedUser, JWTPayload, UserRole } from "../database/user/types.js";

// ==================== Secret Management ====================

/** Minimum length for JWT_SECRET (32 chars = 256 bits of entropy) */
const MIN_JWT_SECRET_LENGTH = 32;

const getSecret = (): string => {
  const secret = config.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new AuthenticationError("JWT_SECRET environment variable is not configured", {
      operation: "getSecret",
    });
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new AuthenticationError(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`,
      { operation: "getSecret" }
    );
  }
  return secret;
};

// ==================== Access Token (JWT) ====================

export const generateAccessToken = (user: User, roleOverride?: UserRole): string =>
  jwt.sign(
    {
      sub: user.id,
      tid: user.tenantId,
      role: roleOverride ?? user.role,
      jti: crypto.randomUUID(),
    },
    getSecret(),
    {
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY,
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE,
      algorithm: JWT_CONFIG.ALGORITHM,
    }
  );

export const verifyAccessToken = (token: string): AuthenticatedUser => {
  try {
    const payload = jwt.verify(token, getSecret(), {
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE,
      algorithms: [JWT_CONFIG.ALGORITHM],
    }) as JWTPayload;

    return {
      userId: payload.sub,
      tenantId: payload.tid,
      role: payload.role,
      tokenId: payload.jti,
    };
  } catch (error) {
    const message =
      error instanceof jwt.TokenExpiredError ? "Access token expired" : "Invalid access token";

    throw new AuthenticationError(message, {
      operation: "verifyAccessToken",
    });
  }
};

// ==================== Refresh Token (Random) ====================

export const generateRefreshToken = (): string =>
  crypto.randomBytes(AUTH_DEFAULTS.REFRESH_TOKEN_BYTES).toString("base64url");

export const hashRefreshToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");
