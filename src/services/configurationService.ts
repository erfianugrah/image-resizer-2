/**
 * Configuration service implementation for centralized configuration management
 * 
 * This service provides centralized access to all configuration settings,
 * environment-specific overrides, and configuration utilities. It is the
 * single source of truth for application configuration.
 */

import { ImageResizerConfig, defaultConfig, getConfig } from '../config';
import { ConfigurationService } from './interfaces';
import { Logger } from '../utils/logging';
import { Env } from '../types';
import { PathTransforms } from '../utils/path';
import { loadDetectorConfigFromEnv } from '../utils/wrangler-config';

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
    this.config = this.loadConfigFromEnvironment(env);
    
    // Initialize environment-specific configurations
    this.environmentConfigs = {
      development: {},
      staging: {},
      production: {}
    };
    
    // Load environment-specific configurations
    this.loadEnvironmentConfigs();
    
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sourceValue as any
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ) as any;
        } else {
          // Otherwise just override the target value
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (obj as any)[key];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    this.config = this.loadConfigFromEnvironment(this.env);
    
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
  
  /**
   * Load configuration from environment variables
   * 
   * @param env Environment variables
   * @returns Configuration object
   */
  private loadConfigFromEnvironment(env: Env): ImageResizerConfig {
    return getConfig(env);
  }
  
  /**
   * Load environment-specific configurations
   */
  private loadEnvironmentConfigs(): void {
    // Development environment configuration
    this.environmentConfigs.development = {
      environment: 'development',
      features: {
        enableAkamaiCompatibility: true,
        enableAkamaiAdvancedFeatures: true
      },
      debug: { 
        enabled: true,
        verbose: true,
        headers: ['all'],
        allowedEnvironments: ['development', 'staging'],
        includePerformance: true,
        forceDebugHeaders: false
      },
      logging: {
        level: 'DEBUG',
        includeTimestamp: true,
        enableStructuredLogs: true,
        enableBreadcrumbs: true
      },
      cache: {
        method: 'cf',
        ttl: {
          ok: 60, // Short TTL for development
          clientError: 10,
          serverError: 5,
          remoteFetch: 60,
          r2Headers: 60
        },
        cacheability: true,
        bypassInDevelopment: true,
        enableResourceHints: false
      }
    };
    
    // Staging environment configuration
    this.environmentConfigs.staging = {
      environment: 'staging',
      features: {
        enableAkamaiCompatibility: true,
        enableAkamaiAdvancedFeatures: true
      },
      debug: { 
        enabled: true,
        verbose: true,
        headers: ['ir', 'cache', 'mode', 'strategy'],
        allowedEnvironments: ['development', 'staging'],
        includePerformance: true
      },
      logging: {
        level: 'INFO',
        includeTimestamp: true,
        enableStructuredLogs: true,
        enableBreadcrumbs: true
      },
      cache: {
        method: 'cache-api',
        ttl: {
          ok: 3600, // 1 hour
          clientError: 30,
          serverError: 5,
          remoteFetch: 1800, // 30 minutes
          r2Headers: 3600 // 1 hour
        },
        cacheability: true
      }
    };
    
    // Production environment configuration
    this.environmentConfigs.production = {
      environment: 'production',
      features: {
        enableAkamaiCompatibility: false,
        enableAkamaiAdvancedFeatures: false
      },
      debug: { 
        enabled: false,
        verbose: false,
        allowedEnvironments: [],
        headers: ['cache', 'mode'],
        includePerformance: false
      },
      logging: {
        level: 'INFO',
        includeTimestamp: true,
        enableStructuredLogs: true,
        enableBreadcrumbs: true
      },
      cache: {
        method: 'cf',
        ttl: {
          ok: 604800, // 1 week
          clientError: 60,
          serverError: 10,
          remoteFetch: 86400, // 1 day
          r2Headers: 604800 // 1 week
        },
        cacheability: true
      }
    };
  }
  
  /**
   * Get the path transformations for a specific origin type
   * 
   * @param originType The origin type (r2, remote, fallback)
   * @returns Path transformations for the specified origin
   */
  getPathTransforms(originType: 'r2' | 'remote' | 'fallback'): PathTransforms {
    const pathTransforms = this.config.pathTransforms || {};
    const result: PathTransforms = {};
    
    // Copy global transforms first
    Object.entries(pathTransforms).forEach(([key, value]) => {
      if (typeof value === 'object') {
        // Check if this transform has origin-specific settings
        if (value[originType]) {
          // Use origin-specific transform
          result[key] = { ...value, ...value[originType] };
        } else {
          // Use global transform
          result[key] = { ...value };
        }
      }
    });
    
    return result;
  }
  
  /**
   * Get derivative configuration by name
   * 
   * @param derivativeName Name of the derivative
   * @returns Derivative configuration or null if not found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDerivative(derivativeName: string): Record<string, any> | null {
    if (!this.config.derivatives) {
      return null;
    }
    
    return this.config.derivatives[derivativeName] || null;
  }
  
  /**
   * Get all available derivative names
   * 
   * @returns Array of derivative names
   */
  getDerivativeNames(): string[] {
    if (!this.config.derivatives) {
      return [];
    }
    
    return Object.keys(this.config.derivatives);
  }
  
  /**
   * Parse derivatives from environment variables
   * 
   * @param env Environment variables
   * @returns Map of derivative names to configurations
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseDerivativesFromEnv(env: Env): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const derivatives: Record<string, any> = {};
    const derivativePrefix = 'DERIVATIVE_';
    
    // Safe way to check keys without triggering TypeScript errors
    const envKeys = Object.keys(env as Record<string, unknown>);
    
    envKeys.forEach(key => {
      // First check if key exists and then check type
      const value = (env as Record<string, unknown>)[key];
      if (key.startsWith(derivativePrefix) && typeof value === 'string') {
        try {
          // Convert DERIVATIVE_VIDEO_HIGH to video-high
          const derivativeName = key.substring(derivativePrefix.length)
            .toLowerCase()
            .replace(/_/g, '-');
          
          // Parse the derivative configuration
          const derivativeConfig = JSON.parse(value as string);
          
          // Add to the derivatives object
          derivatives[derivativeName] = derivativeConfig;
          
          this.logger.debug(`Added derivative from environment: ${derivativeName}`, {
            options: Object.keys(derivativeConfig).join(', ')
          });
        } catch (e) {
          this.logger.error(`Error parsing derivative configuration: ${key}`, {
            error: e instanceof Error ? e.message : String(e),
            value: value
          });
        }
      }
    });
    
    return derivatives;
  }
  
  /**
   * Load detector configuration from environment variables
   * 
   * @param env Environment variables
   * @returns Detector configuration
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadDetectorConfigFromEnv(env: Env): Record<string, any> {
    return loadDetectorConfigFromEnv(env);
  }
  
  /**
   * Check if a path matches any pattern in a list of patterns
   * 
   * @param path Path to check
   * @param patterns Array of glob-like patterns to match against
   * @returns True if path matches any pattern
   */
  matchesPathPattern(path: string, patterns: string[]): boolean {
    if (!patterns || !patterns.length) {
      return false;
    }
    
    // Normalize path to handle different formats
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    return patterns.some(pattern => {
      // Convert glob-like pattern to regex pattern
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\{([^}]+)\}/g, (_, options) => {
          return `(${options.split(',').join('|')})`;
        });
      
      // Create regex and test path
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(normalizedPath);
    });
  }
  
  /**
   * Get appropriate TTL for a path based on path-based TTL configuration
   * 
   * @param path Path to get TTL for
   * @returns TTL value in seconds, or undefined if no match
   */
  getPathBasedTtl(path: string): number | undefined {
    const pathBasedTtl = this.config.cache?.pathBasedTtl;
    if (!pathBasedTtl) {
      return undefined;
    }
    
    for (const [pattern, ttl] of Object.entries(pathBasedTtl)) {
      if (this.matchesPathPattern(path, [pattern])) {
        return ttl;
      }
    }
    
    return undefined;
  }
  
  /**
   * Check if a path should be considered immutable content
   * 
   * @param path Path to check
   * @param contentType Optional content type for additional checking
   * @param derivative Optional derivative name for additional checking
   * @returns True if the content should be considered immutable
   */
  isImmutableContent(path: string, contentType?: string, derivative?: string): boolean {
    const immutableSettings = this.config.cache?.immutableContent;
    if (!immutableSettings || !immutableSettings.enabled) {
      return false;
    }
    
    // Check path patterns
    if (immutableSettings.paths && immutableSettings.paths.length > 0) {
      if (this.matchesPathPattern(path, immutableSettings.paths)) {
        return true;
      }
    }
    
    // Check content type
    if (contentType && immutableSettings.contentTypes && immutableSettings.contentTypes.length > 0) {
      if (immutableSettings.contentTypes.some(type => contentType.includes(type))) {
        return true;
      }
    }
    
    // Check derivative
    if (derivative && immutableSettings.derivatives && immutableSettings.derivatives.length > 0) {
      if (immutableSettings.derivatives.includes(derivative)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if caching should be bypassed for a particular path
   * 
   * @param path Path to check
   * @param format Optional image format for format-based bypass
   * @returns True if cache should be bypassed
   */
  shouldBypassForPath(path: string, format?: string): boolean {
    // Check bypass paths
    const bypassPaths = this.config.cache?.bypassPaths;
    if (bypassPaths && bypassPaths.length > 0) {
      if (this.matchesPathPattern(path, bypassPaths)) {
        return true;
      }
    }
    
    // Check bypass formats
    const bypassFormats = this.config.cache?.bypassFormats;
    if (format && bypassFormats && bypassFormats.length > 0) {
      if (bypassFormats.includes(format)) {
        return true;
      }
    }
    
    // Check if we should bypass in development environment
    if (this.config.environment === 'development' && this.config.cache?.bypassInDevelopment) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Initialize the service
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // Current implementation doesn't require async initialization
    // but the method is included for future use and to implement
    // the service lifecycle pattern
    return Promise.resolve();
  }
  
  /**
   * Shut down the service
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    // Current implementation doesn't require async shutdown
    // but the method is included for future use and to implement
    // the service lifecycle pattern
    return Promise.resolve();
  }
}