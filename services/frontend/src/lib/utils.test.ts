/**
 * Unit tests for utils.ts
 *
 * Tests the cn() utility function which merges Tailwind class names.
 */

import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("should merge simple class names", () => {
    const result = cn("px-4", "py-2");
    expect(result).toBe("px-4 py-2");
  });

  it("should resolve conflicting Tailwind classes (last wins)", () => {
    const result = cn("px-4", "px-8");
    expect(result).toBe("px-8");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    const result = cn("base-class", isActive && "active-class");
    expect(result).toContain("base-class");
    expect(result).toContain("active-class");
  });

  it("should filter out falsy values", () => {
    const result = cn("base", false, null, undefined, 0, "extra");
    expect(result).toBe("base extra");
  });

  it("should handle empty arguments", () => {
    expect(cn()).toBe("");
  });

  it("should handle array arguments", () => {
    const result = cn(["px-4", "py-2"]);
    expect(result).toBe("px-4 py-2");
  });

  it("should handle object arguments", () => {
    const result = cn({ "text-red-500": true, "text-blue-500": false });
    expect(result).toBe("text-red-500");
  });

  it("should merge dark mode variants correctly", () => {
    const result = cn("bg-white", "dark:bg-gray-900", "bg-gray-100");
    // tailwind-merge should keep dark: variant and resolve bg conflict
    expect(result).toContain("dark:bg-gray-900");
    expect(result).toContain("bg-gray-100");
    expect(result).not.toContain("bg-white");
  });
});
