# Configuration API and Modular Config System Design

## Overview

This document outlines the design for a Configuration API that enables dynamic management of the Image Resizer configuration through a RESTful interface, with a focus on modularity and maintainability. The solution moves configuration from static `wrangler.jsonc` into Cloudflare KV storage with versioning support.

## Goals

- Create a RESTful API for managing configuration
- Store configurations in KV with versioning metadata
- Allow rollback to previous configurations
- Implement a modular, maintainable configuration system
- Keep only essential bindings and routes in wrangler.jsonc

## API Design

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Retrieve current active configuration |
| GET | `/api/config/versions` | List all available configuration versions |
| GET | `/api/config/version/:id` | Retrieve a specific configuration version |
| POST | `/api/config` | Create new configuration version (becomes active) |
| PUT | `/api/config/activate/:id` | Activate a specific configuration version |
| GET | `/api/config/diff/:id1/:id2` | Compare two configuration versions |
| GET | `/api/config/schema` | Get configuration JSON schema |
| GET | `/api/config/modules` | List all configuration modules |
| GET | `/api/config/modules/:name` | Get configuration for a specific module |
| PUT | `/api/config/modules/:name` | Update configuration for a specific module |

### Authentication Note

Authentication will be handled by an external service. The API endpoints will be secured using a mechanism provided by the organization's existing authentication infrastructure.

## KV Storage Design

### Keys and Structure

- `config_current`: Points to the currently active configuration ID
- `config_v{id}`: Stores each configuration version
- `config_history`: Ordered list of all configuration versions with metadata
- `config_schema`: JSON Schema for configuration validation
- `config_module_{name}`: Schema for individual modules

### Metadata

Each configuration version will include metadata:

```json
{
  "id": "v25",
  "timestamp": "2025-03-30T12:34:56Z",
  "author": "admin@example.com",
  "comment": "Updated cache TTLs for production",
  "hash": "sha256:a1b2c3d4...",
  "parent": "v24",
  "modules": ["core", "cache", "transform", "storage"],
  "changes": ["cache.ttl.default", "cache.tags.enabled"]
}
```

## Modular Configuration System

### Module-Based Architecture

The configuration system will use a modular architecture where:

1. Each functional area has its own configuration module
2. Modules are self-contained with their own schema and validation
3. Updates can target specific modules without affecting others
4. New modules can be added without changing existing ones

```typescript
interface ConfigurationSystem {
  // Core system information
  _meta: {
    version: string;
    lastUpdated: string;
    activeModules: string[];
  };
  
  // Individual modules (loaded dynamically)
  modules: Record<string, ConfigModule>;
}

interface ConfigModule {
  // Module metadata
  _meta: {
    name: string;
    version: string;
    description: string;
    schema: object; // JSON schema for validation
    defaults: object; // Default values
  };
  
  // Module configuration
  config: object;
}
```

### Key Design Principles

1. **Self-Documentation**: Each module includes its own documentation
2. **Validation**: Built-in schema for validating configuration values
3. **Defaults**: Every setting has a sensible default
4. **Versioning**: Module versions track changes independently 
5. **Independence**: Modules can be updated independently
6. **Extensibility**: New modules can be added without system changes

### Standard Modules

#### Core Module

```json
{
  "_meta": {
    "name": "core",
    "version": "1.0.0",
    "description": "Core system settings"
  },
  "config": {
    "environment": "development",
    "debug": false,
    "logLevel": "INFO",
    "features": {
      "akamai": true,
      "optimizedCaching": true,
      "clientHints": true
    }
  }
}
```

#### Cache Module

```json
{
  "_meta": {
    "name": "cache",
    "version": "1.0.0",
    "description": "Caching configuration"
  },
  "config": {
    "method": "cf",
    "ttl": {
      "default": 86400,
      "status": {
        "success": 86400,
        "redirects": 3600,
        "clientError": 300,
        "serverError": 0
      }
    },
    "tags": {
      "enabled": true,
      "prefix": "img-",
      "custom": []
    },
    "bypass": {
      "headers": ["cache-control: no-cache"],
      "queryParams": ["bypass-cache=true"]
    }
  }
}
```

#### Transform Module

```json
{
  "_meta": {
    "name": "transform",
    "version": "1.0.0",
    "description": "Image transformation settings"
  },
  "config": {
    "defaults": {
      "quality": 85,
      "format": "auto",
      "fit": "cover"
    },
    "derivatives": {
      "thumbnail": {
        "width": 320,
        "height": 180,
        "fit": "cover"
      },
      "banner": {
        "width": 1200,
        "height": 400,
        "fit": "cover"
      }
    },
    "sizeCodes": {
      "s": 600,
      "m": 800,
      "l": 1200
    }
  }
}
```

### Module Registration System

Modules register themselves with the configuration system:

```typescript
// Module definition
const cacheModule: ConfigModule = {
  _meta: {
    name: "cache",
    version: "1.0.0",
    description: "Caching configuration",
    schema: CACHE_SCHEMA,
    defaults: DEFAULT_CACHE_CONFIG
  },
  config: {} // Will be populated from KV or defaults
};

// Register with configuration system
configSystem.registerModule(cacheModule);
```

