/**
 * Configuration Bridge
 * 
 * This module provides a bridge between the KV-based Configuration API and 
 * the legacy config.ts module, allowing for a gradual migration path.
 */

import { ConfigurationApiService } from './interfaces';
import { getConfig as getLegacyConfig, ImageResizerConfig, deepMerge } from '../../config';
import { Env } from '../../types';
import { Logger } from '../../utils/logging';

function applyStorageFlattening(config: ImageResizerConfig): ImageResizerConfig {
  if (config.storage) {
    if (config.storage.remote && config.storage.remote.url) {
      config.storage.remoteUrl = config.storage.remote.url;
    }
    if (config.storage.fallback && config.storage.fallback.url) {
      config.storage.fallbackUrl = config.storage.fallback.url;
    }
    if (config.storage.remote && config.storage.remote.auth) {
      config.storage.remoteAuth = config.storage.remote.auth;
    }
    if (config.storage.fallback && config.storage.fallback.auth) {
      config.storage.fallbackAuth = config.storage.fallback.auth;
    }
  }
  return config;
}

function validateCriticalConfig(config: ImageResizerConfig): void {
  const missing = [];

  if (!config.cache || !config.cache.ttl) {
    missing.push('cache.ttl');
  } else {
    const { ok } = config.cache.ttl;
    if (typeof ok !== 'number' || Number.isNaN(ok)) {
      missing.push('cache.ttl.ok');
    }
  }

  if (!config.storage || !Array.isArray(config.storage.priority)) {
    missing.push('storage.priority');
  }

  if (!config.responsive) {
    missing.push('responsive');
  }

  if (missing.length) {
    throw new Error(`Merged configuration missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Get configuration using the Configuration API with fallback to legacy config
 * 
 * @param configApi Configuration API service
 * @param env Environment variables
 * @param logger Logger instance
 * @returns Complete merged configuration
 */
export async function getConfigWithFallback(
  configApi: ConfigurationApiService | undefined,
  env: Env,
  logger: Logger
): Promise<ImageResizerConfig> {
  try {
    // Get legacy configuration as baseline
    const legacyConfig = getLegacyConfig(env);
    
    // If Configuration API is not available, return legacy config
    if (!configApi) {
      logger.warn('Configuration API not available, using legacy config only');
      return applyStorageFlattening(legacyConfig);
    }
    
    // Try to get KV-based config
    try {
      // Get core module config
      const coreConfig = await configApi.getModule('core');
      
      if (!coreConfig) {
        logger.warn('Core configuration module not found in KV store, using legacy config only');
        return applyStorageFlattening(legacyConfig);
      }
      
      // Get cache module config
      const cacheConfig = await configApi.getModule('cache');
      
      // Get transform module config
      const transformConfig = await configApi.getModule('transform');

      // Log the transform module config details if available
      if (transformConfig) {
        logger.debug('Transform module loaded from KV store', {
          hasDerivatives: !!transformConfig.derivatives,
          derivativesCount: transformConfig.derivatives ? Object.keys(transformConfig.derivatives).length : 0,
          derivativeNames: transformConfig.derivatives ? Object.keys(transformConfig.derivatives).join(',') : 'none',
          derivativesType: transformConfig.derivatives ? typeof transformConfig.derivatives : 'undefined',
          transformConfigKeys: Object.keys(transformConfig).join(',')
        });
        
        // Validate the derivatives structure if it exists
        if (transformConfig.derivatives) {
          try {
            const sampleDerivative = Object.keys(transformConfig.derivatives)[0];
            if (sampleDerivative) {
              const template = transformConfig.derivatives[sampleDerivative];
              logger.debug('Sample derivative structure validation', {
                derivative: sampleDerivative,
                isObject: typeof template === 'object' && template !== null,
                properties: template ? Object.keys(template).join(',') : 'none',
                valid: !!template && typeof template === 'object'
              });
            }
          } catch (error) {
            logger.error('Error validating derivatives structure', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      } else {
        logger.warn('Transform module not found in KV store, using legacy config only');
      }
      
      // Get storage module config
      const storageConfig = await configApi.getModule('storage');
      
      // Merge configurations using deepMerge for proper nested object merging
      // Start with the legacy config as the base
      let mergedConfig: ImageResizerConfig = { ...legacyConfig };
      
      // Apply environment from core config
      if (coreConfig.environment) {
        mergedConfig.environment = coreConfig.environment;
      }
      
      // Properly merge debug settings using deepMerge
      if (coreConfig.debug) {
        mergedConfig.debug = deepMerge(legacyConfig.debug, coreConfig.debug);
      }
      
      // Properly merge feature flags using deepMerge
      if (coreConfig.features) {
        if (legacyConfig.features) {
          mergedConfig.features = deepMerge(legacyConfig.features, coreConfig.features);
        } else {
          mergedConfig.features = coreConfig.features;
        }
      }
      
      // Properly merge logging settings using deepMerge
      if (coreConfig.logging) {
        if (legacyConfig.logging) {
          mergedConfig.logging = deepMerge(legacyConfig.logging, coreConfig.logging);
        } else {
          mergedConfig.logging = coreConfig.logging;
        }
      }
      
      // Properly merge cache settings using deepMerge
      if (cacheConfig) {
        mergedConfig.cache = deepMerge(legacyConfig.cache, cacheConfig);
      }
      
      // Properly merge transform settings
      if (transformConfig) {
        // Merge responsive settings
        if (transformConfig.responsive) {
          mergedConfig.responsive = deepMerge(legacyConfig.responsive, transformConfig.responsive);
        }
        
        // Merge derivatives properly
        if (transformConfig.derivatives) {
          if (legacyConfig.derivatives) {
            mergedConfig.derivatives = deepMerge(legacyConfig.derivatives, transformConfig.derivatives);
          } else {
            mergedConfig.derivatives = transformConfig.derivatives;
          }
        }
        
        // Add debugging info
        if (logger) {
          mergedConfig._derivativesLoaded = true;
          mergedConfig._derivativesCount = mergedConfig.derivatives 
            ? Object.keys(mergedConfig.derivatives).length 
            : 0;
        }
      }
      
      // Normalize flat storage values from KV modules
      if (storageConfig) {
        if (storageConfig.remoteUrl) {
          storageConfig.remote = storageConfig.remote || {} as any;
          storageConfig.remote.url = storageConfig.remoteUrl;
        }
        if (storageConfig.fallbackUrl) {
          storageConfig.fallback = storageConfig.fallback || {} as any;
          storageConfig.fallback.url = storageConfig.fallbackUrl;
        }
        if (storageConfig.remoteAuth) {
          storageConfig.remote = storageConfig.remote || {} as any;
          storageConfig.remote.auth = storageConfig.remoteAuth as any;
        }
        if (storageConfig.fallbackAuth) {
          storageConfig.fallback = storageConfig.fallback || {} as any;
          storageConfig.fallback.auth = storageConfig.fallbackAuth as any;
        }
      }

      // Properly merge storage settings
      if (storageConfig) {
        // Merge storage configuration
        if (!legacyConfig.storage) {
          legacyConfig.storage = {} as any;
        }
        mergedConfig.storage = deepMerge(legacyConfig.storage, storageConfig);

        // Always flatten nested storage urls/auth for returned config
        if (storageConfig.remote?.url) {
          mergedConfig.storage.remoteUrl = storageConfig.remote.url;
        }
        if (storageConfig.fallback?.url) {
          mergedConfig.storage.fallbackUrl = storageConfig.fallback.url;
        }
        if (storageConfig.remote?.auth) {
          mergedConfig.storage.remoteAuth = storageConfig.remote.auth;
        }
        if (storageConfig.fallback?.auth) {
          mergedConfig.storage.fallbackAuth = storageConfig.fallback.auth;
        }

        // Map nested remote.url and fallback.url to flat structure expected by storage service
        if (mergedConfig.storage.remote && mergedConfig.storage.remote.url) {
          mergedConfig.storage.remoteUrl = mergedConfig.storage.remote.url;
        }
        if (mergedConfig.storage.fallback && mergedConfig.storage.fallback.url) {
          mergedConfig.storage.fallbackUrl = mergedConfig.storage.fallback.url;
        }

        // Map nested auth configurations to flat structure
        applyStorageFlattening(mergedConfig);
        
        // Merge path templates
        if (storageConfig.pathTemplates) {
          if (legacyConfig.pathTemplates) {
            mergedConfig.pathTemplates = deepMerge(legacyConfig.pathTemplates, storageConfig.pathTemplates);
          } else {
            mergedConfig.pathTemplates = storageConfig.pathTemplates;
          }
        }
        
        // Merge path transforms
        if (storageConfig.pathTransforms) {
          if (legacyConfig.pathTransforms) {
            mergedConfig.pathTransforms = deepMerge(legacyConfig.pathTransforms, storageConfig.pathTransforms);
          } else {
            mergedConfig.pathTransforms = storageConfig.pathTransforms;
          }
        }
      }
      
      logger.info('Using merged configuration from KV store and legacy config');
      
      try {
        validateCriticalConfig(mergedConfig);
      } catch (validationError) {
        logger.error('Merged configuration failed validation, reverting to legacy config', {
          error: validationError instanceof Error ? validationError.message : String(validationError)
        });
        // Instead of discarding KV modules, patch missing sections from legacy config
        mergedConfig.cache = mergedConfig.cache || legacyConfig.cache;
        mergedConfig.responsive = mergedConfig.responsive || legacyConfig.responsive;
        mergedConfig.storage = mergedConfig.storage || legacyConfig.storage;
      }

      // Ensure flat storage URLs/auth are always present in the returned config
      if (mergedConfig.storage) {
        if (!mergedConfig.storage.remoteUrl && mergedConfig.storage.remote?.url) {
          mergedConfig.storage.remoteUrl = mergedConfig.storage.remote.url;
        }
        if (!mergedConfig.storage.fallbackUrl && mergedConfig.storage.fallback?.url) {
          mergedConfig.storage.fallbackUrl = mergedConfig.storage.fallback.url;
        }
        if (!mergedConfig.storage.remoteAuth && mergedConfig.storage.remote?.auth) {
          mergedConfig.storage.remoteAuth = mergedConfig.storage.remote.auth;
        }
        if (!mergedConfig.storage.fallbackAuth && mergedConfig.storage.fallback?.auth) {
          mergedConfig.storage.fallbackAuth = mergedConfig.storage.fallback.auth;
        }
      }

      const flattenedConfig = applyStorageFlattening(mergedConfig);
      
      // Reinforce flat mappings from storage module in case deepMerge missed them
      if (storageConfig) {
        if (storageConfig.remote?.url) {
          flattenedConfig.storage.remoteUrl = storageConfig.remote.url;
        }
        if (storageConfig.fallback?.url) {
          flattenedConfig.storage.fallbackUrl = storageConfig.fallback.url;
        }
        if (storageConfig.remote?.auth) {
          flattenedConfig.storage.remoteAuth = storageConfig.remote.auth as any;
        }
        if (storageConfig.fallback?.auth) {
          flattenedConfig.storage.fallbackAuth = storageConfig.fallback.auth as any;
        }
      }

      if (!flattenedConfig.storage) {
        flattenedConfig.storage = {} as any;
      }
      flattenedConfig.storage.remoteUrl = storageConfig?.remote?.url ?? storageConfig?.remoteUrl ?? flattenedConfig.storage.remoteUrl;
      flattenedConfig.storage.fallbackUrl = storageConfig?.fallback?.url ?? storageConfig?.fallbackUrl ?? flattenedConfig.storage.fallbackUrl;
      flattenedConfig.storage.remoteAuth = storageConfig?.remote?.auth ?? flattenedConfig.storage.remoteAuth;
      flattenedConfig.storage.fallbackAuth = storageConfig?.fallback?.auth ?? flattenedConfig.storage.fallbackAuth;

      return flattenedConfig;
    } catch (error) {
      logger.error('Error retrieving configuration from KV store', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // If any error occurs, fall back to legacy config
      return applyStorageFlattening(legacyConfig);
    }
  } catch (error) {
    // If something really goes wrong, return a minimal working default config
    logger.error('Failed to get any valid configuration, using emergency defaults', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return {
      environment: 'production',
      version: '1.0.0',
      debug: { enabled: false, headers: [], allowedEnvironments: [], verbose: false, includePerformance: false },
      cache: { 
        method: 'cf', 
        ttl: { ok: 86400, clientError: 60, serverError: 10 },
        cacheability: true
      },
      responsive: {
        breakpoints: [320, 640, 768, 1024, 1440, 1920],
        deviceWidths: { mobile: 480, tablet: 768, desktop: 1440 },
        quality: 85,
        fit: 'scale-down',
        format: 'auto',
        metadata: 'none'
      },
      storage: {
        priority: ['r2', 'remote', 'fallback'],
        r2: { enabled: !!(env as any).IMAGES_BUCKET, bindingName: 'IMAGES_BUCKET' }
      },
      derivatives: {}
    };
  }
}
