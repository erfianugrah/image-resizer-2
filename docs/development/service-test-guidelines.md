# Service Testing Guidelines

## Overview

This document provides guidelines and best practices for testing the service-oriented architecture of the Image Resizer project. Following these guidelines will ensure consistent, maintainable, and effective tests across all services.

## Testing Principles

1. **Test Services in Isolation**: Each service should be tested independently without relying on actual implementations of its dependencies.
2. **Test to the Interface**: Tests should verify that implementations fulfill their interface contracts.
3. **Focus on Behavior, Not Implementation**: Test what a service does, not how it does it.
4. **Test Both Success and Failure Paths**: Verify correct behavior for both success and error scenarios.
5. **Use AAA Pattern**: Structure tests with Arrange, Act, Assert for clarity.
6. **Keep Tests Independent**: No test should depend on the outcome of another test.

## Test Structure

### Unit Tests

Unit tests should focus on testing a single service in isolation:

```typescript
describe('CacheService', () => {
  let cacheService: DefaultCacheService;
  let mockConfigService: ConfigurationService;
  let mockLogger: Logger;
  
  beforeEach(() => {
    // Arrange - Setup
    mockLogger = createMockLogger();
    mockConfigService = createMockConfigurationService();
    cacheService = new DefaultCacheService(mockLogger, mockConfigService);
  });
  
  describe('applyCacheHeaders', () => {
    it('should add Cache-Control headers to the response', () => {
      // Arrange - Test Specific
      const mockResponse = new Response('test');
      const options = createMockTransformOptions();
      
      // Configure mocks for this specific test
      vi.spyOn(mockConfigService, 'getValue').mockImplementation((path, defaultValue) => {
        if (path === 'cache.ttl.ok') return 3600;
        if (path === 'cache.headers.enabled') return true;
        return defaultValue;
      });
      
      // Act
      const result = cacheService.applyCacheHeaders(mockResponse, options);
      
      // Assert
      expect(result.headers.get('Cache-Control')).toContain('max-age=3600');
    });
    
    // More tests for this method...
  });
  
  // More method test groups...
});
```

### Integration Tests

Integration tests should verify the correct interaction between services:

```typescript
describe('TransformationService and CacheService Integration', () => {
  let transformationService: DefaultImageTransformationService;
  let cacheService: DefaultCacheService;
  let mockConfigService: ConfigurationService;
  let mockClientDetectionService: ClientDetectionService;
  
  beforeEach(() => {
    // Setup services with real implementations
    mockConfigService = createMockConfigurationService();
    mockClientDetectionService = createMockClientDetectionService();
    cacheService = new DefaultCacheService(createMockLogger(), mockConfigService);
    transformationService = new DefaultImageTransformationService(
      createMockLogger(),
      mockClientDetectionService,
      mockConfigService,
      cacheService // Real cache service
    );
  });
  
  it('should apply cache headers to transformed images', async () => {
    // Arrange
    const request = createMockRequest('https://example.com/image.jpg');
    const storageResult = createMockStorageResult();
    const options = createMockTransformOptions();
    
    // Spy on the cache service method to verify integration
    const spy = vi.spyOn(cacheService, 'applyCacheHeaders');
    
    // Act
    await transformationService.transformImage(request, storageResult, options, {});
    
    // Assert
    expect(spy).toHaveBeenCalledWith(expect.any(Response), options, storageResult);
  });
});
```

### Command Tests

Command tests should verify that commands properly orchestrate services:

```typescript
describe('TransformImageCommand', () => {
  let command: TransformImageCommand;
  let mockServices: ServiceContainer;
  
  beforeEach(() => {
    mockServices = createMockServiceContainer();
    command = new TransformImageCommand(mockServices);
  });
  
  it('should orchestrate services to transform an image', async () => {
    // Arrange
    const request = createMockRequest('https://example.com/image.jpg');
    const url = new URL(request.url);
    const metrics = { start: Date.now() };
    
    // Set up spy on service methods
    const storageSpy = vi.spyOn(mockServices.storageService, 'fetchImage');
    const transformSpy = vi.spyOn(mockServices.transformationService, 'transformImage');
    const cacheSpy = vi.spyOn(mockServices.cacheService, 'cacheWithFallback');
    
    // Act
    await command.execute({ request, url, metrics, ctx: {}, env: {} });
    
    // Assert - Verify services were called in the right order with right parameters
    expect(storageSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expect.any(Object), request);
    expect(transformSpy).toHaveBeenCalledAfter(storageSpy);
    expect(cacheSpy).toHaveBeenCalledAfter(transformSpy);
  });
});
```

## Using Mock Factories

The project provides standard mock factories to ensure consistent testing:

```typescript
// Import mock factories
import { 
  createMockConfigurationService, 
  createMockLogger, 
  createMockRequest, 
  createMockStorageResult, 
  createMockTransformOptions,
  createMockServiceContainer
} from '../mocks/serviceMockFactory';

// Use mock factories in tests
const mockLogger = createMockLogger();
const mockConfigService = createMockConfigurationService();
const mockRequest = createMockRequest('https://example.com/image.jpg');
const mockOptions = createMockTransformOptions({ width: 800, height: 600 });
```

## Testing Async Operations

For async operations, use async/await and proper assertions:

```typescript
it('should cache responses using the Cache API', async () => {
  // Arrange
  const request = createMockRequest('https://example.com/image.jpg');
  const response = new Response('test image data');
  const ctx = { waitUntil: vi.fn() };
  
  // Mock cache API
  global.caches = {
    default: {
      put: vi.fn()
    }
  } as any;
  
  // Act
  const result = await cacheService.cacheWithCacheApi(request, response, ctx);
  
  // Assert
  expect(result).toBe(response);
  expect(ctx.waitUntil).toHaveBeenCalled();
  expect(global.caches.default.put).toHaveBeenCalledWith(request, expect.any(Response));
});
```

