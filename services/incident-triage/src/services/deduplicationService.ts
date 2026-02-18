/**
 * Deduplication Service
 *
 * Factory function that creates a dedup service for checking whether
 * incoming alerts are duplicates of recently seen alerts within a
 * configurable time window.
 *
 * @module services/deduplicationService
 */

import { createLogger, type RequestContext } from "@kenchi/shared";
import type {
  DedupCheckResult,
  DedupRepositoryPort,
  DeduplicationService,
} from "../types/severityTypes.js";
import { DEDUP_WINDOW_MINUTES } from "../constants/triageConstants.js";

/** Milliseconds per minute for window calculation */
const MS_PER_MINUTE = 60_000;

/**
 * Creates a deduplication service with injected repository dependencies.
 *
 * @param repo - Port interface for dedup repository operations
 * @returns Service object with checkDuplicate and registerAlert methods
 */
export const createDeduplicationService = (repo: DedupRepositoryPort): DeduplicationService => {
  const logger = createLogger("dedup-service");

  return {
    /**
     * Checks whether an alert with the given fingerprint is a duplicate
     * of a recently processed alert within the dedup window.
     *
     * @param fingerprint - The alert fingerprint hash
     * @param tenantId - The tenant identifier
     * @param context - Request context for logging
     * @returns Whether this is a duplicate and the existing alert ID if so
     */
    checkDuplicate: async (
      fingerprint: string,
      tenantId: string,
      context: RequestContext
    ): Promise<DedupCheckResult> => {
      if (!fingerprint) {
        logger.debug("No fingerprint provided, skipping dedup check", {
          ...context,
        });
        return { isDuplicate: false };
      }

      const existing = await repo.findByFingerprint(fingerprint, tenantId);

      if (!existing) {
        logger.debug("No existing dedup entry found", {
          fingerprint,
          ...context,
        });
        return { isDuplicate: false };
      }

      const now = new Date();
      const isExpired = existing.expiresAt <= now;

      if (isExpired) {
        logger.debug("Dedup entry found but expired", {
          fingerprint,
          existingAlertId: existing.alertId,
          ...context,
        });
        return { isDuplicate: false };
      }

      logger.info("Duplicate alert detected", {
        fingerprint,
        existingAlertId: existing.alertId,
        ...context,
      });

      return {
        isDuplicate: true,
        existingAlertId: existing.alertId,
      };
    },

    /**
     * Registers an alert fingerprint in the dedup window so that
     * future alerts with the same fingerprint are flagged as duplicates.
     *
     * @param fingerprint - The alert fingerprint hash
     * @param tenantId - The tenant identifier
     * @param alertId - The alert ID that owns this dedup window
     * @param windowMinutes - Dedup window duration in minutes (default: 30)
     * @param context - Request context for logging
     */
    registerAlert: async (
      fingerprint: string,
      tenantId: string,
      alertId: string,
      windowMinutes: number = DEDUP_WINDOW_MINUTES,
      context: RequestContext
    ): Promise<void> => {
      if (!fingerprint) {
        logger.debug("No fingerprint provided, skipping dedup registration", {
          alertId,
          ...context,
        });
        return;
      }

      const expiresAt = new Date(Date.now() + windowMinutes * MS_PER_MINUTE);

      await repo.upsertDedupEntry(fingerprint, tenantId, alertId, expiresAt);

      logger.info("Alert registered in dedup window", {
        fingerprint,
        alertId,
        windowMinutes,
        ...context,
      });
    },
  };
};
