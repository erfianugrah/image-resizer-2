# Breadcrumb Implementation Reference

This document provides a quick reference for the breadcrumb implementation across all major components of the Image Resizer service. Use this as a guide when analyzing logs or adding new breadcrumbs to track request flow and performance.

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Debugging Overview](index.md)
- [Logging System](logging.md)
- [Diagnosing Timeouts](diagnosing-timeouts.md)
- [Debug Headers](debug-headers.md)

## Index Handler (index.ts)

The main request handler includes breadcrumbs for the complete request lifecycle:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Request received` | Initial request received | url, method, headers |
| `Request validated` | Request validation complete | - |
| `Path parsed` | URL path parsing complete | pathname, searchParams |
| `Transform options built` | Image transformation options generated | options |
| `Storage source selected` | Storage priority determined | source, priority |
| `Image fetched from storage` | Image retrieved from primary source | source, size, format |
| `Fallback storage used` | Secondary storage source used | source, reason |
| `Image transformation started` | Starting CF image transformation | transformOptions |
| `Image transformation completed` | CF image transformation finished | format, size, width, height |
| `Cache write started` | Writing to cache | cacheKey, ttl |
| `Cache write completed` | Cache write finished | cacheKey, ttl |
| `Response generated` | Final response preparation | status, headers |
| `Error handled` | Error handling triggered | errorType, status, message |
| `Request completed` | Request fully processed | totalDuration, status |

## Transform (transform.ts)

Image transformation operations:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Starting image transformation` | Beginning transformation process | originalSize, contentType |
| `Applying resize operation` | Width/height transformations | width, height, fit |
| `Setting format` | Format conversion | format, quality |
| `Applying derivative` | Derivative template applied | derivative, template |
| `Setting metadata` | Metadata handling | metadata |
| `Setting optimization options` | Quality and optimization | quality, minify |
| `Setting color adjustments` | Color manipulation | brightness, contrast, saturation |
| `Setting focus/gravity` | Position and cropping focus | gravity, coordinates |
| `CF transform completed` | Cloudflare transformation complete | resultSize, duration |

## Akamai Compatibility (utils/akamai-compatibility.ts)

Akamai Image Manager compatibility layer:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Starting Akamai parameter translation` | Begin translating Akamai params | originalParams |
| `Starting aspectCrop` | Beginning aspectCrop processing | width, height, mode |
| `Parsed aspectCrop parameters` | Parameter parsing complete | width, height, mode, gravity |
| `Calculating dimensions` | Computing dimensions | originalWidth, originalHeight, targetWidth, targetHeight |
| `Setting gravity` | Setting focus/gravity | gravity, coordinates |
| `aspectCrop completed` | aspectCrop processing finished | finalParams, duration |
| `Akamai parameter translation completed` | All Akamai params translated | finalParams, duration |

## Storage (storage.ts)

Image retrieval operations:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Starting R2 fetch` | Beginning R2 storage fetch | key |
| `R2 fetch complete` | R2 fetch finished | size, type, duration |
| `R2 fetch failed` | R2 fetch error occurred | error, key |
| `Starting remote fetch` | Beginning remote URL fetch | url |
| `Remote auth applied` | Authentication added to remote | authType |
| `Remote fetch complete` | Remote fetch finished | size, type, duration |
| `Remote fetch failed` | Remote fetch error | error, url |
| `Starting fallback fetch` | Beginning fallback URL fetch | url |
| `Fallback fetch complete` | Fallback fetch finished | size, type, duration |
| `All storage options failed` | No storage source succeeded | attempts |

## Cache (cache.ts)

Cache operations:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Cache check started` | Beginning cache lookup | cacheKey |
| `Cache hit` | Item found in cache | cacheKey, age |
| `Cache miss` | Item not found in cache | cacheKey |
| `Cache write started` | Beginning cache write | cacheKey, contentType, size |
| `Cache write completed` | Cache write finished | cacheKey, ttl |
| `Cache error` | Cache operation failed | operation, error |

## Path (utils/path.ts)

URL and path processing:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Path parsing started` | Beginning URL path parsing | url |
| `Path parameter extracted` | Parameter found in path | name, value |
| `Query parameter processed` | Query param processed | name, value |
| `Derivative selected` | Derivative template found | name, template |
| `Path transformation applied` | Path mapping applied | originalPath, transformedPath |
| `Path parsing completed` | All path parsing complete | finalPath, params |

