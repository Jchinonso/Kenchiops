/**
 * Dispatch Port Interfaces
 *
 * Re-exports the port interfaces from policyTypes for discoverability.
 * The actual interface definitions live in types/policyTypes.ts.
 *
 * @module ports/dispatchPort
 */

export type { SlackDispatchPort, PagerDutyDispatchPort } from "../types/policyTypes.js";
