# Refactoring Implementation Plan

## Overview

This document outlines the detailed implementation plan for continuing the refactoring of the image-resizer project to a service-oriented architecture following Domain-Driven Design (DDD) principles.

## Current Status

We have successfully:

1. Created service interfaces in `services/interfaces.ts`
2. Implemented a complete `DefaultImageTransformationService`
3. Defined our own `TransformOptions` interface in the services layer
4. Updated key utility files to use the new interface
5. Completed `DefaultDebugService` implementation

## Next Steps

### 1. ✅ Complete DebugService Integration (COMPLETED)

#### Analysis
- `DebugService` interface is properly defined
- `DefaultDebugService` is now fully implemented without delegating to utility functions
- Service is properly created in `ServiceContainer`
- Service is correctly used in handlers and commands

#### Implementation Completed
- ✅ Updated `DefaultDebugService` to implement the functionality directly without calling utility functions
- ✅ Implemented `isDebugEnabled`, `addDebugHeaders`, and `createDebugHtmlReport` directly in the service
- ✅ Added helper methods like `generateCacheTags` to the service implementation

### 2. ✅ Complete CacheService Refactoring (COMPLETED)

#### Analysis
- `CacheService` interface is properly defined
- `DefaultCacheService` has been fully implemented without calling utility functions
- Service is properly created in `ServiceContainer`
- Service is being used in commands

#### Implementation Completed
- ✅ Implemented all methods in `DefaultCacheService` directly without using utility functions
- ✅ Implemented `shouldBypassCache`, `generateCacheTags`, and `applyCloudflareCache` directly in the service
- ✅ Added comprehensive error handling for all methods
- ✅ Removed dependencies on utilities from `cache.ts`

### 3. ⚠️ Clean up utility files (IN PROGRESS)

#### Analysis
- Many files import functions from `transform.ts` and `debug.ts`
- `DefaultImageTransformationService` and `DefaultDebugService` have implemented this functionality
- Need to update imports across the codebase

#### Implementation Progress
- ✅ Updated `DefaultImageTransformationService` to use `CacheService` instead of direct utility functions
- ✅ Injected `CacheService` into `TransformationService` in the service container
- ✅ Verified that core application code now uses services instead of utility functions
- ✅ Moved `PerformanceMetrics` interface from debug.ts to services/interfaces.ts
- ✅ Updated all import statements to use the interface from its new location
- ✅ Updated index.ts to use `DebugService.setLogger` instead of `setDebugLogger` from debug.ts
- ⚠️ Remaining Task: Update test files that still import from utility files
- ⚠️ Remaining Task: Update debug.ts to use CacheService instead of importing directly from cache.ts
- ⚠️ Remaining Task: Eventually remove utility files when all dependencies have been migrated
- ✅ Updated documentation to reflect the new architecture and progress

### 4. Update Test Files

#### Analysis
- Many test files still use utility functions directly
- Tests need to be updated to use service interfaces and implementations

#### Implementation Tasks
- Create basic service mocks for testing
- Update test imports to use service implementations instead of utilities
- Add specific tests for service methods

## Implementation Timeline

### Phase 1: DebugService Refactoring (COMPLETED)
- ✅ Completed `DefaultDebugService` implementation
- ✅ Implemented all functionality directly in service without using utility functions
- ✅ Added helper methods for cache tags generation and other functionalities

### Phase 2: CacheService Refactoring (COMPLETED)
- ✅ Completed `DefaultCacheService` implementation
- ✅ Implemented all functionality directly in service without using utility functions from cache.ts
- ✅ Added comprehensive error handling and resilience patterns

### Phase 3: Utility File Cleanup (1-2 days) - MOSTLY COMPLETE
- ✅ Updated `DefaultImageTransformationService` to use `CacheService` instead of direct utility functions  
- ✅ Injected `CacheService` into `TransformationService` in the service container
- ✅ Verified that core application code now uses services properly
- ✅ Moved `PerformanceMetrics` interface from debug.ts to services/interfaces.ts
- ✅ Updated all import statements to use the interface from its new location
- ✅ Updated index.ts to use `DebugService.setLogger` instead of direct import from debug.ts
- ✅ Updated debug.ts to use CacheService instead of importing directly from cache.ts
- ✅ Updated documentation to reflect current status
- ⚠️ Remaining Task: Update test files that still import from utility files
- ⚠️ Remaining Task: Eventually remove utility files when all dependencies have been migrated

### Phase 4: Test Updates and Documentation (2-3 days)
- Update test files to use services
- Add specific tests for service methods
- Update documentation to reflect the new architecture

## Testing Strategy

### Unit Tests
- Test each service implementation in isolation
- Create mock dependencies for service dependencies
- Verify each service method behavior

### Integration Tests
- Test the interaction between services
- Ensure the service container properly initializes services
- Verify commands use services correctly

### End-to-End Tests
- Test the complete request handling flow
- Ensure all functionality still works with the new architecture

## Documentation Updates

### Developer Documentation
- Update architecture documentation to reflect service approach
- Add examples of how to use services
- Document service interfaces and implementations

### Code Comments
- Add JSDoc comments to all service methods
- Document inter-service dependencies
- Highlight architectural patterns used

## Success Criteria

The refactoring will be considered successful when:

1. All utility functions have been moved to services
2. Service interfaces are well-defined and implemented
3. No direct imports from utility modules remain
4. All tests pass with the new architecture
5. Performance remains equal or better than the previous implementation
6. Documentation accurately reflects the new architecture

## Implementation Notes

- Use dependency injection to manage service dependencies
- Keep services focused on specific responsibilities
- Use interfaces to define service contracts
- Apply clean code principles throughout
- Ensure backward compatibility for existing functionality