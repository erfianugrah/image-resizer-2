# Simplified Configuration Commands

This guide provides easy-to-use commands for common configuration tasks.

## Quick Start Commands

| Task | Command | Description |
|------|---------|-------------|
| **Deploy all modules** | `npm run config:deploy` | Upload all modules to production |
| **Deploy to dev** | `npm run config:deploy:dev` | Upload all modules to development |
| **Update storage** | `npm run config:update:storage` | Update storage module in production |
| **Update transform** | `npm run config:update:transform` | Update transform module in production |
| **Update cache** | `npm run config:update:cache` | Update cache module in production |
| **Update core** | `npm run config:update:core` | Update core module in production |
| **Fix issues** | `npm run config:fix` | Complete configuration repair |
| **View configuration** | `npm run config:get -- -e production` | View active configuration |
| **List modules** | `npm run config:list` | Show all available modules |
| **Diagnose issues** | `npm run config:diagnose` | Diagnose and fix configuration |

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

### Development Environment

All commands that target production have development equivalents:

```bash
# Development versions
npm run config:deploy:dev
npm run config:update:storage:dev
npm run config:update:transform:dev
npm run config:update:cache:dev
npm run config:update:core:dev
npm run config:diagnose:dev
```

### Viewing Current Configuration

```bash
# Get current configuration from development
npm run config:get -- -e dev

# Get current configuration from production
npm run config:get -- -e production
```

## Advanced Usage

For more advanced use cases, you can use these commands:

```bash
# Validate a module
npm run config:modules:validate -- storage

# List all modules
npm run config:list

# Extract modules from a comprehensive config
npm run config:comprehensive:extract -- path/to/config.json

# Direct CLI usage
npm run config -- modules upload-kv storage --env production

# Get help
npm run config:help
```

For full documentation, see the [Configuration Management Guide](../../scripts/README.md).