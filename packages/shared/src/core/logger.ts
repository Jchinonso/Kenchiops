/**
 * Simple structured logger utility.
 *
 * In production, this could be replaced with a more robust solution like Winston or Pino.
 */

import { LOGGER_DEFAULTS } from "../constants/index.js";
import type { StructuredLogEntry, Logger } from "./types.js";

/**
 * Log severity levels in ascending order of importance.
 *
 * Levels are numeric to allow easy comparison (e.g., `level >= LogLevel.WARN`).
 *
 * NOTE: This enum lives here rather than in types.ts because types.ts already
 * has a domain `LogLevel` string union type for evidence log entries.
 */
export enum LogLevel {
  /** Detailed debugging information (most verbose) */
  DEBUG = 0,
  /** General informational messages */
  INFO = 1,
  /** Warning messages for potentially harmful situations */
  WARN = 2,
  /** Error messages for serious problems */
  ERROR = 3,
}

export type { Logger };

/**
 * Console method lookup table for log levels.
 * Maps LogLevel to the appropriate console method.
 */
const CONSOLE_METHODS: Readonly<Record<LogLevel, (message: string) => void>> = {
  [LogLevel.DEBUG]: (msg) => console.log(msg),
  [LogLevel.INFO]: (msg) => console.log(msg),
  [LogLevel.WARN]: (msg) => console.warn(msg),
  [LogLevel.ERROR]: (msg) => console.error(msg),
};

/**
 * Console output function that dispatches to the appropriate console method.
 * Uses lookup table for O(1) dispatch instead of switch statement.
 */
const logToConsole = (level: LogLevel, message: string): void => {
  CONSOLE_METHODS[level](message);
};

class LoggerImpl implements Logger {
  private readonly serviceName: string;
  private readonly minLevel: LogLevel;

  constructor(
    serviceName: string = LOGGER_DEFAULTS.SERVICE_NAME,
    minLevel: LogLevel = LogLevel.INFO
  ) {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }

  private readonly shouldLog = (level: LogLevel): boolean => level >= this.minLevel;

  private readonly formatMessage = (
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): string => {
    const timestamp = new Date().toISOString();
    const entry: StructuredLogEntry = {
      level,
      message,
      timestamp,
      service: this.serviceName,
      ...(metadata && { metadata }),
    };

    return JSON.stringify(entry);
  };

  private readonly log = (
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): void => {
    if (!this.shouldLog(level)) {
      return;
    }

    const formatted = this.formatMessage(level, message, metadata);
    logToConsole(level, formatted);
  };

  readonly debug = (message: string, metadata?: Record<string, unknown>): void => {
    this.log(LogLevel.DEBUG, message, metadata);
  };

  readonly info = (message: string, metadata?: Record<string, unknown>): void => {
    this.log(LogLevel.INFO, message, metadata);
  };

  readonly warn = (message: string, metadata?: Record<string, unknown>): void => {
    this.log(LogLevel.WARN, message, metadata);
  };

  readonly error = (message: string, metadata?: Record<string, unknown>): void => {
    this.log(LogLevel.ERROR, message, metadata);
  };
}

/**
 * Create a logger instance for a specific service.
 */
export const createLogger = (serviceName: string, minLevel: LogLevel = LogLevel.INFO): Logger =>
  new LoggerImpl(serviceName, minLevel);

/**
 * Default logger instance.
 */
export const logger = createLogger(LOGGER_DEFAULTS.SERVICE_NAME);
