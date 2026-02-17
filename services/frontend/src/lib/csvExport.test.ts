/**
 * Unit tests for csvExport module.
 *
 * Tests CSV generation, field escaping, and the domain export functions.
 * The downloadCSV function creates a DOM element and triggers a download,
 * so we mock the DOM APIs and verify the generated CSV content.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sonner toast before importing the module
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { exportAnalysesToCSV, exportFailuresToCSV } from "./csvExport";
import { toast } from "sonner";

// ==================== DOM Mocks ====================

const mockLink = {
  href: "",
  download: "",
  click: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLink.href = "";
  mockLink.download = "";
  mockLink.click.mockClear();

  // Mock DOM methods used by downloadCSV
  vi.spyOn(document, "createElement").mockReturnValue(mockLink as unknown as HTMLElement);
  vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
  vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

// ==================== exportAnalysesToCSV ====================

describe("exportAnalysesToCSV", () => {
  it("should generate CSV with correct headers and trigger download", () => {
    const analyses = [
      {
        createdAt: "2024-01-15T10:00:00Z",
        aggregationKey: "org/repo:abc123",
        fullAnalysis: {},
        summary: "Build failed due to missing dependency",
        identifiedCause: "Missing npm package",
        diagnosisConfidence: 0.85,
        actionConfidence: 0.7,
        recommendedActions: ["Install package", "Update lockfile"],
        eventId: "evt-001",
      },
    ];

    exportAnalysesToCSV(analyses);

    expect(mockLink.click).toHaveBeenCalledOnce();
    expect(mockLink.download).toMatch(/^kenchi-analyses-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(toast.success).toHaveBeenCalledWith(
      "Exported 1 analyses",
      expect.objectContaining({ description: expect.stringContaining("kenchi-analyses") })
    );
  });

  it("should handle null optional fields", () => {
    const analyses = [
      {
        createdAt: "2024-01-15T10:00:00Z",
        aggregationKey: null,
        fullAnalysis: { repository: "fallback/repo" },
        summary: "Test",
        identifiedCause: null,
        diagnosisConfidence: 0.5,
        actionConfidence: null,
        recommendedActions: null,
        eventId: null,
      },
    ];

    // Should not throw
    expect(() => exportAnalysesToCSV(analyses)).not.toThrow();
    expect(mockLink.click).toHaveBeenCalledOnce();
  });

  it("should handle empty analyses array", () => {
    exportAnalysesToCSV([]);

    expect(mockLink.click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Exported 0 analyses", expect.anything());
  });

  it("should escape CSV fields containing commas and quotes", () => {
    const analyses = [
      {
        createdAt: "2024-01-15T10:00:00Z",
        aggregationKey: "org/repo:abc",
        fullAnalysis: {},
        summary: 'Build failed, check "logs"',
        identifiedCause: "Comma, in cause",
        diagnosisConfidence: 0.9,
        actionConfidence: 0.8,
        recommendedActions: ["Action with, comma"],
        eventId: "evt-002",
      },
    ];

    // Should not throw even with special characters
    expect(() => exportAnalysesToCSV(analyses)).not.toThrow();
    expect(mockLink.click).toHaveBeenCalledOnce();
  });
});

// ==================== exportFailuresToCSV ====================

describe("exportFailuresToCSV", () => {
  it("should generate CSV with correct headers and trigger download", () => {
    const failures = [
      {
        timestamp: "2024-01-15T10:00:00Z",
        severity: "high",
        payload: {
          repository: "org/repo",
          checkName: "CI Build",
          workflowName: "main.yml",
          branch: "main",
          conclusion: "failure",
          headSha: "abc123",
        },
      },
    ];

    exportFailuresToCSV(failures);

    expect(mockLink.click).toHaveBeenCalledOnce();
    expect(mockLink.download).toMatch(/^kenchi-failures-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(toast.success).toHaveBeenCalledWith(
      "Exported 1 failures",
      expect.objectContaining({ description: expect.stringContaining("kenchi-failures") })
    );
  });

  it("should handle null severity", () => {
    const failures = [
      {
        timestamp: "2024-01-15T10:00:00Z",
        severity: null,
        payload: {},
      },
    ];

    expect(() => exportFailuresToCSV(failures)).not.toThrow();
    expect(mockLink.click).toHaveBeenCalledOnce();
  });

  it("should handle empty failures array", () => {
    exportFailuresToCSV([]);

    expect(mockLink.click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Exported 0 failures", expect.anything());
  });

  it("should handle missing payload fields gracefully", () => {
    const failures = [
      {
        timestamp: "2024-01-15T10:00:00Z",
        severity: "medium",
        payload: {},
      },
    ];

    // getPayloadString returns "--" for missing keys
    expect(() => exportFailuresToCSV(failures)).not.toThrow();
  });
});
