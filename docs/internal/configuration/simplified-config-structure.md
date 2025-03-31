# Simplified Configuration Structure

This document describes the new simplified configuration structure for the Image Resizer. This structure aims to reduce complexity while maintaining all the functionality of the original configuration.

## Goals

- **Reduce complexity** by organizing settings logically
- **Improve discoverability** of configuration options
- **Maintain compatibility** with existing implementations
- **Support gradual migration** from legacy to simplified configuration

## Structure Overview

The simplified configuration structure organizes settings into logical modules:

```
{
  "core": {
    // Core system settings
  },
  "storage": {
    // Storage and origin settings
    "pathBasedOrigins": {
      // Path-based origin routing
    }
  },
  "transform": {
    // Image transformation settings
    "derivatives": {
      // Derivative definitions
    }
  },
  "cache": {
    // Caching configuration
  },
  "client": {
    // Client detection settings
  },
  "security": {
    // Security settings
  },
  "monitoring": {
    // Monitoring and logging
  }
}
```

## Module Descriptions

### Core Module

The `core` module contains fundamental system settings:

```json
{
  "core": {
    "environment": "production",
    "version": "1.0.0",
    "debug": {
      "enabled": false,
      "headers": ["cache", "mode"],
      "allowedEnvironments": [],
      "verbose": false,
      "includePerformance": true
    },
    "logging": {
      "level": "INFO",
      "includeTimestamp": true,
      "enableStructuredLogs": true,
      "enableBreadcrumbs": true
    },
    "features": {
      "enableAkamaiCompatibility": false
    }
  }
}
```

### Storage Module

The `storage` module configures where and how images are stored:

```json
{
  "storage": {
    "priority": ["r2", "remote", "fallback"],
    "r2": {
      "enabled": true,
      "bindingName": "IMAGES_BUCKET"
    },
    "remoteUrl": "https://source-images.example.com",
    "remoteAuth": {
      "enabled": true,
      "type": "aws-s3",
      "accessKeyVar": "AWS_ACCESS_KEY_ID",
      "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
    },
    "fallbackUrl": "https://fallback-images.example.com",
    "fallbackAuth": {
      "enabled": false,
      "type": "bearer"
    },
    "auth": {
      "useOriginAuth": true,
      "sharePublicly": true,
      "origins": {
        // Origin-specific auth configurations
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
          "accessKeyVar": "PRODUCTS_AWS_ACCESS_KEY_ID",
          "secretKeyVar": "PRODUCTS_AWS_SECRET_ACCESS_KEY"
        },
        "pathTransforms": {
          "products": {
            "prefix": "product-images",
            "removePrefix": true
          }
        }
      }
    }
  }
}
```

### Transform Module

The `transform` module configures image transformation settings:

```json
{
  "transform": {
    "responsive": {
      "breakpoints": [320, 640, 768, 1024, 1440],
      "deviceWidths": {
        "mobile": 480,
        "tablet": 768,
        "desktop": 1440
      },
      "quality": 85,
      "fit": "scale-down",
      "format": "auto",
      "metadata": "none",
      "formatQuality": {
        "webp": 85,
        "avif": 80,
        "jpeg": 85,
        "png": 90
      }
    },
    "derivatives": {
      "thumbnail": {
        "width": 200,
        "height": 200,
        "fit": "cover",
        "quality": 80
      },
      "avatar": {
        "width": 150,
        "height": 150,
        "fit": "cover",
        "quality": 85
      }
    },
    "metadata": {
      "enabled": true,
      "cacheTtl": 3600,
      "allowClientSpecifiedTargets": true,
      "platformPresets": {
        "twitter": {
          "aspectRatio": { "width": 16, "height": 9 }
        }
      }
    }
  }
}
```

### Cache Module

The `cache` module configures caching behavior:

