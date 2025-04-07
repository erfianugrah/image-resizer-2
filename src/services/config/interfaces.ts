/**
 * Interfaces for the Configuration System
 * 
 * This file defines the interfaces for the modular configuration system
 * that supports module-based configuration, versioning, and dynamic updates.
 */

/**
 * Metadata for configuration versions
 */
export interface ConfigVersionMetadata {
  id: string;                    // Version identifier (e.g., 'v25')
  timestamp: string;             // ISO timestamp when created
  author: string;                // Who created this version
  comment: string;               // Description of the changes
  hash: string;                  // Content hash for integrity checking
  parent?: string;               // Parent version ID
  modules: string[];             // List of modules included
  changes?: string[];            // List of paths changed (dot notation)
  tags?: string[];               // Optional version tags
}

/**
 * Module metadata
 */
export interface ConfigModuleMetadata {
  name: string;                 // Module name
  version: string;              // Module version
  description: string;          // Module description
  schema: Record<string, any>;  // JSON schema for validation
  defaults: Record<string, any>;// Default values
  moduleDependencies?: string[]; // Module dependencies
}

/**
 * Configuration module
 */
export interface ConfigModule {
  _meta: ConfigModuleMetadata;  // Module metadata
  config: Record<string, any>;  // Module configuration
}

/**
 * Configuration system
 */
export interface ConfigurationSystem {
  _meta: {
    version: string;            // System version
    lastUpdated: string;        // ISO timestamp of last update
    activeModules: string[];    // List of active modules
  };
  
  modules: Record<string, ConfigModule>; // Individual modules
}

/**
 * Configuration module registration
 */
export interface ModuleRegistration {
  name: string;
  version: string;
  description: string;
  schema: Record<string, any>;
  defaults: Record<string, any>;
  moduleDependencies?: string[];
}

/**
 * Result for listing configuration versions
 */
export interface ConfigVersionListResult {
  versions: ConfigVersionMetadata[];
  cursor?: string;
  complete: boolean;
}

/**
 * Configuration storage interface
 */
export interface ConfigStoreInterface {
  /**
   * Get the current active configuration
   */
  getCurrentConfig(): Promise<ConfigurationSystem | null>;
  
  /**
   * Get a specific configuration version
   */
  getConfigVersion(versionId: string): Promise<ConfigurationSystem | null>;
  
  /**
   * List available configuration versions
   */
  listVersions(limit?: number, cursor?: string): Promise<ConfigVersionListResult>;
  
  /**
   * Store a new configuration version and make it active
   */
  storeConfig(
    config: ConfigurationSystem, 
    metadata: Omit<ConfigVersionMetadata, 'id' | 'timestamp' | 'hash'>
  ): Promise<ConfigVersionMetadata>;
  
  /**
   * Activate a specific configuration version
   */
  activateVersion(versionId: string): Promise<boolean>;
  
  /**
   * Get configuration metadata for a specific version
   */
  getVersionMetadata(versionId: string): Promise<ConfigVersionMetadata | null>;
  
  /**
   * Get configuration for a specific module
   */
  getModuleConfig<T = Record<string, any>>(moduleName: string): Promise<T | null>;
  
  /**
   * Update configuration for a specific module
   */
  updateModuleConfig(
    moduleName: string, 
    config: Record<string, any>, 
    metadata: Omit<ConfigVersionMetadata, 'id' | 'timestamp' | 'hash' | 'modules'>
  ): Promise<ConfigVersionMetadata>;
  
  /**
   * Compare two configuration versions
   */
  compareVersions(versionId1: string, versionId2: string): Promise<{
    added: string[];
    removed: string[];
    modified: string[];
    unchanged: string[];
  }>;
}

/**
 * Configuration management interface
 */
export interface ConfigurationApiService {
  /**
   * Get the complete configuration
   */
  getConfig(): Promise<ConfigurationSystem>;
  
  /**
   * Get a configuration value using dot notation
   */
  getValue<T>(path: string, defaultValue?: T): Promise<T>;
  
  /**
   * Get a specific module configuration
   */
  getModule<T = Record<string, any>>(moduleName: string): Promise<T | null>;
  
  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(featureName: string): Promise<boolean>;
  
  /**
   * Get configuration for the current environment
   */
  getEnvironmentConfig(environment: 'development' | 'staging' | 'production'): Promise<Partial<Record<string, any>>>;
  
  /**
   * List available configuration versions
   */
  listVersions(limit?: number): Promise<ConfigVersionMetadata[]>;
  
  /**
   * Get a specific configuration version
   */
  getVersion(versionId: string): Promise<ConfigurationSystem | null>;
  
  /**
   * Activate a specific configuration version
   */
  activateVersion(versionId: string): Promise<boolean>;
  
  /**
   * Store a new configuration
   */
  storeConfig(
    config: ConfigurationSystem, 
    metadata: Omit<ConfigVersionMetadata, 'id' | 'timestamp' | 'hash'>
  ): Promise<ConfigVersionMetadata>;
  
  /**
   * Update configuration for a specific module
   */
  updateModule(
    moduleName: string, 
    config: Record<string, any>, 
    comment: string, 
    author: string
  ): Promise<ConfigVersionMetadata>;
  
  /**
   * Register a new module
   */
  registerModule(registration: ModuleRegistration): Promise<void>;
  
  /**
   * Compare two configuration versions
   */
  compareVersions(versionId1: string, versionId2: string): Promise<{
    added: string[];
    removed: string[];
    modified: string[];
    unchanged: string[];
  }>;
}