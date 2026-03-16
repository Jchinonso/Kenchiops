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
}
