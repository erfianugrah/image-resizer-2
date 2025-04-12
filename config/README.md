# Configuration Directory

This directory contains the configuration files for the Image Resizer system, organized into a modular structure.

## Directory Structure

- `modules/` - Individual configuration modules (core, storage, transform, cache)
- `comprehensive/` - Complete configuration files combining all modules

## Quick Start

```bash
# Deploy configuration to production
npm run config:deploy

# Update specific module
npm run config:update:storage
```

## Module Overview

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

## Documentation

For full documentation on configuration management:
- [Configuration Management Guide](../scripts/README.md) - Comprehensive documentation 
- [Simplified Commands Guide](../docs/public/configuration/simplified-commands.md) - Quick reference
- [Configuration API Documentation](../docs/public/configuration/api.md) - API details