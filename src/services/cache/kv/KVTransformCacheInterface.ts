/**
 * Interface definition for KV-based transform cache
 * 
 * This component provides efficient storage and retrieval of transformed images
 * with a simplified approach to caching that uses:
 * 
 * - Human-readable keys that include image name and transform parameters
 * - KV's list + metadata filtering for purging operations
 * - No separate index structures (metadata stored with content)
 * - Background processing with waitUntil
 * 
 * This approach is simple, efficient, and easy to debug:
 * - Background processing for non-blocking operations
 * - Metadata-based filtering for efficient purging
 * - Tag-based cache invalidation
 * - Regular maintenance to keep the cache optimized
 */

import { StorageResult } from '../../interfaces';
import { TransformOptions } from '../../../transform';
import { ExecutionContext } from '@cloudflare/workers-types';

/**
 * Configuration options for KV transform cache
 * 
 * These options control the behavior of the cache, including storage limits,
 * TTLs, and purging operations.
 */
export interface KVCacheConfig {
  enabled: boolean;
  binding: string;             // KV namespace binding name (defaults to IMAGE_TRANSFORMATIONS_CACHE)
  prefix: string;              // Key prefix for namespacing KV keys (defaults to "transform")
  maxSize: number;             // Maximum size to cache in bytes (defaults to 10MB)
  defaultTtl: number;          // Default TTL in seconds (defaults to 86400 - 1 day)
  contentTypeTtls: Record<string, number>; // TTLs by content type
  backgroundIndexing: boolean; // Process cache operations in background to avoid blocking
  purgeDelay: number;          // Delay between purge operations (ms)
  disallowedPaths: string[];   // Paths that should not be cached
  memoryCacheSize?: number;    // Size of in-memory LRU cache (item count)
  debug?: boolean;             // Enable additional debug logging
}

/**
 * Cache metadata stored alongside the transformed image
 * Extends Record<string, unknown> to satisfy the type system
 */
export interface CacheMetadata extends Record<string, unknown> {
  // Identifying information
  url: string;                 // Original URL
  timestamp: number;           // When the item was cached
  
  // Image dimensions - explicitly included for better readability
  width?: number;              // Image width (if available)
  height?: number;             // Image height (if available)
  
  // Content information
  contentType: string;         // Content type of the cached image
  size: number;                // Size in bytes
  
  // Cache control
  ttl: number;                 // TTL in seconds
  expiration: number;          // Expiration timestamp
  
  // Transform details
  transformOptions: TransformOptions; // The transform options used
  tags: string[];              // Cache tags
  
  // Additional metadata
  storageType?: string;        // The storage type used (r2, remote, fallback)
  originalSize?: number;       // Original image size before transformation
  compressionRatio?: number;   // Compression ratio achieved
  
  // Aspect crop information
  aspectCropInfo?: {           // Information about aspect crop processing
    aspect?: string;           // Aspect ratio used
    focal?: string;            // Focal point used
    processedWithKV: boolean;  // Flag indicating this was processed by KV cache
  };
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
   * @param request The original request
   * @param transformOptions Transform options being applied
   * @param actualFormat Optional format override to use in the key
   */
  generateCacheKey(request: Request, transformOptions: TransformOptions, actualFormat?: string): string;
  
  /**
   * List cache entries (for debugging and management)
   */
  listEntries(limit?: number, cursor?: string): Promise<{
    entries: {key: string, metadata: CacheMetadata}[],
    cursor?: string,
    complete: boolean
  }>;
  
  /**
   * Get cache statistics including maintenance info
   */
  getStats(): Promise<{
    count: number,             // Number of cached items
    size: number,              // Total size in bytes
    hitRate: number,           // Hit rate percentage
    avgSize: number,           // Average item size in bytes
    lastPruned: Date,          // When maintenance was last performed
    memoryCacheSize: number,   // Number of items in memory cache
    memoryCacheHitRate: number // Memory cache hit rate percentage
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