# Configuration Management

This guide provides a streamlined approach to managing configuration for the Image Resizer system.

## Quick Start

| Task | Command | Description |
|------|---------|-------------|
| **Deploy all modules** | `npm run config:deploy` | Upload all modules to production |
| **Deploy to dev** | `npm run config:deploy:dev` | Upload all modules to development |
| **Update storage** | `npm run config:update:storage` | Update storage module in production |
| **Fix issues** | `npm run config:fix` | Complete configuration repair |
| **View configuration** | `npm run config:get -- -e production` | View active configuration |
| **List modules** | `npm run config:list` | Show all available modules |
| **Diagnose issues** | `npm run config:diagnose` | Diagnose and fix configuration |

## Configuration Structure

The configuration system uses a modular approach:

- **Individual Modules** (`/config/modules/`):
  - `core.json`: Core application settings
  - `storage.json`: Storage configuration (R2, remote URLs, fallbacks)
  - `transform.json`: Image transformation settings
  - `cache.json`: Caching behavior and settings

- **Comprehensive Configuration**:
  `/config/comprehensive/complete-config.json`: Combined configuration file

## Common Workflows

### Initial Setup

```bash
# One-step deployment to development
npm run config:deploy:dev

# Once tested, deploy to production
npm run config:deploy
```

These commands handle everything automatically - they create the comprehensive configuration from modules, upload it to KV, and set it as the active configuration.

### Making Changes to Configuration

1. Edit the module file directly in the `config/modules/` directory
2. Then deploy the specific module:

```bash
# For storage module in production (default)
npm run config:update:storage

# For storage module in development
npm run config:update:storage:dev
```

When you update individual modules, the system automatically sets the configuration as active. There's no need for a separate activation step.

## Module Management

### Updating Modules

Edit the module file in `/config/modules/` and then update:

```bash
# Update specific modules (defaults to production)
npm run config:update:storage     # Update storage module
npm run config:update:transform   # Update transform module
npm run config:update:cache       # Update cache module
npm run config:update:core        # Update core module

# Specify development environment
npm run config:update:storage:dev # Update in development
```

### Viewing and Diagnosing

```bash
# List all modules
npm run config:list

# View current configuration
npm run config:get -- -e production

# Diagnose and fix issues
npm run config:diagnose
npm run config:fix
```

## Module Structure

Each module follows a standard structure with metadata and configuration:

```json
{
  "_meta": {
    "name": "module-name",
    "version": "1.0.0",
    "description": "Module description"
  },
  "config": {
    // Module-specific configuration
  }
}
```

The comprehensive configuration combines all modules:

```json
{
  "_meta": {
    "version": "1.0.0",
    "lastUpdated": "2025-04-12T10:00:00.000Z",
    "activeModules": ["core", "storage", "transform", "cache"]
  },
  "modules": {
    "core": { /* core module */ },
    "storage": { /* storage module */ },
    "transform": { /* transform module */ },
    "cache": { /* cache module */ }
  }
}
```

## Advanced Usage

### Advanced Commands

For more advanced use cases, you can use the CLI directly:

```bash
# Direct CLI usage
npm run config -- modules upload-kv storage --env production

# Get help for specific commands
npm run config -- modules --help
npm run config -- comprehensive --help
```

### Module Validation and Management

```bash
# Validate a module
npm run config:modules:validate -- storage

# Extract modules from a comprehensive config
npm run config:comprehensive:extract -- path/to/config.json
```

### Environment Setup

Initialize environment variables for the CLI:

```bash
npm run config:init-env
```

This creates a `.env.example` file with the required variables:
- `CONFIG_API_URL_[ENV]` - API URL for each environment
- `CONFIG_API_KEY_[ENV]` - API key for each environment
- `KV_NAMESPACE` - KV namespace for configuration storage
- `KV_KEY` - Default key for storing configuration

### KV Storage Structure

When uploading modules to the KV store, they are stored with keys in the format:

- `config_module_core` - Core module
- `config_module_storage` - Storage module
- `config_module_transform` - Transform module
- `config_module_cache` - Cache module

The comprehensive configuration is stored as a versioned key:
- `config_v1`, `config_v2`, etc. - Configuration versions
- `config_current` - Points to the active version

## Additional Documentation

For more information about configuration options and the API, see:

- [Modular Configuration Guide](../docs/public/configuration/modular-config-guide.md)
- [Configuration API Documentation](../docs/public/configuration/api.md)
- [Configuration Reference](../docs/public/configuration/index.md)
- [Configuration Examples](../docs/public/configuration/examples/)