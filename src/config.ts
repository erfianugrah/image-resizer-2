/**
 * Configuration management for the image resizer worker
 * 
 * This module provides a simple, unified configuration system with sensible defaults
 * that pulls from KV as the single source of truth. This is a new implementation
 * that replaces the old static configuration with a dynamic KV-based approach.
 */

import { PathTransforms } from './utils/path';
import { Env } from './types';
import { loadDetectorConfigFromEnv } from './utils/wrangler-config';
// Import from pino-compat to ensure we're using Pino logging
import { createCompatiblePinoLogger } from './utils/pino-compat';
import { KVConfigStore } from './services/config/KVConfigStore';
import { KVConfigurationService } from './services/config/KVConfigurationService';
import { imageResizerConfigSchema } from './schemas/configSchema';

// Re-export the interface for ImageResizerConfig from the schema
export type { ImageResizerConfig } from './schemas/configSchema';
import type { ImageResizerConfig } from './schemas/configSchema';

// Error thrown when config is not initialized
export class ConfigNotInitializedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigNotInitializedError';
  }
}

// Singleton instance of the KV configuration service
let configurationService: KVConfigurationService | null = null;

// Create a minimal configuration for Pino
const minimalConfig = {
  logging: {
    level: 'INFO' as const,
    includeTimestamp: true,
    enableStructuredLogs: true,
    usePino: true
  },
  environment: 'development' as const,
  version: '1.0.0',
  cache: {
    method: 'none' as const,
    ttl: { ok: 0, clientError: 0, serverError: 0 },
    cacheability: false
  },
  debug: {
    enabled: true,
    headers: ['debug'],
    allowedEnvironments: ['development'],
    verbose: true,
    includePerformance: true
  },
  responsive: {
    breakpoints: [320, 640, 768, 1024, 1440, 1920],
    deviceWidths: { mobile: 0, tablet: 0, desktop: 0 },
    quality: 80,
    format: 'auto',
    fit: 'scale-down' as const,
    metadata: 'none' as const
  },
  storage: {
    priority: ['remote'] as ('r2' | 'remote' | 'fallback')[],
    r2: {
      enabled: false,
      bindingName: 'IMAGES_BUCKET'
    }
  },
  derivatives: {}
};

// Create a Pino logger for configuration operations
const defaultLogger = createCompatiblePinoLogger(minimalConfig, 'Config')

/**
 * Initialize the configuration system with KV store
 * 
 * This must be called before any configuration is accessed
 * 
 * @param env Environment variables with KV binding
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeConfig(env: Env): Promise<void> {
  try {
    // Check if KV binding exists
    if (!env.IMAGE_CONFIGURATION_STORE && !env.IMAGE_CONFIGURATION_STORE_DEV) {
      throw new Error('IMAGE_CONFIGURATION_STORE KV binding not found');
    }

    // Create the KV store - try both production and dev bindings
    const kvNamespace = env.IMAGE_CONFIGURATION_STORE || env.IMAGE_CONFIGURATION_STORE_DEV;
    
    // Ensure KV namespace is defined
    if (!kvNamespace) {
      throw new Error('No KV namespace available for configuration');
    }
    
    const kvStore = new KVConfigStore(
      kvNamespace, 
      defaultLogger
    );
    
    // Create the configuration service
    configurationService = new KVConfigurationService(kvStore, defaultLogger, env);
    
    // Test if the configuration can be retrieved
    await configurationService.getImageConfig();
    
    defaultLogger.info('Configuration initialized successfully from KV');
  } catch (error) {
    defaultLogger.error('Failed to initialize configuration from KV', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Continue with a fallback to environment configuration
    defaultLogger.warn('Using fallback configuration from environment variables');
    
    // If KV config fails, we'll leave configurationService as null and
    // rely on the fallback mechanism in getConfigAsync
    configurationService = null;
    
    // Don't throw so we can attempt to continue with fallback config
  }
}

/**
 * Get the image resizer configuration asynchronously - THIS IS THE PRIMARY
 * WAY TO ACCESS CONFIGURATION
 * 
 * @param env Environment variables
 * @returns Promise with the configuration
 */
