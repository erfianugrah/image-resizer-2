/**
 * KV Transform Cache Manager Factory
 * 
 * Factory for creating a KV transform cache manager.
 * This factory now exclusively uses the simplified implementation:
 * 
 * - SimpleKVTransformCacheManager with metadata-based filtering
 */

import { KVNamespace, ExecutionContext } from '@cloudflare/workers-types';
import { KVTransformCacheInterface, KVCacheConfig } from './KVTransformCacheInterface';
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
   * This parameter is kept for backward compatibility but is now ignored
   * as we always use the simplified implementation
   * @deprecated No longer used - SimpleKVTransformCacheManager is always used
   */
  useSimpleImplementation?: boolean | string;
}

/**
 * Create a KV transform cache manager based on options
 * 
 * @param options Configuration options
 * @returns KVTransformCacheInterface implementation
 */
export function createKVTransformCacheManager(options: KVTransformCacheOptions): KVTransformCacheInterface {
  const { config, logger } = options;
  let { kvNamespace } = options;
  
  // Check if KV transform cache is entirely disabled
  // Ensure proper boolean handling
  const isEnabled = Boolean(config.enabled);
  
  // Log the value we're using
  logger.debug('KV transform cache enabled check', {
    enabled: isEnabled,
    rawEnabled: config.enabled,
    rawEnabledType: typeof config.enabled
  });
  
  if (!isEnabled) {
    logger.info('KV transform cache is disabled, returning a disabled implementation');
    // Create a disabled implementation that doesn't need a KV namespace
    return new SimpleKVTransformCacheManager({
      ...config,
      enabled: false
    }, null as unknown as KVNamespace, logger);
  }
  
  // Validate namespace
  if (!kvNamespace) {
    logger.warn('KV namespace is not provided but cache is enabled - checking fallbacks');
    
    // No KV namespace available from constructor parameters
    logger.warn(`KV namespace not provided in constructor, disabling KV transform cache`);
    return new SimpleKVTransformCacheManager({
      ...config,
      enabled: false
    }, null as unknown as KVNamespace, logger);
  }
  
  logger.debug('KV Transform Cache configuration', {
    cacheConfig: JSON.stringify(config, null, 2).substring(0, 100) + '...'
  });
  
  // Set a reasonable default memory cache size if not provided
  if (!config.memoryCacheSize) {
    config.memoryCacheSize = 200; // 200 items in memory cache by default
    logger.debug('Using default memory cache size of 200 items');
  }
  
  // Always use the simplified implementation with memory cache
  logger.info('Creating SimpleKVTransformCacheManager with memory cache and metadata-based filtering');
  return new SimpleKVTransformCacheManager(config, kvNamespace, logger);
}