/**
 * Configuration Module
 * 
 * This package provides a KV-based configuration system with:
 * - KV-based storage with versioning for dynamic updates
 * - Configuration API for runtime management
 * - Zod schema validation for runtime type checking
 * - Seamless fallback to environment variables
 */

// Export interfaces
export * from './interfaces';

// Export implementations
export { KVConfigStore } from './KVConfigStore';
export { KVConfigurationService } from './KVConfigurationService';
export { DefaultConfigurationApiService } from './ConfigurationApiService';