/**
 * Unit tests for formatting/arrayUtils.ts
 */
import { describe, it, expect } from "@jest/globals";
import {
  deduplicateByKey,
  containsAny,
  startsWithAny,
  shouldExcludePath,
  groupBy,
  takeMatching,
} from "../../formatting/arrayUtils.js";

describe("Array Utilities", () => {
  describe("deduplicateByKey", () => {
    it("should deduplicate by key function", () => {
      const items = [
        { path: "a.ts", value: 1 },
        { path: "b.ts", value: 2 },
        { path: "a.ts", value: 3 },
      ];

      const result = deduplicateByKey(items, (item) => item.path);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ path: "a.ts", value: 1 });
      expect(result[1]).toEqual({ path: "b.ts", value: 2 });
    });

    it("should keep first occurrence", () => {
      const items = [
        { id: 1, name: "first" },
        { id: 1, name: "second" },
      ];

      const result = deduplicateByKey(items, (item) => item.id);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("first");
    });

    it("should respect maxItems limit", () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

      const result = deduplicateByKey(items, (item) => item.id, 2);

      expect(result).toHaveLength(2);
    });

    it("should handle empty array", () => {
      const result = deduplicateByKey([], (item: { id: number }) => item.id);

      expect(result).toEqual([]);
    });

    it("should handle all unique items", () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

      const result = deduplicateByKey(items, (item) => item.id);

      expect(result).toHaveLength(3);
    });

    it("should handle all duplicate items", () => {
      const items = [{ id: 1 }, { id: 1 }, { id: 1 }];

      const result = deduplicateByKey(items, (item) => item.id);

      expect(result).toHaveLength(1);
    });

    it("should work with string keys", () => {
      const items = ["apple", "banana", "apple", "cherry"];

      const result = deduplicateByKey(items, (item) => item);

      expect(result).toEqual(["apple", "banana", "cherry"]);
    });
  });

  describe("containsAny", () => {
    it("should return true when any pattern matches", () => {
      expect(containsAny("node_modules/foo", ["node_modules", ".test."])).toBe(true);
      expect(containsAny("src/test.ts", ["test", "spec"])).toBe(true);
    });

    it("should return false when no patterns match", () => {
      expect(containsAny("src/main.ts", ["node_modules", ".test."])).toBe(false);
    });

    it("should handle empty patterns array", () => {
      expect(containsAny("anything", [])).toBe(false);
    });

    it("should handle empty text", () => {
      expect(containsAny("", ["pattern"])).toBe(false);
    });

    it("should be case-sensitive", () => {
      expect(containsAny("Test.ts", ["test"])).toBe(false);
      expect(containsAny("Test.ts", ["Test"])).toBe(true);
    });
  });

  describe("startsWithAny", () => {
    it("should return true when any prefix matches", () => {
      expect(startsWithAny("node_modules/foo", ["node_", "src/"])).toBe(true);
      expect(startsWithAny("src/main.ts", ["src/", "lib/"])).toBe(true);
    });

    it("should return false when no prefixes match", () => {
      expect(startsWithAny("test/main.ts", ["src/", "lib/"])).toBe(false);
    });

    it("should handle empty prefixes array", () => {
      expect(startsWithAny("anything", [])).toBe(false);
    });

    it("should handle empty text", () => {
      expect(startsWithAny("", ["prefix"])).toBe(false);
    });

    it("should not match mid-string", () => {
      expect(startsWithAny("a/node_modules/b", ["node_modules"])).toBe(false);
    });
  });

  describe("shouldExcludePath", () => {
    it("should return true for contained patterns", () => {
      expect(shouldExcludePath("src/node_modules/pkg", ["node_modules"])).toBe(true);
    });

    it("should return true for prefix patterns", () => {
      expect(shouldExcludePath("node_modules/pkg", ["node_modules"])).toBe(true);
    });

    it("should return false for no matches", () => {
      expect(shouldExcludePath("src/main.ts", ["node_modules", ".git"])).toBe(false);
    });

    it("should handle common exclusion patterns", () => {
      const patterns = ["node_modules", ".git", "dist", ".test."];

      expect(shouldExcludePath("node_modules/foo/bar.js", patterns)).toBe(true);
      expect(shouldExcludePath(".git/config", patterns)).toBe(true);
      expect(shouldExcludePath("dist/bundle.js", patterns)).toBe(true);
      expect(shouldExcludePath("src/foo.test.ts", patterns)).toBe(true);
      expect(shouldExcludePath("src/main.ts", patterns)).toBe(false);
    });
  });

  describe("groupBy", () => {
    it("should group items by key function", () => {
      const items = [
        { type: "a", value: 1 },
        { type: "b", value: 2 },
        { type: "a", value: 3 },
      ];

      const result = groupBy(items, (item) => item.type);

      expect(result.get("a")).toEqual([
        { type: "a", value: 1 },
        { type: "a", value: 3 },
      ]);
      expect(result.get("b")).toEqual([{ type: "b", value: 2 }]);
    });

    it("should return Map with arrays", () => {
      const items = [{ type: "a" }, { type: "b" }];

      const result = groupBy(items, (item) => item.type);

      expect(result instanceof Map).toBe(true);
      expect(Array.isArray(result.get("a"))).toBe(true);
    });

    it("should handle single-item groups", () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

      const result = groupBy(items, (item) => item.id);

      expect(result.size).toBe(3);
      result.forEach((group) => {
        expect(group).toHaveLength(1);
      });
    });

    it("should handle empty array", () => {
      const result = groupBy([], (item: { type: string }) => item.type);

      expect(result.size).toBe(0);
    });

    it("should preserve order within groups", () => {
      const items = [
        { type: "a", order: 1 },
        { type: "a", order: 2 },
        { type: "a", order: 3 },
      ];

      const result = groupBy(items, (item) => item.type);
      const group = result.get("a")!;

      expect(group[0].order).toBe(1);
      expect(group[1].order).toBe(2);
      expect(group[2].order).toBe(3);
    });
  });

  describe("takeMatching", () => {
    it("should filter and limit results", () => {
      const items = [1, 2, 3, 4, 5, 6];

      const result = takeMatching(items, (num) => num % 2 === 0, 2);

      expect(result).toEqual([2, 4]);
    });

    it("should return empty array when no matches", () => {
      const items = [1, 3, 5, 7];

      const result = takeMatching(items, (num) => num % 2 === 0, 2);

      expect(result).toEqual([]);
    });

    it("should return all matches when fewer than limit", () => {
      const items = [1, 2, 3, 4, 5];

      const result = takeMatching(items, (num) => num > 3, 10);

      expect(result).toEqual([4, 5]);
    });

    it("should handle empty array", () => {
      const result = takeMatching([], () => true, 5);

      expect(result).toEqual([]);
    });

    it("should handle limit of 0", () => {
      const result = takeMatching([1, 2, 3], () => true, 0);

      expect(result).toEqual([]);
    });

    it("should work with complex predicates", () => {
      const items = [
        { name: "a", active: true },
        { name: "b", active: false },
        { name: "c", active: true },
        { name: "d", active: true },
      ];

      const result = takeMatching(items, (item) => item.active, 2);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("a");
      expect(result[1].name).toBe("c");
    });
  });
});
