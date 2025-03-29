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
  if (!config.enabled) {
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
  
  // Always use the simplified implementation, now passing the logger
  logger.info('Creating SimpleKVTransformCacheManager with metadata-based filtering');
  return new SimpleKVTransformCacheManager(config, kvNamespace, logger);
}