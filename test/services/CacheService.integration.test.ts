import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultCacheService } from '../../src/services/cacheService';
import { ConfigurationService } from '../../src/services/interfaces';
import { CacheUnavailableError, CacheWriteError } from '../../src/errors/cacheErrors';

// Mock ExecutionContext
class MockExecutionContext implements ExecutionContext {
  waitUntilPromises: Promise<any>[] = [];
  
  waitUntil(promise: Promise<any>): void {
    this.waitUntilPromises.push(promise);
  }
  
  // Helper method for tests to resolve all waitUntil promises
  async resolveAllPromises(): Promise<void> {
    await Promise.all(this.waitUntilPromises);
  }
}

describe('CacheService Integration', () => {
  // Mock logger
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  };

  // Mock configuration service
  const configService = {
    getConfig: vi.fn().mockReturnValue({
      cache: {
        method: 'cache-api',
        ttl: {
          ok: 86400,           // 24 hours
          clientError: 60,     // 1 minute
          serverError: 10      // 10 seconds
        },
        cacheEverything: true,
        useTtlByStatus: false,
        cacheability: true,
        bypassParams: ['nocache', 'refresh'],
        cacheTags: {
          enabled: true,
          prefix: 'test-',
          includeImageDimensions: true,
          includeFormat: true,
          includeQuality: true,
          includeDerivative: true,
          customTags: ['global-tag1', 'global-tag2']
        },
        enableStaleWhileRevalidate: true,
        staleWhileRevalidatePercentage: 50,
        enableBackgroundCaching: true,
        minTtl: 60,            // 1 minute minimum
        maxTtl: 2592000,       // 30 days maximum
        retry: {
          maxAttempts: 3,
          initialDelayMs: 100,
          maxDelayMs: 1000
        },
        circuitBreaker: {
          failureThreshold: 5,
          resetTimeoutMs: 30000,
          successThreshold: 2
        }
      },
      environment: 'test'
    })
  } as unknown as ConfigurationService;

  // Mock caches global
  const mockPut = vi.fn().mockResolvedValue(undefined);
  const mockMatch = vi.fn().mockResolvedValue(null);
  
  global.caches = {
    default: {
      put: mockPut,
      match: mockMatch,
      delete: vi.fn().mockResolvedValue(false)
    },
    open: vi.fn()
  } as unknown as CacheStorage;

  // Instance to test
  let cacheService: DefaultCacheService;
  let ctx: MockExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheService = new DefaultCacheService(logger, configService);
    ctx = new MockExecutionContext();
  });

  describe('Integration Scenarios', () => {
    it('should initialize and store a response in cache', async () => {
      // Initialize the service
      await cacheService.initialize();
      
      // Create a request and response
      const request = new Request('https://example.com/image.jpg');
      const response = new Response('test image data', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' }
      });
      
      // Call the main cacheWithFallback method
      const result = await cacheService.cacheWithFallback(
        request,
        response,
        ctx,
        { width: 800, height: 600, format: 'webp' }
      );
      
      // Verify that Cache-Control header was added
      expect(result.headers.has('Cache-Control')).toBe(true);
      
      // Resolve all waitUntil promises
      await ctx.resolveAllPromises();
      
      // Verify that the cache put was called
      expect(mockPut).toHaveBeenCalled();
      
      // Verify that the response status is preserved
      expect(result.status).toBe(200);
    });

    it('should bypass cache when bypass parameter is present', async () => {
      // Create a request with a bypass parameter
      const request = new Request('https://example.com/image.jpg?nocache=1');
      const response = new Response('test image data', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' }
      });
      
      // Cache should be bypassed
      const result = await cacheService.cacheWithFallback(
        request,
        response,
        ctx
      );
      
      // Verify the response was still processed
      expect(result.status).toBe(200);
      
      // Cache-Control header should still be applied
      expect(result.headers.has('Cache-Control')).toBe(true);
      
      // But caching should be bypassed
      await ctx.resolveAllPromises();
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('should handle different cache methods', async () => {
      // Test with 'cf' method
      configService.getConfig = vi.fn().mockReturnValue({
        cache: {
          method: 'cf',
          ttl: { ok: 86400 },
          cacheEverything: true,
          cacheTags: { enabled: true, prefix: 'test-' }
        }
      });
      
      // Create a response with Cache-Control header already set
      const request = new Request('https://example.com/image.jpg');
      const response = new Response('test image data', {
        status: 200,
        headers: { 
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600'
        }
      });
      
      // Call the main cacheWithFallback method
      const result = await cacheService.cacheWithFallback(
        request,
        response,
        ctx
      );
      
      // Verify the response was processed
      expect(result.status).toBe(200);
    });

    it('should recover from cache errors with fallback strategy', async () => {
      // Make cache put throw an error
      mockPut.mockRejectedValueOnce(new Error('Cache operation failed'));
      
      const request = new Request('https://example.com/image.jpg');
      const response = new Response('test image data', {
        status: 200,
        headers: { 
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600' 
        }
      });
      
      // Should still succeed with fallback
      const result = await cacheService.cacheWithFallback(
        request,
        response,
        ctx
      );
      
      // Verify the response is still ok
      expect(result.status).toBe(200);
      
      // Verify some logging occurred during error handling
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should calculate appropriate TTL based on response types', async () => {
      // Success response
      const successResponse = new Response('success', { status: 200 });
      const successTtl = cacheService.calculateTtl(successResponse, {});
      
      // Verify that it's using the configured values
      const config = configService.getConfig();
      expect(successTtl).toBe(config.cache.ttl.ok);
      
      // Verify TTL is non-zero
      expect(successTtl).toBeGreaterThan(0);
      
      // Check that error responses have a TTL
      const errorResponse = new Response('error', { status: 500 });
      const errorTtl = cacheService.calculateTtl(errorResponse, {});
      expect(errorTtl).toBeGreaterThan(0);
    });

    it('should generate cache tags consistently', async () => {
      const request = new Request('https://example.com/products/image.jpg');
      const storageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 12345,
        path: '/products/image.jpg'
      };
      const options = { width: 800, format: 'webp' };
      
      const tags = cacheService.generateCacheTags(request, storageResult, options);
      
      // Verify tags were generated
      expect(tags.length).toBeGreaterThan(0);
      
      // Check for path tag
      expect(tags.find(tag => tag.includes('path-'))).toBeTruthy();
      
      // Check for format tag
      expect(tags.find(tag => tag.includes('format-webp'))).toBeTruthy();
      
      // Check for width tag
      expect(tags.find(tag => tag.includes('width-800'))).toBeTruthy();
    });

    it('should properly shutdown', async () => {
      // Set up some internal state
      await cacheService.initialize();
      
      // Shutdown the service
      await cacheService.shutdown();
      
      // Should log shutdown
      expect(logger.info).toHaveBeenCalledWith('DefaultCacheService shutdown complete');
    });
  });
});