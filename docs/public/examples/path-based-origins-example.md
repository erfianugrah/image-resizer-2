# Path-Based Origins Example

This document provides a practical example of how to implement path-based origins in your Image Resizer configuration. It demonstrates how different URL paths can be routed to different storage sources with custom configurations.

## Example Scenario

Let's implement a configuration for an e-commerce application with the following requirements:

1. **Product Images**: Stored in a dedicated product API system
2. **User Uploads**: Stored in R2 with strict privacy controls
3. **Marketing Assets**: Stored in a CDN for fast global access
4. **Profile Pictures**: Stored in R2 with different path mapping

## Configuration

Here's the complete configuration for our scenario:

```jsonc
{
  "storage": {
    // Default/top-level configuration (used when no path pattern matches)
    "priority": ["r2", "remote", "fallback"],
    "remoteUrl": "https://default.example.com/images",
    "fallbackUrl": "https://backup.example.com/images",
    "r2": {
      "enabled": true,
      "bindingName": "MAIN_IMAGES_BUCKET"
    },
    "fetchOptions": {
      "userAgent": "Cloudflare-Image-Resizer/1.0"
    },
    
    // Path-based origins for specific content types
    "pathBasedOrigins": {
      "productImages": {
        "pattern": "products/",
        "priority": ["remote", "fallback"],
        "remoteUrl": "https://product-api.example.com/images",
        "remoteAuth": {
          "enabled": true,
          "type": "bearer",
          "tokenHeaderName": "Authorization"
        },
        "fetchOptions": {
          "headers": {
            "X-API-Version": "2.0"
          }
        }
      },
      "userUploads": {
        "pattern": "uploads/",
        "priority": ["r2"],
        "r2": {
          "enabled": true,
          "bindingName": "USER_UPLOADS_BUCKET"
        },
        "auth": {
          "useOriginAuth": true,
          "sharePublicly": false,
          "securityLevel": "strict"
        },
        "pathTransforms": {
          "uploads": {
            "prefix": "user-content/",
            "removePrefix": true
          }
        }
      },
      "marketingAssets": {
        "pattern": "marketing/",
        "priority": ["remote"],
        "remoteUrl": "https://cdn.example.com/marketing",
        "auth": {
          "useOriginAuth": false,
          "sharePublicly": true
        }
      },
      "profilePictures": {
        "pattern": "profiles/",
        "priority": ["r2", "fallback"],
        "pathTransforms": {
          "profiles": {
            "prefix": "avatars/",
            "removePrefix": true
          }
        }
      }
    }
  }
}
```

## How It Works With Top-Level URLs

Let's trace the request flow for different URL patterns to see how path-based origins and top-level URLs interact:

### Example 1: Product Image Request with Authentication

**Request URL**: `/products/shirt-123.jpg`

1. Path pattern `products/` matches
2. Uses product-specific configuration:
   - Priority: `["remote", "fallback"]` (Note: R2 is skipped)
   - Remote URL: `https://product-api.example.com/images`
   - Auth: Path-specific Bearer token authentication (overrides top-level auth)
3. Final fetch URL: `https://product-api.example.com/images/shirt-123.jpg`
4. Headers include: `Authorization: Bearer <token>` and `X-API-Version: 2.0`
5. Authentication details:
   - Token is obtained from environment variable or config
   - Headers are properly signed for the API
   - Authentication headers are not cached (defined by auth settings)

### Example 2: User Upload Request

**Request URL**: `/uploads/user-file.png`

1. Path pattern `uploads/` matches
2. Uses upload-specific configuration:
   - Priority: `["r2"]` (Only R2 is used)
   - R2 Bucket: `USER_UPLOADS_BUCKET` (not the default bucket)
   - Path transformation: removes `uploads/` prefix, adds `user-content/` prefix
3. Final R2 key: `user-content/user-file.png`
4. Strict origin auth is applied

### Example 3: Marketing Asset Request

**Request URL**: `/marketing/campaign/banner.jpg`

1. Path pattern `marketing/` matches
2. Uses marketing-specific configuration:
   - Priority: `["remote"]` (Only remote is used)
   - Remote URL: `https://cdn.example.com/marketing`
   - Public access (no auth)
3. Final fetch URL: `https://cdn.example.com/marketing/campaign/banner.jpg`

### Example 4: Profile Picture Request

**Request URL**: `/profiles/user-123.jpg`

1. Path pattern `profiles/` matches
2. Uses profile-specific configuration:
   - Priority: `["r2", "fallback"]` (Try R2 first, then fallback)
   - Uses default R2 bucket: `MAIN_IMAGES_BUCKET` (inherits from top-level config)
   - Path transformation: removes `profiles/` prefix, adds `avatars/` prefix
3. Final R2 key: `avatars/user-123.jpg`
4. If not found in R2, falls back to default fallback URL

### Example 5: Non-Matching Path

**Request URL**: `/misc/icon.svg`

1. No path pattern matches
2. Falls back to top-level configuration:
   - Priority: `["r2", "remote", "fallback"]`
   - Remote URL: `https://default.example.com/images`
   - Fallback URL: `https://backup.example.com/images`
3. First tries R2 with key: `misc/icon.svg`
4. If not found, tries Remote URL: `https://default.example.com/images/misc/icon.svg`
5. If still not found, tries Fallback URL: `https://backup.example.com/images/misc/icon.svg`

