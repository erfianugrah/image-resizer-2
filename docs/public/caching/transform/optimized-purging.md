# Optimized Cache Purging

This document explains the optimized purging strategies available in the KV Transform Cache system.

## Overview

The KV Transform Cache offers advanced purging capabilities that balance performance and functionality. The system supports two purging approaches based on the cache size and usage patterns.

## Purging Methods

### Tag-Based Purging

Tag-based purging allows you to purge all cached transformations with a specific tag:

```typescript
// Purge all product images
await cacheService.purgeByTag("product");

// Purge all images with specific dimensions
await cacheService.purgeByTag("width-800");

// Purge all WebP images
await cacheService.purgeByTag("format-webp");
```

### Path-Based Purging

Path-based purging allows you to purge all cached transformations matching a path pattern:

```typescript
// Purge all product images
await cacheService.purgeByPath("/products/*");

// Purge a specific user's profile picture in all formats and sizes
await cacheService.purgeByPath("/users/123/profile.*");

// Purge all blog post images
await cacheService.purgeByPath("/blog/*/images/*");

// Purge a specific transformation (with query parameters)
await cacheService.purgeByPath("/products/chair.jpg?width=800&format=webp");
```

The system indexes both the base path (without query parameters) and the full path (including query parameters), allowing you to purge:

1. All transformations of a specific image
2. All images in a specific directory
3. A specific transformation with exact parameters

## Purging Strategies

The KV Transform Cache uses two distinct strategies for purging, dynamically selecting the most efficient approach based on the number of items to be purged:

### 1. Direct Key Lookup (Small Purges)

For small numbers of items (below the `smallPurgeThreshold`):

- **How it works**: Directly identifies and deletes the specific keys associated with the tag or path
- **Best for**: Small to medium-sized purges (default threshold: 20 items)
- **Benefits**: Very precise, minimal KV operations per purged item
- **Example**: Purging product images for a specific product ID

### 2. List+Filter Approach (Large Purges)

For larger numbers of items (above the `smallPurgeThreshold`):

- **How it works**: Lists all cache entries and filters by metadata before purging
- **Best for**: Large-scale purges (entire product categories, all images of a specific format)
- **Benefits**: More efficient for large numbers of items, avoids excessive KV operations
- **Example**: Purging all WebP images across the site, purging an entire section of content

## Configuration

You can tune the purging strategy by adjusting the `smallPurgeThreshold` setting:

```jsonc
// In wrangler.jsonc:
{
  "vars": {
    "TRANSFORM_CACHE_SMALL_PURGE_THRESHOLD": "20"
  }
}

// Or in config.ts:
export default {
  cache: {
    transformCache: {
      smallPurgeThreshold: 20
    }
  }
}
```

### Recommended Values

| Deployment Size | Recommended Threshold |
|-----------------|------------------------|
| Small (< 10K items) | 10-20 |
| Medium (10K-100K items) | 20-50 |
| Large (> 100K items) | 50-100 |

## Background Purging

For large purge operations that might be time-consuming, you can use background purging with an execution context:

```typescript
app.post('/api/purge-cache', async (c) => {
  const { tag, path } = await c.req.json();
  
  if (tag) {
    // Run purge operation in the background
    c.executionCtx.waitUntil(cacheService.purgeByTag(tag, c.executionCtx));
    return c.json({ status: 'Purging started for tag: ' + tag });
  }
  
  if (path) {
    // Run purge operation in the background
    c.executionCtx.waitUntil(cacheService.purgeByPath(path, c.executionCtx));
    return c.json({ status: 'Purging started for path: ' + path });
  }
  
  return c.json({ error: 'Missing tag or path parameter' }, 400);
});
```

## Batch Purging

For best performance when purging many different tags or paths, group them into batches:

```typescript
// Instead of:
for (const tag of tags) {
  await cacheService.purgeByTag(tag);
}

// Use a batched approach:
for (let i = 0; i < tags.length; i += 5) {
  const batch = tags.slice(i, i + 5);
  await Promise.all(batch.map(tag => cacheService.purgeByTag(tag)));
}
```

## Scheduled Maintenance

You can set up scheduled maintenance to automatically clean up expired cache entries:

```typescript
export default {
  async scheduled(event, env, ctx) {
    // Run cache maintenance during scheduled events
    const cacheService = getCacheService(env);
    await cacheService.performMaintenance(500, ctx); // Process up to 500 entries
  }
};
```

## Best Practices

1. **Use Specific Tags**: Create and use specific tags for easier purging
2. **Batch Related Updates**: Group related updates to minimize purge operations
3. **Use Background Processing**: Always use `waitUntil` for large purge operations
4. **Monitor Purge Operations**: Track purge operation statistics for optimization
5. **Schedule Regular Maintenance**: Set up automatic maintenance for optimal performance

## Related Topics

- [KV Transform Cache](index.md)
- [Cache Tags](../cache-tags.md)
- [Performance Optimization](../../features/quality-optimization.md)

---

*Last Updated: March 29, 2025*