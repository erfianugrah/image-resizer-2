# Complete Configuration Migration Example

This document demonstrates a complete migration from legacy flat configuration to the new simplified modular structure.

## Legacy Configuration (Before)

```json
{
  "environment": "production",
  "version": "1.0.0",
  "debug": {
    "enabled": true,
    "headers": ["cache", "mode"],
    "allowedEnvironments": ["development", "staging"],
    "verbose": true,
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
  },
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
    "metadata": "none",
    "formatQuality": {
      "webp": 85,
      "avif": 80,
      "jpeg": 85,
      "png": 90
    }
  },
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
      "region": "us-east-1",
      "service": "s3",
      "accessKeyVar": "AWS_ACCESS_KEY_ID",
      "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
    },
    "fallbackUrl": "https://fallback-images.example.com",
    "fallbackAuth": {
      "enabled": false,
      "type": "bearer",
      "tokenHeaderName": "Authorization"
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
        "pathTransforms": {
          "products": {
            "prefix": "product-images",
            "removePrefix": true
          }
        }
      },
      "profiles": {
        "pattern": "/profiles/.*",
        "priority": ["r2"],
        "r2": {
          "enabled": true,
          "bindingName": "PROFILES_BUCKET"
        },
        "pathTransforms": {
          "profiles": {
            "prefix": "avatars",
            "removePrefix": true
          }
        }
      }
    }
  },
  "cache": {
    "method": "cf",
    "ttl": {
      "ok": 604800,
      "clientError": 60,
      "serverError": 10
    },
    "cacheEverything": true,
    "useTtlByStatus": true,
    "cacheTtlByStatus": {
      "200-299": 604800,
      "301-302": 86400,
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
    }
  },
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
        "enabled": true,
        "maxUALength": 100
      }
    },
    "performanceBudget": {
      "quality": {
        "low": {
          "min": 65,
          "max": 85,
          "target": 75
        },
        "medium": {
          "min": 70,
          "max": 90,
          "target": 80
        },
        "high": {
          "min": 75,
          "max": 95,
          "target": 90
        }
      },
      "preferredFormats": {
        "low": ["webp", "jpeg"],
        "medium": ["webp", "avif", "jpeg"],
        "high": ["avif", "webp", "jpeg"]
      }
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
    },
    "product": {
      "width": 800,
      "height": 800,
      "fit": "contain",
      "background": "white",
      "quality": 90
    }
  }
}
```

## Simplified Configuration (After)

```json
{
  "core": {
    "environment": "production",
    "version": "1.0.0",
    "debug": {
      "enabled": true,
      "headers": ["cache", "mode"],
      "allowedEnvironments": ["development", "staging"],
      "verbose": true,
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
  },
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
      "region": "us-east-1",
      "service": "s3",
      "accessKeyVar": "AWS_ACCESS_KEY_ID",
      "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
    },
    "fallbackUrl": "https://fallback-images.example.com",
    "fallbackAuth": {
      "enabled": false,
      "type": "bearer",
      "tokenHeaderName": "Authorization"
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
        "pathTransforms": {
          "products": {
            "prefix": "product-images",
            "removePrefix": true
          }
        }
      },
      "profiles": {
        "pattern": "/profiles/.*",
        "priority": ["r2"],
        "r2": {
          "enabled": true,
          "bindingName": "PROFILES_BUCKET"
        },
        "pathTransforms": {
          "profiles": {
            "prefix": "avatars",
            "removePrefix": true
          }
        }
      }
    }
  },
  "transform": {
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
      },
      "product": {
        "width": 800,
        "height": 800,
        "fit": "contain",
        "background": "white",
        "quality": 90
      }
    }
  },
  "cache": {
    "method": "cf",
    "ttl": {
      "ok": 604800,
      "clientError": 60,
      "serverError": 10
    },
    "cacheEverything": true,
    "useTtlByStatus": true,
    "cacheTtlByStatus": {
      "200-299": 604800,
      "301-302": 86400,
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
    }
  },
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
          "enabled": true,
          "maxUALength": 100
        }
      },
      "performanceBudget": {
        "quality": {
          "low": {
            "min": 65,
            "max": 85,
            "target": 75
          },
          "medium": {
            "min": 70,
            "max": 90,
            "target": 80
          },
          "high": {
            "min": 75,
            "max": 95,
            "target": 90
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
}
```

## Step-by-Step Migration Process

### 1. Move Core Settings

- `environment` → `core.environment`
- `version` → `core.version`
- `debug` → `core.debug`
- `logging` → `core.logging`
- `features` → `core.features`

### 2. Move Transformation Settings

- `responsive` → `transform.responsive`
- `derivatives` → `transform.derivatives`

### 3. Move Client Detection Settings

- `detector` → `client.detector`

### 4. Keep Module-Specific Settings as Is

- `storage` remains as `storage`
- `cache` remains as `cache`

### 5. Validate the Migration

Check for any missed settings or inconsistencies.

## Common Migration Challenges

1. **Moving Nested Properties**: Ensure all nested properties are moved to their correct location.
2. **Handling Arrays**: Array properties like `breakpoints` should be preserved exactly.
3. **Environment Variable References**: References like `${AWS_ACCESS_KEY_ID}` should remain unchanged.
4. **Default Values**: Ensure default values aren't accidentally overridden.

## Migration Validation

After migration, test all key functionality to ensure the new configuration works as expected:

- Path-based routing
- Cache management
- Client detection
- Image transformations

## Conclusion

This example illustrates the transformation from the legacy flat structure to the new modular structure. The resulting configuration is more maintainable and better organized, while preserving all functionality of the original configuration.