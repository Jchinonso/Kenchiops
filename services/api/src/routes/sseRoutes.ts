/**
 * SSE Routes
 *
 * Server-Sent Events endpoint for real-time dashboard updates.
 * Subscribes to Redis pub/sub and streams tenant-scoped events
 * to authenticated browser clients.
 *
 * @module routes/sseRoutes
 */

import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  createLogger,
  subscribe,
  getErrorMessage,
  AuthorizationError,
  SSE_CONFIG,
  PUBSUB_CHANNELS,
  SERVICE_NAMES,
  type RequestContext,
  type QueueMessage,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

/** SSE endpoint path (used for rate limiter bypass) */
export const SSE_STREAM_PATH = "/api/v1/dashboard/events/stream";

// ==================== Helpers ====================

/**
 * Extract the RequestContext from an Express request.
 */
const getRequestContext = (req: Request): RequestContext => {
  const reqWithContext = req as Request & { readonly context?: RequestContext };
  return (
    reqWithContext.context ?? {
      requestId: crypto.randomUUID(),
      tenantId: "anonymous",
    }
  );
};

/**
 * Extract tenantId from authenticated user or throw.
 */
const requireTenantId = (req: Request): string => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    throw new AuthorizationError(
      "No organization linked. Install the Kenchi GitHub App to get started.",
      { operation: "sseRequireTenantId" }
    );
  }

  return tenantId;
};

/**
 * Write an SSE data frame to the response.
 */
const writeSSEEvent = (res: Response, eventType: string, data: unknown): void => {
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

// ==================== SSE Payload Types ====================

interface DashboardEventPayload {
  readonly tenantId?: string | null;
  readonly [key: string]: unknown;
}

// ==================== Route Handler ====================

/**
 * SSE stream handler.
 *
 * Opens a long-lived connection, subscribes to the Redis dashboard channel,
 * filters events by the authenticated user's tenantId, and streams them
 * as SSE frames. Sends periodic heartbeats to keep the connection alive.
 */
const handleSSEStream = (req: Request, res: Response): void => {
  const context = getRequestContext(req);

  // Validate auth — this throws AuthorizationError if no tenant
  // let: tenantId may throw synchronously before SSE headers are sent
  let tenantId: string; // let: assigned in try block, read in async closure
  try {
    tenantId = requireTenantId(req);
  } catch (error) {
    // Cannot use SSE error framing before headers are sent — return JSON error
    const status = error instanceof AuthorizationError ? 403 : 500;
    res.status(status).json({
      error: {
        code: "AUTHORIZATION_ERROR",
        message: error instanceof AuthorizationError ? error.message : "Internal error",
        requestId: context.requestId,
      },
    });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Send initial retry interval hint to EventSource
  res.write(`retry: ${SSE_CONFIG.RETRY_MS}\n\n`);

  logger.info("SSE client connected", {
    ...context,
    tenantId,
  });

  // Heartbeat timer
  const heartbeatTimer = setInterval(() => {
    // SSE comment line (ignored by EventSource but keeps connection alive)
    res.write(":heartbeat\n\n");
  }, SSE_CONFIG.HEARTBEAT_INTERVAL_MS);

  // Track unsubscribe function for cleanup
  // let: assigned asynchronously after subscribe resolves
  let unsubscribe: (() => Promise<void>) | null = null; // let: set after async subscribe completes

  // Subscribe to Redis dashboard channel
  const capturedTenantId = tenantId;
  void (async () => {
    try {
      unsubscribe = await subscribe<DashboardEventPayload>(
        PUBSUB_CHANNELS.DASHBOARD,
        async (message: QueueMessage<DashboardEventPayload>) => {
          // Filter: only send events for this tenant
          const eventTenantId = message.payload.tenantId;
          if (eventTenantId && eventTenantId !== capturedTenantId) {
            return;
          }

          writeSSEEvent(res, message.type, {
            type: message.type,
            ...message.payload,
            timestamp: message.timestamp,
          });
        }
      );

      logger.debug("SSE Redis subscription active", {
        ...context,
        tenantId: capturedTenantId,
        channel: PUBSUB_CHANNELS.DASHBOARD,
      });
    } catch (subscribeError) {
      logger.error("Failed to subscribe to dashboard channel for SSE", {
        ...context,
        tenantId: capturedTenantId,
        error: getErrorMessage(subscribeError),
      });
    }
  })();

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(heartbeatTimer);

    if (unsubscribe) {
      void (async () => {
        try {
          await unsubscribe();
        } catch (cleanupError) {
          logger.warn("SSE unsubscribe failed during cleanup", {
            ...context,
            tenantId: capturedTenantId,
            error: getErrorMessage(cleanupError),
          });
        }
      })();
    }

    logger.info("SSE client disconnected", {
      ...context,
      tenantId: capturedTenantId,
    });
  });
};

// ==================== Route Definitions ====================

router.get(SSE_STREAM_PATH, handleSSEStream);

export { router as sseRoutes };
