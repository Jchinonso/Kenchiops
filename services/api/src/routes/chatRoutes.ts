/**
 * Chat Routes
 *
 * API endpoints for the Kenchi Copilot Drawer chat feature.
 * Includes streaming completions (SSE), conversation listing,
 * message retrieval, and conversation deletion.
 *
 * @module routes/chatRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  requireTenantId,
  createLogger,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  AuthorizationError,
  HTTP_STATUS,
  SERVICE_NAMES,
  CHAT_DEFAULTS,
  getErrorMessage,
  rateLimitByCategory,
  chatUserRateLimit,
  ensureSubscription,
  type ChatCompletionInput,
  type ChatPageContext,
  type ChatPageType,
} from "@kenchi/shared";
import { getChatContainer } from "../container/chatContainer.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Constants ====================

/** Default plan tier when subscription lookup fails. */
const DEFAULT_PLAN_TIER = "free" as const;

const VALID_PAGE_TYPES: ReadonlySet<ChatPageType> = new Set([
  "analysis",
  "incident",
  "knowledge-base",
  "overview",
  "failures",
]);

// ==================== Validation Helpers ====================

/**
 * Validates and extracts the chat completion input from the request body.
 */
const validateChatCompletionBody = (
  body: unknown,
  tenantId: string,
  userId: string
): ChatCompletionInput => {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Request body must be a JSON object", {
      operation: "validateChatCompletionBody",
    });
  }

  const { conversationId, message, pageContext } = body as Record<string, unknown>;

  // Validate message
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new ValidationError("message is required and must be a non-empty string", {
      operation: "validateChatCompletionBody",
    });
  }

  if (message.length > CHAT_DEFAULTS.MAX_MESSAGE_LENGTH) {
    throw new ValidationError(
      `message must be at most ${String(CHAT_DEFAULTS.MAX_MESSAGE_LENGTH)} characters`,
      { operation: "validateChatCompletionBody" }
    );
  }

  // Validate conversationId (optional — treat null same as undefined)
  if (
    conversationId !== undefined &&
    conversationId !== null &&
    typeof conversationId !== "string"
  ) {
    throw new ValidationError("conversationId must be a string", {
      operation: "validateChatCompletionBody",
    });
  }

  if (typeof conversationId === "string") {
    if (conversationId.length > CHAT_DEFAULTS.MAX_ENTITY_ID_LENGTH) {
      throw new ValidationError(
        `conversationId must be at most ${String(CHAT_DEFAULTS.MAX_ENTITY_ID_LENGTH)} characters`,
        { operation: "validateChatCompletionBody" }
      );
    }
    // Only allow safe characters: alphanumeric, underscore, hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(conversationId)) {
      throw new ValidationError("conversationId contains invalid characters", {
        operation: "validateChatCompletionBody",
      });
    }
  }

  // Validate pageContext
  if (typeof pageContext !== "object" || pageContext === null) {
    throw new ValidationError("pageContext is required and must be an object", {
      operation: "validateChatCompletionBody",
    });
  }

  const { pageType, entityId, metadata } = pageContext as Record<string, unknown>;

  if (typeof pageType !== "string" || !VALID_PAGE_TYPES.has(pageType as ChatPageType)) {
    throw new ValidationError(
      `pageContext.pageType must be one of: ${[...VALID_PAGE_TYPES].join(", ")}`,
      { operation: "validateChatCompletionBody" }
    );
  }

  if (entityId !== undefined && typeof entityId !== "string") {
    throw new ValidationError("pageContext.entityId must be a string", {
      operation: "validateChatCompletionBody",
    });
  }

  if (typeof entityId === "string" && entityId.length > CHAT_DEFAULTS.MAX_ENTITY_ID_LENGTH) {
    throw new ValidationError(
      `pageContext.entityId must be at most ${String(CHAT_DEFAULTS.MAX_ENTITY_ID_LENGTH)} characters`,
      { operation: "validateChatCompletionBody" }
    );
  }

  // Validate metadata: reject prototype pollution vectors, cap size, enforce primitive values
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new ValidationError("pageContext.metadata must be a plain object", {
        operation: "validateChatCompletionBody",
      });
    }
    const metadataRecord = metadata as Record<string, unknown>;
    const metadataKeys = Object.keys(metadataRecord);
    const DANGEROUS_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
    const hasDangerousKey = metadataKeys.some((key) => DANGEROUS_KEYS.has(key));
    if (hasDangerousKey) {
      throw new ValidationError("pageContext.metadata contains disallowed keys", {
        operation: "validateChatCompletionBody",
      });
    }
    if (metadataKeys.length > CHAT_DEFAULTS.MAX_METADATA_KEYS) {
      throw new ValidationError(
        `pageContext.metadata must have at most ${String(CHAT_DEFAULTS.MAX_METADATA_KEYS)} keys`,
        { operation: "validateChatCompletionBody" }
      );
    }
    // Values must be primitives (string, number, boolean, null); strings capped
    const hasInvalidValue = metadataKeys.some((key) => {
      const val = metadataRecord[key];
      if (val === null || val === undefined) {
        return false;
      }
      const valType = typeof val;
      if (valType === "object" || valType === "function" || valType === "symbol") {
        return true;
      }
      return (
        valType === "string" && (val as string).length > CHAT_DEFAULTS.MAX_METADATA_VALUE_LENGTH
      );
    });
    if (hasInvalidValue) {
      throw new ValidationError(
        `pageContext.metadata values must be primitives (string, number, boolean, null) with strings at most ${String(CHAT_DEFAULTS.MAX_METADATA_VALUE_LENGTH)} characters`,
        { operation: "validateChatCompletionBody" }
      );
    }
  }

  const validatedPageContext: ChatPageContext = {
    pageType: pageType as ChatPageType,
    ...(entityId !== undefined && { entityId: entityId as string }),
    ...(metadata !== undefined &&
      metadata !== null && {
        metadata: metadata as Readonly<Record<string, unknown>>,
      }),
  };

  return {
    conversationId: (conversationId as string | null | undefined) ?? undefined,
    userMessage: message as string,
    pageContext: validatedPageContext,
    tenantId,
    userId,
  };
};

