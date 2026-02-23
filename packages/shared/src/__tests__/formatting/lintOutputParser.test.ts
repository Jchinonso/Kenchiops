/**
 * Unit tests for formatting/lintOutputParser.ts
 *
 * Tests deterministic regex-based lint/format error parsing from CI runner output.
 * Covers stylish (ESLint), colon-delimited (Pylint/Clippy), tsc, and
 * format checkers (structural patterns: diff location, diff header, tagged prefix,
 * context-aware extractor, and bare path fallback).
 */
import { describe, it, expect } from "@jest/globals";
import { parseLintOutput } from "../../formatting/lintOutputParser.js";

// ==================== Format Checker: Pattern A — Diff Location ====================

describe("parseLintOutput — format checkers (Pattern A: diff location)", () => {
  it("should parse diff headers with file path and line number", () => {
    const log = ["Diff in src/main.rs at line 15:", "Diff in src/lib.rs at line 42:"].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: "src/main.rs",
      line: 15,
      code: "format",
      message: "File requires formatting",
    });
    expect(errors[1]).toEqual({
      file: "src/lib.rs",
      line: 42,
      code: "format",
      message: "File requires formatting",
    });
  });
});

// ==================== Format Checker: Pattern B — Diff Header ====================

describe("parseLintOutput — format checkers (Pattern B: diff header)", () => {
  it("should parse --- a/file.ext diff headers", () => {
    const log = [
      "--- a/src/main.go",
      "+++ b/src/main.go",
      "@@ -10,3 +10,3 @@",
      "-func foo() {",
      "+func foo(){",
      "--- a/src/handler.go",
      "+++ b/src/handler.go",
    ].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: "src/main.go",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
    expect(errors[1]).toEqual({
      file: "src/handler.go",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
  });

  it("should parse diff headers without a/ prefix", () => {
    const log = ["--- src/file.py", "+++ src/file.py"].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/file.py");
  });
});

// ==================== Format Checker: Pattern C — Tagged Prefix ====================

describe("parseLintOutput — format checkers (Pattern C: tagged prefix)", () => {
  it("should parse [warn] file lines", () => {
    const log = [
      "Checking formatting...",
      "[warn] src/components/App.tsx",
      "[warn] src/utils/helpers.js",
      "[warn] Code style issues found in 2 files. Run Prettier to fix.",
    ].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: "src/components/App.tsx",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
    expect(errors[1]).toEqual({
      file: "src/utils/helpers.js",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
  });

  it("should not match summary lines lacking a file-path token", () => {
    const log = "[warn] Code style issues found in 2 files. Run Prettier to fix.";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(0);
  });

  it("should handle CI timestamp prefix", () => {
    const log = "2024-01-15T10:30:45.1234567Z [warn] src/file.ts";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/file.ts");
  });

  it("should strip CI runner path prefix", () => {
    const log = "[warn] /home/runner/work/my-project/my-project/src/file.ts";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/file.ts");
  });

  it("should parse UPPERCASE-COLON tag with trailing text", () => {
    const log = "ERROR: src/utils/helpers.py Imports are incorrectly sorted and/or formatted.";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      file: "src/utils/helpers.py",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
  });

  it("should parse [error] tagged lines", () => {
    const log = "[error] src/config.py";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      file: "src/config.py",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
  });

  it("should parse WARNING: severity prefix", () => {
    const log = "WARNING: src/file.rb";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      file: "src/file.rb",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
  });
});

// ==================== Format Checker: Pattern D — Context-Aware Extractor ====================

describe("parseLintOutput — format checkers (Pattern D: context-aware extractor)", () => {
  it("should parse 'would reformat' lines", () => {
    const log = [
      "would reformat src/utils/helpers.py",
      "would reformat src/models/user.py",
      "Oh no! \u{1f4a5} \u{1f494} \u{1f4a5}",
      "2 files would be reformatted, 5 files would be left unchanged.",
    ].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: "src/utils/helpers.py",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
    expect(errors[1]).toEqual({
      file: "src/models/user.py",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
  });

  it("should reject summary lines starting with digits", () => {
    const log = "2 files would be reformatted, 5 files would be left unchanged.";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(0);
  });

  it("should parse 'Changed file.ext' lines", () => {
    const log = ["Changed src/main.dart", "Changed lib/widget.dart"].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: "src/main.dart",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
  });

  it("should parse 'Reformatted file.ext'", () => {
    const log = "Reformatted src/utils.py";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/utils.py");
  });

  it("should parse 'Fixed file.ext'", () => {
    const log = "Fixed src/Controller.php";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/Controller.php");
  });

  it("should be case-insensitive for keywords", () => {
    const log = "CHANGED src/Main.java";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/Main.java");
  });

  it("should reject summary lines without a file-path token", () => {
    const log = "Changed 5 files in the project directory.";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(0);
  });

  it("should parse root-level file with formatting keyword", () => {
    const log = "would reformat config.py";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("config.py");
  });

  it("should parse unknown verb containing a formatting keyword", () => {
    const log = "Beautified src/file.js";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      file: "src/file.js",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
  });

  it("should parse 'not formatted' keyword", () => {
    const log = "not formatted src/main.go";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/main.go");
  });

  it("should parse 'corrected' keyword", () => {
    const log = "corrected src/style.css";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/style.css");
  });
});

// ==================== Format Checker: Tier 3 — Bare File Path Fallback ====================

describe("parseLintOutput — format checkers (Tier 3: bare path fallback)", () => {
  it("should extract bare file paths when no other parser matches", () => {
    const log = ["src/main.go", "src/handlers/auth.go", "pkg/config.go"].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toEqual({
      file: "src/main.go",
      line: 0,
      code: "format",
      message: "File requires formatting",
    });
    expect(errors[1].file).toBe("src/handlers/auth.go");
    expect(errors[2].file).toBe("pkg/config.go");
  });

  it("should work for any language file extension", () => {
    const log = ["scripts/deploy.sh", "modules/main.tf", "Sources/App.swift"].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(3);
    expect(errors.map((entry) => entry.file)).toEqual([
      "scripts/deploy.sh",
      "modules/main.tf",
      "Sources/App.swift",
    ]);
  });

  it("should NOT activate when other parsers found errors (prevents false positives)", () => {
    const log = ["src/file.ts", "  12:5  error  Unused var  no-unused-vars", "src/other.ts"].join(
      "\n"
    );

    const errors = parseLintOutput(log);
    // Should only find the ESLint error, NOT treat "src/other.ts" as a format error
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("no-unused-vars");
  });

  it("should reject hidden directory paths in fallback", () => {
    const log = ".eslintrc.js";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(0);
  });

  it("should strip CI runner paths in fallback", () => {
    const log = "/home/runner/work/myapp/myapp/src/main.go";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/main.go");
  });
});

// ==================== Deduplication ====================

describe("parseLintOutput — deduplication", () => {
  it("should deduplicate format errors for the same file", () => {
    const log = ["[warn] src/file.js", "[warn] src/file.js"].join("\n");
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
  });

  it("should not deduplicate different files", () => {
    const log = ["[warn] src/a.js", "[warn] src/b.js"].join("\n");
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(2);
  });

  it("should deduplicate across tiers (diff header + bare path for same file)", () => {
    // If diff header matches a file, the bare path fallback shouldn't re-add it
    const log = ["--- a/src/main.go", "+++ b/src/main.go", "@@ -1 +1 @@", "-old", "+new"].join(
      "\n"
    );

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe("src/main.go");
  });
});

// ==================== Path Filtering ====================

describe("parseLintOutput — path filtering", () => {
  it("should reject hidden directory paths", () => {
    const log = "[warn] .github";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(0);
  });

  it("should accept paths with directory separators", () => {
    const log = "[warn] .github/workflows/ci.yml";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe(".github/workflows/ci.yml");
  });
});

// ==================== Existing Parser Non-Interference ====================

describe("parseLintOutput — existing parsers", () => {
  it("should parse ESLint stylish output without interference from format patterns", () => {
    const log = [
      "src/file.ts",
      "  12:5  error  No unused vars  no-unused-vars",
      "  15:3  error  Missing return  explicit-return",
    ].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(2);
    expect(errors[0].code).toBe("no-unused-vars");
    expect(errors[1].code).toBe("explicit-return");
  });

  it("should parse colon-delimited errors", () => {
    const log = "src/file.py:12:5: E302 expected 2 blank lines, got 1";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("E302");
  });

  it("should parse tsc errors", () => {
    const log = "src/file.ts(12,5): error TS2304: Cannot find name 'foo'.";
    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("TS2304");
  });

  it("should handle mixed format checker and linter output", () => {
    const log = [
      "[warn] src/unformatted.ts",
      "src/errors.ts",
      "  5:1  error  Unexpected var  no-var",
    ].join("\n");

    const errors = parseLintOutput(log);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ file: "src/unformatted.ts", code: "format" });
    expect(errors[1]).toMatchObject({ file: "src/errors.ts", code: "no-var" });
  });
});
