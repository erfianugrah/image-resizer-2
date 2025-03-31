# Image Resizer Scripts

This directory contains utility scripts for managing, testing, and deploying the Image Resizer service.

## Configuration Management Scripts

### Post Configuration Scripts

- `post-config.sh`: Posts the authentication and path-based origins configuration to the API
- `post-comprehensive-config.sh`: Posts the comprehensive configuration to the API

Usage:
```bash
# Post the auth and path origins configuration
./post-config.sh

# Post the comprehensive configuration
./post-comprehensive-config.sh
```

### Configuration Loading Scripts

- `load-initial-config.js`: JavaScript utility to load the initial configuration into KV storage
- `config-api-demo.js`: Demonstrates programmatic usage of the Configuration API

Usage:
```bash
# Load initial configuration
node load-initial-config.js

# Run the Configuration API demo
node config-api-demo.js
```

## Configuration Files

The configuration examples used by these scripts are located in the `/docs/public/configuration/examples/` directory:

- Authentication and path-based origins: `/docs/public/configuration/examples/auth-and-path-origins-config.json`
- Comprehensive configuration: `/docs/public/configuration/examples/comprehensive-config-runnable.json`

## Documentation

For more information about configuration options and the API, see:

- [Configuration API Documentation](../docs/public/core/configuration-api.md)
- [Configuration Reference](../docs/public/core/configuration-reference.md)
- [Configuration Examples](../docs/public/configuration/examples/)