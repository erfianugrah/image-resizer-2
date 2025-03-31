# Image Resizer Configuration Examples

This directory contains comprehensive configuration examples for the Image Resizer service. These examples demonstrate various features and use cases of the configuration system.

## Available Examples

### Comprehensive Configuration

- [Comprehensive Configuration Documentation](./comprehensive-config.md)
- [Comprehensive Config Example with Comments](./comprehensive-config-example.jsonc)
- [Runnable Config Example](./comprehensive-config-runnable.json)

This example provides a complete configuration with detailed comments explaining all available options.

### Authentication and Path-Based Origins

- [Auth and Path Origins Documentation](./auth-path-origins.md)
- [Auth and Path Origins Config](./auth-and-path-origins-config.json)

This example demonstrates setting up multiple storage origins with different authentication methods and path-based routing.

## Using These Examples

You can use these examples:

1. As reference for your own configuration
2. As starting points for your implementation
3. To learn about available options and best practices

To upload a configuration using the Configuration API:

```bash
curl -X POST https://your-worker.example.com/api/config \
  -H "Content-Type: application/json" \
  -H "X-Config-API-Key: your-api-key" \
  -d @path-to-your-config.json
```

Or use the provided script:

```bash
# In the scripts directory
cd /path/to/scripts
./post-config.sh
```

For more details, see the [Configuration API documentation](../core/configuration-api.md) and the [Configuration Reference](../core/configuration-reference.md).