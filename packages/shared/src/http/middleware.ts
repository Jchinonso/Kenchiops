/**
 * Express middleware utilities.
 */

import type { Request, Response, NextFunction } from "express";
import { isAppError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import { ERROR_CODES, HTTP_STATUS, DEFAULT_ERROR_MESSAGES } from "../constants/index.js";

const logger = createLogger("http-middleware");

/**
 * Metadata keys that are safe to include in client-facing error responses.
 * Any metadata key NOT in this set is stripped before sending to the client
 * to prevent accidental information disclosure of internal state.
 *
 * Add keys here only after confirming they contain no sensitive data
 * (no tenantIds, user IDs, SQL details, internal paths, or secrets).
 */
const SAFE_METADATA_KEYS: ReadonlySet<string> = new Set([
  // Validation context
  "errors",
  "field",
  "fields",
  // Authorization context
  "requiredRoles",
  "requiredPermissions",
  "missingPermissions",
  "reason",
  // Feature gating context
  "code",
  "currentPlan",
  "requiredFeatures",
  "missingFeatures",
]);

/**
 * Filter error metadata to only include keys that are safe for client responses.
 * Returns undefined if no safe keys are present (avoids empty `metadata: {}` in response).
 */
const filterSafeMetadata = (
  metadata: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined => {
  if (!metadata) {
    return undefined;
  }

  const safeEntries = Object.entries(metadata).filter(([key]) => SAFE_METADATA_KEYS.has(key));

  return safeEntries.length > 0 ? Object.fromEntries(safeEntries) : undefined;
};

/**
 * Error handling middleware for Express.
 *
 * Per error logging boundary rules:
 * - AppErrors are already logged at the appropriate boundary (adapter/service)
 * - This middleware only logs unexpected (non-operational) errors
 * - All errors are formatted into a consistent JSON response
 *
 * SECURITY: Metadata is filtered through SAFE_METADATA_KEYS to prevent
 * accidental information disclosure of internal state to API clients.
 */
export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (isAppError(error)) {
    const safeMetadata = filterSafeMetadata(error.metadata);

    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(safeMetadata && { metadata: safeMetadata }),
      },
    });
    return;
  }

  // Only log unexpected (non-AppError) errors at this boundary
  logger.error("Unexpected error", { error: String(error) });

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: DEFAULT_ERROR_MESSAGES.UNEXPECTED_ERROR,
    },
  });
};

/**
 * Async handler wrapper to catch promise rejections in route handlers.
 * Converts async route handler errors into Express next() calls.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const execute = async (): Promise<void> => {
      try {
        await fn(req, res, next);
      } catch (error: unknown) {
        next(error);
      }
    };
    void execute();
  };

/**
 * Request logging middleware.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    logger.info("HTTP request processed", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
    });
  });

  next();
};
