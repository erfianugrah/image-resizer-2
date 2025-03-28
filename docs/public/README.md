# Image Resizer Documentation

Welcome to the comprehensive documentation for the Image Resizer service. This documentation is organized by functional areas to help you find what you need quickly.

## Documentation Map

- [Core Documentation](#core-documentation) - Architecture, setup, and core concepts
- [Feature Documentation](#feature-documentation) - Detailed features and capabilities
- [Integrations](#integrations) - Third-party integrations and compatibility
- [Debugging and Development](#debugging-and-diagnostics) - Diagnostics and development tools
- [Examples](#examples) - Practical examples and use cases

## Core Documentation

- [Architecture Overview](core/architecture.md) - Understand the system architecture
- [Setup Guide](core/setup.md) - Instructions for setting up and deploying the service
- [Configuration Reference](core/configuration-reference.md) - Complete configuration options
- [Transformation Guide](core/transformation.md) - Image transformation capabilities

## Feature Documentation

### Storage Options

- [Storage Overview](storage/index.md) - Storage systems (R2, Remote URLs, Fallback)
- [Path Transformations](storage/path-transforms.md) - Path mapping for different storage types
- [Authentication](storage/authentication.md) - Securing image origins
- [Path-Based Origins](storage/path-based-origins.md) - Dynamic origin selection

### Optimization

- [Format Selection](features/format-selection.md) - Automatic and manual format selection
- [Quality Optimization](features/quality-optimization.md) - Quality settings and optimization
- [Client Detection](client-detection/index.md) - Browser and device detection framework
- [Responsive Images](features/responsive-images.md) - Automatic responsive image sizing

### Caching

- [Caching System](caching/index.md) - Caching strategies and configuration
- [Cache Tags](caching/cache-tags.md) - Advanced cache tag system for purging
- [Enhanced Caching](caching/enhanced-caching.md) - Performance optimization techniques

## Integrations

- [Akamai Compatibility](integrations/akamai/index.md) - Support for Akamai Image Manager URLs
- [Cloudflare Integration](integrations/cloudflare/index.md) - Cloudflare-specific features

## Debugging and Diagnostics

- [Logging System](debugging/logging.md) - Comprehensive logging capabilities
- [Breadcrumb Tracing](debugging/breadcrumbs.md) - Request tracing with performance metrics
- [Diagnosing Timeouts](debugging/diagnosing-timeouts.md) - Resolving 524 timeout errors
- [Debug Mode](debugging/debug-headers.md) - Using debug headers and HTML reports

## Examples

- [Watermarking Examples](examples/watermark-examples.md) - Watermark configurations and examples
- [Path-Based Origins Example](examples/path-based-origins-example.md) - Origin configuration examples

---

*Last Updated: March 28, 2025*