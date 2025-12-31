/**
 * Tests for tenant-conditioned prompt configuration.
 */

import {
  buildTenantPromptAdditions,
  createTenantPromptConfig,
  validateTenantPromptConfig,
  type TenantPromptConfig,
  type TechStackConfig,
} from "../../integrations/tenantPromptConfig.js";

describe("Tenant Prompt Config", () => {
  describe("createTenantPromptConfig", () => {
    it("should create config with defaults when no options provided", () => {
      const config = createTenantPromptConfig("tenant_123");

      expect(config.tenantId).toBe("tenant_123");
      expect(config.analysisDepth).toBe("standard");
      expect(config.preferences).toBeDefined();
      expect(config.preferences?.prioritizeSpeed).toBe(false);
      expect(config.preferences?.includeCodeSnippets).toBe(true);
      expect(config.preferences?.maxRecommendations).toBe(3);
      expect(config.preferences?.verbosityLevel).toBe("normal");
    });

    it("should merge partial preferences with defaults", () => {
      const config = createTenantPromptConfig("tenant_123", {
        preferences: {
          prioritizeSpeed: true,
          maxRecommendations: 5,
        },
      });

      expect(config.preferences?.prioritizeSpeed).toBe(true);
      expect(config.preferences?.maxRecommendations).toBe(5);
      expect(config.preferences?.includeCodeSnippets).toBe(true); // Default preserved
    });

    it("should include tech stack when provided", () => {
      const techStack: TechStackConfig = {
        primaryLanguages: ["TypeScript", "Python"],
        frameworks: ["React", "FastAPI"],
        ciSystem: "github_actions",
      };

      const config = createTenantPromptConfig("tenant_123", { techStack });

      expect(config.techStack).toEqual(techStack);
    });

    it("should include custom instructions when provided", () => {
      const config = createTenantPromptConfig("tenant_123", {
        customInstructions: "Focus on database-related issues",
      });

      expect(config.customInstructions).toBe("Focus on database-related issues");
    });

    it("should include language preference when provided", () => {
      const config = createTenantPromptConfig("tenant_123", {
        languagePreference: "es",
      });

      expect(config.languagePreference).toBe("es");
    });
  });

  describe("validateTenantPromptConfig", () => {
    it("should validate a correct config", () => {
      const config = createTenantPromptConfig("tenant_123");

      const result = validateTenantPromptConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when tenant ID is empty", () => {
      const config: TenantPromptConfig = {
        tenantId: "",
        analysisDepth: "standard",
      };

      const result = validateTenantPromptConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Tenant ID is required");
    });

    it("should fail when tenant ID is whitespace only", () => {
      const config: TenantPromptConfig = {
        tenantId: "   ",
        analysisDepth: "standard",
      };

      const result = validateTenantPromptConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Tenant ID is required");
    });

    it("should fail when maxRecommendations is below minimum", () => {
      const config: TenantPromptConfig = {
        tenantId: "tenant_123",
        preferences: {
          maxRecommendations: 0,
        },
      };

      const result = validateTenantPromptConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.includes("Max recommendations"))).toBe(true);
    });

    it("should fail when maxRecommendations exceeds maximum", () => {
      const config: TenantPromptConfig = {
        tenantId: "tenant_123",
        preferences: {
          maxRecommendations: 100,
        },
      };

      const result = validateTenantPromptConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.includes("Max recommendations"))).toBe(true);
    });

    it("should fail when custom instructions exceed max length", () => {
      const config: TenantPromptConfig = {
        tenantId: "tenant_123",
        customInstructions: "a".repeat(2001),
      };

      const result = validateTenantPromptConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.includes("Custom instructions"))).toBe(true);
    });

    it("should pass when maxRecommendations is at boundary values", () => {
      const minConfig: TenantPromptConfig = {
        tenantId: "tenant_123",
        preferences: { maxRecommendations: 1 },
      };
      const maxConfig: TenantPromptConfig = {
        tenantId: "tenant_123",
        preferences: { maxRecommendations: 10 },
      };

      expect(validateTenantPromptConfig(minConfig).valid).toBe(true);
      expect(validateTenantPromptConfig(maxConfig).valid).toBe(true);
    });
  });

  describe("buildTenantPromptAdditions", () => {
    it("should return empty string for default config", () => {
      const config = createTenantPromptConfig("tenant_123");

      const result = buildTenantPromptAdditions(config);

      // Default config with standard depth and normal preferences should produce
      // only the maxRecommendations line
      expect(result).toContain("Limit recommendations");
    });

    it("should include tech stack context", () => {
      const config = createTenantPromptConfig("tenant_123", {
        techStack: {
          primaryLanguages: ["TypeScript", "Go"],
          frameworks: ["Express", "Gin"],
          ciSystem: "github_actions",
          testingFrameworks: ["Jest", "Go test"],
          deploymentPlatform: "Kubernetes",
        },
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).toContain("Tenant Technology Context");
      expect(result).toContain("TypeScript, Go");
      expect(result).toContain("Express, Gin");
      expect(result).toContain("CI System");
      expect(result).toContain("Testing Frameworks");
      expect(result).toContain("Kubernetes");
    });

    it("should include brief analysis depth instructions", () => {
      const config = createTenantPromptConfig("tenant_123", {
        analysisDepth: "brief",
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).toContain("Analysis Depth: Brief");
      expect(result).toContain("concise summary");
    });

    it("should include detailed analysis depth instructions", () => {
      const config = createTenantPromptConfig("tenant_123", {
        analysisDepth: "detailed",
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).toContain("Analysis Depth: Detailed");
      expect(result).toContain("comprehensive analysis");
    });

    it("should include preference instructions", () => {
      const config = createTenantPromptConfig("tenant_123", {
        preferences: {
          prioritizeSpeed: true,
          includeCodeSnippets: false,
          maxRecommendations: 5,
          focusAreas: ["root_cause", "security"],
          verbosityLevel: "minimal",
        },
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).toContain("Tenant Preferences");
      expect(result).toContain("quick, actionable");
      expect(result).toContain("Do not include code snippets");
      expect(result).toContain("Limit recommendations to 5");
      expect(result).toContain("identifying root cause");
      expect(result).toContain("security implications");
      expect(result).toContain("minimal, direct language");
    });

    it("should include verbose verbosity instructions", () => {
      const config = createTenantPromptConfig("tenant_123", {
        preferences: {
          verbosityLevel: "verbose",
        },
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).toContain("verbose explanations");
    });

    it("should include custom instructions", () => {
      const config = createTenantPromptConfig("tenant_123", {
        customInstructions: "Always check for memory leaks in Node.js code",
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).toContain("Custom Instructions");
      expect(result).toContain("memory leaks");
    });

    it("should include language preference for non-English", () => {
      const config = createTenantPromptConfig("tenant_123", {
        languagePreference: "es",
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).toContain("Language");
      expect(result).toContain("Respond in es language");
    });

    it("should not include language section for English", () => {
      const config = createTenantPromptConfig("tenant_123", {
        languagePreference: "en",
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).not.toContain("Language");
    });

    it("should combine multiple sections", () => {
      const config = createTenantPromptConfig("tenant_123", {
        techStack: {
          primaryLanguages: ["Python"],
          ciSystem: "gitlab_ci",
        },
        analysisDepth: "detailed",
        preferences: {
          focusAreas: ["testing"],
        },
        customInstructions: "Focus on pytest failures",
        languagePreference: "fr",
      });

      const result = buildTenantPromptAdditions(config);

      expect(result).toContain("Tenant Technology Context");
      expect(result).toContain("Analysis Depth: Detailed");
      expect(result).toContain("Tenant Preferences");
      expect(result).toContain("Custom Instructions");
      expect(result).toContain("Language");
    });
  });
});
