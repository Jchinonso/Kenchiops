#!/usr/bin/env npx tsx
/**
 * RAG Document Ingestion CLI
 *
 * Production tool for ingesting knowledge documents into the RAG system.
 *
 * Usage:
 *   npx tsx scripts/ingest-documents.ts <command> [options]
 *
 * Commands:
 *   file <path>           Ingest a single file
 *   dir <path>            Ingest all files in a directory
 *   sync-external         Sync all registered external sources
 *   list                  List ingested documents
 *   stats                 Show ingestion statistics
 *
 * Examples:
 *   npx tsx scripts/ingest-documents.ts file ./knowledge/runbooks/ci-triage.md --type runbook
 *   npx tsx scripts/ingest-documents.ts dir ./knowledge/postmortems --type postmortem
 *   npx tsx scripts/ingest-documents.ts dir ./docs --type internal_docs --tenant tenant_123
 *   npx tsx scripts/ingest-documents.ts sync-external --tenant tenant_123
 *   npx tsx scripts/ingest-documents.ts stats
 *
 * @module scripts/ingest-documents
 */

import * as fs from "fs";
import * as path from "path";
import {
  ingestKnowledgeDoc,
  syncDueSources,
  getKnowledgeDocCountsByType,
  type IngestKnowledgeDocInput,
} from "../packages/shared/src/rag/index.js";
import { KNOWLEDGE_DOC_TYPES } from "../packages/shared/src/constants/index.js";
import { logger, getErrorMessage } from "../packages/shared/src/index.js";
import {
  CLI_CONSTANTS,
  parseArgs,
  inferDocType,
  extractTitle,
  extractTags,
  collectFiles,
  type CliOptions,
  type IngestionResult,
} from "./ingest-helpers.js";

// ==================== File Preparation ====================

/**
 * Reads and prepares file for ingestion.
 */
const prepareFileForIngestion = (
  filePath: string,
  options: CliOptions
): IngestKnowledgeDocInput => {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, "utf-8");
  const docType = options.type ?? inferDocType(filePath);
  const title = extractTitle(content, filePath);
  const tags = extractTags(content);

  return {
    docType,
    title,
    content,
    filePath: absolutePath,
    tenantId: options.tenant,
    repository: options.repository,
    metadata: {
      sourcePath: filePath,
      ingestedAt: new Date().toISOString(),
      tags: [...tags],
    },
  };
};

// ==================== Commands ====================

/**
 * Ingests a single file
 */
const ingestFile = async (filePath: string, options: CliOptions): Promise<IngestionResult> => {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    return { path: filePath, success: false, error: "File not found" };
  }

  if (options.dryRun) {
    const input = prepareFileForIngestion(filePath, options);
    logger.info("[DRY RUN] Would ingest document", {
      title: input.title,
      type: input.docType,
      contentLength: input.content.length,
    });
    return { path: filePath, success: true, docId: "dry-run" };
  }

  try {
    const input = prepareFileForIngestion(filePath, options);
    const result = await ingestKnowledgeDoc(input);

    logger.info("File ingested successfully", {
      path: filePath,
      title: input.title,
      docType: input.docType,
      chunkCount: result.chunkCount,
    });

    return {
      path: filePath,
      success: true,
      docId: result.parentId,
      chunkCount: result.chunkCount,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to ingest file", { path: filePath, error: errorMessage });
    return { path: filePath, success: false, error: errorMessage };
  }
};

/**
 * Ingests all files in a directory
 */
const ingestDirectory = async (
  dirPath: string,
  options: CliOptions
): Promise<readonly IngestionResult[]> => {
  const files = collectFiles(dirPath);

  if (files.length === 0) {
    logger.info("No supported files found in directory", { dirPath });
    return [];
  }

  logger.info("Found files to ingest", { count: files.length, dirPath });

  // Process files recursively in batches
  const processFiles = async (
    index: number,
    accumulated: readonly IngestionResult[]
  ): Promise<readonly IngestionResult[]> => {
    if (index >= files.length) {
      return accumulated;
    }

    const batchEnd = Math.min(index + CLI_CONSTANTS.BATCH_SIZE, files.length);
    const batch = files.slice(index, batchEnd);
    const batchNumber = Math.floor(index / CLI_CONSTANTS.BATCH_SIZE) + 1;

    logger.info("Processing batch", { batchNumber, filesInBatch: batch.length });

    const batchResults = await Promise.all(batch.map((file) => ingestFile(file, options)));

    return processFiles(batchEnd, [...accumulated, ...batchResults]);
  };

  return processFiles(0, []);
};

/**
 * Syncs external sources
 */
