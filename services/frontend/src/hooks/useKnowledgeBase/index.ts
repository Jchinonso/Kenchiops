/**
 * Knowledge Base Hooks Module
 *
 * Hooks for the knowledge base browser page.
 *
 * @module hooks/useKnowledgeBase
 */

export type {
  KnowledgeDocDTO,
  KnowledgeDocListResponse,
  KnowledgeBaseStats,
  KnowledgeBaseTenantStats,
} from "./types";

export { useKnowledgeBaseStats, useKnowledgeDocuments } from "./hooks";
