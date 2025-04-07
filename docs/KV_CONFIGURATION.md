# KV Configuration System

The Image Resizer project uses Cloudflare KV as the single source of truth for configuration. This document explains how to use the KV configuration system and includes recent enhancements for production features.

## Overview

The KV configuration system is a modular approach that stores configuration in Cloudflare KV namespaces. It offers several advantages:

- **Single source of truth**: All configuration is stored in KV
- **Environment-specific configuration**: Different settings for development, staging, and production
- **Runtime updates**: Configure without redeploying your Worker
- **Schema validation**: Configuration is validated against a schema
- **Fallback mechanism**: Falls back to environment variables if KV is unavailable

## Configuration Format

The KV configuration uses a modular format:

```json
{
  "_meta": {
    "version": "1.0.0",
    "lastUpdated": "2025-03-30T08:30:00.000Z",
    "activeModules": ["core", "storage", "transform", "cache", "image-resizer"]
  },
  "modules": {
    "core": {
      "_meta": {
        "name": "core",
        "version": "1.0.0",
        "description": "Core configuration module"
      },
      "config": {
        // Core configuration goes here
      }
    },
    "image-resizer": {
      "_meta": {
        "name": "image-resizer",
        "version": "1.0.0",
        "description": "Image Resizer module configuration"
      },
      "config": {
        // Image Resizer configuration goes here
        "environment": "development",
        "version": "1.0.0",
        "features": {
          "enableAkamaiCompatibility": true
        },
        "responsive": {
          "quality": 85,
          "format": "auto",
          "fit": "scale-down"
        }
      }
    },
    // Other modules...
  }
}
```

## Setup Instructions

### 1. Create KV Namespace

Create a KV namespace for your configuration:

```bash
wrangler kv:namespace create IMAGE_CONFIGURATION_STORE
wrangler kv:namespace create IMAGE_CONFIGURATION_STORE_DEV --preview
```

Add these namespaces to your `wrangler.jsonc`:

```json
"kv_namespaces": [
  {
    "binding": "IMAGE_CONFIGURATION_STORE",
    "id": "your-production-namespace-id"
  }
],
"dev": {
  "kv_namespaces": [
    {
      "binding": "IMAGE_CONFIGURATION_STORE_DEV",
      "id": "your-dev-namespace-id"
    }
  ]
}
```

### 2. Load Default Configuration

We provide a comprehensive default configuration that you can load to your KV namespace:

```bash
npm run config:load-default -- --env dev
```

This loads the configuration from `docs/public/configuration/examples/comprehensive-config-runnable.json` to your KV namespace.

### 3. Using Your Own Configuration

If you want to use your own configuration, create a JSON file in the modular format and load it:

```bash
npm run config:load-kv -- your-config.json --env dev
```

### 4. Accessing Configuration in Code

```typescript
import { getConfigAsync } from './config';

// In your request handler:
async function handleRequest(request: Request, env: Env): Promise<Response> {
  // Initialize configuration (only needed once at the start)
  await initializeConfig(env);
  
  // Get configuration
  const config = await getConfigAsync(env);
  
  // Get a specific value
  const quality = await getValueAsync('responsive.quality', env, 85);
  
  // Check if a feature is enabled
  if (config.features?.enableAkamaiCompatibility) {
    // Handle Akamai compatibility
  }
  
  // Rest of your handler...
}
```

## Configuration Management Scripts

The project includes several scripts to help manage KV configuration:

- `npm run config:load-default`: Load the default comprehensive configuration
- `npm run config:load-kv`: Load a specific configuration file to KV
- `npm run config:get`: Fetch and display the current configuration
- `npm run config:activate`: Activate a specific configuration version

## Fallback Mechanism

If KV is unavailable, the system falls back to environment variables. This ensures your application continues to work even if KV has issues.

## Schema Validation

All configuration is validated against a Zod schema defined in `src/schemas/configSchema.ts`. This ensures that your configuration is valid and type-safe.

## Environment-Specific Configuration

The system supports environment-specific configuration through:

1. Environment-specific KV namespaces 
2. Environment-specific modules in the configuration
3. Environment variables that override KV values

## Advanced Usage

### Configuration Versions

The KV system maintains a history of configuration versions. Each update creates a new version with its own unique ID.

To see available versions:
```bash
npm run config:get -- -e dev
```

To activate a specific version:
```bash
npm run config:activate -- v3 -e dev
```

### Direct KV Management

You can also use Wrangler directly to manage KV:

```bash
# List keys in your namespace
wrangler kv:key list --binding=IMAGE_CONFIGURATION_STORE

# View a specific key
wrangler kv:key get --binding=IMAGE_CONFIGURATION_STORE current
```

## Production Features

The KV configuration system enables several advanced features in production environments that may require additional setup.

### Debug Headers in Production

Debug headers provide valuable information about how image requests are processed. With the updated configuration, you can enable debug headers in production:

```json
"debug": {
  "enabled": true,
  "headers": ["cache", "mode", "ir", "client-hints", "ua", "device", "strategy"],
  "allowedEnvironments": ["development", "staging", "production"],
  "verbose": true,
  "includePerformance": true,
  "forceDebugHeaders": true
}
```

Key settings:
- `allowedEnvironments`: Must include "production" to enable debug headers in production
- `forceDebugHeaders`: When true, bypasses environment checks and always shows debug headers
- `headers`: Specifies which debug headers to include (e.g., transformation, cache status, client detection)

### Transform Cache with KV

The transform cache uses KV to store transformed images, improving performance for frequently accessed images:

```json
"transformCache": {
  "enabled": true,
  "binding": "IMAGE_TRANSFORMATIONS_CACHE",
  "prefix": "transform",
  "maxSize": 26214400,
  "defaultTtl": 86400,
  "backgroundIndexing": true,
  "forceEnable": true,
  "allowedEnvironments": ["development", "staging", "production"],
  "disallowedPaths": [
    "/admin/",
    "/preview/",
    "/draft/",
    "/temp/"
  ]
}
```

Key settings:
- `enabled`: Must be true to enable transform caching
- `binding`: Must match the KV binding name in your wrangler.jsonc
- `forceEnable`: When true, enables transform cache regardless of environment
- `allowedEnvironments`: Must include "production" to enable in production

To use transform cache:

1. Create a KV namespace for transformed images:
   ```bash
   wrangler kv:namespace create IMAGE_TRANSFORMATIONS_CACHE
   ```

2. Add the namespace to wrangler.jsonc:
   ```json
   "kv_namespaces": [
     {
       "binding": "IMAGE_TRANSFORMATIONS_CACHE",
       "id": "your-transform-cache-namespace-id"
     }
   ]
   ```

3. Update the configuration to enable transform cache.

4. Deploy your worker.

### Centralized Pino Logging

The updated configuration enables the Pino logging library for structured, centralized logging:

```json
"logging": {
  "level": "DEBUG",
  "includeTimestamp": true,
  "enableStructuredLogs": true,
  "enableBreadcrumbs": true,
  "usePino": true,
  "prettyPrint": true,
  "colorize": true,
  "forceUsage": true
},
"features": {
  "forcePinoLogging": true
}
```

Key settings:
- `usePino`: Enables Pino logging
- `forceUsage`: Forces Pino use even in environments that might default to other loggers
- `forcePinoLogging`: Feature flag to ensure Pino is used everywhere
- `enableStructuredLogs`: Outputs JSON-formatted logs for better parsing

Pino provides structured JSON logging by default, which is ideal for production environments and log aggregation systems.