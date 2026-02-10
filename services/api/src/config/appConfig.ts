/**
 * API Service Configuration
 *
 * Centralized configuration management with validation
 */

import { config, SERVICE_PORTS, SERVICE_NAMES, SERVICE_VERSIONS } from "@kenchi/shared";
import type { ApiConfig } from "../types/apiTypes.js";

// Re-export for backwards compatibility
export type { ApiConfig } from "../types/apiTypes.js";

/**
 * Validated API configuration
 */
export const appConfig: ApiConfig = {
  port: config.PORT ? parseInt(String(config.PORT), 10) : SERVICE_PORTS.API,
  environment: config.NODE_ENV || "development",
  serviceName: SERVICE_NAMES.API,
  version: SERVICE_VERSIONS.API,
  databaseUrl: config.DATABASE_URL,
} as const;
