/**
 * Railway Streaming Adapter
 *
 * Implements the optional `subscribe` method on DeployLogSourcePort for Railway.
 * Uses Railway's GraphQL subscription endpoint via WebSocket for real-time
 * deployment log streaming.
 *
 * Falls back gracefully if WebSocket is not available (Node < 22 without ws package).
 * Logs are fed into the ingestion buffer via the onLine callback.
 *
 * @module adapters/railwayStreamingAdapter
 */

import {
  createLogger,
  getErrorMessage,
  redactSecrets,
  RAILWAY_STREAMING,
  type RequestContext,
  type LogLine,
} from "@kenchi/shared";

const logger = createLogger("railway-streaming");

// ==================== Types ====================

/** State of the WebSocket subscription. */
export type SubscriptionState = "connecting" | "connected" | "reconnecting" | "closed";

/** Configuration for a Railway log subscription. */
export interface RailwaySubscriptionConfig {
  readonly deploymentId: string;
  readonly apiToken: string;
}

// ==================== GraphQL Subscription Protocol ====================

const CONNECTION_INIT = JSON.stringify({ type: "connection_init" });

/**
 * Sanitize a deployment ID for safe interpolation into a GraphQL query.
 * Railway deployment IDs are UUIDs; strip anything that could escape the string.
 */
const sanitizeDeploymentId = (id: string): string =>
  id.replace(/[^a-zA-Z0-9\-_]/g, "").slice(0, 100);

const buildSubscribeMessage = (deploymentId: string): string =>
  JSON.stringify({
    id: "1",
    type: "subscribe",
    payload: {
      query: `subscription { deploymentLogs(deploymentId: "${sanitizeDeploymentId(deploymentId)}") { timestamp message severity } }`,
    },
  });

// ==================== Internal State ====================

/**
 * Mutable subscription state holder.
 * Encapsulated to avoid scattered let declarations.
 */
interface SubscriptionLifecycle {
  state: SubscriptionState;
  reconnectAttempts: number;
  ws: WebSocket | null;
}

// ==================== Subscription Factory ====================

/**
 * Creates a Railway log subscription that feeds lines to the onLine callback.
 * Returns a handle to close the subscription.
 *
 * If the native WebSocket API is not available (Node < 22 without ws package),
 * logs a warning and returns a no-op handle — REST polling handles fallback.
 */
export const subscribeToRailwayLogs = async (
  config: RailwaySubscriptionConfig,
  onLine: (line: LogLine) => void,
  context: RequestContext
): Promise<{ readonly close: () => Promise<void> }> => {
  const logContext = { ...context };

  // Check if WebSocket is available (Node 22+ or ws package)
  if (typeof globalThis.WebSocket === "undefined") {
    logger.warn("WebSocket not available — falling back to REST polling", {
      provider: "railway",
      operation: "subscribe",
      durationMs: 0,
      deploymentId: config.deploymentId,
      ...logContext,
    });
    return { close: async () => {} };
  }

  // Mutable lifecycle state for the subscription (reconnects mutate these fields)
  const lifecycle: SubscriptionLifecycle = {
    state: "connecting",
    reconnectAttempts: 0,
    ws: null,
  };

  const connect = (): void => {
    try {
      lifecycle.ws = new WebSocket(RAILWAY_STREAMING.WS_URL, ["graphql-transport-ws"]);

      lifecycle.ws.onopen = () => {
        lifecycle.state = "connected";
        lifecycle.reconnectAttempts = 0;
        lifecycle.ws?.send(CONNECTION_INIT);

        logger.info("Railway WebSocket connected", {
          provider: "railway",
          operation: "subscribe",
          durationMs: 0,
          deploymentId: config.deploymentId,
          ...logContext,
        });
      };

      lifecycle.ws.onmessage = (event) => {
        try {
          // Guard against oversized WebSocket messages
          const rawData = String(event.data);
          if (rawData.length > RAILWAY_STREAMING.MAX_WS_MESSAGE_SIZE) {
            logger.warn("Railway WS message exceeds size limit — skipping", {
              provider: "railway",
              operation: "subscribe",
              durationMs: 0,
              messageSize: rawData.length,
              ...logContext,
            });
            return;
          }
          const data = JSON.parse(rawData) as Record<string, unknown>;

          if (data.type === "connection_ack") {
            lifecycle.ws?.send(buildSubscribeMessage(config.deploymentId));
            return;
          }

          if (data.type === "next") {
            const payload = data.payload as {
              readonly data?: {
                readonly deploymentLogs?: {
                  readonly timestamp: string;
                  readonly message: string;
                  readonly severity: string;
                };
              };
            };
            const logEntry = payload.data?.deploymentLogs;
            if (logEntry) {
              onLine({
                timestamp: new Date(logEntry.timestamp),
                message: logEntry.message,
                level: logEntry.severity ?? "info",
                source: "railway",
              });
            }
          }

          if (data.type === "complete") {
            lifecycle.state = "closed";
            lifecycle.ws?.close();
          }
        } catch (parseError: unknown) {
          logger.warn("Failed to parse Railway WS message", {
            provider: "railway",
            operation: "subscribe",
            durationMs: 0,
            error: redactSecrets(getErrorMessage(parseError)),
            ...logContext,
          });
        }
      };

      lifecycle.ws.onclose = () => {
        if (lifecycle.state === "closed") {
          return;
        }

        lifecycle.state = "reconnecting";
        lifecycle.reconnectAttempts += 1;

        if (lifecycle.reconnectAttempts > RAILWAY_STREAMING.MAX_RECONNECT_ATTEMPTS) {
          logger.warn("Railway WebSocket max reconnect attempts exceeded", {
            provider: "railway",
            operation: "subscribe",
            durationMs: 0,
            deploymentId: config.deploymentId,
            attempts: lifecycle.reconnectAttempts,
            ...logContext,
          });
          lifecycle.state = "closed";
          return;
        }

        logger.info("Railway WebSocket reconnecting", {
          provider: "railway",
          operation: "subscribe",
          durationMs: 0,
          deploymentId: config.deploymentId,
          attempt: lifecycle.reconnectAttempts,
          ...logContext,
        });

        setTimeout(connect, RAILWAY_STREAMING.RECONNECT_DELAY_MS * lifecycle.reconnectAttempts);
      };

      lifecycle.ws.onerror = (error) => {
        logger.warn("Railway WebSocket error", {
          provider: "railway",
          operation: "subscribe",
          durationMs: 0,
          deploymentId: config.deploymentId,
          error: redactSecrets(getErrorMessage(error)),
          ...logContext,
        });
      };
    } catch (error: unknown) {
      logger.error("Failed to create Railway WebSocket", {
        provider: "railway",
        operation: "subscribe",
        durationMs: 0,
        deploymentId: config.deploymentId,
        error: redactSecrets(getErrorMessage(error)),
        ...logContext,
      });
      lifecycle.state = "closed";
    }
  };

  connect();

  return {
    close: async (): Promise<void> => {
      lifecycle.state = "closed";
      if (lifecycle.ws && lifecycle.ws.readyState !== WebSocket.CLOSED) {
        lifecycle.ws.close();
      }
      logger.info("Railway WebSocket subscription closed", {
        provider: "railway",
        operation: "subscribe",
        durationMs: 0,
        deploymentId: config.deploymentId,
        ...logContext,
      });
    },
  };
};
