# Image Resizer Configuration Examples

This directory contains example configurations for the Image Resizer service. These configurations demonstrate various features and use cases to help you get started quickly with your own implementation.

## Available Examples

### Authentication and Path-Based Origins Configuration

File: [auth-and-path-origins-config.json](./auth-and-path-origins-config.json)

This example demonstrates:
- Multiple storage origin configurations with authentication
- Path-based origin routing for different content types
- R2 bucket configuration for different content types
- Path transformations for each path pattern
- Cache TTL settings based on content type
- Cache tagging for efficient purging

Use this configuration when you need to:
- Serve images from multiple sources (R2, S3, API endpoints)
- Use different authentication methods for different origins
- Route image requests to different origins based on path patterns
- Apply different caching strategies for different content types

### Usage

To use these example configurations:

1. Copy the example that best matches your needs
2. Modify the parameters to match your requirements
3. Load the configuration using the Configuration API:

```bash
# Using curl to upload the configuration
curl -X POST https://your-worker.example.com/config \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  --data-binary @auth-and-path-origins-config.json
```

Or load it programmatically during worker startup from a KV namespace:

```javascript
// In your worker initialization
const config = await env.CONFIG_KV.get('image-resizer-config', { type: 'json' });
if (!config) {
  // Load initial configuration if not found
  const initialConfig = {/* your config here */};
  await env.CONFIG_KV.put('image-resizer-config', JSON.stringify(initialConfig));
}
```

## Configuration Structure

The configuration follows a modular structure:

- **core**: Core settings including environment, version, debug, and logging
- **storage**: Storage configuration including R2, remote origins, and authentication
- **transform**: Image transformation settings including responsive breakpoints and derivatives
- **cache**: Caching configuration including TTLs, cache tags, and bypass rules

For a complete reference of all available configuration options, see the [Configuration Reference](../../docs/public/core/configuration-reference.md) documentation.