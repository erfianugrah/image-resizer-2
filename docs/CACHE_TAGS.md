# Cache Tags in Image Resizer

This document explains the cache tag system in the Image Resizer project, including how to configure and use it effectively.

## Overview

Cache tags are a powerful feature of Cloudflare's CDN that allow for selective purging of cached resources. The Image Resizer implements a flexible cache tagging system that generates tags based on:

1. **Image path information** - Tags based on the URL path structure
2. **Transformation parameters** - Tags based on width, height, format, quality, etc.
3. **Custom tags** - Static tags defined in configuration
4. **Path-based tags** - Tags applied to specific URL patterns
5. **Metadata extraction** - Tags derived from response headers (e.g., from S3, Google Cloud Storage)

## Configuration

Cache tagging is configured through environment variables and the configuration system:

```js
// Basic configuration
CACHE_TAGS_ENABLED=true
CACHE_TAGS_PREFIX=img-prod-
CACHE_TAGS_CUSTOM=site1,product-images,v2
CACHE_TAGS_PARSE_METADATA=true
```

The full configuration structure supports:

```typescript
interface CacheTagsConfig {
  enabled: boolean;               // Master enable/disable switch
  prefix?: string;                // Prefix for all tags (e.g., "img-prod-")
  includeImageDimensions: boolean; // Include width/height in tags
  includeFormat: boolean;         // Include format (webp, avif, etc.)
  includeQuality: boolean;        // Include quality setting
  includeDerivative: boolean;     // Include derivative template name
  customTags?: string[];          // Static custom tags to always include
  pathBasedTags?: Record<string, string[]>; // URL pattern to tags mapping
  parseMetadataHeaders?: {        // Extract tags from metadata headers
    enabled: boolean;
    headerPrefixes: string[];     // Headers to look for (e.g., "x-amz-meta-")
    excludeHeaders: string[];     // Headers to ignore (e.g., "credentials")
    includeContentType: boolean;  // Add tags based on content type
    includeCacheControl: boolean; // Add tags based on cache-control
  };
  pathNormalization?: {           // How to normalize path segments for tags
    leadingSlashPattern?: string;
    invalidCharsPattern?: string;
    replacementChar?: string;
  };
}
```

## Tag Format and Generation

### Base Path Tags

For an image at `/products/electronics/camera.jpg`:

```
img-prod-path-products-electronics-camera-jpg
img-prod-segment-0-products
img-prod-segment-1-electronics
img-prod-segment-2-camera-jpg
```

### Transformation Tags

When dimensions, format, or quality are specified:

```
img-prod-width-800
img-prod-height-600
img-prod-dimensions-800x600
img-prod-format-webp
img-prod-quality-80
img-prod-derivative-thumbnail
```

### Custom Static Tags

Define global tags that apply to all images:

```
img-prod-site1
img-prod-product-images
img-prod-v2
```

### Path-Based Tags

Apply specific tags to URL patterns:

```js
// In wrangler.jsonc or environment configuration
"CACHE_TAGS_PATH_BASED": {
  "products": ["product-catalog", "shoppable"],
  "blog": ["blog-content", "article-images"],
  "user-content": ["user-generated", "moderated"]
}
```

For an image matching `/products/`, it would get:

```
img-prod-product-catalog
img-prod-shoppable
```

### Metadata Header Tags

When enabled, extracts tags from storage metadata:

```
// From S3 metadata headers like:
// x-amz-meta-category: electronics
img-prod-meta-category-electronics

// From content-type
img-prod-type-image
img-prod-subtype-jpeg

// From cache-control
img-prod-cc-public
img-prod-cc-max-age-1day
```

## Using Cache Tags for Purging

Cache tags can be used to selectively purge content from Cloudflare's cache:

### Purging by Tag via API

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
     -H "X-Auth-Email: user@example.com" \
     -H "X-Auth-Key: api_key" \
     -H "Content-Type: application/json" \
     --data '{"tags":["img-prod-product-catalog"]}'
```

### Cache Tag Usage Examples

| Purpose | Tag Pattern | Example | Use Case |
|---------|------------|---------|----------|
| Global site update | `img-prod-site1` | `img-prod-site1` | Purge all images for a complete site refresh |
| Section update | `img-prod-section-*` | `img-prod-section-blog` | Purge all images in a specific section |
| Product catalog | `img-prod-path-products-*` | `img-prod-path-products-electronics` | Update product category images |
| Format-based purge | `img-prod-format-*` | `img-prod-format-webp` | Update specific format during optimization changes |
| Resolution purge | `img-prod-width-*` | `img-prod-width-320` | Purge mobile-specific renditions |
| Quality update | `img-prod-quality-*` | `img-prod-quality-85` | Update specific quality level after policy change |
| Content-type | `img-prod-type-*` | `img-prod-type-image` | Purge by content type |
| Cache-control | `img-prod-cc-*` | `img-prod-cc-public` | Purge public cache items |
| Source metadata | `img-prod-meta-category-*` | `img-prod-meta-category-electronics` | Purge by content category stored in metadata |

### Purging Scenarios

- **Global site update**: Purge all images with `img-prod-site1`
- **Product updates**: Purge product images with `img-prod-path-products`
- **Format updates**: Purge specific formats with `img-prod-format-webp`
- **Resolution-specific**: Purge mobile renditions with `img-prod-width-320`
- **Metadata-based**: Purge items with specific metadata using `img-prod-meta-category-electronics`
- **Cache directive**: Purge immutable items with `img-prod-cc-immutable`

## Best Practices

1. **Use descriptive prefixes** - Include environment and purpose in tags
2. **Limit tag cardinality** - Too many unique tags can impact performance
3. **Group related content** - Use path-based tags for logical content groups
4. **Security awareness** - Exclude sensitive information when parsing metadata
5. **Selective tagging** - Only enable the tag types you need

## Performance Considerations

- Cache tags add a small overhead to response generation
- Parsing metadata headers adds additional processing time
- Each Cloudflare request can have a maximum of 125 cache tags

## Debugging Cache Tags

Set `DEBUG=true` to see cache tags in debug headers:

```
X-Cache-Tags: img-prod-path-products-camera-jpg, img-prod-format-webp, img-prod-width-800
```

## Implementation Examples

### Basic Configuration

```js
// wrangler.jsonc
"vars": {
  "CACHE_TAGS_ENABLED": "true",
  "CACHE_TAGS_PREFIX": "img-prod-",
  "CACHE_TAGS_CUSTOM": "site,v2",
}
```

### Advanced Configuration with Metadata

```js
// wrangler.jsonc
"vars": {
  "CACHE_TAGS_ENABLED": "true",
  "CACHE_TAGS_PREFIX": "img-prod-",
  "CACHE_TAGS_CUSTOM": "site,v2",
  "CACHE_TAGS_PARSE_METADATA": "true",
  /* Path-based tag definitions */
  "PATH_TRANSFORMS": {
    "products": {
      "tags": ["product-catalog", "e-commerce"]
    },
    "blog": {
      "tags": ["content", "articles"]
    }
  }
}
```

## Internal Implementation

The cache tag system is implemented in the following files:

- `src/cache.ts` - Contains the `generateCacheTags()` and `applyCloudflareCache()` functions
- `src/config.ts` - Defines the configuration types and default settings
- `src/transform.ts` - Passes response headers to the cache functions for metadata extraction