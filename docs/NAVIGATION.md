# Image Resizer Documentation Navigation

This is the central navigation page for Image Resizer documentation. Use this page to find all documentation resources.

## Table of Contents

- [Getting Started](#getting-started)
- [User Documentation](#user-documentation)
  - [Core](#core)
  - [Features](#features)
  - [Configuration](#configuration)
  - [Storage](#storage)
  - [Caching](#caching)
  - [Debugging](#debugging)
  - [Integrations](#integrations)
  - [Examples](#examples)
- [Developer Documentation](#developer-documentation)
  - [Architecture](#architecture)
  - [Development](#development)
  - [Performance](#performance)
  - [Testing](#testing)
  - [Refactoring](#refactoring)
  - [Implementation Details](#implementation-details)
- [Reference](#reference)
  - [API Reference](#api-reference)
  - [Configuration Reference](#configuration-reference)
  - [Error Codes](#error-codes)

## Getting Started

- [README](../README.md) - Project overview and introduction
- [Architecture Overview](public/core/architecture.md) - High-level system architecture
- [Setup Guide](public/core/setup.md) - Installation and configuration
- [Quick Start](public/core/setup.md) - Quick start guide
- [Configuration Overview](public/configuration/index.md) - Basic configuration

## User Documentation

### Core

- [Architecture Overview](public/core/architecture.md) - System architecture
- [Setup Guide](public/core/setup.md) - Installation and configuration
- [Transformation](public/core/transformation.md) - Image transformation capabilities
- [Path Service](public/core/path-service.md) - Path handling and URL structure
- [Authentication](public/storage/authentication.md) - Authentication system
- [Dependency Injection](public/core/dependency-injection.md) - Service container

### Features

- [Format Selection](public/features/format-selection.md) - Automatic and manual format selection
- [Quality Optimization](public/features/quality-optimization.md) - Quality settings and optimization
- [Responsive Images](public/features/responsive-images.md) - Automatic responsive image sizing
- [Format JSON Integration](public/features/format-json-integration.md) - JSON metadata format
- [Format JSON Usage](public/features/format-json-usage.md) - Using JSON metadata format
- [Format JSON Workflow](public/features/format-json-workflow.md) - JSON metadata workflow

### Configuration

- [Configuration System](public/configuration/index.md) - Overview of the configuration system
- [Configuration API](public/configuration/api.md) - Configuration API documentation
- [Modular Configuration](public/configuration/modular-config-guide.md) - Modular configuration guide
- [Parameter Handling](public/configuration/parameter-handling.md) - Parameter system
- [Parameter Validation](public/configuration/parameter-validation.md) - Validation of parameters
- [Migration Guide](public/configuration/migration-guide.md) - Migration from previous versions
- [Migration Example](public/configuration/migration-example.md) - Example migration
- [Simplified Commands](public/configuration/simplified-commands.md) - Simplified command reference
- [Setup](public/configuration/setup.md) - Configuration setup guide
- [Troubleshooting](public/configuration/troubleshooting.md) - Configuration troubleshooting

**Configuration Examples:**
- [Comprehensive Config](public/configuration/examples/comprehensive-config.md) - Full configuration example
- [Auth & Path Origins](public/configuration/examples/auth-path-origins.md) - Authentication and path origins example

### Storage

- [Storage Overview](public/storage/index.md) - Storage system overview
- [Authentication](public/storage/authentication.md) - Image origin authentication
- [Path-Based Origins](public/storage/path-based-origins.md) - Dynamic origin selection
- [Path Transforms](public/storage/path-transforms.md) - Path transforms for storage

### Caching

- [Caching Overview](public/caching/index.md) - Overview of caching system
- [Cache Tags](public/caching/cache-tags.md) - Advanced cache tag system
- [Enhanced Caching](public/caching/enhanced-caching.md) - Performance optimizations
- [Cloudflare Optimizations](public/caching/cloudflare-optimizations.md) - Cloudflare-specific optimizations
- [Cache Performance Manager](public/caching/cache-performance-manager.md) - Performance monitoring
- [Integration](public/caching/integration.md) - Cache integration
- [KV Transform Cache](public/caching/kv-transform-cache.md) - KV-based transform caching
- [Transform Caching](public/caching/transform/index.md) - Transform caching system
- [Optimized Purging](public/caching/transform/optimized-purging.md) - Advanced cache purging

### Debugging

- [Debugging Overview](public/debugging/index.md) - Debugging tools overview
- [Logging](public/debugging/logging.md) - Logging system
- [Debug Headers](public/debugging/debug-headers.md) - Debug headers and HTML reports
- [Breadcrumbs](public/debugging/breadcrumbs.md) - Request tracing with metrics
- [Diagnosing Timeouts](public/debugging/diagnosing-timeouts.md) - Resolving 524 timeout errors

### Client Detection

- [Client Detection](public/client-detection/index.md) - Client detection framework
- [Architecture](public/client-detection/architecture.md) - Client detection architecture
- [Browser Compatibility](public/client-detection/browser-compatibility.md) - Browser support

### Integrations

- [Akamai Integration](public/integrations/akamai/index.md) - Akamai Image Manager compatibility
- [Basic Features](public/integrations/akamai/basic-features.md) - Basic Akamai features
- [Advanced Features](public/integrations/akamai/advanced-features.md) - Advanced Akamai features
- [Implementation](public/integrations/akamai/implementation.md) - Akamai implementation details
- [Demos](public/integrations/akamai/demos.md) - Akamai demo examples
- [Cloudflare Integration](public/integrations/cloudflare/index.md) - Cloudflare integration
- [Interceptor Pattern](public/integrations/cloudflare/interceptor-pattern.md) - Cloudflare interceptor pattern

### Examples

- [Examples Overview](public/examples/index.md) - Implementation examples
- [Path-Based Origins Example](public/examples/path-based-origins-example.md) - Path-based origins example
- [Watermark Examples](public/examples/watermark-examples.md) - Watermark configuration examples
- [Watermark Implementation](public/examples/watermark-implementation.md) - Watermark implementation details

## Developer Documentation

### Architecture

- [Architecture Overview](internal/architecture/index.md) - Internal architecture overview
- [Functional Verification](internal/architecture/functional-verification.md) - Functional requirements verification
- [Improvement Plan](internal/architecture/improvement-plan.md) - Architecture improvement roadmap

### Development

- [Service Architecture](internal/development/service-architecture.md) - Service-oriented architecture design
- [Refactoring Implementation Plan](internal/development/refactoring-implementation-plan.md) - Implementation plan for services
- [Refactoring Implementation Update](internal/development/refactoring-implementation-plan-update.md) - Updated plan
- [Testing Strategy](internal/development/testing-strategy.md) - Testing approach
- [Service Lifecycle Implementation](internal/development/service-lifecycle-implementation.md) - Service lifecycle details
- [Service Lifecycle Summary](internal/development/service-lifecycle-summary.md) - Service lifecycle overview
- [Service Test Guidelines](internal/development/service-test-guidelines.md) - Service testing guidelines
- [Test Implementation Handoff](internal/development/test-implementation-handoff.md) - Testing handoff process
- [Detector Service Implementation](internal/development/detector-service-implementation.md) - Detector service details
- [Logging Service Implementation](internal/development/logging-service-implementation.md) - Logging service details
- [Debug Service Refactoring](internal/development/debugService-refactoring.md) - Debug service refactoring
- [Cache Service Refactoring](internal/development/cacheService-refactoring.md) - Cache service refactoring
- [Transformation Service Refactoring](internal/development/transformService-refactoring.md) - Transform service refactoring
- [Codebase Refactoring](internal/development/codebase-refactoring.md) - Overall codebase refactoring
- [Config API Design](internal/development/config-api-design.md) - Configuration API design
- [Configuration API Enhancements](internal/development/configuration-api-enhancements.md) - API enhancements
- [Lifecycle Manager Implementation](internal/development/lifecycle-manager-implementation.md) - Lifecycle manager details
- [Migration Examples](internal/development/migration-examples.md) - Migration examples
- [KV Transform Cache Design](internal/development/kv-transform-cache-design.md) - KV cache design
- [KV Transform Cache Implementation](internal/development/kv-transform-cache-implementation.md) - KV cache implementation
- [KV Transform Cache Simplified](internal/development/kv-transform-cache-simplified.md) - Simplified KV cache
- [Modular Cache Architecture](internal/development/modular-cache-architecture.md) - Modular cache design
- [Cache Finalization Plan](internal/development/cache-finalization-plan.md) - Cache finalization
- [Cache Performance Manager](internal/development/cache-performance-manager.md) - Performance manager
- [Cache Refactoring Summary](internal/development/cache-refactoring-summary.md) - Refactoring summary
- [Utility Removal Plan](internal/development/utility-removal-plan.md) - Utility removal plan
- [Cache Migration Guide](internal/development/cache-migration-guide.md) - Cache migration guide
- [Cache Logging Strategy](internal/development/cache-logging-strategy.md) - Cache logging strategy
- [Cache Logging Enhancement Plan](internal/development/cache-logging-enhancement-plan.md) - Logging enhancement plan

### Configuration

- [Parameter Processing](internal/configuration/parameter-processing.md) - Parameter processing details
- [Schema Validation Implementation](internal/configuration/schema-validation-implementation.md) - Schema validation
- [Simplified Config Structure](internal/configuration/simplified-config-structure.md) - Simplified structure
- [Config Improvements Summary](internal/configuration/config-improvements-summary.md) - Improvements summary
- [Config Documentation Improvement Plan](internal/configuration/config-documentation-improvement-plan.md) - Documentation plan

### Performance

- [Performance Overview](internal/performance/index.md) - Performance optimization overview
- [Performance Optimization Recommendations](internal/performance/performance-optimization-recommendations.md) - Optimization recommendations
- [Aspect Crop Metadata Optimization](internal/performance/aspect-crop-metadata-optimization.md) - Metadata optimizations
- [Client Detection Optimization](internal/performance/client-detection-optimization.md) - Client detection optimizations
- [Metadata Caching Strategy](internal/performance/metadata-caching-strategy.md) - Metadata caching
- [Cache Optimizations](internal/performance/cache-optimizations.md) - Cache performance optimizations
- [Cache Logging Enhancements](internal/performance/cache-logging-enhancements.md) - Cache logging improvements

### Improvements

- [Improvements Overview](internal/improvements/index.md) - Improvements overview
- [Advanced Client Detection](internal/improvements/advanced-client-detection.md) - Enhanced client detection
- [Cache Improvements Summary](internal/improvements/cache-improvements-summary.md) - Cache improvements summary
- [Client Detection Improvements](internal/improvements/client-detection-improvements.md) - Client detection improvements
- [Debug UI Enhancement](internal/improvements/debug-ui-enhancement.md) - Debug UI improvements
- [Error Handling Enhancements](internal/improvements/error-handling-enhancements.md) - Error handling improvements

### Fixes

- [Aspect Ratio Metadata Fix](internal/fixes/aspect-ratio-metadata-fix.md) - Aspect ratio fix
- [Cache Key Generation Fix](internal/fixes/cache-key-generation-fix.md) - Cache key fix
- [Duplicate Processing Fix](internal/fixes/duplicate-processing-fix.md) - Duplicate processing fix
- [Image Resizer Optimizations](internal/fixes/image-resizer-optimizations.md) - Resizer optimizations
- [Parameter Cache Key Fix](internal/fixes/parameter-cache-key-fix.md) - Parameter cache key fix

### Refactoring

- [Parameter Modularization](internal/refactoring/parameter-modularization.md) - Parameter modularization
- [Parameter Modularization Progress](internal/refactoring/parameter-modularization-progress.md) - Progress update
- [Cloudflare Transform](internal/refactoring/cloudflare-transform.md) - Cloudflare transform
- [Cloudflare Draw](internal/refactoring/cloudflare-draw.md) - Cloudflare draw
- [Cloudflare Auth](internal/refactoring/cloudflare-auth.md) - Cloudflare auth
- [Akamai Parameters](internal/refactoring/akamai-params.md) - Akamai parameters

## Reference

### API Reference

- [Service Interfaces](internal/development/service-architecture.md#service-interfaces) - Service interface definitions
- [Configuration API Reference](public/configuration/api.md) - Configuration API
- [Transformation Options](public/core/transformation.md#options-reference) - Transformation options

### Configuration Reference

- [Configuration Reference](public/core/configuration-reference.md) - Complete configuration reference
- [Default Configuration](public/configuration/examples/templates/initial-config.json) - Default configuration
- [Production Configuration](public/configuration/examples/templates/production-config.json) - Production configuration

### Error Codes

- [Error Reference](internal/improvements/error-handling-enhancements.md) - Error code reference