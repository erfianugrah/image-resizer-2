# Authentication and Path-Based Origins Configuration

This example demonstrates how to configure authentication and path-based origins for the Image Resizer.

## Overview

Path-based origins allow you to route requests to different storage sources based on URL path patterns. This is useful for organizing images by type (products, profiles, blog posts, etc.) and using different storage solutions for each type.

Authentication configuration allows you to secure access to your images using various authentication methods like API keys, AWS S3 authentication, and bearer tokens.

## Example Configuration

```json
{
  "_meta": {
    "version": "1.0.0",
    "lastUpdated": "2025-03-30T08:30:00.000Z",
    "activeModules": ["core", "storage", "transform", "cache"]
  },
  "modules": {
    "core": {
      "_meta": {
        "name": "core",
        "version": "1.0.0",
        "description": "Core configuration module"
      },
      "config": {
        "environment": "production",
        "version": "1.0.0",
        "debug": {
          "enabled": true,
          "headers": ["cache", "mode"],
          "allowedEnvironments": [],
          "verbose": true,
          "includePerformance": true
        },
        "logging": {
          "level": "DEBUG",
          "includeTimestamp": true,
          "enableStructuredLogs": true,
          "enableBreadcrumbs": true
        }
      }
    },
    "storage": {
      "_meta": {
        "name": "storage",
        "version": "1.0.0",
        "description": "Storage configuration module"
      },
      "config": {
        "priority": ["r2", "remote", "fallback"],
        "r2": {
          "enabled": true,
          "bindingName": "IMAGES_BUCKET"
        },
        "fetchOptions": {
          "userAgent": "Cloudflare-Image-Resizer/1.0-PROD",
          "headers": {
            "Accept": "image/*"
          }
        },
        "remoteUrl": "https://example.r2.cloudflarestorage.com/images-bucket",
        "remoteAuth": {
          "enabled": true,
          "type": "aws-s3",
          "region": "us-east-1",
          "service": "s3",
          "accessKeyVar": "AWS_ACCESS_KEY_ID",
          "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
        },
        "fallbackUrl": "https://cdn.example.com",
        "fallbackAuth": {
          "enabled": false,
          "type": "bearer",
          "tokenHeaderName": "Authorization"
        },
        "auth": {
          "useOriginAuth": true,
          "sharePublicly": true,
          "securityLevel": "strict",
          "cacheTtl": 86400,
          "origins": {
            "secure": {
              "domain": "secure-images.example.com",
              "type": "bearer",
              "tokenHeaderName": "Authorization",
              "tokenExpiration": 3600
            },
            "s3": {
              "domain": "s3.amazonaws.com",
              "type": "aws-s3",
              "region": "us-east-1",
              "service": "s3",
              "accessKeyVar": "AWS_ACCESS_KEY_ID",
              "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
            },
            "api": {
              "domain": "api-images.example.com",
              "type": "header",
              "headers": {
                "X-API-Key": "${API_KEY}"
              }
            }
          }
        },
        "pathBasedOrigins": {
          "products": {
            "pattern": "/products/.*",
            "priority": ["r2", "remote"],
            "r2": {
              "enabled": true,
              "bindingName": "PRODUCTS_BUCKET"
            },
            "remoteUrl": "https://products.example.com/images",
            "remoteAuth": {
              "enabled": true,
              "type": "aws-s3",
              "region": "us-east-1",
              "service": "s3",
              "accessKeyVar": "PRODUCTS_AWS_ACCESS_KEY_ID",
              "secretKeyVar": "PRODUCTS_AWS_SECRET_ACCESS_KEY"
            },
            "pathTransforms": {
              "products": {
                "prefix": "product-images",
                "removePrefix": true
              }
            }
          },
          "profiles": {
            "pattern": "/profiles/.*",
            "priority": ["r2", "remote"],
            "r2": {
              "enabled": true,
              "bindingName": "PROFILES_BUCKET"
            },
            "remoteUrl": "https://profiles.example.com/avatars",
            "remoteAuth": {
              "enabled": false
            },
            "pathTransforms": {
              "profiles": {
                "prefix": "avatars",
                "removePrefix": true
              }
            }
          },
          "blog": {
            "pattern": "/blog/.*",
            "priority": ["remote", "r2"],
            "remoteUrl": "https://blog-media.example.com",
            "remoteAuth": {
              "enabled": true,
              "type": "header",
              "headers": {
                "X-API-Key": "${BLOG_API_KEY}"
              }
            },
            "r2": {
              "enabled": true,
              "bindingName": "BLOG_BUCKET"
            },
            "pathTransforms": {
              "blog": {
                "prefix": "media",
                "removePrefix": true
              }
            }
          },
          "static": {
            "pattern": "/static/.*",
            "priority": ["r2"],
            "r2": {
              "enabled": true,
              "bindingName": "STATIC_BUCKET"
            },
            "pathTransforms": {
              "static": {
                "prefix": "",
                "removePrefix": true
              }
            }
          }
        }
      }
    },
    "transform": {
      "_meta": {
        "name": "transform",
        "version": "1.0.0",
        "description": "Transformation configuration module"
      },
      "config": {
        "responsive": {
          "breakpoints": [320, 640, 768, 1024, 1440, 1920, 2048],
          "deviceWidths": {
            "mobile": 480,
            "tablet": 768,
            "desktop": 1440
          },
          "quality": 85,
          "fit": "scale-down",
          "format": "auto",
          "metadata": "none"
        }
      }
    },
    "cache": {
      "_meta": {
        "name": "cache",
        "version": "1.0.0",
        "description": "Cache configuration module"
      },
      "config": {
        "method": "cf",
        "ttl": {
          "ok": 604800,
          "clientError": 60,
          "serverError": 10
        },
        "cacheEverything": true,
        "pathBasedTtl": {
          "/products/": 86400,
          "/profiles/": 1209600,
          "/blog/": 86400,
          "/static/": 2592000
        }
      }
    }
  }
}
```

