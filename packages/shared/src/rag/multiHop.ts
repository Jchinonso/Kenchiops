/**
 * Multi-Hop RAG Module
 *
 * Provides graph-based retrieval across related incidents and documents.
 * Supports traversing relationships to find contextually relevant content.
 *
 * @module rag/multiHop
 */

import { createLogger } from "../core/logger.js";
import { MULTI_HOP_CONFIG, type RelationshipType } from "../constants/index.js";
import { getBidirectionalRelationships, type IncidentRelationship } from "../database/index.js";

// Import types used internally
import type { GraphNode, MultiHopOptions, TraversalState, QueueItem } from "./multiHopTypes.js";

// Re-export public types for external consumers
export type { GraphNode, MultiHopResult, MultiHopOptions } from "./multiHopTypes.js";

const logger = createLogger("rag-multi-hop");

// ==================== Graph Traversal ====================

/**
 * Gets target document ID from relationship based on current document.
 */
const getTargetDocId = (relationship: IncidentRelationship, currentDocId: string): string =>
  relationship.fromDocId === currentDocId ? relationship.toDocId : relationship.fromDocId;

/**
 * Processes relationships for a single queue item.
 */
const processRelationships = (
  relationships: readonly IncidentRelationship[],
  item: QueueItem,
  visited: Set<string>
): { newNodes: readonly GraphNode[]; nextItems: readonly QueueItem[] } => {
  const results = relationships
    .map((relationship) => {
      const targetId = getTargetDocId(relationship, item.docId);
      return { relationship, targetId };
    })
    .filter(({ targetId }) => !visited.has(targetId))
    .map(({ relationship, targetId }) => {
      visited.add(targetId);

      const newPathStrength =
        item.pathStrength * relationship.strength * MULTI_HOP_CONFIG.SIMILARITY_DECAY_PER_HOP;

      const node: GraphNode = {
        docId: targetId,
        hopDepth: item.depth + 1,
        pathStrength: newPathStrength,
        relationshipType: relationship.relationshipType,
      };

      const nextItem: QueueItem = {
        docId: targetId,
        depth: item.depth + 1,
        pathStrength: newPathStrength,
        relationshipChain: [...item.relationshipChain, relationship.relationshipType],
      };

      return { node, nextItem };
    });

  return {
    newNodes: results.map((result) => result.node),
    nextItems: results.map((result) => result.nextItem),
  };
};

/**
 * Processes a single level of BFS traversal.
 */
const processTraversalLevel = async (
  currentLevel: readonly QueueItem[],
  visited: Set<string>,
  maxDepth: number,
  minStrength: number
): Promise<{ nextLevel: readonly QueueItem[]; newNodes: readonly GraphNode[] }> => {
  // Process each item at current level recursively
  const processItem = async (
    index: number,
    accumulatedNodes: readonly GraphNode[],
    accumulatedNext: readonly QueueItem[]
  ): Promise<{ newNodes: readonly GraphNode[]; nextLevel: readonly QueueItem[] }> => {
    if (index >= currentLevel.length) {
      return { newNodes: accumulatedNodes, nextLevel: accumulatedNext };
    }

    const item = currentLevel[index];

    // Skip if max depth reached
    if (item.depth >= maxDepth) {
      return processItem(index + 1, accumulatedNodes, accumulatedNext);
    }

    // Get relationships from this document
    const relationships = await getBidirectionalRelationships(item.docId, minStrength);
    const { newNodes, nextItems } = processRelationships(relationships, item, visited);

    return processItem(
      index + 1,
      [...accumulatedNodes, ...newNodes],
      [...accumulatedNext, ...nextItems]
    );
  };

  return processItem(0, [], []);
};

/**
 * Recursive BFS traversal across all levels.
 */
