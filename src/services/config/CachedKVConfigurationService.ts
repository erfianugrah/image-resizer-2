/**
 * Cached KV Configuration Service
 * 
 * This service bridges the gap between synchronous and asynchronous configuration access
 * by providing a compatibility layer that maintains the synchronous ConfigurationService
 * interface while using the KV-based configuration system under the hood.
 * 
 * It implements aggressive caching with background refresh to ensure performance while
 * still benefiting from the dynamic configuration capabilities of the KV system.
 */

import { ConfigurationService } from '../interfaces';
import { ImageResizerConfig } from '../../config';
import { Logger } from '../../utils/logging';
import { Env } from '../../types';
import { PathTransforms } from '../../utils/path';
import { ConfigurationApiService } from './interfaces';
import { ExecutionContext } from '@cloudflare/workers-types';
import { getConfigFromEnvironment } from '../../config';
import { KVCacheConfig } from '../cache/kv/KVTransformCacheInterface';

// Extended interfaces to add the fields needed for KV configuration
interface ExtendedImageResizerConfig extends ImageResizerConfig {
  features: {
    enableAkamaiCompatibility?: boolean;
    enableAkamaiAdvancedFeatures?: boolean;
    forceTransformCache?: boolean;
  };
  cache: {
    method: 'cf' | 'cache-api' | 'none';
    ttl: {
      ok: number;
      clientError: number;
      serverError: number;
      remoteFetch?: number;
      r2Headers?: number;
    };
    cacheability: boolean;
    transformCache?: ExtendedTransformCacheConfig;
    bypassPaths?: string[];
    bypassFormats?: string[];
    bypassInDevelopment?: boolean;
    pathBasedTtl?: Record<string, number>;
    immutableContent?: {
      enabled: boolean;
      contentTypes?: string[];
      paths?: string[];
      derivatives?: string[];
    };
  };
  debug: {
    enabled: boolean;
    headers: string[];
    allowedEnvironments: string[];
    verbose: boolean;
    includePerformance: boolean;
    forceDebugHeaders?: boolean;
  };
}

// Extended transform cache config to include the force fields
interface ExtendedTransformCacheConfig {
  enabled: boolean;
  binding: string;
  prefix?: string;
  maxSize?: number;
  defaultTtl?: number;
  contentTypeTtls?: Record<string, number>;
  backgroundIndexing?: boolean;
  purgeDelay?: number;
  indexingEnabled?: boolean;
  disallowedPaths?: string[];
  memoryCacheSize?: number;
  optimizedIndexing?: boolean;
  smallPurgeThreshold?: number;
  indexUpdateFrequency?: number;
  skipIndicesForSmallFiles?: boolean;
  smallFileThreshold?: number;
  useSimpleImplementation?: boolean;
  // Added extension fields
  forceEnable?: boolean;
  allowedEnvironments?: string[];
}

/**
 * Implementation of ConfigurationService that caches KV configuration for synchronous access
 */
export class CachedKVConfigurationService implements ConfigurationService {
  private logger: Logger;
  private cachedConfig: ExtendedImageResizerConfig;
  private kvConfigService: ConfigurationApiService;
  private env: Env;
  private initialized: boolean = false;
  private configVersion: string | null = null;
  private lastRefreshTime: number = 0;
  private refreshIntervalMs: number = 30000; // 30 seconds
  private environmentConfigs: Record<string, Partial<ExtendedImageResizerConfig>> = {
    development: {},
    staging: {},
    production: {}
  };

