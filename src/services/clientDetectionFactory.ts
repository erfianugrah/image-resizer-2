/**
 * Client Detection Factory
 * 
 * Factory for creating the appropriate client detection service based on configuration.
 */

import { ImageResizerConfig } from '../config';
import { ClientDetectionService } from './interfaces';
import { DefaultClientDetectionService } from './clientDetectionService';
import { OptimizedClientDetectionService } from './optimizedClientDetectionService';
import { Logger } from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';

/**
 * Create a client detection service based on configuration
 * 
 * @param config Application configuration
 * @param logger Logger instance
 * @returns ClientDetectionService implementation
 */
export function createClientDetectionService(
  config: ImageResizerConfig,
  logger: Logger | OptimizedLogger
): ClientDetectionService {
  // Check if we should use the optimized implementation
  const useOptimized = config.performance?.optimizedClientDetection !== false;
  
  // Check for optimized logger
  const isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
  
  if (useOptimized) {
    // Create and configure optimized service
    const service = new OptimizedClientDetectionService(logger);
    service.configure(config);
    
    if (isOptimizedLogger && (logger as OptimizedLogger).isLevelEnabled('INFO')) {
      logger.info('Using optimized client detection service with request-scoped caching');
    } else if (!isOptimizedLogger) {
      logger.info('Using optimized client detection service with request-scoped caching');
    }
    
    return service;
  } else {
    // Create and configure default service
    const service = new DefaultClientDetectionService(logger);
    service.configure(config);
    
    if (isOptimizedLogger && (logger as OptimizedLogger).isLevelEnabled('INFO')) {
      logger.info('Using default client detection service');
    } else if (!isOptimizedLogger) {
      logger.info('Using default client detection service');
    }
    
    return service;
  }
}