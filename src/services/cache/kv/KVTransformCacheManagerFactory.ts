/**
 * KV Transform Cache Manager Factory
 * 
 * Factory for creating the appropriate KV transform cache manager
 * based on configuration. This factory supports two implementations:
 * 
 * 1. Standard KVTransformCacheManager with full index structures
 * 2. SimpleKVTransformCacheManager with metadata-based filtering
 */

import { KVNamespace, ExecutionContext } from '@cloudflare/workers-types';
import { KVTransformCacheInterface, KVCacheConfig } from './KVTransformCacheInterface';
import { KVTransformCacheManager } from './KVTransformCacheManager';
import { SimpleKVTransformCacheManager } from './SimpleKVTransformCacheManager';
import { Logger } from '../../../utils/logging';
import { ImageResizerConfig } from '../../../config';

export interface KVTransformCacheOptions {
  /**
   * KV namespace binding
   */
  kvNamespace: KVNamespace;
  
  /**
   * Cache configuration
   */
  config: KVCacheConfig;
  
  /**
   * Logger instance
   */
  logger: Logger;
  
  /**
   * Use simplified implementation that leverages KV list + metadata
   * instead of separate index structures. This is more efficient for
   * small to medium deployments.
   */
  useSimpleImplementation?: boolean;
}

/**
 * Create a KV transform cache manager based on options
 * 
 * @param options Configuration options
 * @returns KVTransformCacheInterface implementation
 */
export function createKVTransformCacheManager(options: KVTransformCacheOptions): KVTransformCacheInterface {
  const { config, logger, useSimpleImplementation } = options;
  let { kvNamespace } = options;
  
  // Check if KV transform cache is entirely disabled
  if (!config.enabled) {
    logger.info('KV transform cache is disabled, returning a disabled implementation');
    // Create a disabled implementation that doesn't need a KV namespace
    return new SimpleKVTransformCacheManager({
      ...config,
      enabled: false
    }, null as unknown as KVNamespace);
  }
  
  // Validate namespace
  if (!kvNamespace) {
    logger.warn('KV namespace is not provided but cache is enabled - checking fallbacks');
    
    // No KV namespace available from constructor parameters
    logger.warn(`KV namespace not provided in constructor, disabling KV transform cache`);
    return new SimpleKVTransformCacheManager({
      ...config,
      enabled: false
    }, null as unknown as KVNamespace);
  }
  
  // Create the appropriate implementation
  // The useSimpleImplementation flag might come from different sources
  // From wrangler.jsonc it will be a string "true" or "false"
  // From hardcoded config it might be a boolean
  // Let's handle both cases without hardcoding a default value
  
  logger.debug('useSimpleImplementation value', {
    value: useSimpleImplementation,
    type: typeof useSimpleImplementation
  });
  
  logger.debug('KV Transform Cache configuration', {
    cacheConfig: JSON.stringify(config, null, 2).substring(0, 100) + '...'
  });
  
  // First check for boolean value
  if (typeof useSimpleImplementation === 'boolean' && useSimpleImplementation) {
    logger.info('Creating SimpleKVTransformCacheManager with metadata-based filtering (boolean flag)');
    return new SimpleKVTransformCacheManager(config, kvNamespace);
  }
  // Then check for string value (from environment variables)
  else if (typeof useSimpleImplementation === 'string' && useSimpleImplementation === 'true') {
    logger.info('Creating SimpleKVTransformCacheManager with metadata-based filtering (string flag)');
    return new SimpleKVTransformCacheManager(config, kvNamespace);
  }
  // Otherwise use complex implementation
  else {
    logger.info('Creating KVTransformCacheManager with full index structures');
    // Pass the logger to the constructor
    // We'll create a new instance directly with the required parameters
    // and bypass the configuration service requirement
    
    // Since the KVTransformCacheManager requires a ConfigurationService,
    // we need to create a minimal implementation that provides the necessary configuration
    logger.info('Creating KVTransformCacheManager with direct configuration');
    
    // We'll create a simpler implementation to avoid complex mocking
    const disabledTags = {
      generateCacheTags: () => [],
      applyTags: (req: Request, res: Response) => ({ request: req, response: res }),
      extractTagsFromRequest: () => [],
      prepareTaggedRequest: (req: Request, res: Response) => ({ request: req, response: res })
    };
    
    // Initialize the manager directly with the base config
    const kvCache = new KVTransformCacheManager(logger);
    
    // Set the configuration and namespace directly
    (kvCache as any).config = config;
    (kvCache as any).namespace = kvNamespace;
    (kvCache as any).tagsManager = disabledTags;
    
    return kvCache;
  }
}