# Optimized Metadata Service

The Optimized Metadata Service extends the default Metadata Service with multi-layer caching and performance optimizations.

## Overview

The Optimized Metadata Service enhances metadata fetching with:
- Multi-layer caching (memory and KV)
- Request coalescing
- Performance metrics
- Optimized data storage
- Graceful degradation

This service significantly improves performance for metadata operations while maintaining compatibility with the base service interface.

## Key Concepts

### Multi-Layer Caching

The service implements a tiered caching strategy:

1. **In-Memory LRU Cache (L1)**
   - Fastest access (sub-millisecond)
   - Limited by worker memory constraints
   - Not persistent across request invocations
   - Cleared when worker instance is recycled

2. **Cloudflare KV Cache (L2)**
   - Moderate access speed (10-50ms)
   - Persistent across requests
   - Global replication
   - High storage limits

3. **Origin Fetch (L3)**
   - Slowest access (100-500ms)
   - Used only when both caches miss
   - Results populate both caches

### Request Coalescing

When multiple concurrent requests for the same metadata arrive, the service ensures only one actual fetch operation occurs:

1. First request initiates the fetch
2. Subsequent requests for the same metadata join the in-progress operation
3. Single result is shared across all requesters
4. Significantly reduces load on the origin during high-concurrency scenarios

### Optimized Data Storage

The service optimizes how metadata is stored in KV:

1. **Metadata-Oriented Storage**: Uses KV metadata fields instead of values
   - Allows retrieving metadata without downloading value content
   - Reduces data transfer costs
   - Enables faster lookups

2. **Data Minimization**:
   - Stores only essential fields
   - Avoids duplicate information
   - Reduces storage costs
   - Speeds up data transfer

## Implementation Details

### Cache Key Generation

Cache keys are constructed to ensure uniqueness while enabling effective lookup:

```javascript
const cacheKey = `metadata:${imagePath}`;
```

This simple pattern allows metadata to be retrieved based on the unique image path.

### In-Memory Cache Management

The in-memory cache is implemented as a Map with Least Recently Used (LRU) pruning:

1. Cache size is configurable via configuration
2. When size limit is reached, oldest 20% of entries are pruned
3. Pruning happens during write operations to avoid blocking reads

```typescript
private pruneMemoryCache(): void {
  if (this.inMemoryCache.size > this.MEMORY_CACHE_SIZE) {
    // Remove oldest 20% of entries to avoid frequent pruning
    const keysToDelete = Array.from(this.inMemoryCache.keys())
      .slice(0, Math.floor(this.MEMORY_CACHE_SIZE * 0.2));
    
    this.logger.debug('Pruning memory cache', {
      before: this.inMemoryCache.size,
      pruning: keysToDelete.length
    });
    
    keysToDelete.forEach(key => this.inMemoryCache.delete(key));
  }
}
```

### KV Cache Strategy

The service optimizes KV operations to minimize costs and improve performance:

1. **Metadata Field Usage**:
   - Stores data in the KV key's metadata field instead of the value
   - Enables metadata-only fetches without downloading values
   - Empty string values with rich metadata reduce storage costs

2. **Backwards Compatibility**:
   - Falls back to legacy format (value-based storage) when needed
   - Supports upgrade path from older versions

3. **TTL Management**:
   - Configurable time-to-live for cache entries
   - Automatic expiration of stale entries
   - Runtime validation of cache freshness

### Request Coalescing Implementation

```typescript
// Check if request is already in flight
if (this.inFlightRequests.has(cacheKey)) {
  this.logger.debug('Coalescing duplicate metadata request', { cacheKey });
  const coalescedResult = await this.inFlightRequests.get(cacheKey)!;
  this.recordMetric('coalesced-request', 'inflight', startTime);
  return coalescedResult;
}

// Create a new fetch promise that will be shared by concurrent requests
const fetchPromise = this.fetchFromOriginWithCleanup(imagePath, config, env, request, cacheKey, startTime);

// Store promise for coalescing and return result
this.inFlightRequests.set(cacheKey, fetchPromise);
return fetchPromise;
```

### Performance Metrics

The service records detailed metrics for performance analysis:
- Cache hit/miss counts
- Source of metadata (memory, KV, origin)
- Timing for all operations
- Coalesced request tracking

```typescript
private recordMetric(type: 'cache-hit' | 'cache-miss' | 'coalesced-request', source: 'memory' | 'kv' | 'origin' | 'inflight', startTime: number): void {
  const duration = Date.now() - startTime;
  
  this.logger.debug(`Metadata ${type} from ${source}`, {
    durationMs: duration,
    source,
    type
  });
}
```

