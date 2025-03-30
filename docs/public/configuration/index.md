# Configuration System

The Image Resizer supports a flexible configuration system with multiple options for managing configuration values.

## Configuration API

The [Configuration API](./api.md) provides a dynamic, modular approach to configuration management with:

- Version control for configuration changes
- Environment-specific settings
- Schema validation
- Module-based organization

## Simplified Structure

The configuration system uses a simplified structure that balances flexibility and maintainability:

- **Core Module**: Environment, debug settings, and feature flags
- **Transform Module**: Image transformation settings
- **Cache Module**: Caching behavior and TTLs
- **Storage Module**: Image storage sources
- **Client Module**: Client detection and responsive settings
- **Security Module**: Security headers and access control
- **Monitoring Module**: Performance tracking and error reporting

## Example Configuration

```json
{
  "core": {
    "environment": "production",
    "debug": {
      "enabled": false
    }
  },
  "transform": {
    "formats": {
      "preferWebp": true
    }
  },
  "cache": {
    "method": "cf",
    "ttl": {
      "default": 86400
    }
  }
}
```

See the [complete example](../../examples/configuration/example-simplified-config.json) for more details.

## Environment Variables

Configuration values can reference environment variables using `${VAR_NAME}` syntax:

```json
{
  "storage": {
    "remote": {
      "url": "${REMOTE_URL}"
    }
  }
}
```

## Setting Up Configuration

1. Create a KV namespace for configuration storage:
   ```
   wrangler kv:namespace create CONFIG_STORE
   ```

2. Add the KV namespace binding to your wrangler.toml:
   ```toml
   kv_namespaces = [
     { binding = "CONFIG_STORE", id = "..." }
   ]
   ```

3. Upload your initial configuration using the CLI tool or API

## Further Reading

- [Configuration API Documentation](./api.md)
- [Schema Reference](./schema.md)
- [Migration Guide](./migration.md)