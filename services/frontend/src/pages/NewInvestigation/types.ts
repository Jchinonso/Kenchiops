/**
 * Shared types for the NewInvestigation module.
 */

export interface FormState {
  readonly description: string;
  readonly serviceName: string;
  readonly environment: string;
  readonly symptom: string;
  readonly endpoint: string;
}
