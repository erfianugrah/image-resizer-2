# Configuration Examples

This directory contains example configurations for the Image Resizer service. These examples demonstrate different features and use cases to help you get started with your own implementation.

## Available Examples

### Comprehensive Configuration Example

[Comprehensive Configuration Documentation](./comprehensive-config.md)

Files:
- [Comprehensive Config Example with Comments](./comprehensive-config-example.jsonc)
- [Runnable Config Example](./comprehensive-config-runnable.json)

This example provides a complete configuration with:
- Core settings for environment, debug, and logging
- Storage configuration with multiple origins and authentication
- Transform settings for image resizing and optimization
- Cache configuration with TTLs and tags
- Path-based routing for different content types

### Authentication and Path-Based Origins

[Auth and Path Origins Documentation](./auth-path-origins.md)

File:
- [Auth and Path Origins Config](./auth-and-path-origins-config.json)

This example focuses on:
- Multiple storage origin configurations with authentication
- Path-based origin routing for different content types
- R2 bucket configuration for different content types
- Path transformations for each path pattern

### Configuration Templates

The `templates` directory contains ready-to-use configuration templates for different environments:

- [Simplified Configuration Template](./templates/example-simplified-config.json) - A basic configuration example with minimal settings
- [Initial Configuration Template](./templates/initial-config.json) - The initial configuration used for a new deployment
- [Production Configuration Template](./templates/production-config.json) - A comprehensive example with production-ready settings

These templates can be used as starting points for your own configurations.

## Using These Examples

To use these examples:

1. Review the example that best matches your needs
2. Copy and modify the JSON configuration
3. Upload using the Configuration API:

```bash
curl -X POST https://your-worker.example.com/api/config \
  -H "Content-Type: application/json" \
  -H "X-Config-API-Key: your-api-key" \
  -d @path-to-your-config.json
```

For more details, see the [Configuration API documentation](../core/configuration-api.md).