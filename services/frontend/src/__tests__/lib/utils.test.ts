/**
 * Unit tests for utils.ts
 *
 * Tests the cn() utility function which merges Tailwind class names
 * using clsx + tailwind-merge.
 */

import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

// ==================== cn ====================

describe("cn", () => {
  describe("basic merging", () => {
    it("should merge simple class names", () => {
      expect(cn("px-4", "py-2")).toBe("px-4 py-2");
    });

    it("should return empty string for no arguments", () => {
      expect(cn()).toBe("");
    });

    it("should handle a single class name", () => {
      expect(cn("px-4")).toBe("px-4");
    });

    it("should handle many class names", () => {
      const result = cn("a", "b", "c", "d", "e");
      expect(result).toBe("a b c d e");
    });
  });

  describe("tailwind-merge conflict resolution", () => {
    it("should resolve conflicting Tailwind classes (last wins)", () => {
      expect(cn("px-4", "px-8")).toBe("px-8");
    });

    it("should resolve conflicting background colors", () => {
      const result = cn("bg-white", "bg-gray-100");
      expect(result).toBe("bg-gray-100");
      expect(result).not.toContain("bg-white");
    });

    it("should keep dark mode variants while resolving base conflicts", () => {
      const result = cn("bg-white", "dark:bg-gray-900", "bg-gray-100");
      expect(result).toContain("dark:bg-gray-900");
      expect(result).toContain("bg-gray-100");
      expect(result).not.toContain("bg-white");
    });

    it("should resolve conflicting text sizes", () => {
      expect(cn("text-sm", "text-lg")).toBe("text-lg");
    });
  });

  describe("conditional classes (via clsx)", () => {
    it("should include truthy conditional classes", () => {
      const isActive = true;
      const result = cn("base", isActive && "active");
      expect(result).toContain("base");
      expect(result).toContain("active");
    });

    it("should exclude falsy conditional classes", () => {
      const isActive = false;
      const result = cn("base", isActive && "active");
      expect(result).toBe("base");
    });

    it("should filter out all falsy values", () => {
      const result = cn("base", false, null, undefined, 0, "extra");
      expect(result).toBe("base extra");
    });
  });

  describe("array arguments", () => {
    it("should handle array of class names", () => {
      expect(cn(["px-4", "py-2"])).toBe("px-4 py-2");
    });

    it("should handle nested arrays", () => {
      expect(cn(["px-4", ["py-2", "mt-1"]])).toBe("px-4 py-2 mt-1");
    });

    it("should handle empty array", () => {
      expect(cn([])).toBe("");
    });
  });

  describe("object arguments", () => {
    it("should include keys with truthy values", () => {
      const result = cn({ "text-red-500": true, "text-blue-500": false });
      expect(result).toBe("text-red-500");
    });

    it("should handle all-false object", () => {
      expect(cn({ a: false, b: false })).toBe("");
    });

    it("should handle all-true object", () => {
      const result = cn({ "px-4": true, "py-2": true });
      expect(result).toBe("px-4 py-2");
    });
  });

  describe("mixed argument types", () => {
    it("should handle string + array + object mixed arguments", () => {
      const result = cn("base", ["arr-class"], { "obj-class": true });
      expect(result).toContain("base");
      expect(result).toContain("arr-class");
      expect(result).toContain("obj-class");
    });
  });
});
