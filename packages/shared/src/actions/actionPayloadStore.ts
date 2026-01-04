/**
 * Action Payload Store
 *
 * Server-side storage for action button payloads to prevent
 * payload forgery and size limit issues in Slack.
 *
 * Uses short opaque IDs in button values, stores full payloads server-side.
 * Includes TTL-based expiration and verification.
 */

import { createLogger } from "../core/logger.js";
import { ValidationError, NotFoundError } from "../core/errors.js";

const logger = createLogger("action-store");

// ==================== Types ====================

/**
 * Full action payload stored server-side.
 */
export interface StoredActionPayload {
  readonly actionType: string;
  readonly description: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly installationId: number;
  readonly priority: string | number;
  readonly checkRunId?: number;
  readonly createdAt: number;
  readonly createdBy?: string;
  /** Verification token to prevent cross-context attacks */
  readonly verificationToken: string;
}

/**
 * Opaque button value (what goes in Slack button).
 * Kept small to stay within Slack's value size limit.
 */
export interface OpaqueActionValue {
  readonly id: string;
  readonly v: string; // Short verification token
}

/**
 * Verification context for action retrieval.
 */
export interface ActionVerificationContext {
  readonly repository?: string;
  readonly installationId?: number;
}

// ==================== Constants ====================

/** TTL for stored payloads (1 hour) */
const PAYLOAD_TTL_MS = 60 * 60 * 1000;

/** Cleanup interval (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum stored payloads before forced cleanup */
const MAX_STORED_PAYLOADS = 10000;

/** Verification token length */
const VERIFICATION_TOKEN_LENGTH = 8;

// ==================== Store Implementation ====================

interface StoredEntry {
  readonly payload: StoredActionPayload;
  readonly expiresAt: number;
}

/** In-memory store with TTL expiration */
const payloadStore = new Map<string, StoredEntry>();

/** Track if cleanup interval is running */
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Generates a short random ID for action references.
 */
const generateShortId = (): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const segments = [4, 4, 4].map(() =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  );
  return segments.join("-");
};

/**
 * Generates a verification token.
 */
const generateVerificationToken = (): string => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(
    { length: VERIFICATION_TOKEN_LENGTH },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
};

/**
 * Cleans up expired entries from the store.
 */
const cleanupExpiredEntries = (): number => {
  const now = Date.now();
  const expiredIds: string[] = [];

  payloadStore.forEach((entry, id) => {
    if (entry.expiresAt <= now) {
      expiredIds.push(id);
    }
  });

  expiredIds.forEach((id) => payloadStore.delete(id));

  if (expiredIds.length > 0) {
    logger.debug("Cleaned up expired action payloads", { count: expiredIds.length });
  }

  return expiredIds.length;
};

/**
 * Starts the cleanup interval if not already running.
 */
const ensureCleanupInterval = (): void => {
  if (cleanupIntervalId === null) {
    cleanupIntervalId = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
    // Unref to not block process exit
    cleanupIntervalId.unref();
  }
};

// ==================== Public API ====================

/**
 * Stores an action payload and returns an opaque reference.
 *
 * @param payload - The full action payload to store
 * @returns Opaque value to put in Slack button
 */
export const storeActionPayload = (
  payload: Omit<StoredActionPayload, "createdAt" | "verificationToken">
): OpaqueActionValue => {
  ensureCleanupInterval();

  // Force cleanup if store is too large
  if (payloadStore.size >= MAX_STORED_PAYLOADS) {
    cleanupExpiredEntries();
    // If still too large after cleanup, remove oldest entries
    if (payloadStore.size >= MAX_STORED_PAYLOADS) {
      const entriesToRemove = Math.floor(MAX_STORED_PAYLOADS * 0.1);
      const ids = Array.from(payloadStore.keys()).slice(0, entriesToRemove);
      ids.forEach((id) => payloadStore.delete(id));
      logger.warn("Force-removed oldest action payloads", { count: entriesToRemove });
    }
  }

  const id = generateShortId();
  const verificationToken = generateVerificationToken();
  const now = Date.now();

  const storedPayload: StoredActionPayload = {
    ...payload,
    createdAt: now,
    verificationToken,
  };

  payloadStore.set(id, {
    payload: storedPayload,
    expiresAt: now + PAYLOAD_TTL_MS,
  });

  logger.debug("Stored action payload", {
    id,
    actionType: payload.actionType,
    repository: payload.repository,
  });

  return {
    id,
    v: verificationToken.slice(0, 4), // Short verification in button value
  };
};

