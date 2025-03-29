/**
 * Interface definition for KV-based transform cache
 * 
 * This component provides efficient storage and retrieval of transformed images
 * with cache tag indexing for efficient purging. It implements a hybrid approach to caching
 * that balances performance and functionality, with two key strategies:
 * 
 * 1. Standard Approach:
 *    - Uses centralized indices for all tags and paths
 *    - Full JSON documents for indices
 *    - Simple implementation but higher KV operation costs
 *    - Better for smaller deployments with fewer cache entries
 * 
 * 2. Optimized Approach:
 *    - Uses distributed key-specific indices for tags and paths
 *    - Comma-separated lists instead of JSON for efficiency
 *    - Batched operations and controlled indexing frequency
 *    - Lazy index updates to reduce KV operations
 *    - Better for larger deployments with many cache entries
 * 
 * The hybrid approach includes:
 *    - Background processing with waitUntil
 *    - Conditional indexing based on file size
 *    - Deterministic sampling for index updates
 *    - Smart purging with batch operations
 *    - Regular maintenance to keep the cache optimized
 *    - Adaptive list+filter vs. index-based lookups
 */

import { StorageResult } from '../../interfaces';
import { TransformOptions } from '../../../transform';
import { ExecutionContext } from '@cloudflare/workers-types';

/**
 * Configuration options for KV transform cache
 * 
 * These options control the behavior of the cache, including storage limits,
 * TTLs, indexing strategy, and optimization settings.
 */
export interface KVCacheConfig {
  enabled: boolean;
  binding: string;             // KV namespace binding name (defaults to IMAGE_TRANSFORMATIONS_CACHE)
  prefix: string;              // Key prefix for namespacing KV keys (defaults to "transform")
  maxSize: number;             // Maximum size to cache in bytes (defaults to 10MB)
  defaultTtl: number;          // Default TTL in seconds (defaults to 86400 - 1 day)
  contentTypeTtls: Record<string, number>; // TTLs by content type
  indexingEnabled: boolean;    // Enable secondary indices for tag-based purging
  backgroundIndexing: boolean; // Update indices in background to avoid blocking
  purgeDelay: number;          // Delay between purge operations (ms)
  disallowedPaths: string[];   // Paths that should not be cached
  
  // Advanced indexing options
  optimizedIndexing: boolean; // Use minimal indices (key references only) for better performance
  smallPurgeThreshold: number; // Maximum number of items to purge using list+filter instead of indices
  indexUpdateFrequency: number; // How often to update indices (e.g., 1 = every time, 10 = every 10th operation)
  skipIndicesForSmallFiles: boolean; // Skip indexing for files smaller than a threshold
  smallFileThreshold: number; // Size threshold for "small" files in bytes
}

/**
 * Cache metadata stored alongside the transformed image
 */
export interface CacheMetadata {
  url: string;                 // Original URL
  timestamp: number;           // When the item was cached
  contentType: string;         // Content type of the cached image
  size: number;                // Size in bytes
  transformOptions: TransformOptions; // The transform options used
  tags: string[];              // Cache tags
  ttl: number;                 // TTL in seconds
  expiration: number;          // Expiration timestamp
  storageType?: string;        // The storage type used (r2, remote, fallback)
  originalSize?: number;       // Original image size before transformation
  compressionRatio?: number;   // Compression ratio achieved
}

/**
 * Result of a cache get operation
 */
export interface TransformCacheResult {
  value: ArrayBuffer;          // Cached image data
  metadata: CacheMetadata;     // Metadata for the cached item
  key: string;                 // Cache key
}

/**
 * KV Transform Cache interface
 * 
 * This interface defines the operations for storing, retrieving and 
 * purging transformed images in Cloudflare KV storage.
 */
export interface KVTransformCacheInterface {
  /**
   * Check if a transformation is cached
   */
  isCached(request: Request, transformOptions: TransformOptions): Promise<boolean>;
  
  /**
   * Get a cached transformation
   */
  get(request: Request, transformOptions: TransformOptions): Promise<TransformCacheResult | null>;
  
  /**
   * Put a transformed image into the cache
   */
  put(
    request: Request, 
    response: Response, 
    storageResult: StorageResult, 
    transformOptions: TransformOptions, 
    ctx?: ExecutionContext
  ): Promise<void>;
  
  /**
   * Delete a specific transformation from the cache
   */
  delete(request: Request, transformOptions: TransformOptions): Promise<void>;
  
  /**
   * Purge all cache entries with a specific tag
   */
  purgeByTag(tag: string, ctx?: ExecutionContext): Promise<number>;
  
  /**
   * Purge all cache entries matching a path pattern
   */
  purgeByPath(pathPattern: string, ctx?: ExecutionContext): Promise<number>;
  
  /**
   * Generate a cache key for a request and transform options
   */
  generateCacheKey(request: Request, transformOptions: TransformOptions): string;
  
  /**
   * List cache entries (for debugging and management)
   */
  listEntries(limit?: number, cursor?: string): Promise<{
    entries: {key: string, metadata: CacheMetadata}[],
    cursor?: string,
    complete: boolean
  }>;
  
  /**
   * Get cache statistics including optimization status and maintenance info
   */
  getStats(): Promise<{
    count: number,             // Number of cached items
    size: number,              // Total size in bytes
    indexSize: number,         // Size of indices in bytes (estimated)
    hitRate: number,           // Hit rate percentage
    avgSize: number,           // Average item size in bytes
    optimized: boolean,        // Whether optimized indexing is enabled
    lastPruned: Date           // When maintenance was last performed
  }>;
  
  /**
   * Perform cache maintenance including pruning expired entries
   * This helps maintain optimal performance by cleaning up stale data
   * 
   * @param maxEntriesToPrune Maximum number of entries to prune in one operation
   * @param ctx Optional execution context for background operation
   * @returns Number of entries pruned
   */
  performMaintenance(maxEntriesToPrune?: number, ctx?: ExecutionContext): Promise<number>;
}