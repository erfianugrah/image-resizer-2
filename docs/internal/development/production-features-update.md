# Production Features Update Plan

> **Status**: Planning phase - April 7, 2025

## Overview

This document outlines the plan to enable advanced features in the production environment that are currently limited to development and staging environments.

## Key Features to Enable

We plan to enable four primary features in the production environment:

1. **Debug Headers** - Comprehensive debug headers for production diagnostics
2. **KV Transform Cache** - Persistent caching of transformed images using Cloudflare KV
3. **Metadata Cache** - KV-based caching for image metadata
4. **Pino Structured Logging** - Centralized logging with JSON formatting and breadcrumbs

## Implementation Plan

### Configuration Changes

The solution will be implemented through configuration updates rather than code changes:

1. Add "production" to the `allowedEnvironments` arrays
2. Set `forceEnable` flags to true for critical features
3. Add force parameters to bypass environment-specific code checks

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

### 1. Debug Headers in Production

Plan for enabling debug headers in production:

- **Headers to Add**: All header types (ir, cache, mode, client-hints, ua, device, strategy)
- **Security Considerations**: Verify no sensitive information is exposed in headers
- **Performance Assessment**: Measure impact on request processing time
- **Implementation Approach**: Use `forceDebugHeaders` to bypass environment checks

### 2. Transform Cache with KV

Steps for enabling KV transform cache:

- **Namespace Setup**: Create IMAGE_TRANSFORMATIONS_CACHE namespace if not exists
- **Binding Configuration**: Verify binding is correctly set in wrangler.jsonc
- **Configuration Update**: Set `transformCache.enabled` to true and add production to allowedEnvironments
- **Force Parameter**: Set `forceEnable` to true to bypass environment-specific checks
- **Cache Key Verification**: Test key generation to avoid duplicate prefix issues
- **Background Processing**: Enable background indexing to avoid blocking response times

### 3. Metadata Cache with KV

Plan for enabling KV metadata cache:

- **Namespace Setup**: Create IMAGE_METADATA_CACHE namespace if not exists
- **Configuration Update**: Set `metadata.useKV` to true and `useKvMetadata` to true
- **Performance Testing**: Measure impact on response times and resource usage
- **Implementation Testing**: Verify existing metadata caching implementation works with KV enabled

### 4. Pino Structured Logging

Plan for enabling Pino structured logging:

- **Configuration Update**: Set `logging.usePino` to true and `forcePinoLogging` to true
- **Format Verification**: Test structured format and ensure correct JSON formatting
- **Breadcrumb Support**: Verify breadcrumb tracing works with structured logging
- **Performance Testing**: Measure impact of structured logging on request processing

## Technical Challenges to Address

Several challenges need to be addressed during implementation:

1. **Environment Checks**: Identify hard-coded environment checks that require force flags to bypass
2. **KV Binding Validation**: Ensure correct binding configuration in wrangler.jsonc
3. **Debug Headers Security**: Verify no sensitive information is exposed in production debug headers
4. **Performance Considerations**: Measure and optimize performance impact of enabled features
5. **Configuration Versioning**: Manage configuration versions with proper change tracking
6. **KV Key Format**: Fix any issues with KV key formation to prevent duplicate prefixes

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
- [Cache Configuration](../../public/caching/index.md)
- [KV Configuration](../../KV_CONFIGURATION.md)

## Conclusion

This plan outlines a structured approach to enabling features that are currently limited to development and staging environments in production. By using configuration-based control rather than code changes, we aim to minimize risk while maximizing operational benefits.

---

*Last Updated: April 7, 2025*