  /**
   * Create a new CachedKVConfigurationService
   * 
   * @param kvConfigService The KV configuration service to use for updates
   * @param logger Logger for service operations
   * @param env Environment variables
   * @param options Optional configuration options
   */
  constructor(
    kvConfigService: ConfigurationApiService, 
    logger: Logger, 
    env: Env,
    options?: {
      refreshIntervalMs?: number;
    }
  ) {
    this.logger = logger;
    this.kvConfigService = kvConfigService;
    this.env = env;
    
    // Set refresh interval if provided
    if (options?.refreshIntervalMs) {
      this.refreshIntervalMs = options.refreshIntervalMs;
    }
    
    // Initialize with static config from environment as fallback
    const baseConfig = getConfigFromEnvironment(env);
    
    // Convert to our extended type with required fields
    const extendedConfig: ExtendedImageResizerConfig = {
      ...baseConfig,
      // Ensure required objects exist
      features: {
        ...baseConfig.features,
        enableAkamaiCompatibility: baseConfig.features?.enableAkamaiCompatibility || false,
        enableAkamaiAdvancedFeatures: baseConfig.features?.enableAkamaiAdvancedFeatures || false,
        forceTransformCache: false
      },
      cache: {
        ...baseConfig.cache,
        method: baseConfig.cache?.method || 'cf',
        ttl: {
          ...(baseConfig.cache?.ttl || {}),
          ok: baseConfig.cache?.ttl?.ok || 86400, // 1 day
          clientError: baseConfig.cache?.ttl?.clientError || 60,
          serverError: baseConfig.cache?.ttl?.serverError || 10
        },
        cacheability: baseConfig.cache?.cacheability !== false,
        bypassPaths: baseConfig.cache?.bypassPaths || [],
        bypassFormats: baseConfig.cache?.bypassFormats || [],
        bypassInDevelopment: baseConfig.cache?.bypassInDevelopment || false,
        transformCache: {
          enabled: false,
          binding: 'IMAGE_TRANSFORMATIONS_CACHE',
          prefix: 'transform',
          maxSize: 26214400, // 25MB
          defaultTtl: 86400, // 1 day
          contentTypeTtls: {},
          backgroundIndexing: true,
          purgeDelay: 500,
          disallowedPaths: [],
          memoryCacheSize: 200,
          forceEnable: false,
          allowedEnvironments: []
        }
      },
      debug: {
        ...baseConfig.debug,
        enabled: baseConfig.debug?.enabled || false,
        headers: baseConfig.debug?.headers || [],
        allowedEnvironments: baseConfig.debug?.allowedEnvironments || [],
        verbose: baseConfig.debug?.verbose || false,
        includePerformance: baseConfig.debug?.includePerformance || false,
        forceDebugHeaders: baseConfig.debug?.forceDebugHeaders || false
      }
    };
    
    // Assign to class property
    this.cachedConfig = extendedConfig;
    
    // Load environment-specific configurations
    this.loadEnvironmentConfigs();
    
    this.logger.debug('CachedKVConfigurationService initialized with fallback config', {
      environment: this.cachedConfig.environment,
      configSections: Object.keys(this.cachedConfig),
      refreshInterval: this.refreshIntervalMs
    });
  }
  
  /**
   * Get the complete configuration - this is the synchronous method expected by consumers
   * This method applies force flags for features like transform cache before returning
   * 
   * @returns Complete configuration object from cache with force flags applied
   */
  getConfig(): ImageResizerConfig {
    if (!this.initialized) {
      this.logger.debug('Configuration accessed before full initialization, using fallback');
    }
    
    // Apply force flags to ensure features are enabled in production
    const config = this.applyForceFlags(this.cachedConfig);
    return config;
  }
  
  /**
   * Apply force flags to the configuration to ensure certain features are enabled
   * regardless of environment-specific settings
   * 
   * @param config The configuration to modify
   * @returns Configuration with force flags applied
   */
  private applyForceFlags(config: ExtendedImageResizerConfig): ExtendedImageResizerConfig {
    // Create a deep copy to avoid modifying the original
    const modifiedConfig = { ...config };
    
    // Ensure all required objects exist
    if (!modifiedConfig.features) {
      modifiedConfig.features = {
        enableAkamaiCompatibility: false,
        enableAkamaiAdvancedFeatures: false,
        forceTransformCache: false
      };
    }
    
    if (!modifiedConfig.cache) {
      modifiedConfig.cache = {
        method: 'cf',
        ttl: { ok: 86400, clientError: 60, serverError: 10 },
        cacheability: true
      };
    }
    
    if (!modifiedConfig.cache.transformCache) {
      modifiedConfig.cache.transformCache = {
        enabled: false,
        binding: 'IMAGE_TRANSFORMATIONS_CACHE',
        prefix: 'transform',
        maxSize: 26214400, // 25MB
        defaultTtl: 86400, // 1 day
        contentTypeTtls: {},
        backgroundIndexing: true,
        purgeDelay: 500,
        disallowedPaths: [],
        memoryCacheSize: 200,
        forceEnable: false,
        allowedEnvironments: []
      };
    }
    
    if (!modifiedConfig.debug) {
      modifiedConfig.debug = {
        enabled: false,
        headers: [],
        allowedEnvironments: [],
        verbose: false,
        includePerformance: false
      };
    }
    
    // Transform Cache forcing
    const forceTransformCache = modifiedConfig.features.forceTransformCache || false;
    if (forceTransformCache) {
      this.logger.debug('Force enabling transform cache due to forceTransformCache flag');
            
      // Force enable the transform cache
      if (modifiedConfig.cache.transformCache) {
        modifiedConfig.cache.transformCache.enabled = true;
        modifiedConfig.cache.transformCache.forceEnable = true;
        
        // Push current environment to allowed environments if not already included
        if (!modifiedConfig.cache.transformCache.allowedEnvironments) {
          modifiedConfig.cache.transformCache.allowedEnvironments = [];
        }
        
        if (!modifiedConfig.cache.transformCache.allowedEnvironments.includes(config.environment)) {
          modifiedConfig.cache.transformCache.allowedEnvironments.push(config.environment);
        }
      }
    }
    
    // Debug Headers forcing
    const forceDebugHeaders = modifiedConfig.debug.forceDebugHeaders || false;
    if (forceDebugHeaders) {
      this.logger.debug('Force enabling debug headers due to forceDebugHeaders flag');
            
      // Force enable debug headers
      modifiedConfig.debug.enabled = true;
      modifiedConfig.debug.forceDebugHeaders = true;
      
      // Push current environment to allowed environments if not already included
      if (!modifiedConfig.debug.allowedEnvironments) {
        modifiedConfig.debug.allowedEnvironments = [];
      }
      
      if (!modifiedConfig.debug.allowedEnvironments.includes(config.environment)) {
        modifiedConfig.debug.allowedEnvironments.push(config.environment);
      }
    }
    
    return modifiedConfig;
  }

