/**
 * Path Utilities
 *
 * Path normalization, service extraction, and grouping utilities
 * for consistent handling of file paths across formatters.
 */

// ==================== Path Normalization ====================

/**
 * Normalizes a test file path for consistent display.
 * Converts backslashes to forward slashes and normalizes __tests__ to tests.
 *
 * @param path - The file path to normalize
 * @returns Normalized file path
 *
 * @example
 * normalizeTestFilePath('src\\__tests__\\index.test.ts')
 * // Returns: 'src/tests/index.test.ts'
 */
export const normalizeTestFilePath = (path: string): string =>
  path.replace(/\\/g, "/").replace(/__tests__/g, "tests");

/**
 * Normalizes file paths for comparison and deduplication.
 * - Normalizes slashes
 * - Collapses __tests__ to tests
 * - Strips leading "./"
 */
export const normalizeEvidencePath = (path: string): string => {
  const normalized = normalizeTestFilePath(path.trim());
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
};

// ==================== Service Path Grouping ====================

/**
 * Common directory prefixes that should be skipped when extracting module name.
 * These are generic patterns found across many languages and project structures.
 */
const SKIP_DIRECTORY_PREFIXES = new Set([
  ".",
  "..",
  "src",
  "lib",
  "test",
  "tests",
  "spec",
  "specs",
  "__tests__",
  "__mocks__",
  "e2e",
  "integration",
  "unit",
  "fixtures",
  "mocks",
  "dist",
  "build",
  "out",
  "bin",
]);

/**
 * Extracts a meaningful module/service name from a file path.
 * Works with any project structure by finding the first significant directory.
 *
 * @param path - The file path to extract module from
 * @returns Module name or "other" if file path is unknown/invalid
 *
 * @example
 * extractServiceFromPath('packages/shared/src/index.ts') // Returns: 'packages/shared'
 * extractServiceFromPath('src/utils/helpers.ts') // Returns: 'utils'
 * extractServiceFromPath('cmd/server/main.go') // Returns: 'cmd/server'
 * extractServiceFromPath('app/models/user.rb') // Returns: 'app/models'
 */
export const extractServiceFromPath = (path: string): string => {
  const normalizedPath = normalizeEvidencePath(path);

  // Handle unknown/missing paths
  if (!normalizedPath || normalizedPath === "unknown" || normalizedPath === "(unknown)") {
    return "other";
  }

  const parts = normalizedPath.split("/").filter((part) => part.length > 0);

  // Remove filename (last part with extension)
  const directories = parts.slice(0, -1);

  if (directories.length === 0) {
    return "other";
  }

  // Find first meaningful directory (skip common prefixes)
  const startIndex = directories.findIndex((dir) => !SKIP_DIRECTORY_PREFIXES.has(dir));
  const effectiveStart = startIndex === -1 ? 0 : startIndex;

  // Return up to 2 directory levels for context (e.g., "packages/shared" or "cmd/server")
  const meaningfulDirs = directories.slice(effectiveStart, effectiveStart + 2);
  return meaningfulDirs.length > 0 ? meaningfulDirs.join("/") : "other";
};

/**
 * Formats a service name in kebab-case for use in headers.
 * Converts path separators to hyphens and lowercases.
 *
 * @param service - Service name (may contain slashes)
 * @returns Kebab-case service name (e.g., "api-users")
 *
 * @example
 * formatServiceNameKebab('api/users') // Returns: 'api-users'
 * formatServiceNameKebab('packages/shared') // Returns: 'packages-shared'
 */
