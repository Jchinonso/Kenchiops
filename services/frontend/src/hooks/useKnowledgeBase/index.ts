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
  AddDocumentInput,
  AddDocumentResponse,
} from "./types";

export {
  useKnowledgeBaseStats,
  useKnowledgeDocuments,
  useAddDocument,
  useDeleteDocument,
  useBulkDeleteDocuments,
  usePurgeAllDocuments,
  useFullDocumentContent,
} from "./hooks";
