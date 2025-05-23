# Comprehensive Configuration Example

This example provides a complete configuration with all available options and detailed comments explaining each setting.

## Configuration Structure

The configuration follows this structure:

```
{
  "_meta": { ... },         // Configuration metadata
  "modules": {              // Configuration modules
    "core": { ... },        // Core settings
    "storage": { ... },     // Storage settings
    "transform": { ... },   // Transformation settings
    "cache": { ... }        // Cache settings
  }
}
```

## Example Configuration

Below is a comprehensive example with detailed comments explaining each setting:

```jsonc
{
  /**
   * Configuration System Metadata
   * Contains information about the overall configuration.
   */
  "_meta": {
    // Version of the overall configuration schema
    "version": "1.0.0",
    
    // When the configuration was last updated
    "lastUpdated": "2025-03-30T08:30:00.000Z",
    
    // List of modules that are currently active
    "activeModules": ["core", "storage", "transform", "cache"]
  },
  
  /**
   * Configuration Modules
   * Each module is a self-contained configuration section.
   */
  "modules": {
    /**
     * Core Module
     * Contains fundamental settings for the service.
     */
    "core": {
      "_meta": {
        "name": "core",
        "version": "1.0.0",
        "description": "Core configuration module"
      },
      "config": {
        // Environment the service is running in
        "environment": "production",
        
        // Version of the service
        "version": "1.0.0",
        
        // Debug settings
        "debug": {
          // Whether debug mode is enabled
          "enabled": true,
          
          // Headers to include in debug output
          "headers": ["cache", "mode"],
          
          // Environments where debug is allowed
          "allowedEnvironments": [],
          
          // Whether to include verbose debug information
          "verbose": true,
          
          // Whether to include performance metrics in debug output
          "includePerformance": true
        },
        
        // Logging settings
        "logging": {
          // Log level (DEBUG, INFO, WARN, ERROR)
          "level": "DEBUG",
          
          // Whether to include timestamp in log output
          "includeTimestamp": true,
          
          // Whether to use structured logging format
          "enableStructuredLogs": true,
          
          // Whether to include breadcrumbs for request tracing
          "enableBreadcrumbs": true
        }
      }
    },
    
    /**
     * Storage Module
     * Configuration for storage providers and access.
     */
    "storage": {
      "_meta": {
        "name": "storage",
        "version": "1.0.0",
        "description": "Storage configuration module"
      },
      "config": {
        // Priority order for storage providers
        "priority": ["r2", "remote", "fallback"],
        
        // R2 storage configuration
        "r2": {
          "enabled": true,
          "bindingName": "IMAGES_BUCKET"
        },
        
        // Options for fetch requests
        "fetchOptions": {
          "userAgent": "Cloudflare-Image-Resizer/1.0-PROD",
          "headers": {
            "Accept": "image/*"
          }
        },
        
        // Remote storage URL
        "remoteUrl": "https://example.r2.cloudflarestorage.com/images-bucket",
        
        // Authentication for remote storage
        "remoteAuth": {
          "enabled": true,
          "type": "aws-s3",
          "region": "us-east-1",
          "service": "s3",
          // Environment variables for access credentials
          "accessKeyVar": "AWS_ACCESS_KEY_ID",
          "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
        },
        
        // Fallback URL if primary sources fail
        "fallbackUrl": "https://cdn.example.com",
        
        // Authentication for fallback storage
        "fallbackAuth": {
          "enabled": false,
          "type": "bearer",
          "tokenHeaderName": "Authorization"
        },
        
        // Authentication settings
        "auth": {
          // Whether to use origin-specific authentication
          "useOriginAuth": true,
          
          // Whether to make images publicly accessible
          "sharePublicly": true,
          
          // Security level for access control
          "securityLevel": "strict",
          
          // Cache TTL for authentication tokens
          "cacheTtl": 86400,
          
          // Origin-specific authentication settings
          "origins": {
            // Secure origin with bearer token auth
            "secure": {
              "domain": "secure-images.example.com",
              "type": "bearer",
              "tokenHeaderName": "Authorization",
              "tokenExpiration": 3600
            },
            
            // S3 origin with AWS auth
            "s3": {
              "domain": "s3.amazonaws.com",
              "type": "aws-s3",
              "region": "us-east-1",
              "service": "s3",
              "accessKeyVar": "AWS_ACCESS_KEY_ID",
              "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
            },
            
            // API origin with key-based auth
            "api": {
              "domain": "api-images.example.com",
              "type": "header",
              "headers": {
                // Use environment variable for API key
                "X-API-Key": "${API_KEY}"
              }
            }
          }
        },
        
        /**
         * Path-Based Origins
         * Configure different storage sources based on URL path patterns.
         */
        "pathBasedOrigins": {
          // Product images configuration
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
          
          // Profile/avatar images configuration
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
          
          // Blog images configuration
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
          
          // Static assets configuration
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
    
    /**
     * Transform Module
     * Configuration for image transformation operations.
     */
    "transform": {
      "_meta": {
        "name": "transform",
        "version": "1.0.0",
        "description": "Transformation configuration module"
      },
      "config": {
        // Responsive image configuration
        "responsive": {
          // Supported breakpoints for responsive images
          "breakpoints": [320, 640, 768, 1024, 1440, 1920, 2048],
          
          // Device-specific widths
          "deviceWidths": {
            "mobile": 480,
            "tablet": 768,
            "desktop": 1440
          },
          
          // Default quality setting
          "quality": 85,
          
          // Default fit mode
          "fit": "scale-down",
          
          // Default output format
          "format": "auto",
          
          // Metadata handling
          "metadata": "none",
          
          // Format-specific quality settings
          "formatQuality": {
            "webp": 85,
            "avif": 80,
            "jpeg": 85,
            "png": 90
          }
        },
        
        /**
         * Image Derivatives
         * Predefined transformation presets for common use cases.
         */
        "derivatives": {
          // Thumbnail preset
          "thumbnail": {
            "width": 200,
            "height": 200,
            "fit": "cover",
            "quality": 80
          },
          
          // Avatar preset
          "avatar": {
            "width": 150,
            "height": 150,
            "fit": "cover",
            "quality": 85
          },
          
          // Product image preset
          "product": {
            "width": 800,
            "height": 800,
            "fit": "contain",
            "background": "white",
            "quality": 90
          },
          
          // Header image preset
          "header": {
            "width": 1200,
            "height": 400,
            "fit": "cover",
            "quality": 85
          },
          
          // Blog image preset
          "blog": {
            "width": 1200,
            "height": 675,
            "fit": "cover",
            "quality": 85
          }
        }
      }
    },
    
    /**
     * Cache Module
     * Configuration for caching behavior.
     */
    "cache": {
      "_meta": {
        "name": "cache",
        "version": "1.0.0",
        "description": "Cache configuration module"
      },
      "config": {
        // Caching method ("cf" for Cloudflare)
        "method": "cf",
        
        // TTL settings for different response types
        "ttl": {
          "ok": 604800,            // 7 days for successful responses
          "clientError": 60,       // 1 minute for client errors
          "serverError": 10        // 10 seconds for server errors
        },
        
        // Whether to cache all content types
        "cacheEverything": true,
        
        // Use different TTLs based on status code
        "useTtlByStatus": true,
        
        // Status code based TTL configuration
        "cacheTtlByStatus": {
          "200-299": 604800,       // 7 days for success codes
          "301-302": 86400,        // 1 day for redirects
          "404": 60,               // 1 minute for not found
          "500-599": 10            // 10 seconds for server errors
        },
        
        // Whether content is cacheable
        "cacheability": true,
        
        // Parameters that bypass cache
        "bypassParams": ["nocache", "refresh"],
        
        // Path-specific TTL settings
        "pathBasedTtl": {
          "/products/": 86400,     // 1 day for products
          "/profiles/": 1209600,   // 2 weeks for profiles
          "/blog/": 86400,         // 1 day for blog
          "/static/": 2592000      // 30 days for static assets
        },
        
        // Cache tags configuration
        "cacheTags": {
          "enabled": true,
          "prefix": "img-",
          
          // Whether to include image dimensions in cache tags
          "includeImageDimensions": true,
          
          // Whether to include format in cache tags
          "includeFormat": true,
          
          // Whether to include quality in cache tags
          "includeQuality": true,
          
          // Whether to include derivative info in cache tags
          "includeDerivative": true,
          
          // Path-specific cache tags
          "pathBasedTags": {
            "/products/": ["product", "catalog"],
            "/profiles/": ["profile", "avatar"],
            "/blog/": ["blog", "content"],
            "/static/": ["static", "assets"]
          }
        }
      }
    }
  }
}
```

## Using the Configuration

To use this configuration, you can post it to the Configuration API using the curl command:

```bash
curl -X POST "https://your-worker.example.com/api/config" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "config": { /* Configuration JSON */ },
    "comment": "Comprehensive configuration setup",
    "author": "developer"
  }'
```

## Runnable Version

A runnable version of this configuration (without comments) is available in the examples directory as `comprehensive-config-runnable.json`.

## Related Documentation

- [Configuration API](../api.md)
- [Getting Started with Configuration](../getting-started.md)
- [Migration Guide](../migration-guide.md)