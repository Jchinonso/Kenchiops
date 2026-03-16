/**
 * Shared types for the Login module.
 */

import type { GitProvider } from "./constants";

export interface ProviderButtonProps {
  readonly provider: GitProvider;
  readonly variant: "primary" | "secondary";
  readonly isLoading: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

export interface LoginFormProps {
  readonly providers: readonly GitProvider[];
  readonly loadingProvider: string | null;
  readonly authChecking: boolean;
  readonly oauthErrorMessage: string | null;
  readonly onProviderClick: (providerId: string) => void;
}
