/**
 * Knowledge Base Hook Types
 *
 * Types for the knowledge base browser hooks:
 * document listing DTOs and RAG stats shapes.
 */

// ==================== Document Types ====================

export interface KnowledgeDocDTO {
  readonly id: string;
  readonly docType: string;
  readonly title: string;
  readonly content: string;
  readonly repository: string | null;
  readonly sourceUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeDocListResponse {
  readonly items: readonly KnowledgeDocDTO[];
  readonly total: number;
}

// ==================== Mutation Types ====================

export interface AddDocumentInput {
  readonly docType: string;
  readonly title: string;
  readonly content: string;
  readonly repository?: string;
  readonly sourceUrl?: string;
}

export interface AddDocumentResponse {
  readonly id: string;
  readonly docType: string;
  readonly title: string;
}

// ==================== Stats Types ====================

export interface KnowledgeBaseTenantStats {
  readonly tenantId: string;
  readonly diffChunkCount: number;
  readonly knowledgeDocCounts: Record<string, number>;
  readonly pendingEmbeddings: number;
  readonly outdatedEmbeddings: number;
}

export interface KnowledgeBaseStats {
  readonly totalDocuments: number;
  readonly documentsByType: Record<string, number>;
  readonly tenantStats: KnowledgeBaseTenantStats | null;
}
