# Cache Migration Guide - Optimized KV Transform Cache

This guide provides instructions for migrating to the new optimized KV Transform Cache system from the previous implementation.

## Overview

The KV Transform Cache has been significantly enhanced with a hybrid approach that balances performance and functionality. The new system offers two operational modes:

1. **Standard Mode**: Similar to the previous implementation but with improved error handling and background processing.
2. **Optimized Mode**: Uses a more efficient indexing strategy for better performance with large caches.

## Configuration Changes

Update your config.ts or wrangler.jsonc configuration with the new options:

```typescript
export default {
  // ... other config
  cache: {
    // ... other cache config
    transformCache: {
      enabled: true,
      binding: "IMAGE_TRANSFORMATIONS_CACHE",
      prefix: "transform",
      maxSize: 10485760, // 10MB
      defaultTtl: 86400, // 1 day
      contentTypeTtls: {
        'image/jpeg': 604800, // 7 days
        'image/png': 604800,  // 7 days
        'image/webp': 604800, // 7 days
        // ... other content types
      },
      
      // Advanced performance options
      optimizedIndexing: true,          // Enable the optimized approach
      smallPurgeThreshold: 20,          // Threshold for direct vs. list+filter purging
      indexUpdateFrequency: 1,          // Update indices every time (set higher for fewer updates)
      skipIndicesForSmallFiles: true,   // Skip indexing for small files
      smallFileThreshold: 51200         // 50KB threshold for "small" files
    }
  }
}
```

## Migration Steps

### 1. Update Dependencies

No new dependencies are required for this update.

### 2. Code Migration

The API surface of the cache service remains unchanged, but internal implementation has changed significantly. If you have custom implementations using the KV Transform Cache:

- Use the `ctx` parameter in cache operations to enable background processing with `waitUntil`.
- Be aware that purge operations now have optimized implementations.

### 3. Data Migration

**Important**: The optimized indexing mode uses a different storage format for indices. If you switch to optimized mode with an existing cache:

1. Purge the entire cache first using your admin tools, OR
2. Run the migration script:

```typescript
import { KVTransformCacheManager } from './services/cache/kv/KVTransformCacheManager';

async function migrateKVIndices(env: any) {
  // Create the cache manager with your logger and config service
  const cacheManager = new KVTransformCacheManager(
    logger,
    configService,
    tagsManager
  );
  
  // Perform a full migration - this may take a while for large caches
  const { processed, migrated } = await cacheManager.migrateToOptimizedIndices();
  
  console.log(`Migration complete: ${processed} entries processed, ${migrated} entries migrated`);
}
```

### 4. Performance Monitoring

After migration, monitor the cache performance using the enhanced stats:

```typescript
const stats = await cacheManager.getStats();
console.log('Cache Stats:', {
  entries: stats.count,
  size: `${(stats.size / 1024 / 1024).toFixed(2)}MB`,
  indexSize: `${(stats.indexSize / 1024).toFixed(2)}KB`,
  hitRate: `${stats.hitRate.toFixed(1)}%`,
  optimized: stats.optimized,
  lastMaintenance: stats.lastPruned
});
```

### 5. Configure Maintenance

Set up regular maintenance to keep the cache optimized:

```typescript
// In your main worker handler:
export default {
  async scheduled(event, env, ctx) {
    // Run maintenance during scheduled events
    const cacheManager = getCacheManager(env);
    await cacheManager.performMaintenance(500, ctx); // Process up to 500 entries
  },
  
  async fetch(request, env, ctx) {
    // Your normal request handling
    // ...
    
    // Optionally trigger lightweight maintenance occasionally (1% of requests)
    if (Math.random() < 0.01) {
      ctx.waitUntil(cacheManager.performMaintenance(50, ctx)); // Light maintenance
    }
    
    return response;
  }
};
```

## Troubleshooting

### Common Issues

1. **KV Operation Limit Exceeded**
   - If you see this error, increase the `indexUpdateFrequency` value to reduce KV operations.
   - Consider enabling `skipIndicesForSmallFiles` to reduce indexing overhead.

2. **Slow Purge Operations**
   - Adjust the `smallPurgeThreshold` based on your typical purge size.
   - For very large caches, schedule purges during off-peak hours.

3. **Missing Cache Items After Migration**
   - If items are missing after migration, check if indices were properly converted.
   - Run a full maintenance operation: `await cacheManager.performMaintenance(1000);`

### Reverting to Standard Mode

If you encounter issues with optimized mode, you can revert to standard mode:

1. Update your configuration:
```typescript
transformCache: {
  // ...other settings
  optimizedIndexing: false
}
```

2. Purge all cache tags to reset the indices:
```typescript
// Get all tags
const stats = await cacheManager.listAllTags();
// Purge each tag
for (const tag of stats.tags) {
  await cacheManager.purgeByTag(tag);
}
```

## Best Practices

1. **Small Deployments**
   - If your cache has fewer than 10,000 items, standard mode may be simpler.
   - Enable background processing regardless of mode.

2. **Large Deployments**
   - For more than 10,000 items, optimized mode offers better performance.
   - Tune the optimization parameters based on your specific workload.
   - Schedule regular maintenance during off-peak hours.

3. **Extreme Scale**
   - For very large caches (100,000+ items), consider increasing:
     - `indexUpdateFrequency` to 5 or 10
     - `smallFileThreshold` to 100KB or higher
     - `smallPurgeThreshold` to 50 or higher
