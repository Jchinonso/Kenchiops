/**
 * Relationship Detection Module
 *
 * Automatically detects and creates relationships between documents during ingestion.
 * Uses content analysis to identify semantic connections for multi-hop RAG.
 *
 * @module rag/relationshipDetection
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_DETECTION_CONFIG,
  RELATIONSHIP_STRENGTH_WEIGHTS,
  type RelationshipType,
} from "../constants/index.js";
import { createRelationshipsBatch, type CreateRelationshipInput } from "../database/index.js";
import { searchKnowledgeDocs } from "./search.js";
import type {
  DocumentContext,
  DetectedRelationship,
  RelationshipDetectionResult,
  KnowledgeDocSearchResult,
  ScoredRelationship,
} from "./types.js";

export type {
  DocumentContext,
  DetectedRelationship,
  RelationshipDetectionResult,
} from "./types.js";

const logger = createLogger("rag-relationship-detection");

// ==================== Pattern Extractors ====================

/**
 * Extracts all matches from a string using matchAll and maps to specified group.
 */
const extractAllMatches = (
  content: string,
  pattern: RegExp,
  groupIndex: number = 1
): readonly string[] => {
  const matches = [...content.matchAll(pattern)];
  return matches
    .map((match) => match[groupIndex])
    .filter((value): value is string => value !== undefined);
};

/**
 * Extracts error patterns from content for matching.
 */
const extractErrorPatterns = (content: string): readonly string[] => {
  const patterns: string[] = [];
  const lowerContent = content.toLowerCase();

  // Extract error class names (e.g., TypeError, NullPointerException)
  const errorClassPattern = /(?:error|exception):\s*([A-Z][a-zA-Z]+(?:Error|Exception))/gi;
  extractAllMatches(content, errorClassPattern).forEach((match) =>
    patterns.push(match.toLowerCase())
  );

  // Extract error messages in quotes
  const quotedErrorPattern = /(?:error|failed|exception):\s*["']([^"']+)["']/gi;
  extractAllMatches(content, quotedErrorPattern).forEach((match) => {
    if (
      match.length > RELATIONSHIP_DETECTION_CONFIG.MIN_ERROR_MESSAGE_LENGTH &&
      match.length < RELATIONSHIP_DETECTION_CONFIG.MAX_ERROR_MESSAGE_LENGTH
    ) {
      patterns.push(match.toLowerCase());
    }
  });

  // Extract file:line patterns (e.g., src/index.ts:42)
  const fileLinePattern = /([a-zA-Z0-9_/.-]+\.[a-z]+):(\d+)/g;
  const fileMatches = [...content.matchAll(fileLinePattern)];
  fileMatches.forEach((match) => {
    patterns.push(`${match[1]}:${match[2]}`);
  });

  // Extract common error keywords
  const errorKeywords = ["timeout", "connection refused", "out of memory", "stack overflow"];
  errorKeywords.forEach((keyword) => {
    if (lowerContent.includes(keyword)) {
      patterns.push(keyword);
    }
  });

  return Object.freeze([...new Set(patterns)]);
};

/**
 * Extracts technology/dependency patterns from content.
 */
