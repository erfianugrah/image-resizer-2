# Transformation Service Refactoring

## Overview

This document outlines the refactoring process for the TransformationService component of the image-resizer project, focusing on moving from a utility-based approach to a service-oriented architecture following Domain-Driven Design (DDD) principles.

## Current State (as of March 24, 2025)

We have successfully:

1. Implemented a full `DefaultImageTransformationService` with proper methods for all transformation operations
2. Defined a dedicated `TransformOptions` interface in `services/interfaces.ts`, decoupling from `transform.ts`
3. Updated key utility files to use the new `TransformOptions` interface:
   - `debug.ts`
   - `cache.ts`
   - `utils/akamai-compatibility.ts`
4. Updated the `REFACTORING_PLAN.md` to reflect our progress
5. **[NEW]** Modified `DefaultImageTransformationService` to use `CacheService` for cache operations instead of directly using utility functions

## Detailed Changes

### 1. Creating a Dedicated TransformOptions Interface

We've moved from re-exporting the `TransformOptions` interface to defining our own in `services/interfaces.ts`:

```typescript
/**
 * Image transformation options for Cloudflare Image Resizing service
 */
export interface TransformOptions {
  width?: number;
  height?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad' | string;
  gravity?: 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right' | 'north' | 'south' | 'east' | 'west' | 'north-east' | 'north-west' | 'south-east' | 'south-west' | 'face' | string | { x: number; y: number };
  quality?: number;
  format?: 'avif' | 'webp' | 'json' | 'jpeg' | 'png' | 'gif' | 'auto' | string;
  background?: string;
  dpr?: number;
  // ... other properties
}
```

### 2. DefaultImageTransformationService Implementation

The `DefaultImageTransformationService` class now implements all the functionality previously available in `transform.ts`, including:

- `transformImage`: Primary method for transforming images
- `getOptimalOptions`: Method for determining optimal transformation options based on client information
- `buildTransformOptions`: Method for constructing Cloudflare Image Resizing options
- Various helper methods for specific transformation tasks

### 3. Dependency Reduction

We've removed direct dependencies on `transform.ts` from:

- `debug.ts`
- `cache.ts`
- `utils/akamai-compatibility.ts`

Previously, these files imported `TransformOptions` directly from `transform.ts`, creating a dependency on the utility module. Now they import from `services/interfaces.ts`, aligning with our DDD approach.

### 4. Service Dependencies Updated

We've updated the `transformationService.ts` to use proper service dependencies:

- Added `CacheService` as an optional constructor parameter
- Added a `setCacheService` method for dependency injection
- Modified `applyCloudflareCache` usage to use the injected `CacheService` instead of the utility function
- Added graceful fallback when `CacheService` is not available

### 5. Remaining Dependencies

Several files still reference functionality from `transform.ts`:

- Tests files: Many test files still use the old utility functions

## Next Steps

To complete the refactoring, we should:

1. **Update Service Container**:
   - Ensure the ServiceContainer properly injects CacheService into TransformationService
   - Validate that all services have proper dependency relationships

2. **Remove transform.ts**:
   - Once all dependencies have been migrated to services, remove the `transform.ts` file
   - Ensure all imports are updated to use the appropriate services

3. **Update Tests**:
   - Update test files to use the new service interfaces instead of direct utility functions
   - Consider adding specific tests for new service methods

4. **Update Documentation**:
   - Update developer documentation to reflect the new architecture
   - Add guidance for how to use the service interfaces

## Architectural Guidelines

As we continue with refactoring, we should adhere to these architectural principles:

1. **Service-First Approach**: All functionality should be implemented as services with clear interfaces.
2. **Interface Segregation**: Interfaces should be focused on specific responsibilities.
3. **Dependency Inversion**: High-level modules should not depend on low-level modules, but both should depend on abstractions.
4. **Command Pattern**: Use commands for complex operations involving multiple services.
5. **Proper Error Handling**: Define domain-specific errors with contextual information.

## Performance Considerations

Throughout the refactoring process, we must ensure:

- No regression in image processing performance
- Minimal additional memory overhead
- No increased cold start time for the worker
- Continued support for all existing features

## References

- [REFACTORING_PLAN.md](/REFACTORING_PLAN.md) - Overall refactoring plan
- [codebase-refactoring.md](/docs/development/codebase-refactoring.md) - General refactoring guidelines
- [architecture.md](/docs/core/architecture.md) - Architectural overview