## Setting Up in wrangler.jsonc

```jsonc
{
  "vars": {
    // Top-level configuration
    "REMOTE_URL": "https://default.example.com/images",
    "FALLBACK_URL": "https://backup.example.com/images",
    "STORAGE_PRIORITY": "r2,remote,fallback",
    
    // Path-based origins configuration
    "PATH_BASED_ORIGINS": {
      "productImages": {
        "pattern": "products/",
        "priority": ["remote", "fallback"],
        "remoteUrl": "https://product-api.example.com/images",
        "remoteAuth": {
          "enabled": true,
          "type": "bearer",
          "tokenHeaderName": "Authorization",
          "tokenSecret": "" // Set using wrangler secret
        },
        "fetchOptions": {
          "headers": {
            "X-API-Version": "2.0"
          }
        }
      },
      "userUploads": {
        "pattern": "uploads/",
        "priority": ["r2"],
        "r2": {
          "enabled": true,
          "bindingName": "USER_UPLOADS_BUCKET"
        },
        "auth": {
          "useOriginAuth": true,
          "sharePublicly": false,
          "securityLevel": "strict"
        },
        "pathTransforms": {
          "uploads": {
            "prefix": "user-content/",
            "removePrefix": true
          }
        }
      },
      "marketingAssets": {
        "pattern": "marketing/",
        "priority": ["remote"],
        "remoteUrl": "https://cdn.example.com/marketing",
        "auth": {
          "useOriginAuth": false,
          "sharePublicly": true
        }
      },
      "profilePictures": {
        "pattern": "profiles/",
        "priority": ["r2", "fallback"],
        "pathTransforms": {
          "profiles": {
            "prefix": "avatars/",
            "removePrefix": true
          }
        }
      }
    }
  },
  "r2_buckets": [
    {
      "binding": "MAIN_IMAGES_BUCKET",
      "bucket_name": "main-images"
    },
    {
      "binding": "USER_UPLOADS_BUCKET",
      "bucket_name": "user-uploads"
    }
  ]
}
```

## Best Practices

1. **Start with Default Configuration**: Define top-level URLs, auth settings, and storage priority first
2. **Add Path-Specific Overrides**: Only override the necessary settings for each path
3. **Use Clear Path Patterns**: Make path patterns distinctive and easy to understand
4. **Document Your Path Structure**: Create clear documentation about which paths go to which origins
5. **Layer Authentication Properly**: Configure default auth at the top level, then override only what's different for specific paths
6. **Test Thoroughly**: Test each path pattern to ensure it routes to the correct origin with proper authentication
7. **Manage Secrets Properly**: Store auth tokens and secrets in environment variables, never in code
8. **Consider Cache Implications**: Remember that authentication settings can affect cache behavior

## Authentication Inheritance Example

Let's look at how authentication settings are inherited and overridden across different paths:

```javascript
// Top-level (global) configuration
"storage": {
  "remoteAuth": {
    "enabled": true,
    "type": "bearer",
    "tokenHeaderName": "Authorization",
    "tokenSecret": "${GLOBAL_API_TOKEN}",
    "region": "us-east-1",
    "service": "s3"
  },
  
  // Path-based origins with different auth inheritance patterns
  "pathBasedOrigins": {
    "completeOverride": {
      "pattern": "override/",
      "remoteUrl": "https://api.example.com",
      "remoteAuth": {
        // Complete replacement of all remoteAuth settings
        "enabled": true,
        "type": "header",
        "headers": {
          "X-Api-Key": "${CUSTOM_API_KEY}"
        }
      }
    },
    "partialOverride": {
      "pattern": "partial/",
      "remoteUrl": "https://partial.example.com",
      "remoteAuth": {
        // Only override specific properties
        "type": "aws-s3",
        // region and service inherited from top-level (us-east-1, s3)
      }
    },
    "disableAuth": {
      "pattern": "public/",
      "remoteUrl": "https://public.example.com",
      "remoteAuth": {
        // Explicitly disable auth for this path
        "enabled": false
      }
    },
    "noOverride": {
      "pattern": "inherit/",
      "remoteUrl": "https://inherit.example.com"
      // No remoteAuth specified - inherits ALL top-level settings
    }
  }
}
```

### Authentication Resolution Flow

For a request to `/partial/image.jpg`:

1. System finds a match with the `partial/` pattern
2. Resolves the final authentication configuration:
   - From path config: `type: "aws-s3"`
   - Inherited from top-level: `enabled: true, region: "us-east-1", service: "s3"`
   - Result: AWS S3 authentication with region us-east-1
3. Applies the authentication when fetching from `https://partial.example.com/image.jpg`

For a request to `/inherit/image.jpg`:

1. System finds a match with the `inherit/` pattern
2. No auth overrides specified in path config
3. Inherits complete top-level auth: Bearer token with Authorization header
4. Applies the authentication when fetching from `https://inherit.example.com/image.jpg`

## Debugging

When troubleshooting, enable debug headers to see which path pattern matched and which authentication method was used:

```
X-Debug-Path-Match: productImages
X-Debug-Source-Type: remote
X-Debug-Remote-URL: https://product-api.example.com/images/shirt-123.jpg
X-Debug-Auth-Method: bearer
X-Debug-Auth-Headers: [redacted]
```

You can also check the logs for detailed information about path matching, storage source selection, and authentication resolution.

---

*Last Updated: March 28, 2025*