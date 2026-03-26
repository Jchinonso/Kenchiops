/**
 * Sentry Context Adapter Tests
 *
 * Tests for the Sentry enrichment adapter: API call construction,
 * stack trace extraction, breadcrumb mapping, severity mapping,
 * time window calculation, error resilience, and empty token handling.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext } from "@kenchi/shared";

const mockResilientGet = jest.fn();
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
const mockCreateLogger = jest.fn(() => mockLoggerInstance);

jest.mock("@kenchi/shared", () => ({
  ...jest.requireActual("@kenchi/shared"),
  resilientGet: (...args: unknown[]) => mockResilientGet(...args),
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createSentryContextAdapter } from "./sentryContextAdapter.js";
import type { NormalizedAlert } from "../types/incidentTypes.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_TOKEN = "sntrx_test-api-token-123";
const TEST_ORG_SLUG = "kenchi-org";

const createTestAlert = (overrides: Partial<NormalizedAlert> = {}): NormalizedAlert => ({
  sourceAlertId: "issue-123",
  deliveryId: "delivery-abc",
  source: "sentry",
  title: "TypeError: Cannot read properties of undefined",
  description: "app/components/UserProfile.tsx",
  severity: "high",
  fingerprint: "fp-123",
  serviceName: "web-app",
  environment: null,
  metrics: {},
  labels: {},
  receivedAt: "2026-03-26T14:00:00.000Z",
  sourcePayload: {},
  ...overrides,
});

const createSentryEventResponse = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  eventID: "event-456",
  context: {},
  entries: [],
  tags: [
    { key: "browser", value: "Chrome" },
    { key: "os", value: "macOS" },
  ],
  dateCreated: "2026-03-26T13:59:00.000Z",
  message: "TypeError: Cannot read properties of undefined",
  ...overrides,
});

const createExceptionEntry = (
  frames: Array<Record<string, unknown>> = []
): Record<string, unknown> => ({
  type: "exception",
  data: {
    values: [
      {
        type: "TypeError",
        value: "Cannot read properties of undefined",
        stacktrace: {
          frames:
            frames.length > 0
              ? frames
              : [
                  {
                    filename: "app/components/UserProfile.tsx",
                    function: "render",
                    lineNo: 42,
                    colNo: 10,
                    context: [
                      [41, "  const name = user.name;"],
                      [42, "  return <div>{name}</div>;"],
                    ],
                    inApp: true,
                  },
                  {
                    filename: "node_modules/react/index.js",
                    function: "createElement",
                    lineNo: 100,
                    colNo: null,
                    context: [],
                    inApp: false,
                  },
                ],
        },
      },
    ],
  },
});

const createBreadcrumbEntry = (): Record<string, unknown> => ({
  type: "breadcrumbs",
  data: {
    values: [
      {
        timestamp: "2026-03-26T13:58:00.000Z",
        category: "navigation",
        message: "/dashboard -> /profile",
        level: "info",
      },
      {
        timestamp: "2026-03-26T13:58:30.000Z",
        category: "http",
        message: "GET /api/user/123",
        level: "warning",
        data: { statusCode: 500 },
      },
      {
        timestamp: "2026-03-26T13:59:00.000Z",
        category: "console",
        message: "User fetch failed",
        level: "error",
      },
    ],
  },
});

// ==================== Tests ====================

describe("createSentryContextAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchContext", () => {
    it("should return empty AlertContext when API token is empty", async () => {
      const adapter = createSentryContextAdapter("", TEST_ORG_SLUG);
      const alert = createTestAlert();

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.source).toBe("sentry");
      expect(result.alertId).toBe("issue-123");
      expect(result.evidence.stackTraces).toEqual([]);
      expect(result.evidence.breadcrumbs).toEqual([]);
      expect(mockResilientGet).not.toHaveBeenCalled();
    });

    it("should call correct Sentry API endpoint with auth header", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse(),
        status: 200,
      });

      await adapter.fetchContext(alert, testContext);

      expect(mockResilientGet).toHaveBeenCalledWith(
        "https://sentry.io/api/0/issues/issue-123/events/latest/",
        expect.objectContaining({
          headers: { Authorization: `Bearer ${TEST_TOKEN}` },
        })
      );
    });

    it("should URL-encode the issue ID in the API path", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert({ sourceAlertId: "issue/with spaces" });

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse(),
        status: 200,
      });

      await adapter.fetchContext(alert, testContext);

      expect(mockResilientGet).toHaveBeenCalledWith(
        expect.stringContaining("issue%2Fwith%20spaces"),
        expect.any(Object)
      );
    });

    it("should extract stack traces from exception entries", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({
          entries: [createExceptionEntry()],
        }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.stackTraces).toHaveLength(2);
      expect(result.evidence.stackTraces[0]).toEqual({
        filename: "app/components/UserProfile.tsx",
        function: "render",
        lineno: 42,
        colno: 10,
        context: ["41:   const name = user.name;", "42:   return <div>{name}</div>;"],
        inApp: true,
      });
      expect(result.evidence.stackTraces[1]).toEqual({
        filename: "node_modules/react/index.js",
        function: "createElement",
        lineno: 100,
        colno: undefined,
        context: [],
        inApp: false,
      });
    });

    it("should handle exception entries with null stacktrace", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({
          entries: [
            {
              type: "exception",
              data: {
                values: [{ type: "Error", value: "test", stacktrace: null }],
              },
            },
          ],
        }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.stackTraces).toEqual([]);
    });

    it("should handle missing exception entry gracefully", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({ entries: [] }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.stackTraces).toEqual([]);
    });

    it("should extract breadcrumbs from breadcrumb entries", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({
          entries: [createBreadcrumbEntry()],
        }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.breadcrumbs).toHaveLength(3);
      expect(result.evidence.breadcrumbs[0]).toEqual({
        timestamp: "2026-03-26T13:58:00.000Z",
        category: "navigation",
        message: "/dashboard -> /profile",
        level: "info",
        data: undefined,
      });
      expect(result.evidence.breadcrumbs[2]).toEqual(
        expect.objectContaining({
          category: "console",
          level: "error",
        })
      );
    });

    it("should handle missing breadcrumb entry gracefully", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({ entries: [] }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.breadcrumbs).toEqual([]);
    });

    it("should map breadcrumb level 'fatal' to 'error'", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({
          entries: [
            {
              type: "breadcrumbs",
              data: {
                values: [
                  {
                    timestamp: "2026-03-26T13:58:00.000Z",
                    category: "test",
                    message: "fatal test",
                    level: "fatal",
                  },
                ],
              },
            },
          ],
        }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.breadcrumbs[0].level).toBe("error");
    });

    it("should default breadcrumb level to 'info' for unrecognized levels", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({
          entries: [
            {
              type: "breadcrumbs",
              data: {
                values: [
                  {
                    timestamp: "2026-03-26T13:58:00.000Z",
                    category: "test",
                    message: "unknown level",
                    level: "trace",
                  },
                ],
              },
            },
          ],
        }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.breadcrumbs[0].level).toBe("info");
    });

    it("should use defaults when stack frame fields are missing", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({
          entries: [
            {
              type: "exception",
              data: {
                values: [
                  {
                    type: "Error",
                    value: "test",
                    stacktrace: {
                      frames: [
                        {
                          /* all fields undefined */
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.stackTraces[0]).toEqual({
        filename: "",
        function: "<unknown>",
        lineno: 0,
        colno: undefined,
        context: undefined,
        inApp: false,
      });
    });

    // -- Severity mapping --

    it("should map critical alert severity to critical AlertContext severity", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert({ severity: "critical" });

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse(),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.severity).toBe("critical");
    });

    it("should map high alert severity to warning AlertContext severity", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert({ severity: "high" });

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse(),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.severity).toBe("warning");
    });

    it("should map low alert severity to info AlertContext severity", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert({ severity: "low" });

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse(),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.severity).toBe("info");
    });

    // -- Time window --

    it("should build time window 1 hour before receivedAt", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert({ receivedAt: "2026-03-26T14:00:00.000Z" });

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse(),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.timeWindow.start).toBe("2026-03-26T13:00:00.000Z");
      expect(result.timeWindow.end).toBe("2026-03-26T14:00:00.000Z");
    });

    // -- Provider metadata --

    it("should populate providerMetadata with eventId, orgSlug, and tags", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      const eventData = createSentryEventResponse();
      mockResilientGet.mockResolvedValueOnce({ data: eventData, status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.providerMetadata).toEqual({
        eventId: "event-456",
        organizationSlug: TEST_ORG_SLUG,
        tags: eventData.tags,
      });
    });

    it("should use event dateCreated as triggeredAt when available", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({ dateCreated: "2026-03-26T13:55:00.000Z" }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.triggeredAt).toBe("2026-03-26T13:55:00.000Z");
    });

    it("should fall back to alert receivedAt when dateCreated is undefined", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({ dateCreated: undefined }),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.triggeredAt).toBe("2026-03-26T14:00:00.000Z");
    });

    // -- Error resilience --

    it("should return empty AlertContext when API call fails", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.source).toBe("sentry");
      expect(result.alertId).toBe("issue-123");
      expect(result.evidence.stackTraces).toEqual([]);
      expect(result.evidence.breadcrumbs).toEqual([]);
      expect(result.providerMetadata).toEqual({});
    });

    it("should log warning with context when API call fails", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockRejectedValueOnce(new Error("timeout exceeded"));

      await adapter.fetchContext(alert, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
        "Sentry enrichment failed",
        expect.objectContaining({
          provider: "sentry",
          operation: "fetchContext",
          durationMs: expect.any(Number),
          retryable: true,
          requestId: "test-request-id",
          tenantId: "test-tenant",
        })
      );
    });

    it("should classify 5xx errors as retryable", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      const error = new Error("Internal Server Error");
      (error as Record<string, unknown>).status = 500;
      mockResilientGet.mockRejectedValueOnce(error);

      await adapter.fetchContext(alert, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
        "Sentry enrichment failed",
        expect.objectContaining({ retryable: true, statusCode: 500 })
      );
    });

    it("should classify 4xx errors as non-retryable", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      const error = new Error("Not Found");
      (error as Record<string, unknown>).status = 404;
      mockResilientGet.mockRejectedValueOnce(error);

      await adapter.fetchContext(alert, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
        "Sentry enrichment failed",
        expect.objectContaining({ retryable: false, statusCode: 404 })
      );
    });

    // -- Logging on success --

    it("should log enrichment completion with counts", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert();

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse({
          entries: [createExceptionEntry(), createBreadcrumbEntry()],
        }),
        status: 200,
      });

      await adapter.fetchContext(alert, testContext);

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        "Sentry enrichment completed",
        expect.objectContaining({
          provider: "sentry",
          operation: "fetchContext",
          durationMs: expect.any(Number),
          statusCode: 200,
          stackFrameCount: 2,
          breadcrumbCount: 3,
          requestId: "test-request-id",
          tenantId: "test-tenant",
        })
      );
    });

    it("should use description from alert when alert description is null", async () => {
      const adapter = createSentryContextAdapter(TEST_TOKEN, TEST_ORG_SLUG);
      const alert = createTestAlert({ description: null });

      mockResilientGet.mockResolvedValueOnce({
        data: createSentryEventResponse(),
        status: 200,
      });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.description).toBe("");
    });
  });
});
