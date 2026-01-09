/**
 * Multi-Hop RAG Types
 *
 * Type definitions for graph-based retrieval.
 *
 * @module rag/multiHopTypes
 */

import type { RelationshipType } from "../constants/index.js";
import type { KnowledgeDocRecord } from "../database/vectorTypes.js";

// ==================== Types ====================

/**
 * Graph node representing a document with path information.
 */
export interface GraphNode {
  readonly docId: string;
  readonly hopDepth: number;
  readonly pathStrength: number;
  readonly relationshipType: RelationshipType;
}

/**
 * Multi-hop search result combining document with graph metadata.
 */
export interface MultiHopResult {
  readonly doc: KnowledgeDocRecord;
  readonly hopDepth: number;
  readonly pathStrength: number;
  readonly relationshipChain: readonly RelationshipType[];
}

/**
 * Options for multi-hop traversal.
 */
export interface MultiHopOptions {
  readonly maxDepth?: number;
  readonly minStrength?: number;
  readonly maxResults?: number;
}

/**
 * State for BFS traversal.
 */
export interface TraversalState {
  readonly visited: Set<string>;
  readonly nodes: readonly GraphNode[];
}

/**
 * Queue item for BFS processing.
 */
export interface QueueItem {
  readonly docId: string;
  readonly depth: number;
  readonly pathStrength: number;
  readonly relationshipChain: readonly RelationshipType[];
}

/**
 * Path reconstruction result.
 */
export interface PathResult {
  readonly path: readonly string[];
  readonly relationships: readonly RelationshipType[];
  readonly totalStrength: number;
}