export const formatServiceNameKebab = (service: string): string =>
  service.replace(/\//g, "-").toLowerCase();

/**
 * Formats a service name in Title Case for use in prose.
 * Converts path separators to spaces and capitalizes each word.
 *
 * @param service - Service name (may contain slashes)
 * @returns Title Case service name (e.g., "Api Users")
 *
 * @example
 * formatServiceNameTitle('api/users') // Returns: 'Api Users'
 * formatServiceNameTitle('packages/shared') // Returns: 'Packages Shared'
 */
export const formatServiceNameTitle = (service: string): string =>
  service
    .split("/")
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");

/**
 * Groups items by their service path for organized display.
 * Items are grouped by the service/package name extracted from their path.
 *
 * @param items - Array of items with a path property
 * @returns Map of service name to items in that service
 *
 * @example
 * const grouped = groupByServicePath([
 *   { path: 'api/users/handler.ts', message: 'error' },
 *   { path: 'web/components/button.tsx', message: 'warning' },
 * ]);
 * // Returns: Map { 'api/users' => [...], 'web/components' => [...] }
 */
export const groupByServicePath = <T extends { path: string }>(
  items: readonly T[]
): Map<string, T[]> => {
  const groups = new Map<string, T[]>();

  items.forEach((item) => {
    const service = extractServiceFromPath(item.path);
    const existing = groups.get(service) ?? [];
    groups.set(service, [...existing, item]);
  });

  return groups;
};

/**
 * Formats grouped items as markdown sections.
 * Creates a header for each service/package with file counts.
 *
 * @param grouped - Map of service name to items
 * @param formatItem - Function to format each item as a string
 * @returns Array of markdown lines with service grouping
 *
 * @example
 * const lines = formatGroupedItems(grouped, (item) => `- ${item.path}`);
 * // Returns: ['**api/users** (2 files)', '- api/users/handler.ts', ...]
 */
export const formatGroupedItems = <T extends { path: string }>(
  grouped: Map<string, T[]>,
  formatItem: (item: T) => string
): string[] => {
  const lines: string[] = [];

  grouped.forEach((items, service) => {
    const fileCount = items.length === 1 ? "1 file" : `${items.length} files`;
    lines.push(`**${service}** (${fileCount})`);
    items.forEach((item) => {
      lines.push(formatItem(item));
    });
  });

  return lines;
};

// ==================== Canonical Path Map ====================

/**
 * Get the basename (file name) from a path.
 */
export const getPathBasename = (path: string): string => {
  const normalizedPath = normalizeEvidencePath(path);
  const parts = normalizedPath.split("/").filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : normalizedPath;
};

/**
 * Build a canonical path map to deduplicate ambiguous paths.
 * Prefers the single path that includes directories when a basename-only path exists.
 */
export const buildCanonicalPathMap = (paths: readonly string[]): Map<string, string> => {
  const normalizedPaths = paths
    .map((path) => normalizeEvidencePath(path))
    .filter((path) => path.length > 0);

  const baseNameGroups = normalizedPaths.reduce<Map<string, string[]>>((groups, path) => {
    const baseName = getPathBasename(path);
    const existing = groups.get(baseName) ?? [];
    return groups.set(baseName, [...existing, path]);
  }, new Map<string, string[]>());

  const canonicalMap = new Map<string, string>();
  baseNameGroups.forEach((groupPaths) => {
    const uniquePaths = Array.from(new Set(groupPaths));
    const pathsWithDirs = uniquePaths.filter((path) => path.includes("/"));
    const canonicalPath = pathsWithDirs.length === 1 ? pathsWithDirs[0] : null;

    uniquePaths.forEach((path) => {
      if (canonicalPath && !path.includes("/")) {
        canonicalMap.set(path, canonicalPath);
        return;
      }
      canonicalMap.set(path, path);
    });
  });

  return canonicalMap;
};

/**
 * Resolve a path through the canonical map, normalizing first.
 */
export const resolveCanonicalPath = (path: string, pathMap: Map<string, string>): string => {
  const normalizedPath = normalizeEvidencePath(path);
  return pathMap.get(normalizedPath) ?? normalizedPath;
};

/**
 * Canonicalize evidence paths across test failures and annotations.
 * Ensures basename-only paths are aligned to the single matching path with directories.
 */
export const canonicalizeEvidencePaths = <
  TFailure extends { file?: string },
  TAnnotation extends { path?: string },
>(
  testFailures: readonly TFailure[],
  annotations: readonly TAnnotation[]
): {
  readonly testFailures: readonly TFailure[];
  readonly annotations: readonly TAnnotation[];
  readonly pathMap: ReadonlyMap<string, string>;
} => {
  const allPaths = [
    ...testFailures.map((failure) => failure.file).filter((file): file is string => Boolean(file)),
    ...annotations
      .map((annotation) => annotation.path)
      .filter((path): path is string => Boolean(path)),
  ];

  const pathMap = buildCanonicalPathMap(allPaths);
  const canonicalTestFailures = testFailures.map((failure) => {
    if (!failure.file) {
      return failure;
    }
    const canonicalPath = resolveCanonicalPath(failure.file, pathMap);
    return canonicalPath === failure.file ? failure : { ...failure, file: canonicalPath };
  });
  const canonicalAnnotations = annotations.map((annotation) => {
    if (!annotation.path) {
      return annotation;
    }
    const canonicalPath = resolveCanonicalPath(annotation.path, pathMap);
    return canonicalPath === annotation.path ? annotation : { ...annotation, path: canonicalPath };
  });

  return {
    testFailures: canonicalTestFailures,
    annotations: canonicalAnnotations,
    pathMap,
  };
};

// ==================== Path Stripping ====================

/**
 * Pattern to match common absolute path prefixes.
 * Handles Unix (/home/, /Users/, /var/, /tmp/) and Windows (C:\, D:\) paths.
 */
const ABSOLUTE_PATH_PATTERN =
  /(?:\/(?:home|Users|var|tmp|opt|usr)\/[^\s:]+\/|[A-Z]:\\(?:Users|Projects|Dev)\\[^\s:]+\\)/g;

/**
 * Strips absolute path prefixes from error messages.
 * Removes /home/user/project/, /Users/name/code/, C:\Users\name\ style paths
 * leaving only the relative path portion.
 *
 * @param message - Error message potentially containing absolute paths
 * @returns Message with absolute paths stripped to relative paths
 *
 * @example
 * stripAbsolutePaths('/home/user/project/src/index.ts:42 - error')
 * // Returns: 'src/index.ts:42 - error'
 *
 * stripAbsolutePaths('Error in /Users/dev/app/lib/utils.js')
 * // Returns: 'Error in lib/utils.js'
 */
export const stripAbsolutePaths = (message: string): string => {
  if (!message) {
    return "";
  }

  // Replace absolute paths with their relative portions
  return message.replace(ABSOLUTE_PATH_PATTERN, (match) => {
    // Extract the meaningful relative path portion (last 2-3 directory components)
    const parts = match.replace(/\\/g, "/").split("/").filter(Boolean);

    // Skip user/system directories, keep project-relative path
    const skipDirs = new Set([
      "home",
      "Users",
      "var",
      "tmp",
      "opt",
      "usr",
      "Projects",
      "Dev",
      "Documents",
      "workspace",
    ]);

    const startIndex = parts.findIndex((part) => !skipDirs.has(part));
    if (startIndex === -1 || startIndex >= parts.length - 1) {
      return "";
    }

    // Skip the project root directory name, return from src/packages/services level
    const projectRelativeParts = parts.slice(startIndex + 1);
    return projectRelativeParts.length > 0 ? `${projectRelativeParts.join("/")}/` : "";
  });
};
