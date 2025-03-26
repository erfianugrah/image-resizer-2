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
  
  // Check if we should use an optimized version based on config flag
  if (config.performance?.optimizedMetadataFetching) {
    logger.info('Using optimized metadata fetching service');
    // In the future, we could import and return an optimized version here
  }
  
  // Return the default implementation
  return new DefaultMetadataFetchingService(
    logger,
    storageService,
    cacheService,
    configurationService
  );
}