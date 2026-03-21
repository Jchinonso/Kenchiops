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
  NotFoundError,
  HTTP_STATUS,
  SERVICE_NAMES,
  CHAT_DEFAULTS,
  getErrorMessage,
  rateLimitByCategory,
  createChatService,
  createConversation,
  createMessage,
  getMessagesByConversation,
  getConversationTokenCount,
  deleteOldestMessages,
  findConversationsByUser,
  findConversationById,
  deleteConversation,
  updateConversationTitle,
  type ChatCompletionInput,
  type ChatPageContext,
  type ChatPageType,
  type ChatRepositoryPort,
} from "@kenchi/shared";
import { createChatLLMAdapter } from "../adapters/chatLLMAdapter.js";
import { createChatContextAdapter } from "../adapters/chatContextAdapter.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Constants ====================

const VALID_PAGE_TYPES: ReadonlySet<ChatPageType> = new Set([
  "analysis",
  "incident",
  "knowledge-base",
  "overview",
  "failures",
]);

// ==================== Chat Repository Adapter ====================

/**
 * Wraps the standalone repository functions into the ChatRepositoryPort interface.
 * This adapter bridges the concrete repository exports to the port abstraction.
 */
const chatRepositoryAdapter: ChatRepositoryPort = {
  createConversation: async (input, context) => createConversation(input, context),
  createMessage: async (input, context) => createMessage(input, context),
  getMessagesByConversation: async (conversationId, limit, context) =>
    getMessagesByConversation(conversationId, limit, context),
  findConversationsByUser: async (tenantId, userId, limit, context) =>
    findConversationsByUser(tenantId, userId, limit, context),
  findConversationById: async (id, tenantId, context) =>
    findConversationById(id, tenantId, context),
  deleteConversation: async (id, tenantId, context) => deleteConversation(id, tenantId, context),
  updateConversationTitle: async (id, tenantId, title, context) =>
    updateConversationTitle(id, tenantId, title, context),
  getConversationTokenCount: async (conversationId) => getConversationTokenCount(conversationId),
  deleteOldestMessages: async (conversationId, count, context) =>
    deleteOldestMessages(conversationId, count, context),
};

// ==================== Service Instantiation ====================

// Lazy-init to avoid crashing the API service on startup if LLM config is missing
// let: singleton initialized on first use
let chatServiceInstance: ReturnType<typeof createChatService> | null = null; // let: lazy singleton

const getChatService = (): ReturnType<typeof createChatService> => {
  if (!chatServiceInstance) {
    chatServiceInstance = createChatService({
      chatRepository: chatRepositoryAdapter,
      llmPort: createChatLLMAdapter(),
      contextPort: createChatContextAdapter(),
    });
  }
  return chatServiceInstance;
};

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

  // Validate conversationId (optional)
  if (conversationId !== undefined && typeof conversationId !== "string") {
    throw new ValidationError("conversationId must be a string", {
      operation: "validateChatCompletionBody",
    });
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

  const validatedPageContext: ChatPageContext = {
    pageType: pageType as ChatPageType,
    ...(entityId !== undefined && { entityId: entityId as string }),
    ...(metadata !== undefined && { metadata: metadata as Readonly<Record<string, unknown>> }),
  };

  return {
    conversationId: conversationId as string | undefined,
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

// ==================== Route Handlers ====================

/**
 * POST /api/v1/chat/completions
 *
 * Streaming chat completion endpoint. Returns text/event-stream (SSE).
 * Each event is a JSON-encoded ChatStreamChunk.
 */
const handleChatCompletion = async (req: Request, res: Response): Promise<void> => {
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
    input = validateChatCompletionBody(req.body, tenantId, userId);
  } catch (validationError: unknown) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: {
        code: "VALIDATION_ERROR",
        message: getErrorMessage(validationError),
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

  // Disable socket timeout for streaming (can take 30+ seconds)
  req.socket.setTimeout(0);

  // Track client disconnect
  // let: mutable flag set by event listener
  let clientDisconnected = false; // let: set to true by req close event
  req.on("close", () => {
    clientDisconnected = true;
  });

  try {
    const stream = getChatService().streamCompletion(input, req.context);

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
};

/**
 * GET /api/v1/chat/conversations
 *
 * Lists conversations for the authenticated user.
 */
const handleListConversations = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;

  if (!userId) {
    throw new ValidationError("Authentication required", {
      operation: "handleListConversations",
    });
  }

  const limit = parseLimit(req.query.limit, CHAT_DEFAULTS.DEFAULT_CONVERSATIONS_LIMIT);
  const conversations = await getChatService().listConversations(
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
 * Verifies the conversation belongs to the authenticated user's tenant.
 */
const handleGetMessages = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const conversationId = req.params.id;

  if (!conversationId) {
    throw new ValidationError("Conversation ID is required", {
      operation: "handleGetMessages",
    });
  }

  // Verify conversation exists and belongs to tenant
  const conversation = await getChatService().getConversation(
    conversationId,
    tenantId,
    req.context
  );
  if (!conversation) {
    throw new NotFoundError("Conversation not found", {
      metadata: { conversationId },
    });
  }

  const limit = parseLimit(req.query.limit, CHAT_DEFAULTS.DEFAULT_MESSAGES_LIMIT);
  const messages = await getChatService().getMessages(conversationId, limit, req.context);

  res.status(HTTP_STATUS.OK).json({ data: messages });
});

/**
 * DELETE /api/v1/chat/conversations/:id
 *
 * Deletes a conversation and all its messages.
 */
const handleDeleteConversation = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const conversationId = req.params.id;

  if (!conversationId) {
    throw new ValidationError("Conversation ID is required", {
      operation: "handleDeleteConversation",
    });
  }

  const deleted = await getChatService().deleteConversation(conversationId, tenantId, req.context);

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
  const conversationId = req.params.id;

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

  const updated = await getChatService().updateConversationTitle(
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

router.post("/api/v1/chat/completions", rateLimitByCategory("expensive"), handleChatCompletion);

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
