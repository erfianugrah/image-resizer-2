# Image Resizer Internal Documentation

This section contains internal documentation for the Image Resizer project, including development plans, architecture decisions, and implementation details.

## Development

- [Service Architecture](development/service-architecture.md) - Service-oriented architecture design
- [Refactoring Implementation Plan](development/refactoring-implementation-plan.md) - Plan for refactoring to services
- [Testing Strategy](development/testing-strategy.md) - Approach to testing the codebase
- [Service Lifecycle Implementation](development/service-lifecycle-implementation.md) - Service lifecycle management
- [Service Test Guidelines](development/service-test-guidelines.md) - Guidelines for testing services

## Refactoring

- [Parameter Modularization](refactoring/parameter-modularization.md) - Modularizing transformation parameters
- [Cloudflare Transform](refactoring/cloudflare-transform.md) - Refactoring Cloudflare transformation logic
- [Cloudflare Auth](refactoring/cloudflare-auth.md) - Refactoring authentication for Cloudflare
- [Akamai Parameters](refactoring/akamai-params.md) - Refactoring Akamai parameter handling

## Fixes

- [Aspect Ratio Metadata Fix](fixes/aspect-ratio-metadata-fix.md) - Fix for aspect ratio preservation in metadata
- [Duplicate Processing Fix](fixes/duplicate-processing-fix.md) - Fix for duplicate image processing
- [Error Handling Enhancements](fixes/error-handling-enhancements.md) - Improvements to error handling

## Improvements

- [Advanced Client Detection](improvements/advanced-client-detection.md) - Enhanced client detection capabilities
- [Cache Improvements](improvements/cache-improvements-summary.md) - Summary of cache optimization work
- [Debug UI Enhancement](improvements/debug-ui-enhancement.md) - Enhancements to debug UI
- [Client Detection Improvements](improvements/client-detection-improvements.md) - Improved client detection

## Performance

- [Performance Optimization Recommendations](performance/performance-optimization-recommendations.md) - Performance improvement recommendations
- [Aspect Crop Metadata Optimization](performance/aspect-crop-metadata-optimization.md) - Optimizations for aspect ratio handling
- [Metadata Caching Strategy](performance/metadata-caching-strategy.md) - Strategy for caching metadata
- [Client Detection Optimization](performance/client-detection-optimization.md) - Optimizing client detection

## Architecture

- [Functional Verification](architecture/functional-verification.md) - Verification of functional requirements
- [Improvement Plan](architecture/improvement-plan.md) - Overall improvement roadmap

---

*This documentation is for internal use only and contains implementation details that may change.*