// ==================== DTO Types ====================

interface PlanLimitsDTO {
  readonly maxRepositories: number | null;
  readonly maxAnalysesMonthly: number | null;
  readonly maxIntegrations: number | null;
  readonly maxTeamMembers: number | null;
}

interface PlanFeaturesDTO {
  readonly slackIntegration: boolean;
  readonly customRules: boolean;
  readonly teamAnalytics: boolean;
  readonly ssoSaml: boolean;
  readonly auditLog: boolean;
  readonly apiAccess: boolean;
  readonly prioritySupport: boolean;
}

export interface PlanDTO {
  readonly id: string;
  readonly displayName: string;
  readonly priceMonthlyCents: number | null;
  readonly limits: PlanLimitsDTO;
  readonly features: PlanFeaturesDTO;
}

interface SubscriptionInfoDTO {
  readonly planId: string;
  readonly status: string;
  readonly trialEndsAt: string | null;
  readonly changedAt: string | null;
}

export interface SubscriptionDTO {
  readonly plan: PlanDTO;
  readonly subscription: SubscriptionInfoDTO;
}

export interface UsageLimitDTO {
  readonly current: number;
  readonly limit: number | null;
  readonly limited: boolean;
}

export interface SubscriptionUsageDTO {
  readonly planId: string;
  readonly usage: {
    readonly repositories: UsageLimitDTO;
    readonly analysesThisMonth: UsageLimitDTO;
    readonly integrations: UsageLimitDTO;
    readonly teamMembers: UsageLimitDTO;
  };
}

export interface ChangePlanResultDTO {
  readonly subscription: {
    readonly planId: string;
    readonly status: string;
    readonly changedAt: string;
  };
  readonly previousPlanId: string;
}

export interface PlanLimitInfo {
  readonly limitKey: string;
  readonly currentUsage: number;
  readonly limit: number;
  readonly currentPlan: string;
}
