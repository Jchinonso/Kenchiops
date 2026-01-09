#!/usr/bin/env npx tsx
/**
 * Batch Document Import Script
 *
 * Production script for bulk importing documentation into the RAG system.
 * Imports both internal docs and operational knowledge documents.
 *
 * Usage:
 *   npx tsx scripts/batch-import-docs.ts [options]
 *
 * Options:
 *   --dry-run       Preview what would be ingested without actually ingesting
 *   --docs-only     Only import docs/ folder
 *   --knowledge-only Only import knowledge/ folder
 *   --tenant <id>   Tenant ID for multi-tenant deployments
 *   --verbose, -v   Enable verbose output
 *
 * @module scripts/batch-import-docs
 */

import * as fs from "fs";
import * as path from "path";
import {
  ingestKnowledgeDoc,
  type IngestKnowledgeDocInput,
} from "../packages/shared/src/rag/index.js";
import {
  KNOWLEDGE_DOC_TYPES,
  type KnowledgeDocType,
} from "../packages/shared/src/constants/index.js";
import { logger, getErrorMessage } from "../packages/shared/src/index.js";

// ==================== Constants ====================

const BATCH_CONSTANTS = {
  /** Root directory of the project */
  PROJECT_ROOT: process.cwd(),
  /** Docs folder path */
  DOCS_PATH: "docs",
  /** Knowledge folder path */
  KNOWLEDGE_PATH: "knowledge",
  /** Supported file extensions */
  SUPPORTED_EXTENSIONS: [".md", ".mdx", ".txt", ".rst"] as const,
  /** Batch size for concurrent ingestion */
  BATCH_SIZE: 5,
  /** Percentage multiplier for progress display */
  PERCENTAGE_MULTIPLIER: 100,
} as const;

/**
 * Mapping of folder names to document types
 */
const FOLDER_DOC_TYPE_MAP: Readonly<Record<string, KnowledgeDocType>> = {
  runbooks: KNOWLEDGE_DOC_TYPES.RUNBOOK,
  postmortems: KNOWLEDGE_DOC_TYPES.POSTMORTEM,
  troubleshooting: KNOWLEDGE_DOC_TYPES.TROUBLESHOOTING,
  "known-issues": KNOWLEDGE_DOC_TYPES.KNOWN_ISSUES,
  sops: KNOWLEDGE_DOC_TYPES.SOP,
  docs: KNOWLEDGE_DOC_TYPES.ARCHITECTURE,
} as const;

// ==================== Types ====================

interface BatchOptions {
  readonly dryRun: boolean;
  readonly docsOnly: boolean;
  readonly knowledgeOnly: boolean;
  readonly tenantId?: string;
  readonly verbose: boolean;
}

interface FileInfo {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly docType: KnowledgeDocType;
}

interface IngestionSummary {
  readonly totalFiles: number;
  readonly successful: number;
  readonly failed: number;
  readonly skipped: number;
  readonly errors: ReadonlyArray<{ path: string; error: string }>;
}

// ==================== Helper Functions ====================

/**
 * Parses command line arguments
 */
const parseArguments = (args: readonly string[]): BatchOptions => {
  const options: BatchOptions = {
    dryRun: args.includes("--dry-run"),
    docsOnly: args.includes("--docs-only"),
    knowledgeOnly: args.includes("--knowledge-only"),
    verbose: args.includes("--verbose") || args.includes("-v"),
    tenantId: undefined,
  };

  const tenantIndex = args.indexOf("--tenant");
  if (tenantIndex !== -1 && args[tenantIndex + 1]) {
    return { ...options, tenantId: args[tenantIndex + 1] };
  }

  return options;
};

/**
 * Infers document type from file path
 */
const inferDocType = (filePath: string): KnowledgeDocType => {
  const normalizedPath = filePath.toLowerCase();

  const matchedEntry = Object.entries(FOLDER_DOC_TYPE_MAP).find(
    ([folder]) => normalizedPath.includes(`/${folder}/`) || normalizedPath.includes(`\\${folder}\\`)
  );

  return matchedEntry ? matchedEntry[1] : KNOWLEDGE_DOC_TYPES.ARCHITECTURE;
};

