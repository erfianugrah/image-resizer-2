# Path-Based Origins Configuration

This document explains how to configure path-based origins in the Image Resizer. Path-based origins allow you to serve images from different storage sources based on URL path patterns, enabling more flexible and optimized content delivery strategies.

## Overview

Path-based origins enable you to:

1. Serve different content types from specialized storage locations
2. Apply different authentication methods based on content type
3. Optimize storage costs by using appropriate storage tiers for different content
4. Simplify migrations by routing specific paths to new storage locations
5. Implement multi-tenant architectures with isolated storage per tenant

## Relationship with Top-Level URLs

Path-based origins work alongside the top-level configuration (global `remoteUrl` and `fallbackUrl`) in a hierarchical manner:

### Configuration Hierarchy

1. **Path-specific configuration** - Highest priority, most specific
2. **Environment-specific configuration** - Medium priority
3. **Global default configuration** - Lowest priority, most general

### How It Works

When a request comes in (e.g., `/products/shirt-red.jpg`):

1. **Path Matching**: 
   - The system checks each path pattern in `pathBasedOrigins`
   - If a match is found (e.g., pattern `products/` matches), it uses the path-specific configuration
   - If no match is found, it falls back to the top-level configuration

2. **Inheritance and Override**:
   - Path-specific configurations selectively override parts of the global configuration
   - Only the properties explicitly defined in the path config override the global settings
   - For example, a path config might specify its own `remoteUrl` but inherit authentication settings

3. **Request Flow Examples**:

   **Example 1: Matching Path Pattern**
   
   For a request to `/products/widget.jpg`:
   
   1. System finds a match with the `products/` pattern
   2. Uses the product-specific remote URL: `https://products.example.com/images`
   3. Applies product-specific storage priority: `["remote", "r2", "fallback"]`
   4. Applies product-specific authentication if defined
   5. Constructs the final URL: `https://products.example.com/images/widget.jpg`
   
   **Example 2: No Matching Path Pattern**
   
   For a request to `/somethingelse/image.jpg`:
   
   1. No matching pattern in `pathBasedOrigins`
   2. Falls back to top-level configuration:
      - Uses the top-level `remoteUrl`: `https://example.com/images`
      - Uses the top-level storage priority: `["r2", "remote", "fallback"]`
      - Uses global authentication settings
   3. Constructs the final URL based on top-level config: `https://example.com/images/somethingelse/image.jpg`

## Configuration

Path-based origins are configured in the `storage.pathBasedOrigins` section of your configuration. Each entry defines a set of rules for handling specific URL path patterns.

### Basic Structure

```javascript
{
  "storage": {
    "pathBasedOrigins": {
      "configName": {
        "pattern": "path/pattern",         // String or RegExp pattern to match
        "priority": ["r2", "remote"],      // Storage priority order for this path
        "remoteUrl": "https://example.com/specific-path",
        "fallbackUrl": "https://backup.example.com",
        // Other configuration options...
      }
    }
  }
}
```

### Configuration Options

Each path-based origin can include the following options:

| Option | Description |
|--------|-------------|
| `pattern` | A string or RegExp pattern to match against URL paths |
| `priority` | Array defining storage priority order (`r2`, `remote`, `fallback`) |
| `remoteUrl` | Remote URL specific to this path pattern |
| `fallbackUrl` | Fallback URL specific to this path pattern |
| `r2` | R2 settings specific to this path pattern |
| `auth` | Auth settings specific to this path pattern |
| `remoteAuth` | Remote auth settings specific to this path pattern |
| `fallbackAuth` | Fallback auth settings specific to this path pattern |
| `pathTransforms` | Path transformations specific to this path pattern |
| `fetchOptions` | Fetch options specific to this path pattern |

### Path Matching

The `pattern` property can be either:

1. A string - matched using `imagePath.includes(pattern)`
2. A RegExp - matched using `pattern.test(imagePath)`

For RegExp patterns in wrangler.jsonc, remember to escape backslashes:

```javascript
"pattern": "\\/api\\/images\\/(.*)"
```

## Example Configuration

