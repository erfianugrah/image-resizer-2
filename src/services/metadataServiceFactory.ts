/**
 * Factory for creating MetadataFetchingService instances
 */

import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { 
  MetadataFetchingService,
  StorageService,
  CacheService,
  ConfigurationService
} from './interfaces';
import { DefaultMetadataFetchingService } from './metadataService';
import { OptimizedMetadataService } from './optimizedMetadataService';

/**
 * Create a MetadataFetchingService instance
 * 
 * @param config Application configuration
 * @param logger Logger instance
 * @param storageService Storage service for fetching images
 * @param cacheService Cache service for caching metadata
 * @param configurationService Configuration service
 * @returns MetadataFetchingService instance
 */
export function createMetadataService(
  config: ImageResizerConfig,
  logger: Logger,
  storageService: StorageService,
  cacheService: CacheService,
  configurationService: ConfigurationService
): MetadataFetchingService {
  logger.debug('Creating MetadataFetchingService');
  
  // Check if we should use the optimized version with multi-layer caching
  if (config.performance?.optimizedMetadataFetching) {
    logger.info('Using optimized metadata fetching service with multi-layer caching');
    return new OptimizedMetadataService(
      logger,
      storageService,
      cacheService,
      configurationService
    );
  }
  
  // Return the default implementation
  return new DefaultMetadataFetchingService(
    logger,
    storageService,
    cacheService,
    configurationService
  );
}