export async function getConfigAsync(env: Env): Promise<ImageResizerConfig> {
  // If configuration service exists, use it
  if (configurationService) {
    // The service is definitely KVConfigurationService which has getImageConfig
    return (configurationService as KVConfigurationService).getImageConfig();
  }
  
  // Fallback: Try to initialize config if not done already
  try {
    await initializeConfig(env);
    
    // If initialization was successful, use the service
    if (configurationService) {
      // The service is definitely KVConfigurationService which has getImageConfig
      return (configurationService as KVConfigurationService).getImageConfig();
    }
  } catch (error) {
    defaultLogger.error('Failed to initialize config on demand', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Fall through to environment variable config
  }
  
  // Final fallback: Use environment variables directly
  defaultLogger.warn('Using fallback configuration from environment variables only');
  
  // Parse configuration from environment variables
  const config = getConfigFromEnvironment(env);
  
  try {
    // Validate the config with our schema
    return imageResizerConfigSchema.parse(config);
  } catch (error) {
    defaultLogger.error('Invalid configuration from environment', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error(`Invalid configuration from environment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get a specific configuration value asynchronously using dot notation
 * 
 * @param path Dot notation path to the value
 * @param env Environment variables
 * @param defaultValue Default value if not found
 * @returns Promise with the value
 */
export async function getValueAsync<T>(path: string, env: Env, defaultValue?: T): Promise<T> {
  // If configuration service exists, use it
  if (configurationService) {
    // The service is definitely KVConfigurationService which has getValue
    return (configurationService as KVConfigurationService).getValue<T>(path, defaultValue);
  }
  
  // Fallback: Try to initialize config if not done already
  try {
    await initializeConfig(env);
    
    // If initialization was successful, use the service
    if (configurationService) {
      // The service is definitely KVConfigurationService which has getValue
      return (configurationService as KVConfigurationService).getValue<T>(path, defaultValue);
    }
  } catch (error) {
    defaultLogger.error('Failed to initialize config on demand during getValue', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Fall through to environment variable config
  }
  
  // Get full config from environment
  const config = getConfigFromEnvironment(env);
  
  // Navigate through the path
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
 * LEGACY: Get the configuration synchronously - THIS METHOD THROWS AN ERROR
 * AND SHOULD NOT BE USED IN NEW CODE! Use getConfigAsync() instead.
 * 
 * @param env Environment variables
 * @returns Configuration
 * @throws Error when access is attempted synchronously
 */
export function getConfig(env: Env): ImageResizerConfig {
  throw new ConfigNotInitializedError(
    'Synchronous config access is not supported in KV-based config system. ' + 
    'Use getConfigAsync() instead. If you need immediate access, make sure to call ' +
    'initializeConfig() during application startup.'
  );
}

/**
 * Function to parse configuration from environment variables
 * This function is also used directly by services that need synchronous access
 * 
 * @param env Environment variables
 * @returns Configuration parsed from environment
 */
export function getConfigFromEnvironment(env: Env): ImageResizerConfig {
  // Determine environment
  const envSetting = (env.ENVIRONMENT || 'development').toLowerCase();
  
  // Cast to valid environment type
  const environment = envSetting === 'staging' ? 'staging' as const :
                    envSetting === 'production' ? 'production' as const : 'development' as const;
  
  // Create a minimal config structure
  const config: ImageResizerConfig = {
    environment,
    version: '1.0.0',
    
    // Feature flags
    features: {
      enableAkamaiCompatibility: env.ENABLE_AKAMAI_COMPATIBILITY === 'true',
      enableAkamaiAdvancedFeatures: env.ENABLE_AKAMAI_ADVANCED_FEATURES === 'true'
    },
    
    // Default debug settings
    debug: { 
      enabled: env.DEBUG === 'true',
      headers: ['cache', 'mode'],
      allowedEnvironments: environment === 'production' ? [] : ['development', 'staging'],
      verbose: environment !== 'production',
      includePerformance: environment !== 'production'
    },
    
    // Default cache settings
    cache: {
      method: (env.CACHE_METHOD || 'cf') as 'cf' | 'cache-api' | 'none',
      ttl: {
        ok: parseInt(env.CACHE_TTL_OK || '86400', 10),
        clientError: parseInt(env.CACHE_TTL_CLIENT_ERROR || '60', 10),
        serverError: parseInt(env.CACHE_TTL_SERVER_ERROR || '10', 10)
      },
      cacheability: true
    },
    
    // Default responsive settings
    responsive: {
      breakpoints: [320, 640, 768, 1024, 1440, 1920, 2048],
      deviceWidths: {
        mobile: 480,
        tablet: 768,
        desktop: 1440
      },
      quality: parseInt(env.DEFAULT_QUALITY || '85', 10),
      fit: (env.DEFAULT_FIT || 'scale-down') as 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad',
      format: 'auto',
      metadata: 'none'
    },
    
    // Default storage settings
    storage: {
      priority: ['r2', 'remote', 'fallback'],
      r2: {
        enabled: !!env.IMAGES_BUCKET,
        bindingName: 'IMAGES_BUCKET'
      }
    },
    
    // Empty derivatives object
    derivatives: {}
  };
  
  // Load detector config from environment
  const detectorConfig = loadDetectorConfigFromEnv(env);
  if (Object.keys(detectorConfig).length > 0) {
    config.detector = detectorConfig as any;
  }
  
  // Add any environment-specific settings
  if (environment === 'development') {
    // More lenient development settings...
  } else if (environment === 'production') {
    // Stricter production settings...
  }
  
  return config;
}