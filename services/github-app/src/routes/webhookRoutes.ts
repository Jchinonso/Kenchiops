/**
 * GitHub Webhook Routes
 *
 * Handles incoming webhooks from GitHub
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  HTTP_STATUS,
  handleDocUpdateEvent,
  findByGitHubInstallation,
  findWebhookActivityByDeliveryId,
  getErrorMessage,
} from "@kenchi/shared";
import { handlePullRequest } from "../handlers/pullRequestHandler.js";
import { handleCheckRun } from "../handlers/checkRunHandler.js";
import { handleInstallation } from "../handlers/installationHandler.js";
import { verifyGitHubWebhook } from "../middleware/verifyGithub.js";
import { logWebhookActivity } from "../helpers/webhookActivityLogger.js";
import type {
  PullRequestWebhook,
  CheckRunWebhook,
  InstallationWebhook,
  PushWebhook,
} from "../types/githubTypes.js";
import type { WebhookHandlerResult, GitHubEventHandler } from "./webhookRoutesTypes.js";

const router = Router();
const logger = createLogger("github-app");

/**
 * Format standard webhook response
 */
const formatStandardResponse = (result: WebhookHandlerResult): object => ({
  status: result.handled ? "processed" : "skipped",
  message: result.message,
  eventId: result.eventId,
});

/**
 * Format installation webhook response (includes tenantId)
 */
const formatInstallationResponse = (result: WebhookHandlerResult): object => ({
  status: result.handled ? "processed" : "skipped",
  message: result.message,
  tenantId: result.tenantId,
});

/**
 * Documentation file extensions that trigger RAG ingestion
 */
const DOC_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".md", ".mdx", ".rst", ".txt", ".adoc"]);

/**
 * Check if a file path is a documentation file
 */
const isDocFile = (filePath: string): boolean => {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return DOC_FILE_EXTENSIONS.has(ext);
};

/**
 * Extract title from file path
 */
