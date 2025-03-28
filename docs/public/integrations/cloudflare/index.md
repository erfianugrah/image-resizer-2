# Cloudflare Integration

The Image Resizer is designed to work optimally with Cloudflare's platform, leveraging several Cloudflare-specific features to enhance performance and capabilities.

## Key Topics

- [Interceptor Pattern](interceptor-pattern.md) - Handling Cloudflare Image Resizing subrequests
- [Workers Integration](workers-integration.md) - Cloudflare Workers integration details

## Cloudflare Features Used

The Image Resizer leverages the following Cloudflare features:

1. **Image Resizing**: Uses the `cf.image` object for transformations
2. **R2 Storage**: Integrates with Cloudflare R2 for image storage
3. **Workers Cache API**: Uses Cloudflare's caching system
4. **Client Hints**: Uses Cloudflare-specific client hints for device detection
5. **Cloudflare Page Rules**: Compatible with CF cache rules
6. **Cloudflare Cache Tags**: Supports CF cache tags for purging

## Interceptor Pattern

The interceptor pattern is a key integration point with Cloudflare's Image Resizing service. It detects and handles subrequests from the Cloudflare Image Resizing service to prevent timeouts on large images.

For detailed information, see the [Interceptor Pattern](interceptor-pattern.md) documentation.

## Cache Integration

The Image Resizer integrates with Cloudflare's caching system in two ways:

### 1. Cloudflare Edge Cache

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

### 2. Workers Cache API

Uses the Cloudflare Workers Cache API for more control:

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

## Client Hints Integration

The Image Resizer uses Cloudflare-specific client hints like:

- `CF-Device-Type`: Cloudflare's device type detection
- `CF-IPCountry`: Country information
- `CF-Connecting-IP`: Client IP information

## Custom Workers Features

The Image Resizer also uses these Cloudflare Workers features:

1. **Environment Variables**: For configuration
2. **Workers Secrets**: For secure credential storage
3. **Custom Domains**: For routing to the worker
4. **Workers Triggers**: For request handling

## Deployment

The Image Resizer is designed to be deployed as a Cloudflare Worker using Wrangler:

```bash
# Development
wrangler dev

# Staging
wrangler deploy --env staging

# Production
wrangler deploy --env production
```

For more details on Cloudflare integration, explore the individual topics in this section.