# Cache Tags in Image Resizer

This document explains the enhanced cache tag system in the Image Resizer project, including the new modular implementation with CacheTagsManager.

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Caching Overview](index.md)
- [Core Architecture](../core/architecture.md)
- [Configuration Reference](../core/configuration-reference.md)
- [Debug Headers](../debugging/debug-headers.md)

## Overview

Cache tags are a powerful feature of Cloudflare's CDN that allow for selective purging of cached resources. The Image Resizer implements a flexible cache tagging system that generates tags based on:

1. **Image path information** - Tags based on the URL path structure
2. **Transformation parameters** - Tags based on width, height, format, quality, etc.
3. **Custom tags** - Static tags defined in configuration
4. **Path-based tags** - Tags applied to specific URL patterns
5. **Metadata extraction** - Tags derived from response headers (e.g., from S3, Google Cloud Storage)

## Modular Cache Tags Implementation

The CacheTagsManager now implements cache tag functionality as a dedicated module within the modular cache architecture:

```typescript
// CacheTagsManager module structure
export class CacheTagsManager {
  // Core configuration
  private readonly enabled: boolean;
  private readonly prefix: string;
  private readonly config: CacheTagsConfig;
  private readonly logger?: LoggerInterface;

  // Tag generation methods
  public generateTags(
    request: Request, 
    url: URL, 
    transformOptions: TransformOptions, 
    response?: Response
  ): string[];
  
  // Apply tags to response
  public applyTags(
    response: Response, 
    tags: string[]
  ): Response;
  
  // Helper methods
  private generatePathTags(url: URL): string[];
  private generateTransformTags(transformOptions: TransformOptions): string[];
  private generateMetadataTags(response: Response): string[];
  private getPathBasedTags(url: URL): string[];
  private normalizeTag(tag: string): string;
}
```

### Advantages of Modular Implementation

1. **Improved testing** - The CacheTagsManager can be tested in isolation
2. **Clear interfaces** - Well-defined interfaces for tag generation and application
3. **Configuration consistency** - Centralized configuration handling
4. **Enhanced debugging** - Dedicated logging for cache tag operations
5. **Integration flexibility** - Works with both Cloudflare's managed cache and Cache API
6. **Simpler maintenance** - Focused responsibility makes code maintenance easier

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
  // New options
  includeAspectRatio?: boolean;   // Include aspect ratio tags
  includeSourceType?: boolean;    // Include tags for source type (origin-r2, origin-remote)
  includeStatusCategory?: boolean; // Include HTTP status category tags
  maxTagsPerResponse?: number;    // Limit tags per response (max 125 for Cloudflare)
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

### Aspect Ratio Tags

For images with aspect ratio information:

```
img-prod-aspect-portrait      // height > width
img-prod-aspect-landscape     // width > height
img-prod-aspect-square        // width == height
img-prod-aspect-ratio-16x9    // specific aspect ratio
```

### Content Source Tags

Based on the origin of the image:

```
img-prod-origin-r2            // Cloudflare R2 storage
img-prod-origin-remote        // Remote HTTP source
img-prod-origin-s3            // Amazon S3
img-prod-origin-gcs           // Google Cloud Storage
```

### HTTP Status Tags

For differentiating cache entries by status:

```
img-prod-status-success       // 2xx responses
img-prod-status-redirect      // 3xx responses
img-prod-status-client-error  // 4xx responses
img-prod-status-server-error  // 5xx responses
img-prod-code-200             // Specific status code
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

## Integration with Cache Service

The CacheTagsManager is integrated into the CacheService as a modular component:

```typescript
export class CacheService implements CacheServiceInterface {
  private readonly tagsManager: CacheTagsManager;
  private readonly headersManager: CacheHeadersManager;
  private readonly bypassManager: CacheBypassManager;
  // More components...
  
  async get(options: CacheGetOptions): Promise<CacheResult | null> {
    // Check if we should bypass cache
    if (this.bypassManager.shouldBypass(options.request)) {
      return null;
    }
    
    // Proceed with cache get...
    
    // If cache hit, add tags to response
    if (result) {
      const tags = this.tagsManager.generateTags(
        options.request, 
        options.url, 
        options.transformOptions,
        new Response(result.buffer, { headers: result.headers })
      );
      
      return {
        ...result,
        headers: this.tagsManager.applyTags(
          new Headers(result.headers),
          tags
        )
      };
    }
    
    return null;
  }
  