/**
 * Retrieves and verifies an action payload by its opaque ID.
 *
 * @param opaqueValue - The opaque value from the Slack button
 * @param context - Optional verification context
 * @returns The stored action payload
 * @throws {NotFoundError} If payload not found or expired
 * @throws {ValidationError} If verification fails
 */
export const retrieveActionPayload = (
  opaqueValue: OpaqueActionValue,
  context?: ActionVerificationContext
): StoredActionPayload => {
  const entry = payloadStore.get(opaqueValue.id);

  if (!entry) {
    throw new NotFoundError(`Action payload not found: ${opaqueValue.id}`);
  }

  // Check expiration
  if (entry.expiresAt <= Date.now()) {
    payloadStore.delete(opaqueValue.id);
    throw new NotFoundError(`Action payload expired: ${opaqueValue.id}`);
  }

  // Verify token prefix
  if (!entry.payload.verificationToken.startsWith(opaqueValue.v)) {
    logger.warn("Action verification token mismatch", {
      id: opaqueValue.id,
      expected: entry.payload.verificationToken.slice(0, 4),
      received: opaqueValue.v,
    });
    throw new ValidationError("Action verification failed");
  }

  // Optional context verification
  if (context) {
    if (context.repository && context.repository !== entry.payload.repository) {
      logger.warn("Action repository mismatch", {
        id: opaqueValue.id,
        expected: entry.payload.repository,
        received: context.repository,
      });
      throw new ValidationError("Action context verification failed");
    }
    if (context.installationId && context.installationId !== entry.payload.installationId) {
      logger.warn("Action installation mismatch", {
        id: opaqueValue.id,
        expected: entry.payload.installationId,
        received: context.installationId,
      });
      throw new ValidationError("Action context verification failed");
    }
  }

  return entry.payload;
};

/**
 * Deletes an action payload (after execution or rejection).
 *
 * @param id - The opaque action ID
 * @returns true if deleted, false if not found
 */
export const deleteActionPayload = (id: string): boolean => {
  const deleted = payloadStore.delete(id);
  if (deleted) {
    logger.debug("Deleted action payload", { id });
  }
  return deleted;
};

/**
 * Gets store statistics for monitoring.
 */
export const getActionStoreStats = (): {
  readonly size: number;
  readonly maxSize: number;
  readonly ttlMs: number;
} => ({
  size: payloadStore.size,
  maxSize: MAX_STORED_PAYLOADS,
  ttlMs: PAYLOAD_TTL_MS,
});

/**
 * Clears all stored payloads (for testing).
 */
export const clearActionStore = (): void => {
  payloadStore.clear();
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
};

/**
 * Parses an opaque value from a JSON string (from Slack button value).
 *
 * @param valueString - The JSON string from button value
 * @returns Parsed opaque action value
 * @throws {ValidationError} If parsing fails
 */
export const parseOpaqueActionValue = (valueString: string): OpaqueActionValue => {
  try {
    const parsed = JSON.parse(valueString) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      "v" in parsed &&
      typeof (parsed as OpaqueActionValue).id === "string" &&
      typeof (parsed as OpaqueActionValue).v === "string"
    ) {
      return parsed as OpaqueActionValue;
    }
    throw new ValidationError("Invalid opaque action value format");
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("Failed to parse opaque action value");
  }
};
