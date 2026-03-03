/**
 * Security Headers Middleware
 *
 * Sets standard HTTP security headers on all responses.
 * Extracted from the API service for reuse across all services.
 *
 * @module http/securityHeaders
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Creates Express middleware that sets standard HTTP security headers.
 *
 * Headers applied:
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 0 (disable legacy XSS filter)
 * - Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
 * - Strict-Transport-Security (production only): max-age=31536000; includeSubDomains
 *
 * @param isProduction - Whether the service is running in production mode
 * @returns Express middleware function
 */
export const createSecurityHeaders =
  (isProduction: boolean): ((req: Request, res: Response, next: NextFunction) => void) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    // Disable legacy XSS filter -- modern browsers handle this natively
    res.setHeader("X-XSS-Protection", "0");
    // CSP: API-only services should not serve any active content.
    // default-src 'none' blocks all resource loading; frame-ancestors 'none' prevents embedding.
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");

    // HSTS: enforce HTTPS for 1 year in production (prevents first-request MitM)
    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  };
