/**
 * Unit tests for database/vector/queryBuilder shared module.
 */
import { describe, it, expect } from "@jest/globals";
import {
  buildSearchConditions,
  buildSimilaritySearchQuery,
} from "../../database/vector/queryBuilder.js";
import type { FilterHandler, QueryBuilderConfig } from "../../database/vector/queryBuilder.js";

const TEST_FILTER_HANDLERS: readonly FilterHandler[] = [
  { key: "tenantId", column: "tenant_id" },
  { key: "docType", column: "doc_type" },
];

const TEST_CONFIG: QueryBuilderConfig = {
  baseQuery: "SELECT * FROM docs WHERE embedding IS NOT NULL",
  defaultSimilarityThreshold: 0.7,
  filterHandlers: TEST_FILTER_HANDLERS,
};

describe("database/vector/queryBuilder", () => {
  describe("buildSearchConditions", () => {
    it("returns empty arrays when no filters match", () => {
      const result = buildSearchConditions({}, TEST_FILTER_HANDLERS, 2);
      expect(result.conditions).toEqual([]);
      expect(result.params).toEqual([]);
    });

    it("builds conditions for matching filters", () => {
      const result = buildSearchConditions({ tenantId: "t-123" }, TEST_FILTER_HANDLERS, 2);
      expect(result.conditions).toEqual(["tenant_id = $2"]);
      expect(result.params).toEqual(["t-123"]);
    });

    it("builds multiple conditions with incrementing param index", () => {
      const result = buildSearchConditions(
        { tenantId: "t-123", docType: "readme" },
        TEST_FILTER_HANDLERS,
        2
      );
      expect(result.conditions).toEqual(["tenant_id = $2", "doc_type = $3"]);
      expect(result.params).toEqual(["t-123", "readme"]);
    });

    it("skips undefined filter values", () => {
      const result = buildSearchConditions(
        { tenantId: "t-123", docType: undefined },
        TEST_FILTER_HANDLERS,
        2
      );
      expect(result.conditions).toEqual(["tenant_id = $2"]);
      expect(result.params).toEqual(["t-123"]);
    });

    it("respects startParamIndex", () => {
      const result = buildSearchConditions({ tenantId: "t-123" }, TEST_FILTER_HANDLERS, 5);
      expect(result.conditions).toEqual(["tenant_id = $5"]);
    });
  });

  describe("buildSimilaritySearchQuery", () => {
    it("builds query with no filters", () => {
      const result = buildSimilaritySearchQuery({}, TEST_CONFIG);
      expect(result.query).toContain("SELECT * FROM docs WHERE embedding IS NOT NULL");
      expect(result.query).toContain(">= 0.7");
      expect(result.query).toContain("ORDER BY similarity DESC");
      expect(result.params).toEqual([]);
    });

    it("builds query with filter conditions", () => {
      const result = buildSimilaritySearchQuery({ tenantId: "t-123" }, TEST_CONFIG);
      expect(result.query).toContain("AND tenant_id = $2");
      expect(result.params).toEqual(["t-123"]);
    });

    it("uses custom minSimilarity when provided", () => {
      const result = buildSimilaritySearchQuery({ minSimilarity: 0.9 }, TEST_CONFIG);
      expect(result.query).toContain(">= 0.9");
    });

    it("uses default similarity threshold when not provided", () => {
      const result = buildSimilaritySearchQuery({}, TEST_CONFIG);
      expect(result.query).toContain(">= 0.7");
    });

    it("applies LIMIT from filters", () => {
      const result = buildSimilaritySearchQuery({ limit: 5 }, TEST_CONFIG);
      expect(result.query).toContain("LIMIT 5");
    });
  });
});
