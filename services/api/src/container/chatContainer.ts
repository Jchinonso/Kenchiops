/**
 * Chat Composition Root
 *
 * Wires the chat service with its dependencies: LLM adapter, context adapter,
 * budget port, and repository port. Returns a container with the fully
 * assembled chat subsystem.
 *
 * @module container/chatContainer
 */

import {
  createChatService,
  checkChatBudget,
  incrementChatTokenUsage,
  createConversation,
  createMessage,
  getMessagesByConversation,
  getConversationTokenCount,
  deleteOldestMessages,
  findConversationsByUser,
  findConversationById,
  deleteConversation,
  updateConversationTitle,
  countConversationsByUser,
  countMessagesByConversation,
  config,
  createLogger,
  createInvestigationService,
  createMonitoringPort,
  createInvestigationSearchAdapter,
  createLLMCompletionAdapter,
  createDatadogMonitoringAdapter,
  createGrafanaMonitoringAdapter,
  createPrometheusMonitoringAdapter,
  createPagerDutyMonitoringAdapter,
  createVercelMonitoringAdapter,
  createNetlifyMonitoringAdapter,
  type ChatRepositoryPort,
  type ChatService,
  type MonitoringAdapter,
} from "@kenchi/shared";
import { createChatLLMAdapter } from "../adapters/chatLLMAdapter.js";
import { createChatContextAdapter } from "../adapters/chatContextAdapter.js";
import {
  createChatInvestigationAdapter,
  type ChatInvestigationAdapter,
} from "../adapters/chatInvestigationAdapter.js";

// ==================== Repository Port Adapter ====================

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
  getConversationTokenCount: async (conversationId, context) =>
    getConversationTokenCount(conversationId, context),
  deleteOldestMessages: async (conversationId, count, context) =>
    deleteOldestMessages(conversationId, count, context),
  countConversationsByUser: async (tenantId, userId, context) =>
    countConversationsByUser(tenantId, userId, context),
  countMessagesByConversation: async (conversationId, context) =>
    countMessagesByConversation(conversationId, context),
};

// ==================== Container Type ====================

/** Chat subsystem container. */
export interface ChatContainer {
  readonly chatService: ChatService;
}

// ==================== Factory ====================

// Lazy-init to avoid crashing the API service on startup if LLM config is missing
// let: singleton initialized on first use
let chatContainerInstance: ChatContainer | null = null; // let: lazy singleton

/**
 * Returns the chat container, creating it on first call (lazy singleton).
 * Lazy initialization avoids startup crashes when LLM config is missing.
 */
export const getChatContainer = (): ChatContainer => {
  if (!chatContainerInstance) {
    chatContainerInstance = createChatContainer();
  }
  return chatContainerInstance;
};

const containerLogger = createLogger("chat-container");

/**
 * Creates the investigation adapter only if at least one monitoring
 * provider is configured. Returns undefined otherwise for graceful degradation.
 */
const createInvestigationAdapterIfConfigured = (): ChatInvestigationAdapter | undefined => {
  const monitoringAdapters: readonly MonitoringAdapter[] = [
    ...(config.DATADOG_API_KEY && config.DATADOG_APP_KEY
      ? [
          createDatadogMonitoringAdapter(
            config.DATADOG_API_KEY,
            config.DATADOG_APP_KEY,
            config.DATADOG_API_BASE_URL ?? "https://api.datadoghq.com"
          ),
        ]
      : []),
    ...(config.PAGERDUTY_API_TOKEN
      ? [createPagerDutyMonitoringAdapter(config.PAGERDUTY_API_TOKEN)]
      : []),
    ...(config.GRAFANA_API_TOKEN
      ? [
          createGrafanaMonitoringAdapter(
            config.GRAFANA_API_TOKEN,
            config.GRAFANA_API_BASE_URL ?? ""
          ),
        ]
      : []),
    ...(config.PROMETHEUS_API_BASE_URL
      ? [createPrometheusMonitoringAdapter(config.PROMETHEUS_API_BASE_URL)]
      : []),
    ...(config.VERCEL_API_TOKEN
      ? [createVercelMonitoringAdapter(config.VERCEL_API_TOKEN, config.VERCEL_TEAM_ID ?? "")]
      : []),
    ...(config.NETLIFY_API_TOKEN
      ? [createNetlifyMonitoringAdapter(config.NETLIFY_API_TOKEN, config.NETLIFY_SITE_ID ?? "")]
      : []),
  ];

  const configuredCount = monitoringAdapters.length;
  if (configuredCount === 0) {
    containerLogger.info("No monitoring adapters configured — investigation disabled");
    return undefined;
  }

  containerLogger.info("Investigation pipeline enabled", {
    configuredAdapters: configuredCount,
  });

  const monitoringPort = createMonitoringPort(monitoringAdapters);
  const llmCompletionPort = createLLMCompletionAdapter();
  const investigationSearchPort = createInvestigationSearchAdapter();

  const investigationService = createInvestigationService(
    llmCompletionPort,
    investigationSearchPort,
    monitoringPort,
    { llmModel: config.TRIAGE_LLM_MODEL || undefined }
  );

  return createChatInvestigationAdapter(investigationService);
};

/**
 * Creates the chat container with all dependencies wired.
 */
const createChatContainer = (): ChatContainer => {
  const investigationAdapter = createInvestigationAdapterIfConfigured();

  const chatService = createChatService({
    chatRepository: chatRepositoryAdapter,
    llmPort: createChatLLMAdapter(),
    contextPort: createChatContextAdapter(investigationAdapter),
    budgetPort: {
      checkBudget: checkChatBudget,
      incrementUsage: incrementChatTokenUsage,
    },
  });

  return { chatService };
};
