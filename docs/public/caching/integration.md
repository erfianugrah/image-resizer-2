# Cache Service Integration

This document explains how the enhanced caching service integrates with the rest of the image resizer architecture.

## Integration Points

The enhanced `CacheService` integrates with the transformation pipeline at several key points:

### 1. Command Pattern Integration

The `TransformImageCommand` class now uses the enhanced features of the `CacheService` at two main points:

1. **After image transformation**:
   ```typescript
   // Apply cache headers with enhanced options
   let finalResponse = cacheService.applyCacheHeaders(
     transformedResponse, 
     this.options,
     storageResult
   );
   ```

2. **For cache storage with resilience patterns**:
   ```typescript
   // Cache with enhanced fallback mechanism
   if (!cacheService.shouldBypassCache(this.request, this.options)) {
     finalResponse = await cacheService.cacheWithFallback(
       this.request,
       finalResponse,
       (this.request as any).ctx,
       this.options,
       storageResult
     );
   }
   ```

### 2. Transformation Service Integration

The `TransformationService` now enhances storage results with metadata for better cache tagging:

```typescript
// Store metadata about the transformation for cache tagging
if (!storageResult.metadata) {
  storageResult.metadata = {};
}

// Add transformation metadata to help with cache tagging
storageResult.metadata.transformOptions = JSON.stringify({
  format: effectiveOptions.format,
  width: effectiveOptions.width,
  height: effectiveOptions.height,
  quality: effectiveOptions.quality,
  fit: effectiveOptions.fit,
  derivative: effectiveOptions.derivative
});
```

### 3. Transform Utilities Integration

The transform utilities now add metadata headers that help with cache optimization:

1. **For subrequests**:
   ```typescript
   // Add metadata about the request being a subrequest, useful for caching decisions
   if (!storageResult.metadata) {
     storageResult.metadata = {};
   }
   storageResult.metadata.isSubrequest = 'true';
   ```

2. **For transformed images**:
   ```typescript
   // Add metadata headers for cache optimization
   const headers = new Headers(response.headers);
   
   // Store image dimensions in headers for cache tagging if available
   if (transformOptions.width) {
     headers.set('X-Image-Width', String(transformOptions.width));
   }
   if (transformOptions.height) {
     headers.set('X-Image-Height', String(transformOptions.height));
   }
   // Additional dimension/format information
   ```

## Features Enabled by Integration

The integration enables several advanced caching features:

### 1. Intelligent TTL Calculation

The cache service now has access to:
- The `TransformOptions` used to transform the image
- The `StorageResult` containing metadata about the original image
- The modified response with format and dimension details

This allows for dynamic TTL calculation based on:
- Content type (SVG, WebP, JPEG, etc.)
- Response status code
- Image dimensions
- Transformation applied (quality, format, etc.)
- Path patterns (e.g., `/news/` vs `/static/`)
- Derivative type (e.g., `thumbnail` vs `banner`)

### 2. Enhanced Cache Tagging

With the additional metadata, the cache service generates more granular cache tags:
- Content type tags (`img-mime-image`, `img-imgfmt-jpeg`)
- Dimension tags (`img-width-800`, `img-aspect-landscape`)
- Transformation tags (`img-format-webp`, `img-quality-80`)
- Path-based tags (`img-path-products`)
- Derivative tags (`img-derivative-thumbnail`)

These tags enable more targeted cache invalidation.

### 3. Advanced Caching Patterns

The integration enables:
- **Stale-While-Revalidate**: Serve stale content while refreshing in the background
- **Background Caching**: Non-blocking cache operations using `waitUntil`
- **Cache Warming**: Preemptively cache related assets
- **Circuit Breaker Pattern**: Prevent cascading failures when cache systems are overloaded
- **Retry Mechanisms**: Handle transient cache failures gracefully

### 4. Resource Hints

The enhanced integration adds resource hints for HTML responses:
- Preconnect hints for CDN domains
- Preload hints for critical resources
- Improved cache metrics for monitoring

## Test Coverage

The integration includes comprehensive test coverage in `cache-strategy.spec.ts` that verifies:
- Intelligent TTL calculation
- Cache bypass mechanisms
- Cache tag generation
- Stale-while-revalidate functionality
- Fallback mechanisms
- Path-based and derivative-based TTL adjustments

## Usage Example

```typescript
// Example of how the integration works in practice

// 1. Command pattern uses the cache service
const transformCommand = new TransformImageCommand(
  request,
  imagePath,
  options,
  services,
  metrics,
  url
);

// 2. Command executes and uses enhanced caching
const response = await transformCommand.execute();
// - Inside execute(), the service fetches the image
// - Transforms it with appropriate options
// - Applies intelligent cache headers
// - Stores in cache with fallback mechanisms
// - Adds resource hints if appropriate

// 3. The response is served with optimal caching
return response;
```

## Implementation Details

See the following files for implementation details:
- `src/domain/commands/transformImageCommand.ts`
- `src/services/cacheService.ts`
- `src/services/transformationService.ts`
- `src/transform.ts`
- `test/cache-strategy.spec.ts`