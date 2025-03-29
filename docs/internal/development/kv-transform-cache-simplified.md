# Simplified KV Transform Cache Architecture

## Overview

This document outlines a simplified approach to KV transform caching that optimizes namespace usage while maintaining full functionality. The approach leverages Cloudflare KV's metadata capabilities to eliminate the need for complex indexing structures.

## Core Concept

The simplified approach is based on two key insights:

1. Cloudflare KV's `list` operation returns metadata along with keys, enabling filtering based on metadata values
2. All information needed for cache operations can be stored directly in the metadata of transform keys

By leveraging these capabilities, we can eliminate separate index keys, resulting in a more efficient use of the KV namespace and simpler implementation.

## Current vs. Simplified Approach

### Current Approach (Hybrid with Indices)

The current implementation uses a hybrid approach with:

- Main data keys for transformed images
- Tag indices to track which keys have which tags
- Path indices to track which keys belong to which paths
- Master lists of all tags and paths
- Different approaches for small vs. large purges

This creates multiple keys per cached transformation, consuming namespace capacity and requiring synchronization between data and indices.

Example keys for a single transformed image:
```
transform:7e05127e (main data)
transform:tag:img-prod-file-Granna_1.JPG
transform:path:/Granna_1.JPG
transform:all-tags
transform:all-paths
transform:stats
```

### Simplified Approach (Metadata-Based)

The simplified approach:

- Stores only the main transformed image keys with comprehensive metadata
- Uses human-readable key names for easier debugging
- Leverages KV list + metadata filtering for all operations that need to find keys by tag or path
- Eliminates all index keys

Example key for a single transformed image:
```
transform:Granna_1.JPG:16-9:webp:7e05127e (main data with descriptive name)
```

## Key Structure

### Naming Convention

Keys should follow a human-readable format that includes critical information about the transformation:

```
transform:[basename]:[main-params]:[format]:[hash]
```

Where:
- `transform:` - Consistent prefix for all transform keys
- `[basename]` - The filename without path (e.g., `Granna_1.JPG`)
- `[main-params]` - Key transformation parameters (e.g., `16-9` for aspect ratio, `w800` for width)
- `[format]` - Output format (e.g., `webp`, `avif`)
- `[hash]` - Short hash suffix (8 chars) for uniqueness if needed

Examples:
```
transform:chair.jpg:w800:webp:7e05127e
transform:profile.png:w400-h400:avif:b583e92f
transform:banner.jpg:16-9:webp:a12b34cd
```

### Metadata Structure

Comprehensive metadata provides all the information needed for operations:

```typescript
{
  url: string;                 // Full URL with query parameters
  timestamp: number;           // When the item was cached
  contentType: string;         // Content type of the cached image
  size: number;                // Size in bytes
  transformOptions: Object;    // Complete transform options
  tags: string[];              // Cache tags
  ttl: number;                 // TTL in seconds
  expiration: number;          // Expiration timestamp
  storageType?: string;        // The storage type used
  originalSize?: number;       // Original image size before transformation
  compressionRatio?: number;   // Compression ratio achieved
}
```

## Implementation Details

### Key Generation

Generate a consistent key from the image name and transformation parameters:

```typescript
function generateKey(url: string, transformOptions: TransformOptions): string {
  const urlObj = new URL(url);
  const basename = urlObj.pathname.split('/').pop() || 'image';
  
  // Extract key parameters
  const mainParams = [];
  if (transformOptions.width) mainParams.push(`w${transformOptions.width}`);
  if (transformOptions.height) mainParams.push(`h${transformOptions.height}`);
  if (transformOptions.aspect) mainParams.push(transformOptions.aspect.replace(':', '-'));
  
  // Determine output format
  const format = transformOptions.format || 'auto';
  
  // Create a short hash for uniqueness
  const hash = createShortHash(url + JSON.stringify(transformOptions));
  
  return `transform:${basename}:${mainParams.join('-')}:${format}:${hash}`;
}

function createShortHash(input: string): string {
  // Implementation of a simple hash function that returns 8 char string
  // Could use first 8 chars of SHA-1, MD5, or a simpler algorithm
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}
```

### Get Operation

