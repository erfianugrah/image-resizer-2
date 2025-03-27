# Cloudflare-Specific Cache Optimizations

This document outlines the Cloudflare-specific cache optimizations implemented in the Image Resizer 2 caching system.

## Table of Contents

- [Overview](#overview)
- [Cloudflare Cache API vs. Edge Cache](#cloudflare-cache-api-vs-edge-cache)
- [Cache Everything Mode](#cache-everything-mode)
- [Status-Based TTL Controls](#status-based-ttl-controls)
- [Cache Tags for Purging](#cache-tags-for-purging)
- [Edge-Side Includes (ESI)](#edge-side-includes-esi)
- [Cache Key Modifications](#cache-key-modifications)
- [CF-specific Headers](#cf-specific-headers)
- [Worker-Specific Optimizations](#worker-specific-optimizations)

## Overview

Cloudflare provides several unique caching capabilities that Image Resizer 2 leverages for optimal performance. These capabilities include both traditional CDN cache controls and Cloudflare Workers-specific features.

## Cloudflare Cache API vs. Edge Cache

Image Resizer 2 supports two distinct Cloudflare caching mechanisms:

### Edge Cache (`cf` Method)

- Controlled through the `cf` object in fetch options
- Global cache shared across all Cloudflare's edge nodes
- Longer persistence and higher hit rates
- Configured through `cacheEverything` and `cacheTtl` properties

```typescript
// Edge cache configuration example
fetch(url, {
  cf: {
    cacheEverything: true,
    cacheTtl: 86400
  }
})
```

### Cache API (`cache-api` Method)

- API-based cache with programmatic control
- More flexible but potentially less performant
- Useful for development or custom cache logic
- Implemented using the `caches.default` object

```typescript
// Cache API example
const cachedResponse = await caches.default.match(request);
if (cachedResponse) return cachedResponse;

const response = await fetch(request);
ctx.waitUntil(caches.default.put(request, response.clone()));
return response;
```

The system intelligently chooses between these methods based on configuration, with fallbacks if one fails.

## Cache Everything Mode

By default, Cloudflare only caches certain content types (HTML, JavaScript, CSS, images, etc.). Image Resizer 2 enables "Cache Everything" mode by default to ensure all transformed images are cached regardless of their content type or response code.

This is implemented through:

```typescript
fetch(url, {
  cf: {
    cacheEverything: true
  }
})
```

Benefits include:

- Caching of uncommon image formats
- Caching error responses to avoid repeated origin requests for invalid images
- Consistent caching behavior for all content

## Status-Based TTL Controls

Cloudflare allows different TTLs based on status code ranges, which Image Resizer 2 leverages for optimal caching:

### Simple Mode

When `useTtlByStatus` is `false`, a single TTL is used for all responses:

```typescript
fetch(url, {
  cf: {
    cacheTtl: 86400 // 24 hours for all responses
  }
})
```

### Status-Based Mode

When `useTtlByStatus` is `true`, different TTLs are applied to different status code ranges:

```typescript
fetch(url, {
  cf: {
    cacheTtlByStatus: {
      "200-299": 86400,  // 24 hours for success
      "301-302": 3600,   // 1 hour for redirects
      "404": 60,         // 1 minute for not found
      "500-599": 10      // 10 seconds for server errors
    }
  }
})
```

This prevents prolonged caching of error responses while maximizing cache lifetimes for successful responses.

## Cache Tags for Purging

Cloudflare Enterprise supports cache purging by tag, which Image Resizer 2 leverages for granular invalidation:

```typescript
fetch(url, {
  cf: {
    cacheTags: ["img-format-webp", "img-path-products-camera"]
  }
})
```

Cache tags enable:

- Purging by content type: `purge_tag("img-format-webp")`
- Purging by path pattern: `purge_tag("img-path-products")`
- Purging by derivative: `purge_tag("img-derivative-thumbnail")`

This avoids full cache purges when only certain content needs to be refreshed.

## Edge-Side Includes (ESI)

For HTML content that includes images, Cloudflare's ESI support can be leveraged for dynamic component caching:

```html
<esi:include src="/api/image-resizer?url=example.jpg&width=800" />
```

Image Resizer 2 ensures its responses are ESI-compatible by:

- Setting appropriate cache control headers
- Using stateless transformation logic
- Supporting URL-based configurations

## Cache Key Modifications

Cloudflare allows custom cache keys, which Image Resizer 2's versioning system leverages:

### Version-Based Cache Keys

For versioned content (`?v=1234`), the system includes the version in the cache key:

```typescript
fetch(url, {
  cf: {
    cacheKey: url.pathname + "?v=" + url.searchParams.get('v')
  }
})
```

### Device-Type Segmentation

For responsive images, different cache versions are maintained for different device types:

```typescript
fetch(url, {
  cf: {
    cacheKey: url.pathname + "-" + deviceType
  }
})
```

## CF-specific Headers

Cloudflare provides special headers that Image Resizer 2 utilizes:

- `CF-Cache-Status`: Monitored to track cache hit rates
- `CF-Ray`: Used for debugging and tracing
- `CF-IPCountry`: Leveraged for region-specific optimizations

Additionally, the system adds custom headers for diagnostics:

- `X-Cache-Strategy: cf` or `X-Cache-Strategy: cache-api`
- `X-Cache-TTL`: The actual TTL used
- `X-Cache-Tags`: List of tags applied for purging

## Worker-Specific Optimizations

As a Cloudflare Worker, Image Resizer 2 implements several worker-specific optimizations:

### waitUntil for Background Processing

```typescript
ctx.waitUntil(caches.default.put(request, response.clone()));
```

This allows cache operations to continue after the response is sent, reducing perceived latency.

### Streaming Responses

```typescript
return new Response(
  new ReadableStream({
    start(controller) {
      // Stream the response while caching in background
    }
  })
);
```

This enables faster TTFB (Time To First Byte) while still optimizing the cache.

### Service Binding Integration

For multi-worker architectures, service bindings enable cross-communication between image processing and caching services:

```typescript
// In another worker:
const imageResponse = await env.IMAGE_RESIZER_SERVICE.fetch(request);
```

This allows specialized workers for different aspects of the image processing pipeline.