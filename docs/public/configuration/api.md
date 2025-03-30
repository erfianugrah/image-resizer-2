# Configuration API Reference

The Configuration API provides a RESTful interface for managing the Image Resizer configuration. This API allows you to retrieve, update, and manage configuration settings dynamically without redeploying your worker.

## Authentication

All API endpoints require authentication using an API key:

```
X-API-Key: your-api-key-here
```

The API key should be set in your worker's environment variables as `CONFIG_API_KEY`.

## Base URL

All API endpoints are relative to your worker's URL:

```
https://your-worker.example.com/config
```

## Endpoints

### Get Full Configuration

Retrieves the complete configuration.

**Request:**
```
GET /config
```

**Response:**
```json
{
  "core": {
    "environment": "production",
    "version": "1.0.0",
    "debug": {...},
    "logging": {...}
  },
  "storage": {...},
  "transform": {...},
  "cache": {...}
}
```

### Get Module Configuration

Retrieves configuration for a specific module.

**Request:**
```
GET /config/{module}
```

Where `{module}` is one of: `core`, `storage`, `transform`, `cache`, `client`, `security`, `monitoring`.

**Response:**
```json
{
  "ttl": {
    "ok": 86400,
    "clientError": 60,
    "serverError": 10
  },
  "method": "cf",
  "cacheEverything": true,
  ...
}
```

### Update Full Configuration

Replaces the entire configuration.

**Request:**
```
PUT /config
Content-Type: application/json

{
  "core": {...},
  "storage": {...},
  "transform": {...},
  "cache": {...}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated successfully",
  "version": 2
}
```

### Update Module Configuration

Updates configuration for a specific module.

**Request:**
```
PUT /config/{module}
Content-Type: application/json

{
  "ttl": {
    "ok": 86400,
    "clientError": 60,
    "serverError": 10
  },
  "method": "cf",
  "cacheEverything": true,
  ...
}
```

**Response:**
```json
{
  "success": true,
  "message": "Module 'cache' updated successfully",
  "version": 3
}
```

### Get Configuration History

Retrieves configuration version history.

**Request:**
```
GET /config/history
```

**Response:**
```json
{
  "versions": [
    {
      "version": 3,
      "timestamp": "2023-09-15T14:22:10Z",
      "module": "cache",
      "action": "update"
    },
    {
      "version": 2,
      "timestamp": "2023-09-15T12:10:05Z",
      "module": "all",
      "action": "replace"
    },
    {
      "version": 1,
      "timestamp": "2023-09-14T09:30:00Z",
      "module": "all",
      "action": "create"
    }
  ]
}
```

### Get Configuration Version

Retrieves a specific configuration version.

**Request:**
```
GET /config/version/{version}
```

**Response:**
```json
{
  "version": 2,
  "timestamp": "2023-09-15T12:10:05Z",
  "config": {
    "core": {...},
    "storage": {...},
    "transform": {...},
    "cache": {...}
  }
}
```

### Restore Configuration Version

Restores a previous configuration version.

**Request:**
```
POST /config/restore/{version}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration restored to version 2",
  "version": 4
}
```

### Validate Configuration

Validates a configuration without applying it.

**Request:**
```
POST /config/validate
Content-Type: application/json

{
  "core": {...},
  "storage": {...},
  "transform": {...},
  "cache": {...}
}
```

**Response:**
```json
{
  "valid": true,
  "message": "Configuration is valid"
}
```

Or for validation failures:

```json
{
  "valid": false,
  "errors": [
    {
      "path": "cache.ttl.ok",
      "message": "Value must be a positive integer"
    },
    {
      "path": "storage.remoteAuth.type",
      "message": "Invalid auth type: 'unknown'. Valid values are 'aws-s3', 'bearer', 'header', 'query'"
    }
  ]
}
```

### Register Module

Registers a new configuration module.

**Request:**
```
POST /config/register/{moduleName}
Content-Type: application/json

{
  "schema": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "default": true
      },
      "options": {
        "type": "object",
        "properties": {...}
      }
    }
  },
  "defaultConfig": {
    "enabled": true,
    "options": {...}
  },
  "dependencies": ["core", "storage"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Module 'analytics' registered successfully",
  "moduleId": "analytics"
}
```

