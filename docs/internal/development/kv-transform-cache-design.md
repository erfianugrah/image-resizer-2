# KV Transform Cache Design

This document outlines the design for using Cloudflare KV as a storage mechanism for transformed images, with efficient tag-based purging capabilities.

## Goals

The KV transform cache aims to:

1. Store transformed images to avoid redundant processing
2. Provide fast retrieval of frequently-accessed images
3. Enable efficient purging by tag or path pattern
4. Support background processing for non-blocking operations
5. Collect usage metrics for monitoring and optimization
6. Integrate with the existing CacheTagsManager for consistent tagging

## Architecture

The KV transform cache consists of:

1. **KVTransformCacheInterface** - Interface defining the cache operations
2. **KVTransformCacheManager** - Implementation of the interface
3. **Secondary Indices** - KV structures that map tags and paths to cache keys
4. **Statistics Tracking** - In-KV statistics for monitoring cache usage

## Cache Key Strategy

Cache keys are generated using:

```
${prefix}:${hash(path + JSON.stringify(transformOptions))}
```

Where:
- `prefix` is a configurable string (default: "transform")
- `hash()` is a simple hash function for creating short, consistent keys
- `path` is the URL path of the original image
- `transformOptions` are the transformation parameters

This ensures:
- Unique keys for each combination of path and transformation options
- Short keys for better KV performance
- Deterministic key generation for consistent caching

## Metadata Schema

Each cached value has associated metadata:

```typescript
interface CacheMetadata {
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
```

## Secondary Indices

For efficient purging by tag or path pattern, two secondary indices are maintained:

1. **Tag Index**: Maps tags to cache keys
   ```
   {
     "tag1": ["key1", "key2", ...],
     "tag2": ["key2", "key3", ...],
     ...
   }
   ```

2. **Path Index**: Maps path patterns to cache keys
   ```
   {
     "/path/to/": ["key1", "key2", ...],
     "/path/": ["key1", "key2", "key3", ...],
     ...
   }
   ```

## Purging Strategy

### Tag-Based Purging

1. Look up the tag in the tag index to find affected keys
2. Delete each cached key
3. Remove the keys from all indices
4. Optionally perform in background using `waitUntil`

### Path-Based Purging

1. Find all path patterns that match the purge pattern
2. Collect all keys associated with matching patterns
3. Delete each cached key
4. Remove the keys from all indices
5. Optionally perform in background using `waitUntil`

## Background Processing

The cache uses Cloudflare's `waitUntil` function to perform non-blocking operations:

1. **Index Updates**: Update secondary indices without blocking the main request
2. **Bulk Purging**: Delete multiple keys without delaying the response
3. **Statistics Updates**: Update usage statistics asynchronously

## TTL Strategy

TTLs are assigned based on:

1. Content type (configurable per type)
2. Default TTL (86400 seconds = 1 day by default)
3. Configuration overrides

```typescript
contentTypeTtls: {
  'image/jpeg': 604800, // 7 days
  'image/png': 604800,  // 7 days
  'image/webp': 604800, // 7 days
  'image/avif': 604800, // 7 days
  'image/gif': 604800,  // 7 days
  'image/svg+xml': 2592000 // 30 days
}
```

## Statistics Tracking

The cache maintains statistical data in a KV entry:

```typescript
interface StatsData {
  count: number;    // Number of items in cache
  size: number;     // Total size in bytes
  hits: number;     // Number of cache hits
  misses: number;   // Number of cache misses
  lastPruned: number; // Last time cache was pruned
}
```

## Integration with CacheTagsManager

The KV transform cache uses the existing CacheTagsManager to generate consistent cache tags. This ensures:

1. Tags are generated in the same way across the application
2. Any changes to tag generation logic apply consistently
3. Proper integration with the existing caching system

## Configuration

The cache is configured through the application's configuration system:

```typescript
transformCache: {
  enabled: true,                   // Enable/disable the KV transform cache
  binding: 'IMAGE_TRANSFORMATIONS_CACHE', // KV binding name
  prefix: 'transform',             // Key prefix
  maxSize: 10485760,               // Max size to cache (10MB)
  defaultTtl: 86400,               // Default TTL (1 day)
  contentTypeTtls: { ... },        // TTLs by content type
  indexingEnabled: true,           // Enable secondary indices
  backgroundIndexing: true,        // Update indices in background
  purgeDelay: 100,                 // Delay between purge operations
  disallowedPaths: ['/admin/', '/preview/', '/draft/', '/temp/'] // Paths not to cache
}
```

## Performance Considerations

1. **Size Limits**: Only items below the configured size limit are cached
2. **Background Processing**: Non-blocking operations via `waitUntil`
3. **Efficient Key Generation**: Short, hash-based keys for better KV performance
4. **Path Segment Indexing**: Hierarchical path indexing for efficient pattern matching
5. **Pruning Old Data**: Automatic cleanup of expired entries

## Cache Bypass

The transform cache can be bypassed for:

1. Specific paths (configured via `disallowedPaths`)
2. Debug requests (when debug mode is enabled)
3. Items larger than the configured size limit

## Implementation Flow

### Cache Hit Path

1. Check KV cache using the generated key
2. If found, construct a response with the cached data and appropriate headers
3. Return the cached response to the client

### Cache Miss Path

1. Proceed with normal transformation process
2. After transformation, store the result in KV cache with metadata
3. Update indices and statistics (optionally in background)
4. Return the transformed response to the client

### Purge Path

1. Receive purge request for a tag or path pattern
2. Find affected keys using secondary indices
3. Delete each key and update indices (optionally in background)
4. Return the number of purged items

## Future Enhancements

1. **Cache Versioning**: Support for versioned cache entries to handle format changes
2. **Cache Warming**: Pre-cache common transformations
3. **Prioritized Caching**: Focus on frequently-accessed or expensive transformations
4. **Distributed Purging**: Cross-region cache purging for multi-region deployments
5. **Quota Management**: Automatic pruning when approaching KV usage limits