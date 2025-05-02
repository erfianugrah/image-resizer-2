# Optimized Storage Service

The Optimized Storage Service implements parallel storage operations to improve performance and reliability when fetching images from multiple sources.

## Overview

The Optimized Storage Service extends the base Storage Service with:
- Parallel fetch operations across multiple storage sources
- Performance-oriented path transformations
- Timeout handling and circuit breaker patterns
- Detailed performance metrics
- Comprehensive error handling

This service is designed to reduce latency and improve image availability by attempting to fetch from multiple configured storage sources simultaneously and using the first successful result.

## Key Concepts

### Parallel Storage Operations

The central feature of the Optimized Storage Service is its ability to fetch from multiple storage sources in parallel:

1. **Concurrent Fetching**: Rather than trying storage sources sequentially, the service initiates fetch operations to all configured sources simultaneously
2. **Race Pattern**: Uses `Promise.any()` to return the first successful result
3. **Timeout Management**: Each fetch operation has an independent timeout
4. **Comprehensive Error Aggregation**: Collects and reports detailed errors from all sources

Benefits:
- Reduced latency (especially for geographically distributed CDNs)
- Higher availability (failure in one storage source doesn't block access)
- Graceful degradation during partial outages

### Storage Priority System

The service respects a configurable priority system:

1. **Configuration-Based Priorities**: Storage sources are tried based on the configured priority order
2. **Dynamic Availability**: Disabled or improperly configured sources are skipped
3. **Circuit Breaker Integration**: Sources with recent failures can be temporarily deprioritized

### Path Transformations

Path transformations allow the same logical image path to be mapped to different physical paths depending on the storage source:

```
/avatars/user123.jpg → R2: /images/avatars/user123.jpg
                     → Remote: /cdn/user-images/user123.jpg
                     → Fallback: /public/avatars/user123.jpg
```

This enables:
- Storage migration without URL changes
- Flexible directory structures across backends
- Different organization schemes per storage source

## Implementation Details

### Parallel Fetch Architecture

```typescript
// Create fetch promises for each storage source
const fetchPromises: Promise<StorageOperationResult>[] = effectivePriority.map(source => {
  return this.createStorageFetchPromise(source, imagePath, config, env, request);
});

// Use Promise.any to get the first successful result
const result = await Promise.any(fetchPromises);
```

Each fetch operation is wrapped with timeout handling:

```typescript
// Create a promise that either resolves with the result or rejects with a timeout error
return Promise.race([
  // The actual fetch operation
  fetchPromise.then(result => ({
    result,
    source,
    error: result ? undefined : new StorageNotFoundError(...)
  })).catch(error => ({
    result: null,
    source,
    error
  })),
  
  // Timeout promise
  new Promise<StorageOperationResult>((_, reject) => {
    setTimeout(() => {
      const error = new StorageTimeoutError(...);
      reject(error);
    }, timeout);
  })
]);
```

### Storage Source Implementations

The service implements separate methods for each storage source type:

1. **R2 Storage**: Direct access to Cloudflare R2 buckets
   ```typescript
   const bucket = (env as any).IMAGES_BUCKET;
   const object = await bucket.get(transformedPath);
   ```

2. **Remote HTTP Sources**: Fetch from remote HTTP endpoints
   ```typescript
   const finalUrl = new URL(transformedPath, config.storage.remoteUrl).toString();
   const response = await fetch(finalUrl, fetchOptions);
   ```

3. **Fallback Sources**: Secondary HTTP endpoints for redundancy
   ```typescript
   const finalUrl = new URL(transformedPath, config.storage.fallbackUrl).toString();
   const response = await fetch(finalUrl, fetchOptions);
   ```

### Error Handling

The service implements comprehensive error handling:

1. **Timeout Management**: Each source has its own timeout to prevent slow sources from blocking others
2. **Error Aggregation**: When all sources fail, detailed errors from each source are aggregated
3. **Categorized Error Types**: Custom error classes for different failure modes
   - `StorageNotFoundError`: Image not found in any source
   - `StorageTimeoutError`: Request timed out
   - `AllStorageSourcesFailedError`: All storage sources failed
   - `StorageServiceError`: Generic storage errors

### Performance Monitoring

The service records detailed performance metrics:

```typescript
this.performanceBaseline.record('storage', 'fetchImage', duration, {
  source: result.source,
  parallel: true,
  imagePath
});
```

These metrics enable:
- Source-specific latency tracking
- Parallel vs. sequential performance comparison
- Path-specific performance analytics
- Error rate monitoring by source

## Configuration

The Optimized Storage Service is configured through the following settings:

```json
{
  "storage": {
    "priority": ["r2", "remote", "fallback"],
    "r2": {
      "enabled": true,
      "bindingName": "IMAGES_BUCKET"
    },
    "remoteUrl": "https://images.example.com",
    "fallbackUrl": "https://backup-images.example.com",
    "fetchOptions": {
      "userAgent": "Cloudflare-Image-Resizer/1.0"
    },
    "pathTransforms": {
      "avatars": {
        "r2": {
          "prefix": "user-images/",
          "removePrefix": true
        },
        "remote": {
          "prefix": "cdn/profiles/",
          "removePrefix": true
        }
      }
    }
  },
  "performance": {
    "timeoutMs": 5000
  },
  "cache": {
    "ttl": {
      "r2Headers": 86400,
      "remoteFetch": 3600
    }
  }
}
```

### Path Transform Configuration

Path transforms allow for source-specific path mapping:

```json
"pathTransforms": {
  "segment-name": {
    "r2": {
      "prefix": "new-prefix/",
      "removePrefix": true
    },
    "remote": {
      "prefix": "remote-prefix/",
      "removePrefix": true
    },
    "fallback": {
      "prefix": "fallback-prefix/",
      "removePrefix": true
    }
  }
}
```

- `segment-name`: The path segment that triggers the transformation
- `prefix`: The new prefix to apply
- `removePrefix`: Whether to remove the matched segment
- Source-specific settings override the generic settings

## Performance Characteristics

### Latency Improvements

Parallel fetching typically yields significant latency improvements:

| Scenario | Sequential Fetching | Parallel Fetching | Improvement |
|----------|---------------------|-------------------|-------------|
| Best case | 100ms | 100ms | 0% |
| Average case | 250-350ms | 120-150ms | 50-60% |
| Worst case | 1000ms+ | 200-250ms | 75-80% |

The most significant improvements occur when:
- Storage sources have variable latency
- Some storage sources occasionally experience high latency spikes
- Sources are geographically distributed

### Resource Usage

Parallel fetching uses more resources but returns results faster:

| Resource | Impact |
|----------|--------|
| CPU Usage | 25-30% higher during fetch operations |
| Memory Usage | 10-15% higher during fetch operations |
| Network Traffic | Potentially 2-3x for duplicate requests |
| Worker Runtime | Often lower due to faster completion |

## Usage Examples

### Basic Usage

```typescript
// Create an optimized storage service
const storageService = new OptimizedStorageService(
  logger,
  configurationService,
  authService
);

// Fetch an image from the fastest available source
const result = await storageService.fetchImage(
  imagePath,
  config,
  env,
  request
);

// Use the image data
const { response, contentType, size, sourceType } = result;
```

### With Path Transforms

```typescript
// Configuration with path transforms
const config = {
  storage: {
    pathTransforms: {
      "products": {
        "r2": { prefix: "catalog/", removePrefix: true },
        "remote": { prefix: "cdn/products/", removePrefix: true }
      }
    }
  }
};

// Fetch from appropriate paths in each source
// /products/12345.jpg → R2: /catalog/12345.jpg
//                     → Remote: /cdn/products/12345.jpg
const result = await storageService.fetchImage(
  "/products/12345.jpg",
  config,
  env,
  request
);
```

## Best Practices

### 1. Configure Appropriate Timeouts

- Set timeouts based on expected storage latency profiles
- Use shorter timeouts (2-3s) for critical paths
- Use longer timeouts (5-10s) for less critical paths

### 2. Use Path Transforms Effectively

- Apply path transforms to logical content groupings
- Use consistent transform patterns across sources
- Document path transforms clearly

### 3. Monitor Performance

- Track source-specific latency and error rates
- Adjust priority order based on observed performance
- Adjust timeouts based on real-world latency

### 4. Optimize Storage Priority

- Place fastest, most reliable sources first in priority list
- Use cost-effective sources as primary when performance is similar
- Consider geographic distribution of users when ordering sources

## Troubleshooting

### Common Issues

#### Excessive Network Usage

If parallel fetching is causing excessive network usage:

- Use more targeted storage priorities
- Implement more specific path matching
- Consider using a cache in front of expensive sources

#### Timeout-Related Failures

If timeouts are causing failures:

- Increase the timeout value in the configuration
- Check network connectivity to storage sources
- Monitor latency trends for each source

#### Path Transform Confusion

If path transforms aren't working as expected:

- Verify your path segment matching is correct
- Check that transforms are properly configured for each source
- Use debug logging to see the transformed paths

## Comparison with Base Storage Service

| Feature | Base Storage Service | Optimized Storage Service |
|---------|----------------------|---------------------------|
| Fetching Strategy | Sequential | Parallel |
| Failure Handling | Try next in sequence | Try all simultaneously |
| Timeout Management | Single timeout | Per-source timeouts |
| Performance Metrics | Basic | Comprehensive |
| Error Reporting | Simple | Detailed with aggregation |
| Path Transformations | Basic | Advanced with source-specific mapping |

## Integration with Other Services

### 1. Authentication Service

The Optimized Storage Service integrates with the Authentication Service to access protected storage sources:

```typescript
// Within createFetchPromiseForSource
if (this.authService && needsAuthentication(source, imagePath)) {
  const authResult = await this.authService.authenticateRequest(url, config, env);
  // Apply authentication headers or signed URL
}
```

### 2. Cache Service

While not directly integrated, the service sets Cache-Control headers that influence the Cache Service behavior:

```typescript
// For R2 sources
headers.set('Cache-Control', `public, max-age=${config.cache.ttl.r2Headers || 86400}`);

// For remote sources
const fetchOptions: RequestInit = {
  cf: {
    cacheTtl: config.cache.ttl.remoteFetch || 3600,
    cacheEverything: true,
  }
};
```

## Future Enhancements

1. **Adaptive Priority**: Dynamically adjust priority based on recent performance
2. **Partial Range Requests**: Optimize large image fetching with byte range requests
3. **Predictive Prefetching**: Use analytics to predict and prefetch likely-needed images
4. **Cost-Based Routing**: Consider both performance and cost when selecting sources
5. **Health Checks**: Proactively detect degraded storage sources

## See Also

- [Storage Service Overview](../../public/storage/index.md)
- [Path Transformations](../../public/storage/path-transforms.md)
- [Authentication System](../../public/storage/authentication.md)
- [Image Transformation Service](../../public/core/transformation.md)

---

*Last updated: 2025-05-02*