const extractTitleFromPath = (filePath: string): string => {
  const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
  const baseName = fileName.slice(0, fileName.lastIndexOf("."));
  return baseName
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Handle push event for doc file updates
 */
const handlePush = async (webhook: PushWebhook): Promise<WebhookHandlerResult> => {
  const { repository, commits, installation, ref } = webhook;

  // Only process pushes to main/master branch
  const mainBranch = `refs/heads/${repository.default_branch}`;
  if (ref !== mainBranch) {
    logger.debug("Skipping push to non-default branch", {
      repository: repository.full_name,
      ref,
      defaultBranch: repository.default_branch,
    });
    return {
      handled: false,
      message: "Push to non-default branch ignored",
    };
  }

  // Collect all modified/added doc files
  const docFiles = commits.flatMap((commit) =>
    [...commit.added, ...commit.modified].filter(isDocFile)
  );

  if (docFiles.length === 0) {
    return {
      handled: false,
      message: "No documentation files in push",
    };
  }

  // Get tenant for this installation
  const installationId = installation?.id;
  if (!installationId) {
    logger.warn("No installation ID for push event", {
      repository: repository.full_name,
    });
    return {
      handled: true,
      message: "Push logged (no installation ID for RAG)",
    };
  }

  try {
    const tenant = await findByGitHubInstallation(installationId);
    if (!tenant) {
      return {
        handled: true,
        message: "Push logged (no tenant for RAG)",
      };
    }

    // Process each doc file
    // let: accumulator incremented per successful doc file ingestion
    let successCount = 0;
    const processResults = await Promise.all(
      docFiles.map(async (filePath) => {
        try {
          // Note: In a full implementation, we would fetch the file content
          // from GitHub. For now, we log and create a placeholder.
          const result = await handleDocUpdateEvent({
            repository: repository.full_name,
            filePath,
            content: `[Placeholder - fetch content from ${filePath}]`,
            title: extractTitleFromPath(filePath),
            tenantId: tenant.id,
          });

          if (result.success) {
            successCount++;
          }
          return result;
        } catch (error) {
          logger.error("Failed to process doc file update", {
            filePath,
            error: getErrorMessage(error),
          });
          return { success: false, chunksCreated: 0 };
        }
      })
    );

    const totalChunks = processResults.reduce(
      (sum: number, r: { success: boolean; chunksCreated: number }) => sum + r.chunksCreated,
      0
    );

    logger.info("Push event processed for RAG", {
      repository: repository.full_name,
      docFilesFound: docFiles.length,
      successCount,
      totalChunks,
    });

    return {
      handled: true,
      message: `Processed ${successCount}/${docFiles.length} doc files, ${totalChunks} chunks created`,
    };
  } catch (error) {
    logger.error("Failed to process push event for RAG", {
      repository: repository.full_name,
      error: getErrorMessage(error),
    });
    return {
      handled: true,
      message: "Push logged (RAG processing failed)",
    };
  }
};

/**
 * Event handler lookup table
 */
const eventHandlers: Record<string, GitHubEventHandler> = {
  pull_request: {
    handle: (body) => handlePullRequest(body as PullRequestWebhook),
    formatResponse: formatStandardResponse,
  },
  check_run: {
    handle: (body) => handleCheckRun(body as CheckRunWebhook),
    formatResponse: formatStandardResponse,
  },
  installation: {
    handle: (body) => handleInstallation(body as InstallationWebhook),
    formatResponse: formatInstallationResponse,
  },
  push: {
    handle: (body) => handlePush(body as PushWebhook),
    formatResponse: formatStandardResponse,
  },
};

/**
 * Handle ping event
 */
const handlePing = (deliveryId: string, startTime: number, res: Response): void => {
  logger.info("GitHub webhook ping received", { deliveryId });
  void logWebhookActivity({
    deliveryId,
    eventType: "ping",
    source: "github",
    status: "processed",
    startTime,
  });
  res.status(HTTP_STATUS.OK).json({
    status: "ok",
    message: "Webhook configured successfully",
  });
};

/**
 * Handle unknown event type
 */
const handleUnknownEvent = (
  eventType: string,
  deliveryId: string,
  startTime: number,
  res: Response
): void => {
  logger.info("Unhandled GitHub event type", { eventType, deliveryId });
  void logWebhookActivity({
    deliveryId,
    eventType,
    source: "github",
    status: "ignored",
    startTime,
  });
  res.status(HTTP_STATUS.OK).json({
    status: "ignored",
    message: `Event type '${eventType}' not handled`,
  });
};

/**
 * Resolve tenant ID from the GitHub installation ID in the webhook payload.
 * Returns null if the installation is missing or no tenant is found.
 */
const resolveTenantId = async (body: unknown): Promise<string | null> => {
  const installationId = (body as { installation?: { id?: number } })?.installation?.id;
  if (!installationId) {
    return null;
  }

  try {
    const tenant = await findByGitHubInstallation(installationId);
    return tenant?.id ?? null;
  } catch (error) {
    logger.warn("Failed to resolve tenant from installation", {
      installationId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Unified GitHub webhook handler
 * GitHub sends all events to this single endpoint with X-GitHub-Event header
 * Endpoint: POST /api/github/webhook
 */
const handleGitHubWebhook = asyncHandler(async (req: Request, res: Response) => {
  const eventType = req.headers["x-github-event"] as string;
  const deliveryId = req.headers["x-github-delivery"] as string;
  const startTime = Date.now();

  logger.info("Received GitHub webhook", {
    eventType,
    deliveryId,
  });

  // Handle ping separately (no async processing needed)
  if (eventType === "ping") {
    handlePing(deliveryId, startTime, res);
    return;
  }

  // Look up handler in table
  const handler = eventHandlers[eventType];
  if (!handler) {
    handleUnknownEvent(eventType, deliveryId, startTime, res);
    return;
  }

  // Replay protection: skip if already processed
  try {
    const existing = await findWebhookActivityByDeliveryId(deliveryId);
    if (existing) {
      logger.info("Duplicate GitHub webhook, skipping", {
        provider: "github",
        operation: "receiveWebhook",
        deliveryId,
        existingId: existing.id,
      });
      res.status(HTTP_STATUS.OK).json({
        status: "duplicate",
        message: "Webhook already processed",
      });
      return;
    }
  } catch (error) {
    // Replay check is best-effort — proceed with processing if it fails
    logger.warn("Replay protection check failed, proceeding with processing", {
      deliveryId,
      error: getErrorMessage(error),
    });
  }

  // Resolve tenant from installation ID for webhook activity logging
  const tenantId = await resolveTenantId(req.body);

  // Execute handler and format response
  try {
    const result = await handler.handle(req.body);
    const status = result.handled ? "processed" : "skipped";
    void logWebhookActivity({
      deliveryId,
      eventType,
      source: "github",
      status,
      startTime,
      tenantId: tenantId ?? result.tenantId,
    });
    res.status(HTTP_STATUS.OK).json(handler.formatResponse(result));
  } catch (error) {
    void logWebhookActivity({
      deliveryId,
      eventType,
      source: "github",
      status: "failed",
      startTime,
      tenantId,
      errorMessage: getErrorMessage(error),
    });
    throw error;
  }
});

// Main webhook endpoint (full path: /api/github/webhook)
router.post("/webhook", verifyGitHubWebhook, handleGitHubWebhook);

/**
 * Handle pull request webhook (legacy endpoint)
 * POST /webhook/pull_request
 */
router.post(
  "/webhook/pull_request",
  verifyGitHubWebhook,
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const deliveryId = (req.headers["x-github-delivery"] as string) ?? "unknown";
    const webhook = req.body as PullRequestWebhook;
    const tenantId = await resolveTenantId(req.body);

    try {
      const result = await handlePullRequest(webhook);
      const status = result.handled ? "processed" : "skipped";
      void logWebhookActivity({
        deliveryId,
        eventType: "pull_request",
        source: "github",
        status,
        startTime,
        tenantId,
      });
      res.status(HTTP_STATUS.OK).json({
        status: result.handled ? "processed" : "skipped",
        message: result.message,
        eventId: result.eventId,
      });
    } catch (error) {
      void logWebhookActivity({
        deliveryId,
        eventType: "pull_request",
        source: "github",
        status: "failed",
        startTime,
        tenantId,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  })
);

/**
 * Handle check run webhook (legacy endpoint)
 * POST /webhook/check_run
 */
router.post(
  "/webhook/check_run",
  verifyGitHubWebhook,
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const deliveryId = (req.headers["x-github-delivery"] as string) ?? "unknown";
    const webhook = req.body as CheckRunWebhook;
    const tenantId = await resolveTenantId(req.body);

    try {
      const result = await handleCheckRun(webhook);
      const status = result.handled ? "processed" : "skipped";
      void logWebhookActivity({
        deliveryId,
        eventType: "check_run",
        source: "github",
        status,
        startTime,
        tenantId,
      });
      res.status(HTTP_STATUS.OK).json({
        status: result.handled ? "processed" : "skipped",
        message: result.message,
        eventId: result.eventId,
      });
    } catch (error) {
      void logWebhookActivity({
        deliveryId,
        eventType: "check_run",
        source: "github",
        status: "failed",
        startTime,
        tenantId,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  })
);

export { router as webhookRoutes };
