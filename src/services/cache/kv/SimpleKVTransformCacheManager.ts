/**
 * Simple Key-Value Transform Cache Manager
 * 
 * This component provides an optimized implementation of the KVTransformCacheInterface
 * that eliminates complex indexing structures in favor of:
 * 
 * 1. Human-readable keys that include image name and transform parameters
 * 2. KV's list + metadata filtering for purging operations
 * 3. Minimal KV operations (no separate index structures)
 * 4. Background processing with waitUntil
 * 
 * This approach is significantly simpler than the full indexing approach while
 * maintaining full functionality, especially for smaller to medium-sized deployments.
 */

import { KVNamespace, ExecutionContext } from '@cloudflare/workers-types';
import { KVTransformCacheInterface, KVCacheConfig, CacheMetadata, TransformCacheResult } from './KVTransformCacheInterface';
import { StorageResult } from '../../interfaces';
import { TransformOptions } from '../../../transform';
import { Logger, LogData } from '../../../utils/logging';

// LRU Cache for memory caching
class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V>;
  private keyOrder: K[];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map<K, V>();
    this.keyOrder = [];
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;

    // Move key to the end (most recently used)
    this.keyOrder = this.keyOrder.filter(k => k !== key);
    this.keyOrder.push(key);

    return this.cache.get(key);
  }

  put(key: K, value: V): void {
    // If already exists, just update the value and move to end
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.keyOrder = this.keyOrder.filter(k => k !== key);
      this.keyOrder.push(key);
      return;
    }

    // Check if we need to evict
    if (this.keyOrder.length >= this.capacity) {
      const lruKey = this.keyOrder.shift();
      if (lruKey !== undefined) {
        this.cache.delete(lruKey);
      }
    }

    // Add new entry
    this.cache.set(key, value);
    this.keyOrder.push(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
    this.keyOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  keys(): K[] {
    return [...this.keyOrder];
  }
}

// Extended StorageResult type with buffer field
interface TransformStorageResult extends StorageResult {
  buffer: ArrayBuffer;
  storageType: string;
  originalSize?: number;
}

/**
 * Simple KV Transform Cache Manager
 * 
 * Implements KVTransformCacheInterface with a simplified approach that:
 * - Uses human-readable keys with image name and transform parameters
 * - Leverages KV's list + metadata filtering for purging operations
 * - Eliminates separate index structures
 * - Uses background processing for non-blocking operations
 */
/**
 * Enhanced FNV-1a hashing algorithm implementation
 * This implementation takes special care to handle Unicode characters correctly
 * and maintains proper unsigned 32-bit arithmetic throughout the calculation.
 * 
 * @param {string} str - The input string to hash
 * @return {string} The 8-character hex representation of the hash
 */
function fnv1a(str: string): string {
  // Use precise constants for 32-bit FNV-1a
  const FNV_PRIME_32 = 16777619;
  const FNV_OFFSET_BASIS_32 = 2166136261;
  
  // Use TextEncoder if available, otherwise fall back to char codes
  let bytes: Uint8Array;
  
  if (typeof TextEncoder !== 'undefined') {
    // Convert the string to a UTF-8 encoded byte array for proper handling of all characters
    const encoder = new TextEncoder();
    bytes = encoder.encode(str);
  } else {
    // Fallback for environments without TextEncoder
    bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0xff;
    }
  }
  
  // Start with the offset basis
  let hash = FNV_OFFSET_BASIS_32 >>> 0; // Ensure we start with a proper unsigned int
  
  // For each byte in the input
  for (let i = 0; i < bytes.length; i++) {
    // XOR the hash with the current byte
    hash ^= bytes[i];
    
    // Multiply by the FNV prime (using a more accurate calculation with imul)
    // imul performs 32-bit integer multiplication
    hash = Math.imul(hash, FNV_PRIME_32) >>> 0; // Keep as unsigned 32-bit integer
  }
  
  // Convert to hex string and ensure it's 8 characters long
  return hash.toString(16).padStart(8, '0');
}

export class SimpleKVTransformCacheManager implements KVTransformCacheInterface {
  private config: KVCacheConfig;
  private kvNamespace: KVNamespace;
  private logger?: Logger;
  private memoryCache: LRUCache<string, TransformCacheResult>;
  private stats = {
    hits: 0,
    misses: 0,
    memoryCacheHits: 0,
    lastPruned: new Date(0)
  };