Here's a comprehensive example showing path-based origins for different content types:

```javascript
"PATH_BASED_ORIGINS": {
  "productImages": {
    "pattern": "products/",
    "priority": ["remote", "r2", "fallback"],
    "remoteUrl": "https://products.example.com/images",
    "remoteAuth": {
      "enabled": true,
      "type": "bearer",
      "tokenHeaderName": "Authorization",
      "tokenSecret": "${PRODUCT_API_TOKEN}"
    },
    "fetchOptions": {
      "headers": {
        "X-Product-API": "true"
      }
    }
  },
  "userUploads": {
    "pattern": "uploads/",
    "priority": ["r2", "fallback"],
    "r2": {
      "enabled": true,
      "bindingName": "USER_UPLOADS_BUCKET"
    },
    "pathTransforms": {
      "uploads": {
        "prefix": "user-content/",
        "removePrefix": true
      }
    }
  },
  "staticAssets": {
    "pattern": "assets/",
    "priority": ["remote"],
    "remoteUrl": "https://cdn.example.com/static",
    "auth": {
      "useOriginAuth": false,
      "sharePublicly": true
    }
  }
}
```

## Authentication in Path-Based Origins

Path-based origins support the same extensive authentication options available at the top level. This allows you to customize authentication methods for different content types or sources.

### Authentication Inheritance

Authentication settings follow these inheritance rules:

1. Path-specific `remoteAuth` overrides top-level `remoteAuth`
2. Path-specific `fallbackAuth` overrides top-level `fallbackAuth` 
3. Path-specific `auth` overrides top-level `auth`
4. Any settings not specified in the path configuration inherit from top-level config

For example, if you specify only `type` and `tokenHeaderName` in a path-specific `remoteAuth`, all other parameters (like `region` or `signedUrlExpiration`) will inherit from the top-level configuration.

### Authentication Options per Path

Each path can have its own authentication configuration:

```javascript
"PATH_BASED_ORIGINS": {
  "secureApi": {
    "pattern": "api/",
    "priority": ["remote"],
    "remoteUrl": "https://api.example.com",
    "remoteAuth": {
      "enabled": true,
      "type": "bearer",
      "tokenHeaderName": "Authorization",
      "tokenSecret": "${API_TOKEN}" // Set using environment variable
    }
  },
  "s3Content": {
    "pattern": "s3/",
    "priority": ["remote"],
    "remoteUrl": "https://bucket.s3.amazonaws.com",
    "remoteAuth": {
      "enabled": true,
      "type": "aws-s3",
      "region": "us-east-1",
      "service": "s3",
      "accessKeyVar": "AWS_ACCESS_KEY_ID",
      "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
    }
  },
  "publicCdn": {
    "pattern": "cdn/",
    "priority": ["remote"],
    "remoteUrl": "https://cdn.example.com",
    "remoteAuth": {
      "enabled": false // Explicitly disable auth for public content
    }
  },
  "customHeaders": {
    "pattern": "custom/",
    "priority": ["remote"],
    "remoteUrl": "https://custom.example.com",
    "remoteAuth": {
      "enabled": true,
      "type": "header",
      "headers": {
        "X-API-Key": "${CUSTOM_API_KEY}",
        "X-Client-ID": "image-resizer"
      }
    }
  },
  "privateUploads": {
    "pattern": "private/",
    "priority": ["r2"],
    "auth": {
      "useOriginAuth": true,
      "sharePublicly": false,
      "securityLevel": "strict"
    }
  }
}
```

### Combining with Global Authentication

You can configure global authentication at the top level, and then override specific settings for particular paths:

```javascript
// Top-level storage configuration (applied to all paths without overrides)
"storage": {
  "remoteAuth": {
    "enabled": true,
    "type": "bearer",
    "tokenHeaderName": "Authorization",
    "tokenSecret": "${GLOBAL_API_TOKEN}"
  },
  "auth": {
    "useOriginAuth": true,
    "sharePublicly": true,
    "securityLevel": "permissive"
  },
  
  // Path-specific overrides
  "pathBasedOrigins": {
    "sensitiveData": {
      "pattern": "sensitive/",
      "auth": {
        "sharePublicly": false,  // Override just this setting
        "securityLevel": "strict" // Override just this setting
      }
    }
  }
}
```

