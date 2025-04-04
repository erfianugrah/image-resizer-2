# Logging and Debug Headers Migration Plan

## Overview

This document outlines a plan to centralize all logging and debug header operations in the codebase. Currently, there are several instances of direct `console.*` calls and manual header setting throughout the project. These need to be replaced with the centralized `LoggingService` and `DebugService` implementations to ensure consistency, traceability, and easier debugging.

## Current Issues

1. **Direct Console Calls**: Many files use direct `console.log`, `console.debug`, `console.error`, etc. calls instead of using the centralized `LoggingService`.

2. **Manual Debug Headers**: Several handlers and services set debug headers directly instead of using the centralized `DebugService.addDebugHeaders()` method.

3. **Inconsistent Formatting**: Without centralized services, log formats and debug headers lack consistency across the codebase.

## Files Requiring Updates

### Direct Console.* Calls

The following files contain direct console.* calls that should be replaced:

1. `/src/services/cache/kv/SimpleKVTransformCacheManager.ts` (most instances)
2. `/src/utils/errors.ts`
3. `/src/config.ts`
4. `/src/services/config/schemaValidator.ts`
5. `/src/utils/path.ts`
6. `/src/services/config/configValueResolver.ts`
7. `/src/services/config/KVConfigStore.ts`
8. `/src/services/configurationApi/ConfigMigrator.ts`

### Direct Debug Header Manipulation

The following files manually set debug headers that should use the `DebugService`:

1. `/src/handlers/imageHandler.ts`
2. `/src/services/cache/CacheHeadersManager.ts`
3. `/src/services/cache/CacheResilienceManager.ts`
4. `/src/utils/optimized-response.ts`
5. `/src/services/optimizedCacheService.ts`
6. `/src/handlers/akamaiCompatibilityHandler.ts`

## Implementation Approach

### For Console.* Calls:

1. **Add LoggingService Dependency**:
   ```typescript
   // Before
   export class SomeComponent {
     constructor() {
       // Direct console calls
     }
   }
   
   // After
   export class SomeComponent {
     private logger: Logger;
     
     constructor(loggingService: LoggingService) {
       this.logger = loggingService.getLogger('SomeComponent');
     }
   }
   ```

2. **Replace Console Methods**:
   ```typescript
   // Before
   console.debug("KV transform cache: Skipping duplicate operation", {
     url: request.url,
     operationKey
   });
   
   // After
   this.logger.debug("KV transform cache: Skipping duplicate operation", {
     url: request.url,
     operationKey
   });
   ```

3. **For Existing Helper Methods**: Update the implementation to use the injected logger.
   ```typescript
   // Before
   private logDebug(message: string, data?: LogData): void {
     if (this.logger) {
       this.logger.debug(message, data);
     } else if (typeof console !== 'undefined' && console.debug) {
       console.debug(message, data);
     }
   }
   
   // After
   private logDebug(message: string, data?: LogData): void {
     this.logger.debug(message, data);
   }
   ```

### For Debug Headers:

1. **Add DebugService Dependency**:
   ```typescript
   // Before
   export class ImageHandler {
     constructor(
       private storageService: StorageService,
       private transformService: ImageTransformationService,
       // other services
     ) {}
   }
   
   // After
   export class ImageHandler {
     constructor(
       private storageService: StorageService,
       private transformService: ImageTransformationService,
       private debugService: DebugService,
       // other services
     ) {}
   }
   ```

2. **Replace Direct Header Setting**:
   ```typescript
   // Before
   const updatedResponse = new Response(cachedResponse.body, cachedResponse);
   updatedResponse.headers.set('X-KV-Cache-Lookup-Time', kvCacheLookupDuration.toString());
   updatedResponse.headers.set('X-KV-Cache', 'HIT');
   
   // After
   let updatedResponse = new Response(cachedResponse.body, cachedResponse);
   updatedResponse = this.debugService.addDebugHeaders(
     updatedResponse,
     request,
     storageResult,
     transformOptions,
     config,
     metrics,
     new URL(request.url)
   );
   ```

3. **For Custom Headers Not Covered by DebugService**:
   - First, try to extend the `DebugService` to include these headers in a structured way
   - If truly specialized, use the batch update pattern:
   ```typescript
   import { batchUpdateHeaders } from '../utils/optimized-response';
   
   updatedResponse = batchUpdateHeaders(updatedResponse, [
     (headers) => {
       headers.set('X-Custom-Header', 'value');
     }
   ]);
   ```

## Testing Strategy

1. **Unit Tests**:
   - Update unit tests for components that now rely on LoggingService/DebugService
   - Add mock implementations of LoggingService/DebugService

2. **Integration Tests**:
   - Verify log output format is consistent
   - Verify debug headers are properly set
   - Compare before/after header outputs

3. **Manual Testing**:
   - Run the application and verify logs in development console
   - Check network responses for correct debug headers

## Implementation Plan

This migration should be done incrementally to minimize risk:

1. **Phase 1**: Update `SimpleKVTransformCacheManager.ts` as it contains the most direct console calls
2. **Phase 2**: Update `utils/errors.ts` to ensure all error logging is centralized
3. **Phase 3**: Update handler files that set debug headers directly
4. **Phase 4**: Update remaining files with fewer console.* instances
5. **Phase 5**: Add tests and perform final verification

## Considerations

- **Circular Dependencies**: Be aware of potential circular dependencies when injecting services
- **Performance**: The centralized logging service should not introduce significant overhead
- **Backward Compatibility**: Ensure debug headers maintain functionality for existing tools

## Success Criteria

1. No direct `console.*` calls remain in the codebase
2. All debug headers are set via `DebugService.addDebugHeaders()`
3. Log formats are consistent across the application
4. All tests pass with the updated implementation
5. Improved debuggability through consistent logs and headers