### Configuration Access APIs

Services access configuration through a clean API:

```typescript
// Get complete configuration for a module
const cacheConfig = configService.getModule('cache');

// Get specific value with type safety and default
const cacheTtl = configService.getValue<number>('cache.ttl.default', 3600);

// Check if a feature is enabled
const isAkamaiEnabled = configService.isFeatureEnabled('akamai');

// Get configuration for the current environment
const envConfig = configService.getEnvironmentConfig('cache');
```

## Configuration Schema and Validation

Each module will define its own JSON Schema for validation:

```typescript
const CACHE_SCHEMA = {
  type: "object",
  properties: {
    method: {
      type: "string",
      enum: ["cf", "cache-api", "none"],
      description: "Caching method to use"
    },
    ttl: {
      type: "object",
      properties: {
        default: {
          type: "number",
          minimum: 0,
          description: "Default cache TTL in seconds"
        },
        // Additional properties
      }
    },
    // Additional properties
  },
  required: ["method", "ttl"]
};
```

Benefits of schema-based validation:
1. Configuration errors caught early
2. Self-documenting configuration
3. IDE autocompletion support
4. Type safety for TypeScript

## Configuration Migration and Compatibility

### Migration Strategies

1. **Version Detection**: System detects configuration versions
2. **Automatic Upgrades**: Apply transforms to update old configs
3. **Defaults Insertion**: Fill missing values with defaults
4. **Compatibility Layer**: Bridge between old and new structures

### Migration Example

```typescript
// Migration function for cache module from v0.9 to v1.0
function migrateCacheConfig(oldConfig: any): CacheModuleConfig {
  return {
    method: oldConfig.cacheMethod || "cf",
    ttl: {
      default: oldConfig.cacheTtl || 86400,
      status: {
        success: oldConfig.cacheTtlOk || 86400,
        redirects: oldConfig.cacheTtlRedirects || 3600,
        clientError: oldConfig.cacheTtlClientError || 300,
        serverError: oldConfig.cacheTtlServerError || 0
      }
    },
    // Map other properties
  };
}
```

## Implementation Plan

### Phase 1: KV Configuration Storage
1. Create KV namespace for configuration storage
2. Implement basic CRUD operations for configurations
3. Add version metadata and tracking
4. Provide initial API endpoints for config retrieval

### Phase 2: Modular Configuration System
1. Define the module registration system
2. Create schema validation infrastructure
3. Implement configuration access APIs
4. Build the configuration service

### Phase 3: Configuration API
1. Implement complete RESTful API
2. Create granular module-specific endpoints
3. Add configuration diff and comparison features
4. Implement rollback functionality

### Phase 4: UI and Tooling
1. Create admin UI for configuration management
2. Implement diff and history visualization
3. Add validation and testing tools
4. Create deployment workflows for configuration changes

## Worker Integration

The worker will load configuration from KV at startup:

```typescript
async function loadConfig(env) {
  try {
    // Get the current configuration key
    const currentKey = await env.CONFIG_STORE.get('config_current', { type: 'text' });
    
    // Load the current configuration
    const configData = await env.CONFIG_STORE.get(`config_${currentKey}`, { type: 'json' });
    
    // Initialize the configuration system
    const configSystem = new ConfigurationSystem(configData);
    
    // Register built-in modules
    configSystem.registerModule(coreModule);
    configSystem.registerModule(cacheModule);
    configSystem.registerModule(transformModule);
    configSystem.registerModule(storageModule);
    
    // Plugin point: Register custom modules
    registerCustomModules(configSystem);
    
    return configSystem;
  } catch (error) {
    // Fall back to default configuration
    console.error('Failed to load configuration from KV:', error);
    return createDefaultConfigSystem();
  }
}
```

## Dynamic Configuration Updates

The system supports hot reloading of configuration:

```typescript
async function refreshConfiguration(env) {
  // Check if configuration has been updated
  const currentKey = await env.CONFIG_STORE.get('config_current', { type: 'text' });
  
  if (currentKey !== configSystem.getCurrentVersion()) {
    // Load the new configuration
    const newConfigData = await env.CONFIG_STORE.get(`config_${currentKey}`, { type: 'json' });
    
    // Apply the new configuration, maintaining current service state
    configSystem.updateConfiguration(newConfigData);
    
    // Notify services of configuration change
    await notifyConfigurationUpdated();
  }
}
```

## Monitoring and Observability

1. Add logging for all configuration changes
2. Track configuration access metrics
3. Implement alerts for configuration errors
4. Create visualization for configuration history

## Benefits of This Approach

1. **Modularity**: Self-contained configuration modules
2. **Maintainability**: Clear boundaries and responsibilities
3. **Scalability**: Easy to add new configuration sections
4. **Safety**: Schema validation prevents errors
5. **Flexibility**: Update specific sections independently
6. **Tracability**: Track changes to specific settings
7. **Performance**: Only load what's needed
8. **Governance**: Version control for configuration
9. **Documentation**: Self-documenting configuration with schema