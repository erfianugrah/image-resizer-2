# Cache Performance Manager

This document describes the CachePerformanceManager component of the modular cache architecture, which focuses on monitoring, measuring, and optimizing cache performance.

## Table of Contents

- [Overview](#overview)
- [Feature Set](#feature-set)
- [Metrics Collection](#metrics-collection)
- [Resource Hints](#resource-hints)
- [Performance Analysis](#performance-analysis)
- [Integration with Cache Service](#integration-with-cache-service)
- [Configuration Options](#configuration-options)
- [Implementation Examples](#implementation-examples)
- [Debugging and Monitoring](#debugging-and-monitoring)

## Overview

The CachePerformanceManager is a specialized component within the modular cache architecture that handles all aspects of cache performance monitoring, resource hint generation, and performance optimization recommendations.

Key responsibilities include:

1. Recording cache operation metrics (hits, misses, timings)
2. Adding resource hints to responses for client-side optimization
3. Measuring operation durations for performance analysis
4. Providing insights for cache performance tuning
5. Integrating with Cloudflare analytics and debugging tools

## Feature Set

### Comprehensive Metrics Collection

- Hit/miss rates with detailed categorization
- Operation timing measurements (get, set, delete)
- Cache size monitoring and threshold alerts
- Operation counts and request distribution
- Performance statistics for different cache layers

### Resource Hint Generation

- DNS prefetch suggestions for origin domains
- Preconnect hints for faster initial connections
- Preload directives for critical resources
- Server timing headers for debugging

### Detailed Performance Analysis

- Cache efficiency calculations
- Hot/cold path identification
- Resource usage monitoring
- Bottleneck detection
- Optimization recommendations

## Metrics Collection

The CachePerformanceManager collects and exposes the following metrics:

### Cache Operation Metrics

```typescript
interface CacheOperationMetrics {
  hits: number;
  misses: number;
  totalOperations: number;
  hitRate: number;
  operations: {
    get: number;
    set: number;
    delete: number;
  };
  timing: {
    get: {
      average: number;
      min: number;
      max: number;
    };
    set: {
      average: number;
      min: number;
      max: number;
    };
  };
  byContentType: Record<string, {
    hits: number;
    misses: number;
    hitRate: number;
  }>;
  byStatusCode: Record<string, {
    hits: number;
    misses: number;
  }>;
  byPath: Record<string, {
    hits: number;
    misses: number;
    hitRate: number;
  }>;
  lastResetTime: number;
}
```

### KV-Specific Metrics

```typescript
interface KVMetrics extends CacheOperationMetrics {
  operationsRemaining: number;  // KV operation quota
  readUnits: number;           // KV read units consumed
  writeUnits: number;          // KV write units consumed
  storage: {
    size: number;             // Total KV storage used
    keys: number;             // Number of KV keys
    estimatedCost: number;    // Estimated storage cost
  };
}
```

### Metadata Metrics

```typescript
interface MetadataMetrics {
  inMemoryCache: {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
  };
  kvCache: {
    hits: number;
    misses: number;
    errors: number;
  };
  originFetch: {
    hits: number;
    errors: number;
    averageTime: number;
  };
  aspectCrop: {
    processed: number;
    skipped: number; // Due to cache
    averageTime: number;
  };
}
```

## Resource Hints

The CachePerformanceManager adds resource hints to improve client-side performance:

### Preconnect Hints

For common CDNs and origin domains:

```http
Link: <https://img-origin.example.com>; rel=preconnect; crossorigin
```

### DNS Prefetch

For domains that will be accessed later:

```http
Link: <https://api.example.com>; rel=dns-prefetch
```

### Preload Directives

For critical resources:

```http
Link: <https://img-origin.example.com/common/logo.png>; rel=preload; as=image
```

### Server Timing Headers

For performance debugging:

```http
Server-Timing: cache;desc="HIT", transform;dur=12.4, origin;dur=0
```

## Performance Analysis

The CachePerformanceManager provides detailed performance analysis through:

### Real-time Metrics Dashboard

When debug mode is enabled, metrics are exposed through debug headers and endpoints:

```http
X-Cache-Metrics: {"hits":245,"misses":18,"hitRate":0.93,"timing":{"get":{"average":5.2}}}
```

### Optimization Recommendations

Based on collected metrics, the system can suggest optimizations:

- Cache TTL adjustments for frequently accessed resources
- Cache warm-up suggestions for commonly missed resources
- Storage quota management recommendations
- Content type-specific caching strategy adjustments

### Performance Alerts

Configurable thresholds for alerting:

- Low hit rate alerts (below configurable threshold)
- High latency warnings
- Quota usage alerts
- Error rate monitoring

## Integration with Cache Service

The CachePerformanceManager integrates with the CacheService as follows:

```typescript
export class CacheService implements CacheServiceInterface {
  private readonly performanceManager: CachePerformanceManager;
  // Other components...
  
  async get(options: CacheGetOptions): Promise<CacheResult | null> {
    // Start measuring operation time
    const startTime = this.performanceManager.startOperation('get', options);
    
    try {
      // Attempt cache get
      const result = await this.delegate.get(options);
      
      // Record the outcome
      if (result) {
        this.performanceManager.recordHit({
          key: options.key,
          contentType: result.metadata.contentType,
          size: result.buffer.length,
          path: options.url?.pathname,
          transformOptions: options.transformOptions
        });
        
        // Add resource hints to response if needed
        result.headers = this.performanceManager.addResourceHints(
          result.headers,
          options.url
        );
        
        return result;
      } else {
        this.performanceManager.recordMiss({
          key: options.key,
          path: options.url?.pathname,
          transformOptions: options.transformOptions
        });
        return null;
      }
    } catch (error) {
      this.performanceManager.recordError('get', error);
      throw error;
    } finally {
      // End measurement
      this.performanceManager.endOperation('get', startTime);
    }
  }
  
  // Similar instrumentation for set(), delete(), etc.
}
```

## Configuration Options

The CachePerformanceManager is configured through the following options:

```typescript
interface CachePerformanceConfig {
  enabled: boolean;
  metrics: {
    enabled: boolean;
    resetInterval?: number;    // Interval to reset metrics (ms)
    detailedTimings: boolean;  // Track detailed timing breakdowns
    pathPatterns?: string[];   // Specific paths to track separately
    contentTypes?: string[];   // Content types to track separately
  };
  resourceHints: {
    enabled: boolean;
    preconnect?: string[];     // Domains to preconnect
    dnsPrefetch?: string[];    // Domains to DNS prefetch
    preload?: {                // Resources to preload
      pattern: string;
      as: string;
    }[];
  };
  serverTiming: {
    enabled: boolean;
    includeDurations: boolean;
  };
  alerts: {
    minHitRate?: number;       // Alert if hit rate drops below threshold
    maxLatency?: number;       // Alert if latency exceeds threshold
    quotaWarningThreshold?: number; // Alert when approaching quota
  };
}
```

## Implementation Examples

### Basic Configuration

```js
// wrangler.jsonc
"vars": {
  "CACHE_PERFORMANCE_ENABLED": "true",
  "CACHE_PERFORMANCE_METRICS_ENABLED": "true",
  "CACHE_PERFORMANCE_RESOURCE_HINTS_ENABLED": "true"
}
```

### Advanced Configuration

```js
// wrangler.jsonc
"vars": {
  "CACHE_PERFORMANCE_ENABLED": "true",
  "CACHE_PERFORMANCE_METRICS_ENABLED": "true",
  "CACHE_PERFORMANCE_METRICS_RESET_INTERVAL": "3600000", // 1 hour
  "CACHE_PERFORMANCE_METRICS_DETAILED_TIMINGS": "true",
  "CACHE_PERFORMANCE_METRICS_PATH_PATTERNS": "products,blog,assets",
  "CACHE_PERFORMANCE_RESOURCE_HINTS_ENABLED": "true",
  "CACHE_PERFORMANCE_RESOURCE_HINTS_PRECONNECT": "img-origin.example.com,api.example.com",
  "CACHE_PERFORMANCE_SERVER_TIMING_ENABLED": "true",
  "CACHE_PERFORMANCE_ALERTS_MIN_HIT_RATE": "0.85", // 85% minimum hit rate
  "CACHE_PERFORMANCE_ALERTS_MAX_LATENCY": "100" // 100ms maximum latency
}
```

## Debugging and Monitoring

### Debug Headers

With debug mode enabled, the CachePerformanceManager adds helpful headers:

```http
X-Cache-Performance: {"hitRate":0.93,"avgGetTime":5.2,"avgSetTime":12.4}
X-Cache-Metrics-Detailed: {"byPath":{"/products/":{"hits":120,"misses":5}},"byContentType":{"image/webp":{"hits":200}}}
Server-Timing: cache;desc="HIT", transform;dur=12.4, load;dur=0
```

### Performance Dashboard Endpoint

When running in debug mode, a performance dashboard is available at:

```
/debug/cache/performance
```

This provides a real-time view of cache performance metrics including:

- Hit/miss rate charts
- Operation timing graphs
- Content type distribution
- Path-based performance analysis
- Resource consumption metrics
- Optimization recommendations

### Monitoring Integration

The CachePerformanceManager can integrate with monitoring systems via:

1. Custom webhook notifications for alerts
2. Prometheus metrics endpoint for scraping
3. JSON export for dashboard integration
4. Cloudflare Analytics integration

## Related Resources

- [Enhanced Caching System](enhanced-caching.md)
- [Metadata Caching Strategy](metadata-caching-strategy.md)
- [Cache Tags](cache-tags.md)
- [Debug Headers](../debugging/debug-headers.md)
- [Performance Metrics](../debugging/performance-metrics.md)

---

*Last Updated: March 29, 2025*