  /**
   * Get a specific configuration section
   * 
   * @param section Name of the configuration section to retrieve
   * @returns Configuration section with force flags applied
   */
  getSection<K extends keyof ImageResizerConfig>(section: K): ImageResizerConfig[K] {
    // Apply force flags to ensure features are enabled before returning a section
    const config = this.applyForceFlags(this.cachedConfig);
    return config[section];
  }

  /**
   * Get a specific configuration value using dot notation
   * 
   * @param path Dot notation path to the configuration value
   * @param defaultValue Default value if path doesn't exist
   * @returns Configuration value at the specified path
   */
  getValue<T>(path: string, defaultValue?: T): T {
    if (!path) {
      this.logger.warn('Empty path provided to getValue', { defaultValueUsed: true });
      return defaultValue as T;
    }
    
    const parts = path.split('.');
    let current: unknown = this.cachedConfig;
    
    for (const part of parts) {
      if (current === undefined || current === null || typeof current !== 'object') {
        this.logger.debug('Path traversal failed', { 
          path, 
          failedAt: part, 
          defaultValueUsed: true 
        });
        return defaultValue as T;
      }
      
      // Type-safe access to object properties
      current = (current as Record<string, unknown>)[part];
    }
    
    if (current === undefined || current === null) {
      this.logger.debug('Path resolved to undefined/null', { 
        path, 
        defaultValueUsed: true 
      });
      return defaultValue as T;
    }
    
    return current as T;
  }

  /**
   * Merge additional configuration with the current configuration
   * 
   * @param additionalConfig Additional configuration to merge
   * @returns Updated configuration
   */
  mergeConfig(additionalConfig: Partial<ImageResizerConfig>): ImageResizerConfig {
    // Convert to Record<string, unknown> to use our type-safe mergeConfigs
    const additionalConfigRecord = additionalConfig as Record<string, unknown>;
    
    // Use our safer merge function
    this.cachedConfig = this.mergeConfigs(this.cachedConfig, additionalConfigRecord);
    
    this.logger.debug('Configuration updated with additional settings', {
      updatedSections: Object.keys(additionalConfig)
    });
    
    return this.cachedConfig;
  }

  /**
   * Get environment-specific configuration
   * 
   * @param environment Target environment
   * @returns Environment-specific configuration
   */
  getEnvironmentConfig(environment: 'development' | 'staging' | 'production'): Partial<ImageResizerConfig> {
    return this.deepClone(this.environmentConfigs[environment] || {});
  }

  /**
   * Check if a feature flag is enabled
   * 
   * @param featureName Name of the feature flag
   * @returns True if the feature is enabled
   */
  isFeatureEnabled(featureName: string): boolean {
    if (!this.cachedConfig.features) {
      return false;
    }
    
    const featureFlag = (this.cachedConfig.features as Record<string, boolean>)[featureName];
    return featureFlag === true;
  }

  /**
   * Get the default configuration
   * 
   * @returns Default configuration
   */
  getDefaultConfig(): ImageResizerConfig {
    return this.deepClone(this.cachedConfig);
  }

  /**
   * Reload configuration - this will force an immediate refresh from KV
   * 
   * @returns Updated configuration
   */
  reloadConfig(): ImageResizerConfig {
    // Trigger a refresh but don't wait for it
    this.refreshConfigFromKV();
    
    // Return the current cached config immediately
    return this.cachedConfig;
  }

