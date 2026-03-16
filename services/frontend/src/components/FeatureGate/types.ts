export interface FeatureGateProps {
  readonly feature: string;
  readonly fallback?: React.ReactNode;
  readonly children: React.ReactNode;
}

export interface DefaultUpgradeFallbackProps {
  readonly featureLabel: string;
  readonly planName: string;
}
