# Debugging and Diagnostics

The Image Resizer includes comprehensive debugging and diagnostic tools to help troubleshoot issues and optimize performance.

## In This Section

- [Logging System](logging.md) - Structured logging capabilities
- [Breadcrumb Tracing](breadcrumbs.md) - Request tracing with performance metrics
- [Diagnosing Timeouts](diagnosing-timeouts.md) - Resolving 524 timeout errors
- [Debug Headers](debug-headers.md) - Using HTTP debug headers
- [Debug Report](debug-report.md) - HTML debug report feature

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Core Architecture](../core/architecture.md)
- [Setup Guide](../core/setup.md)
- [Configuration Reference](../core/configuration-reference.md)

## Debugging Features

The Image Resizer provides several debugging capabilities:

1. **Structured Logging**: JSON-formatted logs with context and timestamps
2. **Breadcrumb Tracing**: Detailed request flow tracking with performance metrics
3. **Debug Headers**: HTTP headers with diagnostic information
4. **Debug HTML Report**: Comprehensive HTML view of request processing
5. **Performance Metrics**: Timing information for each processing step

## Debug Mode

Debug mode can be enabled in several ways:

### 1. Via URL Parameter

Add `?debug=true` to any image URL:

```
https://your-worker.com/path/to/image.jpg?debug=true
```

### 2. Via Configuration

Set the debug configuration in wrangler.jsonc:

```jsonc
{
  "debug": {
    "enabled": true,               // Master toggle for debug headers
    "headers": ["ir", "cache"],    // Categories of headers to include 
    "allowedEnvironments": [],     // Restrict debug to specific environments
    "verbose": true,               // Enable verbose debug information
    "includePerformance": true,    // Include performance timing headers
    "forceDebugHeaders": false,    // Override environment restrictions
    "prefix": "X-",                // Prefix for debug headers
    "specialHeaders": {            // Non-prefixed legacy headers
      "x-processing-mode": true
    }
  }
}
```

### 3. Via Environment Variable

Set the DEBUG environment variable:

```bash
wrangler dev --var DEBUG=true
```

## Debug Headers

When debug mode is enabled, the system adds informative headers to responses:

```
X-Image-Resizer-Version: 1.0.0
X-Environment: development
X-Processing-Mode: transformed
X-Storage-Type: r2
X-Original-Content-Type: image/jpeg
X-Original-Size: 2.5MB
X-Original-URL: /path/to/image.jpg
X-Client-DPR: 2
X-Client-Viewport-Width: 1440
X-Device-Type: desktop
X-Format-Selection: avif (via client-hints)
X-Quality-Selection: 80 (auto)
X-Transform-Time: 125ms
X-Total-Processing-Time: 157ms
```

## HTML Debug Report

For comprehensive debugging, visit the debug report URL:

```
https://your-worker.com/debug-report?url=https://your-worker.com/path/to/image.jpg
```

This provides a detailed HTML report including:

- Request information
- Detection results
- Transform options
- Performance metrics
- Request timeline
- Response headers
- Error information (if any)

## Logging Configuration

Logging is configurable through environment variables:

```jsonc
{
  "logging": {
    "level": "DEBUG",             // DEBUG, INFO, WARN, or ERROR
    "includeTimestamp": true,     // Include timestamps in logs
    "enableStructuredLogs": true, // Output JSON-formatted logs
    "enableBreadcrumbs": true     // Enable breadcrumb tracing
  }
}
```

## Log Format Example

```json
{
  "level": "INFO",
  "message": "Image transformation completed",
  "timestamp": "2025-03-22T14:45:52.894Z",
  "context": "ImageResizer",
  "type": "breadcrumb",
  "data": {
    "status": 200,
    "contentType": "image/avif",
    "durationMs": 21
  }
}
```

For more details on debugging and diagnostics, explore the individual topics in this section.

## Related Resources

- [Core Architecture: Debugging Section](../core/architecture.md#8-debug-tools-debugts)
- [Core Architecture: Logging System](../core/architecture.md#10-logging-system-utilsloggingts)
- [Configuration Reference: Debug Settings](../core/configuration-reference.md)
- [Client Detection: Debug Integration](../client-detection/architecture.md)

---

*Last Updated: March 22, 2025*