### List Modules

Lists all registered configuration modules.

**Request:**
```
GET /config/modules
```

**Response:**
```json
{
  "modules": [
    {
      "id": "core",
      "description": "Core system settings",
      "dependencies": []
    },
    {
      "id": "storage",
      "description": "Storage and origin settings",
      "dependencies": ["core"]
    },
    {
      "id": "transform",
      "description": "Image transformation settings",
      "dependencies": ["core"]
    },
    {
      "id": "cache",
      "description": "Caching configuration",
      "dependencies": ["core", "storage"]
    }
  ]
}
```

### Resolve Environment Variables

Resolves environment variable references in the configuration.

**Request:**
```
POST /config/resolve-env
Content-Type: application/json

{
  "storage": {
    "remoteAuth": {
      "accessKeyVar": "AWS_ACCESS_KEY_ID",
      "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
    }
  }
}
```

**Response:**
```json
{
  "resolved": true,
  "message": "Environment variables resolved successfully",
  "result": {
    "storage": {
      "remoteAuth": {
        "accessKeyVar": "AWS_ACCESS_KEY_ID", 
        "secretKeyVar": "AWS_SECRET_ACCESS_KEY",
        "_resolvedAccessKey": "AKXXXXXXXXXXXXXXXXXX", // Note: Sensitive values are masked
        "_resolvedSecretKey": "********"
      }
    }
  }
}
```

## Error Responses

The API returns appropriate HTTP status codes for different error cases:

- `400 Bad Request`: Invalid request parameters or JSON body
- `401 Unauthorized`: Missing or invalid API key
- `404 Not Found`: Requested resource not found
- `409 Conflict`: Configuration validation failed
- `500 Internal Server Error`: Server-side error

Error responses include details about the error:

```json
{
  "success": false,
  "error": "Validation Error",
  "details": [
    {
      "path": "cache.ttl.ok",
      "message": "Value must be a positive integer"
    }
  ]
}
```

## Bulk Operations

### Bulk Update

Updates multiple modules in a single operation.

**Request:**
```
POST /config/bulk-update
Content-Type: application/json

{
  "modules": {
    "cache": {
      "ttl": {
        "ok": 86400,
        "clientError": 60
      }
    },
    "storage": {
      "remoteUrl": "https://new-origin.example.com"
    }
  },
  "description": "Update cache TTLs and remote origin"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk update completed successfully",
  "version": 5,
  "updated": ["cache", "storage"]
}
```

## Schema Validation

The Configuration API uses JSON Schema for validating configurations. You can retrieve the schema for the entire configuration or specific modules:

**Request:**
```
GET /config/schema
```

**Response:**
```json
{
  "type": "object",
  "properties": {
    "core": { ... },
    "storage": { ... },
    "cache": { ... },
    ...
  },
  "required": ["core"]
}
```

Or for a specific module:

**Request:**
```
GET /config/schema/{module}
```

**Response:**
```json
{
  "type": "object",
  "properties": {
    "ttl": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "integer",
          "minimum": 0,
          "description": "TTL for successful responses (200-299)"
        },
        "clientError": {
          "type": "integer",
          "minimum": 0,
          "description": "TTL for client error responses (400-499)"
        },
        "serverError": {
          "type": "integer",
          "minimum": 0,
          "description": "TTL for server error responses (500-599)"
        }
      },
      "required": ["ok"]
    },
    "method": {
      "type": "string",
      "enum": ["cf", "cache-api", "none"],
      "description": "Caching method to use"
    },
    "cacheEverything": {
      "type": "boolean",
      "description": "Whether to cache all content types"
    }
  },
  "required": ["ttl", "method"]
}
```

## Format Conversion

The API can convert between legacy and simplified configuration formats:

**Request:**
```
POST /config/convert
Content-Type: application/json

{
  "format": "simplified",
  "config": {
    "environment": "production",
    "debug": { ... },
    "cache": { ... },
    ...
  }
}
```

**Response:**
```json
{
  "success": true,
  "format": "simplified",
  "result": {
    "core": {
      "environment": "production",
      "debug": { ... }
    },
    "cache": { ... },
    ...
  }
}
```

Supported formats:
- `simplified`: Modern modular format
- `legacy`: Original flat format