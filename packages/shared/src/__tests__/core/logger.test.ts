/**
 * Unit tests for core/logger.ts
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { createLogger, logger, LogLevel } from "../../core/logger.js";

describe("Core Logger", () => {
  // Capture console output
  let consoleSpy: {
    log: ReturnType<typeof jest.spyOn>;
    warn: ReturnType<typeof jest.spyOn>;
    error: ReturnType<typeof jest.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, "log").mockImplementation(() => {}),
      warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
      error: jest.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe("LogLevel enum", () => {
    it("should have correct numeric values", () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
    });

    it("should support level comparison", () => {
      expect(LogLevel.DEBUG < LogLevel.INFO).toBe(true);
      expect(LogLevel.INFO < LogLevel.WARN).toBe(true);
      expect(LogLevel.WARN < LogLevel.ERROR).toBe(true);
      expect(LogLevel.ERROR >= LogLevel.DEBUG).toBe(true);
    });
  });

  describe("createLogger", () => {
    it("should create logger with service name", () => {
      const testLogger = createLogger("test-service");

      testLogger.info("Test message");

      expect(consoleSpy.log).toHaveBeenCalled();
      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.service).toBe("test-service");
    });

    it("should use default minLevel (INFO) when not specified", () => {
      const testLogger = createLogger("test-service");

      testLogger.debug("Debug message");
      testLogger.info("Info message");

      // Debug should not be logged (below INFO)
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      expect(logOutput).toContain("Info message");
    });

    it("should use custom minLevel when specified", () => {
      const testLogger = createLogger("test-service", LogLevel.DEBUG);

      testLogger.debug("Debug message");
      testLogger.info("Info message");

      // Both should be logged
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
    });

    it("should filter logs below minLevel", () => {
      const testLogger = createLogger("test-service", LogLevel.WARN);

      testLogger.debug("Debug message");
      testLogger.info("Info message");
      testLogger.warn("Warn message");
      testLogger.error("Error message");

      // Only warn and error should be logged
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it("should create logger with only service name (no minLevel)", () => {
      const testLogger = createLogger("my-service");

      testLogger.info("Test");

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.service).toBe("my-service");
      expect(parsed.level).toBe(LogLevel.INFO);
    });
  });

  describe("Logger.debug", () => {
    it("should log when minLevel is DEBUG", () => {
      const testLogger = createLogger("test-service", LogLevel.DEBUG);

      testLogger.debug("Debug message");

      expect(consoleSpy.log).toHaveBeenCalled();
      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      expect(logOutput).toContain("Debug message");
    });

    it("should not log when minLevel is higher", () => {
      const testLogger = createLogger("test-service", LogLevel.INFO);

      testLogger.debug("Debug message");

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it("should include metadata when provided", () => {
      const testLogger = createLogger("test-service", LogLevel.DEBUG);

      testLogger.debug("Debug message", { key: "value" });

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.metadata).toEqual({ key: "value" });
    });
  });

  describe("Logger.info", () => {
    it("should log when minLevel is INFO or lower", () => {
      const testLogger = createLogger("test-service", LogLevel.INFO);

      testLogger.info("Info message");

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it("should not log when minLevel is WARN or ERROR", () => {
      const testLogger = createLogger("test-service", LogLevel.WARN);

      testLogger.info("Info message");

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it("should format message as JSON", () => {
      const testLogger = createLogger("test-service");

      testLogger.info("Info message");

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      expect(() => JSON.parse(logOutput)).not.toThrow();
    });

    it("should use console.log for INFO level", () => {
      const testLogger = createLogger("test-service");

      testLogger.info("Info message");

      expect(consoleSpy.log).toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });

  describe("Logger.warn", () => {
    it("should log when minLevel is WARN or lower", () => {
      const testLogger = createLogger("test-service", LogLevel.WARN);

      testLogger.warn("Warn message");

      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it("should not log when minLevel is ERROR", () => {
      const testLogger = createLogger("test-service", LogLevel.ERROR);

      testLogger.warn("Warn message");

      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it("should use console.warn", () => {
      const testLogger = createLogger("test-service");

      testLogger.warn("Warn message");

      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it("should include metadata when provided", () => {
      const testLogger = createLogger("test-service");

      testLogger.warn("Warn message", { warning: "details" });

      const logOutput = consoleSpy.warn.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.metadata).toEqual({ warning: "details" });
    });
  });

  describe("Logger.error", () => {
    it("should always log (ERROR is highest level)", () => {
      const testLogger = createLogger("test-service", LogLevel.ERROR);

      testLogger.error("Error message");

      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it("should use console.error", () => {
      const testLogger = createLogger("test-service");

      testLogger.error("Error message");

      expect(consoleSpy.error).toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it("should include metadata in output", () => {
      const testLogger = createLogger("test-service");

      testLogger.error("Error occurred", { errorCode: "E001", stack: "..." });

      const logOutput = consoleSpy.error.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.metadata).toEqual({ errorCode: "E001", stack: "..." });
    });
  });

  describe("JSON output format", () => {
    it("should include level, message, timestamp, service", () => {
      const testLogger = createLogger("test-service");

      testLogger.info("Test message");

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);

      expect(parsed.level).toBe(LogLevel.INFO);
      expect(parsed.message).toBe("Test message");
      expect(parsed.service).toBe("test-service");
      expect(parsed.timestamp).toBeDefined();
    });

    it("should include metadata when provided", () => {
      const testLogger = createLogger("test-service");

      testLogger.info("Test message", { requestId: "123", userId: "456" });

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);

      expect(parsed.metadata).toEqual({ requestId: "123", userId: "456" });
    });

    it("should not include metadata key when not provided", () => {
      const testLogger = createLogger("test-service");

      testLogger.info("Test message");

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);

      expect(parsed.metadata).toBeUndefined();
    });

    it("should have valid ISO timestamp", () => {
      const testLogger = createLogger("test-service");
      const beforeLog = new Date().toISOString();

      testLogger.info("Test message");

      const afterLog = new Date().toISOString();
      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);

      // Timestamp should be between before and after
      expect(parsed.timestamp >= beforeLog).toBe(true);
      expect(parsed.timestamp <= afterLog).toBe(true);
      expect(() => new Date(parsed.timestamp)).not.toThrow();
    });
  });

  describe("Default logger", () => {
    it("should exist and be usable", () => {
      logger.info("Default logger message");

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it("should have service name 'kenchi'", () => {
      logger.info("Default logger message");

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.service).toBe("kenchi");
    });

    it("should support all log levels", () => {
      const debugLogger = createLogger("test", LogLevel.DEBUG);

      debugLogger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(consoleSpy.log).toHaveBeenCalledTimes(2); // debug + info
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty message", () => {
      const testLogger = createLogger("test-service");

      testLogger.info("");

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.message).toBe("");
    });

    it("should handle empty metadata object", () => {
      const testLogger = createLogger("test-service");

      testLogger.info("Message", {});

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.metadata).toEqual({});
    });

    it("should handle complex metadata", () => {
      const testLogger = createLogger("test-service");
      const complexMetadata = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        nullValue: null,
        boolValue: true,
      };

      testLogger.info("Message", complexMetadata);

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(logOutput);
      expect(parsed.metadata).toEqual(complexMetadata);
    });

    it("should handle special characters in message", () => {
      const testLogger = createLogger("test-service");

      testLogger.info('Message with "quotes" and \n newlines');

      const logOutput = consoleSpy.log.mock.calls[0][0] as string;
      expect(() => JSON.parse(logOutput)).not.toThrow();
    });
  });
});
