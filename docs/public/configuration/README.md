# Configuration System Documentation

The Configuration API provides a dynamic, flexible system for managing your Image Resizer settings. This documentation explains how to set up, use, and troubleshoot the configuration system.

## Contents

- [Getting Started Guide](./getting-started.md) - Step-by-step walkthrough for first-time setup
- [API Reference](./api.md) - Complete reference of all Configuration API endpoints
- [Setup Instructions](./setup.md) - How to set up the Configuration system
- [Troubleshooting Guide](./troubleshooting.md) - Solutions for common issues
- [Migration Guide](./migration-guide.md) - How to migrate from legacy to simplified configuration

## Key Features

- **Dynamic Configuration**: Update settings without redeployment
- **Version Control**: Track changes with full history and rollback
- **Environment Variables**: Reference environment variables securely
- **Module System**: Organize settings into logical modules
- **Path-Based Origins**: Route image requests to different origins based on path patterns
- **Authentication**: Secure API access with API key authentication
- **Schema Validation**: Ensure configuration validity with JSON Schema

## Configuration Structure

The Image Resizer uses a modular configuration structure organized into logical sections:

```json
{
  "core": {
    "environment": "production",
    "version": "1.0.0",
    "debug": { ... },
    "logging": { ... }
  },
  "storage": {
    "priority": ["r2", "remote"],
    "r2": { ... },
    "remoteUrl": "...",
    "pathBasedOrigins": { ... }
  },
  "transform": {
    "responsive": { ... },
    "derivatives": { ... }
  },
  "cache": {
    "method": "cf",
    "ttl": { ... },
    "cacheTags": { ... }
  },
  "client": {
    "detector": { ... }
  }
}
```

For examples of complete configurations, see the [Examples Directory](../../examples/configuration/).

## Quick Reference

### Setting Up KV Namespace

```bash
# Create KV namespace
wrangler kv:namespace create "IMAGE_CONFIGURATION_STORE"

# Create KV namespace for development
wrangler kv:namespace create "IMAGE_CONFIGURATION_STORE_DEV" --preview
```

### Loading Initial Configuration

```bash
./examples/configuration/load-initial-config.js ./examples/configuration/auth-and-path-origins-config.json --key=config --env=dev
```

### Accessing Configuration

```bash
# Get full configuration
curl "https://your-worker.example.com/api/config" \
  -H "X-API-Key: your-api-key"

# Get specific module
curl "https://your-worker.example.com/api/config/modules/cache" \
  -H "X-API-Key: your-api-key"
```

### Updating Configuration

```bash
# Update a module
curl -X PUT "https://your-worker.example.com/api/config/modules/cache" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "config": {
      "ttl": { "ok": 3600 }
    },
    "comment": "Update cache TTL",
    "author": "developer"
  }'
```

## Path-Based Origins

One of the most powerful features is path-based origin routing, which lets you route image requests to different storage sources based on URL path:

```json
"pathBasedOrigins": {
  "products": {
    "pattern": "/products/.*",
    "priority": ["r2", "remote"],
    "r2": {
      "enabled": true,
      "bindingName": "PRODUCTS_BUCKET"
    },
    "remoteUrl": "https://products.example.com/images"
  }
}
```

This allows for:
- Different storage locations for different content types
- Specialized authentication per path pattern
- Path transformations for directory structure normalization

## Security Recommendations

1. **API Key**: Use a strong, randomly generated API key
2. **Environment Variables**: Store sensitive values as environment variables
3. **HTTPS**: Always use HTTPS for API requests
4. **Minimal Permissions**: Use the least privilege principle for access
5. **Audit Logging**: Enable detailed logging for configuration changes

## Examples

For complete, real-world examples, see:
- [Auth and Path-Based Origins Config](../../examples/configuration/auth-and-path-origins-config.json)
- [Migration Example](../../examples/configuration/migration-example.md)

## Need Help?

If you need assistance with the Configuration API:
- Check the [Troubleshooting Guide](./troubleshooting.md)
- Refer to the [API Reference](./api.md)
- Look at [Example Configurations](../../examples/configuration/)