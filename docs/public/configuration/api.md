# Configuration API

The Configuration API provides a dynamic, modular configuration system for the Image Resizer service. This document outlines the core concepts, examples, and usage patterns.

## Configuration Structure

The Image Resizer uses a modular configuration system organized into logical modules:

1. **Core** - Basic service settings, environment, and feature toggles
2. **Transform** - Image transformation settings, formats, and quality
3. **Cache** - Caching behavior, TTLs, and invalidation
4. **Storage** - Image storage sources and authentication
5. **Client** - Client detection and responsive features
6. **Security** - Security headers and access controls
7. **Monitoring** - Performance tracking and error reporting

## Simplified Configuration Example

```json
{
  "core": {
    "environment": "production",
    "debug": {
      "enabled": false
    },
    "logging": {
      "level": "error"
    }
  },
  "transform": {
    "formats": {
      "preferWebp": true,
      "jpegQuality": 85
    }
  },
  "cache": {
    "method": "cf",
    "ttl": {
      "default": 86400
    }
  },
  "storage": {
    "sources": ["r2", "remote"],
    "r2": {
      "enabled": true
    }
  }
}
```

## Configuration Storage

Configurations are stored in Cloudflare KV with versioning:

- Each configuration version has metadata (timestamp, author, changes)
- Versions can be compared to see what changed
- Any version can be activated as the current configuration
- Automatic validation ensures configuration is valid

## Environment Variables

Configuration values can include environment variable references:

```json
{
  "storage": {
    "remote": {
      "url": "${REMOTE_URL}",
      "auth": {
        "apiKey": "${API_KEY}"
      }
    }
  }
}
```

These are automatically resolved at runtime from Worker environment variables.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get current configuration |
| GET | `/api/config/versions` | List available versions |
| GET | `/api/config/version/:id` | Get a specific version |
| PUT | `/api/config/activate/:id` | Activate a specific version |
| GET | `/api/config/modules/:name` | Get configuration for a module |
| PUT | `/api/config/modules/:name` | Update a module configuration |
| POST | `/api/config/modules` | Register a new module |
| PUT | `/api/config/bulk-update` | Update multiple modules at once |

## Using the API

### Getting Configuration Values in Code

```typescript
// Get a specific module
const cacheConfig = await configApiService.getModule('cache');

// Get a specific value using dot notation
const jpegQuality = await configApiService.getValue('transform.formats.jpegQuality', 85);

// Check if a feature is enabled
const isWebpEnabled = await configApiService.isFeatureEnabled('webpSupport');
```

### Updating Configuration

```typescript
// Update a module configuration
await configApiService.updateModule(
  'cache',
  {
    method: 'cf',
    ttl: {
      default: 86400,
      clientErrors: 60
    }
  },
  'Updated cache TTLs for better performance',
  'jane.doe@example.com'
);
```

## Schema Validation

All configurations are validated against JSON Schema definitions:

- Type validation ensures correct data types
- Range validation enforces valid ranges for numeric values
- Format validation checks formats like emails and URLs
- Required properties are enforced
- Cross-module dependencies are validated

## Best Practices

1. **Use environment variables** for secrets and environment-specific values
2. **Keep configurations small** by relying on defaults when possible
3. **Include meaningful comments** when creating new versions
4. **Test configurations** before activating in production
5. **Use appropriate TTLs** based on content type and update frequency
6. **Monitor configuration changes** through the audit logs

## Simplified Structure

For details on the simplified configuration structure, see [Simplified Config Structure](../../internal/configuration/simplified-config-structure.md).