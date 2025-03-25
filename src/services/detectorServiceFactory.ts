/**
 * Factory for creating DetectorService instances
 * 
 * This factory creates properly configured detector service instances
 * based on configuration and environment settings.
 */

import { Logger } from '../utils/logging';
import { ClientDetectionService } from './interfaces';
import { DetectorServiceImpl } from './detectorService';
import { ImageResizerConfig } from '../config';
import { OptimizedDetectorService } from './optimizedDetectorService';

/**
 * Create a properly configured detector service
 * 
 * @param config Application configuration
 * @param logger Logger instance for the service
 * @returns Configured detector service instance
 */
export function createDetectorService(config: ImageResizerConfig, logger: Logger): ClientDetectionService {
  // Check if we should use the optimized implementation
  const useOptimized = config.performance?.optimizedClientDetection === true;

  if (useOptimized) {
    // Create and configure optimized service
    const service = new OptimizedDetectorService(logger);
    service.configure(config);
    
    logger.info('Using optimized client detection service for better performance');
    return service;
  }
  
  // Create and configure the default implementation
  const service = new DetectorServiceImpl(logger);
  service.configure(config);
  
  logger.info('Using standard client detection service');
  return service;
}