# Cache Logging Strategy

This document outlines the enhanced logging strategy for the cache system in the image-resizer-2 project. The goal is to provide consistent, structured logging across all cache components to improve visibility, debugging, and performance monitoring.

## Overview

The cache logging strategy enhances the existing logging system with cache-specific patterns and practices. It leverages the existing `Logger` interface and the Pino integration while adding standardized patterns for cache operations.

## Key Objectives

1. **Standardized Cache Operation Logging**: Create consistent logging patterns for all cache operations (lookup, store, delete, etc.)
2. **Performance Metrics**: Track and log detailed performance metrics for cache operations
3. **Breadcrumb Integration**: Integrate with the existing breadcrumb tracing system
4. **Error Visibility**: Improve error logging for cache operations with contextual details
5. **Log Level Optimization**: Ensure appropriate log levels for different cache events

## Implementation Strategy

### 1. Cache Operation Breadcrumbs

Extend the existing breadcrumb system to track cache operations using a standardized pattern:

```typescript
// Example breadcrumb for cache operations
logger.breadcrumb('kv_cache_lookup', startTime - endTime, {
  key: cacheKey,
  hit: cacheHit,
  contentType: metadata?.contentType,
  size: metadata?.size,
  path: url.pathname
});
```

### 2. Performance Metric Logging

Add detailed performance metrics logging for cache operations:

```typescript
// Example performance metric logging
const lookupDuration = endTime - startTime;
const metrics = {
  operation: 'kv_cache_lookup',
  durationMs: lookupDuration,
  hit: !!result,
  size: result?.metadata?.size || 0,
  key: cacheKey
};

// Log at the appropriate level based on the duration
if (lookupDuration > 100) {
  logger.warn('Cache lookup took longer than expected', metrics);
} else {
  logger.debug('Cache lookup performance', metrics);
}
```

### 3. Structured Error Logging

Implement comprehensive structured error logging for cache operations:

```typescript
// Example error logging pattern
try {
  // Cache operation
} catch (error) {
  logger.error('KV cache operation failed', {
    operation: 'kvCachePut',
    key: cacheKey,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    url: request.url,
    contentType: response.headers.get('Content-Type'),
    size: storageResult.buffer.byteLength,
    context: 'SimpleKVTransformCacheManager.put'
  });
}
```

### 4. Cache Hit/Miss Pattern

Standardize cache hit/miss logging across all cache implementations:

```typescript
// For cache hits
logger.debug('KV cache hit', {
  key: cacheKey,
  url: request.url,
  contentType: result.metadata.contentType,
  size: result.metadata.size,
  age: Date.now() - result.metadata.timestamp
});

// For cache misses
logger.debug('KV cache miss', {
  key: cacheKey,
  url: request.url,
  reason: 'Not found in KV store'
});
```

## Standard Log Fields for Cache Operations

To ensure consistency, the following fields should be included in all cache-related logs:

| Field | Description | Example |
|-------|-------------|---------|
| `operation` | The specific cache operation | `"kv_lookup"`, `"kv_store"`, `"cf_cache"` |
| `result` | The operation outcome | `"hit"`, `"miss"`, `"write"`, `"error"` |
| `key` | The cache key used | `"transform:image.jpg:w800-h600:webp:1a2b3c4d"` |
| `url` | The request URL | `"https://example.com/image.jpg?width=800"` |
| `contentType` | The content type of the cached item | `"image/webp"` |
| `size` | The size in bytes | `12345` |
| `durationMs` | The operation duration in milliseconds | `42` |
| `timestamp` | The time of the event (ISO string) | `"2025-03-29T12:34:56.789Z"` |
| `context` | The component context | `"SimpleKVTransformCacheManager"` |
| `error` | Error message if applicable | `"KV quota exceeded"` |

## Log Levels for Cache Events

Different cache events should be logged at appropriate levels for proper visibility:

| Event Type | Log Level | Rationale |
|------------|-----------|-----------|
| Cache configuration | `INFO` | Important but not frequent |
| Cache hits | `DEBUG` | High volume, not usually needed |
| Cache misses | `DEBUG` | High volume, useful for debugging |
| Cache writes | `DEBUG` | High volume, useful for debugging |
| Performance issues | `WARN` | Important for monitoring |
| Cache errors | `ERROR` | Critical issues requiring attention |
| Circuit breaker events | `WARN` | Important state changes |
| Cache pruning operations | `INFO` | Administrative operations |

