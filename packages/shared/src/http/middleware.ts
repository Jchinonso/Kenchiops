/**
 * Express middleware utilities.
 */

import type { Request, Response, NextFunction } from "express";
import { isAppError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import { ERROR_CODES, HTTP_STATUS, DEFAULT_ERROR_MESSAGES } from "../constants/index.js";

const logger = createLogger("http-middleware");

/**
 * Error handling middleware for Express.
 *
 * Per error logging boundary rules:
 * - AppErrors are already logged at the appropriate boundary (adapter/service)
 * - This middleware only logs unexpected (non-operational) errors
 * - All errors are formatted into a consistent JSON response
 */
export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.metadata && { metadata: error.metadata }),
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
