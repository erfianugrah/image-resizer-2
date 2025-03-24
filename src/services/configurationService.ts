/**
 * Configuration service implementation for centralized configuration management
 */

import { ImageResizerConfig, defaultConfig, getConfig } from '../config';
import { ConfigurationService } from './interfaces';
import { Logger } from '../utils/logging';
import { Env } from '../types';

/**
 * Default implementation of the configuration service
 */
export class DefaultConfigurationService implements ConfigurationService {
  private config: ImageResizerConfig;
  private readonly logger: Logger;
  private readonly env: Env;
  private readonly environmentConfigs: Record<string, Partial<ImageResizerConfig>>;

  /**
   * Create a new configuration service
   * 
   * @param logger Logger instance
   * @param env Environment variables
   */
  constructor(logger: Logger, env: Env) {
    this.logger = logger;
    this.env = env;
    this.config = getConfig(env);
    
    // Store environment-specific configurations for later access
    this.environmentConfigs = {
      development: {},
      staging: {},
      production: {}
    };
    
    this.logger.debug('Configuration service initialized', {
      environment: this.config.environment,
      configSections: Object.keys(this.config),
      featureFlags: this.config.features || {}
    });
  }

  /**
   * Get the complete configuration
   * 
   * @returns Complete configuration object
   */
  getConfig(): ImageResizerConfig {
    return this.config;
  }

  /**
   * Get a specific configuration section
   * 
   * @param section Name of the configuration section to retrieve
   * @returns Configuration section
   */
  getSection<K extends keyof ImageResizerConfig>(section: K): ImageResizerConfig[K] {
    return this.config[section];
  }

  /**
   * Get a specific configuration value using dot notation
   * 
   * @param path Dot notation path to the configuration value
   * @param defaultValue Default value if path doesn't exist
   * @returns Configuration value at the specified path
   */
  getValue<T>(path: string, defaultValue?: T): T {
    const parts = path.split('.');
    let current: any = this.config;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue as T;
      }
      current = current[part];
    }
    
    return (current === undefined || current === null) ? (defaultValue as T) : current;
  }

  /**
   * Merge additional configuration with the current configuration
   * 
   * @param additionalConfig Additional configuration to merge
   * @returns Updated configuration
   */
  mergeConfig(additionalConfig: Partial<ImageResizerConfig>): ImageResizerConfig {
    this.config = this.deepMerge(this.config, additionalConfig);
    
    this.logger.debug('Configuration updated with additional settings', {
      updatedSections: Object.keys(additionalConfig)
    });
    
    return this.config;
  }

  /**
   * Get environment-specific configuration
   * 
   * @param environment Target environment
   * @returns Environment-specific configuration
   */
  getEnvironmentConfig(environment: 'development' | 'staging' | 'production'): Partial<ImageResizerConfig> {
    // Clone the environment config to avoid side effects
    return this.deepClone(this.environmentConfigs[environment] || {});
  }

  /**
   * Check if a feature flag is enabled
   * 
   * @param featureName Name of the feature flag
   * @returns True if the feature is enabled
   */
  isFeatureEnabled(featureName: string): boolean {
    if (!this.config.features) {
      return false;
    }
    
    const featureFlag = (this.config.features as Record<string, boolean>)[featureName];
    return featureFlag === true;
  }

  /**
   * Deep merge utility for configuration objects
   * 
   * @param target Target object
   * @param source Source object to merge in
   * @returns Merged object
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      Object.keys(source).forEach(key => {
        const sourceValue = source[key as keyof typeof source];
        const targetValue = target[key as keyof typeof target];
        
        if (
          sourceValue && 
          typeof sourceValue === 'object' && 
          !Array.isArray(sourceValue) &&
          targetValue && 
          typeof targetValue === 'object' && 
          !Array.isArray(targetValue)
        ) {
          // If both values are objects, recursively merge them
          result[key as keyof typeof result] = this.deepMerge(
            targetValue, 
            sourceValue as any
          ) as any;
        } else {
          // Otherwise just override the target value
          result[key as keyof typeof result] = sourceValue as any;
        }
      });
    }
    
    return result;
  }

  /**
   * Deep clone an object
   * 
   * @param obj Object to clone
   * @returns Cloned object
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }
    
    const result = {} as T;
    
    Object.keys(obj as object).forEach(key => {
      const value = (obj as any)[key];
      (result as any)[key] = this.deepClone(value);
    });
    
    return result;
  }

  /**
   * Reload configuration from environment variables
   * 
   * @returns Updated configuration
   */
  reloadConfig(): ImageResizerConfig {
    this.config = getConfig(this.env);
    
    this.logger.debug('Configuration reloaded from environment', {
      environment: this.config.environment
    });
    
    return this.config;
  }

  /**
   * Get the default configuration
   * 
   * @returns Default configuration
   */
  getDefaultConfig(): ImageResizerConfig {
    return this.deepClone(defaultConfig);
  }
}