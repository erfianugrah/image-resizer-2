/**
 * Enhanced Metadata Fetching Service Implementation with Multi-Layer Caching
 * 
 * This service handles fetching and processing image metadata with tiered caching:
 * 1. In-memory LRU cache (L1): Fastest, but not persistent across requests
 * 2. Cloudflare KV cache (L2): Persistent across requests, moderate access speed
 * 3. Origin fetch (L3): Fallback when cache misses occur
 */

import { Logger } from '../utils/logging';
import { ImageResizerConfig } from '../config';
import { Env } from '../types';
import { 
  ImageMetadata, 
  MetadataFetchingService, 
  MetadataProcessingOptions, 
  TransformationResult,
  StorageService,
  CacheService,
  ConfigurationService
} from './interfaces';
import { DefaultMetadataFetchingService } from './metadataService';

/**
 * CachedMetadata interface for standardized caching
 */
interface CachedMetadata {
  width: number;
  height: number;
  format: string;
  fileSize?: number;
  originalDimensions?: {
    width: number;
    height: number;
  };
  lastFetched: number;  // Timestamp for cache freshness
  confidence: 'high' | 'medium' | 'low';
  source: string;       // Where this metadata came from
  // Raw metadata for reference
  originalMetadata?: unknown;
}

/**
 * Enhanced metadata fetching service with multi-layer caching
 */
export class OptimizedMetadataService implements MetadataFetchingService {
  // In-memory LRU cache implementation
  private inMemoryCache: Map<string, ImageMetadata> = new Map();
  private readonly MEMORY_CACHE_SIZE: number;
  private readonly KV_CACHE_TTL: number;
  
  // Request coalescing for concurrent identical requests
  private inFlightRequests: Map<string, Promise<ImageMetadata>> = new Map();
  
  // Delegate to the default metadata service for origin fetching
  private defaultMetadataService: DefaultMetadataFetchingService;
  
  /**
   * Create a new OptimizedMetadataService
   * 
   * @param logger Service logger
   * @param storageService Storage service for making requests
   * @param cacheService Cache service for caching responses
   * @param configurationService Configuration service
   */
  constructor(
    private logger: Logger,
    private storageService: StorageService,
    private cacheService: CacheService,
    private configurationService: ConfigurationService
  ) {
    this.logger.debug('Enhanced Metadata Fetching Service created');
    
    // Initialize the default metadata service for fallback
    this.defaultMetadataService = new DefaultMetadataFetchingService(
      logger, 
      storageService, 
      cacheService, 
      configurationService
    );
    
    // Set cache sizes from configuration
    const config = configurationService.getConfig();
    this.MEMORY_CACHE_SIZE = Number(config.detector?.cache?.maxSize || 1000);
    this.KV_CACHE_TTL = Number(config.cache?.ttl?.ok || 86400); // Default to 24 hours
    
    this.logger.debug('Enhanced Metadata Service initialized with cache configuration', {
      memoryCacheSize: this.MEMORY_CACHE_SIZE,
      kvCacheTtl: this.KV_CACHE_TTL
    });
  }
  
