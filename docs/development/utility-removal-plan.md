# Plan for Removing Utility Files

## Overview

As part of our ongoing refactoring to a service-oriented architecture, we need to remove the utility-based files that have been replaced by proper services. This document outlines the steps needed to remove these files while ensuring no functionality is lost.

## Files to Remove

1. `transform.ts` - Replaced by `DefaultImageTransformationService`
2. `cache.ts` - Replaced by `DefaultCacheService`  
3. `debug.ts` - Replaced by `DefaultDebugService`

## Current Dependencies

### 1. transform.ts Dependencies

- **debug.ts** imports from transform.ts
- **Test files** import from transform.ts
- All core application code has been updated to use `TransformationService`

### 2. cache.ts Dependencies

- **debug.ts** imports `generateCacheTags` from cache.ts
- **transform.ts** imports `applyCloudflareCache` from cache.ts
- All core application code has been updated to use `CacheService`

### 3. debug.ts Dependencies

- **Many files** import `PerformanceMetrics` interface from debug.ts
- **index.ts** imports `setDebugLogger` from debug.ts
- Several components and services still import from debug.ts

## Removal Plan

### Phase 1: Move Shared Interfaces ✅

1. **Move `PerformanceMetrics` interface to services/interfaces.ts** ✅
   - ✅ Copied the interface definition from debug.ts to services/interfaces.ts
   - ✅ Updated all import statements across the codebase to use the new location
   - ✅ Added re-export from debug.ts for backward compatibility
   - ✅ This has removed a major dependency on debug.ts

### Phase 2: Update Remaining Utility Usage in Application Code

1. **Update debug.ts to use CacheService**
   - Replace direct import of `generateCacheTags` from cache.ts with CacheService
   - This will remove a dependency on cache.ts

2. **Update index.ts to use DebugService**
   - Replace direct import of `setDebugLogger` from debug.ts with DebugService
   - This will remove a dependency on debug.ts

3. **Update transform.ts if needed** ✅
   - ✅ Updated transform.ts to use DefaultCacheService instead of direct import from cache.ts
   - ✅ This has removed a dependency on cache.ts

### Phase 3: Update Test Files

1. **Identify tests using utility functions**
   - Find all test files importing from transform.ts, cache.ts, or debug.ts
   - Prioritize based on complexity and importance

2. **Update tests to use service implementations**
   - Replace direct utility function calls with service method calls
   - Create appropriate test fixtures and mocks for services

### Phase 4: Final Removal

1. **Remove transform.ts**
   - Verify no imports remain
   - Remove the file
   - Update documentation

2. **Remove cache.ts**
   - Verify no imports remain
   - Remove the file
   - Update documentation

3. **Remove debug.ts**
   - Verify no imports remain
   - Remove the file
   - Update documentation

## Implementation Notes

- Each phase should be a separate PR to make review easier
- Unit tests must pass after each change
- Integration tests must pass after each change
- Documentation should be updated to reflect the new architecture

## Success Criteria

1. All three utility files successfully removed
2. All tests pass
3. Application functionality is unchanged
4. No regressions in performance
5. Documentation accurately reflects the new architecture

## Timeline

- Phase 1: 1 day
- Phase 2: 1-2 days
- Phase 3: 2-3 days
- Phase 4: 1 day

Total: 5-7 days