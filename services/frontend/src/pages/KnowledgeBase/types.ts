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
  readonly isSelected: boolean;
  readonly onToggleSelect: (id: string) => void;
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

export interface DeleteConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  readonly isDeleting: boolean;
}

export interface BulkDeleteConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  readonly selectionCount: number;
  readonly isDeleting: boolean;
}

export interface PurgeConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => Promise<void>;
  readonly totalDocuments: number;
  readonly isPurging: boolean;
}

export interface BulkActionBarProps {
  readonly selectionCount: number;
  readonly allOnPageSelected: boolean;
  readonly isBulkDeleting: boolean;
  readonly onDeleteSelected: () => void;
  readonly onSelectAllOnPage: () => void;
  readonly onClearSelection: () => void;
}
