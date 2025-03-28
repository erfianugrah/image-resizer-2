# Caching System

The Image Resizer includes a comprehensive caching system to optimize performance and reduce load on origin servers. This section documents the caching capabilities, configuration options, and best practices.

## In This Section

- [Cache Tags](cache-tags.md) - Advanced cache tagging for purging and management
- [Cache Strategies](cache-strategies.md) - Different caching strategies and their use cases
- [Cache Keys](cache-keys.md) - How cache keys are generated and customized

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Core Architecture](../core/architecture.md)
- [Setup Guide](../core/setup.md)
- [Configuration Reference](../core/configuration-reference.md)

## Caching Features

The Image Resizer supports multiple caching approaches:

1. **Cloudflare Edge Cache**: Leverages Cloudflare's global CDN
2. **Cache API**: Uses the Workers Cache API for more control
3. **Cache Tags**: Flexible tagging system for targeted cache purging
4. **TTL Management**: Configurable Time-To-Live for different response types
5. **Status-Based Caching**: Different cache settings based on status code ranges

## Cache Configuration

Cache behavior is highly configurable through the following parameters:

```jsonc
{
  "cache": {
    "method": "cf",              // "cf", "cache-api", or "none"
    "ttl": {
      "ok": 86400,               // TTL for 2xx responses (seconds)
      "clientError": 60,         // TTL for 4xx responses (seconds)
      "serverError": 10,         // TTL for 5xx responses (seconds)
      "remoteFetch": 3600,       // TTL for remote fetches (seconds)
      "r2Headers": 86400         // TTL for R2 headers (seconds)
    },
    "cacheEverything": true,     // Cache all content types
    "useTtlByStatus": true,      // Use status-based caching
    "statusRanges": {            // Status code ranges
      "success": "200-299",
      "redirect": "301-302,307",
      "notFound": "404,410",
      "serverError": "500-503,507"
    },
    "cacheTtlByStatus": {        // TTLs by status range
      "200-299": 86400,          // 24 hours for success
      "301-302": 3600,           // 1 hour for redirects
      "404": 60,                 // 1 minute for not found
      "500-599": 10              // 10 seconds for server errors
    },
    "cacheability": true,        // Set public/private cacheability
    "bypassParams": ["nocache"],  // Query parameters that bypass cache
    "cacheTags": {               // Cache tag configuration
      "enabled": true,
      "prefix": "img-",
      "includeImageDimensions": true,
      "includeFormat": true,
      "includeQuality": true,
      "includeDerivative": true,
      "customTags": ["site1", "v2"],
      "pathBasedTags": {
        "products": ["product-catalog", "e-commerce"],
        "blog": ["blog-content", "articles"]
      }
    }
  }
}
```

## Cache Methods

The Image Resizer supports multiple caching methods:

### Cloudflare Edge Cache

Uses Cloudflare's global CDN for optimal performance:

```jsonc
{
  "cache": {
    "method": "cf",
    "cacheEverything": true,
    "ttl": {
      "ok": 86400 // 24 hours
    }
  }
}
```

### Cache API

Uses the Workers Cache API for more control:

```jsonc
{
  "cache": {
    "method": "cache-api",
    "ttl": {
      "ok": 3600 // 1 hour
    }
  }
}
```

### Disabling Cache

For development or special cases:

```jsonc
{
  "cache": {
    "method": "none"
  }
}
```

## Cache Headers

The system sets appropriate Cache-Control headers based on configuration:

- `Cache-Control: public, max-age=86400` (for success responses)
- `Cache-Control: public, max-age=60` (for client errors)
- `Cache-Control: no-store` (for server errors)

## Integration with Client Detection

The caching system works with the client detection framework to ensure that:

1. Responses are cached based on the requesting client's capabilities
2. Appropriate `Vary` headers are set for client-dependent responses
3. Cache keys include relevant client information when needed

For more details on the caching system, explore the individual topics in this section.

## Related Resources

- [Core Architecture: Caching Service](../core/architecture.md#7-caching-service-cachets)
- [Cache Tags Implementation](../core/architecture.md#cache-tag-implementation-details)
- [Client Detection Framework](../client-detection/index.md)
- [Debug Headers](../debugging/debug-headers.md)
- [Configuration Reference](../core/configuration-reference.md)

---

*Last Updated: March 22, 2025*