# Image Resizer Scripts

This directory contains utility scripts for managing, testing, and deploying the Image Resizer service.

## Configuration Management Scripts

### TypeScript Configuration Loader CLI

The `config-loader.ts` script provides a robust TypeScript-based CLI for managing configuration:

#### Prerequisites

Make sure you have the required dependencies:

```bash
npm install --save-dev commander chalk node-fetch dotenv ts-node typescript @types/node @types/node-fetch
```

#### Configuration

Configuration is managed through:
- Environment variables
- `.env` file (use `config:init-env` command to create a template)
- Command-line flags

##### Environment Variables

The CLI uses standardized environment variable names:

| Environment                   | URL Variable             | API Key Variable         |
|------------------------------|-------------------------|-------------------------|
| dev, development             | CONFIG_API_URL_DEV      | CONFIG_API_KEY_DEV      |
| staging, stage               | CONFIG_API_URL_STAGING  | CONFIG_API_KEY_STAGING  |
| prod, production             | CONFIG_API_URL_PROD     | CONFIG_API_KEY_PROD     |
| other                        | CONFIG_API_URL_[ENV]    | CONFIG_API_KEY_[ENV]    |

The tool automatically normalizes environment names (e.g., "production" → "PROD") and falls back to default variables (CONFIG_API_URL, CONFIG_API_KEY) if environment-specific ones aren't found.

#### Commands

```bash
# Post configuration to API
npm run config:post -- ./path/to/config.json --environment dev

# Load configuration to KV
npm run config:load-kv -- ./path/to/config.json --env dev

# Get current configuration
npm run config:get -- --environment prod

# Create .env template
npm run config:init-env

# Module Management Commands
npm run config:modules -- list                                      # List all available modules
npm run config:modules -- get storage                               # Get a specific module
npm run config:modules -- validate storage                          # Validate a module
npm run config:modules -- update storage ./path/to/storage.json     # Update a module
npm run config:modules -- upload-kv storage --env dev               # Upload a module to KV

# Comprehensive Config Commands
npm run config:comprehensive -- create                              # Create from modules
npm run config:comprehensive -- extract ./path/to/config.json       # Extract modules
```

##### Command Options

All commands support the following options:

- `--environment <env>` - Target environment (dev, staging, prod)
- `--api-key <key>` - Override API key from .env file
- `--api-url <url>` - Override API URL from .env file

The CLI will first check for command-line arguments, then environment-specific variables, and finally fall back to default variables.

Run with `--help` for more details on each command:

```bash
npm run config:post -- --help
npm run config:get -- --help
npm run config:load-kv -- --help
```

### Additional Scripts

#### Configuration API Demo

- `config-api-demo.js`: Demonstrates programmatic usage of the Configuration API

Usage:
```bash
# Run the Configuration API demo
node config-api-demo.js
```

## Configuration Files

### Modular Configuration Structure

The new modular configuration is organized in the `/config` directory:

- Individual modules: `/config/modules/`
  - Core module: `/config/modules/core.json`
  - Storage module: `/config/modules/storage.json`
  - Transform module: `/config/modules/transform.json`
  - Cache module: `/config/modules/cache.json`
  
- Comprehensive configuration: `/config/comprehensive/complete-config.json`

### Legacy Configuration Examples

Legacy configuration examples used by these scripts are located in the `/docs/public/configuration/examples/` directory:

- Authentication and path-based origins: `/docs/public/configuration/examples/auth-and-path-origins-config.json`
- Comprehensive configuration: `/docs/public/configuration/examples/comprehensive-config-runnable.json`

## Documentation

For more information about configuration options and the API, see:

- [Modular Configuration Guide](../docs/public/configuration/modular-config-guide.md)
- [Configuration API Documentation](../docs/public/configuration/api.md)
- [Configuration Reference](../docs/public/configuration/index.md)
- [Configuration Examples](../docs/public/configuration/examples/)