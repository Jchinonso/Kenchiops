/**
 * JSON Extraction Utilities
 *
 * State machine-based JSON extraction from LLM responses.
 * Handles markdown-wrapped JSON and malformed responses.
 * Provider-agnostic - works with any LLM response.
 *
 * @module llm/jsonExtraction
 */

import { LLMError } from "../core/errors.js";
import { OPENAI_MESSAGES } from "../constants/index.js";

// ==================== JSON Extraction State Machine ====================

/**
 * State for JSON extraction state machine.
 */
interface JsonExtractionState {
  readonly depth: number;
  readonly startIndex: number;
  readonly endIndex: number | null;
  readonly isInString: boolean;
  readonly isEscaped: boolean;
}

/** Initial state for JSON extraction */
const INITIAL_JSON_STATE: JsonExtractionState = {
  depth: 0,
  startIndex: -1,
  endIndex: null,
  isInString: false,
  isEscaped: false,
};

/**
 * Handlers for processing characters within a JSON string context.
 */
const stringContextHandlers: ReadonlyArray<{
  readonly condition: (state: JsonExtractionState, character: string) => boolean;
  readonly handle: (state: JsonExtractionState) => JsonExtractionState;
}> = [
  {
    condition: (state) => state.isEscaped,
    handle: (state) => ({ ...state, isEscaped: false }),
  },
  {
    condition: (_, character) => character === "\\",
    handle: (state) => ({ ...state, isEscaped: true }),
  },
  {
    condition: (_, character) => character === '"',
    handle: (state) => ({ ...state, isInString: false }),
  },
];

/**
 * Handlers for processing characters outside a JSON string context.
 */
const outsideStringHandlers: ReadonlyArray<{
  readonly condition: (character: string) => boolean;
  readonly handle: (state: JsonExtractionState, charIndex: number) => JsonExtractionState;
}> = [
  {
    condition: (character) => character === '"',
    handle: (state) => ({ ...state, isInString: true }),
  },
  {
    condition: (character) => character === "{",
    handle: (state, charIndex) => ({
      ...state,
      depth: state.depth + 1,
      startIndex: state.depth === 0 ? charIndex : state.startIndex,
    }),
  },
  {
    condition: (character) => character === "}",
    handle: (state, charIndex) => {
      if (state.depth <= 0) {
        return state;
      }
      const nextDepth = state.depth - 1;
      const endIndex = nextDepth === 0 && state.startIndex !== -1 ? charIndex : null;
      return { ...state, depth: nextDepth, endIndex };
    },
  },
];

/**
 * Process a single character in the JSON extraction state machine.
 */
const processJsonCharacter = (
  state: JsonExtractionState,
  character: string,
  charIndex: number
): JsonExtractionState => {
  // Already found complete JSON - skip remaining characters
  if (state.endIndex !== null) {
    return state;
  }

  // Handle characters within a string context
  if (state.isInString) {
    const stringHandler = stringContextHandlers.find((handler) =>
      handler.condition(state, character)
    );
    return stringHandler ? stringHandler.handle(state) : state;
  }

  // Handle characters outside a string context
  const outsideHandler = outsideStringHandlers.find((handler) => handler.condition(character));
  return outsideHandler ? outsideHandler.handle(state, charIndex) : state;
};

/**
 * Extracts the first balanced JSON object from text.
 */
const extractBalancedJson = (responseContent: string): string | null => {
  const result = Array.from(responseContent).reduce(
    (currentState, character, charIndex) =>
      processJsonCharacter(currentState, character, charIndex),
    INITIAL_JSON_STATE
  );

  if (result.endIndex !== null && result.startIndex !== -1) {
    return responseContent.slice(result.startIndex, result.endIndex + 1);
  }

  return null;
};

// ==================== Public API ====================

/**
 * Extracts JSON from response content (handles markdown-wrapped JSON).
 *
 * @param responseContent - Raw response content
 * @returns Extracted JSON string
 * @throws {LLMError} If no JSON is found
 */
export const extractJsonFromResponse = (responseContent: string): string => {
  const extracted = extractBalancedJson(responseContent);
  if (!extracted) {
    throw new LLMError(OPENAI_MESSAGES.NO_JSON_FOUND);
  }
  return extracted;
};

/**
 * Attempts to parse a JSON object directly from a string.
 */
const normalizeJsonObject = (content: string): Record<string, unknown> | null => {
  if (!content.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
};

/**
 * Parses a JSON object from response content.
 * Tries direct parsing first, then falls back to extraction.
 *
 * @param responseContent - Raw response content
 * @returns Parsed JSON object
 * @throws {LLMError} If no valid JSON is found
 */
export const parseJsonObject = (responseContent: string): Record<string, unknown> => {
  const trimmed = responseContent.trim();
  const normalized = normalizeJsonObject(trimmed);

  if (normalized) {
    return normalized;
  }

  const jsonString = extractJsonFromResponse(trimmed);
  return JSON.parse(jsonString) as Record<string, unknown>;
};
