/**
 * KV Configuration Service
 * 
 * This service provides a centralized way to access configuration that is stored in KV.
 * It serves as a bridge between the KV config store and the application, handling parsing,
 * validation, caching, and versioning.
 */

import { ConfigStoreInterface, ConfigurationApiService, ConfigVersionMetadata, ConfigurationSystem } from './interfaces';
import { Logger } from '../../utils/logging';
import { imageResizerConfigSchema } from '../../schemas/configSchema';
import { Env } from '../../types';
import { ImageResizerConfig } from '../../config';

/**
 * Service for KV-based configuration management
 */
export class KVConfigurationService implements ConfigurationApiService {
  private kvStore: ConfigStoreInterface;
  private logger: Logger;
  private env: Env;
  private cachedConfig: ConfigurationSystem | null = null;
  private cachedImageConfig: ImageResizerConfig | null = null;
  private cacheExpiration: number = 0;
  private cacheLifetimeMs: number = 60000; // 1 minute cache lifetime by default

  /**
   * Create a new KV Configuration Service
   * 
   * @param kvStore The KV config store implementation
   * @param logger Logger for service operations
   * @param env Environment variables
   * @param options Additional options
   */
  constructor(
    kvStore: ConfigStoreInterface, 
    logger: Logger, 
    env: Env,
    options?: {
      cacheLifetimeMs?: number; // Cache lifetime in milliseconds
    }
  ) {
    this.kvStore = kvStore;
    this.logger = logger;
    this.env = env;

    if (options?.cacheLifetimeMs) {
      this.cacheLifetimeMs = options.cacheLifetimeMs;
    }

    this.logger.debug('KV Configuration Service initialized', {
      cacheLifetimeMs: this.cacheLifetimeMs
    });
  }

  /**
   * Get the complete configuration
   */
  async getConfig(): Promise<ConfigurationSystem> {
    if (this.isCacheValid()) {
      this.logger.debug('Using cached configuration');
      return this.cachedConfig!;
    }

    const config = await this.kvStore.getCurrentConfig();
    
    if (!config) {
      this.logger.error('No configuration found in KV store');
      throw new Error('No configuration found in KV store');
    }

    // Update cache
    this.cachedConfig = config;
    this.cacheExpiration = Date.now() + this.cacheLifetimeMs;
    
    return config;
  }

  /**
   * Get the image resizer configuration
   */
  async getImageConfig(): Promise<ImageResizerConfig> {
    if (this.isCacheValid() && this.cachedImageConfig) {
      this.logger.debug('Using cached image configuration');
      return this.cachedImageConfig;
    }

    const config = await this.getConfig();
    
    // Check if the image-resizer module exists
    if (!config.modules['image-resizer']) {
      this.logger.error('Image resizer configuration module not found');
      throw new Error('Image resizer configuration module not found');
    }

    const imageConfig = config.modules['image-resizer'].config as unknown as ImageResizerConfig;
    
    try {
      // Validate against schema
      const validatedConfig = imageResizerConfigSchema.parse(imageConfig);
      
      // Update cache
      this.cachedImageConfig = validatedConfig;
      
      return validatedConfig;
    } catch (error) {
      this.logger.error('Invalid image resizer configuration', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Invalid image resizer configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a configuration value using dot notation
   */
  async getValue<T>(path: string, defaultValue?: T): Promise<T> {
    const config = await this.getImageConfig();
    
    const parts = path.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = config;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue as T;
      }
      current = current[part];
    }
    
    return (current === undefined || current === null) ? (defaultValue as T) : current;
  }

  /**
   * Get the configuration for the current environment
   */
  async getEnvironmentConfig(environment: 'development' | 'staging' | 'production'): Promise<Partial<Record<string, any>>> {
    const config = await this.getConfig();
    
    // Check if environment-specific module exists
    const envModuleName = `environment-${environment}`;
    if (!config.modules[envModuleName]) {
      return {};
    }
    
    return config.modules[envModuleName].config;
  }

  /**
   * Check if a feature is enabled
   */
  async isFeatureEnabled(featureName: string): Promise<boolean> {
    const config = await this.getImageConfig();
    
    if (!config.features) {
      return false;
    }
    
    return (config.features as Record<string, boolean>)[featureName] === true;
  }

  /**
   * List available configuration versions
   */
  async listVersions(limit?: number): Promise<ConfigVersionMetadata[]> {
    const result = await this.kvStore.listVersions(limit);
    return result.versions;
  }

  /**
   * Get a specific configuration version
   */
  async getVersion(versionId: string): Promise<ConfigurationSystem | null> {
    return this.kvStore.getConfigVersion(versionId);
  }

  /**
   * Activate a specific configuration version
   */
  async activateVersion(versionId: string): Promise<boolean> {
    const success = await this.kvStore.activateVersion(versionId);
    
    if (success) {
      // Invalidate cache to force reload
      this.invalidateCache();
    }
    
    return success;
  }

  /**
   * Store a new configuration
   */
  async storeConfig(
    config: ConfigurationSystem, 
    metadata: Omit<ConfigVersionMetadata, 'id' | 'timestamp' | 'hash'>
  ): Promise<ConfigVersionMetadata> {
    const result = await this.kvStore.storeConfig(config, metadata);
    
    // Invalidate cache to force reload
    this.invalidateCache();
    
    return result;
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
    const result = await this.kvStore.updateModuleConfig(moduleName, config, {
      author,
      comment
    });
    
    // Invalidate cache to force reload
    this.invalidateCache();
    
    return result;
  }

  /**
   * Register a new module
   */
  async registerModule(registration: {
    name: string;
    version: string;
    description: string;
    schema: Record<string, any>;
    defaults: Record<string, any>;
    moduleDependencies?: string[];
  }): Promise<void> {
    // Get current configuration
    const currentConfig = await this.getConfig();
    
    // Create a deep copy of the current config
    const newConfig: ConfigurationSystem = JSON.parse(JSON.stringify(currentConfig));
    
    // Check if module already exists
    if (newConfig.modules[registration.name]) {
      throw new Error(`Module ${registration.name} already exists`);
    }
    
    // Create new module
    newConfig.modules[registration.name] = {
      _meta: {
        name: registration.name,
        version: registration.version,
        description: registration.description,
        schema: registration.schema,
        defaults: registration.defaults,
        moduleDependencies: registration.moduleDependencies
      },
      config: registration.defaults
    };
    
    // Update active modules list
    newConfig._meta.activeModules.push(registration.name);
    
    // Store the new configuration
    await this.storeConfig(newConfig, {
      author: 'system',
      comment: `Registered new module: ${registration.name} v${registration.version}`,
      modules: [registration.name],
    });
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
    return this.kvStore.compareVersions(versionId1, versionId2);
  }

  /**
   * Get the module configuration
   */
  async getModule<T = Record<string, any>>(moduleName: string): Promise<T | null> {
    return this.kvStore.getModuleConfig<T>(moduleName);
  }

  /**
   * Check if the cached configuration is still valid
   */
  private isCacheValid(): boolean {
    return !!this.cachedConfig && Date.now() < this.cacheExpiration;
  }

  /**
   * Invalidate the configuration cache
   */
  private invalidateCache(): void {
    this.cachedConfig = null;
    this.cachedImageConfig = null;
    this.cacheExpiration = 0;
    this.logger.debug('Configuration cache invalidated');
  }
}