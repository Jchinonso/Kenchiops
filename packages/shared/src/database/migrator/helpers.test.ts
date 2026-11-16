/**
 * Unit tests for database/migrator/helpers.ts
 *
 * Covers the pure migration-file helpers:
 * - computeChecksum: stable, content-sensitive digest
 * - parseVersion: numeric prefix parsing + validation
 * - requiresNoTransaction: directive detection
 * - assertUniqueVersions: duplicate-version guard
 * - selectPending: pending diff against applied set
 * - detectDrift: checksum mismatch detection
 */
import { describe, it, expect } from "@jest/globals";
import { ValidationError } from "../../core/errors.js";
import {
  assertUniqueVersions,
  computeChecksum,
  detectDrift,
  parseVersion,
  requiresNoTransaction,
  selectPending,
} from "./helpers.js";
import type { MigrationFile } from "./types.js";

const makeFile = (overrides: Partial<MigrationFile> = {}): MigrationFile => ({
  version: 1,
  name: "001_init.sql",
  sql: "CREATE TABLE t ();",
  checksum: "abc",
  noTransaction: false,
  ...overrides,
});

describe("computeChecksum", () => {
  it("should be deterministic for identical input", () => {
    expect(computeChecksum("SELECT 1;")).toBe(computeChecksum("SELECT 1;"));
  });

  it("should differ when content changes", () => {
    expect(computeChecksum("SELECT 1;")).not.toBe(computeChecksum("SELECT 2;"));
  });
});

describe("parseVersion", () => {
  it("should parse the numeric prefix", () => {
    expect(parseVersion("023_multi_org_membership.sql")).toBe(23);
  });

  it("should parse a leading-zero prefix as a base-10 integer", () => {
    expect(parseVersion("008_rag_phase4.sql")).toBe(8);
  });

  it("should throw ValidationError when the filename has no numeric prefix", () => {
    expect(() => parseVersion("schema.sql")).toThrow(ValidationError);
  });
});

describe("requiresNoTransaction", () => {
  it("should detect the no-transaction directive", () => {
    expect(requiresNoTransaction("-- migrate:no-transaction\nCREATE INDEX ...")).toBe(true);
  });

  it("should return false when the directive is absent", () => {
    expect(requiresNoTransaction("CREATE TABLE t ();")).toBe(false);
  });
});

describe("assertUniqueVersions", () => {
  it("should pass when versions are unique", () => {
    expect(() =>
      assertUniqueVersions([
        makeFile({ version: 1, name: "001_a.sql" }),
        makeFile({ version: 2, name: "002_b.sql" }),
      ])
    ).not.toThrow();
  });

  it("should throw when two files share a version", () => {
    expect(() =>
      assertUniqueVersions([
        makeFile({ version: 1, name: "001_a.sql" }),
        makeFile({ version: 1, name: "001_b.sql" }),
      ])
    ).toThrow(ValidationError);
  });
});

describe("selectPending", () => {
  it("should return only files not in the applied set", () => {
    const files = [
      makeFile({ version: 1, name: "001_a.sql" }),
      makeFile({ version: 2, name: "002_b.sql" }),
      makeFile({ version: 3, name: "003_c.sql" }),
    ];
    const applied = new Set(["001_a.sql", "002_b.sql"]);
    expect(selectPending(files, applied).map((file) => file.name)).toEqual(["003_c.sql"]);
  });

  it("should return all files when nothing is applied", () => {
    const files = [makeFile({ name: "001_a.sql" })];
    expect(selectPending(files, new Set()).map((file) => file.name)).toEqual(["001_a.sql"]);
  });
});

describe("detectDrift", () => {
  it("should flag applied files whose checksum changed", () => {
    const files = [makeFile({ name: "001_a.sql", checksum: "new" })];
    const recorded = new Map([["001_a.sql", "old"]]);
    expect(detectDrift(files, recorded)).toEqual(["001_a.sql"]);
  });

  it("should not flag files with matching checksums", () => {
    const files = [makeFile({ name: "001_a.sql", checksum: "same" })];
    const recorded = new Map([["001_a.sql", "same"]]);
    expect(detectDrift(files, recorded)).toEqual([]);
  });

  it("should not flag files that have not been applied", () => {
    const files = [makeFile({ name: "002_new.sql", checksum: "x" })];
    const recorded = new Map([["001_a.sql", "y"]]);
    expect(detectDrift(files, recorded)).toEqual([]);
  });
});
