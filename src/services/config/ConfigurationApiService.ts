/**
 * Configuration API Service
 * 
 * This service provides a high-level API for managing configuration settings,
 * with support for modular configuration, environment-specific overrides,
 * environment variable interpolation, and dynamic updates.
 */

import { ConfigurationApiService, ConfigStoreInterface, ConfigurationSystem, ConfigVersionMetadata, ModuleRegistration } from './interfaces';
import { Logger } from '../../utils/logging';
import { SchemaValidator } from './schemaValidator';
import { ConfigValueResolver } from './configValueResolver';

/**
 * Default implementation of the Configuration API Service
 */
export class DefaultConfigurationApiService implements ConfigurationApiService {
  private configStore: ConfigStoreInterface;
  private logger?: Logger;
  private cachedConfig: ConfigurationSystem | null = null;
  private moduleRegistrations = new Map<string, ModuleRegistration>();
  private schemaValidator: SchemaValidator;
  private valueResolver: ConfigValueResolver;
  private env?: Record<string, string>;
  
  /**
   * Create a new Configuration API Service
   */
  constructor(
    configStore: ConfigStoreInterface, 
    env?: Record<string, string>,
    logger?: Logger
  ) {
    this.configStore = configStore;
    this.logger = logger;
    this.env = env;
    this.schemaValidator = new SchemaValidator(logger);
    this.valueResolver = new ConfigValueResolver(env, logger);
  }
  
  /**
   * Get the complete configuration
   */
  async getConfig(): Promise<ConfigurationSystem> {
    // Log request for current configuration
    if (this.logger) {
      this.logger.breadcrumb('Getting complete configuration');
    }
    
    // Return cached config if available
    if (this.cachedConfig) {
      if (this.logger) {
        this.logger.debug('Returning cached configuration', {
          moduleCount: Object.keys(this.cachedConfig.modules).length,
          version: this.cachedConfig._meta?.version
        });
      }
      return this.cachedConfig;
    }
    
    // Get the current config from store
    if (this.logger) {
      this.logger.breadcrumb('Fetching configuration from store');
    }
    const config = await this.configStore.getCurrentConfig();
    
    if (!config) {
      // If no config is found, create a minimal default config
      const defaultConfig: ConfigurationSystem = {
        _meta: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          activeModules: []
        },
        modules: {}
      };
      
      // Return the default config without storing it
      this.cachedConfig = defaultConfig;
      return defaultConfig;
    }
    