## Implementation in Cache Components

### 1. SimpleKVTransformCacheManager

#### Current Implementation Issue

The SimpleKVTransformCacheManager currently uses direct console methods with existence checks:

```typescript
if (typeof console !== 'undefined' && console.warn) {
  console.warn("KV transform cache: Retrieved cache item is missing content type", { 
    key,
    metadataKeys: Object.keys(result.metadata).join(',')
  });
}
```

This is inconsistent with the rest of the codebase which uses the Logger interface. The issue stems from the KVTransformCacheManagerFactory which receives a logger but doesn't pass it to the SimpleKVTransformCacheManager constructor:

```typescript
// In KVTransformCacheManagerFactory.ts
export function createKVTransformCacheManager(options: KVTransformCacheOptions): KVTransformCacheInterface {
  const { config, logger } = options;
  // ...
  
  // Logger is not passed to the constructor
  return new SimpleKVTransformCacheManager(config, kvNamespace);
}
```

#### Implementation Plan

We need to modify SimpleKVTransformCacheManager to accept a logger in its constructor and update the factory to pass the logger:

1. Update the SimpleKVTransformCacheManager constructor to accept a logger parameter
2. Update KVTransformCacheManagerFactory to pass the logger to SimpleKVTransformCacheManager
3. Replace all console.* calls with the appropriate logger methods
4. Ensure backward compatibility for existing code

The refactored constructor should look like:

```typescript
export class SimpleKVTransformCacheManager implements KVTransformCacheInterface {
  private config: KVCacheConfig;
  private kvNamespace: KVNamespace;
  private logger: Logger;
  private stats = {
    hits: 0,
    misses: 0,
    lastPruned: new Date(0)
  };

  constructor(config: KVCacheConfig, kvNamespace: KVNamespace, logger?: Logger) {
    this.config = config;
    this.kvNamespace = kvNamespace;
    
    // Support legacy instantiation without logger
    if (logger) {
      this.logger = logger;
    } else {
      // Create a minimal default logger that uses console
      this.logger = {
        debug: (message, data) => console?.debug?.(message, data),
        info: (message, data) => console?.info?.(message, data),
        warn: (message, data) => console?.warn?.(message, data),
        error: (message, data) => console?.error?.(message, data),
        breadcrumb: () => {} // No-op for breadcrumbs if no logger provided
      } as Logger;
    }
  }
  
  // Methods using this.logger instead of console
}
```

### 2. CachePerformanceManager

The CachePerformanceManager will be enhanced with:

- Detailed metrics tracking
- Performance anomaly detection
- Cache efficiency reporting
- Resource hint usage logging

### 3. DefaultCacheService

The DefaultCacheService will be enhanced with:

- High-level operation tracking
- Circuit breaker state logging
- Cross-component coordination logging
- Cache policy decision logging

## Phased Implementation

The enhanced logging will be implemented in phases:

### Phase 1: Core Logging Structure
- Add standardized logging patterns to SimpleKVTransformCacheManager
- Implement performance metrics logging in CachePerformanceManager
- Update error handling with improved contextual logging

### Phase 2: Extended Metrics
- Add cache efficiency metrics
- Implement cache hit ratio tracking
- Add size-based metrics for cache entries
- Track cache pruning effectiveness

### Phase 3: Advanced Features
- Implement adaptive logging based on performance
- Add cache usage pattern detection
- Support for external metrics systems

## Backward Compatibility

To maintain backward compatibility:

1. Keep supporting existing logger interfaces
2. Use existing log levels and breadcrumb system
3. Extend rather than replace current logging patterns
4. Ensure all components handle missing logger gracefully

## Testing Strategy

Testing the enhanced logging will involve:

1. Unit tests verifying log messages are properly formatted
2. Integration tests confirming log correlation across components
3. Performance tests ensuring logging doesn't introduce significant overhead
4. Capture and analysis of different cache scenarios (hit, miss, error) to verify visibility

## Conclusion

This enhanced logging strategy will significantly improve the observability of the cache system, making it easier to debug issues, track performance, and understand cache behavior patterns. By using standardized log formats and consistent metrics, we can better analyze cache performance and identify opportunities for optimization.