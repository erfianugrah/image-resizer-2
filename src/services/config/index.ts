/**
 * Configuration Module
 * 
 * This package provides a comprehensive configuration system with:
 * - KV-based storage with versioning for dynamic updates
 * - Configuration API for runtime management
 * - Module-based configuration with JSON schema validation
 * - Environment-specific configuration
 * - Legacy config.ts bridge for compatibility
 */

// Export interfaces
export * from './interfaces';

// Export implementations
export { KVConfigStore } from './KVConfigStore';
export { DefaultConfigurationApiService } from './ConfigurationApiService';
export { SchemaValidator } from './schemaValidator';

// Export registration
export { registerConfigurationServices } from './register';

// Export bridge
export { getConfigWithFallback } from './configBridge';

// Export modules
export { coreModule, coreModuleRegistration } from './modules/core';
export { cacheModule, cacheModuleRegistration } from './modules/cache';
export { transformModule, transformModuleRegistration } from './modules/transform';
export { storageModule, storageModuleRegistration } from './modules/storage';