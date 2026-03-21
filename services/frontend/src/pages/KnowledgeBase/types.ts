/**
 * Shared types for the KnowledgeBase module.
 */

import type { KnowledgeDocDTO } from "@/hooks/useKnowledgeBase";

export interface StatsHeaderProps {
  readonly totalDocuments: number;
  readonly documentsByType: Record<string, number>;
}

export interface DocTableRowProps {
  readonly doc: KnowledgeDocDTO;
  readonly onClick: () => void;
  readonly onDelete: (id: string) => void;
  readonly isDeleting: boolean;
}

export interface DocDetailDrawerProps {
  readonly doc: KnowledgeDocDTO | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export interface AddDocumentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}
