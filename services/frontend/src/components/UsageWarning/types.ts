export interface UsageWarningProps {
  readonly label: string;
  readonly current: number;
  readonly limit: number | null;
  readonly showUpgradeLink?: boolean;
}