const syncExternal = async (options: CliOptions): Promise<void> => {
  logger.info("Starting external source sync", { tenantId: options.tenant });

  try {
    const result = await syncDueSources({ tenantId: options.tenant });
    logger.info("External source sync complete", {
      synced: result.synced,
      skipped: result.skipped,
      errorCount: result.errors.length,
    });

    if (result.errors.length > 0) {
      result.errors.forEach((errorMessage) => {
        logger.error("External sync error", { error: errorMessage });
      });
    }
  } catch (error) {
    logger.error("Failed to sync external sources", {
      error: getErrorMessage(error),
    });
  }
};

/**
 * Shows ingestion statistics
 */
const showStats = async (): Promise<void> => {
  logger.info("Fetching RAG document statistics");

  try {
    const counts = await getKnowledgeDocCountsByType();

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    logger.info("RAG Document Statistics", { totalDocuments: total });

    Object.entries(counts)
      .sort(([, countA], [, countB]) => countB - countA)
      .forEach(([docType, count]) => {
        const percentage =
          total > 0 ? ((count / total) * CLI_CONSTANTS.PERCENTAGE_MULTIPLIER).toFixed(1) : "0";
        logger.info("Document type count", { docType, count, percentage: `${percentage}%` });
      });
  } catch (error) {
    logger.error("Failed to fetch statistics", {
      error: getErrorMessage(error),
    });
  }
};

/**
 * Prints help message
 */
const printHelp = (): void => {
  const helpText = `
RAG Document Ingestion CLI

Usage:
  npx tsx scripts/ingest-documents.ts <command> [target] [options]

Commands:
  file <path>           Ingest a single markdown file
  dir <path>            Ingest all files in a directory (recursive)
  sync-external         Sync all registered external sources
  stats                 Show document statistics
  help                  Show this help message

Options:
  --type <type>         Document type (runbook, postmortem, troubleshooting,
                        known_issues, sop, internal_docs, etc.)
  --tenant <id>         Tenant ID for multi-tenant deployments
  --repository <name>   Repository name (e.g., "owner/repo")
  --dry-run             Show what would be ingested without actually ingesting
  --verbose, -v         Enable verbose output

Supported Document Types:
${Object.values(KNOWLEDGE_DOC_TYPES)
  .map((docType) => `  - ${docType}`)
  .join("\n")}

Examples:
  # Ingest a single runbook
  npx tsx scripts/ingest-documents.ts file ./knowledge/runbooks/ci-triage.md --type runbook

  # Ingest all postmortems
  npx tsx scripts/ingest-documents.ts dir ./knowledge/postmortems --type postmortem

  # Ingest docs folder for a specific tenant
  npx tsx scripts/ingest-documents.ts dir ./docs --tenant tenant_abc123

  # Preview what would be ingested
  npx tsx scripts/ingest-documents.ts dir ./knowledge --dry-run

  # Show current statistics
  npx tsx scripts/ingest-documents.ts stats
`;

  logger.info(helpText);
};

// ==================== Main ====================

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const { command, target, options } = parseArgs(args);

  if (options.verbose) {
    logger.info("CLI options parsed", { command, target, options });
  }

  const commandHandlers: Record<string, () => Promise<void>> = {
    file: async () => {
      if (!target) {
        logger.error("File path required");
        process.exit(1);
      }
      const result = await ingestFile(target, options);
      if (result.success) {
        logger.info("Ingestion successful", {
          path: result.path,
          docId: result.docId,
          chunkCount: result.chunkCount,
        });
      } else {
        logger.error("Ingestion failed", { path: result.path, error: result.error });
        process.exit(1);
      }
    },

    dir: async () => {
      if (!target) {
        logger.error("Directory path required");
        process.exit(1);
      }
      const results = await ingestDirectory(target, options);
      const successful = results.filter((result) => result.success);
      const failed = results.filter((result) => !result.success);

      logger.info("Directory ingestion complete", {
        totalFiles: results.length,
        successful: successful.length,
        failed: failed.length,
      });

      if (failed.length > 0) {
        failed.forEach((result) => {
          logger.error("Failed file", { path: result.path, error: result.error });
        });
        process.exit(1);
      }
    },

    "sync-external": async () => {
      await syncExternal(options);
    },

    stats: async () => {
      await showStats();
    },

    help: async () => {
      printHelp();
    },
  };

  const handler = commandHandlers[command];
  if (handler) {
    await handler();
  } else {
    logger.error("Unknown command", { command });
    printHelp();
    process.exit(1);
  }
};

const runMain = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    logger.error("Fatal error", {
      error: getErrorMessage(error),
    });
    process.exit(1);
  }
};

void runMain();
