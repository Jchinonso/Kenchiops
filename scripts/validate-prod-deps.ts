#!/usr/bin/env tsx
/**
 * Production Dependency Validator
 *
 * Scans service source files for external imports and verifies each one is
 * available in production (in `dependencies`, not just `devDependencies`).
 *
 * This catches the class of bug where a package is imported at runtime but
 * only listed in devDependencies — which means `npm install --omit=dev`
 * in the Docker production stage won't install it.
 *
 * Usage: npx tsx scripts/validate-prod-deps.ts
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";

interface PackageJson {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly workspaces?: readonly string[];
}

interface Violation {
  readonly file: string;
  readonly importPath: string;
  readonly packageName: string;
  readonly location: "devDependencies" | "missing";
}

const ROOT_DIR = resolve(import.meta.dirname ?? ".", "..");

/** Services that run in the production Docker container */
const SERVICES = [
  "services/api",
  "services/slack-bot",
  "services/github-app",
  "services/incident-triage",
];

/** Packages that are always available in Node.js (built-in modules) */
const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
  "node:assert",
  "node:buffer",
  "node:child_process",
  "node:cluster",
  "node:console",
  "node:constants",
  "node:crypto",
  "node:dgram",
  "node:dns",
  "node:domain",
  "node:events",
  "node:fs",
  "node:http",
  "node:http2",
  "node:https",
  "node:inspector",
  "node:module",
  "node:net",
  "node:os",
  "node:path",
  "node:perf_hooks",
  "node:process",
  "node:punycode",
  "node:querystring",
  "node:readline",
  "node:repl",
  "node:stream",
  "node:string_decoder",
  "node:sys",
  "node:timers",
  "node:tls",
  "node:trace_events",
  "node:tty",
  "node:url",
  "node:util",
  "node:v8",
  "node:vm",
  "node:wasi",
  "node:worker_threads",
  "node:zlib",
]);

/** Extract package name from an import path (handles scoped packages) */
const getPackageName = (importPath: string): string | null => {
  // Skip relative imports
  if (importPath.startsWith(".") || importPath.startsWith("/")) {
    return null;
  }

  // Scoped package: @scope/package or @scope/package/path
  if (importPath.startsWith("@")) {
    const parts = importPath.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }

  // Regular package: package or package/path
  return importPath.split("/")[0];
};

/** Recursively collect .ts files (excluding tests and node_modules) */
const collectTsFiles = (dir: string): string[] => {
  const results: string[] = [];

  if (!existsSync(dir)) {
    return results;
  }

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);

    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === "__tests__" ||
      entry === "coverage"
    ) {
      continue;
    }

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".spec.ts") &&
      !entry.endsWith(".d.ts")
    ) {
      results.push(fullPath);
    }
  }

  return results;
};

/** Extract external import paths from a TypeScript file */
const extractImports = (filePath: string): string[] => {
  const content = readFileSync(filePath, "utf-8");
  const imports: string[] = [];

  // Match: import ... from "package" and import "package"
  const importRegex = /(?:import|export)\s+(?:.*?\s+from\s+)?["']([^"']+)["']/g;
  // Match: require("package")
  const requireRegex = /require\(["']([^"']+)["']\)/g;
  // Match: await import("package")
  const dynamicImportRegex = /import\(["']([^"']+)["']\)/g;

  for (const regex of [importRegex, requireRegex, dynamicImportRegex]) {
    // let: regex.exec mutates lastIndex and returns null when done
    let match = regex.exec(content);
    while (match !== null) {
      const importPath = match[1];
      const packageName = getPackageName(importPath);
      if (packageName && !NODE_BUILTINS.has(importPath) && !NODE_BUILTINS.has(packageName)) {
        imports.push(packageName);
      }
      match = regex.exec(content);
    }
  }

  return [...new Set(imports)];
};

/** Load and parse a package.json */
const loadPackageJson = (dir: string): PackageJson => {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    return {};
  }
  return JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJson;
};

/** Collect all production dependencies (root + service + shared) */
const collectProdDeps = (serviceDir: string): Set<string> => {
  const rootPkg = loadPackageJson(ROOT_DIR);
  const servicePkg = loadPackageJson(join(ROOT_DIR, serviceDir));
  const sharedPkg = loadPackageJson(join(ROOT_DIR, "packages/shared"));

  const deps = new Set<string>();

  // Root dependencies are available to all workspaces
  for (const dep of Object.keys(rootPkg.dependencies ?? {})) {
    deps.add(dep);
  }

  // Service dependencies
  for (const dep of Object.keys(servicePkg.dependencies ?? {})) {
    deps.add(dep);
  }

  // Shared package dependencies (since shared is a workspace dep)
  for (const dep of Object.keys(sharedPkg.dependencies ?? {})) {
    deps.add(dep);
  }

  // Workspace packages themselves are always available
  deps.add("@kenchi/shared");

  return deps;
};

/** Collect all devDependencies */
const collectDevDeps = (serviceDir: string): Set<string> => {
  const rootPkg = loadPackageJson(ROOT_DIR);
  const servicePkg = loadPackageJson(join(ROOT_DIR, serviceDir));

  const devDeps = new Set<string>();

  for (const dep of Object.keys(rootPkg.devDependencies ?? {})) {
    devDeps.add(dep);
  }
  for (const dep of Object.keys(servicePkg.devDependencies ?? {})) {
    devDeps.add(dep);
  }

  return devDeps;
};

// ==================== Main ====================

console.log("Validating production dependencies...\n");

const violations: Violation[] = [];

for (const serviceDir of SERVICES) {
  const srcDir = join(ROOT_DIR, serviceDir, "src");
  const prodDeps = collectProdDeps(serviceDir);
  const devDeps = collectDevDeps(serviceDir);

  const tsFiles = collectTsFiles(srcDir);
  // Also scan shared package source (it's bundled in production)
  const sharedFiles = collectTsFiles(join(ROOT_DIR, "packages/shared/src"));

  for (const file of [...tsFiles, ...sharedFiles]) {
    const imports = extractImports(file);

    for (const packageName of imports) {
      // Skip if it's a known production dependency
      if (prodDeps.has(packageName)) {
        continue;
      }

      const relativePath = file.replace(`${ROOT_DIR}/`, "");

      if (devDeps.has(packageName)) {
        violations.push({
          file: relativePath,
          importPath: packageName,
          packageName,
          location: "devDependencies",
        });
      }
      // Don't flag missing packages — they might be peer deps or optional
    }
  }
}

// Deduplicate violations by package name (same package from shared appears for every service)
const uniqueViolations = violations.reduce<Violation[]>((acc, v) => {
  const key = `${v.file}:${v.packageName}`;
  if (!acc.some((existing) => `${existing.file}:${existing.packageName}` === key)) {
    acc.push(v);
  }
  return acc;
}, []);

if (uniqueViolations.length === 0) {
  console.log("All runtime imports are in production dependencies.\n");
  process.exit(0);
}

console.error(`Found ${uniqueViolations.length} production dependency issue(s):\n`);

for (const v of uniqueViolations) {
  const label =
    v.location === "devDependencies"
      ? "in devDependencies (excluded from prod)"
      : "not in any dependencies";
  console.error(`  ${v.file}`);
  console.error(`    imports "${v.packageName}" — ${label}`);
  console.error("");
}

console.error("Fix: Move these packages from devDependencies to dependencies in package.json\n");
console.error("This script prevents the ERR_MODULE_NOT_FOUND crash that occurs when");
console.error("`npm install --omit=dev` in the Docker production build skips dev-only packages.\n");

process.exit(1);
