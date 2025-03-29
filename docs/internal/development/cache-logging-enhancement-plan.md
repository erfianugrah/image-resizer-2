# Cache Logging Enhancement Plan

This document outlines a focused approach to improve logging in the cache system, with emphasis on integrating the SimpleKVTransformCacheManager with the project's existing logging infrastructure.

## Current State

The SimpleKVTransformCacheManager currently uses direct console methods instead of the Logger interface used by other components:

```typescript
// Current SimpleKVTransformCacheManager logging
if (typeof console !== 'undefined' && console.warn) {
  console.warn("KV transform cache: Retrieved cache item is missing content type", { 
    key,
    metadataKeys: Object.keys(result.metadata).join(',')
  });
}

// Standard pattern in other components
this.logger.debug("Added resource hints to response", {
  contentType,
  hasPreconnect: !!config.cache.resourceHints?.preconnect,
  hasPreloads,
  url: request.url
});
```

The root cause is that KVTransformCacheManagerFactory receives a logger but doesn't pass it to SimpleKVTransformCacheManager:

```typescript
// In KVTransformCacheManagerFactory.ts
export function createKVTransformCacheManager(options: KVTransformCacheOptions): KVTransformCacheInterface {
  const { config, logger } = options;
  // ...
  
  // Logger is not passed to constructor
  return new SimpleKVTransformCacheManager(config, kvNamespace);
}
```

## Enhancement Approach

We'll take a minimally invasive approach to integrate SimpleKVTransformCacheManager with the existing logging system:

1. Update SimpleKVTransformCacheManager to accept an optional logger parameter
2. Modify KVTransformCacheManagerFactory to pass its logger to SimpleKVTransformCacheManager 
3. Enhance key methods with improved logging using standard patterns

## Implementation Steps

### 1. Update SimpleKVTransformCacheManager Constructor

```typescript
export class SimpleKVTransformCacheManager implements KVTransformCacheInterface {
  private config: KVCacheConfig;
  private kvNamespace: KVNamespace;
  private logger?: Logger;
  private stats = {
    hits: 0,
    misses: 0,
    lastPruned: new Date(0)
  };

  /**
   * Create a new SimpleKVTransformCacheManager
   * 
   * @param config Cache configuration
   * @param kvNamespace KV namespace binding
   * @param logger Optional logger for improved logging
   */
  constructor(config: KVCacheConfig, kvNamespace: KVNamespace, logger?: Logger) {
    this.config = config;
    this.kvNamespace = kvNamespace;
    this.logger = logger;
  }
  
  // Other methods...
}
```

### 2. Update KVTransformCacheManagerFactory

```typescript
export function createKVTransformCacheManager(options: KVTransformCacheOptions): KVTransformCacheInterface {
  const { config, logger } = options;
  let { kvNamespace } = options;
  
  // Check if KV transform cache is entirely disabled
  if (!config.enabled) {
    logger.info('KV transform cache is disabled, returning a disabled implementation');
    // Create a disabled implementation that doesn't need a KV namespace
    return new SimpleKVTransformCacheManager({
      ...config,
      enabled: false
    }, null as unknown as KVNamespace, logger);
  }
  
  // Validate namespace
  if (!kvNamespace) {
    logger.warn('KV namespace is not provided but cache is enabled - checking fallbacks');
    
    // No KV namespace available from constructor parameters
    logger.warn(`KV namespace not provided in constructor, disabling KV transform cache`);
    return new SimpleKVTransformCacheManager({
      ...config,
      enabled: false
    }, null as unknown as KVNamespace, logger);
  }
  
  logger.debug('KV Transform Cache configuration', {
    cacheConfig: JSON.stringify(config, null, 2).substring(0, 100) + '...'
  });
  
  // Always use the simplified implementation, now passing the logger
  logger.info('Creating SimpleKVTransformCacheManager with metadata-based filtering');
  return new SimpleKVTransformCacheManager(config, kvNamespace, logger);
}
```

### 3. Update Key Methods with Improved Logging

Update methods to use the logger if available, with console fallback for backward compatibility:

```typescript
private logDebug(message: string, data?: Record<string, unknown>): void {
  if (this.logger) {
    this.logger.debug(message, data);
  } else if (typeof console !== 'undefined' && console.debug) {
    console.debug(message, data);
  }
}

private logWarn(message: string, data?: Record<string, unknown>): void {
  if (this.logger) {
    this.logger.warn(message, data);
  } else if (typeof console !== 'undefined' && console.warn) {
    console.warn(message, data);
  }
}

private logError(message: string, data?: Record<string, unknown>): void {
  if (this.logger) {
    this.logger.error(message, data);
  } else if (typeof console !== 'undefined' && console.error) {
    console.error(message, data);
  }
}
```

### 4. Add Standardized Logging Fields

Ensure all cache operation logs include these standard fields:

| Field | Description | Example |
|-------|-------------|---------|
| `operation` | Type of operation | `"kv_get"`, `"kv_put"`, `"kv_delete"` |
| `result` | Operation result | `"hit"`, `"miss"`, `"write"`, `"error"` |
| `key` | Cache key | `"transform:image.jpg:w800:webp:1a2b3c4d"` |
| `reason` | Context for misses/errors | `"not_found"`, `"invalid_content_type"` |
| `url` | Request URL | `"https://example.com/image.jpg?width=800"` |
| `durationMs` | Operation time (ms) | `42` |

## Example Method Enhancement

Here's how the `get` method would be enhanced:

```typescript
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
  
  try {
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
        Object.keys(transformOptions).length : 'none'
    });
    
    return {
      value: result.value,
      metadata: result.metadata,
      key
    };
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
```

## Implementation Tasks

- [x] Update SimpleKVTransformCacheManager to accept logger parameter
- [x] Update KVTransformCacheManagerFactory to pass logger
- [x] Add helper methods for consistent logging
- [x] Enhance get() method with improved logging
- [x] Enhance isCached() method with improved logging
- [ ] Enhance put() method with improved logging
- [ ] Enhance delete() method with improved logging
- [ ] Enhance purgeByTag() and purgeByPath() methods
- [ ] Enhance performMaintenance() method
- [x] Add performance metrics tracking (duration measurements)
- [x] Test changes with TypeScript checking

## Future Work

For a future enhancement, we should:

1. Update the remaining methods in SimpleKVTransformCacheManager with improved logging
2. Add breadcrumb support for long-running operations
3. Consider adding detailed performance metrics tracking for metadata operations
4. Provide a log-based dashboard or visualization for cache performance
5. Implement aggregated metrics for hit rates, cache size, and other key indicators