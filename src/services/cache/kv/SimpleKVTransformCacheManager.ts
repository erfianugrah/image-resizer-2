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
    
    // Check if logger has performance tracking capabilities
    if (this.logger) {
      this.logDebug('Initialized memory cache with capacity ' + memoryCacheSize, {
        operation: 'kv_transform_cache_init',
        memoryCacheSize,
        enabled: this.config.enabled
      });
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
   * Helper function to check KV for a specific key with error handling
   * @private
   */
  private async checkKeyExists(key: string, url: URL, startTime: number): Promise<boolean> {
    try {
      const operationStartTime = Date.now();
      this.logDebug('KV transform cache: Checking format-specific exists', {
        operation: 'kv_key_check',
        key,
        format: key.split(':')[3] || 'unknown'
      });
      
      // Working around TypeScript errors with KV types
      const metadata = await (this.kvNamespace as any).getWithMetadata(key, { type: 'metadata' });
      const duration = Date.now() - startTime;
      const operationDuration = Date.now() - operationStartTime;
      
      const exists = metadata.metadata !== null;
      
      this.logDebug('KV transform cache: Key check - ' + (exists ? 'exists' : 'not found'), {
        operation: 'kv_key_check',
        result: exists ? 'hit' : 'miss',
        key,
        url: url.toString(),
        path: url.pathname,
        durationMs: duration,
        operationMs: operationDuration
      });
      
      // Add more detailed logging for a successful key check
      if (exists) {
        this.logDebug('KV transform cache: Format-specific key exists', {
          key,
          keyFormat: key.split(':')[3] || 'unknown'
        });
      }
      
      return exists;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logError('KV transform cache: Error checking key existence', {
        operation: 'kv_key_check',
        category: 'cache',
        result: 'error',
        key,
        url: url.toString(),
        path: url.pathname,
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      });
      
      // If there's an error, assume it's not cached
      return false;
    }
  }

  /**
   * Check if a transformation is cached using format-aware lookup
   * with optimized format prioritization
   */
  async isCached(request: Request, transformOptions: TransformOptions): Promise<boolean> {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    if (!this.config.enabled) {
      this.logDebug('KV transform cache is disabled', {
        operation: 'kv_is_cached',
        category: 'cache',
        result: 'miss',
        reason: 'disabled',
        url: url.toString(),
        path: url.pathname,
        durationMs: 0
      });
      return false;
    }
    
    // Early return for metadata requests (format=json)
    // These are handled by the metadata service with its own caching mechanism
    const requestedFormatParam = url.searchParams.get('format');
    const requestedOptionsFormat = transformOptions.format;
    
    if (requestedFormatParam === 'json' || requestedOptionsFormat === 'json') {
      this.logDebug('KV transform cache: Skipping lookup for format=json request', { 
        operation: 'kv_json_bypass',
        url: url.toString(),
        durationMs: Date.now() - startTime
      });
      // Return immediately for JSON requests
      return false;
    }
    
    // Track formats we've already checked to avoid duplicates
    const checkedFormats = new Set<string>();
    
    // Priority 1: Check the format specified by CloudflareImageTransformer first (highest priority)
    if (transformOptions.format && transformOptions.format !== 'auto') {
      checkedFormats.add(transformOptions.format);
      const formatKey = this.generateCacheKey(request, transformOptions, transformOptions.format);
      
      this.logDebug('KV transform cache: Checking if cached with decided format first', {
        operation: 'kv_prioritized_is_cached',
        category: 'cache',
        format: transformOptions.format,
        priority: 'highest'
      });
      
      const exists = await this.checkKeyExists(formatKey, url, startTime);
      if (exists) return true;
    }
    
    // Priority 2: Check client-supported formats based on clientInfo (if available)
    const clientInfo = transformOptions.__clientInfo;
    const supportedFormats: string[] = [];
    
    if (clientInfo?.formatSupport) {
      // Build list of supported formats based on client capabilities
      if (clientInfo.formatSupport.avif) supportedFormats.push('avif');
      if (clientInfo.formatSupport.webp) supportedFormats.push('webp');
      
      this.logDebug('KV transform cache: Checking if cached in client-supported formats', {
        operation: 'kv_prioritized_is_cached',
        category: 'cache',
        supportedFormats: supportedFormats.join(', '),
        priority: 'high',
        clientInfo: clientInfo.deviceType
      });
      
      // Check only the formats that client supports and haven't been checked yet
      for (const format of supportedFormats) {
        if (checkedFormats.has(format)) continue; // Skip if already checked
        
        checkedFormats.add(format);
        const formatKey = this.generateCacheKey(request, transformOptions, format);
        const exists = await this.checkKeyExists(formatKey, url, startTime);
        if (exists) return true;
      }
    }
    
    // Priority 3: Check 'auto' format if not already checked
    if (!checkedFormats.has('auto')) {
      checkedFormats.add('auto');
      
      this.logDebug('KV transform cache: Checking if cached with auto format', {
        operation: 'kv_prioritized_is_cached',
        category: 'cache',
        format: 'auto',
        priority: 'medium'
      });
      
      const baseKey = this.generateCacheKey(request, transformOptions);
      const exists = await this.checkKeyExists(baseKey, url, startTime);
      if (exists) return true;
    }
    
    // Priority 4: Check remaining common formats as fallback
    const fallbackFormats = ['jpeg', 'png', 'gif', 'webp', 'avif'];
    
    this.logDebug('KV transform cache: Checking if cached in fallback formats', {
      operation: 'kv_prioritized_is_cached',
      category: 'cache',
      formats: fallbackFormats.filter(f => !checkedFormats.has(f)).join(', '),
      priority: 'low'
    });
    
    for (const format of fallbackFormats) {
      // Skip formats we've already checked
      if (checkedFormats.has(format)) continue;
      
      checkedFormats.add(format);
      const formatKey = this.generateCacheKey(request, transformOptions, format);
      const exists = await this.checkKeyExists(formatKey, url, startTime);
      if (exists) return true;
    }
    
    // Log overall outcome after all format checks
    const duration = Date.now() - startTime;
    this.logDebug('KV transform cache: Format-aware isCached - not found in any format', {
      operation: 'kv_is_cached',
      category: 'cache',
      result: 'miss',
      url: url.toString(),
      path: url.pathname,
      durationMs: duration,
      transformOptions: typeof transformOptions === 'object' ? 
        Object.keys(transformOptions).join(',') : 'none',
      formatsChecked: Array.from(checkedFormats).join(','),
      checkedCount: checkedFormats.size
    });
    
    return false;
  }

  /**
   * Helper function to retrieve a specific cache key from KV
   * @private
   */
  private async getFromKV(key: string, url: URL, startTime: number, transformOptions: TransformOptions): Promise<TransformCacheResult | null> {
    try {
      const operationStartTime = Date.now();
      this.logDebug('KV transform cache: Checking format-specific key', {
        operation: 'kv_key_get',
        category: 'cache',
        key,
        format: key.split(':')[3] || 'unknown'
      });

      // Working around TypeScript errors with KV types
      const result = await (this.kvNamespace as any).getWithMetadata(key, { type: 'arrayBuffer' });
      const duration = Date.now() - startTime;
      const operationDuration = Date.now() - operationStartTime;
      
      if (result.value === null || result.metadata === null) {
        this.logDebug('KV transform cache: Key not found', {
          operation: 'kv_key_get',
          category: 'cache',
          result: 'miss',
          reason: 'not_found',
          key,
          url: url.toString(),
          path: url.pathname,
          durationMs: duration,
          operationMs: operationDuration
        });
        return null;
      }
      
      // Verify that the cached content has valid metadata with a content type
      if (!result.metadata.contentType) {
        this.logWarn('KV transform cache: Retrieved cache item is missing content type', {
          operation: 'kv_key_get',
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
        this.logWarn('KV transform cache: Retrieved cache item has non-image content type', {
          operation: 'kv_key_get',
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
      
      // Valid hit - create the cache result
      this.logDebug('KV transform cache: Key hit', {
        operation: 'kv_key_get',
        category: 'cache',
        result: 'hit',
        key,
        contentType: result.metadata.contentType,
        size: result.metadata.size,
        url: url.toString(),
        path: url.pathname,
        durationMs: duration,
        operationMs: operationDuration,
        age: Date.now() - (result.metadata.timestamp || 0)
      });
      
      this.logDebug('KV transform cache: Format-specific cache hit', {
        key,
        contentType: result.metadata.contentType,
        originalFormat: transformOptions.format || 'auto',
        keyFormat: key.split(':')[3] || 'unknown'
      });
      
      // Create the cache result to return
      const cacheResult = {
        value: result.value,
        metadata: result.metadata,
        key
      };
      
      return cacheResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logError('KV transform cache: Error retrieving specific key', {
        operation: 'kv_key_get',
        result: 'error',
        key,
        url: url.toString(),
        path: url.pathname,
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return null;
    }
  }

  /**
   * Get a cached transformation with format-aware lookups
   */
  async get(request: Request, transformOptions: TransformOptions): Promise<TransformCacheResult | null> {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    if (!this.config.enabled) {
      this.logDebug('KV transform cache is disabled', {
        operation: 'kv_get',
        category: 'cache',
        result: 'miss',
        reason: 'disabled',
        url: url.toString(),
        path: url.pathname,
        durationMs: 0
      });
      return null;
    }
    
    // Early return for metadata requests (format=json)
    // These are handled by the metadata service with its own caching mechanism
    const requestedFormatParam = url.searchParams.get('format');
    const requestedOptionsFormat = transformOptions.format;
    
    if (requestedFormatParam === 'json' || requestedOptionsFormat === 'json') {
      this.logDebug('KV transform cache: Skipping lookup for format=json request', { 
        operation: 'kv_json_bypass',
        url: url.toString(),
        durationMs: Date.now() - startTime
      });
      // Return immediately for JSON requests
      return null;
    }
    
    // Generate a base key (using auto format) - used for memory cache primarily
    const baseKey = this.generateCacheKey(request, transformOptions);
    
    // Check memory cache first (much faster than KV)
    const memoryCacheResult = this.memoryCache.get(baseKey);
    if (memoryCacheResult) {
      this.stats.hits++;
      this.stats.memoryCacheHits++;
      
      this.logDebug('Memory cache: Hit', {
        operation: 'memory_get',
        category: 'cache',
        result: 'hit',
        key: baseKey,
        contentType: memoryCacheResult.metadata.contentType,
        size: memoryCacheResult.metadata.size,
        url: url.toString(),
        path: url.pathname,
        durationMs: 0, // Negligible time for memory cache
        age: Date.now() - (memoryCacheResult.metadata.timestamp || 0)
      });
      
      return memoryCacheResult;
    }
    
    // Try a format-aware KV lookup with optimized order
    let cacheResult: TransformCacheResult | null = null;
    
    // Track formats we've already checked to avoid duplicates
    const checkedFormats = new Set<string>();
    
    // Track the actual format requested for optimal priority-based lookups
    const requestedFormat = transformOptions.format && transformOptions.format !== 'auto' ? 
      transformOptions.format : undefined;
        
    // Format prioritization strategy
    // Priority 1: Check the format specified by CloudflareImageTransformer first (highest priority)
    if (requestedFormat) {
      const formatKey = this.generateCacheKey(request, transformOptions, requestedFormat);
      checkedFormats.add(requestedFormat);
      
      this.logDebug('KV transform cache: Checking decided format first', {
        operation: 'kv_prioritized_check',
        category: 'cache',
        format: requestedFormat,
        priority: 'highest'
      });
      
      cacheResult = await this.getFromKV(formatKey, url, startTime, transformOptions);
      if (cacheResult) {
        this.stats.hits++;
        // Store in memory cache for faster future access
        this.memoryCache.put(baseKey, cacheResult);
        
        // Log the successful hit
        this.logDebug('KV transform cache: Cache hit using decided format', {
          operation: 'kv_get',
          category: 'cache',
          result: 'hit',
          key: formatKey,
          contentType: cacheResult.metadata.contentType,
          size: cacheResult.metadata.size,
          url: url.toString(),
          path: url.pathname,
          durationMs: Date.now() - startTime,
          format: requestedFormat,
          source: 'format_priority'
        });
        
        return cacheResult;
      }
    }
    
    // Priority 2: Check client-supported formats based on clientInfo (if available)
    // Extract the client info from transformOptions.__clientInfo if present
    const clientInfo = transformOptions.__clientInfo;
    const supportedFormats: string[] = [];
    
    if (clientInfo?.formatSupport) {
      // Build list of supported formats based on client capabilities
      if (clientInfo.formatSupport.avif) supportedFormats.push('avif');
      if (clientInfo.formatSupport.webp) supportedFormats.push('webp');
      
      this.logDebug('KV transform cache: Checking client-supported formats', {
        operation: 'kv_prioritized_check',
        category: 'cache',
        supportedFormats: supportedFormats.join(', '),
        priority: 'high',
        clientInfo: clientInfo.deviceType
      });
      
      // Check only the formats that client supports and haven't been checked yet
      for (const format of supportedFormats) {
        if (checkedFormats.has(format)) continue; // Skip if already checked
        
        checkedFormats.add(format);
        const formatKey = this.generateCacheKey(request, transformOptions, format);
        cacheResult = await this.getFromKV(formatKey, url, startTime, transformOptions);
        
        if (cacheResult) {
          this.stats.hits++;
          // Store in memory cache for faster future access
          this.memoryCache.put(baseKey, cacheResult);
          
          // Log the successful hit
          this.logDebug('KV transform cache: Cache hit using client-supported format', {
            operation: 'kv_get',
            category: 'cache',
            result: 'hit',
            key: formatKey,
            contentType: cacheResult.metadata.contentType,
            size: cacheResult.metadata.size,
            url: url.toString(),
            path: url.pathname,
            durationMs: Date.now() - startTime,
            format,
            source: 'client_support'
          });
          
          // Even if we found a cache hit with a different format than requested,
          // we should return this hit since the client supports this format
          return cacheResult;
        }
      }
    }
    
    // Priority 3: Check 'auto' format if not already checked
    if (!checkedFormats.has('auto')) {
      checkedFormats.add('auto');
      
      this.logDebug('KV transform cache: Checking auto format', {
        operation: 'kv_prioritized_check',
        category: 'cache',
        format: 'auto',
        priority: 'medium'
      });
      
      cacheResult = await this.getFromKV(baseKey, url, startTime, transformOptions);
      if (cacheResult) {
        this.stats.hits++;
        // Store in memory cache for faster future access
        this.memoryCache.put(baseKey, cacheResult);
        
        // Log the successful hit
        this.logDebug('KV transform cache: Cache hit using auto format', {
          operation: 'kv_get',
          category: 'cache',
          result: 'hit',
          key: baseKey,
          contentType: cacheResult.metadata.contentType,
          size: cacheResult.metadata.size,
          url: url.toString(),
          path: url.pathname,
          durationMs: Date.now() - startTime,
          format: 'auto',
          source: 'auto_format'
        });
        
        return cacheResult;
      }
    }
    
    // Priority 4: Get list of keys to check any cached format
    // Don't hardcode format priorities - let the cache return whatever was stored
    const fallbackFormats = ['jpeg', 'png', 'gif', 'webp', 'avif'];
    
    this.logDebug('KV transform cache: Checking fallback formats', {
      operation: 'kv_prioritized_check',
      category: 'cache',
      formats: fallbackFormats.filter(f => !checkedFormats.has(f)).join(', '),
      priority: 'low'
    });
    
    for (const format of fallbackFormats) {
      // Skip formats we've already checked
      if (checkedFormats.has(format)) continue;
      
      checkedFormats.add(format);
      const formatKey = this.generateCacheKey(request, transformOptions, format);
      cacheResult = await this.getFromKV(formatKey, url, startTime, transformOptions);
      
      if (cacheResult) {
        this.stats.hits++;
        // Store in memory cache for faster future access
        this.memoryCache.put(baseKey, cacheResult);
        
        // Log the successful hit with detailed format comparison
        const cachedFormat = cacheResult.metadata.contentType.split('/')[1]?.split(';')[0] || 'unknown';
        
        this.logDebug('KV transform cache: Cache hit using fallback format', {
          operation: 'kv_get',
          category: 'cache',
          result: 'hit',
          key: formatKey,
          contentType: cacheResult.metadata.contentType,
          cachedFormat,
          requestedFormat: requestedFormat || 'auto',
          size: cacheResult.metadata.size,
          url: url.toString(),
          path: url.pathname,
          durationMs: Date.now() - startTime,
          format,
          source: 'fallback'
        });
        
        return cacheResult;
      }
    }
    
    // If we got here, no cache hit was found
    this.stats.misses++;
    
    // Log overall outcome after all format checks
    const duration = Date.now() - startTime;
    this.logDebug('KV transform cache: Format-aware get - not found in any format', {
      operation: 'kv_get',
      category: 'cache',
      result: 'miss',
      url: url.toString(),
      path: url.pathname,
      durationMs: duration,
      transformOptions: typeof transformOptions === 'object' ? 
        Object.keys(transformOptions).join(',') : 'none',
      formatsChecked: Array.from(checkedFormats).join(','),
      checkedCount: checkedFormats.size
    });
    
    return null;
  }

  /**
   * Store for tracking operations to prevent duplicates within a single request
   * This acts like a request-scoped deduplication cache
   * @private
   */
  private readonly operationCache = new Map<string, boolean>();
  
  /**
   * Generate a unique operation key to deduplicate cache operations
   * @param url The request URL
   * @param transformOptions Transform options being applied
   * @returns A unique key for this operation
   * @private
   */
  private generateOperationKey(url: string, transformOptions: TransformOptions): string {
    const transformString = JSON.stringify(transformOptions);
    return `${url}:${transformString}`;
  }
  
  /**
   * Determine if the response is actually a transformed image, not just the original image
   */
  private isActuallyTransformed(
    response: Response, 
    storageResult: TransformStorageResult, 
    transformOptions: TransformOptions
  ): boolean {
    // Get response content type and original content type
    const responseContentType = response.headers.get('content-type') || '';
    const originalContentType = storageResult.contentType || '';
    
    // Get response size and original size
    const responseSize = parseInt(response.headers.get('content-length') || '0', 10) || 
                         storageResult.buffer.byteLength;
    const originalSize = storageResult.originalSize || storageResult.size || 0;
    
    // Calculate size ratio (transformed should be smaller)
    const sizeRatio = responseSize / (originalSize || 1);
    
    // Format transformation check
    const responseFormat = responseContentType.split('/')[1]?.split(';')[0] || '';
    const originalFormat = originalContentType.split('/')[1]?.split(';')[0] || '';
    const formatChanged = responseFormat !== originalFormat && responseFormat !== '';
    
    // Dimension transformation check
    const dimensionsChanged = !!(transformOptions.width || transformOptions.height);
    
    // Aspect ratio crop transformation check
    const aspectCropApplied = !!(transformOptions.aspect && transformOptions.fit === 'crop');
    
    // Other image manipulations
    const otherManipulations = !!(
      transformOptions.blur || 
      transformOptions.brightness || 
      transformOptions.contrast || 
      transformOptions.gamma || 
      transformOptions.sharpen || 
      transformOptions.rotate
    );
    
    // Define transformation criteria
    const transformationApplied = {
      // Size reduction (allow for some margin, but should be significantly smaller)
      // For some operations like metadata addition, the file might be slightly larger
      sizeReduced: sizeRatio < 0.95,
      // Format conversion
      formatChanged,
      // Explicit crop transformation
      aspectCropApplied,
      // Explicit dimensions changed
      dimensionsChanged,
      // Other image manipulations
      otherManipulations
    };
    
    // Log transformation validation details for debugging
    this.logDebug('Validating transformation before caching', {
      transformationApplied,
      originalSize,
      responseSize,
      sizeRatio: sizeRatio.toFixed(2),
      originalFormat,
      responseFormat,
      hasAspect: !!transformOptions.aspect,
      aspectRatio: transformOptions.aspect,
      fit: transformOptions.fit,
      focal: transformOptions.focal,
      width: transformOptions.width,
      height: transformOptions.height
    });
    
    // Must meet at least one transformation criterion to be considered transformed
    // If it's very close to original size and no other transformations, it's likely untransformed
    return transformationApplied.sizeReduced || 
           transformationApplied.formatChanged || 
           transformationApplied.aspectCropApplied ||
           (transformationApplied.dimensionsChanged && sizeRatio < 0.99) ||
           transformationApplied.otherManipulations;
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
    
    // Generate a unique operation key for deduplication
    const operationKey = this.generateOperationKey(request.url, transformOptions);
    
    // Check if this exact operation was already performed in this request lifecycle
    if (this.operationCache.has(operationKey)) {
      this.logDebug('KV transform cache: Skipping duplicate operation', {
        url: request.url,
        operationKey
      });
      return;
    }
    
    // Log the initiation of a KV transform cache operation
    this.logDebug('SimpleKVTransformCacheManager.put called', {
      url: request.url,
      hasBuffer: !!storageResult.buffer,
      bufferSize: storageResult.buffer ? storageResult.buffer.byteLength : 0,
      status: response.status,
      contentType: response.headers.get('content-type')
    });
    
    // Skip caching for metadata requests (format=json)
    // These are already handled by the metadata service
    if (transformOptions.format === 'json' || request.url.includes('format=json')) {
      this.logDebug('KV transform cache: Skipping storage for metadata request', {
        url: request.url,
        format: transformOptions.format
      });
      return;
    }
    
    // Check if we should cache this response
    if (!storageResult.buffer) {
      this.logDebug('KV transform cache: Missing buffer, skipping storage', {
        storageResultKeys: Object.keys(storageResult).join(','),
        hasResponse: !!storageResult.response,
        contentType: storageResult.contentType,
        size: storageResult.size
      });
      return;
    }
    
    if (response.status !== 200) {
      this.logDebug('KV transform cache: Non-200 status, skipping storage', {
        status: response.status
      });
      return;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      this.logDebug('KV transform cache: Non-image content type, skipping storage', {
        contentType
      });
      return;
    }
    
    // Verify this is actually a transformed image, not just the original
    if (!this.isActuallyTransformed(response, storageResult, transformOptions)) {
      this.logWarn('KV transform cache: Skipping cache for untransformed image', {
        url: request.url,
        contentType: response.headers.get('content-type'),
        originalContentType: storageResult.contentType,
        transformOptions: JSON.stringify(transformOptions),
        size: storageResult.buffer.byteLength,
        originalSize: storageResult.size
      });
      return;
    }
    
    // Check file size limits
    if (storageResult.buffer.byteLength > this.config.maxSize) {
      this.logDebug('KV transform cache: File size exceeds maximum, skipping storage', {
        size: storageResult.buffer.byteLength,
        maxSize: this.config.maxSize
      });
      return;
    }
    
    // Check disallowed paths
    const url = new URL(request.url);
    const path = url.pathname;
    if (this.config.disallowedPaths.some(p => path.includes(p))) {
      this.logDebug('KV transform cache: Path in disallowed list, skipping storage', {
        path,
        disallowedPaths: this.config.disallowedPaths
      });
      return;
    }
    
    // IMPORTANT: We intentionally ignore Cache-Control headers for KV transform caching
    // This is managed at the DefaultCacheService level, but we log it here for clarity
    const cacheControl = request.headers.get('Cache-Control');
    if (cacheControl && (cacheControl.includes('no-cache') || cacheControl.includes('no-store'))) {
      this.logDebug('KV transform cache: Ignoring Cache-Control header', {
        cacheControl
      });
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
      // Key identifies
      url: request.url,
      timestamp: now,
      // Image properties (dimensions from transform options)
      width: transformOptions.width ? parseInt(String(transformOptions.width), 10) : undefined,
      height: transformOptions.height ? parseInt(String(transformOptions.height), 10) : undefined,
      // Content information
      contentType,
      size: storageResult.buffer.byteLength,
      // Cache control properties
      ttl,
      expiration: now + (ttl * 1000),
      // Additional metadata
      transformOptions,
      tags,
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
        console.debug('KV transform cache: Storing aspect crop info in metadata', {
          aspect: transformOptions.aspect,
          focal: transformOptions.focal
        });
      }
    }
    
    // Extract format from content-type to use in cache key
    let actualFormat: string | undefined;
    if (contentType) {
      const formatMatch = contentType.match(/image\/(\w+)/);
      if (formatMatch && formatMatch[1]) {
        actualFormat = formatMatch[1];
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('KV transform cache: Extracted format from content-type', {
            contentType,
            format: actualFormat,
            requestedFormat: transformOptions.format || 'auto'
          });
        }
      }
    }
    
    // Generate cache key using actual format from response
    const key = this.generateCacheKey(request, transformOptions, actualFormat);
    
    this.logDebug('KV transform cache: Storing item', {
      key,
      ttl,
      size: storageResult.buffer.byteLength,
      tags,
      useBackground: !!(ctx && this.config.backgroundIndexing),
      actualFormat
    });
    
    // Mark this operation as completed to prevent duplicates
    this.operationCache.set(operationKey, true);
    
    // Import background operations utility
    try {
      const { runInBackground } = await import('../../../utils/backgroundOperations');
      
      // Define storage operation as an async function
      const storeOperation = async () => {
        try {
          await this.kvNamespace.put(key, storageResult.buffer, {
            metadata
          });
          this.logDebug('KV transform cache: Successfully stored item', { key });
        } catch (error) {
          this.logError('KV transform cache: Error storing item', { 
            key, 
            error: error instanceof Error ? error.message : String(error)
          });
          // Re-throw so the background operation can handle it properly
          throw error;
        }
      };
      
      // Use the background operations utility to manage waitUntil
      if (ctx && this.config.backgroundIndexing) {
        // Logger needs to be a valid Logger object or undefined
        const logger = this.logger || undefined;
        
        // Run in background with waitUntil
        runInBackground(
          storeOperation,
          "KVTransformCacheStore",
          logger as any,
          ctx
        );
      } else {
        // Store immediately (blocking)
        await storeOperation();
      }
    } catch (importError) {
      // Fall back to original implementation if import fails
      this.logWarn('KV transform cache: Failed to import background operations utility, falling back to direct implementation', {
        error: importError instanceof Error ? importError.message : String(importError)
      });
      
      // Store in KV with metadata using the original implementation
      if (ctx && this.config.backgroundIndexing) {
        // Store in background to avoid blocking response
        ctx.waitUntil(
          this.kvNamespace.put(key, storageResult.buffer, {
            metadata
          }).then(() => {
            this.logDebug('KV transform cache: Successfully stored item in background', { key });
          }).catch(error => {
            this.logError('KV transform cache: Error storing item in background', { 
              key, 
              error: error instanceof Error ? error.message : String(error)
            });
          })
        );
      } else {
        // Store immediately (blocking)
        try {
          await this.kvNamespace.put(key, storageResult.buffer, {
            metadata
          });
          this.logDebug('KV transform cache: Successfully stored item', { key });
        } catch (error) {
          this.logError('KV transform cache: Error storing item', { 
            key, 
            error: error instanceof Error ? error.message : String(error)
          });
          // We don't rethrow since this is a background operation and we don't want to fail the main request
        }
      }
    }
  }

  /**
   * Delete a specific transformation from the cache with format-aware approach
   */
  async delete(request: Request, transformOptions: TransformOptions): Promise<void> {
    if (!this.config.enabled) return;
    
    const url = new URL(request.url);
    const startTime = Date.now();
    const keysToDelete: string[] = [];
    
    // First, add the default key (auto format)
    const baseKey = this.generateCacheKey(request, transformOptions);
    keysToDelete.push(baseKey);
    
    // If format is specified and not 'auto', add that format key as well
    if (transformOptions.format && transformOptions.format !== 'auto') {
      const formatKey = this.generateCacheKey(request, transformOptions, transformOptions.format);
      keysToDelete.push(formatKey);
    }
    
    // Add keys for all possible formats to ensure complete cache cleanup
    for (const format of ['jpeg', 'png', 'gif', 'webp', 'avif']) {
      // Skip if it's the same as the explicitly requested format
      if (format === transformOptions.format) continue;
      
      const formatKey = this.generateCacheKey(request, transformOptions, format);
      keysToDelete.push(formatKey);
    }
    
    // Deduplicate keys (in case any are identical)
    const uniqueKeys = [...new Set(keysToDelete)];
    
    // Delete all potential format keys
    const deletePromises = uniqueKeys.map(key => this.kvNamespace.delete(key));
    await Promise.all(deletePromises);
    
    // Also remove from memory cache if present
    if (this.memoryCache.has(baseKey)) {
      this.memoryCache.clear(); // Simply clear the entire memory cache on delete
    }
    
    const duration = Date.now() - startTime;
    this.logDebug('KV transform cache: Format-aware delete completed', {
      operation: 'kv_delete',
      url: url.toString(),
      path: url.pathname,
      durationMs: duration,
      keyCount: uniqueKeys.length,
      formats: [transformOptions.format || 'auto', 'jpeg', 'png', 'gif', 'webp', 'avif'].filter(
        (f, i, a) => a.indexOf(f) === i // Remove duplicates
      ).join(',')
    });
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
   * @param request The original request
   * @param transformOptions Transform options being applied
   * @param actualFormat The actual format of the response (from Content-Type)
   */
  generateCacheKey(
    request: Request, 
    transformOptions: TransformOptions, 
    actualFormat?: string
  ): string {
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
    
    // Determine output format - prefer actual format from response if available
    let format: string;
    
    if (actualFormat) {
      // Use the actual format from response content-type
      format = actualFormat;
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('Using actual response format for cache key:', {
          requestedFormat: transformOptions.format || 'auto',
          actualFormat: format,
          source: 'response'
        });
      }
    } else {
      // Fallback to requested format or 'auto'
      format = transformOptions.format || 'auto';
    }
    
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
    this.logDebug('Generating cache key with transform options:', {
      url: request.url,
      transformOptions: JSON.stringify(transformOptions),
      mainParams,
      format,
      actualFormat,
      urlParams: url.search
    });
    
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
    if (transformOptions.f) {
      this.logDebug('F parameter in cache key:', {
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
    // Calculate truncated version of hash input for logging
    const hashInputSummary = hashInput.length > 200 ? 
      `${hashInput.substring(0, 100)}...${hashInput.substring(hashInput.length - 100)}` : 
      hashInput;
      
    this.logDebug('Generated cache key:', {
      cacheKey,
      basename,
      params,
      format,
      hash,
      hashInputSummary,
      rawTransformOptions: transformString
    });
    
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
    if (this.config.debug) {
      // Truncate long inputs to prevent log flooding
      const truncatedInput = input.length > 100 
        ? `${input.substring(0, 50)}...${input.substring(input.length - 50)}`
        : input;
      
      this.logDebug('Creating hash for input', {
        inputLength: input.length,
        inputPrefix: truncatedInput
      });
    }
    
    // Generate the hash using our improved FNV-1a implementation
    const hash = fnv1a(input);
    
    if (this.config.debug) {
      this.logDebug('Hash created', { hash });
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