  /**
   * Get the path transformations for a specific origin type
   * 
   * @param originType The origin type (r2, remote, fallback)
   * @returns Path transformations for the specified origin
   */
  getPathTransforms(originType: 'r2' | 'remote' | 'fallback'): PathTransforms {
    const pathTransforms = this.cachedConfig.pathTransforms || {};
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
  getDerivative(derivativeName: string): Record<string, any> | null {
    if (!this.cachedConfig.derivatives) {
      return null;
    }
    
    return this.cachedConfig.derivatives[derivativeName] || null;
  }

  /**
   * Get all available derivative names
   * 
   * @returns Array of derivative names
   */
  getDerivativeNames(): string[] {
    if (!this.cachedConfig.derivatives) {
      return [];
    }
    
    return Object.keys(this.cachedConfig.derivatives);
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
    const immutableSettings = this.cachedConfig.cache?.immutableContent;
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
    const bypassPaths = this.cachedConfig.cache?.bypassPaths;
    if (bypassPaths && bypassPaths.length > 0) {
      if (this.matchesPathPattern(path, bypassPaths)) {
        return true;
      }
    }
    
    // Check bypass formats
    const bypassFormats = this.cachedConfig.cache?.bypassFormats;
    if (format && bypassFormats && bypassFormats.length > 0) {
      if (bypassFormats.includes(format)) {
        return true;
      }
    }
    
    // Check if we should bypass in development environment
    if (this.cachedConfig.environment === 'development' && this.cachedConfig.cache?.bypassInDevelopment) {
      return true;
    }
    
    return false;
  }

  /**
   * Get appropriate TTL for a path based on path-based TTL configuration
   * 
   * @param path Path to get TTL for
   * @returns TTL value in seconds, or undefined if no match
   */
  getPathBasedTtl(path: string): number | undefined {
    const pathBasedTtl = this.cachedConfig.cache?.pathBasedTtl;
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
   * Initialize the service - load configuration from KV
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    try {
      await this.refreshConfigFromKV();
      
      // Apply an emergency patch to make sure transformCache is enabled 
      // This is a critical fix that ensures transform cache works in all environments,
      // regardless of what's in the KV config
      const emergencyConfig = {
        features: {
          forceTransformCache: true
        },
        cache: {
          transformCache: {
            enabled: true,
            binding: 'IMAGE_TRANSFORMATIONS_CACHE',
            forceEnable: true,
            allowedEnvironments: [this.cachedConfig.environment]
          }
        }
      };
      
      // Apply emergency config
      this.cachedConfig = this.mergeConfigs(this.cachedConfig, emergencyConfig);
      
      this.initialized = true;
      
      this.logger.info('CachedKVConfigurationService fully initialized', {
        configVersion: this.configVersion,
        environment: this.cachedConfig.environment,
        transformCacheEnabled: this.cachedConfig.cache.transformCache?.enabled,
        transformCacheForceEnabled: this.cachedConfig.cache.transformCache?.forceEnable,
        transformCacheAllowedEnvironments: this.cachedConfig.cache.transformCache?.allowedEnvironments
      });
    } catch (error) {
      // Log the error but don't fail - we'll continue with the fallback config
      this.logger.error('Failed to initialize KV configuration', {
        error: error instanceof Error ? error.message : String(error),
        continuingWithFallback: true
      });
      
      // Create emergency config with enabled transform cache
      const emergencyConfig = {
        features: {
          forceTransformCache: true
        },
        cache: {
          method: 'cf',
          ttl: { ok: 86400, clientError: 60, serverError: 10 },
          cacheability: true,
          transformCache: {
            enabled: true,
            binding: 'IMAGE_TRANSFORMATIONS_CACHE',
            forceEnable: true,
            prefix: 'transform',
            maxSize: 26214400, // 25MB
            defaultTtl: 86400, // 1 day
            backgroundIndexing: true,
            allowedEnvironments: [this.cachedConfig.environment]
          }
        }
      };
      
      // Apply emergency config
      this.cachedConfig = this.mergeConfigs(this.cachedConfig, emergencyConfig);
      
      // Still mark as initialized to avoid repeated attempts
      this.initialized = true;
    }
  }

  /**
   * Set up automatic background refresh of configuration
   * 
   * @param ctx Execution context for background work
   */
  setupBackgroundRefresh(ctx: ExecutionContext): void {
    // Use waitUntil to schedule the background refresh
    ctx.waitUntil(this.backgroundRefreshLoop());
  }

  /**
   * Background loop to periodically refresh configuration
   * 
   * This method runs indefinitely in a waitUntil context, periodically refreshing
   * the configuration from KV storage. It includes error handling, backoff logic, 
   * and automatic recovery.
   * 
   * @returns Promise that resolves when the background loop exits (should never happen)
   */
  private async backgroundRefreshLoop(): Promise<void> {
    // Track consecutive failures for backoff
    let consecutiveFailures = 0;
    const maxBackoffMs = 300000; // 5 minutes
    
    try {
      // Initial jitter to stagger refresh across multiple instances
      const initialJitter = Math.floor(Math.random() * 1000); // 0-1000ms
      await new Promise(resolve => setTimeout(resolve, initialJitter));
      
      // Loop indefinitely
      while (true) {
        try {
          // Calculate the wait interval with exponential backoff
          let waitInterval = this.refreshIntervalMs;
          if (consecutiveFailures > 0) {
            // Apply exponential backoff with jitter for failures
            // Formula: baseInterval * (2^failures) + random jitter
            const backoffFactor = Math.min(Math.pow(2, consecutiveFailures), maxBackoffMs / this.refreshIntervalMs);
            const jitter = Math.floor(Math.random() * 1000); // 0-1000ms jitter
            waitInterval = Math.min(this.refreshIntervalMs * backoffFactor + jitter, maxBackoffMs);
            
            this.logger.debug('Using exponential backoff for refresh', {
              consecutiveFailures,
              baseInterval: this.refreshIntervalMs,
              backoffInterval: waitInterval,
              maxBackoffMs
            });
          }
          
          // Wait for the refresh interval
          await new Promise(resolve => setTimeout(resolve, waitInterval));
          
          // Check if we're due for a refresh (handles case where waitUntil executes early)
          const now = Date.now();
          const timeSinceLastRefresh = now - this.lastRefreshTime;
          
          if (timeSinceLastRefresh >= this.refreshIntervalMs || consecutiveFailures > 0) {
            // Time for a refresh or retrying after failure
            this.logger.debug('Performing background refresh', {
              timeSinceLastRefresh,
              isRetry: consecutiveFailures > 0
            });
            
            await this.refreshConfigFromKV();
            
            // Reset failure counter on success
            if (consecutiveFailures > 0) {
              this.logger.info('Background refresh recovered after failures', {
                previousFailures: consecutiveFailures
              });
              consecutiveFailures = 0;
            }
          }
        } catch (error) {
          // Increment failure counter
          consecutiveFailures++;
          
          // Log with appropriate severity based on failure count
          if (consecutiveFailures > 5) {
            this.logger.error('Background configuration refresh failed repeatedly', {
              error: error instanceof Error ? error.message : String(error),
              consecutiveFailures,
              lastSuccessfulRefresh: this.lastRefreshTime > 0 ? 
                new Date(this.lastRefreshTime).toISOString() : 'never',
              nextRetryMs: Math.min(this.refreshIntervalMs * Math.pow(2, consecutiveFailures), maxBackoffMs)
            });
          } else {
            this.logger.warn('Background configuration refresh failed', {
              error: error instanceof Error ? error.message : String(error),
              consecutiveFailures,
              lastSuccessfulRefresh: this.lastRefreshTime > 0 ? 
                new Date(this.lastRefreshTime).toISOString() : 'never'
            });
          }
          
          // Continue the loop to try again with backoff
        }
      }
    } catch (error) {
      // This should only happen if there's a critical error in the loop structure itself
      this.logger.error('Background refresh loop terminated unexpectedly', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        lastRefreshTime: this.lastRefreshTime > 0 ?
          new Date(this.lastRefreshTime).toISOString() : 'never'
      });
      
      // Schedule a restart after a delay to prevent rapid restarts
      setTimeout(() => {
        this.logger.info('Attempting to restart background refresh loop');
        this.backgroundRefreshLoop().catch(e => {
          this.logger.error('Failed to restart background refresh loop', {
            error: e instanceof Error ? e.message : String(e)
          });
        });
      }, 10000); // Wait 10 seconds before attempting restart
    }
  }

