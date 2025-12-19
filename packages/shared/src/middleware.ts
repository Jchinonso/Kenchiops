/**
 * Express middleware utilities.
 */

import type { Request, Response, NextFunction } from "express";
import { isAppError } from "./errors.js";
import { logger } from "./logger.js";
import { ERROR_CODES, HTTP_STATUS, DEFAULT_ERROR_MESSAGES } from "./constants.js";

/**
 * Error handling middleware for Express.
 * Catches AppError instances and formats them appropriately.
 */
export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (isAppError(error)) {
    logger.error("Application error", {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      metadata: error.metadata,
    });

    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.metadata && { metadata: error.metadata }),
      },
    });
    return;
  }

  // Handle unexpected errors
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
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Request logging middleware.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP request", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });

  next();
};
