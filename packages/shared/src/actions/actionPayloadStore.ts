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
import { TIME_CONSTANTS } from "../constants/index.js";
import type {
  StoredActionPayload,
  OpaqueActionValue,
  ActionVerificationContext,
  ActionStoreStats,
} from "./actionTypes.js";

// Re-export types for backwards compatibility
export type {
  StoredActionPayload,
  OpaqueActionValue,
  ActionVerificationContext,
  ActionStoreStats,
} from "./actionTypes.js";

const logger = createLogger("action-store");

// ==================== Constants ====================

const PAYLOAD_TTL_MS = TIME_CONSTANTS.MILLISECONDS_PER_HOUR;
const CLEANUP_INTERVAL_MS = TIME_CONSTANTS.MILLISECONDS_PER_MINUTE * 5;
const MAX_STORED_PAYLOADS = 10000;
const EVICTION_PERCENTAGE = 0.1;
const VERIFICATION_TOKEN_LENGTH = 8;
const VERIFICATION_PREFIX_LENGTH = 4;
const SHORT_ID_SEGMENT_COUNT = 3;
const SHORT_ID_SEGMENT_LENGTH = 4;

const ALPHANUMERIC_LOWER = "abcdefghijklmnopqrstuvwxyz0123456789";
const ALPHANUMERIC_MIXED = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// ==================== Store Implementation ====================

interface StoredEntry {
  readonly payload: StoredActionPayload;
  readonly expiresAt: number;
}

const payloadStore = new Map<string, StoredEntry>();
let cleanupIntervalId: NodeJS.Timeout | null = null;

/** Generates random string from given character set. */
const randomString = (length: number, chars: string): string =>
  Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

/** Generates a short random ID (format: xxxx-xxxx-xxxx). */
const generateShortId = (): string =>
  Array.from({ length: SHORT_ID_SEGMENT_COUNT }, () =>
    randomString(SHORT_ID_SEGMENT_LENGTH, ALPHANUMERIC_LOWER)
  ).join("-");

/** Generates a verification token. */
const generateVerificationToken = (): string =>
  randomString(VERIFICATION_TOKEN_LENGTH, ALPHANUMERIC_MIXED);

/** Removes expired entries from the store and returns count removed. */
const cleanupExpiredEntries = (): number => {
  const now = Date.now();
  const expiredIds = [...payloadStore.entries()]
    .filter(([, entry]) => entry.expiresAt <= now)
    .map(([id]) => id);

  if (expiredIds.length === 0) {
    return 0;
  }

  expiredIds.forEach((entryId) => payloadStore.delete(entryId));
  logger.debug("Cleaned up expired action payloads", { count: expiredIds.length });

  return expiredIds.length;
};

/** Starts the cleanup interval if not already running. */
const ensureCleanupInterval = (): void => {
  if (cleanupIntervalId !== null) {
    return;
  }

  cleanupIntervalId = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
  cleanupIntervalId.unref(); // Don't block process exit
};

// ==================== Public API ====================

/** Deletes entries from store by IDs. */
const deleteEntries = (ids: readonly string[]): void => {
  ids.forEach((id) => payloadStore.delete(id));
};

/** Removes oldest entries when store exceeds capacity. */
const evictOldestEntries = (): void => {
  cleanupExpiredEntries();

  if (payloadStore.size < MAX_STORED_PAYLOADS) {
    return;
  }

  const entriesToRemove = Math.floor(MAX_STORED_PAYLOADS * EVICTION_PERCENTAGE);
  const idsToRemove = [...payloadStore.keys()].slice(0, entriesToRemove);
  deleteEntries(idsToRemove);
  logger.warn("Force-removed oldest action payloads", { count: entriesToRemove });
};

