# Configuration System

The Image Resizer supports a flexible configuration system with multiple options for managing configuration values.

## Configuration API

The [Configuration API](./api.md) provides a dynamic, modular approach to configuration management with:

- Version control for configuration changes
- Environment-specific settings
- Schema validation
- Module-based organization

## Modular Structure

The configuration system uses a modular structure that balances flexibility and maintainability:

- **Core Module**: Environment, debug settings, and feature flags
- **Transform Module**: Image transformation settings
- **Cache Module**: Caching behavior and TTLs
- **Storage Module**: Image storage sources
- **Client Module**: Client detection and responsive settings
- **Security Module**: Security headers and access control
- **Monitoring Module**: Performance tracking and error reporting

Our [Modular Configuration Guide](./modular-config-guide.md) explains how to work with individual configuration modules, including how to:

- Manage module configurations independently
- Create comprehensive configurations from modules
- Use the configuration CLI tool
- Upload modules to KV storage

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

See our [examples directory](./examples/index.md) for more detailed configurations:

- [Comprehensive Configuration](./examples/comprehensive-config.md) - A complete example with all options
- [Auth and Path-Based Origins](./examples/auth-path-origins.md) - Configuration for authentication and path-based origins

The configuration files can be found in the examples directory:
- [comprehensive-config-runnable.json](./examples/comprehensive-config-runnable.json) - Runnable version without comments
- [comprehensive-config-example.jsonc](./examples/comprehensive-config-example.jsonc) - Commented version
- [auth-and-path-origins-config.json](./examples/auth-and-path-origins-config.json) - Authentication and path-based origins

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

3. Upload your initial configuration using the config-loader CLI tool:
   ```
   # Upload individual modules
   npx ts-node scripts/config-loader.ts modules upload-kv core --env dev
   npx ts-node scripts/config-loader.ts modules upload-kv storage --env dev
   
   # Or upload a comprehensive config
   npx ts-node scripts/config-loader.ts load-kv config/comprehensive/complete-config.json --env dev
   ```

## Further Reading

- [Modular Configuration Guide](./modular-config-guide.md)
- [Configuration API Documentation](./api.md)
- [Schema Reference](./schema.md)
- [Migration Guide](./migration-guide.md)
- [Migration Example](./migration-example.md)
- [Example Configurations](./examples/index.md)