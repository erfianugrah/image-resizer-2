# KV Configuration for Production Features

> **Status**: Planning phase - April 7, 2025

## Overview

This document outlines the plan to enable advanced features in the production environment by utilizing the new KV configuration system. It builds on the recently completed [Configuration Refactoring](./configuration-refactoring.md) to enable features that are currently limited to development and staging environments.

## Integration with KV Configuration System

The KV configuration system has been successfully refactored to serve as the single source of truth for configuration. With this foundation in place, we can now leverage this system to enable production features through configuration updates rather than code changes.

### Relationship to Configuration Refactoring

The [Configuration Refactoring](./configuration-refactoring.md) implemented the following key components:

1. Schema-based configuration validation with Zod
2. KV storage as the single source of truth
3. Versioned configuration management
4. Configuration API for runtime updates
5. Async configuration access patterns

This infrastructure allows us to deploy configuration changes without code deployments, which is ideal for enabling production features.

## Features to Enable in Production

We plan to enable four primary features in the production environment:

1. **Debug Headers** - Comprehensive debug headers for production diagnostics
2. **KV Transform Cache** - Persistent caching of transformed images using Cloudflare KV
3. **Metadata Cache** - KV-based caching for image metadata
4. **Pino Structured Logging** - Centralized logging with JSON formatting and breadcrumbs

## Configuration Changes Required

With the KV configuration system in place, we can enable these features by updating the configuration in KV rather than changing code. The specific configuration changes required are:

### 1. Update `allowedEnvironments` Arrays

Add "production" to the `allowedEnvironments` arrays for:
- Debug Headers
- Transform Cache

```json
"debug": {
  "allowedEnvironments": ["development", "staging", "production"]
}

"transformCache": {
  "allowedEnvironments": ["development", "staging", "production"]
}
```

### 2. Enable Force Flags

Add the following force flags to bypass environment-specific code checks:

```json
"features": {
  "forcePinoLogging": true,
  "forceTransformCache": true,
  "useKvMetadata": true
}

"debug": {
  "forceDebugHeaders": true
}

"transformCache": {
  "forceEnable": true
}

"logging": {
  "forceUsage": true
}
```

### 3. KV Configuration Settings

Configure the specific KV-related settings for each feature:

```json
"transform": {
  "metadata": {
    "useKV": true,
    "cacheSize": 1000,
    "ttl": 86400,
    "binding": "IMAGE_METADATA_CACHE"
  }
}

"cache": {
  "transformCache": {
    "enabled": true,
    "binding": "IMAGE_TRANSFORMATIONS_CACHE",
    "prefix": "transform",
    "maxSize": 26214400,
    "defaultTtl": 86400,
    "backgroundIndexing": true
  }
}

"logging": {
  "level": "DEBUG", 
  "includeTimestamp": true,
  "enableStructuredLogs": true,
  "enableBreadcrumbs": true,
  "usePino": true
}
```

## Implementation Steps

### 1. Prepare Additional KV Namespaces

Set up the required KV namespaces for the features:

1. **IMAGE_TRANSFORMATIONS_CACHE**: For storing transformed images
   ```bash
   wrangler kv:namespace create IMAGE_TRANSFORMATIONS_CACHE
   ```

2. **IMAGE_METADATA_CACHE**: For storing image metadata
   ```bash
   wrangler kv:namespace create IMAGE_METADATA_CACHE
   ```

Add these namespaces to wrangler.jsonc:

```json
"kv_namespaces": [
  // Existing namespaces...
  {
    "binding": "IMAGE_TRANSFORMATIONS_CACHE",
    "id": "your-transform-cache-namespace-id"
  },
  {
    "binding": "IMAGE_METADATA_CACHE",
    "id": "your-metadata-cache-namespace-id"
  }
]
```

### 2. Update KV Configuration

Use the configuration API to update the KV configuration:

```bash
# Export current configuration from KV
npm run config:get -- -o current-config.json -e dev

# Update the configuration with production features
# (Manually edit the JSON file to include the changes above)

# Upload the updated configuration to KV
npm run config:load-kv -- updated-config.json --env dev --remote
```

### 3. Test in Development/Staging

Deploy the updated configuration to the development or staging environment and verify:
- Debug headers appear in responses
- Transform cache successfully caches transformed images
- Metadata cache correctly stores and retrieves metadata
- Pino logging is used for structured logs

### 4. Deploy to Production

Once verified in staging, deploy the configuration to production:

```bash
npm run config:load-kv -- production-config.json --env production --remote
```

## Integration With Existing KV Features

The [KV Configuration](../../public/configuration/kv-configuration.md) document already outlines many of the features we're enabling. We'll leverage these existing implementations and simply enable them in production through configuration changes.

### Fix for KV Key Format Issue

We'll also address the KV key format issue that was causing duplicate 'v' prefixes in KV keys:

```typescript
// Clean up version ID - if it starts with 'v' and VERSION_PREFIX ends with 'v', remove the duplicate
let cleanVersionId = currentVersionId;
if (KV_KEYS.VERSION_PREFIX.endsWith('v') && currentVersionId.startsWith('v')) {
  cleanVersionId = currentVersionId.substring(1); // Remove the 'v' prefix from the version ID
}

const configKey = `${KV_KEYS.VERSION_PREFIX}${cleanVersionId}`;
```

## Implementation Timeline

1. **Week 1**: Create KV namespaces and update configuration
2. **Week 2**: Test in development environment
3. **Week 3**: Test in staging environment
4. **Week 4**: Deploy to production and document updates

## Related Documentation

- [KV Configuration System](../../public/configuration/kv-configuration.md) - Details on the KV configuration system
- [Configuration Refactoring](./configuration-refactoring.md) - Information on the KV configuration refactoring
- [Debug Headers](../../public/debugging/debug-headers.md) - Documentation for debug headers
- [KV Transform Cache](../../public/caching/kv-transform-cache.md) - Documentation for the transform cache
- [Metadata Caching](../../public/caching/metadata-caching-strategy.md) - Documentation for metadata caching
- [Logging System](../../public/debugging/logging.md) - Documentation for the logging system

---

*Last Updated: April 7, 2025*