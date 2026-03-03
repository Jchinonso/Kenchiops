/**
 * Constants for the Integrations page.
 */

export const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG ?? "kenchi-devops";

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  oauth_denied: "OAuth authorization was denied",
  missing_params: "Missing OAuth parameters",
  invalid_state: "Invalid or expired OAuth state",
  provider_mismatch: "Provider mismatch in OAuth flow",
  invalid_params: "Invalid OAuth parameters",
};