## Key Features

### Authentication Types

This configuration demonstrates several authentication methods:

1. **Bearer Token Authentication**:
   - Used for secure-images.example.com
   - Requires Authorization header with a bearer token
   - Token expires after 3600 seconds (1 hour)

2. **AWS S3 Authentication**:
   - Used for S3 storage
   - Uses AWS Signature Version 4 for authentication
   - Credentials stored in environment variables

3. **API Key Authentication**:
   - Used for API-based image sources
   - Requires X-API-Key header
   - Value can be pulled from environment variables

### Path-Based Origins

The configuration routes requests based on URL path patterns:

1. **Product Images** (`/products/...`):
   - Stored primarily in R2 bucket "PRODUCTS_BUCKET"
   - Falls back to a remote URL
   - Removes "/products/" prefix and adds "product-images" prefix

2. **Profile Images** (`/profiles/...`):
   - Stored primarily in R2 bucket "PROFILES_BUCKET"
   - Falls back to a remote URL
   - Removes "/profiles/" prefix and adds "avatars" prefix

3. **Blog Images** (`/blog/...`):
   - Stored primarily on a remote server
   - Falls back to R2 bucket "BLOG_BUCKET"
   - Removes "/blog/" prefix and adds "media" prefix

4. **Static Assets** (`/static/...`):
   - Stored exclusively in R2 bucket "STATIC_BUCKET"
   - Removes "/static/" prefix with no additional prefix

## Path Transformation

Path transforms allow you to map URL paths to different storage paths:

```json
"pathTransforms": {
  "products": {
    "prefix": "product-images",
    "removePrefix": true
  }
}
```

For example, with this configuration:
- Request: `/products/abc123.jpg`
- Transformed path: `product-images/abc123.jpg`

## Security Considerations

1. **Environment Variables**: Sensitive information like API keys and AWS credentials are stored in environment variables for security.
2. **TTL for Authentication**: Authentication tokens are cached for efficiency but expire after the configured TTL.
3. **Origin-Specific Auth**: Each origin can have its own authentication method.

## Related Documentation

- [Storage Authentication](../../storage/authentication.md)
- [Path Transforms](../../storage/path-transforms.md)
- [Path-Based Origins](../../storage/path-based-origins.md)
- [Cache TTL Configuration](../../caching/index.md)