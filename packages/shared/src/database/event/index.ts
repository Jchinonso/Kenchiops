/**
 * Event Module
 *
 * Database operations for querying events by tenant.
 *
 * @module database/event
 */

// Types
export type { EventRow, EventRecord, EventCountRow, EventListOptions } from "./types.js";

// Helpers (includes validation and mappers)
export { mapRowToEvent, validateEventListOptions } from "./helpers.js";

// Repository operations
export { getEventsByTenant, countEventsByTenant } from "./repository.js";
