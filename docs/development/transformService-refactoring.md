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
5. Modified `DefaultImageTransformationService` to use `CacheService` for cache operations instead of directly using utility functions
6. **[NEW]** Moved `PerformanceMetrics` interface from debug.ts to services/interfaces.ts
7. **[NEW]** Updated index.ts to use `DebugService.setLogger` instead of `setDebugLogger` from debug.ts
8. **[NEW]** Updated all imports of `PerformanceMetrics` to use it from services/interfaces.ts

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

### 5. Debug Service Integration

We've improved the integration with `DebugService`:

- Moved `PerformanceMetrics` interface from debug.ts to services/interfaces.ts
- Updated all imports of `PerformanceMetrics` to use it from its new location
- Added re-export from debug.ts for backward compatibility
- Updated index.ts to use `DebugService.setLogger` instead of `setDebugLogger` from debug.ts

### 6. Remaining Dependencies

Based on our code analysis, we have successfully migrated the core application code to use the service-oriented architecture. All primary dependencies have been migrated to services:

- ✅ debug.ts now uses CacheService instead of importing directly from cache.ts
- ✅ index.ts now uses DebugService instead of importing from debug.ts
- ✅ transform.ts now uses CacheService instead of importing directly from cache.ts

The only remaining dependencies are in:
- Test files: Many test files still use the old utility functions

## Next Steps

To complete the refactoring, we should:

1. **✅ Update Service Container**: COMPLETED
   - ✅ ServiceContainer now properly injects CacheService into TransformationService
   - ✅ Service dependencies are properly established with dependency injection

2. **⚠️ Update Tests**:
   - Update test files to use the new service interfaces instead of direct utility functions
   - Consider adding specific tests for new service methods

3. **⚠️ Remove transform.ts**:
   - Once all test dependencies have been migrated to services, remove the `transform.ts` file
   - This should be the final step in the refactoring process

4. **✅ Document Architecture**: COMPLETED
   - ✅ Documentation has been updated to reflect the new architecture
   - ✅ Refactoring plan has been updated with progress and next steps

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