  /**
   * Service lifecycle method for initialization
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing Enhanced Metadata Fetching Service');
    
    // Initialize the default service
    await this.defaultMetadataService.initialize();
    
    this.logger.debug('Memory cache stats', {
      cacheSize: this.inMemoryCache.size,
      memoryLimit: this.MEMORY_CACHE_SIZE
    });
    
    this.logger.info('Enhanced Metadata Fetching Service initialized');
  }
  
  /**
   * Service lifecycle method for shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.debug('Shutting down Enhanced Metadata Fetching Service');
    
    // Shut down the default service
    await this.defaultMetadataService.shutdown();
    
    // Log stats before shutdown
    this.logger.debug('Cache stats before shutdown', {
      memoryCacheSize: this.inMemoryCache.size
    });
    
    // Clear in-memory cache
    this.inMemoryCache.clear();
    
    this.logger.info('Enhanced Metadata Fetching Service shut down');
  }
  
  /**
   * Prune the in-memory cache when it exceeds the size limit
   */
  private pruneMemoryCache(): void {
    if (this.inMemoryCache.size > this.MEMORY_CACHE_SIZE) {
      // Remove oldest 20% of entries to avoid frequent pruning
      const keysToDelete = Array.from(this.inMemoryCache.keys())
        .slice(0, Math.floor(this.MEMORY_CACHE_SIZE * 0.2));
      
      this.logger.debug('Pruning memory cache', {
        before: this.inMemoryCache.size,
        pruning: keysToDelete.length
      });
      
      keysToDelete.forEach(key => this.inMemoryCache.delete(key));
      
      this.logger.debug('Memory cache pruned', {
        after: this.inMemoryCache.size,
        maxSize: this.MEMORY_CACHE_SIZE
      });
    }
  }
  
  /**
   * Store metadata in memory cache with LRU pruning
   * 
   * @param cacheKey The cache key
   * @param metadata The metadata to cache
   */
  private storeInMemoryCache(cacheKey: string, metadata: ImageMetadata): void {
    // Check if we need to prune the cache first
    this.pruneMemoryCache();
    
    // Store in memory cache
    this.inMemoryCache.set(cacheKey, metadata);
  }
  
  /**
   * Check the in-memory cache for metadata
   * 
   * @param cacheKey The cache key
   * @returns Cached metadata or null if not found
   */
  private checkMemoryCache(cacheKey: string): ImageMetadata | null {
    const cachedMetadata = this.inMemoryCache.get(cacheKey);
    
    if (cachedMetadata) {
      this.logger.debug('Memory cache hit', { 
        cacheKey 
      });
      return cachedMetadata;
    }
    
    this.logger.debug('Memory cache miss', { 
      cacheKey 
    });
    return null;
  }
  