```json
{
  "cache": {
    "method": "cf",
    "ttl": {
      "ok": 86400,
      "clientError": 60,
      "serverError": 10
    },
    "cacheEverything": true,
    "useTtlByStatus": true,
    "cacheTtlByStatus": {
      "200-299": 86400,
      "301-302": 3600,
      "404": 60,
      "500-599": 10
    },
    "cacheability": true,
    "bypassParams": ["nocache", "refresh"],
    "pathBasedTtl": {
      "/products/": 86400,
      "/profiles/": 1209600,
      "/blog/": 86400,
      "/static/": 2592000
    },
    "cacheTags": {
      "enabled": true,
      "prefix": "img-",
      "includeImageDimensions": true,
      "includeFormat": true,
      "includeQuality": true,
      "includeDerivative": true,
      "pathBasedTags": {
        "/products/": ["product", "catalog"],
        "/profiles/": ["profile", "avatar"],
        "/blog/": ["blog", "content"],
        "/static/": ["static", "assets"]
      }
    },
    "transformCache": {
      "enabled": true,
      "binding": "IMAGE_TRANSFORMATIONS_CACHE",
      "prefix": "transform",
      "maxSize": 26214400,
      "defaultTtl": 86400
    }
  }
}
```

### Client Module

The `client` module configures client detection and adaptation:

```json
{
  "client": {
    "detector": {
      "cache": {
        "maxSize": 5000,
        "pruneAmount": 500,
        "enableCache": true,
        "ttl": 3600000
      },
      "strategies": {
        "clientHints": {
          "priority": 100,
          "enabled": true
        },
        "acceptHeader": {
          "priority": 80,
          "enabled": true
        },
        "userAgent": {
          "priority": 60,
          "enabled": true
        }
      }
    },
    "deviceClassification": {
      "thresholds": {
        "lowEnd": 30,
        "highEnd": 70
      }
    },
    "performanceBudget": {
      "quality": {
        "low": {
          "min": 65,
          "max": 85,
          "target": 75
        }
      },
      "preferredFormats": {
        "low": ["webp", "jpeg"],
        "medium": ["webp", "avif", "jpeg"],
        "high": ["avif", "webp", "jpeg"]
      }
    }
  }
}
```

### Security Module

The `security` module configures security-related settings:

```json
{
  "security": {
    "corsEnabled": true,
    "corsAllowedOrigins": ["https://example.com"],
    "corsAllowedMethods": ["GET", "HEAD", "OPTIONS"],
    "corsAllowCredentials": false,
    "corsMaxAge": 86400,
    "rateLimit": {
      "enabled": true,
      "requestsPerMinute": 100,
      "burstSize": 50
    },
    "requestValidation": {
      "enabled": true,
      "maxUrlLength": 2048,
      "blockLargeRequests": true,
      "maxRequestSize": 1048576
    }
  }
}
```

### Monitoring Module

The `monitoring` module configures monitoring and observability:

```json
{
  "monitoring": {
    "metrics": {
      "enabled": true,
      "reportingInterval": 60,
      "sampleRate": 0.1
    },
    "alerting": {
      "enabled": true,
      "thresholds": {
        "errorRate": 0.05,
        "p95Latency": 2000,
        "cacheHitRate": 0.8
      }
    },
    "tracing": {
      "enabled": true,
      "sampleRate": 0.1,
      "includeHeaders": false
    }
  }
}
```

## Migration Path

To ensure a smooth transition between the legacy and simplified configuration formats, we've implemented the `ConfigMigrator` utility that can convert between them:

```typescript
// Convert from legacy to simplified
const simplifiedConfig = configMigrator.migrateToSimplified(legacyConfig);

// Convert from simplified to legacy
const legacyConfig = configMigrator.migrateToLegacy(simplifiedConfig);
```

The Configuration API can accept either format and will internally convert as needed. This allows for a gradual migration where some modules can be updated to the new format while others remain in the legacy format.

## Benefits of the New Structure

1. **Modular updates**: Each section can be updated independently
2. **Better organization**: Settings are grouped logically
3. **Improved readability**: Flatter structure with less nesting
4. **Easier discovery**: Settings are easier to find
5. **Less redundancy**: Reduced duplication across environments

## Implementation Plan

1. Create TypeScript interfaces for the simplified structure
2. Implement bidirectional migration utilities
3. Update the Configuration API to support both formats
4. Document the new structure with examples
5. Provide migration guidance for existing users