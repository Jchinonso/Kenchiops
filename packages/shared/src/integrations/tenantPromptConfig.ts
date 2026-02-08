/**
 * Tenant-Conditioned Prompt Configuration
 *
 * Enables per-tenant customization of LLM prompts based on tenant metadata.
 * Part of Phase 3 model strategy for instruction-level prompt tweaks.
 *
 * @module integrations/tenantPromptConfig
 */

import { createLogger } from "../core/logger.js";
import { TENANT_PROMPT_LIMITS } from "../constants/index.js";
import type {
  AnalysisDepth,
  FocusArea,
  PromptPreferences,
  TechStackConfig,
  TenantPromptConfig,
} from "./types.js";

export type {
  AnalysisDepth,
  CISystem,
  FocusArea,
  PromptPreferences,
  TechStackConfig,
  TenantPromptConfig,
  VerbosityLevel,
} from "./types.js";

const logger = createLogger("tenant-prompt-config");

// ==================== Default Configuration ====================

const DEFAULT_CONFIG: Omit<TenantPromptConfig, "tenantId"> = {
  analysisDepth: "standard",
  preferences: {
    prioritizeSpeed: false,
    includeCodeSnippets: true,
    maxRecommendations: 3,
    verbosityLevel: "normal",
  },
};

// ==================== Prompt Modifiers ====================

/**
 * Generates tech stack context for the prompt.
 */
const buildTechStackContext = (techStack: TechStackConfig): string => {
  const parts: string[] = [];

  if (techStack.primaryLanguages && techStack.primaryLanguages.length > 0) {
    parts.push(`Primary Languages: ${techStack.primaryLanguages.join(", ")}`);
  }

  if (techStack.frameworks && techStack.frameworks.length > 0) {
    parts.push(`Frameworks: ${techStack.frameworks.join(", ")}`);
  }

  if (techStack.ciSystem) {
    parts.push(`CI System: ${techStack.ciSystem.replace("_", " ")}`);
  }

  if (techStack.testingFrameworks && techStack.testingFrameworks.length > 0) {
    parts.push(`Testing Frameworks: ${techStack.testingFrameworks.join(", ")}`);
  }

  if (techStack.deploymentPlatform) {
    parts.push(`Deployment Platform: ${techStack.deploymentPlatform}`);
  }

  return parts.length > 0 ? `\n## Tenant Technology Context\n${parts.join("\n")}` : "";
};

/**
 * Generates analysis depth instructions.
 */
const buildAnalysisDepthInstructions = (depth: AnalysisDepth): string => {
  const depthInstructions: Record<AnalysisDepth, string> = {
    brief: `
## Analysis Depth: Brief
- Provide a concise summary (1-2 sentences)
- Focus only on the most critical root cause
- Limit to 1-2 high-priority recommendations
- Skip detailed reasoning unless essential`,
    standard: "", // Standard depth uses default behavior
    detailed: `
## Analysis Depth: Detailed
- Provide comprehensive analysis with full reasoning
- Include all relevant context and correlations
- Explain step-by-step how you reached conclusions
- Document all evidence considered, even if inconclusive
- Suggest thorough investigation steps`,
  };

  return depthInstructions[depth];
};

/**
 * Generates preference-based instructions.
 */
const buildPreferenceInstructions = (preferences: PromptPreferences): string => {
  const parts: string[] = [];

  if (preferences.prioritizeSpeed) {
    parts.push("- Prioritize quick, actionable insights over comprehensive analysis");
  }

  if (preferences.includeCodeSnippets === false) {
    parts.push("- Do not include code snippets in recommendations");
  }

  if (preferences.maxRecommendations !== undefined) {
    parts.push(
      `- Limit recommendations to ${preferences.maxRecommendations} most impactful actions`
    );
  }

  if (preferences.focusAreas && preferences.focusAreas.length > 0) {
    const focusMap: Record<FocusArea, string> = {
      root_cause: "identifying root cause",
      dependencies: "dependency analysis",
      configuration: "configuration issues",
      testing: "test failure patterns",
      security: "security implications",
      performance: "performance impact",
    };
    const focusDescriptions = preferences.focusAreas.map((area) => focusMap[area]);
    parts.push(`- Focus analysis on: ${focusDescriptions.join(", ")}`);
  }

  if (preferences.verbosityLevel === "minimal") {
    parts.push("- Use minimal, direct language without elaboration");
  } else if (preferences.verbosityLevel === "verbose") {
    parts.push("- Provide verbose explanations with full context");
  }

  return parts.length > 0 ? `\n## Tenant Preferences\n${parts.join("\n")}` : "";
};

