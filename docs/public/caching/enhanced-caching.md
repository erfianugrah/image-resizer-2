# Enhanced Caching System

This document describes the advanced caching system implemented in Image Resizer 2, including intelligent TTL management, stale-while-revalidate pattern, enhanced cache tagging, and the new modular cache architecture.

## Table of Contents

- [Overview](#overview)
- [Modular Cache Architecture](#modular-cache-architecture)
- [Cache TTL Management](#cache-ttl-management)
- [Simplified KV Transform Cache](#simplified-kv-transform-cache)
- [Stale-While-Revalidate Pattern](#stale-while-revalidate-pattern)
- [Cache Bypass Mechanisms](#cache-bypass-mechanisms)
- [Cache Tags](#cache-tags)
- [Resource Hints](#resource-hints)
- [Cache Metrics](#cache-metrics)
- [Resilience Patterns](#resilience-patterns)
- [Environment-Specific Configurations](#environment-specific-configurations)

## Overview

The Image Resizer 2 caching system provides intelligent, content-aware caching with multiple fallback mechanisms, designed to:

- Maximize cache hit rates
- Provide fresh content while minimizing origin load
- Support flexible TTL policies based on content type and path
- Enable fine-grained cache invalidation through tagging
- Enhance resilience through fallback patterns
- Improve maintainability through modular architecture

## Modular Cache Architecture

The caching system has been refactored into a modular, service-oriented architecture with specialized components:

### Core Components

1. **CachePerformanceManager**: Records metrics and adds resource hints to responses
   - Tracks hit/miss rates with detailed categorization
   - Adds preconnect and preload hints for optimal client performance
   - Integrates with the performance metrics system

2. **CacheTagsManager**: Handles generation and application of cache tags
   - Generates consistent cache tags based on content and context
   - Applies tags to both Cloudflare's managed cache and Cache API
   - Supports tag-based purging for fine-grained invalidation

3. **CacheHeadersManager**: Manages cache-related HTTP headers
   - Sets appropriate Cache-Control directives
   - Adds Cloudflare-specific cache headers
   - Handles Surrogate-Control and CDN-specific directives

4. **CacheBypassManager**: Controls when to bypass the cache
   - Processes bypass request parameters and headers
   - Implements path-based and content-based bypass rules
   - Manages development and debugging bypass modes

5. **TTLCalculator**: Determines appropriate TTL values
   - Calculates optimal TTL based on content type, path, and dimensions
   - Handles different status code TTLs (success vs error)
   - Respects origin cache directives when appropriate

6. **CacheFallbackManager**: Provides graceful degradation
   - Manages fallback mechanisms when primary cache fails
   - Implements header-only caching for minimal overhead
   - Tracks fallback usage for monitoring and optimization

7. **CacheResilienceManager**: Implements reliability patterns
   - Provides retry mechanisms with exponential backoff
   - Implements circuit breaker to prevent cascading failures
   - Isolates failures to maintain system stability

8. **CloudflareCacheManager**: Interfaces with Cloudflare-specific caching
   - Integrates with Cloudflare's managed caching system
   - Applies Cloudflare-specific optimizations and headers
   - Manages cf-cache-status tracking and reporting

### Architecture Benefits

The modular architecture provides several advantages:

1. **Improved Maintainability**:
   - Each module has a single responsibility
   - Changes to one aspect don't affect others
   - Clearer code organization and documentation

2. **Enhanced Testability**:
   - Components can be tested in isolation
   - Mock dependencies for focused unit tests
   - Simpler test setup and maintenance

3. **Better Error Handling**:
   - Specialized error types for each component
   - Clearer error messages and tracking
   - Isolated failure domains prevent cascading issues

4. **Future Extensibility**:
   - New cache features can be added as modules
   - Easier to implement A/B testing of cache strategies
   - Clear extension points for new functionality

## Simplified KV Transform Cache

The system now uses a simplified KV transform cache implementation that:

1. **Uses Human-Readable Keys**:
   - Key format: `transform:{hash}:{dimensions}:{options}` for clearer debugging
   - No separate index structures or lookups required
   - Direct key access for improved performance

2. **Stores Metadata in KV Metadata Fields**:
   - Metadata retrieved without fetching binary data
   - Headers and options stored in metadata for fast access
   - Content type explicitly set to prevent format issues
   - Aspect crop information included to prevent duplicate processing

3. **Optimizes KV Operations**:
   - Single KV operation per cache get/put
   - No index updates or maintenance required
   - Reduced bandwidth usage for metadata-only queries

4. **Validates Content Types**:
   - Ensures cached binary data is properly formatted
   - Prevents serving invalid responses to clients
   - Handles edge cases for different image formats

## Cache TTL Management

The system employs intelligent TTL (Time-To-Live) determination based on multiple factors:

### Content Type-Based TTL

Different content types receive appropriate TTLs:

- **SVG Images**: Cached longer (14+ days) as they rarely change and are typically static assets
- **Modern Formats** (AVIF, WebP): Cached for extended periods (7+ days) as they indicate optimization focus
- **Standard Formats** (JPEG, PNG): Use the default TTL based on configuration
- **Animated Content** (GIFs): Slightly shorter TTL (3 days) as they may be more dynamic

### Derivative-Based TTL

Different derivatives receive custom TTLs based on their usage patterns:

- **Thumbnails**: 14 days (rarely change)
- **Avatars/Profiles**: 5-7 days (occasionally updated)
- **Banners/Heroes**: 2 days (frequently updated)
- **Icons/Logos**: 30 days (very stable content)
- **Temporary Images**: 1 hour (short-lived by definition)

### Path-Based TTL

URLs containing specific path patterns receive appropriate TTLs:

- **/news/**, **/blog/**: Shorter TTLs (1-24 hours) as content updates frequently
- **/static/**, **/assets/**: Longer TTLs (30 days) as content is static by design
- **/products/**: Medium TTLs (12-24 hours) as product data changes occasionally

### Dimension-Based TTL

Image dimensions influence cache duration:

- **Large Images** (>4 megapixels): Shorter TTLs as they're often hero/feature images that change more often
- **Small Images** (<10,000 pixels): Longer TTLs as they're typically icons, logos, or avatars that change rarely

### Quality-Based TTL

Transformation quality influences cache duration:

- **High Quality** (90+): Moderate TTLs as these are often important display images
- **Low Quality** (<60): Longer TTLs as these are typically thumbnails or previews

### Origin-Aware TTL

The system respects existing cache directives when present:

- Honors `Cache-Control: max-age=X` from origin servers when reasonable
- Uses minimum of calculated TTL and origin max-age

## Stale-While-Revalidate Pattern

The implementation includes the stale-while-revalidate caching pattern, which:

1. Serves stale content immediately while fetching fresh content in the background
2. Updates cache with fresh content without blocking the response
3. Adds appropriate `stale-while-revalidate=X` directives to Cache-Control headers
4. Uses background caching to avoid request blocking

This pattern provides several benefits:

- Eliminates cache stampedes during revalidation
- Reduces perceived latency for users
- Maintains fresh content with minimal origin load
- Provides enhanced resilience when origin is slow or unreachable

## Cache Bypass Mechanisms

The system provides multiple ways to bypass caching when needed:

### Query Parameter Bypass

- `?nocache=1`: Standard bypass
- `?refresh=1`, `?force-refresh=1`: Explicit refresh requests
- `?debug=cache`: Debugging cache behavior
- `?preview=1`, `?dev=1`: Development/preview mode

### Header-Based Bypass

- Standard cache control headers: `Cache-Control: no-cache`, `Cache-Control: no-store`
- `Pragma: no-cache`: Legacy header support
- Admin user detection: `X-Admin: true` header for administrative access

### Path-Based Bypass

- Configured bypass paths like `/admin/`, `/preview/`, `/draft/`
- Automatically bypass caching for debug paths

### Format-Specific Bypass

- Skip caching for experimental formats like `avif-beta` during testing

### Development Environment Bypass

- Option to bypass all caching in development environment

## Cache Tags

Enhanced cache tag generation for granular invalidation:

### Path-Based Tags

- Full path tags: `img-path-products-camera-jpg`
- Path segment tags: `img-segment-0-products`, `img-segment-1-camera`
- Category tags based on path patterns: `img-product`, `img-catalog`

### Content-Based Tags

- Format tags: `img-format-webp`
- Dimension tags: `img-width-800`, `img-height-600`, `img-dimensions-800x600`
- Quality tags: `img-quality-80`
- Derivative tags: `img-derivative-thumbnail`

### Metadata-Based Tags

- Extracted from image metadata headers: `img-meta-category-electronics`
- Content type categorization: `img-type-image`, `img-subtype-jpeg`
- Cache control classification: `img-cc-public`, `img-cc-max-age-1day`

### Usage-Based Tags

- Source type classification: `img-origin-r2`, `img-origin-remote`
- HTTP method tags: `img-method-get`
- Status category tags: `img-status-success`, `img-code-200`

### Size and Dimension Classification

- Size category tags: `img-size-small`, `img-size-medium`, `img-size-large`
- Aspect ratio tags: `img-aspect-portrait`, `img-aspect-landscape`, `img-aspect-square`
- Resolution category tags: `img-resolution-tiny`, `img-resolution-small`, etc.

## Resource Hints

The system adds resource hints for optimal performance:

- Preconnect hints for CDN domains using the Link header
- Preload hints for critical resources based on path patterns
- Adds appropriate headers for HTML responses

## Cache Metrics

The system collects detailed cache performance metrics:

- Cache hit/miss tracking with categorization
- TTL monitoring and optimization
- Path-based performance analysis
- Aspect crop processing time tracking
- KV storage efficiency metrics
- Service-specific performance indicators

## Resilience Patterns

Multiple resilience patterns for high reliability:

### Retry Mechanism

- Configurable retry settings with exponential backoff
- Jitter added to prevent thundering herd problems
- Different settings by environment (dev/prod)

### Circuit Breaker

- Prevents overloading failing systems
- Automatic failure threshold detection
- Configurable reset and success thresholds

### Fallback Pattern

- Graceful degradation when caching fails
- Header-only caching when cache storage fails
- Fault isolation to prevent cascading failures

## Environment-Specific Configurations

The system provides tailored configurations for different environments:

### Development

- Short TTLs for rapid iteration
- More aggressive cache bypass
- Enhanced debug information
- Resource hints disabled to avoid caching during development

### Production

- Longer TTLs for optimal performance
- Limited cache bypass options
- Content-appropriate caching strategies
- Full resource hint optimization

## Migration and Compatibility

The system supports gradual migration from the previous caching implementation:

- Configuration flag to enable the simplified KV cache implementation
- Both implementations can run concurrently during transition
- Automatic detection and compatibility with existing cache entries
- No downtime required for migration
- Clear upgrade path with minimal risk