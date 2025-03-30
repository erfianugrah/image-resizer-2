# Migration Guide: Legacy to Simplified Configuration

This guide provides detailed instructions for migrating from the legacy flat configuration structure to the new simplified modular configuration structure.

## Overview

The Image Resizer has transitioned from a flat configuration structure to a more modular, organized structure. This guide will help you migrate your existing configuration with minimal disruption.

### Legacy vs. Simplified Structure

**Legacy Structure (Flat):**
```json
{
  "environment": "production",
  "debug": { 
    "enabled": true 
  },
  "cache": { 
    "ttl": { 
      "ok": 86400 
    } 
  },
  "storage": { 
    "remoteUrl": "..." 
  }
}
```

**Simplified Structure (Modular):**
```json
{
  "core": {
    "environment": "production",
    "debug": {
      "enabled": true
    }
  },
  "cache": {
    "ttl": {
      "ok": 86400
    }
  },
  "storage": {
    "remoteUrl": "..."
  }
}
```

## Step-by-Step Migration Process

### 1. Check Compatibility

First, confirm your current configuration version:

```bash
curl "https://your-worker.example.com/api/config" \
  -H "X-API-Key: your-api-key"
```

Identify whether you're using the legacy flat structure or already using the modular structure.

### 2. Export Your Current Configuration

Save your current configuration for reference and backup:

```bash
curl "https://your-worker.example.com/api/config" \
  -H "X-API-Key: your-api-key" \
  > legacy-config-backup.json
```

### 3. Convert Your Configuration

There are two ways to convert your configuration:

#### Option A: Use the Configuration API's Convert Endpoint

```bash
curl -X POST "https://your-worker.example.com/api/config/convert" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "format": "simplified",
    "config": '"$(cat legacy-config-backup.json | jq -c)"'
  }' > simplified-config.json
```

#### Option B: Manual Migration

Follow these mapping rules to manually convert your configuration:

1. Move core settings to the `core` module:
   - `environment`, `version`, `debug`, `logging`

2. Keep these modules at the top level, but move their settings under them:
   - `storage`, `cache`, `transform`

3. Create a new `client` module for:
   - `detector`, `responsive`, `metadata`

### 4. Validate Your New Configuration

```bash
curl -X POST "https://your-worker.example.com/api/config/validate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d @simplified-config.json
```

Fix any validation errors before proceeding.

### 5. Test in Development Environment

Before applying to production, test in development:

```bash
curl -X PUT "https://your-dev-worker.example.com/api/config" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "config": '"$(cat simplified-config.json)"',
    "comment": "Migrating to simplified configuration structure",
    "author": "developer"
  }'
```

Test thoroughly in the development environment before proceeding.

### 6. Apply to Production

Once tested, apply to production:

```bash
curl -X PUT "https://your-worker.example.com/api/config" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "config": '"$(cat simplified-config.json)"',
    "comment": "Migrating to simplified configuration structure",
    "author": "developer"
  }'
```

### 7. Verify Configuration

Confirm your new configuration is active:

```bash
curl "https://your-worker.example.com/api/config" \
  -H "X-API-Key: your-api-key"
```

## Detailed Migration Examples

### Core Module Migration

**From:**
```json
{
  "environment": "production",
  "version": "1.0.0",
  "debug": {
    "enabled": true,
    "headers": ["cache", "mode"]
  },
  "logging": {
    "level": "INFO"
  }
}
```

**To:**
```json
{
  "core": {
    "environment": "production",
    "version": "1.0.0",
    "debug": {
      "enabled": true,
      "headers": ["cache", "mode"]
    },
    "logging": {
      "level": "INFO"
    }
  }
}
```

### Storage Module Migration

**From:**
```json
{
  "storage": {
    "priority": ["r2", "remote"],
    "r2": {
      "enabled": true,
      "bindingName": "IMAGES_BUCKET"
    },
    "remoteUrl": "https://source-images.example.com",
    "remoteAuth": {
      "enabled": true,
      "type": "aws-s3"
    }
  }
}
```

**To:**
```json
{
  "storage": {
    "priority": ["r2", "remote"],
    "r2": {
      "enabled": true,
      "bindingName": "IMAGES_BUCKET"
    },
    "remoteUrl": "https://source-images.example.com",
    "remoteAuth": {
      "enabled": true,
      "type": "aws-s3"
    }
  }
}
```
(No changes needed for the storage module)

### Client Detection Migration

**From:**
```json
{
  "detector": {
    "cache": {
      "maxSize": 5000,
      "enableCache": true
    },
    "strategies": {
      "clientHints": {
        "priority": 100,
        "enabled": true
      }
    }
  }
}
```

**To:**
```json
{
  "client": {
    "detector": {
      "cache": {
        "maxSize": 5000,
        "enableCache": true
      },
      "strategies": {
        "clientHints": {
          "priority": 100,
          "enabled": true
        }
      }
    }
  }
}
```

## Working with Path-Based Origins

Path-based origins configuration remains in the `storage` module but has a clearer structure in the simplified format:

**From:**
```json
{
  "storage": {
    "pathBasedOrigins": {
      "products": {
        "pattern": "/products/.*",
        "priority": ["r2"],
        "r2": {
          "bindingName": "PRODUCTS_BUCKET"
        }
      }
    }
  }
}
```

**To:**
```json
{
  "storage": {
    "pathBasedOrigins": {
      "products": {
        "pattern": "/products/.*",
        "priority": ["r2"],
        "r2": {
          "bindingName": "PRODUCTS_BUCKET"
        }
      }
    }
  }
}
```
(No changes needed for path-based origins)

## Handling Environment Variables

Environment variable references work the same way in both formats:

**From:**
```json
{
  "storage": {
    "remoteAuth": {
      "accessKeyVar": "${AWS_ACCESS_KEY_ID}",
      "secretKeyVar": "${AWS_SECRET_ACCESS_KEY}"
    }
  }
}
```

**To:**
```json
{
  "storage": {
    "remoteAuth": {
      "accessKeyVar": "${AWS_ACCESS_KEY_ID}",
      "secretKeyVar": "${AWS_SECRET_ACCESS_KEY}"
    }
  }
}
```
(No changes needed for environment variable references)

## Using Both Formats During Transition

The Configuration API supports both formats simultaneously during your transition. You can:

1. Read configurations in either format
2. Convert between formats using the `/api/config/convert` endpoint
3. Write configurations in either format

This allows for a phased migration where you can gradually update your tooling and processes.

## Troubleshooting Migration Issues

If you encounter issues during migration:

1. **Validation Errors**: Ensure all required fields are present in the new structure
2. **Missing Settings**: Check if any settings were overlooked during conversion
3. **Module Dependencies**: Verify interdependent settings are properly migrated

For detailed troubleshooting, refer to the [Troubleshooting Guide](./troubleshooting.md).

## Benefits of the New Structure

The simplified configuration structure offers several advantages:

1. **Modularity**: Each section can be updated independently
2. **Organization**: Settings are logically grouped
3. **Readability**: Flatter structure with less nesting
4. **Discoverability**: Settings are easier to find
5. **Extensibility**: New modules can be added without affecting existing ones

## Example Complete Migration

For a complete example of migrating a configuration, see the [Example Migration](../../examples/configuration/migration-example.md).

## Need Help?

If you need assistance with migration:

1. Check the [API Reference](./api.md) for detailed endpoint information
2. Review [Example Configurations](../../examples/configuration/README.md) for inspiration
3. Open an issue on the GitHub repository for complex migration questions