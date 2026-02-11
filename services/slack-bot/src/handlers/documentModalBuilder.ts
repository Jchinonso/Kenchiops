/**
 * Document Modal Builder
 *
 * Builds Slack modal views for document ingestion.
 */

import {
  SLACK_MODAL_CALLBACKS,
  SLACK_ACTION_IDS,
  SLACK_BLOCK_IDS,
  KNOWLEDGE_DOC_TYPES,
  DOC_INGESTION_CONFIG,
} from "@kenchi/shared";
import type { SlackModalView } from "../types/slackTypes.js";
import type { DocTypeOption } from "./documentModalBuilderTypes.js";

// ==================== Constants ====================

/**
 * Document type options for the modal dropdown.
 * Subset of KNOWLEDGE_DOC_TYPES most relevant for user submissions.
 */
const USER_DOC_TYPE_OPTIONS: readonly DocTypeOption[] = [
  { value: KNOWLEDGE_DOC_TYPES.TROUBLESHOOTING, label: "Troubleshooting Guide" },
  { value: KNOWLEDGE_DOC_TYPES.RUNBOOK, label: "Runbook / How-To" },
  { value: KNOWLEDGE_DOC_TYPES.KNOWN_ISSUES, label: "Known Issue" },
  { value: KNOWLEDGE_DOC_TYPES.POSTMORTEM, label: "Postmortem / Incident Report" },
  { value: KNOWLEDGE_DOC_TYPES.SOP, label: "Standard Operating Procedure" },
  { value: KNOWLEDGE_DOC_TYPES.ARCHITECTURE, label: "Architecture / Design Doc" },
  { value: KNOWLEDGE_DOC_TYPES.DOCUMENTATION, label: "Internal Documentation" },
] as const;

// ==================== Modal Builder ====================

/**
 * Build the add document modal view.
 * Includes title, type, content, and description fields.
 */
export const buildAddDocumentModal = (channelId?: string): SlackModalView => ({
  type: "modal",
  callback_id: SLACK_MODAL_CALLBACKS.ADD_DOCUMENT,
  private_metadata: JSON.stringify({ channelId }),
  title: {
    type: "plain_text",
    text: "Add to Knowledge Base",
    emoji: true,
  },
  submit: {
    type: "plain_text",
    text: "Add Document",
    emoji: true,
  },
  close: {
    type: "plain_text",
    text: "Cancel",
    emoji: true,
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Add a document to Kenchi's knowledge base. This will help answer future questions from your team.",
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: SLACK_BLOCK_IDS.DOC_TITLE,
      element: {
        type: "plain_text_input",
        action_id: SLACK_ACTION_IDS.DOC_TITLE,
        placeholder: {
          type: "plain_text",
          text: "e.g., How to fix Redis connection timeouts",
        },
        max_length: DOC_INGESTION_CONFIG.MAX_TITLE_LENGTH,
      },
      label: {
        type: "plain_text",
        text: "Title",
        emoji: true,
      },
    },
    {
      type: "input",
      block_id: SLACK_BLOCK_IDS.DOC_TYPE,
      element: {
        type: "static_select",
        action_id: SLACK_ACTION_IDS.DOC_TYPE,
        placeholder: {
          type: "plain_text",
          text: "Select document type",
        },
        options: USER_DOC_TYPE_OPTIONS.map((option) => ({
          text: {
            type: "plain_text",
            text: option.label,
            emoji: true,
          },
          value: option.value,
        })),
        initial_option: {
          text: {
            type: "plain_text",
            text: USER_DOC_TYPE_OPTIONS[0].label,
            emoji: true,
          },
          value: USER_DOC_TYPE_OPTIONS[0].value,
        },
      },
      label: {
        type: "plain_text",
        text: "Document Type",
        emoji: true,
      },
    },
    {
      type: "input",
      block_id: SLACK_BLOCK_IDS.DOC_DESCRIPTION,
      element: {
        type: "plain_text_input",
        action_id: SLACK_ACTION_IDS.DOC_DESCRIPTION,
        placeholder: {
          type: "plain_text",
          text: "Why are you adding this? What problem does it solve?",
        },
        multiline: true,
        max_length: DOC_INGESTION_CONFIG.MAX_DESCRIPTION_LENGTH,
      },
      label: {
        type: "plain_text",
        text: "Why are you adding this?",
        emoji: true,
      },
      hint: {
        type: "plain_text",
        text: "Help us understand the context - what problem does this document help solve?",
      },
    },
    {
      type: "input",
      block_id: SLACK_BLOCK_IDS.DOC_CONTENT,
      element: {
        type: "plain_text_input",
        action_id: SLACK_ACTION_IDS.DOC_CONTENT,
        placeholder: {
          type: "plain_text",
          text: "Paste your document content here (markdown supported)...",
        },
        multiline: true,
        max_length: DOC_INGESTION_CONFIG.MAX_CONTENT_LENGTH,
      },
      label: {
        type: "plain_text",
        text: "Content",
        emoji: true,
      },
      hint: {
        type: "plain_text",
        text: `Supports markdown formatting. Max ${DOC_INGESTION_CONFIG.MAX_CONTENT_LENGTH} characters.`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "For larger documents, upload a file and mention @kenchi to ingest it.",
        },
      ],
    },
  ],
});
