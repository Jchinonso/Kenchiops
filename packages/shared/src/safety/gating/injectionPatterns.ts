/**
 * Prompt Injection Pattern Definitions
 *
 * Pattern library for detecting prompt injection attacks.
 * Separated from detection logic for maintainability.
 *
 * @module safety/gating/injectionPatterns
 */

import type { InjectionPattern } from "../types.js";

// ==================== Context Patterns ====================

/**
 * Keywords that indicate LLM/prompt-related context.
 * Used to reduce false positives for patterns that need context.
 * Narrowed to avoid matching normal technical discussions.
 */
export const INSTRUCTION_CONTEXT_KEYWORDS =
  /\b(?:instructions?|prompt|system\s+(?:prompt|message|instructions?)|\[SYSTEM\]|<system>|assistant|jailbreak|ignore|override|bypass|developer(?:\s+(?:message|instructions?))?)\b/i;

/**
 * Pattern to detect closed code fences (```...```).
 */
export const CODE_FENCE_CLOSED_PATTERN = /```[\s\S]*?```/g;

/**
 * Pattern to detect unclosed code fences (``` without closing).
 * Matches from opening fence to end of string.
 */
export const CODE_FENCE_UNCLOSED_PATTERN = /```(?![^`]*```)[\s\S]*$/g;

/**
 * Pattern to detect quoted email content (lines starting with >).
 * NOTE: Not currently used for discounting (too easy to game).
 * Kept for reference if a more robust approach is needed later.
 */
export const QUOTED_CONTENT_PATTERN = /^>.*$/gm;

// ==================== Injection Patterns ====================

/**
 * Prompt injection detection patterns with severity levels and unique IDs.
 * Patterns are ordered by category for readability.
 */
export const INJECTION_PATTERNS: readonly InjectionPattern[] = Object.freeze(
  [
    // Instruction override attempts
    {
      id: "override_ignore_previous",
      pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)/gi,
      type: "instruction_override",
      severity: "critical",
      weight: 0.9,
    },
    {
      id: "override_disregard_system",
      pattern: /disregard\s+(?:the\s+)?(?:system|original|initial)\s+(?:prompt|instructions?)/gi,
      type: "instruction_override",
      severity: "critical",
      weight: 0.9,
    },
    {
      id: "override_forget_all",
      pattern: /forget\s+(?:everything|all)\s+(?:you\s+)?(?:know|learned|were\s+told)/gi,
      type: "instruction_override",
      severity: "high",
      weight: 0.7,
    },

    // Role hijacking - requires instruction context to reduce false positives
    {
      id: "role_you_are_now",
      pattern: /you\s+are\s+(?:now|actually)\s+(?:a|an)\s+(?!assistant|helpful)/gi,
      type: "role_hijacking",
      severity: "high",
      weight: 0.7,
      requiresInstructionContext: true,
    },
    {
      id: "role_pretend_act",
      pattern:
        /(?:pretend|act|behave)\s+(?:like\s+)?(?:as\s+if\s+)?you(?:'re|\s+are)\s+(?!an?\s+(?:assistant|AI))/gi,
      type: "role_hijacking",
      severity: "high",
      weight: 0.7,
      requiresInstructionContext: true,
    },
    {
      id: "role_new_identity",
      pattern: /your\s+(?:new|real)\s+(?:name|identity|role)\s+is/gi,
      type: "role_hijacking",
      severity: "high",
      weight: 0.65,
      requiresInstructionContext: true,
    },

    // Delimiter escape attempts
    {
      id: "delimiter_code_system",
      pattern: /```\s*(?:system|admin|root)\b/gi,
      type: "delimiter_escape",
      severity: "high",
      weight: 0.7,
    },
    {
      id: "delimiter_xml_tags",
      pattern: /<\/?(?:system|admin|instruction|prompt)>/gi,
      type: "delimiter_escape",
      severity: "medium",
      weight: 0.5,
    },
    {
      id: "delimiter_bracket_tags",
      pattern: /\[(?:SYSTEM|ADMIN|INSTRUCTION)\]/gi,
      type: "delimiter_escape",
      severity: "medium",
      weight: 0.5,
    },
    {
      id: "delimiter_begin_system_prompt",
      pattern: /\b(?:BEGIN|END)\s+SYSTEM\s+PROMPT\b/gi,
      type: "delimiter_escape",
      severity: "medium",
      weight: 0.5,
    },

    // Jailbreak attempts
    {
      id: "jailbreak_dan_mode",
      pattern: /(?:DAN|DUDE|STAN|KEVIN)\s*(?:mode|prompt)?:?/gi,
      type: "jailbreak_attempt",
      severity: "critical",
      weight: 0.85,
    },
    {
      id: "jailbreak_anything_now",
      pattern: /(?:do\s+)?anything\s+now\s+(?:mode)?/gi,
      type: "jailbreak_attempt",
      severity: "critical",
      weight: 0.85,
    },
    {
      id: "jailbreak_evil_mode",
      pattern: /(?:evil|chaos|unrestricted|unfiltered)\s+(?:mode|version)/gi,
      type: "jailbreak_attempt",
      severity: "high",
      weight: 0.75,
    },
    {
      id: "jailbreak_bypass_safety",
      pattern:
        /bypass\s+(?:your\s+)?(?:safety|ethical|content)\s+(?:filters?|guidelines?|restrictions?)/gi,
      type: "jailbreak_attempt",
      severity: "critical",
      weight: 0.9,
    },

    // System prompt leak attempts
    {
      id: "leak_show_prompt",
      pattern:
        /(?:show|reveal|print|display|output)\s+(?:your\s+)?(?:system|initial|original)\s+prompt/gi,
      type: "system_prompt_leak",
      severity: "high",
      weight: 0.7,
    },
    {
      id: "leak_what_instructions",
      pattern: /what\s+(?:is|are)\s+your\s+(?:system\s+)?(?:instructions?|prompt|rules?)/gi,
      type: "system_prompt_leak",
      severity: "medium",
      weight: 0.5,
    },
    {
      id: "leak_repeat_prompt",
      pattern:
        /repeat\s+(?:back\s+)?(?:your\s+)?(?:initial|system|original)\s+(?:instructions?|prompt)/gi,
      type: "system_prompt_leak",
      severity: "high",
      weight: 0.7,
    },

    // Encoded payloads
    {
      id: "encoded_base64",
      pattern: /(?:base64|b64|decode)\s*[:=]\s*[A-Za-z0-9+/=]{20,}/gi,
      type: "encoded_payload",
      severity: "medium",
      weight: 0.5,
    },
    {
      id: "encoded_hex_escape",
      pattern: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){3,}/gi,
      type: "encoded_payload",
      severity: "medium",
      weight: 0.5,
    },

    // Recursive injection
    {
      id: "recursive_when_see",
      pattern:
        /when\s+(?:you\s+)?(?:see|encounter|receive)\s+(?:this|the\s+following)\s*,?\s*(?:do|execute|run)/gi,
      type: "recursive_injection",
      severity: "high",
      weight: 0.65,
    },
    {
      id: "recursive_inject_into",
      pattern: /inject\s+(?:this\s+)?(?:into|as)\s+(?:the\s+)?(?:context|prompt|instructions?)/gi,
      type: "recursive_injection",
      severity: "high",
      weight: 0.7,
    },

    // Context manipulation - requires instruction context to reduce false positives
    {
      id: "context_from_now_on",
      pattern:
        /(?:from\s+now\s+on|henceforth|going\s+forward)\s*,?\s*(?:you\s+)?(?:will|must|should)/gi,
      type: "context_manipulation",
      severity: "medium",
      weight: 0.5,
      requiresInstructionContext: true,
    },
    {
      id: "context_new_rule",
      pattern: /(?:new\s+)?(?:rule|instruction|directive)\s*[:=]/gi,
      type: "context_manipulation",
      severity: "medium",
      weight: 0.45,
      requiresInstructionContext: true,
    },
  ].map(Object.freeze)
) as readonly InjectionPattern[];
