# Configuration API Reference

The Configuration API provides a RESTful interface for managing the Image Resizer configuration dynamically. This API allows you to store, retrieve, version, and manage configuration settings without redeploying your worker.

## Quick Navigation

- [Back to Configuration Documentation](index.md)
- [Configuration Reference](../core/configuration-reference.md)
- [Getting Started Guide](getting-started.md)

---

## Authentication

The Configuration API uses API key authentication for most endpoints. Include your API key in the request header:

```http
X-Config-API-Key: your-api-key-here
```

### Setting Up Authentication

1. **Set the API key** in your environment variables (e.g., in `wrangler.toml` or `.dev.vars`):
   ```toml
   [vars]
   CONFIG_API_KEY = "your-secure-api-key"
   ```

2. **Generate a secure key**:
   ```bash
   # Generate a random API key
   openssl rand -hex 32
   ```

### Public Endpoints

The following endpoints are publicly accessible without authentication:
- `GET /api/config/modules` - List all modules
- `GET /api/config/version/:id` - Get a specific version
- `GET /api/config/versions` - List available versions
- `GET /api/config/health` - Health check

All other endpoints require authentication.

---

## Base URL

All API endpoints are relative to your worker's URL with the `/api/config` prefix:

```
https://your-worker.example.com/api/config
```

---

## Configuration Structure

The Configuration API uses a modular configuration system:

```typescript
interface ConfigurationSystem {
  _meta: {
    version: string;           // System version (e.g., "v25")
    lastUpdated: string;       // ISO timestamp
    activeModules: string[];   // List of active module names
  };

  modules: Record<string, ConfigModule>; // Individual modules
}

interface ConfigModule {
  _meta: {
    name: string;              // Module name
    version: string;           // Module version
    description: string;       // Module description
    schema: Record<string, any>;    // JSON schema
    defaults: Record<string, any>;  // Default values
    moduleDependencies?: string[];  // Dependencies
  };

  config: Record<string, any>;  // Module-specific configuration
}
```

---

## API Endpoints

### Configuration Management

#### Get Current Configuration

Retrieves the complete active configuration including all modules.

**Request:**
```http
GET /api/config
X-Config-API-Key: your-api-key
```

**Response:**
```json
{
  "_meta": {
    "version": "v42",
    "lastUpdated": "2025-12-10T14:30:00Z",
    "activeModules": ["cache", "storage", "transform"]
  },
  "modules": {
    "cache": {
      "_meta": {
        "name": "cache",
        "version": "1.0.0",
        "description": "Cache configuration module",
        "schema": { /* JSON schema */ },
        "defaults": { /* default values */ }
      },
      "config": {
        "ttl": {
          "ok": 86400,
          "clientError": 60,
          "serverError": 10
        },
        "method": "cf",
        "cacheEverything": true
      }
    },
    "storage": {
      /* storage module configuration */
    },
    "transform": {
      /* transform module configuration */
    }
  }
}
```

**Status Codes:**
- `200 OK` - Configuration retrieved successfully
- `401 Unauthorized` - Missing or invalid API key
- `500 Internal Server Error` - Server error

---

#### Create New Configuration

Creates a new configuration version and optionally activates it.

**Request:**
```http
POST /api/config
X-Config-API-Key: your-api-key
Content-Type: application/json

{
  "config": {
    "_meta": {
      "version": "v43",
      "lastUpdated": "2025-12-10T15:00:00Z",
      "activeModules": ["cache", "storage", "transform"]
    },
    "modules": {
      "cache": {
        "_meta": { /* module metadata */ },
        "config": { /* cache configuration */ }
      }
    }
  },
  "comment": "Updated cache TTL values",
  "author": "admin",
  "modules": ["cache"],
  "tags": ["production", "cache-update"]
}
```

**Response:**
```json
{
  "message": "Configuration stored successfully",
  "version": {
    "id": "v43",
    "timestamp": "2025-12-10T15:00:00Z",
    "author": "admin",
    "comment": "Updated cache TTL values",
    "hash": "sha256:abc123...",
    "parent": "v42",
    "modules": ["cache"],
    "changes": ["modules.cache.config.ttl.ok"],
    "tags": ["production", "cache-update"]
  }
}
```

**Status Codes:**
- `201 Created` - Configuration created successfully
- `400 Bad Request` - Invalid configuration or missing required fields
- `401 Unauthorized` - Missing or invalid API key

---

### Version Management

