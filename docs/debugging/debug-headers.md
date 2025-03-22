# Debug Headers

The Image Resizer includes comprehensive debug headers to help diagnose issues and understand how images are being processed. These headers provide valuable insights into transformation decisions, performance metrics, and system behavior.

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Debugging Overview](index.md)
- [Logging System](logging.md)
- [Breadcrumb Tracing](breadcrumbs.md)
- [Diagnosing Timeouts](diagnosing-timeouts.md)

## Enabling Debug Headers

Debug headers can be enabled in several ways:

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

## Debug Header Categories

Debug headers are organized into categories that can be enabled individually:

| Category | Description | Example Headers |
|----------|-------------|-----------------|
| `ir` | Image resizing information | X-Original-Size, X-Original-Dimensions |
| `cache` | Cache configuration | X-Cache-TTL, X-Cache-Key |
| `mode` | Processing mode | X-Processing-Mode |
| `client-hints` | Client hints information | X-Client-DPR, X-Client-Viewport-Width |
| `ua` | User-Agent parsing | X-Browser-Name, X-Browser-Version |
| `device` | Device detection | X-Device-Type, X-Device-Memory |
| `strategy` | Strategy selection | X-Format-Selection, X-Quality-Selection |
| `all` | All available headers | All of the above |

## Common Debug Headers

Here are some of the most useful debug headers:

| Header | Description | Example Value |
|--------|-------------|---------------|
| `X-Image-Resizer-Version` | Version of the image resizer | 1.0.0 |
| `X-Environment` | Current environment | development |
| `X-Processing-Mode` | How the image was processed | transformed |
| `X-Storage-Type` | Source of the image | r2 |
| `X-Original-Content-Type` | Content type of the original | image/jpeg |
| `X-Original-Size` | Size of the original image | 2.5MB |
| `X-Original-URL` | Original URL requested | /path/to/image.jpg |
| `X-Client-DPR` | Device pixel ratio | 2 |
| `X-Client-Viewport-Width` | Viewport width | 1440 |
| `X-Device-Type` | Detected device type | desktop |
| `X-Format-Selection` | Selected format info | avif (via client-hints) |
| `X-Quality-Selection` | Selected quality info | 80 (auto) |
| `X-Transform-Time` | Time to transform image | 125ms |
| `X-Total-Processing-Time` | Total processing time | 157ms |

## Debug Header Format

Debug headers follow this naming convention:

1. All debug headers start with the configured prefix (default: `X-`)
2. Header names use hyphen-case (e.g., `X-Original-Size`)
3. Values are formatted to be human-readable

Example response headers:

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

## Client Hint Debug Headers

When client hints are available, additional headers show the detected information:

```
X-Client-DPR: 2
X-Client-Viewport-Width: 1440
X-Client-Memory: 8GB
X-Client-CPU-Cores: 8
X-Client-Save-Data: off
X-Client-Network-Type: 4g
X-Client-Effective-Connection-Type: 4g
X-Client-RTT: 50ms
X-Client-Downlink: 10Mbps
```

## Format Selection Debug Headers

Headers that show how format decisions were made:

```
X-Format-Selection: avif (via client-hints)
X-Format-Accept-Header: image/avif,image/webp,image/apng,image/*
X-Format-Browser-Support: chrome/110 (avif,webp)
X-Format-Client-Hints: Sec-CH-UA: "Chrome";v="110"
```

## Quality Selection Debug Headers

Headers that show how quality decisions were made:

```
X-Quality-Selection: 80 (auto)
X-Quality-Save-Data: not-present
X-Quality-Network-Type: 4g (good)
X-Quality-Device-Memory: 8GB (high)
X-Quality-Device-CPU: 8 cores (high)
X-Quality-DPR-Adjustment: +5 (for DPR 2)
```

## Performance Debug Headers

When `includePerformance` is enabled, timing information is included:

```
X-Request-Start-Time: 2023-04-15T12:34:56.789Z
X-Storage-Fetch-Time: 35ms
X-Transform-Preparation-Time: 5ms
X-Transform-Time: 125ms
X-Cache-Processing-Time: 2ms
X-Total-Processing-Time: 157ms
```

## HTML Debug Report

For a more comprehensive view, you can access the HTML debug report:

```
https://your-worker.com/debug-report?url=https://your-worker.com/path/to/image.jpg
```

The HTML report includes all the debug information plus:

- Request information
- Full headers (request and response)
- Transformation options applied
- Cache configuration
- Performance timeline
- Error information (if any)
- Raw image data details

## Security Considerations

Debug headers are restricted by default to certain environments for security reasons:

1. In production, debug mode is disabled by default
2. The `allowedEnvironments` setting controls where debug is allowed
3. Debug can be forcefully enabled with `forceDebugHeaders` for testing
4. The `?debug=true` parameter can be disabled in sensitive environments

## Best Practices

1. **Development**: Enable all debug headers for maximum visibility
2. **Staging**: Enable selective debug headers for testing
3. **Production**: Disable debug headers by default, enable only when troubleshooting
4. **Security**: Be cautious with sensitive information in debug headers
5. **Performance**: Be aware that generating debug headers adds processing overhead

## Troubleshooting

### Debug Headers Not Showing

If debug headers aren't appearing in responses:

1. Verify `debug.enabled` is set to true in configuration
2. Check if you're in an allowed environment (`allowedEnvironments` setting)
3. Try adding `?debug=true` to the URL directly
4. Check if your browser or tool is displaying all response headers
5. Try using curl with `-v` flag to see all headers

### Incorrect or Missing Information

If debug headers show incorrect or missing information:

1. Check if the right header categories are enabled
2. Verify client hints are properly configured on your origin
3. Ensure `Permissions-Policy` headers are not blocking client hints
4. Enable verbose mode for more detailed information
5. Try the HTML debug report for a more comprehensive view

## Related Resources

- [Core Architecture: Debug Tools](../core/architecture.md#8-debug-tools-debugts)
- [Configuration Reference: Debug Settings](../core/configuration-reference.md)
- [Client Detection Framework](../client-detection/index.md)
- [Diagnosing Timeouts](diagnosing-timeouts.md)
- [Logging System](logging.md)
- [Breadcrumb Tracing](breadcrumbs.md)

---

*Last Updated: March 22, 2025*