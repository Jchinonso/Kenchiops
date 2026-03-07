export interface PlanLimitState {
  readonly limitKey: string;
  readonly currentUsage: number;
  readonly limit: number;
  readonly currentPlan: string;
}

export interface UsePlanLimitErrorResult {
  /** Current plan limit error state, or null if no error. */
  readonly planLimitError: PlanLimitState | null;
  /** Whether the UpgradePrompt dialog should be open. */
  readonly isOpen: boolean;
  /** Check an API response for a plan limit error. Returns true if limit was hit. */
  readonly checkResponse: (response: Response) => Promise<boolean>;
  /** Check URL search params for plan limit redirect. Returns true if limit was hit. */
  readonly checkUrlParams: (params: URLSearchParams) => boolean;
  /** Dismiss the UpgradePrompt dialog. */
  readonly dismiss: () => void;
}
