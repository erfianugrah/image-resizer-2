/**
 * Cache Service Tests
 * 
 * Tests for the CacheService functionality with a focus on error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultCacheService } from '../../src/services/cacheService';
import { DefaultConfigurationService } from '../../src/services/configurationService';
import { Logger } from '../../src/utils/logging';
import { createMockLogger } from '../mocks/logging';
import { 
  CacheServiceError, 
  CacheReadError, 
  CacheWriteError, 
  CacheUnavailableError, 
  CacheTagGenerationError 
} from '../../src/errors/cacheErrors';

// Mock the cache utility functions
vi.mock('../../src/cache', () => ({
  applyCacheHeaders: vi.fn((response) => response),
  cacheWithCacheApi: vi.fn(async (request, response) => response),
  shouldBypassCache: vi.fn(() => false),
  applyCloudflareCache: vi.fn((requestInit) => requestInit),
  generateCacheTags: vi.fn(() => ['tag1', 'tag2'])
}));

// Import the mocked utilities
import { 
  applyCacheHeaders, 
  cacheWithCacheApi, 
  shouldBypassCache,
  applyCloudflareCache,
  generateCacheTags
} from '../../src/cache';

describe('CacheService', () => {
  let cacheService: DefaultCacheService;
  let mockLogger: Logger;
  let mockConfigService: any;
  let mockEnv: any;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
    
    // Create a mock environment
    mockEnv = {
      ENVIRONMENT: 'development',
      CACHE_METHOD: 'cache-api',
      CACHE_TTL_OK: '3600',
      CACHE_TAGS_ENABLED: 'true'
    };
    
    // Create a real ConfigurationService with mock environment
    const configService = new DefaultConfigurationService(mockLogger, mockEnv);
    
    // Create the CacheService with mocked dependencies
    cacheService = new DefaultCacheService(mockLogger, configService);
    
    // Reset the mocked functions
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('Error Handling Tests', () => {
    it('should throw CacheServiceError when applyCacheHeaders receives invalid response', () => {
      // Test with null response
      expect(() => cacheService.applyCacheHeaders(null as any)).toThrow(CacheServiceError);
      
      // Test with non-Response object
      expect(() => cacheService.applyCacheHeaders({} as any)).toThrow(CacheServiceError);
      
      // Verify the error message and code
      try {
        cacheService.applyCacheHeaders(null as any);
      } catch (error) {
        expect(error).toBeInstanceOf(CacheServiceError);
        expect(error.code).toBe('INVALID_RESPONSE');
        expect(error.status).toBe(500);
        expect(error.details).toBeDefined();
      }
    });
    
    it('should throw CacheUnavailableError when cacheWithCacheApi gets invalid execution context', async () => {
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockResponse = new Response('test');
      
      // Test with null context
      await expect(() => 
        cacheService.cacheWithCacheApi(mockRequest, mockResponse, null as any)
      ).rejects.toThrow(CacheUnavailableError);
      
      // Test with invalid context (no waitUntil method)
      await expect(() => 
        cacheService.cacheWithCacheApi(mockRequest, mockResponse, {} as any)
      ).rejects.toThrow(CacheUnavailableError);
      
      // Verify the error includes details
      try {
        await cacheService.cacheWithCacheApi(mockRequest, mockResponse, {} as any);
      } catch (error) {
        expect(error).toBeInstanceOf(CacheUnavailableError);
        expect(error.details).toHaveProperty('hasWaitUntil', false);
      }
    });
    
    it('should throw CacheWriteError when cacheWithCacheApi fails to write to cache', async () => {
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockResponse = new Response('test');
      const mockContext = { waitUntil: vi.fn() };
      
      // Make the cache utility throw an error
      (cacheWithCacheApi as any).mockRejectedValueOnce(new Error('Simulated cache write failure'));
      
      // Set global caches mock for this test
      global.caches = {
        default: {} as any
      };
      
      // Test if the error is properly wrapped
      await expect(() => 
        cacheService.cacheWithCacheApi(mockRequest, mockResponse, mockContext)
      ).rejects.toThrow(CacheWriteError);
      
      // Verify the error details
      try {
        await cacheService.cacheWithCacheApi(mockRequest, mockResponse, mockContext);
      } catch (error) {
        expect(error).toBeInstanceOf(CacheWriteError);
        expect(error.details).toHaveProperty('url', 'https://example.com/image.jpg');
        expect(error.retryable).toBe(true); // Write errors should be retryable
      }
    });
    
    it('should throw CacheTagGenerationError when generateCacheTags encounters an error', () => {
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockStorageResult = {
        path: '/image.jpg',
        sourceType: 'remote',
        response: new Response('test'),
        contentType: 'image/jpeg',
        size: 1024
      };
      const mockOptions = { width: 100, height: 100 };
      
      // Make the tag generation utility throw an error
      (generateCacheTags as any).mockImplementationOnce(() => {
        throw new Error('Tag generation failed');
      });
      
      // Test if the error is properly wrapped
      expect(() => 
        cacheService.generateCacheTags(mockRequest, mockStorageResult, mockOptions)
      ).toThrow(CacheTagGenerationError);
      
      // Verify error details
      try {
        cacheService.generateCacheTags(mockRequest, mockStorageResult, mockOptions);
      } catch (error) {
        expect(error).toBeInstanceOf(CacheTagGenerationError);
        expect(error.message).toContain('Failed to generate cache tags');
        expect(error.details).toBeDefined();
      }
    });
    
    it('should throw CacheServiceError when calculating TTL with invalid inputs', () => {
      // Test with null response
      expect(() => 
        cacheService.calculateTtl(null as any, {})
      ).toThrow(CacheServiceError);
      
      // Test with non-Response object
      expect(() => 
        cacheService.calculateTtl({} as any, {})
      ).toThrow(CacheServiceError);
      
      // Verify error code and status
      try {
        cacheService.calculateTtl(null as any, {});
      } catch (error) {
        expect(error).toBeInstanceOf(CacheServiceError);
        expect(error.code).toBe('INVALID_RESPONSE');
        expect(error.status).toBe(500);
      }
    });
    
    it('should handle graceful error recovery in calculateTtl', () => {
      // Create a response with headers that cause an error
      const mockResponse = new Response('test');
      
      // Force an error during TTL calculation
      Object.defineProperty(mockResponse.headers, 'get', {
        value: () => { throw new Error('Header access error'); }
      });
      
      // Test if the error is properly wrapped
      expect(() => 
        cacheService.calculateTtl(mockResponse, {})
      ).toThrow(CacheServiceError);
      
      // Verify error details and retryable flag
      try {
        cacheService.calculateTtl(mockResponse, {});
      } catch (error) {
        expect(error).toBeInstanceOf(CacheServiceError);
        expect(error.code).toBe('TTL_CALCULATION_ERROR');
        expect(error.retryable).toBe(true); // TTL calculation errors should be retryable
      }
    });
  });
  
  describe('Integration with ConfigurationService', () => {
    it('should use ConfigurationService to get cache settings', () => {
      const mockResponse = new Response('test');
      
      // Call the method that needs configuration
      cacheService.applyCacheHeaders(mockResponse);
      
      // Verify the logger was called with the right cache method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Applying cache headers', 
        expect.objectContaining({
          cacheMethod: 'cache-api', // This comes from the ConfigurationService
        })
      );
    });
    
    it('should check cache method from ConfigurationService to determine caching strategy', async () => {
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockResponse = new Response('test');
      const mockContext = { waitUntil: vi.fn() };
      
      // Set global caches for this test
      global.caches = {
        default: { put: vi.fn() } as any
      };
      
      // Call the method that checks cache method
      await cacheService.cacheWithCacheApi(mockRequest, mockResponse, mockContext);
      
      // Verify the cache method was checked
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Caching with Cache API', 
        expect.objectContaining({
          url: 'https://example.com/image.jpg'
        })
      );
      
      // The cache API utility should be called since the config method is 'cache-api'
      expect(cacheWithCacheApi).toHaveBeenCalled();
    });
  });
  
  describe('Behavior with Retryable Operations', () => {
    it('should mark CacheWriteError as retryable', async () => {
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockResponse = new Response('test');
      const mockContext = { waitUntil: vi.fn() };
      
      // Make the cache utility throw an error
      (cacheWithCacheApi as any).mockRejectedValueOnce(new Error('Simulated cache write failure'));
      
      // Set global caches mock for this test
      global.caches = {
        default: {} as any
      };
      
      // Catch the error and check its retryable property
      try {
        await cacheService.cacheWithCacheApi(mockRequest, mockResponse, mockContext);
      } catch (error) {
        expect(error).toBeInstanceOf(CacheWriteError);
        expect(error.retryable).toBe(true);
      }
    });
    
    it('should mark CacheUnavailableError as not retryable', async () => {
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockResponse = new Response('test');
      
      // Test with invalid context
      try {
        await cacheService.cacheWithCacheApi(mockRequest, mockResponse, {} as any);
      } catch (error) {
        expect(error).toBeInstanceOf(CacheUnavailableError);
        expect(error.retryable).toBe(false); // Cache availability issues are not retryable
      }
    });
    
    it('should use retry and circuit breaker for cache operations', async () => {
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockResponse = new Response('test');
      const mockContext = { waitUntil: vi.fn() };
      
      // Mock the retry utility directly
      vi.spyOn(global, 'setTimeout').mockImplementation((cb) => {
        cb(); // Execute callback immediately
        return 0 as any;
      });
      
      // Reset the cacheWithCacheApi mock
      (cacheWithCacheApi as any).mockReset();
      
      // Make it fail twice then succeed
      (cacheWithCacheApi as any)
        .mockRejectedValueOnce(new Error('Simulated cache write failure 1'))
        .mockRejectedValueOnce(new Error('Simulated cache write failure 2'))
        .mockResolvedValueOnce(new Response('cached'));
      
      // Set global caches mock for this test
      global.caches = {
        default: { put: vi.fn() } as any
      };
      
      // Should succeed after retries
      const result = await cacheService.cacheWithCacheApi(mockRequest, mockResponse, mockContext);
      
      // Should have called the utility 3 times (1 initial + 2 retries)
      expect(cacheWithCacheApi).toHaveBeenCalledTimes(3);
      
      // Should have returned the final successful result
      expect(result.status).toBe(200);
    });
    
    it('should use circuit breaker to prevent repeated failures', async () => {
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockResponse = new Response('test');
      const mockContext = { waitUntil: vi.fn() };
      
      // Reset mocks
      vi.resetAllMocks();
      
      // Make the cache utility always fail with a retryable error
      (cacheWithCacheApi as any).mockRejectedValue(
        new CacheWriteError('Simulated persistent cache write failure')
      );
      
      // Set global caches mock for this test
      global.caches = {
        default: { put: vi.fn() } as any
      };
      
      // Access the circuit breaker to force it open
      (cacheService as any).cacheWriteCircuitBreaker.isOpen = true;
      (cacheService as any).cacheWriteCircuitBreaker.resetTimeMs = Date.now() + 60000; // Future time
      
      // Should fail fast
      try {
        await cacheService.cacheWithCacheApi(mockRequest, mockResponse, mockContext);
        fail('Should have thrown an error');
      } catch (error) {
        // Should be a circuit breaker error
        expect(error.message).toContain('Circuit breaker is open');
      }
      
      // The underlying cache operation should not have been called
      expect(cacheWithCacheApi).not.toHaveBeenCalled();
    });
  });
});