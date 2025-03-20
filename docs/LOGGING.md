# Logging System

The Image Resizer implements a comprehensive logging system designed to provide visibility into its operations and assist with debugging. This documentation covers the logging architecture, configuration options, and the breadcrumb tracing system used for end-to-end request tracking.

## Logging Architecture

The logging system is built around a centralized `Logger` interface that provides consistent logging methods across the codebase:

```typescript
export interface Logger {
  debug(message: string, data?: Record<string, any>): void;
  info(message: string, data?: Record<string, any>): void;
  warn(message: string, data?: Record<string, any>): void;
  error(message: string, data?: Record<string, any>): void;
  breadcrumb(step: string, duration?: number, data?: Record<string, any>): void;
}
```

The system uses a factory pattern with the `createLogger` function to create logger instances for different components:

```typescript
const logger = createLogger(config, 'ComponentName');
```

### Log Levels

The logging system supports four standard log levels:

| Level | Enum Value | Description |
|-------|------------|-------------|
| DEBUG | 0 | Detailed diagnostic information for development |
| INFO  | 1 | General operational information |
| WARN  | 2 | Potentially problematic conditions that don't cause errors |
| ERROR | 3 | Error conditions that affect operation |

Log messages are only output if their level is greater than or equal to the configured minimum log level.

### Log Formats

The logging system supports two output formats:

1. **Plain Text**: Human-readable format with timestamp, level, context, and message
   ```
   2025-03-20T12:34:56.789Z [INFO] [Storage] Image fetched successfully
   ```

2. **Structured JSON**: Machine-parseable format with standardized fields
   ```json
   {"timestamp":"2025-03-20T12:34:56.789Z","level":"INFO","context":"Storage","message":"Image fetched successfully","data":{"source":"R2","size":1024,"format":"webp"}}
   ```

## Breadcrumb Tracing System

The breadcrumb tracing system is designed to provide end-to-end visibility into request processing, helping to diagnose performance issues and errors.

### What are Breadcrumbs?

Breadcrumbs are specialized log entries that track a request's journey through the system. They mark each significant step in the request lifecycle with timing information and contextual data.

### Breadcrumb Format

Each breadcrumb contains:

- **Step name**: A descriptive name for the current operation
- **Duration**: Optional timing information in milliseconds
- **Data**: Optional contextual information about the operation
- **Visual marker**: The 🔶 emoji for easier visual identification in plain text logs
- **Type**: Marked as "breadcrumb" in structured logs

### Example Breadcrumbs

Plain text format:
```
2025-03-20T12:34:56.789Z [INFO] [Transform] 🔶 BREADCRUMB: Starting image transformation
2025-03-20T12:34:56.890Z [INFO] [Transform] 🔶 BREADCRUMB: Applied resize operation Additional data: { width: 800, height: 600, durationMs: 101 }
```

Structured JSON format:
```json
{"timestamp":"2025-03-20T12:34:56.789Z","level":"INFO","context":"Transform","message":"BREADCRUMB: Starting image transformation","type":"breadcrumb"}
{"timestamp":"2025-03-20T12:34:56.890Z","level":"INFO","context":"Transform","message":"BREADCRUMB: Applied resize operation","type":"breadcrumb","data":{"width":800,"height":600,"durationMs":101}}
```

## Instrumented Components

The following components are instrumented with breadcrumb tracing:

| Component | Purpose | Key Breadcrumbs |
|-----------|---------|----------------|
| Main Handler (index.ts) | Request lifecycle | Request received, URL parsed, Response sent |
| Transform (transform.ts) | Image transformation | Starting transformation, Applying operations, CF transform completed |
| Akamai Compatibility | Parameter translation | Starting aspectCrop, Parameter parsing, Gravity setting |
| Storage (storage.ts) | Image retrieval | R2 fetch attempt, Remote fetch attempt, Fallback fetch |
| Cache (cache.ts) | Cache operations | Cache check, Cache hit/miss, Cache storage |
| Path (utils/path.ts) | URL processing | Path parsing, Parameter extraction, Derivative selection |
| Auth (utils/auth.ts) | Authentication | Auth type selection, Token generation, Auth application |
| Error Handling | Error responses | Error detected, Error response creation |
| Debug (debug.ts) | Debug information | Debug mode enabled, Debug data collection |

## Implementation Details

### Adding Breadcrumbs to Code

Breadcrumbs can be added to any part of the code using the `breadcrumb` method:

```typescript
// Basic breadcrumb
logger.breadcrumb('Operation starting');

// With timing information
const startTime = Date.now();
// ... perform operation ...
const duration = Date.now() - startTime;
logger.breadcrumb('Operation completed', duration, { result: 'success' });

// For async operations
async function doSomething() {
  const startTime = Date.now();
  logger.breadcrumb('Starting async operation');
  
  try {
    // ... async work ...
    const result = await someAsyncOperation();
    const duration = Date.now() - startTime;
    logger.breadcrumb('Async operation completed', duration, { result });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.breadcrumb('Async operation failed', duration, { error: error.message });
    throw error;
  }
}
```