## Auth (utils/auth.ts)

Authentication operations:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Auth type detection` | Detecting auth type for URL | domain, url |
| `Auth type selected` | Auth type determined | authType, domain |
| `Bearer token generation` | Creating bearer token | tokenType, expiry |
| `Basic auth generation` | Creating basic auth | username |
| `Custom header generation` | Creating custom header | headerName |
| `Signed URL generation` | Creating signed URL | paramName, expiry |
| `Auth application failed` | Auth could not be applied | authType, error |
| `Auth applied successfully` | Auth successfully added | authType, url |

## Errors (utils/errors.ts)

Error handling:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Error detected` | Error condition detected | type, message |
| `Client error response` | 4xx error response | status, message |
| `Server error response` | 5xx error response | status, message |
| `Not found response` | 404 specific handling | path |
| `Validation error` | Input validation failed | field, message |
| `Authorization error` | Auth/permission error | reason |

## Debug (debug.ts)

Debug operations:

| Step | Description | Data Fields |
|------|-------------|------------|
| `Debug mode enabled` | Debug features activated | method, url |
| `Debug headers added` | Debug headers created | headerCount, categories |
| `Performance metrics collected` | Performance data gathered | metrics |
| `Debug report requested` | HTML debug report requested | format |
| `Debug report generated` | Debug report created | size, format |

## Adding Custom Breadcrumbs

When adding new breadcrumbs to the codebase, follow this pattern:

```typescript
// Import logger
import { createLogger } from './utils/logging';
const logger = createLogger(config, 'ComponentName');

// Basic breadcrumb
logger.breadcrumb('Operation starting');

// With timing
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;
logger.breadcrumb('Operation completed', duration, { result: 'success' });

// For async operations
async function processImage() {
  const startTime = Date.now();
  logger.breadcrumb('Starting image processing');
  
  try {
    // ... async work ...
    const result = await someImageOperation();
    const duration = Date.now() - startTime;
    logger.breadcrumb('Image processing completed', duration, { 
      format: result.format,
      size: result.size
    });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.breadcrumb('Image processing failed', duration, { 
      error: error.message
    });
    throw error;
  }
}
```

## Viewing Breadcrumbs

Filter logs to view only breadcrumbs:

```bash
# Using grep for visual marker (plain text format)
wrangler tail | grep "🔶"

# Using jq for structured logs (JSON format)
wrangler tail --format=json | jq 'select(.type == "breadcrumb")'

# Filter for specific component
wrangler tail | grep "🔶" | grep "\[AkamaiCompat\]"

# Filter for specific operation
wrangler tail | grep "🔶" | grep "aspectCrop"
```

## Troubleshooting

### Missing Breadcrumbs

If breadcrumbs aren't appearing in logs:

1. Check if logging level is set to INFO or DEBUG (`LOGGING_LEVEL`)
2. Ensure breadcrumb tracing is enabled (`LOGGING_ENABLE_BREADCRUMBS="true"`)
3. Verify you're using the correct visual marker in grep filters
4. For JSON format logs, use the correct type filter (`type == "breadcrumb"`)
5. Check that the component is actually executed during the request flow

### Incomplete Breadcrumb Trails

If you see incomplete breadcrumb trails:

1. Look for errors that might be terminating execution early
2. Check for async operations that aren't properly awaited
3. Ensure all branches of code include appropriate breadcrumbs
4. Verify error handling includes breadcrumbs for failure cases
5. Check for timeout conditions that might interrupt execution

## Related Resources

- [Logging System](logging.md)
- [Diagnosing Timeouts](diagnosing-timeouts.md)
- [Debug Headers](debug-headers.md)
- [Core Architecture: Logging System](../core/architecture.md#10-logging-system-utilsloggingts)
- [Configuration Reference](../core/configuration-reference.md)

---

*Last Updated: March 22, 2025*