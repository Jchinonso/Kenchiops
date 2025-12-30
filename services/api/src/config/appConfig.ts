/**
 * API Service Configuration
 *
 * Centralized configuration management with validation
 */

import { config, SERVICE_PORTS, SERVICE_NAMES, SERVICE_VERSIONS } from "@kenchi/shared";

/**
 * API service configuration interface
 */
export interface ApiConfig {
  readonly port: number;
  readonly environment: string;
  readonly serviceName: string;
  readonly version: string;
}

/**
 * Validated API configuration
 */
export const appConfig: ApiConfig = {
  port: config.PORT ? parseInt(String(config.PORT), 10) : SERVICE_PORTS.API,
  environment: config.NODE_ENV || "development",
  serviceName: SERVICE_NAMES.API,
  version: SERVICE_VERSIONS.API,
} as const;
