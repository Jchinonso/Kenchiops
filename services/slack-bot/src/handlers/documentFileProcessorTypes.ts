/**
 * Document File Processor Types
 *
 * Type definitions for file processing and ingestion.
 */

/**
 * File info from Slack API
 */
export interface SlackFileInfo {
  readonly id: string;
  readonly name: string;
  readonly filetype: string;
  readonly size: number;
  readonly url_private: string;
}

/**
 * File ingestion result
 */
export interface FileIngestionResult {
  readonly filename: string;
  readonly success: boolean;
  readonly error?: string;
  readonly chunks?: number;
}

/**
 * Context for file processing
 */
export interface FileProcessingContext {
  readonly userId: string;
  readonly botToken: string;
}