/**
 * Parses and clamps a limit query parameter.
 */
const parseLimit = (value: unknown, defaultLimit: number): number => {
  if (value === undefined || value === null) {
    return defaultLimit;
  }
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed) || parsed < 1) {
    return defaultLimit;
  }
  return Math.min(parsed, CHAT_DEFAULTS.MAX_LIMIT);
};

// ==================== Ownership Verification ====================

/**
 * Verifies a conversation exists AND belongs to the authenticated user.
 * Returns the conversation or throws NotFoundError / AuthorizationError.
 */
const requireConversationOwnership = async (
  conversationId: string,
  tenantId: string,
  userId: string,
  context: import("@kenchi/shared").RequestContext,
  operation: string
): Promise<void> => {
  const conversation = await getChatContainer().chatService.getConversation(
    conversationId,
    tenantId,
    context
  );
  if (!conversation) {
    throw new NotFoundError("Conversation not found", {
      metadata: { conversationId },
    });
  }
  if (conversation.userId !== userId) {
    throw new AuthorizationError("You do not have access to this conversation", {
      operation,
    });
  }
};

// ==================== Route Handlers ====================

/**
 * POST /api/v1/chat/completions
 *
 * Streaming chat completion endpoint. Returns text/event-stream (SSE).
 * Each event is a JSON-encoded ChatStreamChunk.
 */
const handleChatCompletion = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // Validate BEFORE setting SSE headers — errors here are caught by Express error handler
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;

  if (!userId) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
        requestId: req.context?.requestId,
      },
    });
    return;
  }

  // let: input validated before SSE mode — thrown ValidationError returns JSON error
  let input: ChatCompletionInput; // let: assigned in try block, used after
  try {
    const baseInput = validateChatCompletionBody(req.body, tenantId, userId);

    // Resolve plan tier for budget enforcement (fail-open: defaults to "free")
    // let: planTier may be overridden by subscription lookup
    let planTier: string = DEFAULT_PLAN_TIER; // let: updated if subscription lookup succeeds
    try {
      const subscription = await ensureSubscription(tenantId);
      planTier = subscription.planId;
    } catch (subError: unknown) {
      logger.warn("Failed to resolve plan tier for chat budget — defaulting to free", {
        error: getErrorMessage(subError),
        ...req.context,
      });
    }

    // Verify conversation ownership when continuing an existing conversation
    if (baseInput.conversationId) {
      await requireConversationOwnership(
        baseInput.conversationId,
        tenantId,
        userId,
        req.context,
        "handleChatCompletion"
      );
    }

    input = { ...baseInput, planTier };
  } catch (preStreamError: unknown) {
    const statusCode =
      preStreamError instanceof AuthorizationError
        ? HTTP_STATUS.FORBIDDEN
        : preStreamError instanceof NotFoundError
          ? HTTP_STATUS.NOT_FOUND
          : HTTP_STATUS.BAD_REQUEST;
    const errorCode =
      preStreamError instanceof AuthorizationError
        ? "FORBIDDEN"
        : preStreamError instanceof NotFoundError
          ? "NOT_FOUND"
          : "VALIDATION_ERROR";
    res.status(statusCode).json({
      error: {
        code: errorCode,
        message: getErrorMessage(preStreamError),
        requestId: req.context?.requestId,
      },
    });
    return;
  }

  // Set SSE headers — from this point, errors must be sent as SSE frames
  res.writeHead(HTTP_STATUS.OK, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Extend socket timeout for streaming (can take 30+ seconds, cap at 5 minutes)
  req.socket.setTimeout(300_000);

  // Track client disconnect
  // let: mutable flag set by event listener
  let clientDisconnected = false; // let: set to true by req close event
  req.on("close", () => {
    clientDisconnected = true;
  });

  try {
    const stream = getChatContainer().chatService.streamCompletion(input, req.context);

    for await (const chunk of stream) {
      if (clientDisconnected) {
        logger.info("Chat stream aborted — client disconnected", {
          conversationId: input.conversationId,
          ...req.context,
        });
        break;
      }

      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
  } catch (error: unknown) {
    logger.error("Chat completion stream error", {
      error: getErrorMessage(error),
      ...req.context,
    });

    // Try to send error chunk if headers already sent
    if (res.headersSent) {
      const errorChunk = JSON.stringify({
        type: "error",
        error: "Stream interrupted unexpectedly.",
      });
      res.write(`data: ${errorChunk}\n\n`);
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

/**
 * GET /api/v1/chat/conversations
 *
 * Lists conversations for the authenticated user.
 */
const handleListConversations = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;

  if (!userId) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleListConversations",
    });
  }

  const limit = parseLimit(req.query.limit, CHAT_DEFAULTS.DEFAULT_CONVERSATIONS_LIMIT);
  const conversations = await getChatContainer().chatService.listConversations(
    tenantId,
    userId,
    limit,
    req.context
  );

  res.status(HTTP_STATUS.OK).json({ data: conversations });
});

