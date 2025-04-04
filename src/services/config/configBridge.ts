/**
 * Configuration Bridge
 * 
 * This module provides a bridge between the KV-based Configuration API and 
 * the legacy config.ts module, allowing for a gradual migration path.
 */

import { ConfigurationApiService } from './interfaces';
import { getConfig as getLegacyConfig, ImageResizerConfig } from '../../config';
import { Env } from '../../types';
import { Logger } from '../../utils/logging';

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
      return legacyConfig;
    }
    
    // Try to get KV-based config
    try {
      // Get core module config
      const coreConfig = await configApi.getModule('core');
      
      if (!coreConfig) {
        logger.warn('Core configuration module not found in KV store, using legacy config only');
        return legacyConfig;
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
      
      // Merge configurations
      const mergedConfig: ImageResizerConfig = {
        ...legacyConfig,
        
        // Override environment from core config
        environment: coreConfig.environment || legacyConfig.environment,
        
        // Override debug settings from core config
        debug: coreConfig.debug ? { ...legacyConfig.debug, ...coreConfig.debug } : legacyConfig.debug,
        
        // Override feature flags from core config
        features: coreConfig.features ? { ...legacyConfig.features, ...coreConfig.features } : legacyConfig.features,
        
        // Override logging from core config
        logging: coreConfig.logging ? { ...legacyConfig.logging, ...coreConfig.logging } : legacyConfig.logging,
        
        // Override cache settings from cache config
        cache: cacheConfig ? { ...legacyConfig.cache, ...cacheConfig } : legacyConfig.cache,
        
        // Override transform settings
        ...transformConfig && {
          // Override responsive settings
          responsive: transformConfig.responsive ? 
            { ...legacyConfig.responsive, ...transformConfig.responsive } : 
            legacyConfig.responsive,
          
          // Ensure derivatives are always properly merged within the transform config
          derivatives: transformConfig.derivatives ? 
            { ...legacyConfig.derivatives, ...transformConfig.derivatives } : 
            (legacyConfig.derivatives || {})
        },
        
        // Ensure derivatives are always accessible at the top level as well
        derivatives: transformConfig && transformConfig.derivatives ? 
          { ...legacyConfig.derivatives, ...transformConfig.derivatives } : 
          (legacyConfig.derivatives || {}),
          
        // Log derivatives count for debugging
        ...(logger && {
          _derivativesLoaded: true,
          _derivativesCount: transformConfig && transformConfig.derivatives ?
            Object.keys({ ...legacyConfig.derivatives, ...transformConfig.derivatives }).length :
            Object.keys(legacyConfig.derivatives).length
        }),
        
        // Override storage settings
        ...storageConfig && {
          storage: storageConfig ? { ...legacyConfig.storage, ...storageConfig } : legacyConfig.storage,
          pathTemplates: storageConfig.pathTemplates ? 
            { ...legacyConfig.pathTemplates, ...storageConfig.pathTemplates } : 
            legacyConfig.pathTemplates,
          pathTransforms: storageConfig.pathTransforms ? 
            { ...legacyConfig.pathTransforms, ...storageConfig.pathTransforms } : 
            legacyConfig.pathTransforms,
        }
      };
      
      logger.info('Using merged configuration from KV store and legacy config');
      return mergedConfig;
    } catch (error) {
      logger.error('Error retrieving configuration from KV store', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // If any error occurs, fall back to legacy config
      return legacyConfig;
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