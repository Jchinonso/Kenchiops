export interface BillingStatusDTO {
  readonly hasStripeCustomer: boolean;
  readonly stripeCustomerId: string | null;
  readonly currentPeriodEnd: string | null;
  readonly planId: string;
  readonly status: string;
}

export interface CheckoutResultDTO {
  readonly sessionId: string;
  readonly url: string;
}

export interface PortalResultDTO {
  readonly url: string;
}
