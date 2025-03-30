# Configuration API

The Configuration API provides a comprehensive system for managing dynamic configuration for your Cloudflare Worker.
It supports modular configuration, versioning, environment-specific settings, and dynamic updates.

## Features

- **Modular Configuration**: Configuration is organized into modules (e.g., core, cache, transform)
- **Versioning**: All configuration changes are versioned with full metadata
- **Schema Validation**: JSON Schema validation ensures configuration correctness
- **Environment Variable Interpolation**: Values can include `${ENV_VAR}` references that are resolved at runtime
- **Multiple Environments**: Support for development, staging, and production environments
- **Dynamic Updates**: Configuration can be updated at runtime without deploying
- **Rollback Support**: Easy rollback to previous configuration versions
- **Security**: API-Key and IP-based authentication
- **Health Monitoring**: Health check endpoint for monitoring
- **Cross-Module Dependencies**: Support for module dependencies and validation

## API Endpoints

### General Configuration Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get current configuration |
| POST | `/api/config` | Create a new configuration |
| GET | `/api/config/versions` | List available versions |
| GET | `/api/config/version/:id` | Get a specific version |
| PUT | `/api/config/activate/:id` | Activate a specific version |
| GET | `/api/config/diff/:id1/:id2` | Compare two versions |

### Module Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/modules` | List all modules |
| POST | `/api/config/modules` | Register a new module |
| GET | `/api/config/modules/:name` | Get configuration for a module |
| PUT | `/api/config/modules/:name` | Update configuration for a module |
| PUT | `/api/config/bulk-update` | Update multiple modules at once |

### Schema Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/schema` | Get full configuration schema |
| GET | `/api/config/schema/:name` | Get schema for a specific module |

### Environment Variable Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/config/resolve-env` | Resolve environment variables in a value |

### Monitoring Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/health` | Health check endpoint |

## Authentication

The Configuration API supports multiple authentication methods:

1. **API Key**: Using the `X-API-Key` header with a predefined API key
2. **Basic Auth**: Using HTTP Basic Authentication with username and password
3. **Development Mode**: Bypass authentication in development mode with allowed IP addresses

For secure operations, always use HTTPS and keep API keys secure.

### Headers

Secure headers are automatically added to all responses:

```
Content-Type: application/json
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: same-origin
```

## Configuration Structure

A complete configuration system has the following structure:

```json
{
  "_meta": {
    "version": "1.0.0",
    "lastUpdated": "2023-01-20T12:00:00Z",
    "activeModules": ["core", "cache", "transform"]
  },
  "modules": {
    "core": {
      "_meta": {
        "name": "core",
        "version": "1.0.0",
        "description": "Core configuration settings",
        "schema": { /* JSON Schema */ },
        "defaults": { /* Default values */ }
      },
      "config": {
        /* Module-specific configuration */
      }
    },
    "cache": {
      /* Cache module configuration */
    },
    "transform": {
      /* Transform module configuration */
    }
  }
}
```

## Module Registration

To register a new module, send a POST request to `/api/config/modules` with:

```json
{
  "name": "new-module",
  "version": "1.0.0",
  "description": "My new module",
  "schema": {
    "type": "object",
    "required": ["enabled"],
    "properties": {
      "enabled": { "type": "boolean" },
      "timeout": { "type": "number", "minimum": 0 }
    }
  },
  "defaults": {
    "enabled": true,
    "timeout": 30
  },
  "moduleDependencies": ["core"]
}
```

> **Important**: The property `moduleDependencies` is used to specify dependencies on other modules. Earlier versions used the property name `dependencies`, which is now deprecated due to conflicts with the JSON Schema specification.

## Environment Variable Interpolation

Configuration values can include environment variable references using `${ENV_VAR}` syntax:

```json
{
  "api": {
    "key": "${API_KEY}",
    "url": "https://${API_DOMAIN}/v1"
  }
}
```

These values are resolved at runtime using the worker's environment variables.

## Versioning

All configuration changes create a new version with metadata:

```json
{
  "id": "v25",
  "timestamp": "2023-01-20T12:00:00Z",
  "author": "jane.doe@example.com",
  "comment": "Updated cache TTL for images",
  "hash": "sha256:abc123...",
  "parent": "v24",
  "modules": ["cache"],
  "changes": ["modules.cache.config.ttl"],
  "tags": ["performance"]
}
```

## Error Handling

The API uses standardized error responses:

```json
{
  "error": "validation_error",
  "message": "Configuration for module 'cache' fails validation: ttl must be a positive integer"
}
```

Common error codes:

- `invalid_request`: Invalid request format
- `missing_field`: Required field missing
- `validation_error`: Configuration failed validation
- `not_found`: Resource not found
- `unauthorized`: Authentication failed
- `activation_failed`: Version activation failed
- `internal_error`: Server error

## Deployment

### Wrangler Configuration

Add the following to your `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "CONFIG_STORE", id = "your-kv-namespace-id" }
]

[env.production.vars]
CONFIG_API_KEY = "your-api-key"
```

### Secrets

Set secure values using Wrangler secrets:

```
wrangler secret put CONFIG_API_KEY
```

## Best Practices

1. **Use versioning**: Always create meaningful version metadata for tracking changes
2. **Validate before deploying**: Use schema validation to catch errors early
3. **Environment variables**: Use environment variables for secrets and environment-specific values
4. **Module dependencies**: Declare dependencies between modules explicitly
5. **Rollbacks**: Test rollback procedures in development before using in production
6. **Monitoring**: Set up health checks for your Configuration API
7. **Access control**: Restrict access to write operations to authorized personnel only
8. **Audit logging**: Enable audit logging for all configuration changes

## CLI Usage

You can use the Configuration API with standard HTTP clients:

```bash
# Get current configuration
curl https://your-worker.example.com/api/config \
  -H "X-API-Key: your-api-key"

# Update a module
curl -X PUT https://your-worker.example.com/api/config/modules/cache \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "config": { "ttl": 3600 },
    "comment": "Increased cache TTL to 1 hour",
    "author": "jane.doe@example.com"
  }'
```