/**
 * GET /api/v1/chat/conversations/:id/messages
 *
 * Gets messages for a specific conversation.
 * Verifies the conversation belongs to the authenticated user (tenant + userId).
 */
const handleGetMessages = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;
  const conversationId = req.params.id;

  if (!userId) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGetMessages",
    });
  }

  if (!conversationId) {
    throw new ValidationError("Conversation ID is required", {
      operation: "handleGetMessages",
    });
  }

  const limit = parseLimit(req.query.limit, CHAT_DEFAULTS.DEFAULT_MESSAGES_LIMIT);
  // Service-level ownership check — verifies conversation belongs to the user
  const messages = await getChatContainer().chatService.getMessages(
    conversationId,
    tenantId,
    userId,
    limit,
    req.context
  );

  res.status(HTTP_STATUS.OK).json({ data: messages });
});

/**
 * DELETE /api/v1/chat/conversations/:id
 *
 * Deletes a conversation and all its messages.
 */
const handleDeleteConversation = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;
  const conversationId = req.params.id;

  if (!userId) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleDeleteConversation",
    });
  }

  if (!conversationId) {
    throw new ValidationError("Conversation ID is required", {
      operation: "handleDeleteConversation",
    });
  }

  // Verify ownership before deleting
  await requireConversationOwnership(
    conversationId,
    tenantId,
    userId,
    req.context,
    "handleDeleteConversation"
  );

  const deleted = await getChatContainer().chatService.deleteConversation(
    conversationId,
    tenantId,
    req.context
  );

  if (!deleted) {
    throw new NotFoundError("Conversation not found", {
      metadata: { conversationId },
    });
  }

  res.status(HTTP_STATUS.OK).json({ data: { deleted: true } });
});

/**
 * PUT /api/v1/chat/conversations/:id
 *
 * Updates a conversation's title.
 */
const handleUpdateConversation = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;
  const conversationId = req.params.id;

  if (!userId) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleUpdateConversation",
    });
  }

  if (!conversationId) {
    throw new ValidationError("Conversation ID is required", {
      operation: "handleUpdateConversation",
    });
  }

  const { title } = req.body as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length === 0) {
    throw new ValidationError("title is required and must be a non-empty string", {
      operation: "handleUpdateConversation",
    });
  }

  if (title.length > CHAT_DEFAULTS.MAX_TITLE_LENGTH) {
    throw new ValidationError(
      `title must be at most ${String(CHAT_DEFAULTS.MAX_TITLE_LENGTH)} characters`,
      { operation: "handleUpdateConversation" }
    );
  }

  // Verify ownership before updating
  await requireConversationOwnership(
    conversationId,
    tenantId,
    userId,
    req.context,
    "handleUpdateConversation"
  );

  const updated = await getChatContainer().chatService.updateConversationTitle(
    conversationId,
    tenantId,
    title.trim(),
    req.context
  );

  if (!updated) {
    throw new NotFoundError("Conversation not found", {
      metadata: { conversationId },
    });
  }

  res.status(HTTP_STATUS.OK).json({ data: updated });
});

// ==================== Route Definitions ====================

router.post(
  "/api/v1/chat/completions",
  rateLimitByCategory("expensive"),
  chatUserRateLimit(),
  handleChatCompletion
);

router.get("/api/v1/chat/conversations", rateLimitByCategory("readonly"), handleListConversations);

router.get(
  "/api/v1/chat/conversations/:id/messages",
  rateLimitByCategory("readonly"),
  handleGetMessages
);

router.put(
  "/api/v1/chat/conversations/:id",
  rateLimitByCategory("standard"),
  handleUpdateConversation
);

router.delete(
  "/api/v1/chat/conversations/:id",
  rateLimitByCategory("standard"),
  handleDeleteConversation
);

export { router as chatRoutes };