For a comprehensive set of authentication examples including various authentication types and inheritance patterns, see our [complete authentication configuration example](../examples/path-based-origins.jsonc).

## Multiple R2 Buckets

When using path-based origins with multiple R2 buckets, you'll need to define those buckets in your wrangler.jsonc:

```javascript
"r2_buckets": [
  {
    "binding": "IMAGES_BUCKET",
    "bucket_name": "main-images",
    "preview_bucket_name": "main-images-dev"
  },
  {
    "binding": "USER_UPLOADS_BUCKET",
    "bucket_name": "user-uploads",
    "preview_bucket_name": "user-uploads-dev" 
  }
]
```

Then reference the correct binding in your path-based origin configuration:

```javascript
"userUploads": {
  "pattern": "uploads/",
  "priority": ["r2"],
  "r2": {
    "enabled": true,
    "bindingName": "USER_UPLOADS_BUCKET"
  }
}
```

## Common Use Cases

### Multi-Tenant Setup

```javascript
"tenantA": {
  "pattern": "tenant-a/",
  "priority": ["r2"],
  "r2": {
    "enabled": true,
    "bindingName": "TENANT_A_BUCKET"
  }
},
"tenantB": {
  "pattern": "tenant-b/",
  "priority": ["r2"],
  "r2": {
    "enabled": true,
    "bindingName": "TENANT_B_BUCKET"
  }
}
```

### Mixed Storage Strategy

```javascript
"frequentContent": {
  "pattern": "frequent/",
  "priority": ["r2"],
  "r2": {
    "enabled": true,
    "bindingName": "HOT_STORAGE_BUCKET"
  }
},
"archiveContent": {
  "pattern": "archive/",
  "priority": ["remote"],
  "remoteUrl": "https://cold-storage.example.com",
  "remoteAuth": {
    "enabled": true,
    "type": "aws-s3"
  }
}
```

### Migration Strategy

```javascript
"legacyImages": {
  "pattern": "legacy/",
  "priority": ["remote", "r2"],
  "remoteUrl": "https://old-system.example.com/images",
  "remoteAuth": {
    "enabled": true,
    "type": "bearer"
  }
},
"newImages": {
  "pattern": "new/",
  "priority": ["r2"],
  "r2": {
    "enabled": true,
    "bindingName": "NEW_SYSTEM_BUCKET"
  }
}
```

## Behavior Notes

1. **First Match Wins**: The system uses the first path pattern that matches the request path.
2. **Default Fallback**: If no path patterns match, the system falls back to the global storage configuration (top-level `remoteUrl` and `fallbackUrl`).
3. **Configuration Merging**: Path-specific configuration is merged with top-level configuration, with path-specific values taking precedence.
4. **Storage Priority Control**: Each path can define its own storage priority order, allowing different fetch strategies per content type.
5. **Circuit Breaker Integration**: Path-based origins still benefit from circuit breaker and failure detection mechanisms.
6. **Debug Information**: When using path-based origins, debug logging will include information about which path pattern was matched and which configuration was used.

## Implementation Details

The path-based origin functionality is implemented in the `DefaultStorageService` class, which:

1. Checks for matching path patterns in the `getEffectiveStoragePriority` method
2. Creates specialized configuration objects for each storage type in the `fetchImage` method
3. Applies path-specific settings like authentication, transforms, and fetch options

## Performance Considerations

Path-based origins add minimal overhead to the request processing pipeline, typically less than 1ms per request. The pattern matching is optimized to quickly identify the appropriate origin configuration.

For string patterns, consider using distinctive path segments that allow for simple string matching rather than complex regex patterns that might be more expensive to evaluate.

## Examples

For complete working examples:

- [Path-Based Origins Practical Example](../examples/path-based-origins-example.md) - Step-by-step walkthrough with real-world scenarios
- [Comprehensive Authentication Configuration](../examples/path-based-origins.jsonc) - Complete example with all authentication methods