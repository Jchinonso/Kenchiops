/**
 * Slack webhook signature verification middleware.
 *
 * SECURITY CRITICAL: This middleware verifies that incoming requests
 * are actually from Slack by validating the signature.
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { 
  config, 
  logger, 
  AuthenticationError,
  HTTP_STATUS,
  SLACK_VERIFICATION,
  TIME_CONSTANTS,
} from '@kenchi/shared';

/**
 * Verifies Slack request signatures to prevent unauthorized access.
 *
 * Slack signs each request with HMAC-SHA256 using your signing secret.
 * We must verify this signature to ensure the request is legitimate.
 *
 * @throws {AuthenticationError} If signature is invalid or timestamp is stale
 */
export function verifySlackSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const slackSignature = req.headers['x-slack-signature'] as string | undefined;
  const slackRequestTimestamp = req.headers['x-slack-request-timestamp'] as string | undefined;

  // Check required headers
  if (!slackSignature || !slackRequestTimestamp) {
    logger.warn('Missing Slack signature headers', {
      hasSignature: !!slackSignature,
      hasTimestamp: !!slackRequestTimestamp,
    });
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized' });
    return;
  }

  // Check timestamp freshness (prevent replay attacks)
  const timestamp = parseInt(slackRequestTimestamp, 10);
  const currentTime = Math.floor(Date.now() / TIME_CONSTANTS.MILLISECONDS_PER_SECOND);
  const timeDifference = Math.abs(currentTime - timestamp);

  // Reject requests older than configured window
  if (timeDifference > SLACK_VERIFICATION.TIMESTAMP_WINDOW_SECONDS) {
    logger.warn('Slack request timestamp too old', {
      timestamp,
      currentTime,
      difference: timeDifference,
    });
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Request timestamp expired' });
    return;
  }

  // Compute expected signature
  const signingSecret = config.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    logger.error('SLACK_SIGNING_SECRET not configured');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server configuration error' });
    return;
  }

  // Reconstruct the request body as a string
  // Note: We need the raw body for signature verification
  const requestBody = JSON.stringify(req.body);

  // Create signature base string: v0:timestamp:body
  const signatureBaseString = `${SLACK_VERIFICATION.SIGNATURE_PREFIX}:${slackRequestTimestamp}:${requestBody}`;

  // Compute HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(signatureBaseString);
  const computedSignature = `${SLACK_VERIFICATION.SIGNATURE_PREFIX}=${hmac.digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(slackSignature),
      Buffer.from(computedSignature)
    );

    if (!isValid) {
      logger.warn('Invalid Slack signature', {
        expected: computedSignature.substring(0, SLACK_VERIFICATION.LOG_SUBSTRING_LENGTH) + '...',
        received: slackSignature.substring(0, SLACK_VERIFICATION.LOG_SUBSTRING_LENGTH) + '...',
      });
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid signature' });
      return;
    }

    // Signature is valid, proceed
    logger.debug('Slack signature verified successfully');
    next();
  } catch (error) {
    // timingSafeEqual throws if buffer lengths don't match
    logger.warn('Slack signature verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid signature' });
  }
}

/**
 * Middleware factory that can be configured with custom signing secret.
 * Useful for testing with mock secrets.
 *
 * @param signingSecret - Custom signing secret (optional, defaults to config)
 * @returns Express middleware function
 */
export function createSlackVerifier(signingSecret?: string): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const secret = signingSecret || config.SLACK_SIGNING_SECRET;
    if (!secret) {
      logger.error('SLACK_SIGNING_SECRET not configured');
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server configuration error' });
      return;
    }

    // Same verification logic but with custom secret
    const slackSignature = req.headers['x-slack-signature'] as string | undefined;
    const slackRequestTimestamp = req.headers['x-slack-request-timestamp'] as string | undefined;

    if (!slackSignature || !slackRequestTimestamp) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized' });
      return;
    }

    const timestamp = parseInt(slackRequestTimestamp, 10);
    const currentTime = Math.floor(Date.now() / TIME_CONSTANTS.MILLISECONDS_PER_SECOND);
    const timeDifference = Math.abs(currentTime - timestamp);

    if (timeDifference > SLACK_VERIFICATION.TIMESTAMP_WINDOW_SECONDS) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Request timestamp expired' });
      return;
    }

    const requestBody = JSON.stringify(req.body);
    const signatureBaseString = `${SLACK_VERIFICATION.SIGNATURE_PREFIX}:${slackRequestTimestamp}:${requestBody}`;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signatureBaseString);
    const computedSignature = `${SLACK_VERIFICATION.SIGNATURE_PREFIX}=${hmac.digest('hex')}`;

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(slackSignature),
        Buffer.from(computedSignature)
      );

      if (isValid) {
        next();
      } else {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid signature' });
      }
    } catch (error) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid signature' });
    }
  };
}
