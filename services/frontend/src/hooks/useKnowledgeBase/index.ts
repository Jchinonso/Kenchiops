/**
 * Knowledge Base Hooks Module
 *
 * Hooks for the knowledge base browser page.
 *
 * @module hooks/useKnowledgeBase
 */

export type { KnowledgeDocDTO, KnowledgeDocListResponse, KnowledgeBaseStats } from "./types";

export { useKnowledgeBaseStats, useKnowledgeDocuments } from "./hooks";
