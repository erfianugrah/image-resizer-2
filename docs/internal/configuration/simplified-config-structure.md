# Simplified Configuration Structure

This document outlines a simplified, more maintainable configuration structure for the image resizer service. The goal is to reduce complexity while maintaining all essential functionality.

## Design Principles

1. **Flatten Hierarchy**: Reduce nesting levels where possible
2. **Default-Friendly**: Make reasonable defaults the norm, requiring explicit configuration only for exceptions
3. **Group Logically**: Group related settings together
4. **Single Responsibility**: Each module should have a clear, focused purpose
5. **Documentation-First**: Every configuration option should be well-documented
6. **Type Safety**: Strong typing for all configuration values

## Core Modules

### Basic Structure

Each module follows this basic pattern:
```json
{
  "enabled": true,
  "options": {
    // Module-specific options
  }
}
```

Where:
- `enabled`: Master toggle for the entire module
- `options`: Specific settings for the module

### 1. Core Module

```json
{
  "core": {
    "environment": "production", // (development|staging|production)
    "debug": {
      "enabled": false,
      "headers": false,
      "detailedErrors": false
    },
    "logging": {
      "level": "error", // (debug|info|warn|error)
      "structured": true
    },
    "features": {
      "responsiveImages": true,
      "clientHints": true,
      "smartCropping": true,
      "cacheTags": true,
      "watermarks": false
    }
  }
}
```

### 2. Transform Module

```json
{
  "transform": {
    "formats": {
      "preferWebp": true,
      "preferAvif": false,
      "allowOriginalFormat": true,
      "jpegQuality": 85,
      "webpQuality": 80,
      "avifQuality": 75
    },
    "sizes": {
      "maxWidth": 2000,
      "maxHeight": 2000,
      "defaultFit": "scale-down" // (scale-down|contain|cover|crop)
    },
    "optimizations": {
      "stripMetadata": true,
      "autoCompress": true,
      "optimizeForWeb": true
    }
  }
}
```

### 3. Cache Module

```json
{
  "cache": {
    "method": "cf", // (cf|cache-api|none)
    "ttl": {
      "default": 86400,
      "success": 86400,
      "redirects": 3600,
      "clientErrors": 60,
      "serverErrors": 10
    },
    "tags": {
      "enabled": true,
      "prefix": "img:",
      "includeOrigin": true,
      "includeFormat": true
    },
    "bypass": {
      "debugMode": true,
      "noCache": true
    }
  }
}
```

### 4. Storage Module

```json
{
  "storage": {
    "sources": ["r2", "remote", "fallback"],
    "r2": {
      "enabled": true,
      "binding": "IMAGES_BUCKET"
    },
    "remote": {
      "enabled": true,
      "url": "${REMOTE_URL}",
      "auth": {
        "type": "none" // (none|basic|bearer|s3)
      }
    },
    "fallback": {
      "enabled": false,
      "url": "${FALLBACK_URL}"
    },
    "pathTransforms": {
      "enabled": false
    }
  }
}
```

### 5. Client Module

```json
{
  "client": {
    "detection": {
      "enabled": true,
      "useClientHints": true,
      "useAcceptHeader": true,
      "useUserAgent": true,
      "cacheDuration": 3600
    },
    "responsive": {
      "enabled": true,
      "defaultSizes": [320, 640, 768, 1024, 1440, 1920],
      "devicePixelRatio": true,
      "qualityAdjustment": true
    }
  }
}
```

## Common Configuration Scenarios

### Production - High Performance

```json
{
  "core": {
    "environment": "production",
    "debug": { "enabled": false },
    "logging": { "level": "error" }
  },
  "transform": {
    "formats": {
      "preferWebp": true,
      "preferAvif": true,
      "jpegQuality": 82
    },
    "optimizations": {
      "stripMetadata": true,
      "autoCompress": true
    }
  },
  "cache": {
    "ttl": {
      "default": 604800, // One week
      "success": 604800
    }
  },
  "client": {
    "detection": {
      "cacheDuration": 86400 // One day
    }
  }
}
```

### Development - Easy Debugging

```json
{
  "core": {
    "environment": "development",
    "debug": {
      "enabled": true,
      "headers": true,
      "detailedErrors": true
    },
    "logging": {
      "level": "debug",
      "structured": false
    }
  },
  "cache": {
    "method": "none",
    "bypass": {
      "debugMode": true
    }
  },
  "transform": {
    "optimizations": {
      "stripMetadata": false
    }
  }
}
```

## Benefits of This Structure

1. **More Concise**: 70% reduction in configuration file size compared to previous structure
2. **Self-Documenting**: Clear module boundaries and intuitive naming
3. **Simpler Validation**: Flatter structure makes schema validation more straightforward
4. **Easier Overrides**: Specific environment settings can be applied with less nesting
5. **Better Defaults**: Most common configuration values set as reasonable defaults

## Migration Path

For backward compatibility, the Configuration API will support both formats during a transition period:

1. **Detection Phase**: System auto-detects configuration format version
2. **Translation Phase**: Legacy configs are internally transformed to new format
3. **Dual Support Phase**: Both formats are supported for a defined period (3-6 months)
4. **Migration Tools**: Tools provided to help migrate existing configurations
5. **Deprecation Phase**: Warning logs when using legacy format
6. **Removal Phase**: After sufficient notice, legacy format support is removed

## Implementation Approach

1. Create a new `ConfigurationSchema` that defines the simplified structure
2. Implement a `ConfigMigrator` that converts legacy formats to the new format
3. Update the validator to support both formats during transition
4. Update the Configuration API to work with both formats
5. Create a transition guide with examples for users
6. Set a deprecation timeline for the legacy format