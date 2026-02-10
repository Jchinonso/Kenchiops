/**
 * Repository Channel Module
 *
 * Database operations for repository-channel mappings.
 *
 * @module database/repositoryChannel
 */

// Types
export type {
  MappingRow,
  RepositoryRow,
  CountRow,
  CreateMappingValidationRule,
  RepositoryChannelMapping,
  CreateRepositoryChannelMapping,
} from "./types.js";

// Helpers (includes row mappers and validation)
export {
  // Row mappers
  mapRowToMapping,
  extractFirstMapping,
  mapRowsToRepositorySet,
  getRowCount,
  // Validation
  validateCreateMappingInput,
  validateId,
} from "./helpers.js";

// Service operations
export {
  findChannelForRepository,
  findMappingsForChannel,
  findAllMappingsForTenant,
  getMappedRepositories,
  createMapping,
  deleteMapping,
  deleteMappingsForChannel,
  isMapped,
} from "./service.js";
