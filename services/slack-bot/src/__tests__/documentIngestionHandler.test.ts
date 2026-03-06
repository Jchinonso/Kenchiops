/**
 * Unit tests for Document Ingestion Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { SlashCommand, RespondFn } from "@slack/bolt";
import {
  handleAddDocCommand,
  handleDocumentModalSubmit,
  handleFileUploadIngestion,
  shouldHandleFileIngestion,
  type MessageWithFiles,
} from "../handlers/documentIngestionHandler.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  ExternalServiceError: jest.fn((service: string, message: string) => {
    const error = new Error(`External service error (${service}): ${message}`);
    error.name = "ExternalServiceError";
    return error;
  }),
  resilientGet: jest.fn(),
  ingestKnowledgeDoc: jest.fn(),
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
    MIN_TITLE_LENGTH: 3,
    MIN_CONTENT_LENGTH: 10,
    MAX_TITLE_LENGTH: 200,
    MAX_CONTENT_LENGTH: 3000,
    MAX_DESCRIPTION_LENGTH: 500,
    MAX_FILE_SIZE_BYTES: 100 * 1024,
    SUPPORTED_EXTENSIONS: [".md", ".txt", ".json", ".yaml", ".yml"],
  },
  DOC_INGESTION_MESSAGES: {
    NO_FILE: "Please attach a file to ingest. Supported formats: .md, .txt, .json, .yaml, .yml",
  },
  isDocIngestionRequest: jest.fn((text: string) => text.toLowerCase().includes("add")),
  UI_EMOJI: {
    success: "✅",
    failure: "❌",
  },
  SLACK_UI_ERROR_MESSAGES: {
    DOC_MODAL_FAILED:
      "Failed to open the document form. Please ensure you have the necessary permissions and try again.",
    DOC_SAVE_FAILED:
      "Failed to save document to knowledge base. The content may be too large or the service is temporarily unavailable.",
  },
  DOC_INGESTION_ERROR_CODES: {
    UNSUPPORTED_TYPE: {
      code: "unsupported_type",
      message: "Unsupported file type. Please use .md, .txt, .json, .yaml, or .yml files.",
    },
    TOO_LARGE: { code: "too_large", message: "File too large. Maximum size is 100KB." },
    PROCESSING_FAILED: {
      code: "ingestion_failed",
      message: "Failed to process file. Please check the file format and try again.",
    },
    DOWNLOAD_FAILED: {
      code: "download_failed",
      message: "Failed to download file from Slack. Please try uploading again.",
    },
    VALIDATION_FAILED: {
      code: "validation_failed",
      message: "File content validation failed. Please ensure the file is not corrupted.",
    },
  },
}));

jest.mock("../types/slackTypes.js", () => ({
  toSlackSDKView: jest.fn((view) => view),
}));

jest.mock("../handlers/documentModalBuilder.js", () => ({
  buildAddDocumentModal: jest.fn(() => ({
    type: "modal",
    callback_id: "add_document_modal",
    title: { type: "plain_text", text: "Add to Knowledge Base" },
    blocks: [],
  })),
}));

// Import resilientGet after mocks to get the mocked version
import { resilientGet } from "@kenchi/shared";

const mockResilientGet = resilientGet as jest.MockedFunction<typeof resilientGet>;

// Helper to wrap data in resilientGet response shape
const createResilientResponse = <T>(data: T) => ({
  data,
  status: 200,
  retryCount: 0,
  duration: 100,
});

describe("Document Ingestion Handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResilientGet.mockReset();
  });

  // Create mock command
  const createMockCommand = (overrides: Partial<SlashCommand> = {}): SlashCommand =>
    ({
      command: "/kenchi",
      text: "add-doc",
      user_id: "U123456",
      user_name: "testuser",
      team_id: "T123456",
      team_domain: "testteam",
      channel_id: "C123456",
      channel_name: "general",
      trigger_id: "trigger_123",
      response_url: "https://hooks.slack.com/commands/123",
      ...overrides,
    }) as SlashCommand;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockClient = (): any => ({
    views: {
      open: jest.fn(() => Promise.resolve({ ok: true })),
    },
  });

  describe("handleAddDocCommand", () => {
    it("should open the document modal successfully", async () => {
      const command = createMockCommand();
      const respond = jest.fn(() => Promise.resolve()) as unknown as RespondFn;
      const client = createMockClient();

      await handleAddDocCommand(command, respond, client);

      expect(client.views.open).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id: "trigger_123",
          view: expect.objectContaining({
            type: "modal",
            callback_id: "add_document_modal",
          }),
        })
      );
    });

    it("should respond with error if modal fails to open", async () => {
      const command = createMockCommand();
      const respond = jest.fn(() => Promise.resolve()) as unknown as RespondFn;
      const client = createMockClient();
      client.views.open.mockRejectedValue(new Error("Modal open failed"));

      await handleAddDocCommand(command, respond, client);

      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Failed to open the document form"),
          response_type: "ephemeral",
        })
      );
    });

    it("should pass channel ID to modal builder", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAddDocumentModal } = jest.requireMock(
        "../handlers/documentModalBuilder.js"
      ) as any;
      const command = createMockCommand({ channel_id: "C999999" });
      const respond = jest.fn(() => Promise.resolve()) as unknown as RespondFn;
      const client = createMockClient();

      await handleAddDocCommand(command, respond, client);

      expect(buildAddDocumentModal).toHaveBeenCalledWith("C999999");
    });
  });

  describe("handleDocumentModalSubmit", () => {
    const createModalValues = (
      title: string,
      docType: string,
      content: string,
      description = ""
    ) => ({
      doc_title_block: {
        doc_title_input: { value: title },
      },
      doc_type_block: {
        doc_type_select: { selected_option: { value: docType } },
      },
      doc_content_block: {
        doc_content_input: { value: content },
      },
      doc_description_block: {
        doc_description_input: { value: description },
      },
    });

    it("should ingest document successfully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ingestKnowledgeDoc } = jest.requireMock("@kenchi/shared") as any;
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 3,
      });

      const values = createModalValues(
        "Test Document",
        "troubleshooting",
        "This is the document content with enough characters"
      );
      const privateMetadata = JSON.stringify({ channelId: "C123456" });

      const result = await handleDocumentModalSubmit(values, "U123456", privateMetadata);

      expect(result).toEqual({ success: true });
      expect(ingestKnowledgeDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: "troubleshooting",
          title: "Test Document",
          content: "This is the document content with enough characters",
        })
      );
    });

    it("should fail when title is too short", async () => {
      const values = createModalValues("AB", "troubleshooting", "This is enough content");

      const result = await handleDocumentModalSubmit(values, "U123456", "{}");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Title must be at least");
    });

    it("should fail when content is too short", async () => {
      const values = createModalValues("Valid Title", "troubleshooting", "Short");

      const result = await handleDocumentModalSubmit(values, "U123456", "{}");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Content must be at least");
    });

    it("should prepend description to content", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ingestKnowledgeDoc } = jest.requireMock("@kenchi/shared") as any;
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 2,
      });

      const values = createModalValues(
        "Test Doc",
        "runbook",
        "Main content here with enough length",
        "This is the description"
      );

      await handleDocumentModalSubmit(values, "U123456", "{}");

      expect(ingestKnowledgeDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("## Context\nThis is the description"),
        })
      );
    });

    it("should include metadata with submission info", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ingestKnowledgeDoc } = jest.requireMock("@kenchi/shared") as any;
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 1,
      });

      const values = createModalValues(
        "Test",
        "documentation",
        "Content with enough characters here"
      );

      await handleDocumentModalSubmit(values, "U999999", "{}");

      expect(ingestKnowledgeDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            submittedBy: "U999999",
            source: "slack_modal",
          }),
        })
      );
    });

    it("should handle ingestion errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ingestKnowledgeDoc } = jest.requireMock("@kenchi/shared") as any;
      ingestKnowledgeDoc.mockRejectedValue(new Error("Database error"));

      const values = createModalValues(
        "Valid Title",
        "troubleshooting",
        "Valid content with enough characters"
      );

      const result = await handleDocumentModalSubmit(values, "U123456", "{}");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to save document");
    });

    it("should handle invalid private metadata gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ingestKnowledgeDoc } = jest.requireMock("@kenchi/shared") as any;
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 1,
      });

      const values = createModalValues(
        "Test",
        "documentation",
        "Content with enough characters here"
      );

      const result = await handleDocumentModalSubmit(values, "U123456", "invalid json");

      expect(result.success).toBe(true);
    });

    it("should default to DOCUMENTATION type when not provided", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ingestKnowledgeDoc } = jest.requireMock("@kenchi/shared") as any;
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 1,
      });

      const values = {
        doc_title_block: { doc_title_input: { value: "Test Title" } },
        doc_type_block: { doc_type_select: { selected_option: null } },
        doc_content_block: { doc_content_input: { value: "Content with enough characters" } },
        doc_description_block: { doc_description_input: { value: "" } },
      };

      await handleDocumentModalSubmit(values, "U123456", "{}");

      expect(ingestKnowledgeDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: "documentation",
        })
      );
    });
  });

  describe("handleFileUploadIngestion", () => {
    const createMockMessage = (overrides: Partial<MessageWithFiles> = {}): MessageWithFiles => ({
      text: "@kenchi add this document",
      user: "U123456",
      channel: "C123456",
      ts: "1234567890.123456",
      files: [],
      ...overrides,
    });

    const mockSay = jest.fn(() => Promise.resolve());

    beforeEach(() => {
      mockSay.mockClear();
    });

    it("should not process if text does not indicate ingestion request", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(false);

      const message = createMockMessage({
        text: "regular message",
        files: [
          { id: "F1", name: "doc.md", filetype: "md", size: 1000, url_private: "https://..." },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(mockSay).not.toHaveBeenCalled();
    });

    it("should respond with no file message when no files attached", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(true);

      const message = createMockMessage({ text: "@kenchi add", files: [] });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(mockSay).toHaveBeenCalledWith(expect.stringContaining("Please attach a file"));
    });

    it("should reject unsupported file types", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(true);

      const message = createMockMessage({
        text: "@kenchi add",
        files: [
          {
            id: "F1",
            name: "document.pdf",
            filetype: "pdf",
            size: 1000,
            url_private: "https://...",
          },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(mockSay).toHaveBeenCalledWith(expect.stringContaining("Failed to ingest"));
    });

    it("should reject files that are too large", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(true);

      const message = createMockMessage({
        text: "@kenchi add",
        files: [
          {
            id: "F1",
            name: "large-doc.md",
            filetype: "md",
            size: 200 * 1024, // 200KB > 100KB limit
            url_private: "https://...",
          },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(mockSay).toHaveBeenCalledWith(expect.stringContaining("Failed to ingest"));
    });

    it("should successfully ingest valid markdown file", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest, ingestKnowledgeDoc } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      isDocIngestionRequest.mockReturnValue(true);
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 5,
      });

      mockResilientGet.mockResolvedValue(
        createResilientResponse("# Troubleshooting Guide\n\nThis is the content.")
      );

      const message = createMockMessage({
        text: "@kenchi add",
        files: [
          {
            id: "F1",
            name: "troubleshooting-guide.md",
            filetype: "md",
            size: 500,
            url_private: "https://files.slack.com/files-pri/...",
          },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(mockResilientGet).toHaveBeenCalledWith(
        "https://files.slack.com/files-pri/...",
        expect.objectContaining({
          headers: { Authorization: "Bearer xoxb-token" },
        })
      );
      expect(ingestKnowledgeDoc).toHaveBeenCalled();
      expect(mockSay).toHaveBeenCalledWith(expect.stringContaining("Added"));
    });

    it("should infer document type from filename", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest, ingestKnowledgeDoc } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      isDocIngestionRequest.mockReturnValue(true);
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 2,
      });

      mockResilientGet.mockResolvedValue(createResilientResponse("Runbook content"));

      const testCases = [
        { filename: "runbook-deploy.md", expectedType: "runbook" },
        { filename: "postmortem-2024-01.md", expectedType: "postmortem" },
        { filename: "how-to-fix-redis.md", expectedType: "runbook" },
      ];

      for (const { filename, expectedType } of testCases) {
        jest.clearAllMocks();
        mockResilientGet.mockResolvedValue(createResilientResponse("Content"));

        const message = createMockMessage({
          text: "@kenchi add",
          files: [
            { id: "F1", name: filename, filetype: "md", size: 100, url_private: "https://..." },
          ],
        });

        await handleFileUploadIngestion(message, "xoxb-token", mockSay);

        expect(ingestKnowledgeDoc).toHaveBeenCalledWith(
          expect.objectContaining({
            docType: expectedType,
          })
        );
      }
    });

    it("should extract title from filename", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest, ingestKnowledgeDoc } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      isDocIngestionRequest.mockReturnValue(true);
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 1,
      });

      mockResilientGet.mockResolvedValue(createResilientResponse("Content"));

      const message = createMockMessage({
        text: "@kenchi add",
        files: [
          {
            id: "F1",
            name: "my-awesome_document.md",
            filetype: "md",
            size: 100,
            url_private: "https://...",
          },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(ingestKnowledgeDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "My Awesome Document",
        })
      );
    });

    it("should process multiple files", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest, ingestKnowledgeDoc } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      isDocIngestionRequest.mockReturnValue(true);
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 2,
      });

      mockResilientGet.mockResolvedValue(createResilientResponse("Content"));

      const message = createMockMessage({
        text: "@kenchi add",
        files: [
          { id: "F1", name: "doc1.md", filetype: "md", size: 100, url_private: "https://..." },
          { id: "F2", name: "doc2.md", filetype: "md", size: 100, url_private: "https://..." },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(ingestKnowledgeDoc).toHaveBeenCalledTimes(2);
      expect(mockSay).toHaveBeenCalledWith(expect.stringContaining("Added 2 document(s)"));
    });

    it("should handle mixed success and failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest, ingestKnowledgeDoc } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      isDocIngestionRequest.mockReturnValue(true);

      ingestKnowledgeDoc
        .mockResolvedValueOnce({ parentId: "doc-1", chunksCreated: 1 })
        .mockRejectedValueOnce(new Error("Ingestion failed"));

      mockResilientGet.mockResolvedValue(createResilientResponse("Content"));

      const message = createMockMessage({
        text: "@kenchi add",
        files: [
          { id: "F1", name: "doc1.md", filetype: "md", size: 100, url_private: "https://..." },
          { id: "F2", name: "doc2.md", filetype: "md", size: 100, url_private: "https://..." },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(mockSay).toHaveBeenCalledWith(expect.stringContaining("Ingestion results"));
    });

    it("should handle file download failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(true);

      mockResilientGet.mockRejectedValue(new Error("HTTP 404: Not Found"));

      const message = createMockMessage({
        text: "@kenchi add",
        files: [
          { id: "F1", name: "doc.md", filetype: "md", size: 100, url_private: "https://..." },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(mockSay).toHaveBeenCalledWith(expect.stringContaining("Failed to ingest"));
    });

    it("should include slack file ID in metadata", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest, ingestKnowledgeDoc } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      isDocIngestionRequest.mockReturnValue(true);
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 1,
      });

      mockResilientGet.mockResolvedValue(createResilientResponse("Content"));

      const message = createMockMessage({
        text: "@kenchi add",
        files: [
          {
            id: "F_UNIQUE_ID",
            name: "doc.md",
            filetype: "md",
            size: 100,
            url_private: "https://...",
          },
        ],
      });

      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(ingestKnowledgeDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            slackFileId: "F_UNIQUE_ID",
            source: "slack_file_upload",
          }),
        })
      );
    });
  });

  describe("shouldHandleFileIngestion", () => {
    it("should return true when message has files and is ingestion request", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(true);

      const message: MessageWithFiles = {
        files: [
          { id: "F1", name: "doc.md", filetype: "md", size: 100, url_private: "https://..." },
        ],
      };

      expect(shouldHandleFileIngestion(message, "@kenchi add")).toBe(true);
    });

    it("should return false when message has no files", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(true);

      const message: MessageWithFiles = {
        files: [],
      };

      expect(shouldHandleFileIngestion(message, "@kenchi add")).toBe(false);
    });

    it("should return false when not an ingestion request", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(false);

      const message: MessageWithFiles = {
        files: [
          { id: "F1", name: "doc.md", filetype: "md", size: 100, url_private: "https://..." },
        ],
      };

      expect(shouldHandleFileIngestion(message, "regular message")).toBe(false);
    });

    it("should return false when files array is undefined", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(true);

      const message: MessageWithFiles = {};

      expect(shouldHandleFileIngestion(message, "@kenchi add")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle empty strings in modal values", async () => {
      const values = {
        doc_title_block: { doc_title_input: { value: "" } },
        doc_type_block: { doc_type_select: { selected_option: null } },
        doc_content_block: { doc_content_input: { value: "" } },
        doc_description_block: { doc_description_input: { value: "" } },
      };

      const result = await handleDocumentModalSubmit(values, "U123456", "{}");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Title must be at least");
    });

    it("should handle null values in modal", async () => {
      const values = {
        doc_title_block: { doc_title_input: { value: null } },
        doc_type_block: { doc_type_select: { selected_option: null } },
        doc_content_block: { doc_content_input: { value: null } },
        doc_description_block: { doc_description_input: { value: null } },
      };

      const result = await handleDocumentModalSubmit(values, "U123456", "{}");

      expect(result.success).toBe(false);
    });

    it("should handle missing blocks in modal values", async () => {
      const values = {};

      const result = await handleDocumentModalSubmit(values, "U123456", "{}");

      expect(result.success).toBe(false);
    });

    it("should handle user ID of 'unknown' for file uploads", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest, ingestKnowledgeDoc } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      isDocIngestionRequest.mockReturnValue(true);
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 1,
      });

      mockResilientGet.mockResolvedValue(createResilientResponse("Content"));

      const message: MessageWithFiles = {
        text: "@kenchi add",
        files: [
          { id: "F1", name: "doc.md", filetype: "md", size: 100, url_private: "https://..." },
        ],
        // user is undefined
      };

      const mockSay = jest.fn(() => Promise.resolve());
      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(ingestKnowledgeDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            submittedBy: "unknown",
          }),
        })
      );
    });
  });

  describe("supported file extensions", () => {
    const supportedExtensions = [".md", ".txt", ".json", ".yaml", ".yml"];

    it.each(supportedExtensions)("should accept %s files", async (ext) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest, ingestKnowledgeDoc } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      isDocIngestionRequest.mockReturnValue(true);
      ingestKnowledgeDoc.mockResolvedValue({
        parentId: "doc-123",
        chunksCreated: 1,
      });

      mockResilientGet.mockResolvedValue(createResilientResponse("Content"));

      const message: MessageWithFiles = {
        text: "@kenchi add",
        user: "U123456",
        files: [
          {
            id: "F1",
            name: `document${ext}`,
            filetype: ext.slice(1),
            size: 100,
            url_private: "https://...",
          },
        ],
      };

      const mockSay = jest.fn(() => Promise.resolve());
      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(ingestKnowledgeDoc).toHaveBeenCalled();
    });

    it.each([".pdf", ".doc", ".xlsx", ".png", ".exe"])("should reject %s files", async (ext) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { isDocIngestionRequest } = jest.requireMock("@kenchi/shared") as any;
      isDocIngestionRequest.mockReturnValue(true);

      const message: MessageWithFiles = {
        text: "@kenchi add",
        user: "U123456",
        files: [
          {
            id: "F1",
            name: `document${ext}`,
            filetype: ext.slice(1),
            size: 100,
            url_private: "https://...",
          },
        ],
      };

      const mockSay = jest.fn(() => Promise.resolve());
      await handleFileUploadIngestion(message, "xoxb-token", mockSay);

      expect(mockSay).toHaveBeenCalledWith(expect.stringContaining("Failed to ingest"));
    });
  });
});
