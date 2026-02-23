/**
 * Vector Query Builder
 *
 * Generic query builder for vector similarity searches.
 * Used by both knowledgeDoc and diffChunk repositories.
 *
 * @module database/vector/queryBuilder
 */

import { VECTOR_SIMILARITY_THRESHOLDS } from "../../constants/index.js";
import type { VectorSearchFilters } from "./types.js";

// ==================== Types ====================

/** Maps a filter key to a database column. */
export interface FilterHandler {
  readonly key: keyof VectorSearchFilters;
  readonly column: string;
}

/** Configuration for building a similarity search query. */
export interface QueryBuilderConfig {
  readonly baseQuery: string;
  readonly defaultSimilarityThreshold: number;
  readonly filterHandlers: readonly FilterHandler[];
}

/** Result of building search conditions. */
export interface SearchConditionsResult {
  readonly conditions: readonly string[];
  readonly params: readonly unknown[];
}

/** Result of building a similarity search query. */
export interface SimilaritySearchQueryResult {
  readonly query: string;
  readonly params: readonly unknown[];
}

// ==================== Query Builders ====================

/**
 * Builds WHERE clause conditions from search filters.
 *
 * @param filters - Search filters
 * @param filterHandlers - Module-specific filter handlers
 * @param startParamIndex - Starting SQL parameter index
 * @returns Conditions and parameter arrays
 */
export const buildSearchConditions = (
  filters: VectorSearchFilters,
  filterHandlers: readonly FilterHandler[],
  startParamIndex: number
): SearchConditionsResult => {
  const result = filterHandlers.reduce<{
    readonly conditions: readonly string[];
    readonly params: readonly unknown[];
    readonly paramIndex: number;
  }>(
    (accumulator, handler) => {
      const value = filters[handler.key];

      if (value === undefined) {
        return accumulator;
      }

      return {
        conditions: [...accumulator.conditions, `${handler.column} = $${accumulator.paramIndex}`],
        params: [...accumulator.params, value],
        paramIndex: accumulator.paramIndex + 1,
      };
    },
    { conditions: [], params: [], paramIndex: startParamIndex }
  );

  return { conditions: result.conditions, params: result.params };
};

/**
 * Builds a complete similarity search query with filters.
 *
 * @param filters - Search filters
 * @param config - Module-specific query builder configuration
 * @returns Query string and parameter array
 */
export const buildSimilaritySearchQuery = (
  filters: VectorSearchFilters,
  config: QueryBuilderConfig
): SimilaritySearchQueryResult => {
  const minSimilarity = filters.minSimilarity ?? config.defaultSimilarityThreshold;
  const limit = Math.min(
    filters.limit ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
    VECTOR_SIMILARITY_THRESHOLDS.MAX_TOP_K
  );

  const { conditions, params } = buildSearchConditions(filters, config.filterHandlers, 2);

  const whereClause =
    conditions.length > 0
      ? `${config.baseQuery} AND ${conditions.join(" AND ")}`
      : config.baseQuery;

  const similarityParamIndex = params.length + 2; // $1 is embedding vector, filters start at $2
  const limitParamIndex = similarityParamIndex + 1;

  const fullQuery = `
    ${whereClause}
    AND 1 - (embedding <=> $1::vector) >= $${similarityParamIndex}
    ORDER BY similarity DESC
    LIMIT $${limitParamIndex}
  `;

  return { query: fullQuery, params: [...params, minSimilarity, limit] };
};