  /**
   * Create a new SimpleKVTransformCacheManager
   * 
   * @param config Cache configuration
   * @param kvNamespace KV namespace binding
   * @param logger Optional logger for enhanced logging
   */
  constructor(config: KVCacheConfig, kvNamespace: KVNamespace, logger?: Logger) {
    this.config = config;
    this.kvNamespace = kvNamespace;
    this.logger = logger;
    
    // Initialize memory cache with default capacity of 100 items or config setting
    const memoryCacheSize = config.memoryCacheSize || 100;
    this.memoryCache = new LRUCache<string, TransformCacheResult>(memoryCacheSize);
    
    if (this.logger) {
      this.logger.debug(`Initialized memory cache with capacity ${memoryCacheSize}`);
    }
  }
  
  /**
   * Helper for debug logging with console fallback
   */
  private logDebug(message: string, data?: LogData): void {
    if (this.logger) {
      this.logger.debug(message, data);
    } else if (typeof console !== 'undefined' && console.debug) {
      console.debug(message, data);
    }
  }
  
  /**
   * Helper for info logging with console fallback
   */
  private logInfo(message: string, data?: LogData): void {
    if (this.logger) {
      this.logger.info(message, data);
    } else if (typeof console !== 'undefined' && console.info) {
      console.info(message, data);
    }
  }
  
  /**
   * Helper for warning logging with console fallback
   */
  private logWarn(message: string, data?: LogData): void {
    if (this.logger) {
      this.logger.warn(message, data);
    } else if (typeof console !== 'undefined' && console.warn) {
      console.warn(message, data);
    }
  }
  
  /**
   * Helper for error logging with console fallback
   */
  private logError(message: string, data?: LogData): void {
    if (this.logger) {
      this.logger.error(message, data);
    } else if (typeof console !== 'undefined' && console.error) {
      console.error(message, data);
    }
  }

