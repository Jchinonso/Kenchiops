/**
 * Action Payload Store
 *
 * Server-side storage for action button payloads to prevent
 * payload forgery and size limit issues in Slack.
 *
 * Uses short opaque IDs in button values, stores full payloads server-side.
 * Includes TTL-based expiration and verification.
 *
 * @module actions/actionPayloadStore
 */

import { createLogger } from "../core/logger.js";
import { ValidationError, NotFoundError } from "../core/errors.js";
import { ACTION_STORE_CONFIG, ACTION_TOKEN_CONFIG, ACTION_CHAR_SETS } from "../constants/index.js";
import type {
  StoredActionPayload,
  OpaqueActionValue,
  ActionVerificationContext,
  ActionStoreStats,
  StoredEntry,
  VerificationRule,
  ParseResult,
} from "./types.js";

const logger = createLogger("action-store");

// ==================== Store State ====================

const payloadStore = new Map<string, StoredEntry>();
let cleanupIntervalId: NodeJS.Timeout | null = null;

// ==================== Random Generation ====================

/** Generates random string from given character set */
const generateRandomString = (length: number, charSet: string): string =>
  Array.from({ length }, () => charSet[Math.floor(Math.random() * charSet.length)]).join("");

/** Generates a short random ID (format: xxxx-xxxx-xxxx) */
const generateShortId = (): string =>
  Array.from({ length: ACTION_TOKEN_CONFIG.SEGMENT_COUNT }, () =>
    generateRandomString(ACTION_TOKEN_CONFIG.SEGMENT_LENGTH, ACTION_CHAR_SETS.LOWER)
  ).join("-");

/** Generates a verification token */
const generateVerificationToken = (): string =>
  generateRandomString(ACTION_TOKEN_CONFIG.VERIFICATION_LENGTH, ACTION_CHAR_SETS.MIXED);

// ==================== Store Maintenance ====================

/** Deletes multiple entries from the store by their IDs */
const deleteEntriesById = (entryIds: readonly string[]): number =>
  entryIds.filter((entryId) => payloadStore.delete(entryId)).length;

/** Removes expired entries from the store and returns count removed */
const cleanupExpiredEntries = (): number => {
  const now = Date.now();
  const expiredIds = [...payloadStore.entries()]
    .filter(([, storedEntry]) => storedEntry.expiresAt <= now)
    .map(([entryId]) => entryId);

  if (expiredIds.length === 0) {
    return 0;
  }

  const deletedCount = deleteEntriesById(expiredIds);
  logger.debug("Cleaned up expired action payloads", { count: deletedCount });

  return deletedCount;
};

/** Starts the cleanup interval if not already running */
const ensureCleanupInterval = (): void => {
  if (cleanupIntervalId !== null) {
    return;
  }

  cleanupIntervalId = setInterval(cleanupExpiredEntries, ACTION_STORE_CONFIG.CLEANUP_INTERVAL_MS);
  cleanupIntervalId.unref();
};

/** Removes oldest entries when store exceeds capacity */
const evictOldestEntries = (): void => {
  cleanupExpiredEntries();

  if (payloadStore.size < ACTION_STORE_CONFIG.MAX_PAYLOADS) {
    return;
  }

  const evictionCount = Math.floor(
    ACTION_STORE_CONFIG.MAX_PAYLOADS * ACTION_STORE_CONFIG.EVICTION_RATIO
  );
  const idsToEvict = [...payloadStore.keys()].slice(0, evictionCount);
  deleteEntriesById(idsToEvict);

  logger.warn("Force-removed oldest action payloads", { count: evictionCount });
};

// ==================== Verification ====================

/** Throws NotFoundError for expired payloads */
const handleExpiredPayload = (opaqueValue: OpaqueActionValue): never => {
  payloadStore.delete(opaqueValue.id);
  throw new NotFoundError(`Action payload expired: ${opaqueValue.id}`);
};

/** Throws ValidationError for token mismatch */
const handleTokenMismatch = (storedEntry: StoredEntry, opaqueValue: OpaqueActionValue): never => {
  logger.warn("Action verification token mismatch", {
    id: opaqueValue.id,
    expected: storedEntry.payload.verificationToken.slice(0, ACTION_TOKEN_CONFIG.PREFIX_LENGTH),
    received: opaqueValue.v,
  });
  throw new ValidationError("Action verification failed");
};

/** Throws ValidationError for context mismatch */
const handleContextMismatch = (
  fieldName: string,
  opaqueValueId: string,
  expected: unknown,
  received: unknown
): never => {
  logger.warn(`Action ${fieldName} mismatch`, { id: opaqueValueId, expected, received });
  throw new ValidationError("Action context verification failed");
};

