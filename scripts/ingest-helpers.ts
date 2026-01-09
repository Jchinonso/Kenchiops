/**
 * RAG Document Ingestion Helpers
 *
 * Helper functions for the document ingestion CLI.
 * Extracted from ingest-documents.ts for module size compliance.
 *
 * @module scripts/ingest-helpers
 */

import * as fs from "fs";
import * as path from "path";
import {
  KNOWLEDGE_DOC_TYPES,
  type KnowledgeDocType,
} from "../packages/shared/src/constants/index.js";

// ==================== Constants ====================

/**
 * CLI configuration constants.
 */
export const CLI_CONSTANTS = {
  /** Supported file extensions */
  SUPPORTED_EXTENSIONS: [".md", ".mdx", ".txt", ".rst"] as const,
  /** Default document type */
  DEFAULT_DOC_TYPE: KNOWLEDGE_DOC_TYPES.ARCHITECTURE,
  /** Batch size for directory ingestion */
  BATCH_SIZE: 10,
  /** Percentage multiplier for display */
  PERCENTAGE_MULTIPLIER: 100,
  /** Table separator width */
  TABLE_SEPARATOR_WIDTH: 40,
  /** Column padding for stats display */
  STATS_COLUMN_PADDING: 20,
  /** Count column padding */
  COUNT_COLUMN_PADDING: 6,
} as const;

/**
 * Document type mapping by folder name.
 */
export const DOC_TYPE_BY_FOLDER: Record<string, KnowledgeDocType> = {
  runbooks: KNOWLEDGE_DOC_TYPES.RUNBOOK,
  postmortems: KNOWLEDGE_DOC_TYPES.POSTMORTEM,
  troubleshooting: KNOWLEDGE_DOC_TYPES.TROUBLESHOOTING,
  "known-issues": KNOWLEDGE_DOC_TYPES.KNOWN_ISSUES,
  sops: KNOWLEDGE_DOC_TYPES.SOP,
  docs: KNOWLEDGE_DOC_TYPES.ARCHITECTURE,
} as const;

// ==================== Types ====================

/**
 * CLI options parsed from command line arguments.
 */
export interface CliOptions {
  readonly type?: KnowledgeDocType;
  readonly tenant?: string;
  readonly repository?: string;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
}

/**
 * Result of a single file ingestion.
 */
export interface IngestionResult {
  readonly path: string;
  readonly success: boolean;
  readonly docId?: string;
  readonly chunkCount?: number;
  readonly error?: string;
}

// ==================== Helper Functions ====================

/**
 * Parses command line arguments.
 *
 * @param args - Command line arguments (without node and script path)
 * @returns Parsed command, target, and options
 */
export const parseArgs = (
  args: readonly string[]
): { command: string; target: string; options: CliOptions } => {
  const command = args[0] ?? "help";
  const target = args[1] ?? "";
  const options: CliOptions = {};

  args.slice(2).forEach((arg, index, allArgs) => {
    if (arg === "--type" && allArgs[index + 1]) {
      options.type = allArgs[index + 1] as KnowledgeDocType;
    }
    if (arg === "--tenant" && allArgs[index + 1]) {
      options.tenant = allArgs[index + 1];
    }
    if (arg === "--repository" && allArgs[index + 1]) {
      options.repository = allArgs[index + 1];
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
    }
    if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    }
  });

  return { command, target, options };
};

/**
 * Infers document type from file path based on folder structure.
 *
 * @param filePath - Path to the file
 * @returns Inferred document type
 */
export const inferDocType = (filePath: string): KnowledgeDocType => {
  const normalizedPath = filePath.toLowerCase();

  const matchedFolder = Object.entries(DOC_TYPE_BY_FOLDER).find(
    ([folder]) => normalizedPath.includes(`/${folder}/`) || normalizedPath.includes(`\\${folder}\\`)
  );

  return matchedFolder ? matchedFolder[1] : CLI_CONSTANTS.DEFAULT_DOC_TYPE;
};

/**
 * Extracts title from markdown content.
 *
 * @param content - Markdown content
 * @param filePath - File path (used as fallback)
 * @returns Extracted or generated title
 */
export const extractTitle = (content: string, filePath: string): string => {
  // Try to find first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fall back to filename
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Extracts tags from markdown content.
 *
 * @param content - Markdown content
 * @returns Array of extracted tags
 */
export const extractTags = (content: string): readonly string[] => {
  // Look for tags section at end of document
  const tagsMatch = content.match(/^##?\s*Tags\s*\n+`([^`]+)`/m);
  if (tagsMatch) {
    return tagsMatch[1].split(/`\s*`/).map((tag) => tag.trim());
  }

  // Look for inline tags
  const inlineMatch = content.match(/tags?:\s*`([^`]+)`/i);
  if (inlineMatch) {
    return inlineMatch[1].split(/[,\s]+/).filter(Boolean);
  }

  return [];
};

/**
 * Collects files from directory recursively.
 *
 * @param dirPath - Directory path to scan
 * @returns Array of file paths
 */
export const collectFiles = (dirPath: string): readonly string[] => {
  const results: string[] = [];
  const absoluteDir = path.resolve(dirPath);

  const processDir = (currentPath: string): void => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        processDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (
          CLI_CONSTANTS.SUPPORTED_EXTENSIONS.includes(
            ext as (typeof CLI_CONSTANTS.SUPPORTED_EXTENSIONS)[number]
          )
        ) {
          results.push(fullPath);
        }
      }
    });
  };

  processDir(absoluteDir);
  return Object.freeze(results);
};