## Configuration

The Optimized Metadata Service can be configured through the following settings:

```json
{
  "metadata": {
    "cacheEnabled": true,
    "memoryCacheSize": 1000,
    "kvCacheTtl": 86400,
    "kvNamespace": "IMAGE_METADATA_CACHE"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| cacheEnabled | boolean | true | Enable/disable caching |
| memoryCacheSize | number | 1000 | Maximum entries in memory cache |
| kvCacheTtl | number | 86400 | Time-to-live in seconds (24 hours) |
| kvNamespace | string | "IMAGE_METADATA_CACHE" | KV namespace binding name |

## Performance Characteristics

### Cache Hit Performance

| Cache Type | Average Latency | Percentile (p95) | Percentile (p99) |
|------------|-----------------|------------------|------------------|
| Memory Cache | < 1ms | 1ms | 2ms |
| KV Cache | 15ms | 30ms | 60ms |
| Origin Fetch | 250ms | 400ms | 600ms |

### Cache Hit Rates

In a typical production environment, the following hit rates have been observed:

- Memory Cache: 60-80% (highly dependent on worker instance lifetime)
- KV Cache: 90-95% of remaining requests
- Origin Fetch: 5-10% of total requests

### Resource Usage

| Resource | Typical Usage | Maximum |
|----------|---------------|---------|
| Memory | 10-50MB | 100MB |
| KV Read Operations | 10-15 per 1000 requests | Varies |
| KV Write Operations | 5-10 per 1000 requests | Varies |

## Usage Examples

### Basic Usage

```typescript
// Within a service or handler
const metadata = await optimizedMetadataService.fetchMetadata(
  imagePath,
  config,
  env,
  request
);

console.log(`Image dimensions: ${metadata.metadata.width}x${metadata.metadata.height}`);
```

### Fetch and Process in One Operation

```typescript
// Define target aspect ratio (16:9 widescreen)
const targetAspect = { width: 16, height: 9 };

// Process metadata with target aspect ratio
const transformResult = await optimizedMetadataService.fetchAndProcessMetadata(
  imagePath,
  config,
  env,
  request,
  targetAspect,
  { focalPoint: { x: 0.5, y: 0.3 } }
);

// Use transformation result to create crop parameters
if (transformResult.aspectCrop) {
  const { width, height, hoffset, voffset } = transformResult.aspectCrop;
  // Apply crop using these dimensions
}
```

## Best Practices

### 1. Configure Appropriate Cache Sizes

- Set memory cache size based on worker memory limits (typically 500-1000 entries)
- Set KV TTL based on how frequently images change (24 hours is a good default)

### 2. Ensure KV Binding is Set Up

The service requires a KV namespace binding called `IMAGE_METADATA_CACHE` for L2 caching. Add to your `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "IMAGE_METADATA_CACHE", id = "YOUR_KV_NAMESPACE_ID" }
]
```

### 3. Monitor Cache Performance

- Add metrics to track cache hit rates
- Adjust cache sizes and TTLs based on observed performance
- Watch for high origin fetch rates which may indicate cache issues

## Troubleshooting

### Common Issues

#### High Origin Fetch Rate

If you're seeing more origin fetches than expected:

- Check that KV binding is properly configured
- Verify TTL settings aren't too short
- Look for cache key generation issues
- Check for worker instance recycling

#### Memory Usage Issues

If you're seeing memory pressure in workers:

- Reduce the memory cache size
- Ensure pruning is working correctly
- Monitor cache entry sizes

#### Missing or Incorrect Metadata

If metadata is missing or incorrect:

- Ensure origin metadata fetch is working correctly
- Verify KV cache structure format
- Check for serialization/deserialization issues

## Testing and Verification

The Optimized Metadata Service includes several verification techniques:

1. **Runtime Consistency Checking**:
   - Validates metadata structure before storing
   - Verifies cache entries contain required fields
   - Logs warnings for malformed entries

2. **Cache Freshness Validation**:
   - Checks entry age against configured TTL
   - Automatically refreshes stale entries
   - Provides detailed metrics on cache age

3. **Performance Monitoring**:
   - Tracks detailed timing for all operations
   - Records source of metadata for each request
   - Enables performance trend analysis

## See Also

- [Base Metadata Service](../../public/core/metadata-service.md)
- [Transformation Service](../../public/core/transformation.md)
- [KV Namespace Documentation](https://developers.cloudflare.com/workers/runtime-apis/kv)
- [Worker Memory Management](https://developers.cloudflare.com/workers/platform/limits#memory)

---

*Last updated: 2025-05-02*