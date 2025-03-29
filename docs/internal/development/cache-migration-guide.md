# Cache Service Migration Guide

This guide provides instructions for migrating from the original monolithic CacheService to the new modular architecture.

## Overview

The cache system has been refactored from a single monolithic implementation into a modular architecture with separate components for different caching concerns. This improves maintainability, testability, and extensibility.

## Key Changes

1. **Main Service Implementation**: The `DefaultCacheService` still implements the `CacheService` interface, maintaining backward compatibility.

2. **New Module Structure**: Functionality is now divided across specialized modules:
   - `CacheTagsManager`
   - `CacheHeadersManager`
   - `CacheBypassManager`
   - `CacheFallbackManager`
   - `CloudflareCacheManager`
   - `TTLCalculator`
   - `CacheResilienceManager`

3. **Error Handling**: More specific error types and enhanced error handling.

4. **Cache Tags**: Improved cache tag handling for both Cloudflare's managed caching and the Cache API.

## Migration Steps

### For Service Consumers

If you're using the CacheService through dependency injection, no changes are required. The DefaultCacheService still implements the CacheService interface, so all existing method calls will continue to work.

```typescript
// This code will continue to work without changes
constructor(private cacheService: CacheService) {}

async processRequest(request: Request, response: Response, ctx: ExecutionContext) {
  return this.cacheService.cacheWithFallback(request, response, ctx);
}
```

### For Direct CacheService Extensions

If you've directly extended the original CacheService, follow these steps:

1. **Identify Overridden Methods**: Determine which methods you've overridden.

2. **Select Appropriate Module**: Choose the module that now contains the functionality:
   - Cache tag related: `CacheTagsManager`
   - Cache headers related: `CacheHeadersManager`
   - Cache bypass logic: `CacheBypassManager`
   - Resilience patterns: `CacheResilienceManager`

3. **Override Module Instead**: Extend the appropriate module instead of the main service.

4. **Update Service Factory**: Update your service factory to use your custom module.

### Example: Customizing Cache Tags

**Original approach (before):**

```typescript
class CustomCacheService extends DefaultCacheService {
  generateCacheTags(request: Request, storageResult: StorageResult, options: TransformOptions): string[] {
    // Custom cache tag logic here
    const tags = super.generateCacheTags(request, storageResult, options);
    tags.push('custom-tag');
    return tags;
  }
}
```

**New approach (after):**

```typescript
// 1. Create a custom CacheTagsManager
class CustomCacheTagsManager extends CacheTagsManager {
  generateCacheTags(request: Request, storageResult: StorageResult, options: TransformOptions): string[] {
    // Custom cache tag logic here
    const tags = super.generateCacheTags(request, storageResult, options);
    tags.push('custom-tag');
    return tags;
  }
}

// 2. Create a custom service factory
class CustomCacheServiceFactory {
  createCacheService(logger: Logger, configService: ConfigurationService): CacheService {
    // Create the core service
    const service = new DefaultCacheService(logger, configService);
    
    // Replace the CacheTagsManager with your custom implementation
    service['tagsManager'] = new CustomCacheTagsManager(logger, configService);
    
    return service;
  }
}
```

## Configuration Changes

The configuration structure remains backward compatible. Any existing configuration will continue to work with the new modular implementation.

New configuration options:

```typescript
// New cache options
cache: {
  // ... existing options remain the same

  // Enhanced stale-while-revalidate
  enableStaleWhileRevalidate: true,
  staleWhileRevalidatePercentage: 50,

  // Background caching for performance
  enableBackgroundCaching: true,

  // TTL limits
  minTtl: 60,  // Minimum TTL in seconds
  maxTtl: 2592000, // Maximum TTL in seconds

  // Resilience patterns
  retry: {
    maxAttempts: 3,
    initialDelayMs: 200, 
    maxDelayMs: 2000
  },
  
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2
  }
}
```

## Testing Your Migration

1. **Check Cache Headers**: Verify that Cache-Control headers are still applied correctly.
2. **Verify Cache Tags**: If using cache tags, verify they're correctly applied based on your cache method.
3. **Test Cache Bypassing**: Ensure cache bypass parameters and conditions still work.
4. **Test Error Handling**: Verify that cache errors are handled gracefully.

## Additional Resources

- [Modular Cache Architecture](./modular-cache-architecture.md) - Detailed description of the new architecture
- [Cache Service Tests](../../test/services/cache) - Examples of using the different modules