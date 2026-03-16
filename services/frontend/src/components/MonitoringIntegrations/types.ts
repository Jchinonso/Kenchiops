import type { LucideIcon } from "lucide-react";

export interface SourceHealthInfo {
  readonly eventCount: number;
  readonly lastReceived: string | null;
}

export interface MonitoringProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: LucideIcon;
  readonly active: boolean;
  readonly description: string;
  readonly webhookPath?: string;
  readonly setupSteps?: readonly string[];
  readonly requiredHeaders?: readonly string[];
}

export type HealthStatus = "connected" | "stale" | "no_events";
