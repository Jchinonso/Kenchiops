/**
 * Document Ingestion Handler Types
 *
 * Type definitions for document ingestion via modal and file upload.
 */

import type { KnowledgeDocType } from "@kenchi/shared";
import type { SlackFileInfo } from "./documentFileProcessor.js";

/**
 * Parsed modal submission values for document ingestion
 */
export interface DocumentModalValues {
  readonly title: string;
  readonly docType: KnowledgeDocType;
  readonly content: string;
  readonly description: string;
}

/**
 * Message with files attached
 */
export interface MessageWithFiles {
  readonly text?: string;
  readonly files?: readonly SlackFileInfo[];
  readonly user?: string;
  readonly channel?: string;
  readonly ts?: string;
}

/**
 * Modal values input type - matches Slack's ViewStateValue
 */
export type ModalValuesInput = Record<
  string,
  Record<string, { value?: string | null; selected_option?: { value: string } | null }>
>;

/**
 * Say function type for Slack responses
 */
export type SayFunction = (text: string) => Promise<void>;
