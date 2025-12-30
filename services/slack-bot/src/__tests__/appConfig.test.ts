/**
 * Unit tests for Application Configuration
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { loadAppConfig } from "../config/appConfig.js";
import type { AppConfig } from "../config/appConfig.js";

// Mock @kenchi/shared module
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    config: {
      SLACK_BOT_TOKEN: "xoxb-test-token",
      SLACK_SIGNING_SECRET: "test-signing-secret",
      SLACK_APP_LEVEL_TOKEN: "xapp-test-app-token",
      NODE_ENV: "test",
    },
    SERVICE_PORTS: {
      API: 3000,
      SLACK_BOT_HTTP: 3001,
      SLACK_BOT_WEBHOOK: 3002,
      GITHUB_APP: 3003,
    },
  };
});

describe("Application Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.env to original state
    process.env = { ...originalEnv };
    // Clear PORT and SLACK_WEBHOOK_PORT for clean state
    delete process.env.PORT;
    delete process.env.SLACK_WEBHOOK_PORT;

    // Reset the mock config to default values
    const { config } = jest.requireMock("@kenchi/shared") as {
      config: Record<string, string | undefined>;
    };
    config.SLACK_BOT_TOKEN = "xoxb-test-token";
    config.SLACK_SIGNING_SECRET = "test-signing-secret";
    config.SLACK_APP_LEVEL_TOKEN = "xapp-test-app-token";
    config.NODE_ENV = "test";
  });

  describe("loadAppConfig", () => {
    it("should successfully load config when all required values are present", () => {
      const config = loadAppConfig();

      expect(config).toBeDefined();
      expect(config.slackBotToken).toBe("xoxb-test-token");
      expect(config.slackSigningSecret).toBe("test-signing-secret");
      expect(config.slackAppToken).toBe("xapp-test-app-token");
      expect(config.nodeEnv).toBe("test");
    });

    it("should throw ValidationError when SLACK_BOT_TOKEN is missing", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_BOT_TOKEN = undefined;

      expect(() => loadAppConfig()).toThrow("SLACK_BOT_TOKEN is required");
    });

    it("should throw ValidationError when SLACK_SIGNING_SECRET is missing", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_SIGNING_SECRET = undefined;

      expect(() => loadAppConfig()).toThrow("SLACK_SIGNING_SECRET is required");
    });

    it("should throw ValidationError when SLACK_APP_LEVEL_TOKEN is missing", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_APP_LEVEL_TOKEN = undefined;

      expect(() => loadAppConfig()).toThrow("SLACK_APP_LEVEL_TOKEN is required for Socket Mode");
    });

    it("should use default ports when PORT and SLACK_WEBHOOK_PORT not set", () => {
      delete process.env.PORT;
      delete process.env.SLACK_WEBHOOK_PORT;

      const config = loadAppConfig();

      expect(config.httpPort).toBe(3001); // SERVICE_PORTS.SLACK_BOT_HTTP
      expect(config.slackWebhookPort).toBe(3002); // SERVICE_PORTS.SLACK_BOT_WEBHOOK
    });

    it("should use custom ports when environment variables are set", () => {
      process.env.PORT = "4000";
      process.env.SLACK_WEBHOOK_PORT = "4001";

      const config = loadAppConfig();

      expect(config.httpPort).toBe(4000);
      expect(config.slackWebhookPort).toBe(4001);
    });

    it("should use default NODE_ENV when not set", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.NODE_ENV = undefined;

      const appConfig = loadAppConfig();

      expect(appConfig.nodeEnv).toBe("development");
    });

    it("should return readonly AppConfig interface", () => {
      const config = loadAppConfig();

      // TypeScript ensures this at compile time, but we can verify structure
      expect(config).toHaveProperty("httpPort");
      expect(config).toHaveProperty("slackWebhookPort");
      expect(config).toHaveProperty("slackBotToken");
      expect(config).toHaveProperty("slackSigningSecret");
      expect(config).toHaveProperty("slackAppToken");
      expect(config).toHaveProperty("nodeEnv");
    });

    it("should parse PORT as integer", () => {
      process.env.PORT = "5000";

      const config = loadAppConfig();

      expect(config.httpPort).toBe(5000);
      expect(typeof config.httpPort).toBe("number");
    });

    it("should parse SLACK_WEBHOOK_PORT as integer", () => {
      process.env.SLACK_WEBHOOK_PORT = "5001";

      const config = loadAppConfig();

      expect(config.slackWebhookPort).toBe(5001);
      expect(typeof config.slackWebhookPort).toBe("number");
    });

    it("should preserve actual token values", () => {
      const { config: mockConfig } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      mockConfig.SLACK_BOT_TOKEN = "xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx";
      mockConfig.SLACK_SIGNING_SECRET = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
      mockConfig.SLACK_APP_LEVEL_TOKEN =
        "xapp-1-A01234567-1234567890123-abcdefghijklmnopqrstuvwxyz123456";

      const config = loadAppConfig();

      expect(config.slackBotToken).toBe("xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx");
      expect(config.slackSigningSecret).toBe("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6");
      expect(config.slackAppToken).toBe(
        "xapp-1-A01234567-1234567890123-abcdefghijklmnopqrstuvwxyz123456"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty string for SLACK_BOT_TOKEN as missing", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_BOT_TOKEN = "";

      expect(() => loadAppConfig()).toThrow("SLACK_BOT_TOKEN is required");
    });

    it("should handle empty string for SLACK_SIGNING_SECRET as missing", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_SIGNING_SECRET = "";

      expect(() => loadAppConfig()).toThrow("SLACK_SIGNING_SECRET is required");
    });

    it("should handle empty string for SLACK_APP_LEVEL_TOKEN as missing", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_APP_LEVEL_TOKEN = "";

      expect(() => loadAppConfig()).toThrow("SLACK_APP_LEVEL_TOKEN is required for Socket Mode");
    });

    it("should handle PORT with leading zeros", () => {
      process.env.PORT = "08080";

      const config = loadAppConfig();

      expect(config.httpPort).toBe(8080);
    });

    it("should handle SLACK_WEBHOOK_PORT with leading zeros", () => {
      process.env.SLACK_WEBHOOK_PORT = "08081";

      const config = loadAppConfig();

      expect(config.slackWebhookPort).toBe(8081);
    });

    it("should handle PORT as string number", () => {
      process.env.PORT = "3333";

      const config = loadAppConfig();

      expect(config.httpPort).toBe(3333);
      expect(typeof config.httpPort).toBe("number");
    });

    it("should handle very high port numbers", () => {
      process.env.PORT = "65535";
      process.env.SLACK_WEBHOOK_PORT = "65534";

      const config = loadAppConfig();

      expect(config.httpPort).toBe(65535);
      expect(config.slackWebhookPort).toBe(65534);
    });

    it("should handle production NODE_ENV", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.NODE_ENV = "production";

      const appConfig = loadAppConfig();

      expect(appConfig.nodeEnv).toBe("production");
    });

    it("should handle development NODE_ENV", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.NODE_ENV = "development";

      const appConfig = loadAppConfig();

      expect(appConfig.nodeEnv).toBe("development");
    });

    it("should handle test NODE_ENV", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.NODE_ENV = "test";

      const appConfig = loadAppConfig();

      expect(appConfig.nodeEnv).toBe("test");
    });

    it("should prioritize first missing config in validation", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_BOT_TOKEN = undefined;
      config.SLACK_SIGNING_SECRET = undefined;
      config.SLACK_APP_LEVEL_TOKEN = undefined;

      // Should throw for SLACK_BOT_TOKEN first (order matters)
      expect(() => loadAppConfig()).toThrow("SLACK_BOT_TOKEN is required");
    });

    it("should throw for second missing config when first is present", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_BOT_TOKEN = "xoxb-valid";
      config.SLACK_SIGNING_SECRET = undefined;
      config.SLACK_APP_LEVEL_TOKEN = "xapp-valid";

      expect(() => loadAppConfig()).toThrow("SLACK_SIGNING_SECRET is required");
    });

    it("should accept whitespace in token values", () => {
      const { config: mockConfig } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      // Some tokens might have whitespace (though unlikely in practice)
      mockConfig.SLACK_BOT_TOKEN = "  xoxb-token-with-spaces  ";

      const config = loadAppConfig();

      // Function doesn't trim, preserves exact values
      expect(config.slackBotToken).toBe("  xoxb-token-with-spaces  ");
    });

    it("should handle custom NODE_ENV values", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.NODE_ENV = "staging";

      const appConfig = loadAppConfig();

      expect(appConfig.nodeEnv).toBe("staging");
    });
  });

  describe("type safety", () => {
    it("should return config with correct types", () => {
      const config: AppConfig = loadAppConfig();

      // Runtime type checks
      expect(typeof config.httpPort).toBe("number");
      expect(typeof config.slackWebhookPort).toBe("number");
      expect(typeof config.slackBotToken).toBe("string");
      expect(typeof config.slackSigningSecret).toBe("string");
      expect(typeof config.slackAppToken).toBe("string");
      expect(typeof config.nodeEnv).toBe("string");
    });

    it("should ensure all required fields are present", () => {
      const config = loadAppConfig();

      const requiredFields: Array<keyof AppConfig> = [
        "httpPort",
        "slackWebhookPort",
        "slackBotToken",
        "slackSigningSecret",
        "slackAppToken",
        "nodeEnv",
      ];

      requiredFields.forEach((field) => {
        expect(config[field]).toBeDefined();
      });
    });

    it("should not have extra properties", () => {
      const config = loadAppConfig();

      const expectedKeys = [
        "httpPort",
        "slackWebhookPort",
        "slackBotToken",
        "slackSigningSecret",
        "slackAppToken",
        "nodeEnv",
        "serviceName",
        "version",
      ];

      const actualKeys = Object.keys(config);
      expect(actualKeys.sort()).toEqual(expectedKeys.sort());
    });
  });

  describe("validation behavior", () => {
    it("should validate all required configs before returning", () => {
      // All configs present - should not throw
      expect(() => loadAppConfig()).not.toThrow();
    });

    it("should fail fast on first missing config", () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      config.SLACK_BOT_TOKEN = undefined;

      // Should throw immediately, not attempt to continue
      expect(() => loadAppConfig()).toThrow();
    });

    it("should use ValidationError class from shared package", () => {
      const { config, ValidationError } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
        ValidationError: new (message: string) => Error;
      };
      config.SLACK_BOT_TOKEN = undefined;

      expect(() => loadAppConfig()).toThrow(ValidationError);
    });
  });

  describe("environment variable handling", () => {
    it("should read PORT from process.env", () => {
      process.env.PORT = "7000";

      const config = loadAppConfig();

      expect(config.httpPort).toBe(7000);
    });

    it("should read SLACK_WEBHOOK_PORT from process.env", () => {
      process.env.SLACK_WEBHOOK_PORT = "7001";

      const config = loadAppConfig();

      expect(config.slackWebhookPort).toBe(7001);
    });

    it("should handle both custom ports simultaneously", () => {
      process.env.PORT = "8000";
      process.env.SLACK_WEBHOOK_PORT = "8001";

      const config = loadAppConfig();

      expect(config.httpPort).toBe(8000);
      expect(config.slackWebhookPort).toBe(8001);
    });

    it("should handle only PORT being set", () => {
      process.env.PORT = "9000";
      delete process.env.SLACK_WEBHOOK_PORT;

      const config = loadAppConfig();

      expect(config.httpPort).toBe(9000);
      expect(config.slackWebhookPort).toBe(3002); // Default
    });

    it("should handle only SLACK_WEBHOOK_PORT being set", () => {
      delete process.env.PORT;
      process.env.SLACK_WEBHOOK_PORT = "9001";

      const config = loadAppConfig();

      expect(config.httpPort).toBe(3001); // Default
      expect(config.slackWebhookPort).toBe(9001);
    });
  });
});
