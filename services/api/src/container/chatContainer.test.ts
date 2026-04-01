/**
 * Tests for container/chatContainer — chat subsystem composition root.
 *
 * Verifies container creation, singleton behavior, and conditional
 * investigation adapter wiring based on monitoring provider configuration.
 *
 * @module container/chatContainer.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ==================== Mocks ====================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockConfig = {
  DATADOG_API_KEY: "",
  DATADOG_APP_KEY: "",
  DATADOG_API_BASE_URL: "https://api.datadoghq.com",
  PAGERDUTY_API_TOKEN: "",
  GRAFANA_API_TOKEN: "",
  GRAFANA_API_BASE_URL: "",
  PROMETHEUS_API_BASE_URL: "",
  VERCEL_API_TOKEN: "",
  VERCEL_TEAM_ID: "",
  NETLIFY_API_TOKEN: "",
  NETLIFY_SITE_ID: "",
  TRIAGE_LLM_MODEL: "",
  OPENAI_API_KEY: "test-key",
  LLM_PROVIDER: "openai",
  DATABASE_URL: "postgres://localhost/test",
  VECTOR_DB_URL: "postgres://localhost/test",
};

const mockCreateChatService = jest.fn().mockReturnValue({
  streamCompletion: jest.fn(),
  listConversations: jest.fn(),
  getConversation: jest.fn(),
  getMessages: jest.fn(),
  deleteConversation: jest.fn(),
  updateConversationTitle: jest.fn(),
});

const mockCreateInvestigationService = jest.fn().mockReturnValue({
  parseIntent: jest.fn(),
  gatherEvidence: jest.fn(),
  correlateEvidence: jest.fn(),
  diagnose: jest.fn(),
});

const mockCreateMonitoringPort = jest.fn().mockReturnValue({ fetchEvidence: jest.fn() });
const mockCreateLLMCompletionAdapter = jest.fn().mockReturnValue({});
const mockCreateInvestigationSearchAdapter = jest.fn().mockReturnValue({});

const mockCreateDatadogAdapter = jest
  .fn()
  .mockReturnValue({ name: "datadog", isConfigured: () => true, fetchEvidence: jest.fn() });
const mockCreatePagerDutyAdapter = jest
  .fn()
  .mockReturnValue({ name: "pagerduty", isConfigured: () => true, fetchEvidence: jest.fn() });
const mockCreateGrafanaAdapter = jest
  .fn()
  .mockReturnValue({ name: "grafana", isConfigured: () => true, fetchEvidence: jest.fn() });
const mockCreatePrometheusAdapter = jest
  .fn()
  .mockReturnValue({ name: "prometheus", isConfigured: () => true, fetchEvidence: jest.fn() });
const mockCreateVercelAdapter = jest
  .fn()
  .mockReturnValue({ name: "vercel", isConfigured: () => true, fetchEvidence: jest.fn() });
const mockCreateNetlifyAdapter = jest
  .fn()
  .mockReturnValue({ name: "netlify", isConfigured: () => true, fetchEvidence: jest.fn() });

const mockCreateChatContextAdapter = jest.fn().mockReturnValue({
  getAnalysisContext: jest.fn(),
  getIncidentContext: jest.fn(),
  searchRAG: jest.fn(),
});

const mockCreateChatLLMAdapter = jest.fn().mockReturnValue({
  createStreamingCompletion: jest.fn(),
});

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual<typeof import("@kenchi/shared")>("@kenchi/shared");
  return {
    ...actual,
    config: mockConfig,
    createLogger: () => mockLogger,
    createChatService: (...args: unknown[]) => mockCreateChatService(...args),
    createInvestigationService: (...args: unknown[]) => mockCreateInvestigationService(...args),
    createMonitoringPort: (...args: unknown[]) => mockCreateMonitoringPort(...args),
    createLLMCompletionAdapter: (...args: unknown[]) => mockCreateLLMCompletionAdapter(...args),
    createInvestigationSearchAdapter: (...args: unknown[]) =>
      mockCreateInvestigationSearchAdapter(...args),
    createDatadogMonitoringAdapter: (...args: unknown[]) => mockCreateDatadogAdapter(...args),
    createPagerDutyMonitoringAdapter: (...args: unknown[]) => mockCreatePagerDutyAdapter(...args),
    createGrafanaMonitoringAdapter: (...args: unknown[]) => mockCreateGrafanaAdapter(...args),
    createPrometheusMonitoringAdapter: (...args: unknown[]) => mockCreatePrometheusAdapter(...args),
    createVercelMonitoringAdapter: (...args: unknown[]) => mockCreateVercelAdapter(...args),
    createNetlifyMonitoringAdapter: (...args: unknown[]) => mockCreateNetlifyAdapter(...args),
    checkChatBudget: jest.fn(),
    incrementChatTokenUsage: jest.fn(),
    createConversation: jest.fn(),
    createMessage: jest.fn(),
    getMessagesByConversation: jest.fn(),
    getConversationTokenCount: jest.fn(),
    deleteOldestMessages: jest.fn(),
    findConversationsByUser: jest.fn(),
    findConversationById: jest.fn(),
    deleteConversation: jest.fn(),
    updateConversationTitle: jest.fn(),
    countConversationsByUser: jest.fn(),
    countMessagesByConversation: jest.fn(),
  };
});

jest.mock("../adapters/chatLLMAdapter.js", () => ({
  createChatLLMAdapter: (...args: unknown[]) => mockCreateChatLLMAdapter(...args),
}));

jest.mock("../adapters/chatContextAdapter.js", () => ({
  createChatContextAdapter: (...args: unknown[]) => mockCreateChatContextAdapter(...args),
}));

const mockCreateChatInvestigationAdapter = jest.fn().mockReturnValue({
  investigate: jest.fn(),
});

jest.mock("../adapters/chatInvestigationAdapter.js", () => ({
  createChatInvestigationAdapter: (...args: unknown[]) =>
    mockCreateChatInvestigationAdapter(...args),
}));

// ==================== Tests ====================

describe("chatContainer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the cached module to clear the singleton between tests
    jest.resetModules();
  });

  /**
   * Helper to freshly import the container module (clears singleton state).
   */
  const importContainer = async () => {
    const mod = await import("./chatContainer.js");
    return mod;
  };

  it("should return a ChatContainer with chatService property", async () => {
    const { getChatContainer } = await importContainer();
    const container = getChatContainer();

    expect(container).toHaveProperty("chatService");
    expect(mockCreateChatService).toHaveBeenCalled();
  });

  it("should return the same instance on repeated calls (singleton)", async () => {
    const { getChatContainer } = await importContainer();
    const first = getChatContainer();
    const second = getChatContainer();

    expect(first).toBe(second);
    // createChatService should only be called once
    expect(mockCreateChatService).toHaveBeenCalledTimes(1);
  });

  it("should NOT create investigation adapter when no monitoring providers configured", async () => {
    // All provider keys are empty strings (default mockConfig)
    const { getChatContainer } = await importContainer();
    getChatContainer();

    expect(mockCreateChatInvestigationAdapter).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "No monitoring adapters configured — investigation disabled"
    );
    // chatContextAdapter should be called with undefined
    expect(mockCreateChatContextAdapter).toHaveBeenCalledWith(undefined);
  });

  it("should create investigation adapter when at least one provider is configured", async () => {
    // Configure PagerDuty
    mockConfig.PAGERDUTY_API_TOKEN = "pd-test-token";

    const { getChatContainer } = await importContainer();
    getChatContainer();

    expect(mockCreatePagerDutyAdapter).toHaveBeenCalledWith("pd-test-token");
    expect(mockCreateMonitoringPort).toHaveBeenCalled();
    expect(mockCreateInvestigationService).toHaveBeenCalled();
    expect(mockCreateChatInvestigationAdapter).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Investigation pipeline enabled",
      expect.objectContaining({ configuredAdapters: 1 })
    );
    // chatContextAdapter should receive the investigation adapter
    expect(mockCreateChatContextAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ investigate: expect.any(Function) })
    );

    // Clean up
    mockConfig.PAGERDUTY_API_TOKEN = "";
  });

  it("should create multiple monitoring adapters when several providers configured", async () => {
    mockConfig.DATADOG_API_KEY = "dd-key";
    mockConfig.DATADOG_APP_KEY = "dd-app";
    mockConfig.PROMETHEUS_API_BASE_URL = "http://prometheus:9090";

    const { getChatContainer } = await importContainer();
    getChatContainer();

    expect(mockCreateDatadogAdapter).toHaveBeenCalledWith(
      "dd-key",
      "dd-app",
      "https://api.datadoghq.com"
    );
    expect(mockCreatePrometheusAdapter).toHaveBeenCalledWith("http://prometheus:9090");
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Investigation pipeline enabled",
      expect.objectContaining({ configuredAdapters: 2 })
    );

    // Clean up
    mockConfig.DATADOG_API_KEY = "";
    mockConfig.DATADOG_APP_KEY = "";
    mockConfig.PROMETHEUS_API_BASE_URL = "";
  });
});
