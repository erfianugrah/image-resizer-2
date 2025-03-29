/**
 * KV Transform Cache Manager
 * 
 * Implements the KVTransformCacheInterface for storing transformed images
 * in Cloudflare KV with efficient tag-based purging capabilities.
 */

import type { Logger } from '../../../utils/logging';
import { ConfigurationService } from '../../interfaces';
import { StorageResult } from '../../interfaces';
import { CacheTagsManager } from '../CacheTagsManager';
import { TransformOptions } from '../../../transform';
import { 
  CacheMetadata, 
  KVCacheConfig, 
  KVTransformCacheInterface, 
  TransformCacheResult 
} from './KVTransformCacheInterface';

/**
 * Index types for cache management
 */
type TagIndex = Record<string, string[]>;
type PathIndex = Record<string, string[]>;
type StatsData = {
  count: number;
  size: number;
  hits: number;
  misses: number;
  lastPruned: number;
};

/**
 * Default stats object for initialization
 */
const DEFAULT_STATS: StatsData = {
  count: 0,
  size: 0,
  hits: 0,
  misses: 0,
  lastPruned: Date.now()
};

/**
 * KV transform cache manager implementation that provides efficient
 * storage and retrieval of transformed images with tag-based purging
 */
export class KVTransformCacheManager implements KVTransformCacheInterface {
  private logger: Logger;
  private config: KVCacheConfig;
  private tagsManager?: CacheTagsManager;
  private namespace?: KVNamespace;
  private statsKey: string;
  private tagIndexKey: string;
  private pathIndexKey: string;
  
  /**
   * Create a new KV transform cache manager
   */
  constructor(
    logger: Logger, 
    configService?: ConfigurationService,
    tagsManager?: CacheTagsManager
  ) {
    this.logger = logger;
    
    // Initialize with default config if none provided
    // The actual config will be set by the factory
    if (configService) {
      // Extract the KV configuration from the config service
      const config = configService.getConfig();
      this.config = {
        enabled: config.cache.transformCache?.enabled || false,
        binding: config.cache.transformCache?.binding || 'IMAGE_TRANSFORMATIONS_CACHE',
        prefix: config.cache.transformCache?.prefix || 'transform',
        maxSize: config.cache.transformCache?.maxSize || 10485760, // 10MB default
        defaultTtl: config.cache.transformCache?.defaultTtl || 86400, // 1 day default
        contentTypeTtls: config.cache.transformCache?.contentTypeTtls || {
          'image/jpeg': 604800, // 7 days
          'image/png': 604800,  // 7 days
          'image/webp': 604800, // 7 days
          'image/avif': 604800, // 7 days
          'image/gif': 604800,  // 7 days
          'image/svg+xml': 2592000 // 30 days
        },
        indexingEnabled: config.cache.transformCache?.indexingEnabled !== false, // Default to true
        backgroundIndexing: config.cache.transformCache?.backgroundIndexing !== false, // Default to true
        purgeDelay: config.cache.transformCache?.purgeDelay || 100, // 100ms delay between purge operations
        disallowedPaths: config.cache.transformCache?.disallowedPaths || [
          '/admin/',
          '/preview/',
          '/draft/',
          '/temp/'
        ],
        // Advanced indexing options with sensible defaults
        optimizedIndexing: config.cache.transformCache?.optimizedIndexing ?? true, // Default to true
        smallPurgeThreshold: config.cache.transformCache?.smallPurgeThreshold ?? 20, // For small purges (<20 items), use list+filter
        indexUpdateFrequency: config.cache.transformCache?.indexUpdateFrequency ?? 1, // Update indices every time by default
        skipIndicesForSmallFiles: config.cache.transformCache?.skipIndicesForSmallFiles ?? true, // Default to true
        smallFileThreshold: config.cache.transformCache?.smallFileThreshold ?? 51200 // 50KB default threshold
      };
    } else {
      // Config will be set by factory or other methods
      this.config = {
        enabled: false,
        binding: 'IMAGE_TRANSFORMATIONS_CACHE',
        prefix: 'transform',
        maxSize: 10485760,
        defaultTtl: 86400,
        contentTypeTtls: {},
        indexingEnabled: true,
        backgroundIndexing: true,
        purgeDelay: 100,
        disallowedPaths: [],
        optimizedIndexing: true,
        smallPurgeThreshold: 20,
        indexUpdateFrequency: 1,
        skipIndicesForSmallFiles: true,
        smallFileThreshold: 51200
      };
    }
    
    this.tagsManager = tagsManager;
    
    // Key namespaces for indices and stats
    this.statsKey = `${this.config.prefix}:stats`;
    this.tagIndexKey = `${this.config.prefix}:tag-index`;
    this.pathIndexKey = `${this.config.prefix}:path-index`;
    
    this.logger.debug('KV transform cache manager initialized', {
      configEnabled: this.config.enabled,
      binding: this.config.binding,
      prefix: this.config.prefix,
      contentTypeTtlsCount: Object.keys(this.config.contentTypeTtls).length
    });
  }
  
  /**
   * Initialize the KV namespace if needed
   */
  private async ensureNamespace(env?: any): Promise<KVNamespace> {
    if (!this.namespace) {
      // Check if env is passed directly or on the global
      const targetEnv = env || (globalThis as any).env;
      
      if (!targetEnv) {
        this.logger.error('Environment not available for KV access', {
          hasEnv: !!env,
          hasGlobalEnv: !!(globalThis as any).env,
          bindingName: this.config.binding
        });
        throw new Error('Environment not available for KV access');
      }
      
      // Log available bindings for debugging
      const availableBindings = Object.keys(targetEnv);
      this.logger.debug('Available bindings in environment', { 
        bindings: availableBindings.join(', '),
        lookingFor: this.config.binding,
        hasBinding: availableBindings.includes(this.config.binding)
      });
      
      // Get the KV namespace from the binding
      this.namespace = targetEnv[this.config.binding];
      
      if (!this.namespace) {
        this.logger.error(`KV binding ${this.config.binding} not found in environment`, {
          availableBindings: availableBindings.join(', ')
        });
        throw new Error(`KV binding ${this.config.binding} not found in environment`);
      }
      
      this.logger.debug('KV namespace initialized successfully', { 
        binding: this.config.binding,
        type: typeof this.namespace
      });
    }
    
    return this.namespace;
  }
  
