/**
 * Swagger re-export barrel.
 *
 * The full OpenAPI spec is assembled in `swagger/index.ts` from modular path files.
 * This file re-exports `setupSwagger` so existing imports continue to work.
 *
 * @module swagger
 */

export { setupSwagger } from "./swagger/index.js";
