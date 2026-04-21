// ==================== Domain Types ====================

export interface PostmortemActionItem {
  readonly action: string;
  readonly owner: string;
  readonly dueDate: string | null;
  readonly status: string;
}

export interface PostmortemContent {
  readonly summary: string;
  readonly timeline: string;
  readonly rootCause: string;
  readonly impact: string;
  readonly actionItems: readonly PostmortemActionItem[];
  readonly lessonsLearned: string;
  readonly additionalNotes: string;
}

export type PostmortemStatus = "draft" | "published";

export interface PostmortemRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly alertId: string | null;
  readonly title: string;
  readonly status: PostmortemStatus;
  readonly content: PostmortemContent;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface PaginatedPostmortems {
  readonly items: readonly PostmortemRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// ==================== Input Types ====================

export interface SavePostmortemInput {
  readonly title: string;
  readonly alertId?: string | null;
  readonly content: PostmortemContent;
  readonly status?: PostmortemStatus;
}

export interface UpdatePostmortemInput {
  readonly title?: string;
  readonly content?: PostmortemContent;
  readonly status?: PostmortemStatus;
}
