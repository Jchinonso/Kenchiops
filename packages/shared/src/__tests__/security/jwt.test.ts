/**
 * Unit tests for security/jwt.ts
 *
 * Tests JWT access token generation/verification and refresh token
 * generation/hashing. Covers happy paths, error paths, and edge cases
 * for all four exported functions.
 */

// Set env var BEFORE any imports — config caches process.env at load time
const TEST_JWT_SECRET = "test-jwt-secret-that-is-long-enough-for-testing-purposes";
// eslint-disable-next-line no-restricted-syntax -- Must set env before config module loads in tests
process.env.JWT_SECRET = TEST_JWT_SECRET;

import { describe, it, expect } from "@jest/globals";
import jwt from "jsonwebtoken";
import type { User } from "../../database/user/types.js";
import { JWT_CONFIG, AUTH_DEFAULTS } from "../../constants/auth.js";

import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../../security/jwt.js";

// ==================== Test Fixtures ====================

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: "usr_test-user-123",
  tenantId: "tenant-abc",
  email: "test@example.com",
  displayName: "Test User",
  avatarUrl: "https://example.com/avatar.png",
  role: "member",
  status: "active",
  lastLoginAt: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

// ==================== Tests ====================

describe("security/jwt", () => {
  describe("generateAccessToken", () => {
    it("should create a valid JWT with correct claims", () => {
      const user = createTestUser();
      const token = generateAccessToken(user);

      // Decode without verification to inspect claims
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded).not.toBeNull();
      expect(decoded!.header.alg).toBe(JWT_CONFIG.ALGORITHM);

      const payload = decoded!.payload as Record<string, unknown>;
      expect(payload.sub).toBe(user.id);
      expect(payload.tid).toBe(user.tenantId);
      expect(payload.role).toBe(user.role);
      expect(payload.iss).toBe(JWT_CONFIG.ISSUER);
      expect(payload.aud).toBe(JWT_CONFIG.AUDIENCE);
    });

    it("should include a unique jti claim (UUID)", () => {
      const user = createTestUser();
      const token1 = generateAccessToken(user);
      const token2 = generateAccessToken(user);

      const decoded1 = jwt.decode(token1) as Record<string, unknown>;
      const decoded2 = jwt.decode(token2) as Record<string, unknown>;

      expect(decoded1.jti).toBeDefined();
      expect(typeof decoded1.jti).toBe("string");
      expect(decoded1.jti).not.toBe(decoded2.jti);
    });

    it("should include iat and exp claims", () => {
      const user = createTestUser();
      const token = generateAccessToken(user);

      const decoded = jwt.decode(token) as Record<string, unknown>;

      expect(typeof decoded.iat).toBe("number");
      expect(typeof decoded.exp).toBe("number");
      // exp should be after iat
      expect(decoded.exp as number).toBeGreaterThan(decoded.iat as number);
    });

    it("should produce a verifiable token using the configured secret", () => {
      const user = createTestUser();
      const token = generateAccessToken(user);

      // Should not throw when verified with the correct secret
      const payload = jwt.verify(token, TEST_JWT_SECRET, {
        issuer: JWT_CONFIG.ISSUER,
        audience: JWT_CONFIG.AUDIENCE,
        algorithms: [JWT_CONFIG.ALGORITHM],
      });

      expect(payload).toBeDefined();
    });

    it("should handle a user with null tenantId", () => {
      const user = createTestUser({ tenantId: null });
      const token = generateAccessToken(user);

      const decoded = jwt.decode(token) as Record<string, unknown>;
      expect(decoded.tid).toBeNull();
    });

    it("should handle different user roles", () => {
      const roles = ["owner", "admin", "member", "viewer"] as const;

      roles.forEach((role) => {
        const user = createTestUser({ role });
        const token = generateAccessToken(user);
        const decoded = jwt.decode(token) as Record<string, unknown>;
        expect(decoded.role).toBe(role);
      });
    });
  });

  describe("verifyAccessToken", () => {
    it("should return AuthenticatedUser for a valid token", () => {
      const user = createTestUser();
      const token = generateAccessToken(user);

      const result = verifyAccessToken(token);

      expect(result.userId).toBe(user.id);
      expect(result.tenantId).toBe(user.tenantId);
      expect(result.role).toBe(user.role);
      expect(typeof result.tokenId).toBe("string");
      expect(result.tokenId.length).toBeGreaterThan(0);
    });

    it("should return correct shape for user with null tenantId", () => {
      const user = createTestUser({ tenantId: null });
      const token = generateAccessToken(user);

      const result = verifyAccessToken(token);

      expect(result.tenantId).toBeNull();
    });

    it("should throw AuthenticationError for an expired token", () => {
      const user = createTestUser();

      // Create a token that is already expired
      const expiredToken = jwt.sign(
        {
          sub: user.id,
          tid: user.tenantId,
          role: user.role,
          jti: "test-jti",
        },
        TEST_JWT_SECRET,
        {
          expiresIn: -10, // Already expired
          issuer: JWT_CONFIG.ISSUER,
          audience: JWT_CONFIG.AUDIENCE,
          algorithm: JWT_CONFIG.ALGORITHM,
        }
      );

      expect(() => verifyAccessToken(expiredToken)).toThrow("Access token expired");
    });

    it("should throw AuthenticationError with correct error type for expired token", () => {
      const user = createTestUser();

      const expiredToken = jwt.sign(
        { sub: user.id, tid: user.tenantId, role: user.role, jti: "test-jti" },
        TEST_JWT_SECRET,
        {
          expiresIn: -10,
          issuer: JWT_CONFIG.ISSUER,
          audience: JWT_CONFIG.AUDIENCE,
          algorithm: JWT_CONFIG.ALGORITHM,
        }
      );

      try {
        verifyAccessToken(expiredToken);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).toBe("AuthenticationError");
        expect((error as Error).message).toBe("Access token expired");
      }
    });

    it("should throw AuthenticationError for a tampered token", () => {
      const user = createTestUser();
      const token = generateAccessToken(user);

      // Tamper with the token by modifying a character in the signature
      const parts = token.split(".");
      const tamperedSignature = parts[2]!.slice(0, -2) + "XX";
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

      expect(() => verifyAccessToken(tamperedToken)).toThrow("Invalid access token");
    });

    it("should throw AuthenticationError for a token signed with a different secret", () => {
      const user = createTestUser();
      const wrongSecretToken = jwt.sign(
        { sub: user.id, tid: user.tenantId, role: user.role, jti: "test-jti" },
        "completely-different-secret",
        {
          expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY,
          issuer: JWT_CONFIG.ISSUER,
          audience: JWT_CONFIG.AUDIENCE,
          algorithm: JWT_CONFIG.ALGORITHM,
        }
      );

      expect(() => verifyAccessToken(wrongSecretToken)).toThrow("Invalid access token");
    });

    it("should throw AuthenticationError for a token with wrong issuer", () => {
      const user = createTestUser();
      const wrongIssuerToken = jwt.sign(
        { sub: user.id, tid: user.tenantId, role: user.role, jti: "test-jti" },
        TEST_JWT_SECRET,
        {
          expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY,
          issuer: "wrong-issuer",
          audience: JWT_CONFIG.AUDIENCE,
          algorithm: JWT_CONFIG.ALGORITHM,
        }
      );

      expect(() => verifyAccessToken(wrongIssuerToken)).toThrow("Invalid access token");
    });

    it("should throw AuthenticationError for a token with wrong audience", () => {
      const user = createTestUser();
      const wrongAudienceToken = jwt.sign(
        { sub: user.id, tid: user.tenantId, role: user.role, jti: "test-jti" },
        TEST_JWT_SECRET,
        {
          expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY,
          issuer: JWT_CONFIG.ISSUER,
          audience: "wrong-audience",
          algorithm: JWT_CONFIG.ALGORITHM,
        }
      );

      expect(() => verifyAccessToken(wrongAudienceToken)).toThrow("Invalid access token");
    });

    it("should throw AuthenticationError for a malformed token string", () => {
      expect(() => verifyAccessToken("not-a-valid-jwt")).toThrow("Invalid access token");
    });

    it("should throw AuthenticationError for an empty string", () => {
      expect(() => verifyAccessToken("")).toThrow("Invalid access token");
    });

    it("should throw AuthenticationError for a token with an unsupported algorithm", () => {
      const differentAlgToken = jwt.sign(
        { sub: "user-123", tid: "tenant", role: "member", jti: "test-jti" },
        TEST_JWT_SECRET,
        {
          expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY,
          issuer: JWT_CONFIG.ISSUER,
          audience: JWT_CONFIG.AUDIENCE,
          algorithm: "HS384",
        }
      );

      expect(() => verifyAccessToken(differentAlgToken)).toThrow("Invalid access token");
    });
  });

  describe("generateRefreshToken", () => {
    it("should produce a URL-safe base64 string", () => {
      const token = generateRefreshToken();

      // base64url uses only A-Z, a-z, 0-9, -, _
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should produce a string of consistent length based on REFRESH_TOKEN_BYTES", () => {
      // base64url encoding of N bytes produces ceil(N * 4/3) characters without padding
      const expectedLength = Math.ceil((AUTH_DEFAULTS.REFRESH_TOKEN_BYTES * 4) / 3);

      const token = generateRefreshToken();
      expect(token.length).toBe(expectedLength);
    });

    it("should produce unique tokens on each call", () => {
      const tokens = new Set(Array.from({ length: 50 }, () => generateRefreshToken()));

      // All 50 tokens should be distinct
      expect(tokens.size).toBe(50);
    });

    it("should produce a non-empty string", () => {
      const token = generateRefreshToken();
      expect(token.length).toBeGreaterThan(0);
    });
  });

  describe("hashRefreshToken", () => {
    it("should produce a consistent SHA-256 hex hash for the same input", () => {
      const token = "test-refresh-token-value";

      const hash1 = hashRefreshToken(token);
      const hash2 = hashRefreshToken(token);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = hashRefreshToken("token-a");
      const hash2 = hashRefreshToken("token-b");

      expect(hash1).not.toBe(hash2);
    });

    it("should produce a 64-character hex string (SHA-256 = 256 bits = 64 hex chars)", () => {
      const hash = hashRefreshToken("any-token-value");

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle an empty string input", () => {
      const hash = hashRefreshToken("");

      // SHA-256 of empty string is well-known
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("should handle a very long input", () => {
      const longToken = "x".repeat(10_000);
      const hash = hashRefreshToken(longToken);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should not return the original token (is a one-way hash)", () => {
      const token = "my-secret-refresh-token";
      const hash = hashRefreshToken(token);

      expect(hash).not.toContain(token);
      expect(hash).not.toBe(token);
    });
  });
});