/**
 * Extracts title from markdown content
 */
const extractTitle = (content: string, filePath: string): string => {
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
 * Collects files from a directory recursively
 */
const collectFilesFromDirectory = (dirPath: string, basePath: string): readonly FileInfo[] => {
  const absoluteDir = path.resolve(basePath, dirPath);

  if (!fs.existsSync(absoluteDir)) {
    logger.warn("Directory not found, skipping", { dirPath: absoluteDir });
    return [];
  }

  const results: FileInfo[] = [];

  const processDirectory = (currentPath: string): void => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        processDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const isSupportedExtension = BATCH_CONSTANTS.SUPPORTED_EXTENSIONS.includes(
          ext as (typeof BATCH_CONSTANTS.SUPPORTED_EXTENSIONS)[number]
        );

        if (isSupportedExtension) {
          results.push({
            absolutePath: fullPath,
            relativePath,
            docType: inferDocType(relativePath),
          });
        }
      }
    });
  };

  processDirectory(absoluteDir);
  return Object.freeze(results);
};

/**
 * Ingests a single file
 */
const ingestFile = async (
  fileInfo: FileInfo,
  options: BatchOptions
): Promise<{ success: boolean; error?: string }> => {
  if (options.dryRun) {
    logger.info("[DRY RUN] Would ingest file", {
      path: fileInfo.relativePath,
      docType: fileInfo.docType,
    });
    return { success: true };
  }

  try {
    const content = fs.readFileSync(fileInfo.absolutePath, "utf-8");
    const title = extractTitle(content, fileInfo.absolutePath);

    const input: IngestKnowledgeDocInput = {
      docType: fileInfo.docType,
      title,
      content,
      filePath: fileInfo.absolutePath,
      tenantId: options.tenantId,
      metadata: {
        sourcePath: fileInfo.relativePath,
        ingestedAt: new Date().toISOString(),
        batchImport: true,
      },
    };

    const result = await ingestKnowledgeDoc(input);

    if (options.verbose) {
      logger.info("File ingested successfully", {
        path: fileInfo.relativePath,
        title,
        chunksCreated: result.chunksCreated,
        chunksEmbedded: result.chunksEmbedded,
      });
    }

    return { success: result.success };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to ingest file", {
      path: fileInfo.relativePath,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
};

/**
 * Processes files in batches
 */
const processFilesInBatches = async (
  files: readonly FileInfo[],
  options: BatchOptions
): Promise<IngestionSummary> => {
  const errors: Array<{ path: string; error: string }> = [];
  let successful = 0;
  let failed = 0;

  // Process recursively in batches
  const processBatch = async (startIndex: number): Promise<void> => {
    if (startIndex >= files.length) {
      return;
    }

    const endIndex = Math.min(startIndex + BATCH_CONSTANTS.BATCH_SIZE, files.length);
    const batch = files.slice(startIndex, endIndex);
    const batchNumber = Math.floor(startIndex / BATCH_CONSTANTS.BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(files.length / BATCH_CONSTANTS.BATCH_SIZE);

    logger.info("Processing batch", {
      batch: batchNumber,
      total: totalBatches,
      filesInBatch: batch.length,
    });

    const results = await Promise.all(batch.map((file) => ingestFile(file, options)));

    results.forEach((result, index) => {
      if (result.success) {
        successful++;
      } else {
        failed++;
        if (result.error) {
          errors.push({ path: batch[index].relativePath, error: result.error });
        }
      }
    });

    await processBatch(endIndex);
  };

  await processBatch(0);

  return Object.freeze({
    totalFiles: files.length,
    successful,
    failed,
    skipped: 0,
    errors: Object.freeze(errors),
  });
};

/**
 * Merges ingestion summaries
 */
const mergeSummaries = (summaries: readonly IngestionSummary[]): IngestionSummary => {
  const merged = summaries.reduce(
    (accumulator, summary) => ({
      totalFiles: accumulator.totalFiles + summary.totalFiles,
      successful: accumulator.successful + summary.successful,
      failed: accumulator.failed + summary.failed,
      skipped: accumulator.skipped + summary.skipped,
      errors: [...accumulator.errors, ...summary.errors],
    }),
    {
      totalFiles: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ path: string; error: string }>,
    }
  );

  return Object.freeze({
    ...merged,
    errors: Object.freeze(merged.errors),
  });
};

/**
 * Prints usage help
 */
const printHelp = (): void => {
  const helpText = `
Batch Document Import Script

Usage:
  npx tsx scripts/batch-import-docs.ts [options]

Options:
  --dry-run         Preview what would be ingested without actually ingesting
  --docs-only       Only import docs/ folder (internal documentation)
  --knowledge-only  Only import knowledge/ folder (operational documents)
  --tenant <id>     Tenant ID for multi-tenant deployments
  --verbose, -v     Enable verbose output
  --help, -h        Show this help message

Document Types by Folder:
  docs/                      -> architecture
  knowledge/runbooks/        -> runbook
  knowledge/postmortems/     -> postmortem
  knowledge/troubleshooting/ -> troubleshooting
  knowledge/known-issues/    -> known_issues
  knowledge/sops/            -> sop

Examples:
  # Preview what would be imported
  npx tsx scripts/batch-import-docs.ts --dry-run

  # Import all documentation
  npx tsx scripts/batch-import-docs.ts

  # Import only internal docs
  npx tsx scripts/batch-import-docs.ts --docs-only --verbose

  # Import only knowledge documents
  npx tsx scripts/batch-import-docs.ts --knowledge-only

  # Import for a specific tenant
  npx tsx scripts/batch-import-docs.ts --tenant tenant_abc123
`;

  logger.info(helpText);
};

// ==================== Main ====================

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const options = parseArguments(args);

  logger.info("Starting batch document import", {
    dryRun: options.dryRun,
    docsOnly: options.docsOnly,
    knowledgeOnly: options.knowledgeOnly,
    tenantId: options.tenantId,
  });

  const summaries: IngestionSummary[] = [];

  // Import docs/ folder
  if (!options.knowledgeOnly) {
    logger.info("Collecting files from docs/ folder");
    const docsFiles = collectFilesFromDirectory(
      BATCH_CONSTANTS.DOCS_PATH,
      BATCH_CONSTANTS.PROJECT_ROOT
    );
    logger.info("Found documentation files", { count: docsFiles.length });

    if (docsFiles.length > 0) {
      const docsSummary = await processFilesInBatches(docsFiles, options);
      summaries.push(docsSummary);
    }
  }

  // Import knowledge/ folder
  if (!options.docsOnly) {
    logger.info("Collecting files from knowledge/ folder");
    const knowledgeFiles = collectFilesFromDirectory(
      BATCH_CONSTANTS.KNOWLEDGE_PATH,
      BATCH_CONSTANTS.PROJECT_ROOT
    );
    logger.info("Found knowledge files", { count: knowledgeFiles.length });

    if (knowledgeFiles.length > 0) {
      const knowledgeSummary = await processFilesInBatches(knowledgeFiles, options);
      summaries.push(knowledgeSummary);
    }
  }

  // Final summary
  const finalSummary = mergeSummaries(summaries);

  logger.info("Batch import complete", {
    totalFiles: finalSummary.totalFiles,
    successful: finalSummary.successful,
    failed: finalSummary.failed,
    skipped: finalSummary.skipped,
  });

  if (finalSummary.errors.length > 0) {
    logger.error("Import errors occurred", { errorCount: finalSummary.errors.length });
    finalSummary.errors.forEach((errorEntry) => {
      logger.error("File import error", { path: errorEntry.path, error: errorEntry.error });
    });
    process.exit(1);
  }

  if (options.dryRun) {
    logger.info("Dry run complete - no files were actually ingested");
  }
};

const runMain = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    logger.error("Fatal error during batch import", {
      error: getErrorMessage(error),
    });
    process.exit(1);
  }
};

void runMain();
