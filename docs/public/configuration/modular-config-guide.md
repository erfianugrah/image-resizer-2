# Modular Configuration Guide

This guide explains the modular configuration system used by the Image Resizer, including how to manage individual modules and create comprehensive configurations.

## Configuration Structure

The Image Resizer configuration is organized into distinct modules, each responsible for a specific aspect of the system. This modular approach provides several benefits:

- **Maintainability**: Changes to one module don't affect others
- **Flexibility**: Modules can be updated independently
- **Clarity**: Easier to understand and navigate configuration
- **Validation**: Each module can be validated separately

## Module Types

The system includes the following core configuration modules:

### Core Module

The `core` module contains fundamental system settings:

```json
{
  "_meta": {
    "name": "core",
    "version": "1.0.0",
    "description": "Core configuration module"
  },
  "config": {
    "environment": "production",
    "debug": {
      "enabled": false,
      "headers": ["cache", "mode"],
      "allowedEnvironments": [],
      "verbose": false,
      "includePerformance": true
    },
    "features": {
      "enableAkamaiCompatibility": false,
      "optimizedLogging": true
    },
    "logging": {
      "level": "INFO",
      "includeTimestamp": true,
      "enableStructuredLogs": true,
      "enableBreadcrumbs": true
    }
  }
}
```

### Storage Module

The `storage` module configures where and how images are stored:

```json
{
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
    "remoteUrl": "https://example.com/images",
    "fallbackUrl": "https://fallback.example.com",
    "auth": {
      "useOriginAuth": true,
      "sharePublicly": true,
      "securityLevel": "strict"
    },
    "pathTransforms": {
      "images": {
        "prefix": "",
        "removePrefix": true
      }
    }
  }
}
```

### Transform Module

The `transform` module configures image transformation settings:

```json
{
  "_meta": {
    "name": "transform",
    "version": "1.0.0",
    "description": "Transformation configuration module"
  },
  "config": {
    "defaults": {
      "quality": 85,
      "format": "auto",
      "fit": "scale-down",
      "metadata": "none"
    },
    "formatQuality": {
      "webp": 85,
      "avif": 80,
      "jpeg": 85,
      "png": 90
    },
    "derivatives": {
      "thumbnail": {
        "width": 320,
        "height": 150,
        "fit": "cover",
        "gravity": "auto"
      }
    }
  }
}
```

### Cache Module

The `cache` module configures caching behavior:

```json
{
  "_meta": {
    "name": "cache",
    "version": "1.0.0",
    "description": "Cache configuration module"
  },
  "config": {
    "method": "cf",
    "ttl": {
      "ok": 86400,
      "clientError": 60,
      "serverError": 10
    },
    "cacheEverything": true,
    "transformCache": {
      "enabled": true,
      "binding": "IMAGE_TRANSFORMATIONS_CACHE",
      "prefix": "transform"
    }
  }
}
```

## Managing Configuration Modules

The Image Resizer includes a configuration CLI tool to help manage these modules:

```bash
# List all available modules
npx ts-node scripts/config-loader.ts modules list

# Get a specific module
npx ts-node scripts/config-loader.ts modules get storage

# Validate a module
npx ts-node scripts/config-loader.ts modules validate storage

# Update a module
npx ts-node scripts/config-loader.ts modules update storage path/to/new-storage.json

# Upload a module to KV store
npx ts-node scripts/config-loader.ts modules upload-kv storage --env dev
```

## Comprehensive Configuration

For convenience, a comprehensive configuration can be created that includes all modules in a single file:

```json
{
  "_meta": {
    "version": "1.0.0",
    "lastUpdated": "2025-04-12T10:00:00.000Z",
    "activeModules": ["core", "storage", "transform", "cache"]
  },
  "modules": {
    "core": { /* core module */ },
    "storage": { /* storage module */ },
    "transform": { /* transform module */ },
    "cache": { /* cache module */ }
  }
}
```

You can manage comprehensive configurations with:

```bash
# Create a comprehensive config from modules
npx ts-node scripts/config-loader.ts comprehensive create

# Extract modules from a comprehensive config
npx ts-node scripts/config-loader.ts comprehensive extract path/to/config.json

# Load a comprehensive config to KV
npx ts-node scripts/config-loader.ts load-kv path/to/config.json --env dev
```

## Storage in KV

When uploaded to KV store, the configurations use the following key structure:

- `config_module_core` - Core module configuration
- `config_module_storage` - Storage module configuration
- `config_module_transform` - Transform module configuration
- `config_module_cache` - Cache module configuration
- `config_current` - Complete configuration (all modules)

## Best Practices

1. **Keep Modules Focused**: Each module should handle a specific aspect of the system
2. **Version Control Modules**: Store module configurations in your repository
3. **Validate Before Upload**: Always validate modules before uploading to KV
4. **Use Environment Variables**: Reference environment variables for sensitive information
5. **Document Module Changes**: Include comments in the module _meta section

## Migration from Legacy Configuration

To migrate from a legacy configuration to the modular system:

1. Extract the configuration sections related to each module
2. Create individual module files
3. Use the `comprehensive create` command to build a new comprehensive config
4. Validate the new configuration
5. Upload the modules to KV

## Troubleshooting

If you encounter issues with configuration modules:

1. Check module format (valid JSON with _meta and config sections)
2. Validate modules individually
3. Check KV namespace and key permissions
4. Examine API logs for detailed error messages
5. Try creating a comprehensive config and extracting modules again