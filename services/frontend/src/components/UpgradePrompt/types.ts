export interface UpgradePromptProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly limitKey: string;
  readonly currentUsage: number;
  readonly limit: number;
  readonly currentPlan: string;
}
