# Modular Cache Architecture

## Overview

The caching system has been refactored into a modular architecture to improve maintainability, extensibility, and testability. This document outlines the modular components, their responsibilities, and how they interact.

## Architecture

The cache system now consists of the following modular components:

1. **CacheService (Main Service)** - Orchestrates the caching operations and delegates to specialized modules.
2. **CacheTagsManager** - Handles generation and management of cache tags for granular cache purging.
3. **CacheHeadersManager** - Manages Cache-Control headers and related caching directives.
4. **CacheBypassManager** - Determines when caching should be bypassed.
5. **CacheFallbackManager** - Implements fallback strategies when primary caching fails.
6. **CloudflareCacheManager** - Manages Cloudflare-specific cache settings.
7. **TTLCalculator** - Calculates appropriate TTL (Time To Live) values.
8. **CacheResilienceManager** - Implements circuit breaking and retry patterns.

## Key Benefits

- **Separation of Concerns**: Each module has a specific, focused responsibility.
- **Easier Maintenance**: Changes to one aspect of caching won't affect other aspects.
- **Improved Testability**: Smaller modules are easier to test in isolation.
- **Better Extension Points**: New cache features can be added without modifying existing code.

## Component Interactions

The main `CacheService` uses a delegation pattern to forward calls to specialized modules:

```
┌───────────────────┐
│   CacheService    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────────────────┐
│                                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐  
│  │ CacheHeaders  │  │ CacheTags     │  │ CacheBypass    │  
│  │ Manager       │  │ Manager       │  │ Manager        │  
│  └───────────────┘  └───────────────┘  └────────────────┘  
│                                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐  
│  │ CacheFallback │  │ Cloudflare    │  │ TTL            │
│  │ Manager       │  │ CacheManager  │  │ Calculator     │
│  └───────────────┘  └───────────────┘  └────────────────┘  
│                                                   │
│  ┌───────────────┐                                │
│  │ Resilience    │                                │
│  │ Manager       │                                │
│  └───────────────┘                                │
│                                                   │
└───────────────────────────────────────────────────┘
```

## Cache Tag Handling

Cache tags are now handled consistently for both Cloudflare's managed caching and the Cache API:

- For Cloudflare's managed caching (`cf` method): Tags are applied to the request's CF object
- For Cache API (`cache-api` method): Tags are applied as `Cache-Tag` header on the response

This approach follows Cloudflare's official documentation for cache tags with each method.

## Error Handling

The architecture implements a robust error handling strategy:

1. Each module has specialized error types
2. The main service wraps module-specific errors 
3. Circuit breaking prevents cascading failures
4. Fallback strategies maintain performance during failures

## Testing

Each module has dedicated unit tests that verify its behavior in isolation. The tests cover:

- Happy path scenarios (normal operation)
- Error cases and handling
- Edge cases and boundary conditions

## Future Extensions

The modular architecture facilitates several planned enhancements:

1. **Multiple Cache Backends**: Adding support for additional cache providers
2. **Advanced Cache Policies**: Implementing different caching policies for different content types
3. **Cache Analytics**: Adding detailed cache metrics and analytics
4. **Cache Warming**: Implementing proactive cache warming for frequently accessed resources