const traverseLevels = async (
  currentLevel: readonly QueueItem[],
  state: TraversalState,
  maxDepth: number,
  minStrength: number
): Promise<TraversalState> => {
  if (currentLevel.length === 0) {
    return state;
  }

  const { nextLevel, newNodes } = await processTraversalLevel(
    currentLevel,
    state.visited,
    maxDepth,
    minStrength
  );

  const updatedState: TraversalState = {
    visited: state.visited,
    nodes: [...state.nodes, ...newNodes],
  };

  return traverseLevels(nextLevel, updatedState, maxDepth, minStrength);
};

// ==================== Public API ====================

/**
 * Performs multi-hop graph traversal from starting documents.
 * Uses BFS with strength-weighted path scoring.
 *
 * @param startDocIds - Initial document IDs to start traversal
 * @param options - Traversal options
 * @returns Array of graph nodes with path information
 */
export const traverseGraph = async (
  startDocIds: readonly string[],
  options: MultiHopOptions = {}
): Promise<readonly GraphNode[]> => {
  const maxDepth = options.maxDepth ?? MULTI_HOP_CONFIG.MAX_HOP_DEPTH;
  const minStrength = options.minStrength ?? MULTI_HOP_CONFIG.MIN_RELATIONSHIP_STRENGTH;
  const maxResults = options.maxResults ?? MULTI_HOP_CONFIG.MAX_TOTAL_GRAPH_DOCS;

  // Initialize visited set with start documents
  const visited = new Set<string>(startDocIds);

  // Initialize BFS queue
  const initialLevel: readonly QueueItem[] = startDocIds.map((docId) => ({
    docId,
    depth: 0,
    pathStrength: 1.0,
    relationshipChain: [],
  }));

  const initialState: TraversalState = {
    visited,
    nodes: [],
  };

  // Execute traversal
  const finalState = await traverseLevels(initialLevel, initialState, maxDepth, minStrength);

  // Sort by path strength and limit results
  const sortedNodes = [...finalState.nodes]
    .sort((nodeA, nodeB) => nodeB.pathStrength - nodeA.pathStrength)
    .slice(0, maxResults);

  logger.debug("Graph traversal complete", {
    startDocs: startDocIds.length,
    resultCount: sortedNodes.length,
    maxDepth,
  });

  return Object.freeze(sortedNodes);
};

/**
 * Finds related documents from initial search results.
 * Expands search results with graph-connected documents.
 *
 * @param initialDocIds - Document IDs from initial vector search
 * @param options - Traversal options
 * @returns Combined array of initial + related document IDs
 */
export const expandWithRelatedDocs = async (
  initialDocIds: readonly string[],
  options: MultiHopOptions = {}
): Promise<readonly string[]> => {
  if (initialDocIds.length === 0) {
    return [];
  }

  const graphNodes = await traverseGraph(initialDocIds, options);

  // Combine initial docs with graph-discovered docs (unique)
  const allDocIds = new Set<string>(initialDocIds);
  graphNodes.forEach((node) => allDocIds.add(node.docId));

  logger.info("Expanded search with related docs", {
    initialCount: initialDocIds.length,
    expandedCount: allDocIds.size,
    graphNodesFound: graphNodes.length,
  });

  return Object.freeze([...allDocIds]);
};

/**
 * Gets graph statistics for a set of documents.
 *
 * @param docIds - Document IDs to analyze
 * @returns Statistics about the document graph
 */
export const getGraphStats = async (
  docIds: readonly string[]
): Promise<{
  totalDocs: number;
  connectedDocs: number;
  averageConnections: number;
  maxDepthReached: number;
}> => {
  const graphNodes = await traverseGraph(docIds, { maxDepth: MULTI_HOP_CONFIG.MAX_HOP_DEPTH });

  const connectedDocIds = new Set<string>();
  let maxDepth = 0;

  graphNodes.forEach((node) => {
    connectedDocIds.add(node.docId);
    maxDepth = Math.max(maxDepth, node.hopDepth);
  });

  return {
    totalDocs: docIds.length,
    connectedDocs: connectedDocIds.size,
    averageConnections: docIds.length > 0 ? graphNodes.length / docIds.length : 0,
    maxDepthReached: maxDepth,
  };
};