### Circular Dependencies

To avoid circular dependencies when adding breadcrumbs to core components, dynamic imports are used:

```typescript
// Instead of direct imports
import { createLogger } from './utils/logging';

// Use dynamic imports
const getLogger = async () => {
  const { createLogger } = await import('./utils/logging');
  return createLogger(config, 'ComponentName');
};

// Then use the logger
const doSomething = async () => {
  const logger = await getLogger();
  logger.breadcrumb('Starting operation');
  // ...
};
```

## Configuration

Logging behavior is configured through the `logging` section of the configuration:

```typescript
export interface LoggingConfig {
  level?: string;                 // Minimum log level (DEBUG, INFO, WARN, ERROR)
  includeTimestamp?: boolean;     // Whether to include timestamps in logs
  enableStructuredLogs?: boolean; // Whether to output logs in JSON format
  enableBreadcrumbs?: boolean;    // Whether to enable breadcrumb tracing
}
```

These settings can be configured in `wrangler.jsonc` for each environment:

```jsonc
{
  "env": {
    "production": {
      "vars": {
        "LOGGING_LEVEL": "INFO",
        "LOGGING_INCLUDE_TIMESTAMP": "true",
        "LOGGING_ENABLE_STRUCTURED_LOGS": "true",
        "LOGGING_BREADCRUMBS_ENABLED": "true"
      }
    },
    "development": {
      "vars": {
        "LOGGING_LEVEL": "DEBUG",
        "LOGGING_INCLUDE_TIMESTAMP": "true",
        "LOGGING_ENABLE_STRUCTURED_LOGS": "false",
        "LOGGING_BREADCRUMBS_ENABLED": "true"
      }
    }
  }
}
```

## Diagnosing 524 Timeout Errors

The breadcrumb tracing system is particularly useful for diagnosing 524 timeout errors, which occur when a Cloudflare Worker exceeds its execution time limit (typically 30 seconds for paid plans and 50ms for free plans).

### Tracing Methodology

When a 524 error occurs:

1. Examine the breadcrumb trail to identify the last recorded step before the timeout
2. Look for missing breadcrumbs in the sequence, which would indicate where the timeout occurred
3. Measure the time between breadcrumbs to find abnormal gaps
4. Focus on operations in the Akamai compatibility layer, particularly the `aspectCrop` function

### Tracking Performance Bottlenecks

The breadcrumb system adds timing information to help identify performance bottlenecks:

```
[INFO] [AkamaiCompat] 🔶 BREADCRUMB: Starting aspectCrop
[INFO] [AkamaiCompat] 🔶 BREADCRUMB: Parsed aspectCrop parameters Additional data: { width: 800, height: 600, gravity: "center", durationMs: 15 }
...
[INFO] [AkamaiCompat] 🔶 BREADCRUMB: aspectCrop completed Additional data: { finalParams: {...}, durationMs: 152 }
```

If the aspectCrop function is the source of timeouts, the breadcrumb trail will show either:
- A large duration value for the overall operation
- Missing breadcrumbs after starting the operation (indicating the function never completed)

## Best Practices

1. **Add breadcrumbs at key points in the request lifecycle**:
   - At the start and end of major operations
   - Before and after I/O operations
   - Before and after CPU-intensive calculations
   - At error handling points

2. **Include relevant contextual data**:
   - Add parameters that affect the operation
   - Include sizes and dimensions for content processing
   - Record cache keys and TTLs for cache operations
   - Note API endpoints and response codes

3. **Add timing information**:
   - Record the duration of operations over 10ms
   - Pay special attention to operations that might approach the timeout limit

4. **Use meaningful step names**:
   - Be descriptive but concise
   - Use a consistent naming convention
   - Include the specific operation being performed

5. **Handle errors gracefully**:
   - Add breadcrumbs before throwing errors
   - Include error details in the breadcrumb data
   - Ensure errors don't prevent breadcrumb logging

## Environment Variables

The logging system respects the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| LOGGING_LEVEL | Minimum log level (DEBUG, INFO, WARN, ERROR) | INFO |
| LOGGING_INCLUDE_TIMESTAMP | Whether to include timestamps | true |
| LOGGING_ENABLE_STRUCTURED_LOGS | Whether to use JSON format | false |
| LOGGING_BREADCRUMBS_ENABLED | Whether to enable breadcrumb tracing | true |

## Viewing Logs

Logs can be viewed using the Cloudflare dashboard or with the wrangler CLI:

```bash
# View logs in real-time
wrangler tail

# Filter for breadcrumbs only
wrangler tail | grep "🔶"

# Filter for specific component
wrangler tail | grep "\[AkamaiCompat\]"

# Search for timeout indications
wrangler tail | grep -E "(timeout|exceeded|too long)"
```