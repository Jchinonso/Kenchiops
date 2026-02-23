/**
 * Event Module
 *
 * Database operations for querying events by tenant.
 *
 * @module database/event
 */

// Types
export type {
  EventRow,
  EventRecord,
  EventCountRow,
  EventListOptions,
  CountEventsByTenantFilteredOptions,
  CreateEventInput,
} from "./types.js";

// Helpers (includes validation and mappers)
export { mapRowToEvent, validateEventListOptions, validateCreateEventInput } from "./helpers.js";

// Repository operations
export {
  createEvent,
  getEventsByTenant,
  countEventsByTenant,
  getEventsByTenantFiltered,
  countEventsByTenantFiltered,
  findEventIdByRepoAndCommit,
} from "./repository.js";
