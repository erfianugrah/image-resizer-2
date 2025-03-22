# Storage Systems

The Image Resizer supports multiple storage options to provide flexibility in image source location. This section documents the storage capabilities, configuration options, and best practices.

## In This Section

- [R2 Storage](r2-storage.md) - Using Cloudflare R2 for image storage
- [Remote Storage](remote-storage.md) - Accessing images from remote URLs
- [Path Transformations](path-transforms.md) - Path mapping for different storage types
- [Authentication](authentication.md) - Securing access to origin images

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Core Architecture](../core/architecture.md)
- [Setup Guide](../core/setup.md)
- [Configuration Reference](../core/configuration-reference.md)

## Storage Features

The Image Resizer supports multiple storage options:

1. **Cloudflare R2**: Direct integration with Cloudflare's object storage
2. **Remote URLs**: Fetch images from remote origins
3. **Fallback URLs**: Alternative source when primary source fails
4. **Storage Priority**: Configurable order for attempting storage sources
5. **Path Transformations**: Different path mappings for each storage type

## Storage Configuration

Storage behavior is configured through the following parameters:

```jsonc
{
  "storage": {
    "priority": ["r2", "remote", "fallback"], // Order to try storage options
    "remoteUrl": "https://example.com/images", // Base URL for remote images
    "fallbackUrl": "https://fallback.com/images", // Base URL for fallback
    "r2": {
      "enabled": true,
      "bindingName": "IMAGES_BUCKET" // R2 binding name
    },
    "remoteAuth": {
      "enabled": true,
      "type": "aws-s3", // or bearer, header, query
      "region": "us-east-1",
      "service": "s3"
      // ... other auth parameters
    },
    "fallbackAuth": {
      "enabled": false,
      "type": "bearer"
      // ... other auth parameters
    },
    "fetchOptions": {
      "userAgent": "Cloudflare-Image-Resizer/1.0",
      "headers": {
        "Accept": "image/*"
      }
    }
  }
}
```

## Storage Priority System

The storage priority system controls the order in which storage sources are attempted:

```javascript
// Default priority: r2, then remote, then fallback
const priority = ["r2", "remote", "fallback"];

// Try each storage option in order until one succeeds
for (const source of priority) {
  try {
    if (source === "r2" && r2Enabled) {
      const image = await fetchFromR2(path);
      if (image) return image;
    } else if (source === "remote" && remoteUrl) {
      const image = await fetchFromRemote(path);
      if (image) return image;
    } else if (source === "fallback" && fallbackUrl) {
      const image = await fetchFromFallback(path);
      if (image) return image;
    }
  } catch (error) {
    // Log error and continue to next source
  }
}
```

You can dynamically control the storage priority order without modifying the code:

```bash
# To use remote sources only
wrangler dev --var STORAGE_PRIORITY=remote,fallback

# To use fallback only
wrangler dev --var STORAGE_PRIORITY=fallback

# To try different priority order
wrangler dev --var STORAGE_PRIORITY=fallback,remote,r2
```

## Integration with Path Transforms

Each storage type can have different path mapping rules:

```jsonc
"pathTransforms": {
  "assets": {
    "prefix": "img/",
    "removePrefix": true,
    /* Origin-specific transforms */
    "r2": {
      "prefix": "img/",
      "removePrefix": true
    },
    "remote": {
      "prefix": "assets/",
      "removePrefix": true
    },
    "fallback": {
      "prefix": "public/",
      "removePrefix": true
    }
  }
}
```

## Authentication for Origins

The system supports authenticated access to origins:

1. **AWS S3/R2**: Using AWS v4 signature authentication
2. **Bearer Tokens**: Using Authorization header
3. **Custom Headers**: Using arbitrary HTTP headers
4. **Query Parameters**: Using signed URL parameters

For more details on the storage system, explore the individual topics in this section.

## Related Resources

- [Core Architecture: Storage Service](../core/architecture.md#4-storage-service-storagets)
- [Core Architecture: Authentication Flow](../core/architecture.md#authentication-flow)
- [Core Architecture: Secret Management](../core/architecture.md#secret-management)
- [Debugging Storage Issues](../debugging/diagnosing-timeouts.md)
- [Configuration Reference](../core/configuration-reference.md)

---

*Last Updated: March 22, 2025*