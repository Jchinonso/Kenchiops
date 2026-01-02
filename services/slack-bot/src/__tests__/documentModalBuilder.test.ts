/**
 * Unit tests for Document Modal Builder
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { buildAddDocumentModal } from "../handlers/documentModalBuilder.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  SLACK_MODAL_CALLBACKS: {
    ADD_DOCUMENT: "add_document_modal",
  },
  SLACK_ACTION_IDS: {
    DOC_TITLE: "doc_title_input",
    DOC_TYPE: "doc_type_select",
    DOC_CONTENT: "doc_content_input",
    DOC_DESCRIPTION: "doc_description_input",
  },
  SLACK_BLOCK_IDS: {
    DOC_TITLE: "doc_title_block",
    DOC_TYPE: "doc_type_block",
    DOC_CONTENT: "doc_content_block",
    DOC_DESCRIPTION: "doc_description_block",
  },
  KNOWLEDGE_DOC_TYPES: {
    TROUBLESHOOTING: "troubleshooting",
    RUNBOOK: "runbook",
    KNOWN_ISSUES: "known_issues",
    POSTMORTEM: "postmortem",
    SOP: "sop",
    ARCHITECTURE: "architecture",
    DOCUMENTATION: "documentation",
  },
  DOC_INGESTION_CONFIG: {
    MAX_TITLE_LENGTH: 200,
    MAX_CONTENT_LENGTH: 3000,
    MAX_DESCRIPTION_LENGTH: 500,
  },
}));

describe("Document Modal Builder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("buildAddDocumentModal", () => {
    it("should create a modal view structure", () => {
      const modal = buildAddDocumentModal();

      expect(modal.type).toBe("modal");
      expect(modal.callback_id).toBe("add_document_modal");
    });

    it("should have correct title", () => {
      const modal = buildAddDocumentModal();

      expect(modal.title).toEqual({
        type: "plain_text",
        text: "Add to Knowledge Base",
        emoji: true,
      });
    });

    it("should have submit and close buttons", () => {
      const modal = buildAddDocumentModal();

      expect(modal.submit).toEqual({
        type: "plain_text",
        text: "Add Document",
        emoji: true,
      });
      expect(modal.close).toEqual({
        type: "plain_text",
        text: "Cancel",
        emoji: true,
      });
    });

    it("should store channel ID in private metadata", () => {
      const modal = buildAddDocumentModal("C123456");

      const metadata = JSON.parse(modal.private_metadata);
      expect(metadata.channelId).toBe("C123456");
    });

    it("should handle undefined channel ID", () => {
      const modal = buildAddDocumentModal();

      const metadata = JSON.parse(modal.private_metadata);
      expect(metadata.channelId).toBeUndefined();
    });

    it("should include all required blocks", () => {
      const modal = buildAddDocumentModal();

      expect(modal.blocks).toBeDefined();
      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should have a section block with description", () => {
      const modal = buildAddDocumentModal();

      const sectionBlock = modal.blocks.find((block) => block.type === "section");
      expect(sectionBlock).toBeDefined();
      expect(sectionBlock?.text?.type).toBe("mrkdwn");
      expect(sectionBlock?.text?.text).toContain("knowledge base");
    });

    it("should have a divider block", () => {
      const modal = buildAddDocumentModal();

      const dividerBlock = modal.blocks.find((block) => block.type === "divider");
      expect(dividerBlock).toBeDefined();
    });

    it("should have title input block", () => {
      const modal = buildAddDocumentModal();

      const titleBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_title_block"
      );
      expect(titleBlock).toBeDefined();
      expect(titleBlock?.element?.type).toBe("plain_text_input");
      expect(titleBlock?.element?.action_id).toBe("doc_title_input");
      expect(titleBlock?.label?.text).toBe("Title");
    });

    it("should have document type select block", () => {
      const modal = buildAddDocumentModal();

      const typeBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_type_block"
      );
      expect(typeBlock).toBeDefined();
      expect(typeBlock?.element?.type).toBe("static_select");
      expect(typeBlock?.element?.action_id).toBe("doc_type_select");
      expect(typeBlock?.label?.text).toBe("Document Type");
    });

    it("should have document type options", () => {
      const modal = buildAddDocumentModal();

      const typeBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_type_block"
      );
      const options = typeBlock?.element?.options;

      expect(options).toBeDefined();
      expect(options?.length).toBeGreaterThan(0);

      // Check that each option has text and value
      options?.forEach((option: { text: { type: string; text: string }; value: string }) => {
        expect(option.text).toBeDefined();
        expect(option.text.type).toBe("plain_text");
        expect(option.value).toBeDefined();
      });
    });

    it("should have troubleshooting as first option", () => {
      const modal = buildAddDocumentModal();

      const typeBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_type_block"
      );
      const initialOption = typeBlock?.element?.initial_option;

      expect(initialOption).toBeDefined();
      expect(initialOption?.value).toBe("troubleshooting");
    });

    it("should include common document types", () => {
      const modal = buildAddDocumentModal();

      const typeBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_type_block"
      );
      const options = typeBlock?.element?.options;
      const values = options?.map((o: { value: string }) => o.value);

      expect(values).toContain("troubleshooting");
      expect(values).toContain("runbook");
      expect(values).toContain("postmortem");
      expect(values).toContain("known_issues");
      expect(values).toContain("sop");
      expect(values).toContain("architecture");
      expect(values).toContain("documentation");
    });

    it("should have description input block", () => {
      const modal = buildAddDocumentModal();

      const descBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_description_block"
      );
      expect(descBlock).toBeDefined();
      expect(descBlock?.element?.type).toBe("plain_text_input");
      expect(descBlock?.element?.action_id).toBe("doc_description_input");
      expect(descBlock?.element?.multiline).toBe(true);
    });

    it("should have content input block", () => {
      const modal = buildAddDocumentModal();

      const contentBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_content_block"
      );
      expect(contentBlock).toBeDefined();
      expect(contentBlock?.element?.type).toBe("plain_text_input");
      expect(contentBlock?.element?.action_id).toBe("doc_content_input");
      expect(contentBlock?.element?.multiline).toBe(true);
      expect(contentBlock?.label?.text).toBe("Content");
    });

    it("should have max length for title", () => {
      const modal = buildAddDocumentModal();

      const titleBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_title_block"
      );
      expect(titleBlock?.element?.max_length).toBe(200);
    });

    it("should have max length for content", () => {
      const modal = buildAddDocumentModal();

      const contentBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_content_block"
      );
      expect(contentBlock?.element?.max_length).toBe(3000);
    });

    it("should have max length for description", () => {
      const modal = buildAddDocumentModal();

      const descBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_description_block"
      );
      expect(descBlock?.element?.max_length).toBe(500);
    });

    it("should have placeholder for title", () => {
      const modal = buildAddDocumentModal();

      const titleBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_title_block"
      );
      expect(titleBlock?.element?.placeholder).toBeDefined();
      expect(titleBlock?.element?.placeholder?.text).toContain("e.g.");
    });

    it("should have placeholder for content", () => {
      const modal = buildAddDocumentModal();

      const contentBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_content_block"
      );
      expect(contentBlock?.element?.placeholder).toBeDefined();
      expect(contentBlock?.element?.placeholder?.text).toContain("document content");
    });

    it("should have hint for content block", () => {
      const modal = buildAddDocumentModal();

      const contentBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_content_block"
      );
      expect(contentBlock?.hint).toBeDefined();
      expect(contentBlock?.hint?.text).toContain("markdown");
    });

    it("should have hint for description block", () => {
      const modal = buildAddDocumentModal();

      const descBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_description_block"
      );
      expect(descBlock?.hint).toBeDefined();
      expect(descBlock?.hint?.text).toContain("context");
    });

    it("should have context block with file upload hint", () => {
      const modal = buildAddDocumentModal();

      const contextBlock = modal.blocks.find((block) => block.type === "context");
      expect(contextBlock).toBeDefined();
      expect(contextBlock?.elements).toBeDefined();
      expect(contextBlock?.elements?.length).toBeGreaterThan(0);

      const textElement = contextBlock?.elements?.find(
        (el: { type: string; text?: string }) => el.type === "mrkdwn"
      );
      expect(textElement?.text).toContain("file");
      expect(textElement?.text).toContain("@kenchi");
    });

    it("should have correct block order", () => {
      const modal = buildAddDocumentModal();
      const blockTypes = modal.blocks.map((block) => block.type);

      // First should be section with description
      expect(blockTypes[0]).toBe("section");
      // Then divider
      expect(blockTypes[1]).toBe("divider");
      // Then input blocks
      expect(blockTypes.filter((t) => t === "input").length).toBe(4);
      // Last should be context
      expect(blockTypes[blockTypes.length - 1]).toBe("context");
    });

    it("should have emojis enabled in text elements", () => {
      const modal = buildAddDocumentModal();

      // Title
      expect(modal.title.emoji).toBe(true);
      // Submit button
      expect(modal.submit.emoji).toBe(true);
      // Close button
      expect(modal.close.emoji).toBe(true);
    });

    it("should have all doc type options with emoji enabled", () => {
      const modal = buildAddDocumentModal();

      const typeBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_type_block"
      );
      const options = typeBlock?.element?.options;

      options?.forEach((option: { text: { emoji: boolean } }) => {
        expect(option.text.emoji).toBe(true);
      });
    });

    it("should have labels with emoji enabled", () => {
      const modal = buildAddDocumentModal();

      const inputBlocks = modal.blocks.filter((block) => block.type === "input");

      inputBlocks.forEach((block) => {
        expect(block.label?.emoji).toBe(true);
      });
    });
  });

  describe("modal validation constraints", () => {
    it("should define minimum content through config", () => {
      const modal = buildAddDocumentModal();

      const contentBlock = modal.blocks.find(
        (block) => block.type === "input" && block.block_id === "doc_content_block"
      );

      // max_length should be defined for content
      expect(contentBlock?.element?.max_length).toBeDefined();
      expect(typeof contentBlock?.element?.max_length).toBe("number");
    });

    it("should have all required input blocks", () => {
      const modal = buildAddDocumentModal();

      const requiredBlockIds = [
        "doc_title_block",
        "doc_type_block",
        "doc_content_block",
        "doc_description_block",
      ];

      const inputBlockIds = modal.blocks
        .filter((block) => block.type === "input")
        .map((block) => block.block_id);

      requiredBlockIds.forEach((id) => {
        expect(inputBlockIds).toContain(id);
      });
    });
  });

  describe("accessibility", () => {
    it("should have labels for all input blocks", () => {
      const modal = buildAddDocumentModal();

      const inputBlocks = modal.blocks.filter((block) => block.type === "input");

      inputBlocks.forEach((block) => {
        expect(block.label).toBeDefined();
        expect(block.label?.type).toBe("plain_text");
        expect(block.label?.text).toBeTruthy();
      });
    });

    it("should have placeholder text for all text inputs", () => {
      const modal = buildAddDocumentModal();

      const inputBlocks = modal.blocks.filter(
        (block) => block.type === "input" && block.element?.type === "plain_text_input"
      );

      inputBlocks.forEach((block) => {
        expect(block.element?.placeholder).toBeDefined();
        expect(block.element?.placeholder?.type).toBe("plain_text");
        expect(block.element?.placeholder?.text).toBeTruthy();
      });
    });
  });
});
