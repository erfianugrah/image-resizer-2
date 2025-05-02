# Cache System: Image-Resizer-2

This document provides comprehensive documentation for the caching system in the image-resizer-2 project, including the alignment with video-resizer.

## Table of Contents

1. [Overview](#overview)
2. [Implementation Details](#implementation-details)
3. [Path Pattern-Based TTL Calculation](#path-pattern-based-ttl-calculation)
4. [Age-Adjusted Cache-Control Headers](#age-adjusted-cache-control-headers)
5. [Request Context & Breadcrumb Logging](#request-context--breadcrumb-logging)
6. [Resilience Mechanisms](#resilience-mechanisms)
7. [Technical Implementation](#technical-implementation)
8. [Testing](#testing)
9. [Migration & Deployment](#migration--deployment)
10. [Future Enhancements](#future-enhancements)

## Overview

The caching system for image-resizer-2 has been aligned with the more advanced patterns from video-resizer to ensure consistent behavior across all asset types. The system provides:

- **Precise Cache Control**: Path-specific TTL calculation based on regex patterns
- **Browser-Optimized Caching**: Age-adjusted headers for accurate client caching
- **Improved Resilience**: Circuit breaker pattern and fallback mechanisms
- **Enhanced Diagnostics**: Request context tracking and breadcrumb logging
- **Background Operations**: Non-blocking cache operations with waitUntil

### Benefits

1. **More Accurate Caching**: Age-adjusted headers prevent over-caching
2. **Improved Efficiency**: Path-specific TTLs optimize by resource type
3. **Enhanced Debugging**: Context tracking simplifies troubleshooting
4. **Better Resilience**: Fallbacks prevent cascading failures
5. **Code Consistency**: Aligned code reduces maintenance burden

## Implementation Details

### Key Components

1. **CacheService**: Core service that orchestrates caching operations
2. **PathPatternTTLCalculator**: Determines cache TTL based on URL path patterns
3. **CacheHeadersManager**: Manages cache-related response headers
4. **CacheResilienceManager**: Handles fault tolerance with circuit breaker pattern
5. **CachePerformanceManager**: Optimizes cache operations for performance

### Key Files

1. `cacheService.ts`: Core caching service with age-adjusted headers
2. `PathPatternTTLCalculator.ts`: Pattern-based TTL calculator
3. `fallbacks.ts`: Resilient fallback implementations
4. `interfaces.ts`: Updated StorageResult with TTL fields
5. `CacheService.integration.test.ts`: Tests for header handling

## Path Pattern-Based TTL Calculation

The path pattern system allows for flexible TTL configuration based on URL patterns:

### Configuration Example

```json
{
  "cache": {
    "pathPatterns": [
      {
        "name": "static-assets",
        "matcher": "/(static|assets)/",
        "ttl": {
          "ok": 86400,
          "redirects": 3600,
          "clientError": 60,
          "serverError": 10
        },
        "priority": 10,
        "description": "Static assets should be cached longer"
      },
      {
        "name": "default",
        "matcher": ".*",
        "ttl": {
          "ok": 300,
          "redirects": 120,
          "clientError": 60,
          "serverError": 10
        },
        "priority": 0,
        "description": "Default pattern for all other paths"
      }
    ]
  }
}
```

### Pattern Matching Logic

The PathPatternTTLCalculator follows this logic:
1. Initialize with patterns from configuration
2. Match request path against available patterns
3. Select highest-priority matching pattern
4. Determine appropriate TTL based on response status
5. Apply any additional adjustments (content type, derivatives)

### Fallback Implementation

For resilience, a fallback implementation provides basic functionality:

```typescript
export class PathPatternTTLCalculatorFallback {
  calculateTtl(response: Response): number {
    // Simple TTL calculation based on status code
    const statusCategory = Math.floor(response.status / 100);
    
    switch (statusCategory) {
      case 2: // Success (200-299)
        return 300; // 5 minutes
      case 3: // Redirect (300-399)
        return 60;  // 1 minute
      case 4: // Client error (400-499)
        return 10;  // 10 seconds
      case 5: // Server error (500-599)
        return 5;   // 5 seconds
      default:
        return 30;  // 30 seconds default
    }
  }
}
```

## Age-Adjusted Cache-Control Headers

A key feature is age-adjusted caching headers, which ensures accurate client-side caching:

### Implementation

```typescript
// Calculate age of the cached item
const now = Date.now();
const cacheTimestamp = metadata.timestamp || now;
const ageInSeconds = Math.floor((now - cacheTimestamp) / 1000);

// Adjust max-age for browsers - don't let it go below 0
const adjustedMaxAge = Math.max(0, originalTTL - ageInSeconds);

// Keep original TTL for edge caches like CDNs
const edgeTTL = originalTTL;

// Set standard Cache-Control header with adjusted max-age
headers.set('Cache-Control', `public, max-age=${adjustedMaxAge}`);

// Set CDN-specific headers with original TTL
headers.set('Surrogate-Control', `max-age=${edgeTTL}`);
headers.set('CDN-Cache-Control', `max-age=${edgeTTL}`);

// Add Age header for debugging and standards compliance
headers.set('Age', ageInSeconds.toString());
```

### Benefits of Age-Adjusted Headers

1. When images are retrieved from KV cache, the system calculates how long they've been cached
2. It subtracts this age from the original TTL to create an adjusted max-age value
3. The adjusted value is used in the Cache-Control header sent to clients
4. Original TTL values are preserved in CDN-specific headers like Surrogate-Control
5. Prevents resources from being cached longer than intended as they move through caching layers

## Request Context & Breadcrumb Logging

Both systems implement consistent request context tracking:
- Unique context ID maintained throughout request lifecycle
- Breadcrumb logging for sequential operation tracking
- Improved debugging with correlated log entries

## Resilience Mechanisms

Shared resilience features include:
- Circuit breaker pattern for handling service disruptions
- Fallback implementations for critical components
- Graceful degradation rather than complete failure

## Technical Implementation

### Completed Work

✅ Implemented PathPatternTTLCalculator with pattern-based matching  
✅ Added request context tracking and breadcrumb logging  
✅ Created age-adjusted Cache-Control header generation  
✅ Implemented circuit breaker for cache resilience  
✅ Added fallback mechanisms for critical components  
✅ Updated interfaces with TTL support  
✅ Created comprehensive tests for all functionality  
✅ Added detailed documentation  

## Testing

Comprehensive tests verify the age-adjusted headers functionality:

### Normal Age Adjustment
Tests when an item has been in cache for part of its TTL:
- Verifies max-age is reduced by the item's age
- Confirms CDN headers still have original TTL
- Checks Age header is correctly set

### Exceeded TTL Handling
Tests when an item has been in cache longer than its TTL:
- Confirms max-age is set to 0
- Verifies CDN headers maintain original TTL
- Ensures Age header shows actual cache time

### Missing Timestamp Handling
Tests fallback behavior when timestamp metadata is missing:
- Verifies system uses original TTL for max-age
- Checks Age is set to 0
- Confirms warning is logged

## Migration & Deployment

### Staged Rollout
- Deploy foundation components first
- Enable new features with feature flags
- Roll out to small percentage of traffic initially

### Configuration Compatibility
- Support both old and new configuration formats
- Auto-migrate configurations during startup
- Provide detailed error messages for invalid configurations

### Monitoring
- Add cache efficiency metrics
- Track TTL determination patterns
- Monitor memory usage and response times

## Future Enhancements

1. Shared cache library between projects
2. Enhanced cache analytics and observability
3. Configurable cache warmup strategies
4. Regional cache optimizations
EOL < /dev/null