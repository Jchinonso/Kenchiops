/**
 * Document Modal Builder Types
 *
 * Type definitions for document modal construction.
 */

import type { KnowledgeDocType } from "@kenchi/shared";

/**
 * Document type option for modal dropdown
 */
export interface DocTypeOption {
  readonly value: KnowledgeDocType;
  readonly label: string;
}
