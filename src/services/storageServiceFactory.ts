/**
 * Storage Service Factory
 * 
 * Factory for creating the appropriate storage service based on configuration.
 */

import { ImageResizerConfig } from '../config';
import { StorageService, ConfigurationService } from './interfaces';
import { DefaultStorageService } from './storageService';
import { OptimizedStorageService } from './optimizedStorageService';
import { Logger } from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';

/**
 * Create a storage service based on configuration
 * 
 * @param config Application configuration
 * @param logger Logger instance
 * @param configService Configuration service
 * @returns StorageService implementation
 */
export function createStorageService(
  config: ImageResizerConfig,
  logger: Logger | OptimizedLogger,
  configService: ConfigurationService
): StorageService {
  // Check if we should use the optimized implementation
  const useOptimized = config.performance?.parallelStorageOperations === true;
  
  // Check for optimized logger
  const isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
  
  if (useOptimized) {
    // Create and configure optimized service
    const service = new OptimizedStorageService(logger, configService);
    
    if (isOptimizedLogger && (logger as OptimizedLogger).isLevelEnabled('INFO')) {
      logger.info('Using optimized storage service with parallel operations');
    } else if (!isOptimizedLogger) {
      logger.info('Using optimized storage service with parallel operations');
    }
    
    return service;
  } else {
    // Create and configure default service
    const service = new DefaultStorageService(logger, configService);
    
    if (isOptimizedLogger && (logger as OptimizedLogger).isLevelEnabled('INFO')) {
      logger.info('Using default storage service with sequential operations');
    } else if (!isOptimizedLogger) {
      logger.info('Using default storage service with sequential operations');
    }
    
    return service;
  }
}