/** Stores an action payload and returns an opaque reference for Slack buttons. */
export const storeActionPayload = (
  payload: Omit<StoredActionPayload, "createdAt" | "verificationToken">
): OpaqueActionValue => {
  ensureCleanupInterval();

  if (payloadStore.size >= MAX_STORED_PAYLOADS) {
    evictOldestEntries();
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

  return { id, v: verificationToken.slice(0, VERIFICATION_PREFIX_LENGTH) };
};

/** Verification rule for action retrieval validation. */
interface VerificationRule {
  readonly check: (
    entry: StoredEntry,
    opaqueValue: OpaqueActionValue,
    context?: ActionVerificationContext
  ) => boolean;
  readonly onFail: (
    entry: StoredEntry,
    opaqueValue: OpaqueActionValue,
    context?: ActionVerificationContext
  ) => never;
}

/** Logs verification failure and throws ValidationError. */
const failContextVerification = (
  logMessage: string,
  opaqueValueId: string,
  expected: unknown,
  received: unknown
): never => {
  logger.warn(logMessage, { id: opaqueValueId, expected, received });
  throw new ValidationError("Action context verification failed");
};

const VERIFICATION_RULES: readonly VerificationRule[] = [
  {
    check: (entry) => entry.expiresAt <= Date.now(),
    onFail: (_entry, opaqueValue) => {
      payloadStore.delete(opaqueValue.id);
      throw new NotFoundError(`Action payload expired: ${opaqueValue.id}`);
    },
  },
  {
    check: (entry, opaqueValue) => !entry.payload.verificationToken.startsWith(opaqueValue.v),
    onFail: (entry, opaqueValue) => {
      logger.warn("Action verification token mismatch", {
        id: opaqueValue.id,
        expected: entry.payload.verificationToken.slice(0, VERIFICATION_PREFIX_LENGTH),
        received: opaqueValue.v,
      });
      throw new ValidationError("Action verification failed");
    },
  },
  {
    check: (entry, _opaqueValue, context) =>
      Boolean(context?.repository && context.repository !== entry.payload.repository),
    onFail: (entry, opaqueValue, context) =>
      failContextVerification(
        "Action repository mismatch",
        opaqueValue.id,
        entry.payload.repository,
        context?.repository
      ),
  },
  {
    check: (entry, _opaqueValue, context) =>
      Boolean(context?.installationId && context.installationId !== entry.payload.installationId),
    onFail: (entry, opaqueValue, context) =>
      failContextVerification(
        "Action installation mismatch",
        opaqueValue.id,
        entry.payload.installationId,
        context?.installationId
      ),
  },
];

/**
 * Retrieves and verifies an action payload by its opaque ID.
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

  const failedRule = VERIFICATION_RULES.find((rule) => rule.check(entry, opaqueValue, context));
  if (failedRule) {
    failedRule.onFail(entry, opaqueValue, context);
  }

  return entry.payload;
};

/** Deletes an action payload (after execution or rejection). */
export const deleteActionPayload = (id: string): boolean => {
  const deleted = payloadStore.delete(id);
  if (deleted) {
    logger.debug("Deleted action payload", { id });
  }
  return deleted;
};

/** Returns store statistics for monitoring. */
export const getActionStoreStats = (): ActionStoreStats => ({
  size: payloadStore.size,
  maxSize: MAX_STORED_PAYLOADS,
  ttlMs: PAYLOAD_TTL_MS,
});

/** Clears all stored payloads and stops cleanup interval (for testing). */
export const clearActionStore = (): void => {
  payloadStore.clear();
  if (cleanupIntervalId === null) {
    return;
  }

  clearInterval(cleanupIntervalId);
  cleanupIntervalId = null;
};

/** Type guard for OpaqueActionValue. */
const isOpaqueActionValue = (value: unknown): value is OpaqueActionValue => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.v === "string";
};

/**
 * Parses an opaque value from a JSON string (from Slack button value).
 * @throws {ValidationError} If parsing fails or format is invalid
 */
export const parseOpaqueActionValue = (valueString: string): OpaqueActionValue => {
  try {
    const parsed: unknown = JSON.parse(valueString);
    if (isOpaqueActionValue(parsed)) {
      return parsed;
    }
    throw new ValidationError("Invalid opaque action value format");
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("Failed to parse opaque action value");
  }
};