  /**
   * Check the KV cache for metadata
   * 
   * @param cacheKey The cache key
   * @param env Environment variables with KV bindings
   * @returns Cached metadata or null if not found
   */
  private async checkKVCache(
    cacheKey: string, 
    env: Env
  ): Promise<ImageMetadata | null> {
    // Check if the KV binding exists
    if (!env.IMAGE_METADATA_CACHE) {
      this.logger.warn('KV cache not available, IMAGE_METADATA_CACHE binding missing');
      return null;
    }
    
    try {
      this.logger.debug('Checking KV cache', { cacheKey });
      
      // Get the cached data from KV
      const cachedData = await env.IMAGE_METADATA_CACHE.get(cacheKey, { type: 'json' });
      
      if (!cachedData) {
        this.logger.debug('KV cache miss', { cacheKey });
        return null;
      }
      
      // Validate the cached data structure
      const kvCacheData = cachedData as CachedMetadata;
      
      if (!kvCacheData.width || !kvCacheData.height) {
        this.logger.warn('Invalid KV cache entry', { 
          cacheKey,
          hasWidth: !!kvCacheData.width,
          hasHeight: !!kvCacheData.height 
        });
        return null;
      }
      
      // Check cache freshness - consider stale after 7 days
      const now = Date.now();
      const cacheAge = now - (kvCacheData.lastFetched || 0);
      const maxAge = this.KV_CACHE_TTL * 1000; // Convert seconds to ms
      
      if (cacheAge > maxAge) {
        this.logger.debug('KV cache entry is stale', {
          cacheKey,
          cacheAge: Math.round(cacheAge / 1000 / 60 / 60) + 'h',
          maxAge: Math.round(maxAge / 1000 / 60 / 60) + 'h'
        });
        return null;
      }
      
      // Convert CachedMetadata to ImageMetadata format
      const metadata: ImageMetadata = {
        metadata: {
          width: kvCacheData.width,
          height: kvCacheData.height,
          format: kvCacheData.format || 'jpeg',
          // Add any original metadata if available
          originalMetadata: kvCacheData.originalMetadata as Record<string, unknown> | undefined,
          metadataSource: 'storage-service', // Use one of the allowed values from the type
          confidence: kvCacheData.confidence || 'medium',
          estimationMethod: 'direct'
        },
        messages: ['Retrieved from KV cache']
      };
      
      this.logger.debug('KV cache hit', {
        cacheKey,
        width: metadata.metadata.width,
        height: metadata.metadata.height,
        format: metadata.metadata.format,
        age: Math.round(cacheAge / 1000 / 60) + 'min'
      });
      
      return metadata;
    } catch (error) {
      // Log the error but don't fail the request
      this.logger.warn('Error accessing KV cache', { 
        cacheKey, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }
  
  /**
   * Store metadata in both memory and KV caches
   * 
   * @param cacheKey The cache key
   * @param metadata The metadata to cache
   * @param env Environment variables with KV bindings
   */
  private async storeInBothCaches(
    cacheKey: string, 
    metadata: ImageMetadata, 
    env: Env
  ): Promise<void> {
    // Store in memory cache first (always succeeds)
    this.storeInMemoryCache(cacheKey, metadata);
    
    // Check if KV binding exists
    if (!env.IMAGE_METADATA_CACHE) {
      this.logger.warn('Cannot store in KV cache, IMAGE_METADATA_CACHE binding missing');
      return;
    }
    
    try {
      // Extract the original data from Cloudflare's response if available
      const original = metadata.metadata.originalMetadata?.original;
      
      // Store only essential, non-duplicated data in CachedMetadata format
      const cacheData: CachedMetadata = {
        width: metadata.metadata.width,
        height: metadata.metadata.height,
        format: metadata.metadata.format || 'jpeg',
        lastFetched: Date.now(),
        confidence: metadata.metadata.confidence || 'medium',
        source: metadata.metadata.metadataSource || 'direct-fetch',
        // Only store fileSize if it's not already in the width/height values
        fileSize: original?.file_size,
        // Don't duplicate dimensions if they're the same as width/height
        originalDimensions: (original && 
                           (original.width !== metadata.metadata.width || 
                            original.height !== metadata.metadata.height)) 
          ? {
            width: original.width,
            height: original.height
          } 
          : undefined,
        // Store minimal metadata fields that might be useful for transformations
        originalMetadata: original ? {
          format: original.format
        } : undefined
      };
      
      // Store in KV with appropriate TTL
      await env.IMAGE_METADATA_CACHE.put(
        cacheKey, 
        JSON.stringify(cacheData), 
        { expirationTtl: this.KV_CACHE_TTL }
      );
      
      this.logger.debug('Stored metadata in KV cache', {
        cacheKey,
        width: cacheData.width,
        height: cacheData.height,
        ttl: this.KV_CACHE_TTL + 's'
      });
    } catch (error) {
      // Log the error but don't fail the request since it's already in memory cache
      this.logger.warn('Error storing metadata in KV cache', { 
        cacheKey, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  /**
   * Fetch image metadata using multi-layer caching
   * 
   * @param imagePath Path to the image
   * @param config Application configuration
   * @param env Environment variables
   * @param request Original request for context
   * @returns Promise with the image metadata
   */
  async fetchMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<ImageMetadata> {
    const startTime = Date.now();
    const cacheKey = `metadata:${imagePath}`;
    
    // 1. Check in-memory cache first (fastest)
    const memoryResult = this.checkMemoryCache(cacheKey);
    if (memoryResult) {
      this.recordMetric('cache-hit', 'memory', startTime);
      return memoryResult;
    }
    
    // 2. Check KV store (slower than memory, but persistent)
    try {
      const kvResult = await this.checkKVCache(cacheKey, env);
      if (kvResult) {
        // Store in memory cache for future requests
        this.storeInMemoryCache(cacheKey, kvResult);
        this.recordMetric('cache-hit', 'kv', startTime);
        return kvResult;
      }
    } catch (error) {
      // KV errors should not prevent fetching metadata
      this.logger.warn('KV cache read error', { error: String(error) });
    }
    
    // 3. Check if request is already in flight to implement request coalescing
    if (this.inFlightRequests.has(cacheKey)) {
      this.logger.debug('Coalescing duplicate metadata request', { cacheKey });
      const coalescedResult = await this.inFlightRequests.get(cacheKey)!;
      this.recordMetric('coalesced-request', 'inflight', startTime);
      return coalescedResult;
    }
    
    // 4. Create a new fetch promise that will be shared by concurrent requests
    const fetchPromise = this.fetchFromOriginWithCleanup(imagePath, config, env, request, cacheKey, startTime);
    
    // Store promise for coalescing and return result
    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }
  
  /**
   * Helper method to fetch metadata from origin and clean up in-flight tracking
   * 
   * @param imagePath Path to the image
   * @param config Application configuration
   * @param env Environment variables
   * @param request Original request
   * @param cacheKey Cache key for tracking
   * @param startTime Start time for metrics
   * @returns Promise with the metadata
   */
  private async fetchFromOriginWithCleanup(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request,
    cacheKey: string,
    startTime: number
  ): Promise<ImageMetadata> {
    try {
      // Fetch from origin (slowest) using the default service
      const fetchedMetadata = await this.defaultMetadataService.fetchMetadata(
        imagePath, 
        config, 
        env, 
        request
      );
      
      // Store in both caches
      await this.storeInBothCaches(cacheKey, fetchedMetadata, env);
      
      this.recordMetric('cache-miss', 'origin', startTime);
      return fetchedMetadata;
    } finally {
      // Always clean up the in-flight request
      this.inFlightRequests.delete(cacheKey);
    }
  }
  
  /**
   * Record metrics for caching operations
   * 
   * @param type The type of operation (hit or miss)
   * @param source The cache source (memory, kv, or origin)
   * @param startTime The start time of the operation
   */
  private recordMetric(type: 'cache-hit' | 'cache-miss' | 'coalesced-request', source: 'memory' | 'kv' | 'origin' | 'inflight', startTime: number): void {
    const duration = Date.now() - startTime;
    
    this.logger.debug(`Metadata ${type} from ${source}`, {
      durationMs: duration,
      source,
      type
    });
  }
  
  /**
   * Process image metadata to determine optimal transformation parameters
   * Delegates to the default service
   * 
   * @param metadata Original image metadata
   * @param targetAspect Optional target aspect ratio (width/height)
   * @param options Additional processing options
   * @returns Transformation recommendations
   */
  processMetadata(
    metadata: ImageMetadata,
    targetAspect?: { width: number, height: number },
    options?: MetadataProcessingOptions
  ): TransformationResult {
    return this.defaultMetadataService.processMetadata(metadata, targetAspect, options);
  }
  
  /**
   * Fetch and process image metadata in one operation
   * 
   * @param imagePath Path to the image
   * @param config Application configuration
   * @param env Environment variables
   * @param request Original request for context
   * @param targetAspect Optional target aspect ratio
   * @param options Additional processing options
   * @returns Promise with transformation recommendations
   */
  async fetchAndProcessMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request,
    targetAspect?: { width: number, height: number },
    options?: MetadataProcessingOptions
  ): Promise<TransformationResult> {
    try {
      // First fetch the metadata using our enhanced caching
      const metadata = await this.fetchMetadata(
        imagePath,
        config,
        env,
        request
      );
      
      // Then process it using the default service
      return this.processMetadata(metadata, targetAspect, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error in fetchAndProcessMetadata', {
        imagePath,
        error: errorMessage
      });
      
      // Return minimal result
      return {};
    }
  }
}