## Testing Error Handling

Test both the happy path and error scenarios:

```typescript
it('should handle cache API failures gracefully', async () => {
  // Arrange
  const request = createMockRequest('https://example.com/image.jpg');
  const response = new Response('test');
  const ctx = { waitUntil: vi.fn() };
  
  // Make the Cache API throw an error
  global.caches.default.put = vi.fn(() => {
    throw new Error('Cache API failure');
  });
  
  // Act & Assert - Test that it throws the right error type
  await expect(() => 
    cacheService.cacheWithCacheApi(request, response, ctx)
  ).rejects.toThrow(CacheWriteError);
  
  // Verify the error has the right properties
  try {
    await cacheService.cacheWithCacheApi(request, response, ctx);
  } catch (error) {
    expect(error).toBeInstanceOf(CacheWriteError);
    expect(error.retryable).toBe(true);
    expect(error.details).toHaveProperty('url', 'https://example.com/image.jpg');
  }
});
```

## Mocking External Dependencies

### Mocking Cloudflare Environment

```typescript
// Mock Cloudflare environment variables
const mockEnv = {
  ENVIRONMENT: 'test',
  R2_BUCKET: 'test-bucket',
  CACHE_METHOD: 'cache-api',
  CACHE_TTL_OK: '3600'
};

// Mock Cloudflare Cache API
global.caches = {
  default: {
    match: vi.fn(),
    put: vi.fn()
  }
} as any;

// Mock Cloudflare execution context
const mockExecutionContext = { waitUntil: vi.fn() };
```

### Mocking Fetch and Headers

```typescript
// Mock fetch
global.fetch = vi.fn().mockResolvedValue(
  new Response('test image data', {
    headers: { 'Content-Type': 'image/jpeg' }
  })
);
```

## Test Organization

Organize tests by method and behavior:

```typescript
describe('CacheService', () => {
  // Service setup...
  
  describe('applyCacheHeaders', () => {
    it('should add Cache-Control headers to the response', () => {
      // Test success case
    });
    
    it('should use different TTLs based on response status', () => {
      // Test variation
    });
    
    it('should handle invalid inputs gracefully', () => {
      // Test error case
    });
  });
  
  describe('shouldBypassCache', () => {
    it('should bypass cache when debug header is present', () => {
      // Test specific condition
    });
    
    it('should not bypass cache for normal requests', () => {
      // Test default behavior
    });
  });
  
  // More method groups...
});
```

## Testing Tips

1. **Test Naming**: Use descriptive names that explain what is being tested and expected outcome.
2. **Spy Selectively**: Only spy/mock what's needed for the test, use real implementations otherwise.
3. **Reset Mocks**: Use `vi.clearAllMocks()` before each test to ensure clean state.
4. **Handle Async**: Always use `async/await` with asynchronous code in tests.
5. **Avoid Test Interdependence**: Each test should work independently.
6. **Test Important Paths**: Cover happy path, error cases, edge cases, and important branches.
7. **Verify Logger Calls**: Check that appropriate logging happens in success and error cases.

## Common Patterns

### Testing Conditional Logic

```typescript
it('should calculate TTL based on content type', () => {
  // Arrange
  const imageResponse = new Response('image data', { 
    headers: { 'Content-Type': 'image/jpeg' }
  });
  
  // Configure service to return different values based on conditions
  vi.spyOn(mockConfigService, 'getValue').mockImplementation((path, defaultValue) => {
    if (path === 'cache.contentTypes') {
      return [
        { pattern: 'image/', ttl: 7200 }
      ];
    }
    return defaultValue;
  });
  
  // Act
  const ttl = cacheService.calculateTtl(imageResponse, {});
  
  // Assert
  expect(ttl).toBe(7200); // Should match the value for image content type
});
```

### Testing Service Interactions

```typescript
it('should use ConfigurationService to get cache settings', () => {
  // Arrange
  const mockResponse = new Response('test');
  
  // Spy on configuration service
  const configSpy = vi.spyOn(mockConfigService, 'getValue');
  
  // Act
  cacheService.applyCacheHeaders(mockResponse);
  
  // Assert - Verify the configuration service was called
  expect(configSpy).toHaveBeenCalledWith('cache.ttl.ok', expect.any(Number));
});
```

### Testing Logging

```typescript
it('should log errors with appropriate context', async () => {
  // Arrange
  const request = createMockRequest('https://example.com/image.jpg');
  const response = new Response('test');
  const ctx = { waitUntil: vi.fn() };
  
  // Make operation fail
  global.caches.default.put = vi.fn(() => {
    throw new Error('Cache API failure');
  });
  
  // Spy on logger
  const loggerSpy = vi.spyOn(mockLogger, 'error');
  
  // Act & Assert
  try {
    await cacheService.cacheWithCacheApi(request, response, ctx);
  } catch (error) {
    // Verify logger was called with the right parameters
    expect(loggerSpy).toHaveBeenCalledWith(
      'Cache operation failed',
      expect.objectContaining({
        error: expect.any(Error),
        url: 'https://example.com/image.jpg'
      })
    );
  }
});
```

## Conclusion

Following these testing guidelines will ensure consistent, effective tests across the service-oriented architecture. The approach focuses on testing behavior through interfaces, proper isolation, and comprehensive coverage of both success and error scenarios.