const extractTechPatterns = (content: string): readonly string[] => {
  const patterns: string[] = [];
  const lowerContent = content.toLowerCase();

  // Common package managers and dependencies
  const techPatterns = [
    /(?:npm|yarn|pnpm)\s+(?:install|add)\s+([a-z0-9@/-]+)/gi,
    /require\(['"]([a-z0-9@/-]+)['"]\)/g,
    /import\s+.*from\s+['"]([a-z0-9@/-]+)['"]/g,
    /uses:\s+([a-zA-Z0-9/-]+)@/g, // GitHub Actions
  ];

  techPatterns.forEach((pattern) => {
    extractAllMatches(content, pattern).forEach((match) => {
      if (!match.startsWith(".")) {
        patterns.push(match.toLowerCase());
      }
    });
  });

  // Common technologies
  const techKeywords = [
    "docker",
    "kubernetes",
    "redis",
    "postgres",
    "mongodb",
    "elasticsearch",
    "nginx",
    "aws",
    "gcp",
    "azure",
  ];
  techKeywords.forEach((tech) => {
    if (lowerContent.includes(tech)) {
      patterns.push(tech);
    }
  });

  return Object.freeze([...new Set(patterns)]);
};

/**
 * Calculates pattern overlap score between two pattern sets.
 */
const calculatePatternOverlap = (
  patterns1: readonly string[],
  patterns2: readonly string[]
): number => {
  if (patterns1.length === 0 || patterns2.length === 0) {
    return 0;
  }

  const set1 = new Set(patterns1);
  const set2 = new Set(patterns2);
  let overlap = 0;

  set1.forEach((pattern) => {
    if (set2.has(pattern)) {
      overlap++;
    }
  });

  // Jaccard-like similarity
  const union = new Set([...patterns1, ...patterns2]).size;
  return union > 0 ? overlap / union : 0;
};

// ==================== Relationship Detection ====================

/**
 * Determines relationship type based on document types and content.
 */
const determineRelationshipType = (
  sourceDoc: DocumentContext,
  targetDocType: string,
  _similarity: number
): RelationshipType => {
  const sourceType = sourceDoc.docType;

  // Postmortem → Analysis lesson = MITIGATED_BY
  if (sourceType === "postmortem" && targetDocType === "analysis_lesson") {
    return RELATIONSHIP_TYPES.MITIGATED_BY;
  }

  // Runbook → Troubleshooting = RELATED_TO
  if (sourceType === "runbook" && targetDocType === "troubleshooting") {
    return RELATIONSHIP_TYPES.RELATED_TO;
  }

  // PR fix → Analysis lesson = CAUSED_BY (the lesson references the fix)
  if (sourceType === "pr_fix_comment" && targetDocType === "analysis_lesson") {
    return RELATIONSHIP_TYPES.CAUSED_BY;
  }

  // Same repository documents = RELATED_TO
  if (sourceDoc.repository) {
    return RELATIONSHIP_TYPES.RELATED_TO;
  }

  // Default to RELATED_TO for semantic matches
  return RELATIONSHIP_TYPES.RELATED_TO;
};

/**
 * Calculates relationship strength based on similarity and patterns.
 */
const calculateStrength = (
  semanticSimilarity: number,
  patternOverlap: number,
  sameRepository: boolean
): number => {
  let strength =
    semanticSimilarity * RELATIONSHIP_STRENGTH_WEIGHTS.SEMANTIC +
    patternOverlap * RELATIONSHIP_STRENGTH_WEIGHTS.PATTERN;

  if (sameRepository) {
    strength += RELATIONSHIP_STRENGTH_WEIGHTS.SAME_REPO;
  }

  return Math.min(1.0, Math.max(0.0, strength));
};

/**
 * Finds related documents using semantic search and pattern matching.
 */
export const findRelatedDocuments = async (
  doc: DocumentContext,
  maxResults: number = RELATIONSHIP_DETECTION_CONFIG.MAX_RELATED_DOCS
): Promise<readonly DetectedRelationship[]> => {
  try {
    // Extract patterns from source document
    const errorPatterns = extractErrorPatterns(doc.content);
    const techPatterns = extractTechPatterns(doc.content);

    // Build search query from title and key content
    const queryText = `${doc.title} ${doc.content.slice(0, 500)}`;

    // Search for semantically similar documents
    const searchResponse = await searchKnowledgeDocs({
      queryText,
      topK: maxResults * 2, // Get more to filter
      tenantId: doc.tenantId,
    });

    // Filter and score results - map VectorSearchResult to our simpler type
    const searchResults: readonly KnowledgeDocSearchResult[] = searchResponse.results.map(
      (vectorResult) => ({
        id: vectorResult.item.id,
        content: vectorResult.item.content,
        similarity: vectorResult.similarity,
        repository: vectorResult.item.repository ?? undefined,
        docType: vectorResult.item.docType,
      })
    );

    const relationships = searchResults
      .filter((result: KnowledgeDocSearchResult) => result.id !== doc.docId) // Skip self-references
      .map((result: KnowledgeDocSearchResult) => {
        // Extract patterns from target document
        const targetErrorPatterns = extractErrorPatterns(result.content);
        const targetTechPatterns = extractTechPatterns(result.content);

        // Calculate pattern overlaps
        const errorOverlap = calculatePatternOverlap(errorPatterns, targetErrorPatterns);
        const techOverlap = calculatePatternOverlap(techPatterns, targetTechPatterns);
        const combinedPatternOverlap = (errorOverlap + techOverlap) / 2;

        // Check same repository
        const sameRepo = doc.repository !== undefined && doc.repository === result.repository;

        // Calculate overall strength
        const strength = calculateStrength(result.similarity, combinedPatternOverlap, sameRepo);

        return {
          result,
          strength,
          combinedPatternOverlap,
        };
      })
      .filter(
        ({ strength }: ScoredRelationship) =>
          strength >= RELATIONSHIP_DETECTION_CONFIG.MIN_STRENGTH_THRESHOLD
      )
      .map(({ result, strength, combinedPatternOverlap }: ScoredRelationship) => {
        const relationshipType = determineRelationshipType(doc, result.docType, result.similarity);

        return {
          fromDocId: doc.docId,
          toDocId: result.id,
          relationshipType,
          strength,
          reason: `Semantic similarity: ${result.similarity.toFixed(2)}, Pattern overlap: ${combinedPatternOverlap.toFixed(2)}`,
        };
      })
      .sort(
        (relA: DetectedRelationship, relB: DetectedRelationship) => relB.strength - relA.strength
      )
      .slice(0, maxResults);

    return Object.freeze(relationships);
  } catch (error) {
    logger.warn("Failed to find related documents", {
      docId: doc.docId,
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Creates relationships from detected relationships.
 */
export const createDetectedRelationships = async (
  relationships: readonly DetectedRelationship[]
): Promise<RelationshipDetectionResult> => {
  if (relationships.length === 0) {
    return { detected: 0, created: 0, errors: [] };
  }

  const errors: string[] = [];

  try {
    const inputs: CreateRelationshipInput[] = relationships.map((rel) => ({
      fromDocId: rel.fromDocId,
      toDocId: rel.toDocId,
      relationshipType: rel.relationshipType,
      strength: rel.strength,
      metadata: { reason: rel.reason, autoDetected: true },
    }));

    const created = await createRelationshipsBatch(inputs);

    logger.info("Created auto-detected relationships", {
      detected: relationships.length,
      created: created.length,
    });

    return {
      detected: relationships.length,
      created: created.length,
      errors: Object.freeze(errors),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to create relationships", { error: errorMessage });
    errors.push(errorMessage);

    return {
      detected: relationships.length,
      created: 0,
      errors: Object.freeze(errors),
    };
  }
};

/**
 * Detects and creates relationships for a newly ingested document.
 * Call this after ingestion is complete.
 */
export const detectAndCreateRelationships = async (
  doc: DocumentContext
): Promise<RelationshipDetectionResult> => {
  logger.debug("Starting relationship detection", {
    docId: doc.docId,
    docType: doc.docType,
  });

  // Find related documents
  const relationships = await findRelatedDocuments(doc);

  if (relationships.length === 0) {
    logger.debug("No relationships detected", { docId: doc.docId });
    return { detected: 0, created: 0, errors: [] };
  }

  // Create the relationships
  return createDetectedRelationships(relationships);
};