  /**
   * Refresh configuration from KV
   * 
   * @returns Promise that resolves when refresh is complete
   * @throws Error if refresh fails and should be handled by caller
   */
  private async refreshConfigFromKV(): Promise<void> {
    try {
      // Get the full configuration system from KV API service
      const configSystem = await this.kvConfigService.getConfig();
      
      if (!configSystem || !configSystem.modules || !configSystem._meta) {
        throw new Error('Invalid configuration system structure received from KV');
      }
      
      // Start with our cached config
      let mergedConfig: ExtendedImageResizerConfig = { ...this.cachedConfig };
      let primaryModuleSource = '';
      
      // 1. First try to load the image-resizer module (highest priority)
      if (configSystem.modules['image-resizer'] && 
          configSystem.modules['image-resizer'].config) {
        // Use image-resizer as the primary configuration source
        const imageResizerConfig = configSystem.modules['image-resizer'].config as Record<string, unknown>;
        // Merge into our config
        mergedConfig = this.mergeConfigs(mergedConfig, imageResizerConfig);
        primaryModuleSource = 'image-resizer';
        this.logger.debug('Loaded image-resizer configuration module', {
          configSections: Object.keys(imageResizerConfig)
        });
      }
      
      // 2. Also merge core module if available (add anything not in image-resizer)
      if (configSystem.modules.core && 
          configSystem.modules.core.config) {
        // Merge core configuration 
        const coreConfig = configSystem.modules.core.config as Record<string, unknown>;
        // Merge into our config
        mergedConfig = this.mergeConfigs(mergedConfig, coreConfig);
        if (!primaryModuleSource) primaryModuleSource = 'core';
        this.logger.debug('Loaded core configuration module', {
          configSections: Object.keys(coreConfig)
        });
      }
      
      // 3. Also merge cache module if available
      if (configSystem.modules.cache && 
          configSystem.modules.cache.config) {
        // Get cache configuration
        const cacheConfig = configSystem.modules.cache.config as Record<string, unknown>;
        
        // Create a wrapper to merge properly
        const cacheWrapper = { cache: cacheConfig };
        
        // Merge into our config
        mergedConfig = this.mergeConfigs(mergedConfig, cacheWrapper);
        
        this.logger.debug('Loaded cache configuration module', {
          configSections: Object.keys(cacheConfig)
        });
      }
      
      // 4. Also merge transform module for derivatives if available
      if (configSystem.modules.transform && 
          configSystem.modules.transform.config) {
        // Get transform configuration
        const transformConfig = configSystem.modules.transform.config as Record<string, unknown>;
        
        // Specifically merge derivatives if present
        if (transformConfig.derivatives) {
          // Create a wrapper to merge properly
          const derivativesWrapper = { derivatives: transformConfig.derivatives };
          
          // Merge into our config
          mergedConfig = this.mergeConfigs(mergedConfig, derivativesWrapper);
          
          this.logger.debug('Loaded derivatives from transform configuration module', {
            derivativeCount: Object.keys(transformConfig.derivatives as Record<string, unknown>).length
          });
        }
      }
      
      // Validate that we have a usable configuration
      if (!primaryModuleSource) {
        this.logger.warn('No primary configuration module found in KV, using cached config', {
          availableModules: Object.keys(configSystem.modules)
        });
      }
      
      // Validate critical configuration properties
      if (!mergedConfig.environment) {
        mergedConfig = this.mergeConfigs(mergedConfig, { 
          environment: 'production' 
        });
        this.logger.warn('Configuration missing environment property, adding default', {
          configVersion: configSystem._meta.version
        });
      }
      
      // Validate and ensure storage configuration
      if (!mergedConfig.storage) {
        mergedConfig = this.mergeConfigs(mergedConfig, {
          storage: {
            priority: ['r2', 'remote', 'fallback'],
            r2: { enabled: true, bindingName: 'IMAGES_BUCKET' }
          }
        });
        this.logger.warn('Configuration missing storage section, adding defaults', {
          configVersion: configSystem._meta.version 
        });
      }
      
      // Look for force flags from all modules and apply them
      const forceTransformCache = this.findValueInModules(
        configSystem.modules, 
        ['features.forceTransformCache', 'forceTransformCache'],
        false
      ) as boolean;
      
      // Apply the force flags
      if (forceTransformCache) {
        // Create a configuration with the force flags enabled
        const forceConfig = {
          features: {
            forceTransformCache: true
          },
          cache: {
            transformCache: {
              enabled: true,
              forceEnable: true,
              allowedEnvironments: [mergedConfig.environment]
            }
          }
        };
        
        // Merge into our config
        mergedConfig = this.mergeConfigs(mergedConfig, forceConfig);
        
        this.logger.info('Force transform cache flag found in KV config, enabling transform cache', {
          configVersion: configSystem._meta.version
        });
      }
      
      // Always ensure critical properties exist
      const defaultsConfig = {
        features: {
          enableAkamaiCompatibility: false,
          enableAkamaiAdvancedFeatures: false,
          forceTransformCache: forceTransformCache
        },
        cache: {
          method: 'cf',
          ttl: {
            ok: 86400,
            clientError: 60,
            serverError: 10
          },
          cacheability: true,
          transformCache: {
            enabled: forceTransformCache || false,
            binding: 'IMAGE_TRANSFORMATIONS_CACHE',
            prefix: 'transform',
            defaultTtl: 86400,
            maxSize: 26214400,
            backgroundIndexing: true,
            forceEnable: forceTransformCache || false,
            allowedEnvironments: [mergedConfig.environment]
          }
        },
        debug: {
          enabled: false,
          headers: [],
          allowedEnvironments: [],
          verbose: false,
          includePerformance: false
        }
      };
      
      // Apply all defaults
      mergedConfig = this.mergeConfigs(mergedConfig, defaultsConfig);
      
      // Update cached config with our properly typed config
      this.cachedConfig = mergedConfig;
      
      // Update configVersion and lastRefreshTime
      this.configVersion = configSystem._meta.version;
      this.lastRefreshTime = Date.now();
      
      this.logger.info('Configuration refreshed from KV', {
        configVersion: this.configVersion,
        environment: this.cachedConfig.environment,
        primaryModuleSource,
        modules: Object.keys(configSystem.modules),
        configSections: Object.keys(this.cachedConfig),
        cacheEnabled: this.cachedConfig.cache && !!this.cachedConfig.cache.transformCache?.enabled,
        forceEnable: this.cachedConfig.cache && !!this.cachedConfig.cache.transformCache?.forceEnable,
        forceTransformCache: forceTransformCache
      });
    } catch (error) {
      // Improved error logging with context
      this.logger.error('Failed to refresh configuration from KV', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        lastSuccessfulRefresh: this.lastRefreshTime > 0 ? 
          new Date(this.lastRefreshTime).toISOString() : 'never',
        configVersion: this.configVersion || 'none'
      });
      
      // Re-throw to allow caller to handle
      throw error;
    }
  }
  
  /**
   * Find a specific value in any of the provided configuration modules
   * 
   * @param modules The modules to search
   * @param paths Array of possible paths to look for (first match wins)
   * @param defaultValue Default value if not found
   * @returns The found value or the default
   */
  private findValueInModules(
    modules: Record<string, { config: Record<string, unknown> }>,
    paths: string[],
    defaultValue: unknown
  ): unknown {
    // Check each module
    for (const moduleName in modules) {
      const moduleConfig = modules[moduleName].config;
      
      // Try each path
      for (const path of paths) {
        // Split path and traverse
        const parts = path.split('.');
        let current: unknown = moduleConfig;
        let found = true;
        
        for (const part of parts) {
          if (current === undefined || current === null || typeof current !== 'object') {
            found = false;
            break;
          }
          
          current = (current as Record<string, unknown>)[part];
          
          if (current === undefined) {
            found = false;
            break;
          }
        }
        
        // If we found a value, return it
        if (found && current !== undefined) {
          return current;
        }
      }
    }
    
    // Nothing found in any module
    return defaultValue;
  }
  
  /**
   * Safely merge configuration objects, handling our specialized configuration types
   * 
   * @param target The target object to return
   * @param source The source to merge from
   * @returns A new merged configuration object with the right type
   */
  private mergeConfigs(target: ExtendedImageResizerConfig, source: Record<string, unknown>): ExtendedImageResizerConfig {
    // Create a deep copy of target to avoid modifying it directly
    const result = { ...target };
    
    // Handle merging features
    if (source.features) {
      result.features = {
        ...result.features,
        ...(source.features as Record<string, unknown>),
        // Ensure our required properties exist
        enableAkamaiCompatibility: (source.features as any)?.enableAkamaiCompatibility !== undefined ? 
          (source.features as any).enableAkamaiCompatibility : 
          result.features.enableAkamaiCompatibility,
        enableAkamaiAdvancedFeatures: (source.features as any)?.enableAkamaiAdvancedFeatures !== undefined ?
          (source.features as any).enableAkamaiAdvancedFeatures :
          result.features.enableAkamaiAdvancedFeatures,
        forceTransformCache: (source.features as any)?.forceTransformCache !== undefined ?
          (source.features as any).forceTransformCache :
          result.features.forceTransformCache
      };
    }
    
    // Handle merging cache configuration
    if (source.cache) {
      const sourceCache = source.cache as Record<string, unknown>;
      
      // Create base cache object
      result.cache = {
        ...result.cache,
        ...sourceCache,
        // Ensure our required properties exist
        method: (sourceCache.method as 'cf' | 'cache-api' | 'none') || result.cache.method,
        cacheability: sourceCache.cacheability !== undefined ? 
          sourceCache.cacheability as boolean : 
          result.cache.cacheability,
      };
      
      // Handle ttl specially
      if (sourceCache.ttl) {
        result.cache.ttl = {
          ...result.cache.ttl,
          ...(sourceCache.ttl as Record<string, number>),
          // Ensure required ttl properties exist
          ok: (sourceCache.ttl as any)?.ok || result.cache.ttl.ok,
          clientError: (sourceCache.ttl as any)?.clientError || result.cache.ttl.clientError,
          serverError: (sourceCache.ttl as any)?.serverError || result.cache.ttl.serverError
        };
      }
      
      // Handle transformCache specially
      if (sourceCache.transformCache) {
        result.cache.transformCache = {
          ...(result.cache.transformCache || {}),
          ...(sourceCache.transformCache as Record<string, unknown>),
          // Ensure required properties exist
          enabled: (sourceCache.transformCache as any)?.enabled !== undefined ?
            (sourceCache.transformCache as any).enabled :
            (result.cache.transformCache?.enabled || false),
          binding: (sourceCache.transformCache as any)?.binding ||
            (result.cache.transformCache?.binding || 'IMAGE_TRANSFORMATIONS_CACHE')
        };
      }
    }
    
    // Handle merging debug configuration
    if (source.debug) {
      result.debug = {
        ...result.debug,
        ...(source.debug as Record<string, unknown>),
        // Ensure required properties exist
        enabled: (source.debug as any)?.enabled !== undefined ?
          (source.debug as any).enabled :
          result.debug.enabled,
        headers: (source.debug as any)?.headers || result.debug.headers,
        allowedEnvironments: (source.debug as any)?.allowedEnvironments || result.debug.allowedEnvironments,
        verbose: (source.debug as any)?.verbose !== undefined ?
          (source.debug as any).verbose :
          result.debug.verbose,
        includePerformance: (source.debug as any)?.includePerformance !== undefined ?
          (source.debug as any).includePerformance :
          result.debug.includePerformance
      };
    }
    
    // Simply copy other properties
    Object.keys(source).forEach(key => {
      if (key !== 'features' && key !== 'cache' && key !== 'debug') {
        (result as any)[key] = source[key];
      }
    });
    
    return result;
  }
  
  /**
   * Merge source into target, modifying target directly
   * This is different from deepMerge which returns a new object
   * 
   * @param target The target object to modify
   * @param source The source to merge from
   */
  private deepMergeInto<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): void {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      Object.keys(source).forEach(key => {
        const sourceValue = source[key];
        const targetValue = target[key];
        
        if (
          sourceValue && 
          typeof sourceValue === 'object' && 
          !Array.isArray(sourceValue) &&
          targetValue && 
          typeof targetValue === 'object' && 
          !Array.isArray(targetValue)
        ) {
          // If both values are objects, recursively merge them
          this.deepMergeInto(
            targetValue as Record<string, unknown>, 
            sourceValue as Record<string, unknown>
          );
        } else {
          // Otherwise just override the target value
          (target as Record<string, unknown>)[key] = sourceValue;
        }
      });
    }
  }

  /**
   * Shut down the service
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    // No specific shutdown needed for this service
    return Promise.resolve();
  }
  
  /**
   * Get debug information about the KV configuration service's status
   * 
   * Useful for diagnostics and troubleshooting the KV configuration system.
   * This provides information about the current state of the configuration,
   * including initialization status, refresh stats, and module info.
   * 
   * @returns Object containing detailed debug information
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      // Service status
      initialized: this.initialized,
      configVersion: this.configVersion,
      lastRefreshTime: this.lastRefreshTime,
      lastRefreshTimeFormatted: this.lastRefreshTime > 0 ? 
        new Date(this.lastRefreshTime).toISOString() : 'never',
      refreshIntervalMs: this.refreshIntervalMs,
      
      // Module information
      environment: this.cachedConfig.environment,
      configSections: Object.keys(this.cachedConfig),
      
      // Feature flags (safe subset)
      features: this.cachedConfig.features ? 
        Object.keys(this.cachedConfig.features).reduce((acc, key) => {
          acc[key] = this.isFeatureEnabled(key);
          return acc;
        }, {} as Record<string, boolean>) : {},
      
      // Cache settings (safe subset)
      cacheSettings: {
        method: this.getValue<string>('cache.method', 'unknown'),
        ttl: {
          ok: this.getValue<number>('cache.ttl.ok', -1),
          clientError: this.getValue<number>('cache.ttl.clientError', -1),
          serverError: this.getValue<number>('cache.ttl.serverError', -1),
        },
        bypassPaths: this.getValue<string[]>('cache.bypassPaths', []).length,
        bypassInDevelopment: this.getValue<boolean>('cache.bypassInDevelopment', false),
      },
      
      // Storage settings (safe subset)
      storageSettings: {
        backendCount: Object.keys(this.getValue('storage.origins', {})).length,
        fallbackEnabled: this.getValue<boolean>('storage.enableFallback', false),
        pathRewritingEnabled: Object.keys(this.getPathTransforms('remote')).length > 0,
      },
    };
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
        enableAkamaiAdvancedFeatures: true,
        forceTransformCache: true
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
        transformCache: {
          enabled: true,
          binding: 'IMAGE_TRANSFORMATIONS_CACHE',
          forceEnable: true,
          allowedEnvironments: ['development', 'staging', 'production']
        }
      }
    } as Partial<ExtendedImageResizerConfig>;
    
    // Staging environment configuration
    this.environmentConfigs.staging = {
      environment: 'staging',
      features: {
        enableAkamaiCompatibility: true,
        enableAkamaiAdvancedFeatures: true,
        forceTransformCache: true
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
        cacheability: true,
        transformCache: {
          enabled: true,
          binding: 'IMAGE_TRANSFORMATIONS_CACHE',
          forceEnable: true,
          allowedEnvironments: ['development', 'staging', 'production']
        }
      }
    } as Partial<ExtendedImageResizerConfig>;
    
    // Production environment configuration
    this.environmentConfigs.production = {
      environment: 'production',
      features: {
        enableAkamaiCompatibility: false,
        enableAkamaiAdvancedFeatures: false,
        forceTransformCache: true
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
        cacheability: true,
        transformCache: {
          enabled: true,
          binding: 'IMAGE_TRANSFORMATIONS_CACHE',
          forceEnable: true,
          allowedEnvironments: ['development', 'staging', 'production']
        }
      }
    } as Partial<ExtendedImageResizerConfig>;
  }

  /**
   * Deep merge utility for configuration objects
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
   * Check if a path matches any pattern in a list of patterns
   */
  private matchesPathPattern(path: string, patterns: string[]): boolean {
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
        .replace(/\{([^}]+)\}/g, (_, options: string) => {
          return `(${options.split(',').join('|')})`;
        });
      
      // Create regex and test path
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(normalizedPath);
    });
  }
}