# Implementation Plan for Image Resizer 2

## Overview

This document outlines the plan for creating a streamlined image resizer Cloudflare Worker that focuses on simplicity while maintaining essential functionality from the original worker.

## Core Functionality Analysis

The current image-resizer provides the following key functionality:

1. **Image Transformation** - Uses Cloudflare Image Resizing via the `cf` object to transform images
2. **Multiple Storage Options** - Supports R2, remote URLs, and fallbacks  
3. **Responsive Images** - Automatically adjusts sizes based on client hints and device detection
4. **Caching** - Implements both Cloudflare and Cache API caching strategies
5. **Debug Headers** - Provides detailed debugging information in response headers
6. **Derivatives** - Template-based transformations for common use cases

## What We'll Simplify

The current implementation has several complexities we can eliminate:

1. **Strategy/Router Pattern** - The complex strategy/router pattern can be replaced with simple function calls, as we'll use the `cf` object for all transformations
2. **Complex DI System** - The service registry and complex dependency injection system adds overhead
3. **Command Pattern** - We can replace the command pattern with direct function calls
4. **Configuration Complexity** - We'll create a simplified configuration approach

## Implementation Steps

### 1. Create Basic Project Structure

```
/
├── src/
│   ├── config.ts              # Configuration handling
│   ├── index.ts               # Main worker entry point
│   ├── transform.ts           # Image transformation logic
│   ├── storage.ts             # Storage utilities (R2, remote)
│   ├── cache.ts               # Caching utilities
│   ├── debug.ts               # Debug headers
│   └── utils/                 # Utility functions
│       ├── format.ts          # Image format detection
│       ├── responsive.ts      # Responsive sizing
│       └── path.ts            # Path handling utilities
├── test/                      # Tests
└── wrangler.jsonc             # Cloudflare Workers configuration
```

### 2. Implement Core Configuration

Create a simple, unified configuration system that:
- Uses environment variables from Cloudflare
- Has sensible defaults
- Supports development, staging, and production environments

### 3. Implement Storage Strategy

Create a simple storage approach that:
- Detects available storage options (R2, remote URLs)
- Uses a simple priority system to select the best storage

### 4. Implement Transformation Logic

Create a simple transformation system that:
- Takes image options and prepares Cloudflare `cf.image` parameters
- Handles responsive sizing based on client hints
- Supports various transformation options (resize, format, quality, etc.)

### 5. Implement Caching

Implement a simplified caching approach:
- Use Cloudflare cache by default
- Add Cache API as an alternative option
- Use appropriate TTLs based on content type

### 6. Implement Debug Headers

Create a clean debug header system:
- Add useful headers for debugging
- Control debug header visibility with environment settings
- Provide performance metrics when enabled

### 7. Implement Main Handler

Create a clean, concise handler that:
- Processes requests efficiently
- Extracts parameters properly
- Selects the appropriate transformation
- Returns responses with proper headers

## Unified Configuration Approach

We'll use a simplified configuration structure with environment-specific overrides:

```typescript
// Base configuration with sensible defaults
const baseConfig = {
  environment: "development",
  debug: {
    enabled: true,
    headers: ["all"],
    allowedEnvironments: ["development", "staging"]
  },
  cache: {
    method: "cf",
    ttl: 86400,
    cacheability: true
  },
  responsive: {
    breakpoints: [320, 768, 1024, 1440, 1920],
    quality: 85,
    format: "auto"
  },
  storage: {
    priority: ["r2", "remote", "fallback"],
    fallbackUrl: "https://cdn.example.com"
  }
};

// Environment-specific configurations
const environments = {
  development: {
    debug: { enabled: true }
  },
  staging: {
    debug: { enabled: true }
  },
  production: {
    debug: { enabled: false },
    cache: { ttl: 604800 } // 1 week
  }
};
```

## Key Improvements

1. **Simplified Code** - Fewer files, clearer architecture
2. **Consistent Configuration** - Unified configuration with minimal nesting
3. **Direct Approach** - No complex patterns, just direct function calls
4. **Better Performance** - Reduced overhead from unnecessary abstraction
5. **Easier Maintenance** - More straightforward code is easier to understand and maintain
6. **Enhanced Observability** - Comprehensive logging and breadcrumb tracing

## Timeline

1. Basic setup and configuration - 30 minutes
2. Storage utilities implementation - 30 minutes
3. Transformation implementation - 1 hour
4. Caching and debug headers - 1 hour
5. Main handler and integration - 1 hour
6. Testing and refinements - 1 hour
7. Logging system enhancement - 1 hour 
8. Breadcrumb tracing implementation - 2 hours

## Additional Implementations

### Breadcrumb Tracing System

To help diagnose production issues, particularly 524 timeout errors, we've implemented a comprehensive breadcrumb tracing system:

#### Core Components
- Enhanced the `Logger` interface with a `breadcrumb(step, duration, data)` method
- Added breadcrumb tracing throughout all critical components:
  - Main request handler (index.ts)
  - Image transformation (transform.ts)
  - Akamai compatibility layer (utils/akamai-compatibility.ts)
  - Storage operations (storage.ts)
  - Cache operations (cache.ts)
  - Path processing (utils/path.ts)
  - Authentication (utils/auth.ts)
  - Error handling (utils/errors.ts)
  - Debug operations (debug.ts)

#### Configuration
- Added `enableBreadcrumbs` to the logging configuration
- Made breadcrumbs configurable via the `LOGGING_BREADCRUMBS_ENABLED` environment variable
- Ensured breadcrumbs respect the configured log level

#### Documentation
- Created detailed documentation for the logging system (docs/LOGGING.md)
- Added a guide for diagnosing timeout errors (docs/DIAGNOSING_TIMEOUTS.md)
- Created a breadcrumb reference guide (docs/BREADCRUMB_REFERENCE.md)

#### Implementation Pattern
- Used consistent format: `logger.breadcrumb(step, duration, data)`
- Added timing information for performance tracking
- Added visual markers (🔶) for easier identification
- Used structured formatting for both JSON and plain text logs