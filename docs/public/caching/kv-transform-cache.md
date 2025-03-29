# KV-Based Transform Cache

The KV Transform Cache is an advanced caching system for storing transformed images in Cloudflare KV with efficient tag-based and path-based purging capabilities.

## Features

- **Persistent Storage**: Transformed images are stored in Cloudflare KV for longer-term persistence compared to the Cache API
- **Tag-Based Purging**: Purge multiple cache entries with a single tag
- **Path Pattern Purging**: Purge cache entries based on path patterns (e.g., `/images/*`)
- **Background Processing**: Non-blocking cache operations using `waitUntil`
- **Content-Type Based TTLs**: Configure different TTLs for different content types
- **Cache Statistics**: Track cache metrics like hit rate, size, and count
- **Secondary Indices**: Efficient tag-based and path-based lookups

## Configuration

To enable and configure the KV transform cache, add the following to your configuration:

```json
{
  "cache": {
    "transformCache": {
      "enabled": true,
      "binding": "IMAGE_TRANSFORMATIONS_CACHE",
      "prefix": "transform",
      "maxSize": 10485760, // 10MB default
      "defaultTtl": 86400, // 1 day default
      "contentTypeTtls": {
        "image/jpeg": 604800, // 7 days
        "image/png": 604800,  // 7 days
        "image/webp": 604800, // 7 days
        "image/avif": 604800, // 7 days
        "image/gif": 604800,  // 7 days
        "image/svg+xml": 2592000 // 30 days
      },
      "indexingEnabled": true,
      "backgroundIndexing": true,
      "purgeDelay": 100, // 100ms delay between purge operations
      "disallowedPaths": [
        "/admin/",
        "/preview/",
        "/draft/",
        "/temp/"
      ]
    }
  }
}
```

## Cloudflare KV Setup

Before using the KV transform cache, you need to create a KV namespace in your Cloudflare account and update your `wrangler.jsonc` file:

```json
"kv_namespaces": [
  {
    "binding": "IMAGE_TRANSFORMATIONS_CACHE",
    "id": "your-kv-namespace-id"
  }
]
```

## Usage

The KV transform cache is integrated with the CacheService, so you don't need to use it directly in most cases. 

### Automatic Caching

The image handler will automatically store transformed images in the KV cache when it's enabled:

```typescript
// Example from image handler
const transformedResponse = await transformationService.transformImage(
  request, 
  storageResult, 
  transformOptions, 
  config
);

// The transformed image will be automatically stored in KV cache
if (config.cache.transformCache?.enabled) {
  ctx.waitUntil(
    cacheService.storeTransformedImage(
      request, 
      transformedResponse.clone(), 
      storageResult, 
      transformOptions, 
      ctx
    )
  );
}

return transformedResponse;
```

### Checking Cache Status

To check if a transformed image is already in the cache:

```typescript
const isCached = await cacheService.isTransformCached(request, transformOptions);
if (isCached) {
  // Use the cached version
  const cachedResponse = await cacheService.getTransformedImage(request, transformOptions);
  if (cachedResponse) {
    return cachedResponse;
  }
}

// Proceed with transformation if not cached
```

### Manual Cache Operations

For administrative purposes, you can manually purge cache entries:

```typescript
// Purge by tag
const count = await cacheService.purgeTransformsByTag('product-images', ctx);
console.log(`Purged ${count} cached images`);

// Purge by path pattern
const count = await cacheService.purgeTransformsByPath('/products/*', ctx);
console.log(`Purged ${count} cached images matching pattern`);

// Get cache statistics
const stats = await cacheService.getTransformCacheStats();
console.log(`Cache contains ${stats.count} entries, total size: ${stats.size} bytes`);
```

## How It Works

### Cache Keys

Each transformed image is stored with a unique cache key based on:
- The request URL (without cache-busting query parameters)
- The transformation options applied

### Metadata

Each cached item includes metadata:
- URL of the original request
- Content type of the transformed image
- Size in bytes
- Transformation options used
- Cache tags
- TTL and expiration timestamp
- Original size and compression ratio statistics

### Secondary Indices

To enable efficient tag-based and path-based purging, the system maintains two indices:
- **Tag Index**: Maps tags to cache keys
- **Path Index**: Maps path patterns to cache keys

### Background Processing

To avoid blocking response times, index updates and purging operations are performed in the background using `waitUntil`.

## Best Practices

1. **Use Tags Effectively**: Add specific tags to identify groups of related images for easy purging.
2. **Configure TTLs by Content Type**: Set longer TTLs for formats like SVG that rarely change.
3. **Use Path Patterns for Structure**: Organize images in path patterns that make sense for your application's purging needs.
4. **Limit Cache Entry Size**: Configure `maxSize` appropriately to avoid storing very large images.
5. **Monitor Cache Statistics**: Regularly check cache stats to ensure optimal performance.

## Performance Considerations

- The KV transform cache is ideal for transformed images that will be reused multiple times
- For one-off transformations, consider bypassing the cache
- Use background indexing for best response times
- When purging many items, consider performing this operation during low-traffic periods