#### List Configuration Versions

Retrieves a list of all configuration versions with metadata.

**Request:**
```http
GET /api/config/versions?limit=50
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | `100` | Maximum number of versions to return (1-1000) |

**Response:**
```json
{
  "versions": [
    {
      "id": "v43",
      "timestamp": "2025-12-10T15:00:00Z",
      "author": "admin",
      "comment": "Updated cache TTL values",
      "hash": "sha256:abc123...",
      "parent": "v42",
      "modules": ["cache"],
      "changes": ["modules.cache.config.ttl.ok"],
      "tags": ["production", "cache-update"]
    },
    {
      "id": "v42",
      "timestamp": "2025-12-09T10:30:00Z",
      "author": "system",
      "comment": "Initial configuration",
      "hash": "sha256:def456...",
      "modules": ["cache", "storage", "transform"],
      "changes": []
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Versions retrieved successfully
- `400 Bad Request` - Invalid limit parameter

**Note:** This is a public endpoint (no authentication required).

---

#### Get Specific Version

Retrieves a specific configuration version by ID.

**Request:**
```http
GET /api/config/version/v42
```

**Response:**
```json
{
  "_meta": {
    "version": "v42",
    "lastUpdated": "2025-12-09T10:30:00Z",
    "activeModules": ["cache", "storage", "transform"]
  },
  "modules": {
    /* module configurations */
  }
}
```

**Status Codes:**
- `200 OK` - Version retrieved successfully
- `404 Not Found` - Version not found

**Note:** This is a public endpoint (no authentication required).

---

#### Activate Configuration Version

Activates a specific configuration version, making it the current active configuration.

**Request:**
```http
PUT /api/config/activate/v42
X-Config-API-Key: your-api-key
```

**Response:**
```json
{
  "message": "Version v42 activated successfully"
}
```

**Status Codes:**
- `200 OK` - Version activated successfully
- `400 Bad Request` - Activation failed (version may not exist)
- `401 Unauthorized` - Missing or invalid API key

---

#### Compare Two Versions

Compares two configuration versions and returns the differences.

**Request:**
```http
GET /api/config/diff/v42/v43
X-Config-API-Key: your-api-key
```

**Response:**
```json
{
  "added": [],
  "removed": [],
  "modified": [
    "modules.cache.config.ttl.ok"
  ],
  "unchanged": [
    "modules.cache.config.method",
    "modules.cache.config.cacheEverything",
    "modules.storage.config.priority"
  ]
}
```

**Status Codes:**
- `200 OK` - Comparison successful
- `400 Bad Request` - Invalid version IDs or comparison failed
- `401 Unauthorized` - Missing or invalid API key

---

### Module Management

#### List All Modules

Retrieves a list of all registered configuration modules.

**Request:**
```http
GET /api/config/modules
```

**Response:**
```json
{
  "modules": [
    {
      "name": "cache",
      "version": "1.0.0",
      "description": "Cache configuration module"
    },
    {
      "name": "storage",
      "version": "1.0.0",
      "description": "Storage configuration module"
    },
    {
      "name": "transform",
      "version": "1.0.0",
      "description": "Transformation configuration module"
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Modules retrieved successfully

**Note:** This is a public endpoint (no authentication required).

---

#### Get Module Configuration

Retrieves the configuration for a specific module.

**Request:**
```http
GET /api/config/modules/cache
X-Config-API-Key: your-api-key
```

**Response:**
```json
{
  "_meta": {
    "name": "cache",
    "version": "1.0.0",
    "description": "Cache configuration module",
    "schema": { /* JSON schema */ },
    "defaults": { /* default values */ }
  },
  "config": {
    "ttl": {
      "ok": 86400,
      "clientError": 60,
      "serverError": 10
    },
    "method": "cf",
    "cacheEverything": true
  }
}
```

**Status Codes:**
- `200 OK` - Module configuration retrieved successfully
- `404 Not Found` - Module not found
- `401 Unauthorized` - Missing or invalid API key

---

#### Update Module Configuration

Updates the configuration for a specific module.

**Request:**
```http
PUT /api/config/modules/cache
X-Config-API-Key: your-api-key
Content-Type: application/json

{
  "config": {
    "ttl": {
      "ok": 172800,
      "clientError": 60,
      "serverError": 10
    },
    "method": "cf",
    "cacheEverything": true
  },
  "comment": "Doubled the cache TTL for successful responses",
  "author": "admin"
}
```

**Response:**
```json
{
  "message": "Module cache updated successfully",
  "version": {
    "id": "v44",
    "timestamp": "2025-12-10T16:00:00Z",
    "author": "admin",
    "comment": "Doubled the cache TTL for successful responses",
    "hash": "sha256:xyz789...",
    "parent": "v43",
    "modules": ["cache"],
    "changes": ["modules.cache.config.ttl.ok"]
  }
}
```

**Status Codes:**
- `200 OK` - Module updated successfully
- `400 Bad Request` - Invalid configuration or validation failed
- `401 Unauthorized` - Missing or invalid API key
- `404 Not Found` - Module not found

---

#### Register New Module

Registers a new configuration module with schema and default values.

**Request:**
```http
POST /api/config/modules
X-Config-API-Key: your-api-key
Content-Type: application/json

{
  "name": "monitoring",
  "version": "1.0.0",
  "description": "Monitoring and alerting configuration",
  "schema": {
    "type": "object",
    "properties": {
      "enabled": { "type": "boolean" },
      "interval": { "type": "number" }
    },
    "required": ["enabled"]
  },
  "defaults": {
    "enabled": true,
    "interval": 60
  },
  "dependencies": ["logging"]
}
```

**Response:**
```json
{
  "message": "Module monitoring registered successfully"
}
```

**Status Codes:**
- `201 Created` - Module registered successfully
- `400 Bad Request` - Invalid module definition or registration failed
- `401 Unauthorized` - Missing or invalid API key

---

#### Bulk Update Modules

Updates multiple modules in a single transaction.

**Request:**
```http
PUT /api/config/bulk-update
X-Config-API-Key: your-api-key
Content-Type: application/json

{
  "modules": {
    "cache": {
      "ttl": {
        "ok": 172800,
        "clientError": 120,
        "serverError": 20
      }
    },
    "storage": {
      "priority": ["r2", "remote", "fallback"]
    }
  },
  "comment": "Bulk update of cache and storage settings",
  "author": "admin"
}
```

**Response:**
```json
{
  "message": "Bulk update completed successfully",
  "version": {
    "id": "v45",
    "timestamp": "2025-12-10T17:00:00Z",
    "author": "admin",
    "comment": "Bulk update of cache and storage settings",
    "hash": "sha256:uvw012...",
    "parent": "v44",
    "modules": ["cache", "storage"],
    "changes": [
      "modules.cache.config.ttl.ok",
      "modules.cache.config.ttl.clientError",
      "modules.cache.config.ttl.serverError",
      "modules.storage.config.priority"
    ]
  }
}
```

**Status Codes:**
- `200 OK` - Bulk update successful
- `400 Bad Request` - Invalid configuration or validation failed
- `401 Unauthorized` - Missing or invalid API key
- `404 Not Found` - One or more modules not found

---

### Schema Management

#### Get Full Configuration Schema

Retrieves the JSON schemas for all modules.

**Request:**
```http
GET /api/config/schema
X-Config-API-Key: your-api-key
```

**Response:**
```json
{
  "schemas": {
    "cache": {
      "type": "object",
      "properties": {
        "ttl": {
          "type": "object",
          "properties": {
            "ok": { "type": "number" },
            "clientError": { "type": "number" },
            "serverError": { "type": "number" }
          }
        },
        "method": { "type": "string", "enum": ["cf", "cache-api", "none"] }
      }
    },
    "storage": {
      /* storage schema */
    }
  }
}
```

**Status Codes:**
- `200 OK` - Schemas retrieved successfully
- `401 Unauthorized` - Missing or invalid API key

---

#### Get Module Schema

Retrieves the JSON schema for a specific module.

**Request:**
```http
GET /api/config/schema/cache
X-Config-API-Key: your-api-key
```

**Response:**
```json
{
  "name": "cache",
  "version": "1.0.0",
  "schema": {
    "type": "object",
    "properties": {
      "ttl": {
        "type": "object",
        "properties": {
          "ok": { "type": "number", "minimum": 0 },
          "clientError": { "type": "number", "minimum": 0 },
          "serverError": { "type": "number", "minimum": 0 }
        },
        "required": ["ok", "clientError", "serverError"]
      },
      "method": {
        "type": "string",
        "enum": ["cf", "cache-api", "none"],
        "default": "cf"
      }
    },
    "required": ["ttl", "method"]
  }
}
```

**Status Codes:**
- `200 OK` - Schema retrieved successfully
- `401 Unauthorized` - Missing or invalid API key
- `404 Not Found` - Module not found

---

### Utility Endpoints

#### Resolve Environment Variables

Resolves environment variables in a configuration value (useful for testing).

**Request:**
```http
POST /api/config/resolve-env
X-Config-API-Key: your-api-key
Content-Type: application/json

{
  "value": "${ENV:CACHE_TTL_OK}"
}
```

**Response:**
```json
{
  "original": "${ENV:CACHE_TTL_OK}",
  "resolved": "86400"
}
```

**Status Codes:**
- `200 OK` - Environment variable resolved successfully
- `400 Bad Request` - Invalid value or resolution failed
- `401 Unauthorized` - Missing or invalid API key

---

#### Health Check

Checks the health status of the Configuration API service.

**Request:**
```http
GET /api/config/health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2025-12-10T18:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Service is healthy

**Note:** This is a public endpoint (no authentication required).

---

## Error Responses

All error responses follow a consistent format:

```json
{
  "error": "error_code",
  "message": "Human-readable error message"
}
```

### Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `service_unavailable` | 500 | Configuration API service is not available |
| `invalid_parameter` | 400 | Invalid or missing parameter in request |
| `invalid_request` | 400 | Invalid JSON in request body |
| `missing_field` | 400 | Required field is missing from request |
| `not_found` | 404 | Requested resource not found |
| `validation_error` | 400 | Configuration failed validation |
| `activation_failed` | 400 | Failed to activate version |
| `comparison_error` | 400 | Failed to compare versions |
| `update_failed` | 400 | Failed to update configuration |
| `registration_failed` | 400 | Failed to register module |
| `resolution_failed` | 400 | Failed to resolve environment variable |
| `internal_error` | 500 | Internal server error |

---

## Security Headers

All responses include security headers:

```http
Content-Type: application/json
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: same-origin
```

---

## Usage Examples

### Example 1: Get Current Configuration

```bash
curl -X GET https://images.example.com/api/config \
  -H "X-Config-API-Key: your-api-key"
```

### Example 2: Update Cache TTL

```bash
curl -X PUT https://images.example.com/api/config/modules/cache \
  -H "X-Config-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ttl": {
        "ok": 172800,
        "clientError": 60,
        "serverError": 10
      }
    },
    "comment": "Doubled cache TTL",
    "author": "admin"
  }'
```

### Example 3: List Recent Versions

```bash
curl -X GET "https://images.example.com/api/config/versions?limit=10"
```

### Example 4: Compare Two Versions

```bash
curl -X GET https://images.example.com/api/config/diff/v42/v43 \
  -H "X-Config-API-Key: your-api-key"
```

### Example 5: Activate Previous Version (Rollback)

```bash
curl -X PUT https://images.example.com/api/config/activate/v42 \
  -H "X-Config-API-Key: your-api-key"
```

---

## Best Practices

1. **Version Control**
   - Always include meaningful comments when creating or updating configuration
   - Use tags to mark important versions (e.g., "production", "hotfix")
   - Keep track of parent versions to understand configuration history

2. **Testing Changes**
   - Test configuration changes in a non-production environment first
   - Use the `/api/config/diff` endpoint to review changes before activating
   - Keep previous versions available for quick rollback

3. **Security**
   - Store API keys securely (use environment variables, never commit to git)
   - Rotate API keys regularly
   - Monitor authentication logs for suspicious activity
   - Use HTTPS for all API requests

4. **Bulk Updates**
   - Use bulk updates for related changes to maintain atomicity
   - Bulk updates create a single version, making rollback easier

5. **Schema Validation**
   - Define comprehensive schemas for your modules
   - Use schema validation to prevent invalid configurations
   - Include descriptions in schemas for better documentation

---

## Rate Limiting

The Configuration API may implement rate limiting in production environments to prevent abuse. Recommended limits:

- **Anonymous requests** (public endpoints): 100 requests per minute
- **Authenticated requests**: 500 requests per minute

Exceeding rate limits will result in `429 Too Many Requests` responses.

---

## Related Documentation

- [Configuration Reference](../core/configuration-reference.md) - Complete configuration options
- [Getting Started Guide](getting-started.md) - Initial setup and basic usage
- [Migration Guide](migration-guide.md) - Upgrading from older versions
- [Troubleshooting](troubleshooting.md) - Common issues and solutions

---

*Last Updated: 2025-12-10*
*API Version: 1.0.0*