Direct key lookup with fallback:

```typescript
async function get(request: Request, transformOptions: TransformOptions): Promise<CachedImage | null> {
  const key = generateKey(request.url, transformOptions);
  
  try {
    // Direct key lookup
    const result = await kv.getWithMetadata(key, { type: 'arrayBuffer' });
    if (result.value) {
      return {
        data: result.value,
        metadata: result.metadata
      };
    }
    return null;
  } catch (error) {
    logger.error('Error retrieving from cache', { error, url: request.url });
    return null;
  }
}
```

### Put Operation

Direct key storage:

```typescript
async function put(
  request: Request, 
  response: Response, 
  transformOptions: TransformOptions,
  ctx?: ExecutionContext
): Promise<void> {
  const key = generateKey(request.url, transformOptions);
  const buffer = await response.arrayBuffer();
  
  // Skip if too large
  if (buffer.byteLength > config.maxSize) {
    logger.warn('Image too large for KV cache', { size: buffer.byteLength, maxSize: config.maxSize });
    return;
  }
  
  const metadata = {
    url: request.url,
    timestamp: Date.now(),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    size: buffer.byteLength,
    transformOptions,
    tags: generateTags(request, transformOptions),
    ttl: calculateTtl(response),
    expiration: Date.now() + (calculateTtl(response) * 1000),
    // Additional fields as needed
  };
  
  const storeOperation = async () => {
    try {
      await kv.put(key, buffer, {
        expirationTtl: metadata.ttl,
        metadata
      });
      
      // Update stats if needed
      await updateStats('put', buffer.byteLength);
      
      logger.debug('Image cached successfully', { key, size: buffer.byteLength });
    } catch (error) {
      logger.error('Error storing in cache', { error, url: request.url });
    }
  };
  
  // Run in background if context is available
  if (ctx) {
    ctx.waitUntil(storeOperation());
  } else {
    await storeOperation();
  }
}
```

### Purge by Tag

Use list + filter approach:

```typescript
async function purgeByTag(
  tag: string, 
  ctx?: ExecutionContext
): Promise<number> {
  // Function to filter keys by tag
  const filterByTag = (metadata: any) => 
    metadata?.tags?.includes(tag);
  
  // Get matching keys
  const keysToDelete = await listKeysWithFilter(filterByTag);
  
  // Process deletions
  return await purgeKeys(keysToDelete, ctx);
}

async function listKeysWithFilter(
  filterFn: (metadata: any) => boolean, 
  limit = 1000
): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  let complete = false;
  
  // Paginate through all keys
  while (!complete && keys.length < limit) {
    const result = await kv.list({ prefix: 'transform:', cursor, limit: 1000 });
    
    // Filter keys based on metadata
    const filteredKeys = result.keys
      .filter(key => filterFn(key.metadata))
      .map(key => key.name);
    
    keys.push(...filteredKeys);
    cursor = result.cursor;
    complete = result.list_complete;
  }
  
  return keys.slice(0, limit);
}
```

### Purge by Path

Use list + filter with path matching:

```typescript
async function purgeByPath(
  pathPattern: string, 
  ctx?: ExecutionContext
): Promise<number> {
  // Normalize path pattern and create regex
  const normalizedPattern = pathPattern.startsWith('/') 
    ? pathPattern 
    : `/${pathPattern}`;
    
  const regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
    
  const regex = new RegExp(`^${regexPattern}`);
  
  // Function to filter keys by path pattern
  const filterByPath = (metadata: any) => {
    if (!metadata?.url) return false;
    
    try {
      const urlObj = new URL(metadata.url);
      return regex.test(urlObj.pathname) || 
             regex.test(urlObj.pathname + urlObj.search);
    } catch (e) {
      return false;
    }
  };
  
  // Get matching keys
  const keysToDelete = await listKeysWithFilter(filterByPath);
  
  // Process deletions
  return await purgeKeys(keysToDelete, ctx);
}
```

### Batch Purge Implementation

Process purging in batches efficiently:

