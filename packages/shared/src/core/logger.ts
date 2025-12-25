/**
 * Simple structured logger utility.
 *
 * In production, this could be replaced with a more robust solution like Winston or Pino.
 */

import { LOGGER_DEFAULTS } from "../constants/index.js";

/**
 * Log severity levels in ascending order of importance.
 *
 * Levels are numeric to allow easy comparison (e.g., `level >= LogLevel.WARN`).
 *
 * @example
 * ```typescript
 * const logger = createLogger('my-service', LogLevel.INFO);
 * logger.debug('This will not be logged'); // Below INFO level
 * logger.info('This will be logged');       // At INFO level
 * logger.warn('This will be logged');       // Above INFO level
 * ```
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

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Logger interface for structured logging.
 */
export interface Logger {
  readonly debug: (message: string, metadata?: Record<string, unknown>) => void;
  readonly info: (message: string, metadata?: Record<string, unknown>) => void;
  readonly warn: (message: string, metadata?: Record<string, unknown>) => void;
  readonly error: (message: string, metadata?: Record<string, unknown>) => void;
}

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

  private readonly shouldLog = (level: LogLevel): boolean => {
    return level >= this.minLevel;
  };

  private readonly formatMessage = (
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): string => {
    const timestamp = new Date().toISOString();
    const entry: LogEntry = {
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
export const createLogger = (serviceName: string, minLevel: LogLevel = LogLevel.INFO): Logger => {
  return new LoggerImpl(serviceName, minLevel);
};

/**
 * Default logger instance.
 */
export const logger = createLogger(LOGGER_DEFAULTS.SERVICE_NAME);
