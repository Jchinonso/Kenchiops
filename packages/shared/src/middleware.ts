/**
 * Express middleware utilities.
 */

import { Request, Response, NextFunction } from "express";
import { AppError, isAppError } from "./errors.js";
import { logger } from "./logger.js";

/**
 * Error handling middleware for Express.
 * Catches AppError instances and formats them appropriately.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
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

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
}

/**
 * Async handler wrapper to catch promise rejections in route handlers.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Request logging middleware.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
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
}