```typescript
async function purgeKeys(
  keys: string[], 
  ctx?: ExecutionContext
): Promise<number> {
  if (keys.length === 0) return 0;
  
  // Use batched deletion for better performance
  const batchSize = 10;
  const batches: string[][] = [];
  
  for (let i = 0; i < keys.length; i += batchSize) {
    batches.push(keys.slice(i, i + batchSize));
  }
  
  // Process batches sequentially
  const processBatches = async () => {
    let deletedCount = 0;
    
    for (const [index, batch] of batches.entries()) {
      // Add delay between batches
      if (index > 0 && config.purgeDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, config.purgeDelay));
      }
      
      // Process batch in parallel
      await Promise.all(batch.map(async (key) => {
        try {
          await kv.delete(key);
          deletedCount++;
        } catch (error) {
          logger.warn(`Error deleting key ${key}`, { error });
        }
      }));
    }
    
    return deletedCount;
  };
  
  // Run in background or synchronously
  if (ctx) {
    ctx.waitUntil(processBatches().catch(error => {
      logger.error('Error in background purge', { error });
    }));
    
    return keys.length;
  } else {
    return await processBatches();
  }
}
```

## Performance Considerations

### Advantages

1. **Simplified Implementation**: Fewer moving parts, less complexity
2. **Reduced KV Key Usage**: Only one key per transformed image
3. **No Index Synchronization**: No need to keep indices and data in sync
4. **Improved Debuggability**: Human-readable keys make debugging easier

### Limitations

1. **List Operation Costs**: KV list operations are more expensive than direct key operations
2. **Scaling with Size**: Performance degrades as the total number of keys grows
3. **Pagination Overhead**: Each page of results requires a separate KV operation

### Optimizations

1. **Caching List Results**: For very frequent purge operations, consider caching list results briefly
2. **Batch Size Tuning**: Adjust batch sizes based on key count and purge frequency
3. **Background Processing**: Always use `waitUntil` for purge operations
4. **Scheduled Maintenance**: Run larger cleanup operations during off-peak hours

## KV Namespace Considerations

### Key Usage

For a typical implementation:

- **Standard Approach**: ~5-10 keys per transformed image (data + indices)
- **Simplified Approach**: 1 key per transformed image

This difference becomes significant at scale:

| # of Transformations | Keys (Standard) | Keys (Simplified) |
|----------------------|-----------------|-------------------|
| 1,000                | ~5,000-10,000   | 1,000             |
| 10,000               | ~50,000-100,000 | 10,000            |
| 100,000              | ~500,000-1M     | 100,000           |

Cloudflare KV has a limit of 1 billion keys per namespace, so both approaches scale well, but the simplified approach is much more efficient.

### Performance Thresholds

Based on KV performance characteristics, here are recommended thresholds:

- **Small Caches** (< 10,000 transformations): Simplified approach is ideal
- **Medium Caches** (10,000-100,000 transformations): Simplified approach works well
- **Large Caches** (> 100,000 transformations): Consider hybrid approach or segregating into multiple namespaces

## Migration Considerations

Migrating from the current approach to the simplified approach:

1. **Parallel Operation**: Both systems can operate in parallel during migration
2. **Progressive Migration**: Migrate one section of the cache at a time
3. **Key Translation**: Create a function to translate between old and new key formats
4. **Index Cleanup**: Remove index keys after verification

## Recommendations

1. **For New Implementations**: Start with the simplified approach
2. **For Existing Implementations**:
   - Under 50,000 keys: Consider migration to simplified approach
   - Over 50,000 keys: Evaluate performance impact before migrating

3. **Configuration Parameters**:
   - `purgeDelay`: Time between batch operations (default: 100ms)
   - `batchSize`: Number of keys per batch (default: 10)
   - `maxListResults`: Maximum keys to process in list operations (default: 1000)

## Conclusion

The simplified KV transform cache approach offers a more efficient and maintainable solution for most use cases. By leveraging KV's metadata capabilities and list filtering, we can eliminate complex indexing structures while maintaining all functionality.

This approach is particularly beneficial for small to medium-sized caches where the performance overhead of list operations is negligible compared to the benefits of reduced complexity and namespace usage.

For large-scale deployments, a hybrid approach or namespace segmentation may provide better performance, but the simplified approach should be the default starting point for most implementations.

---

*Last Updated: March 29, 2025*