# Production Features Enabling Plan

> **Status**: Planning phase - April 7, 2025

## Overview

This document outlines the plan to enable advanced features in the production environment that are currently limited to development and staging environments. It includes a technical implementation plan, configuration changes required, and testing strategy.

## Related Documents

- [KV Configuration for Production Features](./production-features-kv-config-plan.md) - Detailed plan for KV configuration integration
- [KV Configuration System](../../public/configuration/kv-configuration.md) - Details on the KV configuration system
- [Configuration Refactoring](./configuration-refactoring.md) - Information on the KV configuration refactoring

## Features to Enable

We plan to enable four primary features in the production environment:

1. **Debug Headers** - Comprehensive debug headers for production diagnostics
2. **KV Transform Cache** - Persistent caching of transformed images using Cloudflare KV
3. **Metadata Cache** - KV-based caching for image metadata
4. **Pino Structured Logging** - Centralized logging with JSON formatting and breadcrumbs

## Technical Background

Currently, these features are limited to development and staging environments due to environment-specific code checks. Our approach is to use configuration-based control rather than code changes to enable these features in production.

## Configuration Changes Required

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

## Complete Configuration Example

```json
{
  "debug": {
    "enabled": true,
    "headers": ["cache", "mode", "ir", "client-hints", "ua", "device", "strategy"],
    "allowedEnvironments": ["development", "staging", "production"],
    "verbose": true,
    "includePerformance": true,
    "forceDebugHeaders": true
  },
  "features": {
    "forcePinoLogging": true,
    "forceTransformCache": true,
    "useKvMetadata": true
  },
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
  "cache": {
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
  },
  "transform": {
    "metadata": {
      "useKV": true,
      "cacheSize": 1000,
      "ttl": 86400,
      "binding": "IMAGE_METADATA_CACHE"
    }
  }
}
```

## Implementation Steps

### 1. Prepare KV Namespaces

The solution requires two KV namespaces:

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

### 2. Update Configuration File

1. Update the comprehensive configuration file with the changes listed above
2. Test the configuration in a development environment
3. Use the config loader script to upload to KV:

```bash
npm run config:load-kv -- updated-config.json --env dev --remote
```

### 3. Fix KV Key Format

Address the KV key format issues that were causing duplicate 'v' prefixes in KV keys:

```typescript
// Clean up version ID - if it starts with 'v' and VERSION_PREFIX ends with 'v', remove the duplicate
let cleanVersionId = currentVersionId;
if (KV_KEYS.VERSION_PREFIX.endsWith('v') && currentVersionId.startsWith('v')) {
  cleanVersionId = currentVersionId.substring(1); // Remove the 'v' prefix from the version ID
}

const configKey = `${KV_KEYS.VERSION_PREFIX}${cleanVersionId}`;
```

### 4. Test in Staging

Deploy the updated configuration to the staging environment and verify all features work as expected.

### 5. Production Deployment

Once verified in staging, deploy the configuration to production:

```bash
npm run config:load-kv -- updated-config.json --env production --remote
```

## Feature-Specific Implementation Details

### 1. Debug Headers in Production

Debug headers provide diagnostic information for troubleshooting:

- **Headers to Enable**: All header types (ir, cache, mode, client-hints, ua, device, strategy)
- **Security Considerations**: Verify no sensitive information is exposed in headers
- **Performance Assessment**: Measure impact on request processing time
- **Implementation Approach**: Use `forceDebugHeaders` to bypass environment checks

### 2. Transform Cache with KV

The KV transform cache provides performance benefits for frequently requested images:

- **Namespace Configuration**: Ensure binding is correctly set in wrangler.jsonc
- **Cache Key Verification**: Test key generation to avoid duplicate prefix issues
- **Background Processing**: Enable background indexing to avoid blocking response times
- **Environment Configuration**: Set `transformCache.enabled` to true and add production to allowedEnvironments

### 3. Metadata Cache with KV

The KV metadata cache improves performance by caching extracted image metadata:

- **Namespace Configuration**: Ensure binding is correctly set in wrangler.jsonc
- **Feature Flag**: Enable `useKvMetadata` flag in features section
- **Metadata Configuration**: Set `metadata.useKV` to true in transform section
- **Performance Testing**: Measure impact on response times and resource usage

### 4. Pino Structured Logging

Pino provides structured JSON logging for better observability:

- **Logger Configuration**: Set `logging.usePino` to true and enable `forcePinoLogging`
- **Format Verification**: Test structured output and ensure correct JSON formatting
- **Breadcrumb Support**: Verify breadcrumb tracing works with structured logging
- **Performance Testing**: Measure impact of structured logging on request processing

## Technical Challenges

Several challenges need to be addressed during implementation:

1. **Environment Checks**: Identify hard-coded environment checks that require force flags to bypass
2. **KV Binding Validation**: Ensure correct binding configuration in wrangler.jsonc
3. **Debug Headers Security**: Verify no sensitive information is exposed in production debug headers
4. **Performance Considerations**: Measure and optimize performance impact of enabled features
5. **Configuration Versioning**: Manage configuration versions with proper change tracking
6. **KV Key Format**: Fix any issues with KV key formation to prevent duplicate prefixes

## Implementation Checklist

- [ ] Update configuration JSON file with all required changes
- [ ] Create KV namespaces if not existing
- [ ] Verify KV bindings in wrangler.jsonc
- [ ] Fix any duplicate prefix issues in KV key generation
- [ ] Test configuration in staging environment
- [ ] Upload updated configuration to production KV store
- [ ] Monitor production performance after deployment

## Expected Benefits

The planned changes should provide several benefits:

1. **Improved Diagnostics**: Full debug headers will provide immediate visibility into production issues
2. **Performance Optimization**: KV transform and metadata caches should reduce CPU usage and improve response times
3. **Log Quality**: Structured logging will improve log analysis and troubleshooting
4. **Operational Efficiency**: Features previously only available in development will aid production support

## Implementation Timeline

1. **Week 1**: Update configuration and create KV namespaces
2. **Week 2**: Test features in staging environment with production config
3. **Week 3**: Limited production rollout with monitoring
4. **Week 4**: Full production deployment and documentation update

## Testing Strategy

1. **Unit Tests**: Verify force flags bypass environment checks correctly
2. **Integration Tests**: Test full request flow with new configuration settings
3. **Performance Tests**: Measure impact on response times and resource usage
4. **Security Tests**: Verify no sensitive information is exposed in debug headers

## Related Documentation

- [Debug Headers](../../public/debugging/debug-headers.md)
- [KV Transform Cache](../../public/caching/kv-transform-cache.md)
- [Metadata Caching](../../public/caching/metadata-caching-strategy.md)
- [Logging System](../../public/debugging/logging.md)

## Conclusion

This plan outlines a structured approach to enabling features that are currently limited to development and staging environments in production. By using configuration-based control rather than code changes, we aim to minimize risk while maximizing operational benefits.

---

*Last Updated: April 7, 2025*