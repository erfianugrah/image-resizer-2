/**
 * Cache Service Factory
 * 
 * Factory for creating the appropriate cache service based on configuration.
 */

import { ImageResizerConfig } from '../config';
import { CacheService, ConfigurationService } from './interfaces';
import { DefaultCacheService } from './cacheService';
import { OptimizedCacheService } from './optimizedCacheService';
import { Logger } from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';

/**
 * Create a cache service based on configuration
 * 
 * @param config Application configuration
 * @param logger Logger instance
 * @param configService Configuration service
 * @returns CacheService implementation
 */
export function createCacheService(
  config: ImageResizerConfig,
  logger: Logger | OptimizedLogger,
  configService: ConfigurationService
): CacheService {
  // Check if we should use the optimized implementation
  const useOptimized = config.performance?.optimizedCaching === true;
  
  // Check for optimized logger
  const isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
  
  if (useOptimized) {
    // Create and configure optimized service
    const service = new OptimizedCacheService(logger, configService);
    
    if (isOptimizedLogger && (logger as OptimizedLogger).isLevelEnabled('INFO')) {
      logger.info('Using optimized cache service with tiered caching');
    } else if (!isOptimizedLogger) {
      logger.info('Using optimized cache service with tiered caching');
    }
    
    return service;
  } else {
    // Create and configure default service
    const service = new DefaultCacheService(logger, configService);
    
    if (isOptimizedLogger && (logger as OptimizedLogger).isLevelEnabled('INFO')) {
      logger.info('Using default cache service');
    } else if (!isOptimizedLogger) {
      logger.info('Using default cache service');
    }
    
    return service;
  }
}