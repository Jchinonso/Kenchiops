/**
 * SSE Routes
 *
 * Server-Sent Events endpoint for real-time dashboard updates.
 * Subscribes to Redis pub/sub and streams tenant-scoped events
 * to authenticated browser clients.
 *
 * Security hardening:
 * - Strict tenant isolation (events without tenantId are dropped, not broadcast)
 * - Per-tenant and global connection limits to prevent resource exhaustion
 * - Event type sanitization to prevent SSE frame injection
 * - Socket timeout disabled for long-lived SSE connections
 *
 * @module routes/sseRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  createLogger,
  subscribe,
  getErrorMessage,
  requireTenantId,
  AuthorizationError,
  SSE_CONFIG,
  PUBSUB_CHANNELS,
  SERVICE_NAMES,
  rateLimitByCategory,
  type QueueMessage,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

/** SSE endpoint path (used for rate limiter bypass) */
export const SSE_STREAM_PATH = "/api/v1/dashboard/events/stream";

// ==================== Connection Tracking ====================

/** Maximum concurrent SSE connections per tenant */
const MAX_CONNECTIONS_PER_TENANT = 10;

/** Maximum concurrent SSE connections globally */
const MAX_CONNECTIONS_GLOBAL = 200;

/** Pattern for valid SSE event type names (alphanumeric, underscore, hyphen) */
const VALID_EVENT_TYPE_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Active SSE connection counts by tenantId */
const tenantConnectionCounts = new Map<string, number>();

/** Global active SSE connection count */
// let: mutable counter incremented/decremented as connections open/close
let globalConnectionCount = 0; // let: connection counter modified on connect/disconnect

/**
 * Increment connection count for a tenant. Returns false if limit exceeded.
 */
const acquireConnection = (tenantId: string): boolean => {
  if (globalConnectionCount >= MAX_CONNECTIONS_GLOBAL) {
    return false;
  }

  const currentTenantCount = tenantConnectionCounts.get(tenantId) ?? 0;
  if (currentTenantCount >= MAX_CONNECTIONS_PER_TENANT) {
    return false;
  }

  tenantConnectionCounts.set(tenantId, currentTenantCount + 1);
  globalConnectionCount += 1;
  return true;
};

/**
 * Decrement connection count for a tenant on disconnect.
 */
const releaseConnection = (tenantId: string): void => {
  const currentCount = tenantConnectionCounts.get(tenantId) ?? 0;
  const newCount = Math.max(0, currentCount - 1);
  if (newCount === 0) {
    tenantConnectionCounts.delete(tenantId);
  } else {
    tenantConnectionCounts.set(tenantId, newCount);
  }
  globalConnectionCount = Math.max(0, globalConnectionCount - 1);
};

// ==================== Helpers ====================

/**
 * Sanitize an SSE event type name to prevent frame injection.
 * SSE event names must not contain newlines or other control characters
 * that could inject additional SSE frames.
 */
const sanitizeEventType = (eventType: string): string => {
  if (VALID_EVENT_TYPE_PATTERN.test(eventType)) {
    return eventType;
  }
  // Strip any characters that are not alphanumeric, underscore, or hyphen
  return eventType.replace(/[^a-zA-Z0-9_-]/g, "");
};

/**
 * Write an SSE data frame to the response.
 * Event type is sanitized to prevent frame injection attacks.
 */
const writeSSEEvent = (res: Response, eventType: string, data: unknown): void => {
  const safeEventType = sanitizeEventType(eventType);
  if (safeEventType.length === 0) {
    // Completely invalid event type — skip writing
    return;
  }
  res.write(`event: ${safeEventType}\n`);
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
 *
 * Security controls:
 * - Strict tenant filtering: events without tenantId are dropped (not broadcast)
 * - Connection limits: per-tenant (10) and global (200) to prevent exhaustion
 * - Event type sanitization: prevents SSE frame injection
 * - Socket timeout disabled: prevents premature connection drops
 */
const handleSSEStream = (req: Request, res: Response): void => {
  const { context } = req;

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

  // Enforce connection limits before opening SSE stream
  if (!acquireConnection(tenantId)) {
    const currentTenantCount = tenantConnectionCounts.get(tenantId) ?? 0;
    logger.warn("SSE connection limit reached", {
      ...context,
      tenantId,
      tenantConnections: currentTenantCount,
      globalConnections: globalConnectionCount,
      maxPerTenant: MAX_CONNECTIONS_PER_TENANT,
      maxGlobal: MAX_CONNECTIONS_GLOBAL,
    });

    res.status(429).json({
      error: {
        code: "TOO_MANY_CONNECTIONS",
        message: "Too many active SSE connections. Please close existing connections and retry.",
        requestId: context.requestId,
      },
    });
    return;
  }

  // Disable socket timeout for long-lived SSE connections.
  // Without this, Node.js may drop the connection after SERVER_TIMEOUTS.REQUEST_MS.
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);

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
    tenantConnections: tenantConnectionCounts.get(tenantId) ?? 0,
    globalConnections: globalConnectionCount,
  });

  // Heartbeat timer
  const heartbeatTimer = setInterval(() => {
    // SSE comment line (ignored by EventSource but keeps connection alive)
    res.write(":heartbeat\n\n");
  }, SSE_CONFIG.HEARTBEAT_INTERVAL_MS);

  // Track unsubscribe function for cleanup
  // let: assigned asynchronously after subscribe resolves
  let unsubscribe: (() => Promise<void>) | null = null; // let: set after async subscribe completes
  // let: tracks whether client disconnected before subscribe resolved
  let connectionClosed = false; // let: set to true on disconnect for early-cleanup

  // Subscribe to Redis dashboard channel
  const capturedTenantId = tenantId;
  void (async () => {
    try {
      unsubscribe = await subscribe<DashboardEventPayload>(
        PUBSUB_CHANNELS.DASHBOARD,
        async (message: QueueMessage<DashboardEventPayload>) => {
          // Strict tenant isolation: only deliver events that explicitly match
          // this client's tenantId. Events without tenantId are dropped to
          // prevent cross-tenant information disclosure.
          const eventTenantId = message.payload.tenantId;
          if (eventTenantId !== capturedTenantId) {
            return;
          }

          writeSSEEvent(res, message.type, {
            type: message.type,
            ...message.payload,
            timestamp: message.timestamp,
          });
        }
      );

      // If client disconnected while we were subscribing, clean up immediately
      if (connectionClosed) {
        await unsubscribe();
        return;
      }

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
    connectionClosed = true;
    clearInterval(heartbeatTimer);
    releaseConnection(capturedTenantId);

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
      tenantConnections: tenantConnectionCounts.get(capturedTenantId) ?? 0,
      globalConnections: globalConnectionCount,
    });
  });
};

// ==================== Route Definitions ====================

router.get(SSE_STREAM_PATH, rateLimitByCategory("standard"), handleSSEStream);

export { router as sseRoutes };