/**
 * Reconstructs path from pathMap using recursion.
 */
const reconstructPath = (
  pathMap: Map<string, { prev: string; type: RelationshipType; strength: number }>,
  fromDocId: string,
  current: string,
  pathAcc: readonly string[],
  relAcc: readonly RelationshipType[],
  strengthAcc: number
): {
  path: readonly string[];
  relationships: readonly RelationshipType[];
  totalStrength: number;
} => {
  if (current === fromDocId) {
    return {
      path: Object.freeze(pathAcc),
      relationships: Object.freeze(relAcc),
      totalStrength: strengthAcc,
    };
  }

  const info = pathMap.get(current);
  if (!info) {
    return {
      path: Object.freeze(pathAcc),
      relationships: Object.freeze(relAcc),
      totalStrength: strengthAcc,
    };
  }

  return reconstructPath(
    pathMap,
    fromDocId,
    info.prev,
    [info.prev, ...pathAcc],
    [info.type, ...relAcc],
    strengthAcc * info.strength
  );
};

/**
 * Finds the shortest path between two documents in the relationship graph.
 *
 * @param fromDocId - Starting document ID
 * @param toDocId - Target document ID
 * @param maxDepth - Maximum search depth
 * @returns Path information or null if no path found
 */
export const findPath = async (
  fromDocId: string,
  toDocId: string,
  maxDepth: number = MULTI_HOP_CONFIG.MAX_HOP_DEPTH
): Promise<{
  path: readonly string[];
  relationships: readonly RelationshipType[];
  totalStrength: number;
} | null> => {
  const visited = new Set<string>([fromDocId]);
  const pathMap = new Map<string, { prev: string; type: RelationshipType; strength: number }>();

  // BFS to find shortest path - process relationships functionally
  const processRelationshipsForPath = (
    relationships: readonly IncidentRelationship[],
    docId: string,
    depth: number,
    nextLevel: Array<{ docId: string; depth: number }>
  ): string | null => {
    const foundTarget = relationships.find((rel) => {
      const targetId = getTargetDocId(rel, docId);
      return targetId === toDocId;
    });

    if (foundTarget) {
      const targetId = getTargetDocId(foundTarget, docId);
      pathMap.set(targetId, {
        prev: docId,
        type: foundTarget.relationshipType,
        strength: foundTarget.strength,
      });
      return targetId;
    }

    relationships.forEach((rel) => {
      const targetId = getTargetDocId(rel, docId);
      if (!visited.has(targetId)) {
        visited.add(targetId);
        pathMap.set(targetId, { prev: docId, type: rel.relationshipType, strength: rel.strength });
        nextLevel.push({ docId: targetId, depth: depth + 1 });
      }
    });

    return null;
  };

  // Recursive BFS level processing
  const findPathLevel = async (
    currentLevel: ReadonlyArray<{ docId: string; depth: number }>
  ): Promise<boolean> => {
    if (currentLevel.length === 0) {
      return false;
    }

    const nextLevel: Array<{ docId: string; depth: number }> = [];

    const processItem = async (index: number): Promise<boolean> => {
      if (index >= currentLevel.length) {
        return false;
      }

      const { docId, depth } = currentLevel[index];

      if (depth >= maxDepth) {
        return processItem(index + 1);
      }

      const relationships = await getBidirectionalRelationships(docId);
      const found = processRelationshipsForPath(relationships, docId, depth, nextLevel);

      if (found) {
        return true;
      }

      return processItem(index + 1);
    };

    const found = await processItem(0);
    if (found) {
      return true;
    }

    return findPathLevel(nextLevel);
  };

  const found = await findPathLevel([{ docId: fromDocId, depth: 0 }]);

  if (!found) {
    return null;
  }

  // Reconstruct path using recursion
  const result = reconstructPath(pathMap, fromDocId, toDocId, [toDocId], [], 1.0);

  logger.debug("Found path between documents", {
    from: fromDocId,
    to: toDocId,
    pathLength: result.path.length,
  });

  return result;
};
