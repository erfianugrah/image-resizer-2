# KV Transform Cache

The Image Resizer includes a powerful KV-based transform caching system that stores transformed images in Cloudflare KV for high-performance retrieval across the global edge network.

## Overview

The KV Transform Cache stores transformed image data (after resizing, format conversion, etc.) to avoid redundant transformations of the same image with the same parameters. This significantly improves performance for frequently accessed images and reduces computational load.

## Key Features

- **Performance Optimization**: Avoid redundant transformations
- **Global Distribution**: Cached transformations available at all edge locations
- **Background Processing**: Non-blocking storage operations
- **Selective Indexing**: Smart indexing strategies for optimal KV usage
- **Flexible Purging**: Tag-based and path-based purging options
- **Automatic Maintenance**: Regular cleanup of expired entries

## Configuration

The KV Transform Cache can be configured in your `wrangler.jsonc` file:

```jsonc
{
  "vars": {
    // Enable KV transform caching
    "TRANSFORM_CACHE_ENABLED": "true",
    
    // Storage optimization settings
    "TRANSFORM_CACHE_OPTIMIZED_INDEXING": "true",
    "TRANSFORM_CACHE_SMALL_PURGE_THRESHOLD": "20",
    "TRANSFORM_CACHE_INDEX_FREQUENCY": "10",
    "TRANSFORM_CACHE_SKIP_SMALL_FILES": "true",
    "TRANSFORM_CACHE_SMALL_FILE_SIZE": "51200"
  },
  
  // KV binding required for transform cache
  "kv_namespaces": [
    {
      "binding": "IMAGE_TRANSFORMATIONS_CACHE",
      "id": "your-kv-namespace-id"
    }
  ]
}
```

## Hybrid Approach

The KV Transform Cache implements a hybrid approach with two distinct operational modes:

### 1. Standard Mode

- Maintains full JSON indices for all tags and paths
- Simple and comprehensive
- Better for smaller deployments (thousands of cached items)
- Higher KV operation overhead

### 2. Optimized Mode (Default)

- Uses distributed key-specific indices
- More efficient storage and retrieval
- Better for larger deployments (tens of thousands+ cached items)
- Lower KV operation overhead
- Supports automatic background maintenance

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `TRANSFORM_CACHE_ENABLED` | Enable/disable KV transform cache | `"true"` |
| `TRANSFORM_CACHE_OPTIMIZED_INDEXING` | Use optimized index structure | `"true"` |
| `TRANSFORM_CACHE_SMALL_PURGE_THRESHOLD` | Max items for direct purging vs. list+filter | `"20"` |
| `TRANSFORM_CACHE_INDEX_FREQUENCY` | How often to update indices (1=always, 10=every 10th) | `"10"` |
| `TRANSFORM_CACHE_SKIP_SMALL_FILES` | Skip indexing for small files | `"true"` |
| `TRANSFORM_CACHE_SMALL_FILE_SIZE` | Size threshold in bytes for "small" files | `"51200"` (50KB) |

## Cloudflare KV Requirements

You'll need to create a KV namespace in your Cloudflare account and bind it in your `wrangler.jsonc` file:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "IMAGE_TRANSFORMATIONS_CACHE",
      "id": "your-kv-namespace-id"
    }
  ]
}
```

## Implementation Details

The KV Transform Cache system offers several performance optimizations:

### Background Processing

Transform cache operations run in the background using Cloudflare's `waitUntil` API. This ensures that:

- Cache storage doesn't block the response to the client
- Error handling is isolated from the main request flow
- Performance is optimized even when caching large images

### Smart Indexing

The optimized mode includes:

- Conditional indexing based on file size
- Deterministic sampling using hash-based frequency control
- Batched operations to reduce KV access overhead
- Selective tag and path indexing

### Purging Operations

The cache supports multiple purging methods:

- **Tag-based purging**: `purgeByTag("product-category")`
- **Path-based purging**: `purgeByPath("/products/*")`
- **Pattern matching**: Support for wildcards and path patterns

### Cache Maintenance

The system can perform automatic maintenance to keep the cache optimized:

- Purging expired entries
- Cleaning up stale index references
- Optimizing storage usage
- Updating cache statistics

## Client Cache-Control Headers

The KV Transform Cache **ignores client Cache-Control headers** for storing transformed images. This ensures that transformed images are cached regardless of client preferences, providing consistent performance for all users.

However, these headers are still respected for edge caching, allowing clients to control browser/CDN caching behavior as needed.

## Best Practices

1. **Enable Background Indexing**
   ```jsonc
   "transformCache": {
     "backgroundIndexing": true
   }
   ```

2. **Adjust Index Frequency for Heavy Load**
   ```jsonc
   "TRANSFORM_CACHE_INDEX_FREQUENCY": "20"  // Update indices every 20th operation
   ```

3. **Skip Indexing for Small Files**
   ```jsonc
   "TRANSFORM_CACHE_SKIP_SMALL_FILES": "true"
   "TRANSFORM_CACHE_SMALL_FILE_SIZE": "102400"  // 100KB threshold
   ```

4. **Use Appropriate Caching for Your Workload**
   - Small deployments: Use standard mode
   - Large deployments: Use optimized mode with adjusted thresholds

## Related Topics

- [Cache Tags](../cache-tags.md)
- [Edge Caching](../cloudflare-optimizations.md)
- [Performance Optimization](../../features/quality-optimization.md)

---

*Last Updated: March 29, 2025*