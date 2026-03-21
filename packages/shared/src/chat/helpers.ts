/**
 * Chat Service Helpers
 *
 * Pure utility functions for the chat service: token estimation,
 * prompt building, message trimming, and context formatting.
 *
 * @module chat/helpers
 */

import { CHAT_DEFAULTS } from "../constants/api.js";
import type { ChatLLMMessage, ChatContextData, ChatRAGResult, ChatRAGSource } from "./types.js";

// ==================== System Prompt ====================

/** Base system prompt for the Kenchi Copilot assistant. */
const BASE_SYSTEM_PROMPT = [
  "You are Kenchi Copilot, an AI assistant for DevOps engineers.",
  "You help users understand CI/CD failures, deployment incidents, and code analysis results.",
  "Be concise, accurate, and actionable. When you do not know something, say so.",
  "Format responses using Markdown when helpful.",
].join(" ");

// ==================== Token Estimation ====================

/**
 * Estimates token count for a string using character count / CHARS_PER_TOKEN.
 * Rough approximation — sufficient for context budget management.
 */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / CHAT_DEFAULTS.CHARS_PER_TOKEN);

/**
 * Extracts the content string from an LLM message via destructuring.
 */
const getMessageContent = ({ content }: ChatLLMMessage): string => content;

/**
 * Estimates total tokens for a set of LLM messages.
 */
const estimateMessagesTokens = (messages: readonly ChatLLMMessage[]): number =>
  messages.map(getMessageContent).reduce((total, text) => total + estimateTokens(text), 0);

// ==================== Prompt Building ====================

/**
 * Formats page context data into a prompt section.
 */
const formatPageContextSection = (data: ChatContextData): string => {
  const { entityType, title, summary, details } = data;
  const header =
    entityType === "analysis" ? "## Current Analysis Context" : "## Current Incident Context";

  const parts: readonly string[] = [
    header,
    `**Title:** ${title}`,
    ...(summary ? [`**Summary:** ${summary}`] : []),
    ...(details ? [`**Details:**\n${details}`] : []),
  ];

  return parts.join("\n");
};

/**
 * Builds a context-enriched system prompt from the base prompt,
 * optional page context data, and optional RAG results.
 */
export const buildSystemPrompt = (
  pageContextData: ChatContextData | null,
  ragResult: ChatRAGResult | null
): string => {
  const formattedContext = ragResult ? ragResult.formattedContext : "";
  const sections: readonly string[] = [
    BASE_SYSTEM_PROMPT,
    ...(pageContextData ? [formatPageContextSection(pageContextData)] : []),
    ...(formattedContext.length > 0 ? [formattedContext] : []),
  ];

  return sections.join("\n\n");
};

/**
 * Extracts RAG source citations from a RAG result.
 */
export const extractRAGSources = (ragResult: ChatRAGResult | null): readonly ChatRAGSource[] =>
  ragResult ? ragResult.sources : [];

/**
 * Builds the messages array for the LLM, including system prompt and history.
 */
export const buildLLMMessages = (
  systemPrompt: string,
  history: ReadonlyArray<{ readonly role: string; readonly content: string }>,
  userMessage: string
): readonly ChatLLMMessage[] => {
  const systemMessage: ChatLLMMessage = { role: "system", content: systemPrompt };

  const historyMessages: readonly ChatLLMMessage[] = history.map(({ role, content }) => ({
    role: role as ChatLLMMessage["role"],
    content,
  }));

  const currentMessage: ChatLLMMessage = { role: "user", content: userMessage };

  return [systemMessage, ...historyMessages, currentMessage];
};

// ==================== Message Trimming ====================

/**
 * Finds the number of oldest history messages to drop so the total
 * token count fits within the budget. Uses recursive scan.
 */
const findTrimCount = (
  systemMessage: ChatLLMMessage,
  historyAndUser: readonly ChatLLMMessage[],
  maxTokens: number,
  current: number,
  maxTrim: number
): number => {
  if (current >= maxTrim) {
    return maxTrim;
  }
  const candidate = current + 1;
  const trimmed = [systemMessage, ...historyAndUser.slice(candidate)];
  return estimateMessagesTokens(trimmed) <= maxTokens
    ? candidate
    : findTrimCount(systemMessage, historyAndUser, maxTokens, candidate, maxTrim);
};

/**
 * Trims history messages to fit within the token budget.
 * Keeps the system message (first) and the most recent messages,
 * dropping from the oldest history messages.
 */
export const trimMessagesToFit = (
  messages: readonly ChatLLMMessage[],
  maxTokens: number
): readonly ChatLLMMessage[] => {
  const currentTokens = estimateMessagesTokens(messages);

  if (currentTokens <= maxTokens) {
    return messages;
  }

  const minKeep = CHAT_DEFAULTS.MIN_MESSAGES_TO_KEEP;
  const { length } = messages;

  if (length <= minKeep) {
    return messages;
  }

  const systemMessage = messages[0];
  const historyAndUser = messages.slice(1);
  const maxTrim = Math.min(historyAndUser.length - 1, CHAT_DEFAULTS.MAX_TRIM_BATCH);

  const trimCount = findTrimCount(systemMessage, historyAndUser, maxTokens, 0, maxTrim);

  return [systemMessage, ...historyAndUser.slice(trimCount)];
};

/**
 * Derives a short title from the user's first message.
 */
export const deriveTitle = (message: string): string => {
  const trimmed = message.trim();
  const maxLen = CHAT_DEFAULTS.MAX_TITLE_LENGTH;
  return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen - 3)}...`;
};