  async set(options: CacheSetOptions): Promise<void> {
    // Generate tags for the response
    const tags = this.tagsManager.generateTags(
      options.request,
      options.url,
      options.transformOptions,
      options.response
    );
    
    // Add cache headers and tags to the response
    const enhancedResponse = this.tagsManager.applyTags(
      this.headersManager.applyHeaders(
        options.response, 
        options.transformOptions
      ),
      tags
    );
    
    // Proceed with cache set...
  }
}
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

### Advanced Purging Strategies

The modular architecture enables more advanced purging strategies:

```typescript
// Purge specific image dimensions
purgeByTags(['img-prod-width-800', 'img-prod-format-webp']);

// Purge all images in product category with specific dimensions
purgeByTags(['img-prod-path-products', 'img-prod-width-800']);

// Purge all portrait images 
purgeByTags(['img-prod-aspect-portrait']);

// Purge specific derivative templates
purgeByTags(['img-prod-derivative-thumbnail']);
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
| Aspect ratio | `img-prod-aspect-*` | `img-prod-aspect-portrait` | Purge portrait images |
| Origin type | `img-prod-origin-*` | `img-prod-origin-r2` | Purge all R2-sourced images |
| HTTP status | `img-prod-status-*` | `img-prod-status-success` | Purge successful responses |

## Best Practices

1. **Use descriptive prefixes** - Include environment and purpose in tags
2. **Limit tag cardinality** - Too many unique tags can impact performance
3. **Group related content** - Use path-based tags for logical content groups
4. **Security awareness** - Exclude sensitive information when parsing metadata
5. **Selective tagging** - Only enable the tag types you need
6. **Use consistent tag patterns** - Maintain consistent patterns for easier purging
7. **Document tags** - Keep a registry of important tag patterns for purging
8. **Consider tag limits** - Cloudflare limits to 125 tags per request

## Performance Considerations

- Cache tags add a small overhead to response generation
- Parsing metadata headers adds additional processing time
- Each Cloudflare request can have a maximum of 125 cache tags
- The CacheTagsManager can be configured to prioritize important tags if approaching limits

## Debugging Cache Tags

Set `DEBUG=true` to see cache tags in debug headers:

```
X-Cache-Tags: img-prod-path-products-camera-jpg, img-prod-format-webp, img-prod-width-800
```

You can also enable detailed logging for the CacheTagsManager:

```js
// wrangler.jsonc
"vars": {
  "CACHE_TAGS_LOGGING": "verbose",
}
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
  "CACHE_TAGS_INCLUDE_ASPECT_RATIO": "true",
  "CACHE_TAGS_INCLUDE_SOURCE_TYPE": "true",
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

## Troubleshooting

### Tags Not Being Applied

If you don't see cache tags being applied to your responses:

1. Verify that `CACHE_TAGS_ENABLED` is set to `true`
2. Check if you've reached the 125 tag limit per response
3. Look for debug headers to see what tags are being generated
4. Ensure the cache method is set to `cf` to use Cloudflare's cache
5. Check the CacheTagsManager logs for any issues

### Purging Not Working

If cache purging with tags isn't working:

1. Confirm that the correct zone ID is being used
2. Verify tag format matches those applied to resources
3. Check Cloudflare API permissions for the API key being used
4. Ensure tag prefixes match between tagging and purging
5. Verify tags are not being truncated due to the 125 tag limit

## Related Resources

- [Enhanced Caching System](enhanced-caching.md)
- [Metadata Caching Strategy](metadata-caching-strategy.md)
- [Core Architecture: Modular Cache Components](../core/architecture.md#modular-cache-components)
- [Configuration Reference](../core/configuration-reference.md)
- [Debug Headers](../debugging/debug-headers.md)
- [Cloudflare Cache Tags Documentation](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-cache-tag/)

---

*Last Updated: March 29, 2025*