  /**
   * Check if a transformation is cached
   */
  async isCached(request: Request, transformOptions: TransformOptions): Promise<boolean> {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    if (!this.config.enabled) {
      this.logDebug("KV transform cache is disabled", {
        operation: 'kv_is_cached',
        result: 'miss',
        reason: 'disabled',
        url: url.toString(),
        path: url.pathname
      });
      return false;
    }
    
    const key = this.generateCacheKey(request, transformOptions);
    
    try {
      // Working around TypeScript errors with KV types
      const metadata = await (this.kvNamespace as any).getWithMetadata(key, { type: 'metadata' });
      const duration = Date.now() - startTime;
      
      const exists = metadata.metadata !== null;
      
      this.logDebug(`KV transform cache: isCached check - ${exists ? 'exists' : 'not found'}`, {
        operation: 'kv_is_cached',
        result: exists ? 'hit' : 'miss',
        key,
        url: url.toString(),
        path: url.pathname,
        durationMs: duration,
        transformOptions: typeof transformOptions === 'object' ? 
          Object.keys(transformOptions).join(',') : 'none'
      });
      
      return exists;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logError("KV transform cache: Error checking if item exists", {
        operation: 'kv_is_cached',
        result: 'error',
        key,
        url: url.toString(),
        path: url.pathname,
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // If there's an error, assume it's not cached
      return false;
    }
  }

  /**
   * Get a cached transformation
   */
  async get(request: Request, transformOptions: TransformOptions): Promise<TransformCacheResult | null> {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    if (!this.config.enabled) {
      this.logDebug("KV transform cache is disabled", {
        operation: 'kv_get',
        result: 'miss',
        reason: 'disabled',
        url: url.toString(),
        path: url.pathname
      });
      return null;
    }
    
    const key = this.generateCacheKey(request, transformOptions);
    
    // Check memory cache first (much faster than KV)
    const memoryCacheResult = this.memoryCache.get(key);
    if (memoryCacheResult) {
      this.stats.hits++;
      this.stats.memoryCacheHits++;
      
      this.logDebug("Memory cache: Hit", {
        operation: 'memory_get',
        result: 'hit',
        key,
        contentType: memoryCacheResult.metadata.contentType,
        size: memoryCacheResult.metadata.size,
        url: url.toString(),
        path: url.pathname,
        durationMs: 0, // Negligible time for memory cache
        age: Date.now() - (memoryCacheResult.metadata.timestamp || 0)
      });
      
      return memoryCacheResult;
    }
    
    try {
      // Not in memory cache, try KV
      // Working around TypeScript errors with KV types
      const result = await (this.kvNamespace as any).getWithMetadata(key, { type: 'arrayBuffer' });
      const duration = Date.now() - startTime;
      
      if (result.value === null || result.metadata === null) {
        this.stats.misses++;
        this.logDebug("KV transform cache: Cache miss - item not found", {
          operation: 'kv_get',
          result: 'miss',
          reason: 'not_found',
          key,
          url: url.toString(),
          path: url.pathname,
          durationMs: duration
        });
        return null;
      }
      
      // Verify that the cached content has valid metadata with a content type
      if (!result.metadata.contentType) {
        this.stats.misses++;
        this.logWarn("KV transform cache: Retrieved cache item is missing content type", {
          operation: 'kv_get',
          result: 'miss',
          reason: 'missing_content_type',
          key,
          metadataKeys: Object.keys(result.metadata).join(','),
          url: url.toString(),
          path: url.pathname,
          durationMs: duration
        });
        return null;
      }
      
      // Ensure the content type is an image format
      // This prevents binary data being returned without proper image content type
      if (!result.metadata.contentType.startsWith('image/')) {
        this.stats.misses++;
        this.logWarn("KV transform cache: Retrieved cache item has non-image content type", {
          operation: 'kv_get',
          result: 'miss',
          reason: 'invalid_content_type',
          key,
          contentType: result.metadata.contentType,
          url: url.toString(),
          path: url.pathname,
          durationMs: duration
        });
        return null;
      }
      
      // Cache hit - log success with detailed info
      this.stats.hits++;
      this.logDebug("KV transform cache: Cache hit", {
        operation: 'kv_get',
        result: 'hit',
        key,
        contentType: result.metadata.contentType,
        size: result.metadata.size,
        url: url.toString(),
        path: url.pathname,
        durationMs: duration,
        age: Date.now() - (result.metadata.timestamp || 0),
        ttl: result.metadata.ttl,
        transformOptions: typeof transformOptions === 'object' ? 
          Object.keys(transformOptions).join(',') : 'none'
      });
      
      // Create the cache result to return
      const cacheResult = {
        value: result.value,
        metadata: result.metadata,
        key
      };
      
      // Store in memory cache for faster future access
      this.memoryCache.put(key, cacheResult);
      
      return cacheResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.misses++;
      
      this.logError("KV transform cache: Error retrieving cache item", {
        operation: 'kv_get',
        result: 'error',
        key,
        url: url.toString(),
        path: url.pathname,
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return null;
    }
  }

  /**
   * Put a transformed image into the cache
   */
  async put(
    request: Request, 
    response: Response, 
    storageResult: TransformStorageResult,
    transformOptions: TransformOptions, 
    ctx?: ExecutionContext
  ): Promise<void> {
    if (!this.config.enabled) return;
    
    // Log the initiation of a KV transform cache operation
    if (typeof console !== 'undefined' && console.debug) {
      console.debug("SimpleKVTransformCacheManager.put called", {
        url: request.url,
        hasBuffer: !!storageResult.buffer,
        bufferSize: storageResult.buffer ? storageResult.buffer.byteLength : 0,
        status: response.status,
        contentType: response.headers.get('content-type')
      });
    }
    
    // Skip caching for metadata requests (format=json)
    // These are already handled by the metadata service
    if (transformOptions.format === 'json' || request.url.includes('format=json')) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug("KV transform cache: Skipping storage for metadata request", {
          url: request.url,
          format: transformOptions.format
        });
      }
      return;
    }
    
    // Check if we should cache this response
    if (!storageResult.buffer) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug("KV transform cache: Missing buffer, skipping storage", {
          storageResultKeys: Object.keys(storageResult).join(','),
          hasResponse: !!storageResult.response,
          contentType: storageResult.contentType,
          size: storageResult.size
        });
      }
      return;
    }
    
    if (response.status !== 200) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug("KV transform cache: Non-200 status, skipping storage", {
          status: response.status
        });
      }
      return;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug("KV transform cache: Non-image content type, skipping storage", {
          contentType
        });
      }
      return;
    }
    
    // Check file size limits
    if (storageResult.buffer.byteLength > this.config.maxSize) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug("KV transform cache: File size exceeds maximum, skipping storage", {
          size: storageResult.buffer.byteLength,
          maxSize: this.config.maxSize
        });
      }
      return;
    }
    
    // Check disallowed paths
    const url = new URL(request.url);
    const path = url.pathname;
    if (this.config.disallowedPaths.some(p => path.includes(p))) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug("KV transform cache: Path in disallowed list, skipping storage", {
          path,
          disallowedPaths: this.config.disallowedPaths
        });
      }
      return;
    }
    
    // IMPORTANT: We intentionally ignore Cache-Control headers for KV transform caching
    // This is managed at the DefaultCacheService level, but we log it here for clarity
    const cacheControl = request.headers.get('Cache-Control');
    if (cacheControl && (cacheControl.includes('no-cache') || cacheControl.includes('no-store'))) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug("KV transform cache: Ignoring Cache-Control header", {
          cacheControl
        });
      }
      // Continue with caching despite the Cache-Control header
    }
    
    // Prepare cache metadata
    const ttl = this.getTtlForContentType(contentType);
    const now = Date.now();
    
    // Extract tags from response headers
    const cacheTag = response.headers.get('cache-tag');
    const tags: string[] = cacheTag ? 
      cacheTag.split(',').map(tag => tag.trim()) : 
      [];
    
    // Add default tag based on path segments
    const pathSegments = path.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      const defaultTag = pathSegments[0];
      if (!tags.includes(defaultTag)) {
        tags.push(defaultTag);
      }
    }
    
    // Create metadata
    const metadata: CacheMetadata = {
      url: request.url,
      timestamp: now,
      contentType,
      size: storageResult.buffer.byteLength,
      transformOptions,
      tags,
      ttl,
      expiration: now + (ttl * 1000),
      storageType: storageResult.storageType,
      originalSize: storageResult.originalSize,
      compressionRatio: storageResult.originalSize ? 
        storageResult.buffer.byteLength / storageResult.originalSize : 
        undefined
    };
    
    // If we have aspect crop information in transformOptions, store it in metadata
    // This helps coordinate with the metadata service to avoid duplicate processing
    if (transformOptions.aspect || transformOptions.focal) {
      metadata.aspectCropInfo = {
        aspect: transformOptions.aspect,
        focal: transformOptions.focal,
        // Flag to indicate this was processed via KV transform cache
        processedWithKV: true
      };
      
      if (typeof console !== 'undefined' && console.debug) {
        console.debug("KV transform cache: Storing aspect crop info in metadata", {
          aspect: transformOptions.aspect,
          focal: transformOptions.focal
        });
      }
    }
    
    // Generate cache key
    const key = this.generateCacheKey(request, transformOptions);
    
    if (typeof console !== 'undefined' && console.debug) {
      console.debug("KV transform cache: Storing item", {
        key,
        ttl,
        size: storageResult.buffer.byteLength,
        tags,
        useBackground: !!(ctx && this.config.backgroundIndexing)
      });
    }
    
    // Store in KV with metadata
    if (ctx && this.config.backgroundIndexing) {
      // Store in background to avoid blocking response
      ctx.waitUntil(
        this.kvNamespace.put(key, storageResult.buffer, {
          expirationTtl: ttl,
          metadata
        }).then(() => {
          if (typeof console !== 'undefined' && console.debug) {
            console.debug("KV transform cache: Successfully stored item in background", { key });
          }
        }).catch(error => {
          if (typeof console !== 'undefined' && console.error) {
            console.error("KV transform cache: Error storing item in background", { 
              key, 
              error: error instanceof Error ? error.message : String(error)
            });
          }
        })
      );
    } else {
      // Store immediately (blocking)
      try {
        await this.kvNamespace.put(key, storageResult.buffer, {
          expirationTtl: ttl,
          metadata
        });
        if (typeof console !== 'undefined' && console.debug) {
          console.debug("KV transform cache: Successfully stored item", { key });
        }
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error("KV transform cache: Error storing item", { 
            key, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
        // We don't rethrow since this is a background operation and we don't want to fail the main request
      }
    }
  }

  /**
   * Delete a specific transformation from the cache
   */
  async delete(request: Request, transformOptions: TransformOptions): Promise<void> {
    if (!this.config.enabled) return;
    
    const key = this.generateCacheKey(request, transformOptions);
    await this.kvNamespace.delete(key);
  }

  /**
   * Purge all cache entries with a specific tag
   */
  async purgeByTag(tag: string, ctx?: ExecutionContext): Promise<number> {
    if (!this.config.enabled) return 0;
    
    // Use list + filter to find keys with the specified tag
    const tagFilter = (metadata: CacheMetadata): boolean => 
      !!(metadata.tags && metadata.tags.includes(tag));
    
    const keys = await this.listKeysWithFilter(tagFilter);
    
    if (keys.length === 0) return 0;
    
    // Delete all matching keys
    if (ctx && this.config.backgroundIndexing) {
      // Delete in background to avoid blocking
      ctx.waitUntil(this.deleteKeys(keys));
      return keys.length;
    } else {
      // Delete immediately (blocking)
      await this.deleteKeys(keys);
      return keys.length;
    }
  }

  /**
   * Purge all cache entries matching a path pattern
   */
  async purgeByPath(pathPattern: string, ctx?: ExecutionContext): Promise<number> {
    if (!this.config.enabled) return 0;
    
    // Use list + filter to find keys with the matching path pattern
    const pathFilter = (metadata: CacheMetadata): boolean => 
      !!(metadata.url && metadata.url.includes(pathPattern));
    
    const keys = await this.listKeysWithFilter(pathFilter);
    
    if (keys.length === 0) return 0;
    
    // Delete all matching keys
    if (ctx && this.config.backgroundIndexing) {
      // Delete in background to avoid blocking
      ctx.waitUntil(this.deleteKeys(keys));
      return keys.length;
    } else {
      // Delete immediately (blocking)
      await this.deleteKeys(keys);
      return keys.length;
    }
  }

  /**
   * Generate a human-readable cache key for a request and transform options
   */
  generateCacheKey(request: Request, transformOptions: TransformOptions): string {
    // Get URL components
    const url = new URL(request.url);
    const basename = url.pathname.split('/').pop() || 'image';
    
    // Extract key parameters
    const mainParams: string[] = [];
    if (transformOptions.width) mainParams.push(`w${transformOptions.width}`);
    if (transformOptions.height) mainParams.push(`h${transformOptions.height}`);
    if (transformOptions.aspect) mainParams.push(`r${transformOptions.aspect.replace(':', '-')}`);
    if (transformOptions.focal) mainParams.push(`p${transformOptions.focal.replace(',', '-')}`);
    if (transformOptions.quality) mainParams.push(`q${transformOptions.quality}`);
    
    // Include 'f' parameter if present (size code or format code)
    if (transformOptions.f) mainParams.push(`f${transformOptions.f}`);
    
    // Include remaining common transform parameters
    if (transformOptions.fit) mainParams.push(`fit${transformOptions.fit}`);
    if (transformOptions.dpr) mainParams.push(`dpr${transformOptions.dpr}`);
    if (transformOptions.background) mainParams.push(`bg${transformOptions.background.substring(0, 6)}`);
    if (transformOptions.blur) mainParams.push(`blur${transformOptions.blur}`);
    if (transformOptions.brightness) mainParams.push(`br${transformOptions.brightness}`);
    if (transformOptions.contrast) mainParams.push(`con${transformOptions.contrast}`);
    if (transformOptions.saturation) mainParams.push(`sat${transformOptions.saturation}`);
    if (transformOptions.sharpen) mainParams.push(`sh${transformOptions.sharpen}`);
    if (transformOptions.rotate) mainParams.push(`rot${transformOptions.rotate}`);
    if (transformOptions.gamma) mainParams.push(`g${transformOptions.gamma}`);
    if (transformOptions.compression) mainParams.push(`comp${transformOptions.compression}`);
    if (transformOptions.gravity && typeof transformOptions.gravity === 'string') mainParams.push(`grav${transformOptions.gravity}`);
    
    // Determine output format
    const format = transformOptions.format || 'auto';
    
    // Extract raw URL parameters for any custom parameters
    // This ensures all parameters are part of the cache key
    const urlParams = new URLSearchParams(url.search);
    const customParams: string[] = [];
    
    // First, make sure the 'f' parameter is included if it's in the URL
    const urlFParam = urlParams.get('f');
    if (urlFParam && !transformOptions.f) {
      mainParams.push(`f${urlFParam}`);
      
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('Adding f parameter from URL to cache key:', {
          fValue: urlFParam,
          source: 'url'
        });
      }
    }
    
    for (const [key, value] of urlParams.entries()) {
      // Include any parameters that affect the image and aren't already covered
      // Especially important for custom parameters and format codes
      if (!['w', 'h', 'width', 'height', 'r', 'aspect', 'p', 'focal', 'q', 'quality', 'format'].includes(key)) {
        // Skip 'f' parameter as we've already handled it above
        if (key !== 'f') {
          customParams.push(`${key}${value}`);
        }
      }
    }
    
    // Sort custom parameters for consistent order
    if (customParams.length > 0) {
      customParams.sort();
      mainParams.push(...customParams);
    }
    
    // Log detailed transform options for debugging
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('Generating cache key with transform options:', {
        url: request.url,
        transformOptions: JSON.stringify(transformOptions),
        mainParams,
        format,
        urlParams: url.search
      });
    }
    
    // Create a hash based on the pathname, search params, and stringified transform options
    // This provides uniqueness even when two sets of different parameters result in similar mainParams
    const transformString = JSON.stringify(transformOptions);
    
    // For cache key consistency, we need to capture the exact set of URL parameters
    // First, extract the raw URL search string, preserving exact format
    const rawSearchParams = url.search;
    
    // We'll use the original search parameters directly to ensure identical hash generation
    // Create a comprehensive hash input that maintains the exact format from the URL
    const hashInput = `${url.pathname}${rawSearchParams}${transformString}`;
    const hash = this.createShortHash(hashInput);
    
    // Log debug info about f parameter if present
    if (transformOptions.f && typeof console !== 'undefined' && console.debug) {
      console.debug('F parameter in cache key:', {
        fValue: transformOptions.f,
        fType: typeof transformOptions.f,
        inParams: mainParams.some(p => p.startsWith('f')),
        inHash: hashInput.includes(`"f":"${transformOptions.f}"`) || hashInput.includes(`"f":${transformOptions.f}`)
      });
    }
    
    // Combine components into a human-readable key
    const params = mainParams.length > 0 ? mainParams.join('-') : 'default';
    const cacheKey = `${this.config.prefix}:${basename}:${params}:${format}:${hash}`;
    
    // Log the generated cache key for debugging
    if (typeof console !== 'undefined' && console.debug) {
      // Calculate truncated version of hash input for logging
      const hashInputSummary = hashInput.length > 200 ? 
        `${hashInput.substring(0, 100)}...${hashInput.substring(hashInput.length - 100)}` : 
        hashInput;
        
      console.debug('Generated cache key:', {
        cacheKey,
        basename,
        params,
        format,
        hash,
        hashInputSummary,
        rawTransformOptions: transformString
      });
    }
    
    return cacheKey;
  }

  /**
   * List cache entries (for debugging and management)
   */
  async listEntries(limit: number = 100, cursor?: string): Promise<{
    entries: {key: string, metadata: CacheMetadata}[],
    cursor?: string,
    complete: boolean
  }> {
    if (!this.config.enabled) {
      return {
        entries: [],
        complete: true
      };
    }
    
    const result = await this.kvNamespace.list<CacheMetadata>({
      prefix: this.config.prefix,
      limit,
      cursor
    });
    
    return {
      entries: result.keys.map(key => ({
        key: key.name,
        metadata: key.metadata as CacheMetadata
      })),
      cursor: (result as any).cursor || (result as any).cursor_token, // Handle different KV versions
      complete: result.list_complete
    };
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    count: number,
    size: number,
    hitRate: number,
    avgSize: number,
    lastPruned: Date,
    memoryCacheSize: number,
    memoryCacheHitRate: number
  }> {
    if (!this.config.enabled) {
      return {
        count: 0,
        size: 0,
        hitRate: 0,
        avgSize: 0,
        lastPruned: this.stats.lastPruned,
        memoryCacheSize: 0,
        memoryCacheHitRate: 0
      };
    }
    
    // Count entries and accumulate size
    let totalSize = 0;
    let count = 0;
    let cursor: string | undefined;
    let complete = false;
    
    while (!complete) {
      const result = await this.kvNamespace.list<CacheMetadata>({
        prefix: this.config.prefix,
        cursor,
        limit: 1000
      });
      
      for (const key of result.keys) {
        count++;
        if (key.metadata && (key.metadata as CacheMetadata).size) {
          totalSize += (key.metadata as CacheMetadata).size;
        }
      }
      
      cursor = (result as any).cursor || (result as any).cursor_token;
      complete = result.list_complete || !cursor;
    }
    
    // Calculate statistics
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    const avgSize = count > 0 ? totalSize / count : 0;
    const memoryCacheHitRate = this.stats.hits > 0 ? 
      (this.stats.memoryCacheHits / this.stats.hits) * 100 : 0;
    
    return {
      count,
      size: totalSize,
      hitRate,
      avgSize,
      lastPruned: this.stats.lastPruned,
      memoryCacheSize: this.memoryCache.size(),
      memoryCacheHitRate
    };
  }

  /**
   * Perform cache maintenance including pruning expired entries
   */
  async performMaintenance(maxEntriesToPrune: number = 1000, ctx?: ExecutionContext): Promise<number> {
    if (!this.config.enabled) return 0;
    
    const now = Date.now();
    
    // Find expired entries
    const expiredFilter = (metadata: CacheMetadata): boolean => 
      !!(metadata.expiration && metadata.expiration < now);
    
    const expiredKeys = await this.listKeysWithFilter(expiredFilter, maxEntriesToPrune);
    
    if (expiredKeys.length === 0) {
      this.stats.lastPruned = new Date();
      return 0;
    }
    
    // Delete expired entries
    if (ctx && this.config.backgroundIndexing) {
      // Delete in background
      ctx.waitUntil(this.deleteKeys(expiredKeys));
    } else {
      // Delete immediately (blocking)
      await this.deleteKeys(expiredKeys);
    }
    
    this.stats.lastPruned = new Date();
    return expiredKeys.length;
  }

  /**
   * Create a short hash for a string (used in key generation)
   * Uses an enhanced FNV-1a implementation which is both fast and reliable
   * 
   * @param {string} input - The input string to hash
   * @return {string} The 8-character hex hash
   */
  private createShortHash(input: string): string {
    // Log hash inputs for debugging when needed
    if (this.config.debug && typeof console !== 'undefined' && console.debug) {
      // Truncate long inputs to prevent log flooding
      const truncatedInput = input.length > 100 
        ? `${input.substring(0, 50)}...${input.substring(input.length - 50)}`
        : input;
      
      console.debug('Creating hash for input', {
        inputLength: input.length,
        inputPrefix: truncatedInput
      });
    }
    
    // Generate the hash using our improved FNV-1a implementation
    const hash = fnv1a(input);
    
    if (this.config.debug && typeof console !== 'undefined' && console.debug) {
      console.debug('Hash created', { hash });
    }
    
    return hash;
  }

  /**
   * Get TTL value for a specific content type
   */
  private getTtlForContentType(contentType: string): number {
    if (this.config.contentTypeTtls && contentType in this.config.contentTypeTtls) {
      return this.config.contentTypeTtls[contentType];
    }
    return this.config.defaultTtl;
  }

  /**
   * List cache keys with filtering based on metadata
   */
  private async listKeysWithFilter(
    filterFn: (metadata: CacheMetadata) => boolean, 
    limit: number = 1000,
    cursor?: string
  ): Promise<string[]> {
    const matchingKeys: string[] = [];
    let currentCursor = cursor;
    let complete = false;
    
    // Paginate through all keys
    while (!complete && matchingKeys.length < limit) {
      // List keys with metadata
      const result = await this.kvNamespace.list<CacheMetadata>({
        prefix: this.config.prefix,
        cursor: currentCursor,
        limit: 1000
      });
      
      // Filter keys based on metadata
      for (const item of result.keys) {
        if (!item.metadata) continue;
        if (filterFn(item.metadata as CacheMetadata)) {
          matchingKeys.push(item.name);
          if (matchingKeys.length >= limit) break;
        }
      }
      
      // Update for next iteration
      currentCursor = (result as any).cursor || (result as any).cursor_token;
      complete = result.list_complete;
      if (complete || !currentCursor || matchingKeys.length >= limit) break;
    }
    
    return matchingKeys.slice(0, limit);
  }

  /**
   * Delete multiple keys in batches
   */
  private async deleteKeys(keys: string[]): Promise<void> {
    const batchSize = 100;
    
    // Process in batches to avoid hitting operation limits
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const promises = batch.map(key => this.kvNamespace.delete(key));
      
      // Wait between batches to reduce KV operation pressure
      await Promise.all(promises);
      
      if (i + batchSize < keys.length && this.config.purgeDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.purgeDelay));
      }
    }
  }
}