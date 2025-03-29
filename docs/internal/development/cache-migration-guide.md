# KV Transform Cache Migration Guide

## Overview

This guide outlines the migration process from the index-based KV transform cache implementation to the simplified metadata-based approach. The migration can be done incrementally without downtime.

## Migration Steps

### 1. Configuration Update

Update your wrangler.jsonc to enable the simplified implementation:

```jsonc
{
  "vars": {
    /* KV Transform Cache Settings */
    "TRANSFORM_CACHE_ENABLED": "true",
    "TRANSFORM_CACHE_USE_SIMPLE_IMPLEMENTATION": "true"
  }
}
```

The `TRANSFORM_CACHE_USE_SIMPLE_IMPLEMENTATION` setting controls which implementation is used.

### 2. Gradual Transition

The system supports both implementations concurrently, so you can:

1. Deploy the updated code with the simplified implementation
2. Monitor cache performance and behavior
3. Verify that cache hits/misses work as expected with the new implementation

The KV namespace will have data stored in both formats (indexed and simplified) during the transition period.

### 3. Key Format Changes

#### Old Format (Indexed Implementation)
- Main key: MD5 hash like `transform:8f7e6d5c4b3a2190`
- Tag index: `transform:tag:product:keys` with JSON array of keys
- Path index: `transform:path:/products/:keys` with JSON array of keys

#### New Format (Simplified Implementation)
- Human-readable key format: `transform:image-name:w800-h600-q80:webp:a1b2c3d4`
- No separate index keys

### 4. One-time Migration (Optional)

If desired, you can perform a one-time migration to convert all existing cache entries to the new format:

```typescript
async function migrateKVCache() {
  // Get all keys with the transform prefix
  const oldCache = new KVTransformCacheManager(logger, configService, tagsManager);
  const newCache = new SimpleKVTransformCacheManager(
    /* config */,
    /* kvNamespace */
  );
  
  // List all entries
  let cursor;
  let complete = false;
  
  while (!complete) {
    const result = await oldCache.listEntries(1000, cursor);
    
    // Process each entry
    for (const entry of result.entries) {
      // Get the cached data
      const cacheData = await kvNamespace.get(entry.key, 'arrayBuffer');
      if (cacheData) {
        // Re-create the request from the metadata
        const url = entry.metadata.url;
        const req = new Request(url);
        
        // Create a response with the cached data
        const resp = new Response(cacheData, {
          headers: {
            'Content-Type': entry.metadata.contentType
          }
        });
        
        // Store in the new format
        await newCache.put(
          req,
          resp,
          {
            buffer: cacheData,
            response: resp,
            storageType: entry.metadata.storageType || 'unknown',
            contentType: entry.metadata.contentType,
            size: entry.metadata.size,
            originalSize: entry.metadata.originalSize
          },
          entry.metadata.transformOptions
        );
      }
    }
    
    cursor = result.cursor;
    complete = result.complete || !cursor;
  }
  
  // Once migration is complete, you can delete the old index keys
  // (Note: only do this after verifying the migration was successful)
}
```

### 5. Clean-up (Optional)

After the migration is complete and the new implementation is working as expected, you can optionally clean up the old index keys:

```typescript
async function cleanupOldIndices() {
  const kvNamespace = (globalThis as any).IMAGE_TRANSFORMATIONS_CACHE;
  
  // List and delete tag indices
  let cursor;
  let complete = false;
  
  while (!complete) {
    const result = await kvNamespace.list({
      prefix: 'transform:tag:',
      cursor
    });
    
    for (const key of result.keys) {
      await kvNamespace.delete(key.name);
    }
    
    cursor = result.cursor || result.cursor_token;
    complete = result.list_complete || !cursor;
  }
  
  // List and delete path indices
  cursor = undefined;
  complete = false;
  
  while (!complete) {
    const result = await kvNamespace.list({
      prefix: 'transform:path:',
      cursor
    });
    
    for (const key of result.keys) {
      await kvNamespace.delete(key.name);
    }
    
    cursor = result.cursor || result.cursor_token;
    complete = result.list_complete || !cursor;
  }
}
```

## Verification

To verify that the migration was successful:

1. Check cache hit rates before and after the migration
2. Verify that purging by tag and path still works correctly
3. Monitor KV operation counts and ensure they decrease with the simplified implementation
4. Use debug headers to verify cache keys are in the expected format

## Rollback Plan

If issues are encountered, you can roll back to the original implementation by setting:

```jsonc
"TRANSFORM_CACHE_USE_SIMPLE_IMPLEMENTATION": "false"
```

The system will switch back to the indexed implementation, which will continue to work with existing cache entries.

## Performance Considerations

The simplified implementation performs more efficiently for:

- Cache puts (fewer KV operations)
- Cache gets (simpler key lookup)
- Small purge operations (using list+filter directly)

For very large deployments (hundreds of thousands of entries), the original implementation might perform better for tag-based purges due to its index structure. Consider your usage patterns when deciding which implementation to use.

## Long-term Maintenance

Both implementations follow the same interface (`KVTransformCacheInterface`), so the code is prepared to support either approach indefinitely. This allows you to choose the implementation that best fits your needs.

The factory pattern (`createKVTransformCacheManager`) ensures that your choice can be made via configuration without code changes.