// ==================== Public API ====================

/**
 * Builds tenant-specific prompt additions.
 *
 * @param config - Tenant prompt configuration
 * @returns Additional prompt sections for tenant customization
 */
export const buildTenantPromptAdditions = (config: TenantPromptConfig): string => {
  const sections: string[] = [];

  // Add tech stack context
  if (config.techStack) {
    const techStackSection = buildTechStackContext(config.techStack);
    if (techStackSection) {
      sections.push(techStackSection);
    }
  }

  // Add analysis depth instructions
  if (config.analysisDepth && config.analysisDepth !== "standard") {
    sections.push(buildAnalysisDepthInstructions(config.analysisDepth));
  }

  // Add preference instructions
  if (config.preferences) {
    const prefSection = buildPreferenceInstructions(config.preferences);
    if (prefSection) {
      sections.push(prefSection);
    }
  }

  // Add custom instructions
  if (config.customInstructions) {
    sections.push(`\n## Custom Instructions\n${config.customInstructions}`);
  }

  // Add language preference
  if (config.languagePreference && config.languagePreference !== "en") {
    sections.push(`\n## Language\nRespond in ${config.languagePreference} language.`);
  }

  const result = sections.join("\n");

  if (result) {
    logger.debug("Built tenant prompt additions", {
      tenantId: config.tenantId,
      sectionsCount: sections.length,
    });
  }

  return result;
};

/**
 * Merges tenant config with defaults.
 *
 * @param tenantId - Tenant identifier
 * @param partialConfig - Partial tenant configuration
 * @returns Complete tenant prompt configuration
 */
export const createTenantPromptConfig = (
  tenantId: string,
  partialConfig: Partial<Omit<TenantPromptConfig, "tenantId">> = {}
): TenantPromptConfig => ({
  tenantId,
  analysisDepth: partialConfig.analysisDepth ?? DEFAULT_CONFIG.analysisDepth,
  preferences: {
    ...DEFAULT_CONFIG.preferences,
    ...partialConfig.preferences,
  },
  techStack: partialConfig.techStack,
  customInstructions: partialConfig.customInstructions,
  languagePreference: partialConfig.languagePreference,
});

/**
 * Validates tenant prompt configuration.
 *
 * @param config - Configuration to validate
 * @returns Validation result
 */
export const validateTenantPromptConfig = (
  config: TenantPromptConfig
): { valid: boolean; errors: readonly string[] } => {
  const errors: string[] = [];

  if (!config.tenantId || config.tenantId.trim() === "") {
    errors.push("Tenant ID is required");
  }

  if (config.preferences?.maxRecommendations !== undefined) {
    const { MIN_RECOMMENDATIONS, MAX_RECOMMENDATIONS } = TENANT_PROMPT_LIMITS;
    if (
      config.preferences.maxRecommendations < MIN_RECOMMENDATIONS ||
      config.preferences.maxRecommendations > MAX_RECOMMENDATIONS
    ) {
      errors.push(
        `Max recommendations must be between ${MIN_RECOMMENDATIONS} and ${MAX_RECOMMENDATIONS}`
      );
    }
  }

  if (config.customInstructions) {
    const { MAX_CUSTOM_INSTRUCTIONS_LENGTH } = TENANT_PROMPT_LIMITS;
    if (config.customInstructions.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
      errors.push(
        `Custom instructions must be ${MAX_CUSTOM_INSTRUCTIONS_LENGTH} characters or less`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  };
};