    // Cache the result
    this.cachedConfig = config;
    return config;
  }
  
  /**
   * Get a configuration value using dot notation, with environment variable resolution
   */
  async getValue<T>(path: string, defaultValue?: T): Promise<T> {
    const parts = path.split('.');
    const config = await this.getConfig();
    
    // Navigate through the path parts to find the value
    let current: any = config;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue as T;
      }
      current = current[part];
    }
    
    if (current === undefined || current === null) {
      return defaultValue as T;
    }
    
    // Resolve any environment variables in the value
    const resolvedValue = this.valueResolver.resolveValue(current);
    return resolvedValue as T;
  }
  
  /**
   * Get a specific module configuration with environment variable resolution
   */
  async getModule<T = Record<string, any>>(moduleName: string): Promise<T | null> {
    const config = await this.getConfig();
    
    if (!config.modules[moduleName]) {
      return null;
    }
    
    const moduleConfig = config.modules[moduleName].config;
    
    // Resolve any environment variables in the module configuration
    const resolvedConfig = this.valueResolver.resolveValue(moduleConfig);
    return resolvedConfig as unknown as T;
  }
  
  /**
   * Check if a feature is enabled
   */
  async isFeatureEnabled(featureName: string): Promise<boolean> {
    // Try to find the feature in the core.features module
    try {
      const featuresConfig = await this.getModule('core');
      
      if (featuresConfig && featuresConfig.features && typeof featuresConfig.features[featureName] === 'boolean') {
        return featuresConfig.features[featureName];
      }
      
      // If not found in core.features, check other modules
      const config = await this.getConfig();
      
      // Look through all modules for a features section
      for (const moduleName of Object.keys(config.modules)) {
        const moduleConfig = config.modules[moduleName].config;
        
        if (moduleConfig.features && typeof moduleConfig.features[featureName] === 'boolean') {
          return moduleConfig.features[featureName];
        }
      }
      
      // Not found in any module
      return false;
    } catch (error) {
      this.logError(`Error checking if feature ${featureName} is enabled`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * Get configuration for the current environment
   */
  async getEnvironmentConfig(environment: 'development' | 'staging' | 'production'): Promise<Partial<Record<string, any>>> {
    try {
      // Get the environment-specific configuration module
      const envConfig = await this.getModule(`environment.${environment}`);
      
      if (!envConfig) {
        return {};
      }
      
      return envConfig;
    } catch (error) {
      this.logError(`Error getting environment config for ${environment}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }
  
  /**
   * List available configuration versions
   */
  async listVersions(limit: number = 100): Promise<ConfigVersionMetadata[]> {
    try {
      const result = await this.configStore.listVersions(limit);
      return result.versions;
    } catch (error) {
      this.logError('Error listing config versions', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }
  
  /**
   * Get a specific configuration version
   */
  async getVersion(versionId: string): Promise<ConfigurationSystem | null> {
    return this.configStore.getConfigVersion(versionId);
  }
  
  /**
   * Activate a specific configuration version
   */
  async activateVersion(versionId: string): Promise<boolean> {
    try {
      const success = await this.configStore.activateVersion(versionId);
      
      if (success) {
        // Invalidate cache if version was successfully activated
        this.cachedConfig = null;
      }
      
      return success;
    } catch (error) {
      this.logError(`Error activating config version ${versionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * Store a new configuration
   */
  async storeConfig(
    config: ConfigurationSystem,
    metadata: Omit<ConfigVersionMetadata, 'id' | 'timestamp' | 'hash'>
  ): Promise<ConfigVersionMetadata> {
    try {
      // Validate the configuration against registered module schemas
      this.validateConfig(config);
      
      // Store the configuration
      const versionMetadata = await this.configStore.storeConfig(config, metadata);
      
      // Update cached config
      this.cachedConfig = config;
      
      return versionMetadata;
    } catch (error) {
      this.logError('Error storing new config', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Update configuration for a specific module
   */
  async updateModule(
    moduleName: string,
    config: Record<string, any>,
    comment: string,
    author: string
  ): Promise<ConfigVersionMetadata> {
    try {
      // Validate the module configuration against its schema
      this.validateModuleConfig(moduleName, config);
      
      // Update the module configuration
      const versionMetadata = await this.configStore.updateModuleConfig(
        moduleName,
        config,
        {
          comment,
          author,
          tags: [moduleName],
          changes: [] // Will be populated by the store
        }
      );
      
      // Invalidate cache
      this.cachedConfig = null;
      
      return versionMetadata;
    } catch (error) {
      this.logError(`Error updating module ${moduleName}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Register a new module
   */
  async registerModule(registration: ModuleRegistration): Promise<void> {
    try {
      // Validate the registration
      if (!registration.name || !registration.schema || !registration.defaults) {
        throw new Error('Invalid module registration: missing required fields');
      }
      
      // Register the module
      this.moduleRegistrations.set(registration.name, registration);
      
      // Get current config
      const currentConfig = await this.getConfig();
      
      // Check if module already exists in configuration
      if (currentConfig.modules[registration.name]) {
        // Module exists, nothing more to do
        this.logInfo(`Module ${registration.name} already registered in configuration`);
        return;
      }
      
      // Create a new config with the registered module
      const newConfig: ConfigurationSystem = {
        ...currentConfig,
        _meta: {
          ...currentConfig._meta,
          activeModules: [...currentConfig._meta.activeModules, registration.name]
        },
        modules: {
          ...currentConfig.modules,
          [registration.name]: {
            _meta: {
              name: registration.name,
              version: registration.version,
              description: registration.description,
              schema: registration.schema,
              defaults: registration.defaults,
              moduleDependencies: registration.moduleDependencies
            },
            config: registration.defaults
          }
        }
      };
      
      // Store the new configuration
      await this.storeConfig(
        newConfig,
        {
          author: 'system',
          comment: `Registered module ${registration.name}`,
          modules: [registration.name],
          tags: ['registration'],
          changes: [] // Will be populated by the store
        }
      );
      
      this.logInfo(`Registered new module ${registration.name}`);
    } catch (error) {
      this.logError(`Error registering module ${registration.name}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Compare two configuration versions
   */
  async compareVersions(versionId1: string, versionId2: string): Promise<{
    added: string[];
    removed: string[];
    modified: string[];
    unchanged: string[];
  }> {
    return this.configStore.compareVersions(versionId1, versionId2);
  }
  
  /**
   * Validate a complete configuration against registered schema
   */
  private validateConfig(config: ConfigurationSystem): void {
    // Use the schema validator for complete validation
    this.schemaValidator.validateConfigSystem(config);
  }
  
  /**
   * Validate a module configuration against its schema
   */
  private validateModuleConfig(moduleName: string, config: Record<string, any>): void {
    // Get the module registration to access its schema
    const registration = this.moduleRegistrations.get(moduleName);
    
    if (registration) {
      // If we have a registered schema, use it for validation
      this.schemaValidator.validateModuleConfig(moduleName, config, registration.schema);
    } else {
      // If the module isn't registered, we can't validate against a schema
      // so just perform basic existence check
      if (!config) {
        throw new Error(`Invalid module configuration for ${moduleName}: config is empty`);
      }
      
      this.logWarn(`No schema registration found for module ${moduleName}, performing minimal validation`);
    }
  }
  
  // Logging utility methods
  private logDebug(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.debug(message, data);
    } else if (typeof console !== 'undefined') {
      console.debug(message, data);
    }
  }
  
  private logInfo(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.info(message, data);
    } else if (typeof console !== 'undefined') {
      console.info(message, data);
    }
  }
  
  private logWarn(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.warn(message, data);
    } else if (typeof console !== 'undefined') {
      console.warn(message, data);
    }
  }
  
  private logError(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.error(message, data);
    } else if (typeof console !== 'undefined') {
      console.error(message, data);
    }
  }
}