/** Verification rules applied in order */
const VERIFICATION_RULES: readonly VerificationRule[] = [
  {
    shouldReject: (storedEntry) => storedEntry.expiresAt <= Date.now(),
    reject: (_storedEntry, opaqueValue): never => handleExpiredPayload(opaqueValue),
  },
  {
    shouldReject: (storedEntry, opaqueValue) =>
      !storedEntry.payload.verificationToken.startsWith(opaqueValue.v),
    reject: (storedEntry, opaqueValue): never => handleTokenMismatch(storedEntry, opaqueValue),
  },
  {
    shouldReject: (storedEntry, _opaqueValue, context) =>
      Boolean(context?.repository && context.repository !== storedEntry.payload.repository),
    reject: (storedEntry, opaqueValue, context): never =>
      handleContextMismatch(
        "repository",
        opaqueValue.id,
        storedEntry.payload.repository,
        context?.repository
      ),
  },
  {
    shouldReject: (storedEntry, _opaqueValue, context) =>
      Boolean(
        context?.installationId && context.installationId !== storedEntry.payload.installationId
      ),
    reject: (storedEntry, opaqueValue, context): never =>
      handleContextMismatch(
        "installationId",
        opaqueValue.id,
        storedEntry.payload.installationId,
        context?.installationId
      ),
  },
];

/** Applies all verification rules, throws on first failure */
const verifyPayload = (
  storedEntry: StoredEntry,
  opaqueValue: OpaqueActionValue,
  context?: ActionVerificationContext
): void => {
  const failedRule = VERIFICATION_RULES.find((rule) =>
    rule.shouldReject(storedEntry, opaqueValue, context)
  );

  if (failedRule) {
    failedRule.reject(storedEntry, opaqueValue, context);
  }
};

// ==================== Type Guards ====================

/** Type guard for OpaqueActionValue */
const isOpaqueActionValue = (value: unknown): value is OpaqueActionValue => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.v === "string";
};

/** Safely parses JSON without throwing */
const safeJsonParse = (jsonString: string): ParseResult<unknown> => {
  try {
    return { success: true, data: JSON.parse(jsonString) };
  } catch {
    return { success: false };
  }
};

// ==================== Public API ====================

/**
 * Stores an action payload and returns an opaque reference for Slack buttons.
 *
 * @param payload - The action payload to store
 * @returns Opaque value containing short ID and verification prefix
 */
export const storeActionPayload = (
  payload: Omit<StoredActionPayload, "createdAt" | "verificationToken">
): OpaqueActionValue => {
  ensureCleanupInterval();

  if (payloadStore.size >= ACTION_STORE_CONFIG.MAX_PAYLOADS) {
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
    expiresAt: now + ACTION_STORE_CONFIG.PAYLOAD_TTL_MS,
  });

  logger.debug("Stored action payload", {
    id,
    actionType: payload.actionType,
    repository: payload.repository,
  });

  return { id, v: verificationToken.slice(0, ACTION_TOKEN_CONFIG.PREFIX_LENGTH) };
};

/**
 * Retrieves and verifies an action payload by its opaque ID.
 *
 * @param opaqueValue - The opaque reference from a Slack button
 * @param context - Optional verification context for additional checks
 * @returns The stored action payload
 * @throws {NotFoundError} If payload not found or expired
 * @throws {ValidationError} If verification fails
 */
export const retrieveActionPayload = (
  opaqueValue: OpaqueActionValue,
  context?: ActionVerificationContext
): StoredActionPayload => {
  const storedEntry = payloadStore.get(opaqueValue.id);

  if (!storedEntry) {
    throw new NotFoundError(`Action payload not found: ${opaqueValue.id}`);
  }

  verifyPayload(storedEntry, opaqueValue, context);

  return storedEntry.payload;
};

/**
 * Deletes an action payload after execution or rejection.
 *
 * @param id - The payload ID to delete
 * @returns True if deleted, false if not found
 */
export const deleteActionPayload = (id: string): boolean => {
  const deleted = payloadStore.delete(id);

  if (deleted) {
    logger.debug("Deleted action payload", { id });
  }

  return deleted;
};

/**
 * Returns store statistics for monitoring.
 */
export const getActionStoreStats = (): ActionStoreStats => ({
  size: payloadStore.size,
  maxSize: ACTION_STORE_CONFIG.MAX_PAYLOADS,
  ttlMs: ACTION_STORE_CONFIG.PAYLOAD_TTL_MS,
});

/**
 * Clears all stored payloads and stops cleanup interval.
 * For testing purposes only.
 */
export const clearActionStore = (): void => {
  payloadStore.clear();

  if (cleanupIntervalId === null) {
    return;
  }

  clearInterval(cleanupIntervalId);
  cleanupIntervalId = null;
};

/**
 * Parses an opaque value from a JSON string (from Slack button value).
 *
 * @param valueString - JSON string containing the opaque value
 * @returns Parsed opaque action value
 * @throws {ValidationError} If parsing fails or format is invalid
 */
export const parseOpaqueActionValue = (valueString: string): OpaqueActionValue => {
  const parseResult = safeJsonParse(valueString);

  if (!parseResult.success) {
    throw new ValidationError("Failed to parse opaque action value");
  }

  if (!isOpaqueActionValue(parseResult.data)) {
    throw new ValidationError("Invalid opaque action value format");
  }

  return parseResult.data;
};
