# Configuration Management System

This directory contains the configuration files for the Image Resizer system, organized into a modular structure.

## Directory Structure

- `modules/` - Individual configuration modules (core, storage, transform, cache)
- `comprehensive/` - Complete configuration files combining all modules
- `scripts/` - Configuration management scripts and utilities

## Configuration Modules

Each module represents a specific concern in the system:

### Core Module (`modules/core.json`)

Contains fundamental system settings:
- Environment configuration
- Debug settings
- Feature flags
- Logging configuration

### Storage Module (`modules/storage.json`)

Configures where and how images are stored:
- Storage sources (R2, remote URLs, fallback URLs)
- Authentication settings
- Path transformations
- Path-based origin routing

### Transform Module (`modules/transform.json`)

Controls image transformation settings:
- Default transformation options
- Format-specific quality settings
- Pre-defined derivative configurations
- Size code definitions

### Cache Module (`modules/cache.json`)

Manages caching behavior:
- Cache method and TTL configuration
- Path-based TTL settings
- Cache tag management
- Transform cache settings

## Using the Configuration CLI

The Image Resizer includes a CLI tool for managing configurations:

### Direct CLI Usage

```bash
# List all available modules
npx ts-node scripts/config-loader.ts modules list

# Get a specific module
npx ts-node scripts/config-loader.ts modules get storage

# Validate a module
npx ts-node scripts/config-loader.ts modules validate storage

# Update a module
npx ts-node scripts/config-loader.ts modules update storage path/to/new-storage.json

# Upload a module to KV store
npx ts-node scripts/config-loader.ts modules upload-kv storage --env dev

# Create a comprehensive config from modules
npx ts-node scripts/config-loader.ts comprehensive create

# Extract modules from a comprehensive config
npx ts-node scripts/config-loader.ts comprehensive extract path/to/config.json

# Load a comprehensive config to KV
npx ts-node scripts/config-loader.ts load-kv path/to/config.json --env dev
```

### NPM Script Commands

For convenience, npm scripts have been added for common configuration tasks:

```bash
# Module Management
npm run config:modules              # Access module commands
npm run config:modules:list         # List all modules
npm run config:modules:get -- core  # Get a specific module
npm run config:modules:validate -- storage  # Validate a module
npm run config:modules:upload-kv -- cache --env dev  # Upload to KV

# Comprehensive Configuration
npm run config:comprehensive              # Access comprehensive commands
npm run config:comprehensive:create       # Create from modules
npm run config:comprehensive:extract      # Extract to modules

# Quick Fixes
npm run config:fix-storage          # Fix storage module in dev environment
```

## Configuration Structure

All modules follow a consistent structure:

```json
{
  "_meta": {
    "name": "moduleName",
    "version": "1.0.0",
    "description": "Module description"
  },
  "config": {
    // Module-specific configuration properties
  }
}
```

The comprehensive configuration combines all modules into a single file:

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

## Module Uploads

When uploading modules to the KV store, they are stored with keys in the format:

- `config_module_core` - Core module
- `config_module_storage` - Storage module
- `config_module_transform` - Transform module
- `config_module_cache` - Cache module

The complete configuration is stored under the key `config_current`.