  /**
   * Check if a transformed image is cached
   */
  async isCached(request: Request, transformOptions: TransformOptions): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }
    
    try {
      // Generate the cache key
      const key = this.generateCacheKey(request, transformOptions);
      
      // Check if path should be cached
      if (this.shouldBypassCache(request.url)) {
        this.logger.debug('Bypass cache for path', { url: request.url });
        return false;
      }
      
      // We intentionally don't check the client's Cache-Control headers here
      // This allows KV transform cache lookups even when client requests no-cache
      const cacheControl = request.headers.get("Cache-Control");
      if (cacheControl && (cacheControl.includes("no-cache") || cacheControl.includes("no-store"))) {
        this.logger.debug('Ignoring client Cache-Control header for KV transform cache lookup', {
          url: request.url,
          cacheControl
        });
        // Continue with the cache lookup despite the Cache-Control header
      }
      
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // Check if the key exists in KV
      // Use any to bypass TS type issue with Cloudflare KV 
      // The metadata parameter should be 'json' but TS complains
      const result = await (kv as any).getWithMetadata(key, { type: 'text', metadata: 'json' });
      
      // Update hit/miss stats
      await this.updateStats(result.value ? 'hit' : 'miss');
      
      return !!result.value;
    } catch (error) {
      this.logger.error('Error checking cache status', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
        transformOptions: JSON.stringify(transformOptions)
      });
      
      return false;
    }
  }
  
  /**
   * Retrieve a cached transformed image
   */
  async get(request: Request, transformOptions: TransformOptions): Promise<TransformCacheResult | null> {
    if (!this.config.enabled) {
      return null;
    }
    
    try {
      // Generate the cache key
      const key = this.generateCacheKey(request, transformOptions);
      
      // Check if path should be cached
      if (this.shouldBypassCache(request.url)) {
        this.logger.debug('Bypass cache for path', { url: request.url });
        return null;
      }
      
      // We intentionally don't check the client's Cache-Control headers here
      // This allows KV transform cache retrieval even when client requests no-cache
      const cacheControl = request.headers.get("Cache-Control");
      if (cacheControl && (cacheControl.includes("no-cache") || cacheControl.includes("no-store"))) {
        this.logger.debug('Ignoring client Cache-Control header for KV transform cache retrieval', {
          url: request.url,
          cacheControl
        });
        // Continue with the cache lookup despite the Cache-Control header
      }
      
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // Get the item with metadata from KV
      // Use any to bypass TS type issue with Cloudflare KV
      const result = await (kv as any).getWithMetadata(key, { type: 'arrayBuffer', metadata: 'json' });
      const value = result.value;
      const metadata = result.metadata as CacheMetadata | undefined;
      
      // Update hit/miss stats
      await this.updateStats(value ? 'hit' : 'miss');
      
      if (!value || !metadata) {
        this.logger.debug('Cache miss', { key });
        return null;
      }
      
      this.logger.debug('Cache hit', { 
        key, 
        size: metadata.size,
        contentType: metadata.contentType,
        tags: metadata.tags?.join(',')
      });
      
      // Return the cached item
      return {
        key,
        value: value as unknown as ArrayBuffer,
        metadata: metadata
      };
    } catch (error) {
      this.logger.error('Error retrieving from cache', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
        transformOptions: JSON.stringify(transformOptions)
      });
      
      return null;
    }
  }
  
  /**
   * Store a transformed image in the cache
   */
  async put(
    request: Request, 
    response: Response, 
    storageResult: StorageResult, 
    transformOptions: TransformOptions,
    ctx?: ExecutionContext
  ): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('KV transform cache is disabled, skipping put operation', {
        url: request.url
      });
      return;
    }
    
    try {
      // Log the context information
      this.logger.debug('Starting KV cache put operation', {
        url: request.url,
        hasContext: !!ctx,
        hasWaitUntil: ctx ? (typeof ctx.waitUntil === 'function') : false,
        responseStatus: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      });
      
      // Explicitly log the Cache-Control header state
      const cacheControl = request.headers.get("Cache-Control");
      if (cacheControl) {
        this.logger.info('KV transform cache ignoring client Cache-Control header', {
          url: request.url,
          cacheControl,
          status: response.status,
          contentType: response.headers.get('content-type')
        });
      }
      
      // Generate the cache key
      const key = this.generateCacheKey(request, transformOptions);
      
      // Check if path should be cached - only check the path, not the client headers
      if (this.shouldBypassCache(request.url)) {
        this.logger.debug('Skipping cache for path', { url: request.url });
        return;
      }
      
      // (Cache-Control headers are already handled above - we're explicitly ignoring them for KV transform cache)
      
      // Clone the response - we need to read the body
      this.logger.debug('Cloning response for KV storage');
      const responseClone = response.clone();
      
      this.logger.debug('Reading response body as ArrayBuffer');
      const buffer = await responseClone.arrayBuffer();
      
      // Log buffer information
      this.logger.debug('Response body read complete', {
        bufferSize: buffer.byteLength,
        maxSizeAllowed: this.config.maxSize
      });
      
      // Check if the image size exceeds the max size
      if (buffer.byteLength > this.config.maxSize) {
        this.logger.warn('Image too large for KV cache', { 
          size: buffer.byteLength, 
          maxSize: this.config.maxSize,
          key
        });
        return;
      }
      
      // Get the content type of the transformed image
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      
      // Generate cache tags for the transformed image
      this.logger.debug('Generating cache tags');
      const tags = this.tagsManager 
        ? this.tagsManager.generateCacheTags(request, storageResult, transformOptions) 
        : [];
      
      // Calculate the TTL based on content type or default
      const ttl = this.getTtlForContentType(contentType);
      
      // Create metadata for the cached item
      const metadata: CacheMetadata = {
        url: request.url,
        timestamp: Date.now(),
        contentType,
        size: buffer.byteLength,
        transformOptions,
        tags,
        ttl,
        expiration: Date.now() + (ttl * 1000),
        storageType: storageResult.sourceType,
        originalSize: storageResult.size !== null ? storageResult.size : undefined,
        compressionRatio: storageResult.size !== null && storageResult.size > 0
          ? (buffer.byteLength / storageResult.size) 
          : undefined
      };
      
      // Ensure namespace is initialized
      this.logger.debug('Ensuring KV namespace is initialized');
      let kv: KVNamespace;
      try {
        // Get the request env if available
        const requestEnv = (request as any).env;
        
        // Try to use the request env first, fall back to global env
        kv = await this.ensureNamespace(requestEnv);
        
        this.logger.debug('KV namespace obtained successfully', {
          namespaceType: typeof kv,
          hasNamespace: !!kv
        });
      } catch (namespaceError) {
        this.logger.error('Failed to initialize KV namespace', {
          error: namespaceError instanceof Error ? namespaceError.message : String(namespaceError)
        });
        throw namespaceError;
      }
      
      // Store the transformed image in KV with metadata
      this.logger.debug('Attempting to store image in KV', {
        key,
        size: buffer.byteLength,
        ttl
      });
      
      try {
        await kv.put(key, buffer, {
          expirationTtl: ttl,
          metadata
        });
        
        this.logger.debug('KV put operation successful');
      } catch (kvError) {
        this.logger.error('Error in KV put operation', {
          error: kvError instanceof Error ? kvError.message : String(kvError),
          key,
          size: buffer.byteLength
        });
        throw kvError;
      }
      
      // Update storage stats
      this.logger.debug('Updating storage stats');
      await this.updateStats('put', buffer.byteLength);
      
      // Update indices if enabled, with optimizations
      if (this.config.indexingEnabled) {
        // Skip indexing for small files if enabled
        if (this.config.skipIndicesForSmallFiles && 
            this.config.smallFileThreshold &&
            buffer.byteLength < this.config.smallFileThreshold) {
          this.logger.debug('Skipping indices for small file', {
            size: buffer.byteLength,
            threshold: this.config.smallFileThreshold
          });
          // Skip indexing but still log success
          this.logger.debug('Small file cached without indices', {
            key,
            size: buffer.byteLength
          });
        } else {
          // Determine if we should update indices based on frequency setting
          // Generate a deterministic value from the key for consistent behavior
          const shouldUpdateIndices = this.shouldUpdateIndices(key);
          
          if (!shouldUpdateIndices) {
            this.logger.debug('Skipping index update based on frequency setting', {
              key,
              frequency: this.config.indexUpdateFrequency
            });
          } else if (this.config.backgroundIndexing && ctx) {
            this.logger.debug('Updating indices in background', {
              hasContext: !!ctx,
              optimized: this.config.optimizedIndexing
            });
            // Do index updates in the background to avoid blocking the request
            // Make sure waitUntil exists before calling it (for testing)
            if (typeof ctx.waitUntil === 'function') {
              ctx.waitUntil(this.updateIndices(key, metadata));
            } else {
              this.logger.warn('waitUntil is not a function in the provided context', {
                contextType: typeof ctx,
                waitUntilType: typeof ctx.waitUntil
              });
              // Still update indices in background (will be ignored in tests)
              Promise.resolve().then(() => this.updateIndices(key, metadata));
            }
          } else {
            this.logger.debug('Updating indices synchronously', {
              backgroundIndexing: this.config.backgroundIndexing,
              hasContext: !!ctx,
              optimized: this.config.optimizedIndexing
            });
            // Do index updates synchronously
            await this.updateIndices(key, metadata);
          }
        }
      }
      
      this.logger.debug('Image cached successfully', { 
        key, 
        size: buffer.byteLength,
        contentType,
        ttl,
        tags: tags.join(',')
      });
    } catch (error) {
      this.logger.error('Error storing in cache', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        url: request.url,
        transformOptions: JSON.stringify(transformOptions),
        transformKey: transformOptions?.derivative || 'none'
      });
    }
  }
  
  /**
   * Update indices for efficient purging
   */
  private async updateIndices(key: string, metadata: CacheMetadata): Promise<void> {
    try {
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // Update tag and path indices based on the optimization setting
      if (this.config.optimizedIndexing) {
        // Use optimized indices - just store key references for better performance
        await this.updateOptimizedTagIndex(key, metadata.tags);
        await this.updateOptimizedPathIndex(key, metadata.url);
        
        this.logger.debug('Updated optimized cache indices', { 
          key, 
          tags: metadata.tags.length,
          optimized: true 
        });
      } else {
        // Use standard indices
        await this.updateTagIndex(key, metadata.tags);
        await this.updatePathIndex(key, metadata.url);
        
        this.logger.debug('Updated standard cache indices', { 
          key, 
          tags: metadata.tags.length,
          optimized: false 
        });
      }
    } catch (error) {
      this.logger.error('Error updating cache indices', {
        error: error instanceof Error ? error.message : String(error),
        key,
        optimized: this.config.optimizedIndexing
      });
    }
  }
  
  /**
   * Update the tag index with new keys (standard approach with full metadata)
   */
  private async updateTagIndex(key: string, tags: string[]): Promise<void> {
    try {
      const kv = await this.ensureNamespace();
      
      // Get the existing tag index
      const tagIndexStr = await kv.get(this.tagIndexKey, 'text') || '{}';
      const tagIndex = JSON.parse(tagIndexStr) as TagIndex;
      
      // Update the index with each tag
      for (const tag of tags) {
        if (!tagIndex[tag]) {
          tagIndex[tag] = [];
        }
        
        // Add the key to the tag's entries if not already present
        if (!tagIndex[tag].includes(key)) {
          tagIndex[tag].push(key);
        }
      }
      
      // Store the updated index
      await kv.put(this.tagIndexKey, JSON.stringify(tagIndex));
    } catch (error) {
      this.logger.error('Error updating tag index', {
        error: error instanceof Error ? error.message : String(error),
        key,
        tags
      });
    }
  }
  
  /**
   * Update the tag index with new keys using an optimized approach
   * This approach uses a more compact representation and focuses on speed
   */
  private async updateOptimizedTagIndex(key: string, tags: string[]): Promise<void> {
    try {
      if (tags.length === 0) {
        // No tags to index
        return;
      }
      
      const kv = await this.ensureNamespace();
      
      // Create a batched approach to reduce KV operations
      // Process tags in groups to minimize KV reads/writes
      const batchSize = 5; // Process 5 tags at a time
      
      for (let i = 0; i < tags.length; i += batchSize) {
        const tagBatch = tags.slice(i, i + batchSize);
        
        // Fetch all tag indices in this batch in parallel
        const tagKeys = tagBatch.map(tag => `${this.config.prefix}:tag:${tag}`);
        
        // Process each tag in the batch
        await Promise.all(tagBatch.map(async (tag, index) => {
          const tagKey = tagKeys[index];
          
          try {
            // Get the existing keys for this tag
            const existingKeys = await kv.get(tagKey, 'text') || '';
            const keyList = existingKeys ? existingKeys.split(',') : [];
            
            // Add the new key if not already present
            if (!keyList.includes(key)) {
              keyList.push(key);
              
              // Store the updated list
              await kv.put(tagKey, keyList.join(','));
            }
          } catch (tagError) {
            this.logger.warn(`Error updating optimized tag index for "${tag}"`, {
              error: tagError instanceof Error ? tagError.message : String(tagError),
              tag,
              key
            });
            // Continue with other tags despite the error
          }
        }));
      }
      
      // Update the master tag list if needed
      const allTagsKey = `${this.config.prefix}:all-tags`;
      const existingAllTags = await kv.get(allTagsKey, 'text') || '';
      const allTagsList = existingAllTags ? existingAllTags.split(',') : [];
      
      // Track which tags we need to add
      const tagsToAdd = tags.filter(tag => !allTagsList.includes(tag));
      
      if (tagsToAdd.length > 0) {
        // Add new tags to the master list
        allTagsList.push(...tagsToAdd);
        await kv.put(allTagsKey, allTagsList.join(','));
      }
    } catch (error) {
      this.logger.error('Error updating optimized tag index', {
        error: error instanceof Error ? error.message : String(error),
        key,
        tagsCount: tags.length
      });
    }
  }
  
  /**
   * Update the path index for path-based purging (standard approach)
   */
  private async updatePathIndex(key: string, url: string): Promise<void> {
    try {
      const kv = await this.ensureNamespace();
      
      // Parse the URL
      const urlObj = new URL(url);
      
      // Extract both base path and complete path with query parameters
      const path = urlObj.pathname;
      const fullPath = urlObj.pathname + urlObj.search;
      
      // Get path segments for hierarchical indexing
      const segments = path.split('/').filter(Boolean);
      
      // Get the existing path index
      const pathIndexStr = await kv.get(this.pathIndexKey, 'text') || '{}';
      const pathIndex = JSON.parse(pathIndexStr) as PathIndex;
      
      // Update full path with query parameters (for exact transform lookup)
      if (!pathIndex[fullPath]) {
        pathIndex[fullPath] = [];
      }
      
      if (!pathIndex[fullPath].includes(key)) {
        pathIndex[fullPath].push(key);
      }
      
      // Also update base path (for broader purging capability)
      if (!pathIndex[path]) {
        pathIndex[path] = [];
      }
      
      if (!pathIndex[path].includes(key)) {
        pathIndex[path].push(key);
      }
      
      // Update entries for each path segment
      for (let i = 0; i < segments.length; i++) {
        // Create a path up to and including this segment
        const segmentPath = '/' + segments.slice(0, i + 1).join('/') + '/';
        
        if (!pathIndex[segmentPath]) {
          pathIndex[segmentPath] = [];
        }
        
        if (!pathIndex[segmentPath].includes(key)) {
          pathIndex[segmentPath].push(key);
        }
      }
      
      // Store the updated index
      await kv.put(this.pathIndexKey, JSON.stringify(pathIndex));
    } catch (error) {
      this.logger.error('Error updating path index', {
        error: error instanceof Error ? error.message : String(error),
        key,
        url
      });
    }
  }
  
  /**
   * Update the path index using an optimized approach
   * This approach uses a more compact representation and focuses on speed
   */
  private async updateOptimizedPathIndex(key: string, url: string): Promise<void> {
    try {
      const kv = await this.ensureNamespace();
      
      // Parse the URL
      const urlObj = new URL(url);
      
      // Extract the complete path including query parameters
      const path = urlObj.pathname;
      const fullPath = urlObj.pathname + urlObj.search;
      
      // Get path segments for hierarchical indexing
      const segments = path.split('/').filter(Boolean);
      
      // Store the full path with query parameters (for exact transform lookup)
      const fullPathKey = `${this.config.prefix}:path:${fullPath}`;
      const existingFullPathKeys = await kv.get(fullPathKey, 'text') || '';
      const fullPathKeyList = existingFullPathKeys ? existingFullPathKeys.split(',') : [];
      
      // Add the key if not already present
      if (!fullPathKeyList.includes(key)) {
        fullPathKeyList.push(key);
        await kv.put(fullPathKey, fullPathKeyList.join(','));
      }
      
      // Also store base path for broader purging capability
      const pathKey = `${this.config.prefix}:path:${path}`;
      const existingKeys = await kv.get(pathKey, 'text') || '';
      const keyList = existingKeys ? existingKeys.split(',') : [];
      
      // Add the key if not already present for base path
      if (!keyList.includes(key)) {
        keyList.push(key);
        await kv.put(pathKey, keyList.join(','));
      }
      
      // Update key mappings for hierarchical segments - only if we have segments
      if (segments.length > 0) {
        // Process a subset of segments to reduce overhead
        // For very deep paths, we'll just store top-level and full path
        const maxSegments = 3; // Only index up to 3 levels deep for better performance
        const segmentsToProcess = Math.min(segments.length, maxSegments);
        
        await Promise.all(Array.from({length: segmentsToProcess}).map(async (_, i) => {
          // Create a path up to and including this segment
          const segmentPath = '/' + segments.slice(0, i + 1).join('/') + '/';
          const segmentKey = `${this.config.prefix}:path:${segmentPath}`;
          
          try {
            const existingSegKeys = await kv.get(segmentKey, 'text') || '';
            const segmentKeyList = existingSegKeys ? existingSegKeys.split(',') : [];
            
            // Add the key if not already present
            if (!segmentKeyList.includes(key)) {
              segmentKeyList.push(key);
              await kv.put(segmentKey, segmentKeyList.join(','));
            }
          } catch (segError) {
            this.logger.warn(`Error updating segment path index for "${segmentPath}"`, {
              error: segError instanceof Error ? segError.message : String(segError),
              segmentPath,
              key
            });
            // Continue with other segments despite the error
          }
        }));
      }
      
      // Also ensure we update the master list of paths
      const allPathsKey = `${this.config.prefix}:all-paths`;
      const existingAllPaths = await kv.get(allPathsKey, 'text') || '';
      const allPathsList = existingAllPaths ? existingAllPaths.split(',') : [];
      
      // Add both the base path and full path if not already present
      if (!allPathsList.includes(path)) {
        allPathsList.push(path);
      }
      
      if (!allPathsList.includes(fullPath)) {
        allPathsList.push(fullPath);
      }
      
      // Store updated list
      await kv.put(allPathsKey, allPathsList.join(','));
    } catch (error) {
      this.logger.error('Error updating optimized path index', {
        error: error instanceof Error ? error.message : String(error),
        key,
        url
      });
    }
  }
  
  /**
   * Delete a specific transformation from the cache
   */
  async delete(request: Request, transformOptions: TransformOptions): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    try {
      // Generate the cache key
      const key = this.generateCacheKey(request, transformOptions);
      
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // Get the metadata before deletion for index cleanup
      // Use any to bypass TS type issue with Cloudflare KV
      const result = await (kv as any).getWithMetadata(key, { type: 'text', metadata: 'json' });
      const metadata = result.metadata as CacheMetadata | undefined;
      
      // Delete the key from KV
      await kv.delete(key);
      
      // If metadata exists, remove the key from indices
      if (metadata && this.config.indexingEnabled) {
        await this.removeKeyFromIndices(key, metadata);
      }
      
      this.logger.debug('Deleted from cache', { key });
    } catch (error) {
      this.logger.error('Error deleting from cache', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
        transformOptions: JSON.stringify(transformOptions)
      });
    }
  }
  
  /**
   * Remove a key from all indices
   */
  private async removeKeyFromIndices(key: string, metadata: CacheMetadata): Promise<void> {
    try {
      const kv = await this.ensureNamespace();
      
      // Get the existing tag index
      const tagIndexStr = await kv.get(this.tagIndexKey, 'text') || '{}';
      const tagIndex = JSON.parse(tagIndexStr) as TagIndex;
      let tagIndexUpdated = false;
      
      // Remove the key from each tag in the index
      for (const tag of metadata.tags) {
        if (tagIndex[tag] && tagIndex[tag].includes(key)) {
          tagIndex[tag] = tagIndex[tag].filter(k => k !== key);
          tagIndexUpdated = true;
          
          // If the tag has no more entries, remove it
          if (tagIndex[tag].length === 0) {
            delete tagIndex[tag];
          }
        }
      }
      
      // If the tag index was modified, save it
      if (tagIndexUpdated) {
        await kv.put(this.tagIndexKey, JSON.stringify(tagIndex));
      }
      
      // Get the existing path index
      const pathIndexStr = await kv.get(this.pathIndexKey, 'text') || '{}';
      const pathIndex = JSON.parse(pathIndexStr) as PathIndex;
      let pathIndexUpdated = false;
      
      // Get URL path
      const urlObj = new URL(metadata.url);
      const path = urlObj.pathname;
      
      // Remove the key from the specific path
      if (pathIndex[path] && pathIndex[path].includes(key)) {
        pathIndex[path] = pathIndex[path].filter(k => k !== key);
        pathIndexUpdated = true;
        
        // If the path has no more entries, remove it
        if (pathIndex[path].length === 0) {
          delete pathIndex[path];
        }
      }
      
      // Remove from path segments
      const segments = path.split('/').filter(Boolean);
      for (let i = 0; i < segments.length; i++) {
        const segmentPath = '/' + segments.slice(0, i + 1).join('/') + '/';
        
        if (pathIndex[segmentPath] && pathIndex[segmentPath].includes(key)) {
          pathIndex[segmentPath] = pathIndex[segmentPath].filter(k => k !== key);
          pathIndexUpdated = true;
          
          // If the segment has no more entries, remove it
          if (pathIndex[segmentPath].length === 0) {
            delete pathIndex[segmentPath];
          }
        }
      }
      
      // If the path index was modified, save it
      if (pathIndexUpdated) {
        await kv.put(this.pathIndexKey, JSON.stringify(pathIndex));
      }
    } catch (error) {
      this.logger.error('Error removing key from indices', {
        error: error instanceof Error ? error.message : String(error),
        key
      });
    }
  }
  
  /**
   * Purge all cache entries with a specific tag
   * Uses the optimized or standard approach based on configuration
   */
  async purgeByTag(tag: string, ctx?: ExecutionContext): Promise<number> {
    if (!this.config.enabled || !this.config.indexingEnabled) {
      return 0;
    }
    
    try {
      // Check if we should use the optimized approach based on config
      if (this.config.optimizedIndexing) {
        return await this.purgeByTagOptimized(tag, ctx);
      } else {
        return await this.purgeByTagStandard(tag, ctx);
      }
    } catch (error) {
      this.logger.error('Error purging by tag', {
        error: error instanceof Error ? error.message : String(error),
        tag
      });
      
      return 0;
    }
  }
  
  /**
   * Purge all cache entries with a specific tag using the standard approach
   */
  private async purgeByTagStandard(tag: string, ctx?: ExecutionContext): Promise<number> {
    const kv = await this.ensureNamespace();
    
    // Get the tag index
    const tagIndexStr = await kv.get(this.tagIndexKey, 'text') || '{}';
    const tagIndex = JSON.parse(tagIndexStr) as TagIndex;
    
    // Get the keys for this tag
    const keys = tagIndex[tag] || [];
    
    // If no keys match this tag, return 0
    if (keys.length === 0) {
      this.logger.debug('No entries found for tag', { tag });
      return 0;
    }
    
    // Delete each key
    const deletionPromises = keys.map(async (key, i) => {
      // Add a small delay between operations to avoid overwhelming the KV service
      if (i > 0 && this.config.purgeDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.purgeDelay));
      }
      
      // Get the metadata before deletion for index cleanup
      // Use any to bypass TS type issue with Cloudflare KV
      const result = await (kv as any).getWithMetadata(key, { type: 'text', metadata: 'json' });
      const metadata = result.metadata as CacheMetadata | undefined;
      
      // Delete the key from KV
      await kv.delete(key);
      
      // If metadata exists, remove the key from indices
      if (metadata) {
        await this.removeKeyFromIndices(key, metadata);
      }
      
      return true;
    });
    
    // Use waitUntil if context is provided, otherwise wait for all deletions
    if (ctx) {
      if (typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(Promise.all(deletionPromises));
      } else {
        this.logger.warn('waitUntil is not a function in the provided context', {
          contextType: typeof ctx,
          waitUntilType: typeof ctx.waitUntil
        });
        // Still run in background (will be ignored in tests)
        Promise.resolve().then(() => Promise.all(deletionPromises));
      }
      
      // Remove the tag from the index immediately
      delete tagIndex[tag];
      await kv.put(this.tagIndexKey, JSON.stringify(tagIndex));
      
      this.logger.info('Purging by tag in background (standard method)', { 
        tag,
        keysCount: keys.length
      });
      
      // Return the count of keys that will be purged
      return keys.length;
    } else {
      // Wait for all deletions to complete
      await Promise.all(deletionPromises);
      
      // Remove the tag from the index
      delete tagIndex[tag];
      await kv.put(this.tagIndexKey, JSON.stringify(tagIndex));
      
      this.logger.info('Purged by tag (standard method)', { 
        tag,
        keysCount: keys.length
      });
      
      return keys.length;
    }
  }
  
  /**
   * Purge all cache entries with a specific tag using the optimized approach
   * Uses individual tag keys for better performance
   */
  private async purgeByTagOptimized(tag: string, ctx?: ExecutionContext): Promise<number> {
    const kv = await this.ensureNamespace();
    
    // In the optimized approach, we store keys directly in a tag-specific key
    const tagKey = `${this.config.prefix}:tag:${tag}`;
    
    // Get all keys associated with this tag
    const keysStr = await kv.get(tagKey, 'text');
    
    // No keys to purge
    if (!keysStr) {
      this.logger.debug('No entries found for tag (optimized method)', { tag });
      return 0;
    }
    
    // Parse comma-separated list of keys
    const keys = keysStr.split(',').filter(Boolean);
    
    // If the number of keys is small, we can process them directly
    // Otherwise, use list+filter approach which is more efficient for larger sets
    let purgeMethod = 'direct';
    let keysToDelete = keys;
    
    if (this.config.smallPurgeThreshold && keys.length > this.config.smallPurgeThreshold) {
      purgeMethod = 'list+filter';
      
      // For large purges, we'll use the list method with filtering
      // rather than loading all keys individually, which is more efficient
      const entries = await this.listEntriesWithFilter(
        (metadata) => metadata.tags.includes(tag),
        1000 // Increased limit for efficiency
      );
      
      keysToDelete = entries.map(entry => entry.key);
      
      this.logger.debug('Using list+filter method for large tag purge', {
        tag,
        originalKeyCount: keys.length,
        filteredKeyCount: keysToDelete.length
      });
    }
    
    // Process deletions
    const totalKeys = keysToDelete.length;
    
    // Use batched deletion for better performance
    const batchSize = 10; // Process 10 keys at a time
    const batches: string[][] = [];
    
    for (let i = 0; i < keysToDelete.length; i += batchSize) {
      const batch = keysToDelete.slice(i, i + batchSize);
      batches.push(batch);
    }
    
    // Process batches sequentially to avoid overwhelming KV
    const processBatches = async () => {
      let deletedCount = 0;
      
      for (const [batchIndex, batch] of batches.entries()) {
        // Add delay between batches
        if (batchIndex > 0 && this.config.purgeDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.purgeDelay));
        }
        
        // Process all keys in this batch in parallel
        await Promise.all(batch.map(async (key: string) => {
          try {
            // Delete the key
            await kv.delete(key);
            deletedCount++;
            
            // We don't update other indices here since they will be lazily
            // cleaned up during subsequent operations, improving performance
          } catch (keyError) {
            this.logger.warn(`Error deleting key ${key} during tag purge`, {
              error: keyError instanceof Error ? keyError.message : String(keyError),
              tag
            });
          }
        }));
      }
      
      return deletedCount;
    };
    
    // Delete the tag index immediately
    await kv.delete(tagKey);
    
    // Also remove from all-tags if it's the only reference
    try {
      const allTagsKey = `${this.config.prefix}:all-tags`;
      const allTags = await kv.get(allTagsKey, 'text') || '';
      const tagList = allTags.split(',');
      
      if (tagList.includes(tag)) {
        // Remove the tag and update
        const updatedTags = tagList.filter(t => t !== tag).join(',');
        await kv.put(allTagsKey, updatedTags);
      }
    } catch (tagError) {
      this.logger.warn('Error updating all-tags during purge', {
        error: tagError instanceof Error ? tagError.message : String(tagError),
        tag
      });
    }
    
    // Process deletions based on execution context
    if (ctx) {
      // Run deletions in the background
      if (typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(processBatches().catch(error => {
          this.logger.error('Error in background tag purge', {
            error: error instanceof Error ? error.message : String(error),
            tag
          });
        }));
      } else {
        this.logger.warn('waitUntil is not a function in the provided context', {
          contextType: typeof ctx,
          waitUntilType: typeof ctx.waitUntil
        });
        // Still run in background (will be ignored in tests)
        Promise.resolve().then(() => processBatches().catch(error => {
          this.logger.error('Error in background tag purge', {
            error: error instanceof Error ? error.message : String(error),
            tag
          });
        }));
      }
      
      this.logger.info('Purging by tag in background (optimized method)', { 
        tag,
        keysCount: totalKeys,
        method: purgeMethod
      });
      
      return totalKeys;
    } else {
      // Run deletions synchronously
      const deletedCount = await processBatches();
      
      this.logger.info('Purged by tag (optimized method)', { 
        tag,
        keysCount: totalKeys,
        deletedCount,
        method: purgeMethod
      });
      
      return deletedCount;
    }
  }
  
  /**
   * Purge all cache entries matching a path pattern
   * Uses the optimized or standard approach based on configuration
   */
  async purgeByPath(pathPattern: string, ctx?: ExecutionContext): Promise<number> {
    if (!this.config.enabled || !this.config.indexingEnabled) {
      return 0;
    }
    
    try {
      // Check if we should use the optimized approach based on config
      if (this.config.optimizedIndexing) {
        return await this.purgeByPathOptimized(pathPattern, ctx);
      } else {
        return await this.purgeByPathStandard(pathPattern, ctx);
      }
    } catch (error) {
      this.logger.error('Error purging by path pattern', {
        error: error instanceof Error ? error.message : String(error),
        pathPattern
      });
      
      return 0;
    }
  }
  
  /**
   * Purge all cache entries matching a path pattern using the standard approach
   */
  private async purgeByPathStandard(pathPattern: string, ctx?: ExecutionContext): Promise<number> {
    try {
      // Normalize pathPattern to have leading slash
      const normalizedPattern = pathPattern.startsWith('/') 
        ? pathPattern 
        : `/${pathPattern}`;
      
      // Create a regex from the path pattern
      // Escape regex special chars except * which becomes .*
      const regexPattern = normalizedPattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      
      const regex = new RegExp(`^${regexPattern}`);
      
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // Get the path index
      const pathIndexStr = await kv.get(this.pathIndexKey, 'text') || '{}';
      const pathIndex = JSON.parse(pathIndexStr) as PathIndex;
      
      // Find all matching paths
      const matchingPaths = Object.keys(pathIndex).filter(path => 
        regex.test(path)
      );
      
      // Collect all keys to purge (removing duplicates)
      const keySet = new Set<string>();
      for (const path of matchingPaths) {
        pathIndex[path].forEach(key => keySet.add(key));
      }
      
      const keys = Array.from(keySet);
      
      // If no keys match, return 0
      if (keys.length === 0) {
        this.logger.debug('No entries found for path pattern', { pathPattern });
        return 0;
      }
      
      // Delete each key
      const deletionPromises = keys.map(async (key, i) => {
        // Add a small delay between operations to avoid overwhelming the KV service
        if (i > 0 && this.config.purgeDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.purgeDelay));
        }
        
        // Get the metadata before deletion for index cleanup
        // Use any to bypass TS type issue with Cloudflare KV
        const result = await (kv as any).getWithMetadata(key, { type: 'text', metadata: 'json' });
        const metadata = result.metadata as CacheMetadata | undefined;
        
        // Delete the key from KV
        await kv.delete(key);
        
        // If metadata exists, remove the key from indices
        if (metadata) {
          await this.removeKeyFromIndices(key, metadata);
        }
        
        return true;
      });
      
      // Update the path index to remove the keys
      for (const path of matchingPaths) {
        pathIndex[path] = pathIndex[path].filter(key => !keySet.has(key));
        
        // If the path has no more entries, remove it
        if (pathIndex[path].length === 0) {
          delete pathIndex[path];
        }
      }
      
      // Save the updated path index
      await kv.put(this.pathIndexKey, JSON.stringify(pathIndex));
      
      // Use waitUntil if context is provided, otherwise wait for all deletions
      if (ctx) {
        if (typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(Promise.all(deletionPromises));
        } else {
          this.logger.warn('waitUntil is not a function in the provided context', {
            contextType: typeof ctx,
            waitUntilType: typeof ctx.waitUntil
          });
          // Still run in background (will be ignored in tests)
          Promise.resolve().then(() => Promise.all(deletionPromises));
        }
        
        this.logger.info('Purging by path pattern in background (standard method)', { 
          pathPattern,
          matchingPaths: matchingPaths.length,
          keysCount: keys.length
        });
        
        // Return the count of keys that will be purged
        return keys.length;
      } else {
        // Wait for all deletions to complete
        await Promise.all(deletionPromises);
        
        this.logger.info('Purged by path pattern (standard method)', { 
          pathPattern,
          matchingPaths: matchingPaths.length,
          keysCount: keys.length
        });
        
        return keys.length;
      }
    } catch (error) {
      this.logger.error('Error purging by path pattern (standard)', {
        error: error instanceof Error ? error.message : String(error),
        pathPattern
      });
      
      return 0;
    }
  }
  
  /**
   * Purge all cache entries matching a path pattern using the optimized approach
   * Uses individual path keys for better performance and supports list+filter for large purges
   */
  private async purgeByPathOptimized(pathPattern: string, ctx?: ExecutionContext): Promise<number> {
    try {
      // Normalize pathPattern to have leading slash
      const normalizedPattern = pathPattern.startsWith('/') 
        ? pathPattern 
        : `/${pathPattern}`;
      
      // Create a regex from the path pattern
      // Escape regex special chars except * which becomes .*
      const regexPattern = normalizedPattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      
      const regex = new RegExp(`^${regexPattern}`);
      
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // In the optimized approach, we store lists of paths
      const allPathsKey = `${this.config.prefix}:all-paths`;
      const allPaths = await kv.get(allPathsKey, 'text') || '';
      const pathsList = allPaths.split(',').filter(Boolean);
      
      // Find all matching paths
      const matchingPaths = pathsList.filter(path => regex.test(path));
      
      // If no paths match, return 0
      if (matchingPaths.length === 0) {
        this.logger.debug('No paths found matching pattern (optimized method)', { 
          pathPattern, 
          pathsChecked: pathsList.length 
        });
        return 0;
      }
      
      // Collect keys to delete from each matching path
      let keysToDelete: string[] = [];
      let totalKeyCount = 0;
      
      // Determine the right purge method based on the number of matching paths
      let purgeMethod = 'direct';
      
      // Fetch keys for each matching path
      if (this.config.smallPurgeThreshold && matchingPaths.length <= this.config.smallPurgeThreshold) {
        // For a small number of paths, fetch keys directly
        await Promise.all(matchingPaths.map(async (path) => {
          const pathKey = `${this.config.prefix}:path:${path}`;
          const pathKeysStr = await kv.get(pathKey, 'text') || '';
          
          if (pathKeysStr) {
            // Add unique keys to our list
            const pathKeys = pathKeysStr.split(',').filter(Boolean);
            totalKeyCount += pathKeys.length;
            
            // Add to keysToDelete if not already included
            for (const key of pathKeys) {
              if (!keysToDelete.includes(key)) {
                keysToDelete.push(key);
              }
            }
          }
        }));
      } else {
        // For a large number of paths, use list+filter method
        purgeMethod = 'list+filter';
        
        // Use pathPattern to create a filter function
        const entries = await this.listEntriesWithFilter(
          (metadata) => regex.test(new URL(metadata.url).pathname),
          1000 // Increased limit for efficiency
        );
        
        keysToDelete = entries.map(entry => entry.key);
        totalKeyCount = matchingPaths.length; // Just for logging
        
        this.logger.debug('Using list+filter method for large path purge', {
          pathPattern,
          matchingPaths: matchingPaths.length,
          filteredKeyCount: keysToDelete.length
        });
      }
      
      // If no keys to delete, return 0
      if (keysToDelete.length === 0) {
        this.logger.debug('No keys found for matching paths (optimized method)', { 
          pathPattern, 
          matchingPaths: matchingPaths.length
        });
        return 0;
      }
      
      // Use batched deletion for better performance
      const batchSize = 10; // Process 10 keys at a time
      const batches: string[][] = [];
      
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        const batch = keysToDelete.slice(i, i + batchSize);
        batches.push(batch);
      }
      
      // Process batches sequentially to avoid overwhelming KV
      const processBatches = async () => {
        let deletedCount = 0;
        
        for (const [batchIndex, batch] of batches.entries()) {
          // Add delay between batches
          if (batchIndex > 0 && this.config.purgeDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.purgeDelay));
          }
          
          // Process all keys in this batch in parallel
          await Promise.all(batch.map(async (key: string) => {
            try {
              // Delete the key
              await kv.delete(key);
              deletedCount++;
              
              // We don't update other indices here since they will be lazily
              // cleaned up during subsequent operations, improving performance
            } catch (keyError) {
              this.logger.warn(`Error deleting key ${key} during path purge`, {
                error: keyError instanceof Error ? keyError.message : String(keyError),
                pathPattern
              });
            }
          }));
        }
        
        return deletedCount;
      };
      
      // Clean up path indices
      const cleanupPromises = matchingPaths.map(async (path) => {
        try {
          const pathKey = `${this.config.prefix}:path:${path}`;
          await kv.delete(pathKey);
        } catch (cleanupError) {
          this.logger.warn(`Error cleaning up path index for "${path}"`, {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          });
        }
      });
      
      // If using context, run deletions and cleanup in background
      if (ctx) {
        // Run deletions in the background
        if (typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(Promise.all([
            processBatches().catch(error => {
              this.logger.error('Error in background path purge', {
                error: error instanceof Error ? error.message : String(error),
                pathPattern
              });
            }),
            // Also run cleanup in the background
            Promise.all(cleanupPromises)
        ]));
      } else {
        this.logger.warn('waitUntil is not a function in the provided context', {
          contextType: typeof ctx,
          waitUntilType: typeof ctx.waitUntil
        });
        // Still run in background (will be ignored in tests)
        Promise.resolve().then(() => Promise.all([processBatches(), Promise.all(cleanupPromises)]));
      }
        
        // Update the master path list
        if (matchingPaths.length > 0) {
          // Remove deleted paths from all-paths
          const updatedPaths = pathsList.filter(path => !matchingPaths.includes(path));
          await kv.put(allPathsKey, updatedPaths.join(','));
        }
        
        this.logger.info('Purging by path pattern in background (optimized method)', { 
          pathPattern,
          matchingPaths: matchingPaths.length,
          keysCount: keysToDelete.length,
          method: purgeMethod
        });
        
        return keysToDelete.length;
      } else {
        // Run deletions synchronously
        const deletedCount = await processBatches();
        
        // Run cleanup synchronously
        await Promise.all(cleanupPromises);
        
        // Update the master path list
        if (matchingPaths.length > 0) {
          // Remove deleted paths from all-paths
          const updatedPaths = pathsList.filter(path => !matchingPaths.includes(path));
          await kv.put(allPathsKey, updatedPaths.join(','));
        }
        
        this.logger.info('Purged by path pattern (optimized method)', { 
          pathPattern,
          matchingPaths: matchingPaths.length,
          keysCount: keysToDelete.length,
          deletedCount,
          method: purgeMethod
        });
        
        return deletedCount;
      }
    } catch (error) {
      this.logger.error('Error purging by path pattern (optimized)', {
        error: error instanceof Error ? error.message : String(error),
        pathPattern
      });
      
      return 0;
    }
  }
  
  /**
   * Generate a cache key for a request and transform options
   */
  generateCacheKey(request: Request, transformOptions: TransformOptions): string {
    // Get the URL without query parameters for the base key
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Hash of the path and serialized transformOptions
    const hash = this.hashString(path + JSON.stringify(transformOptions));
    
    // Create the key with prefix
    return `${this.config.prefix}:${hash}`;
  }
  
  /**
   * Create a hash string for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Convert to string and ensure it's positive
    return Math.abs(hash).toString(16);
  }
  
  /**
   * Determine if we should update indices for this key based on frequency setting
   * Uses a hash-based approach to ensure consistent behavior for the same key
   */
  private shouldUpdateIndices(key: string): boolean {
    // Always update if frequency is 1 (every time)
    if (!this.config.indexUpdateFrequency || this.config.indexUpdateFrequency <= 1) {
      return true;
    }
    
    // Get a numeric hash of the key
    const hash = parseInt(this.hashString(key).substring(0, 8), 16);
    
    // Ensure indexUpdateFrequency exists to satisfy TypeScript
    const frequency = this.config.indexUpdateFrequency || 1;
    
    // Use modulo to determine if this key should be indexed based on frequency
    // This ensures a deterministic and even distribution
    return (hash % frequency) === 0;
  }
  
  /**
   * List cache entries for debugging and management
   */
  async listEntries(limit = 100, cursor?: string): Promise<{
    entries: {key: string, metadata: CacheMetadata}[],
    cursor?: string,
    complete: boolean
  }> {
    if (!this.config.enabled) {
      return { entries: [], complete: true };
    }
    
    try {
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // List keys with metadata, filtered by our prefix
      const result = await kv.list<CacheMetadata>({
        prefix: this.config.prefix,
        limit,
        cursor
      });
      
      // Format the entries
      const entries = result.keys.map(item => ({
        key: item.name,
        metadata: item.metadata as CacheMetadata
      }));
      
      return {
        entries,
        cursor: 'cursor' in result ? result.cursor : undefined,
        complete: result.list_complete
      };
    } catch (error) {
      this.logger.error('Error listing cache entries', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return { entries: [], complete: true };
    }
  }
  
  /**
   * List entries with filter - retrieves entries and filters by metadata
   * Useful for optimized purging operations when dealing with large datasets
   */
  async listEntriesWithFilter(
    filterFn: (metadata: CacheMetadata) => boolean,
    limit = 100,
    cursor?: string
  ): Promise<{key: string, metadata: CacheMetadata}[]> {
    try {
      // Use the standard list method first
      const result = await this.listEntries(limit, cursor);
      
      // Apply the filter function to the metadata
      const filteredEntries = result.entries.filter(entry => {
        try {
          return filterFn(entry.metadata);
        } catch (error) {
          // If filter function fails for some reason, exclude the entry
          this.logger.warn('Error in filter function', {
            error: error instanceof Error ? error.message : String(error),
            key: entry.key
          });
          return false;
        }
      });
      
      // If we have more entries and didn't fill our limit, fetch more
      if (!result.complete && filteredEntries.length < limit && result.cursor) {
        // Recursive call to get more entries
        const moreEntries = await this.listEntriesWithFilter(
          filterFn,
          limit - filteredEntries.length,
          result.cursor
        );
        
        // Combine the results
        return [...filteredEntries, ...moreEntries];
      }
      
      return filteredEntries;
    } catch (error) {
      this.logger.error('Error in listEntriesWithFilter', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return [];
    }
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    count: number,
    size: number,
    indexSize: number,
    hitRate: number,
    avgSize: number,
    optimized: boolean,
    lastPruned: Date
  }> {
    if (!this.config.enabled) {
      return { 
        count: 0, 
        size: 0, 
        indexSize: 0, 
        hitRate: 0, 
        avgSize: 0, 
        optimized: Boolean(this.config.optimizedIndexing),
        lastPruned: new Date(0)
      };
    }
    
    try {
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // Get the stats
      const statsStr = await kv.get(this.statsKey, 'text') || JSON.stringify(DEFAULT_STATS);
      const stats = JSON.parse(statsStr) as StatsData;
      
      // Determine index size based on approach
      let indexSize = 0;
      
      if (this.config.optimizedIndexing) {
        // For optimized approach, get size estimates from all-tags and all-paths
        const allTags = await kv.get(`${this.config.prefix}:all-tags`, 'text') || '';
        const allPaths = await kv.get(`${this.config.prefix}:all-paths`, 'text') || '';
        
        indexSize = allTags.length + allPaths.length;
        
        // Sample a few tag and path entries to get a better estimate
        const tagsList = allTags.split(',').filter(Boolean);
        const pathsList = allPaths.split(',').filter(Boolean);
        
        // Take up to 5 samples
        const tagSamples = tagsList.slice(0, 5);
        const pathSamples = pathsList.slice(0, 5);
        
        // Get average size of tag entries
        let totalTagSize = 0;
        for (const tag of tagSamples) {
          const tagKey = `${this.config.prefix}:tag:${tag}`;
          const tagData = await kv.get(tagKey, 'text') || '';
          totalTagSize += tagData.length;
        }
        
        // Get average size of path entries
        let totalPathSize = 0;
        for (const path of pathSamples) {
          const pathKey = `${this.config.prefix}:path:${path}`;
          const pathData = await kv.get(pathKey, 'text') || '';
          totalPathSize += pathData.length;
        }
        
        // Calculate estimate for all entries
        if (tagSamples.length > 0) {
          indexSize += (totalTagSize / tagSamples.length) * tagsList.length;
        }
        
        if (pathSamples.length > 0) {
          indexSize += (totalPathSize / pathSamples.length) * pathsList.length;
        }
      } else {
        // For standard approach, get tag and path indices
        const tagIndex = await kv.get(this.tagIndexKey, 'text') || '{}';
        const pathIndex = await kv.get(this.pathIndexKey, 'text') || '{}';
        
        indexSize = tagIndex.length + pathIndex.length;
      }
      
      // Calculate hit rate
      const hitRate = stats.hits + stats.misses > 0
        ? stats.hits / (stats.hits + stats.misses) * 100
        : 0;
      
      // Calculate average size
      const avgSize = stats.count > 0
        ? stats.size / stats.count
        : 0;
      
      return {
        count: stats.count,
        size: stats.size,
        indexSize,
        hitRate,
        avgSize,
        optimized: Boolean(this.config.optimizedIndexing),
        lastPruned: new Date(stats.lastPruned)
      };
    } catch (error) {
      this.logger.error('Error getting cache stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return { 
        count: 0, 
        size: 0, 
        indexSize: 0, 
        hitRate: 0, 
        avgSize: 0,
        optimized: Boolean(this.config.optimizedIndexing),
        lastPruned: new Date()
      };
    }
  }
  
  /**
   * Perform cache maintenance including pruning expired entries and cleaning indices
   * This is useful for maintaining optimal performance over time
   * 
   * @param maxEntriesToPrune Maximum number of entries to prune in one operation
   * @param ctx Optional execution context for background operation
   * @returns Number of entries pruned
   */
  async performMaintenance(maxEntriesToPrune = 100, ctx?: ExecutionContext): Promise<number> {
    if (!this.config.enabled) {
      return 0;
    }
    
    try {
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // Get the stats
      const statsStr = await kv.get(this.statsKey, 'text') || JSON.stringify(DEFAULT_STATS);
      const stats = JSON.parse(statsStr) as StatsData;
      
      // Get current time
      const now = Date.now();
      
      // Skip if last pruned less than a day ago (unless forced)
      if (maxEntriesToPrune < 1000 && (now - stats.lastPruned) < 86400000) {
        this.logger.debug('Skipping maintenance, last pruned recently', {
          lastPruned: new Date(stats.lastPruned).toISOString(),
          hoursAgo: Math.round((now - stats.lastPruned) / 3600000)
        });
        return 0;
      }
      
      // Find expired entries
      const expiredEntries = await this.listEntriesWithFilter(
        (metadata) => metadata.expiration < now,
        maxEntriesToPrune
      );
      
      // If no expired entries, just update stats and return
      if (expiredEntries.length === 0) {
        // Update last pruned time
        stats.lastPruned = now;
        await kv.put(this.statsKey, JSON.stringify(stats));
        
        this.logger.info('No expired entries found during maintenance', {
          now: new Date(now).toISOString()
        });
        
        return 0;
      }
      
      // Extract keys to delete
      const keysToDelete = expiredEntries.map(entry => entry.key);
      
      // Log the operation
      this.logger.info('Performing cache maintenance', {
        totalEntries: stats.count,
        expiredEntries: expiredEntries.length,
        pruningUp: Math.min(expiredEntries.length, maxEntriesToPrune)
      });
      
      // Use batched deletion for better performance
      const batchSize = 10; // Process 10 keys at a time
      const batches: string[][] = [];
      
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        const batch = keysToDelete.slice(i, i + batchSize);
        batches.push(batch);
      }
      
      // Process batches sequentially to avoid overwhelming KV
      const processBatches = async () => {
        let deletedCount = 0;
        let clearedSize = 0;
        
        for (const [batchIndex, batch] of batches.entries()) {
          // Add delay between batches
          if (batchIndex > 0 && this.config.purgeDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.purgeDelay));
          }
          
          // Process all keys in this batch in parallel
          await Promise.all(batch.map(async (key: string) => {
            try {
              // Get metadata before deletion to track size
              const entry = expiredEntries.find(e => e.key === key);
              
              // Delete the key
              await kv.delete(key);
              deletedCount++;
              
              // Track size reduction
              if (entry?.metadata.size) {
                clearedSize += entry.metadata.size;
              }
              
              // For optimized approach, update indices if needed
              if (this.config.optimizedIndexing) {
                // We have the metadata from our filter function
                const metadata = entry?.metadata;
                
                if (metadata) {
                  // Clean up tag references lazily - just handle a few to avoid too many operations
                  // Take up to 3 tags to clean
                  const tagsToClean = metadata.tags.slice(0, 3);
                  
                  for (const tag of tagsToClean) {
                    try {
                      const tagKey = `${this.config.prefix}:tag:${tag}`;
                      const tagKeysStr = await kv.get(tagKey, 'text') || '';
                      
                      if (tagKeysStr && tagKeysStr.includes(key)) {
                        const tagKeys = tagKeysStr.split(',').filter(k => k !== key);
                        
                        if (tagKeys.length > 0) {
                          await kv.put(tagKey, tagKeys.join(','));
                        } else {
                          // If no more keys, remove the tag
                          await kv.delete(tagKey);
                          
                          // Also update all-tags
                          const allTagsKey = `${this.config.prefix}:all-tags`;
                          const allTags = await kv.get(allTagsKey, 'text') || '';
                          const allTagsList = allTags.split(',').filter(t => t !== tag);
                          await kv.put(allTagsKey, allTagsList.join(','));
                        }
                      }
                    } catch (tagError) {
                      this.logger.warn(`Error cleaning tag index for "${tag}"`, {
                        error: tagError instanceof Error ? tagError.message : String(tagError),
                        key
                      });
                    }
                  }
                  
                  // Clean up path reference - just the main path
                  try {
                    const url = new URL(metadata.url);
                    const path = url.pathname;
                    const pathKey = `${this.config.prefix}:path:${path}`;
                    
                    const pathKeysStr = await kv.get(pathKey, 'text') || '';
                    
                    if (pathKeysStr && pathKeysStr.includes(key)) {
                      const pathKeys = pathKeysStr.split(',').filter(k => k !== key);
                      
                      if (pathKeys.length > 0) {
                        await kv.put(pathKey, pathKeys.join(','));
                      } else {
                        // If no more keys, remove the path
                        await kv.delete(pathKey);
                        
                        // Also update all-paths
                        const allPathsKey = `${this.config.prefix}:all-paths`;
                        const allPaths = await kv.get(allPathsKey, 'text') || '';
                        const allPathsList = allPaths.split(',').filter(p => p !== path);
                        await kv.put(allPathsKey, allPathsList.join(','));
                      }
                    }
                  } catch (pathError) {
                    this.logger.warn('Error cleaning path index', {
                      error: pathError instanceof Error ? pathError.message : String(pathError),
                      key,
                      url: metadata.url
                    });
                  }
                }
              }
            } catch (keyError) {
              this.logger.warn(`Error deleting key ${key} during maintenance`, {
                error: keyError instanceof Error ? keyError.message : String(keyError)
              });
            }
          }));
        }
        
        // Update stats
        stats.count = Math.max(0, stats.count - deletedCount);
        stats.size = Math.max(0, stats.size - clearedSize);
        stats.lastPruned = now;
        
        await kv.put(this.statsKey, JSON.stringify(stats));
        
        return { deletedCount, clearedSize };
      };
      
      // Run maintenance based on execution context
      if (ctx) {
        // Run in the background
        if (typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(processBatches().catch(error => {
            this.logger.error('Error in background maintenance', {
              error: error instanceof Error ? error.message : String(error)
            });
          }));
      } else {
        this.logger.warn('waitUntil is not a function in the provided context', {
          contextType: typeof ctx,
          waitUntilType: typeof ctx.waitUntil
        });
        // Still run in background (will be ignored in tests)
        Promise.resolve().then(() => processBatches().catch(error => {
          this.logger.error('Error in background maintenance', {
            error: error instanceof Error ? error.message : String(error)
          });
        }));
      }
        
        this.logger.info('Started background cache maintenance', {
          expiredEntries: expiredEntries.length,
          processingEntries: keysToDelete.length
        });
        
        return keysToDelete.length;
      } else {
        // Run synchronously
        const result = await processBatches();
        
        this.logger.info('Completed cache maintenance', {
          deletedCount: result.deletedCount,
          clearedSize: result.clearedSize,
          now: new Date(now).toISOString()
        });
        
        return result.deletedCount;
      }
    } catch (error) {
      this.logger.error('Error performing cache maintenance', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return 0;
    }
  }
  
  /**
   * Update cache statistics
   */
  private async updateStats(operation: 'hit' | 'miss' | 'put', size?: number): Promise<void> {
    try {
      // Ensure namespace is initialized
      const kv = await this.ensureNamespace();
      
      // Get current stats
      const statsStr = await kv.get(this.statsKey, 'text') || JSON.stringify(DEFAULT_STATS);
      const stats = JSON.parse(statsStr) as StatsData;
      
      // Update stats based on operation
      switch (operation) {
        case 'hit':
          stats.hits++;
          break;
        case 'miss':
          stats.misses++;
          break;
        case 'put':
          if (size) {
            stats.count++;
            stats.size += size;
          }
          break;
      }
      
      // Save the updated stats
      await kv.put(this.statsKey, JSON.stringify(stats));
    } catch (error) {
      this.logger.error('Error updating cache stats', {
        error: error instanceof Error ? error.message : String(error),
        operation
      });
    }
  }
  
  /**
   * Get the TTL for a specific content type
   */
  private getTtlForContentType(contentType: string): number {
    const type = contentType.split(';')[0].trim().toLowerCase();
    return this.config.contentTypeTtls[type] || this.config.defaultTtl;
  }
  
  /**
   * Check if a URL should bypass the cache
   */
  private shouldBypassCache(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Check against disallowed paths
      for (const disallowedPath of this.config.disallowedPaths) {
        if (path.includes(disallowedPath)) {
          this.logger.debug('Disallowed path detected, bypassing cache', {
            url,
            path,
            disallowedPath
          });
          return true;
        }
      }
      
      // Do not check client's Cache-Control headers here
      // KV transform cache should work regardless of client caching preferences
      
      return false;
    } catch (error) {
      this.logger.error('Error checking cache bypass', {
        error: error instanceof Error ? error.message : String(error),
        url
      });
      
      return true; // Bypass cache on error
    }
  }
}