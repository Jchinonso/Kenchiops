import { describe, it, expect } from "@jest/globals";
import { extractJsonFromResponse, parseOpenAIResponse } from "../../openaiClient/responseParser.js";

describe("OpenAI responseParser", () => {
  it("should extract JSON from wrapped content", () => {
    const payload = {
      root_cause: "Missing AUTH_SECRET env var",
      confidence: "low",
      category: "config",
      phase: "runtime",
      annotations: [],
      next_steps: [],
      secondary_findings: [],
    };
    const content = `Here is your result:\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\nThanks.`;

    const extracted = extractJsonFromResponse(content);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;

    expect(parsed.root_cause).toBe("Missing AUTH_SECRET env var");
  });

  it("should handle braces inside JSON strings", () => {
    const payload = {
      root_cause: "Failed to parse config {missing}",
      confidence: "medium",
      category: "config",
      phase: "runtime",
      annotations: [],
      next_steps: [],
      secondary_findings: [],
    };
    const content = `prefix ${JSON.stringify(payload)} suffix`;

    const extracted = extractJsonFromResponse(content);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;

    expect(parsed.root_cause).toBe("Failed to parse config {missing}");
  });

  it("should normalize confidence, category, and phase values", () => {
    const payload = {
      root_cause: "Type mismatch in build step",
      confidence: "HIGH",
      category: "COMPILE",
      phase: "BUILD",
      annotations: [],
      next_steps: [],
      secondary_findings: [],
    };
    const content = JSON.stringify(payload);

    const result = parseOpenAIResponse(content, "evt_test");

    expect(result.confidence).toBe("high");
    expect(result.category).toBe("compile");
    expect(result.phase).toBe("build");
  });

  it("should parse JSON embedded in surrounding text", () => {
    const payload = {
      root_cause: "Dependency install failed",
      confidence: "low",
      category: "dependency",
      phase: "dependency",
      annotations: [],
      next_steps: [],
      secondary_findings: [],
    };
    const content = `Result:\n${JSON.stringify(payload)}\n-- end --`;

    const result = parseOpenAIResponse(content, "evt_embedded");

    expect(result.identifiedCause).toBe("Dependency install failed");
    expect(result.eventId).toBe("evt_embedded");
  });

  it("should extract file paths from annotations without line numbers", () => {
    const payload = {
      root_cause: "Test failures detected",
      confidence: "medium",
      category: "test",
      phase: "test",
      annotations: [
        {
          evidence_id: "test_failure",
          snippet: "Test failed: services/github-app/src/tests/commentFormatter.test.ts",
          explanation: "Assertion mismatch in formatter output",
        },
      ],
      next_steps: [],
      secondary_findings: [],
    };
    const content = JSON.stringify(payload);

    const result = parseOpenAIResponse(content, "evt_annotation");

    expect(result.codeAnnotations[0]?.path).toBe(
      "services/github-app/src/tests/commentFormatter.test.ts"
    );
    expect(result.codeAnnotations[0]?.line).toBe(0);
  });
});
