import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CachePerformanceManager } from '../../../src/services/cache/CachePerformanceManager';
import { ConfigurationService, TransformOptions, StorageResult } from '../../../src/services/interfaces';

describe('CachePerformanceManager', () => {
  // Mock logger
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  };

  // Mock configuration
  const mockConfig = {
    cache: {
      resourceHints: {
        preconnect: ['https://cdn1.example.com', 'https://cdn2.example.com'],
        preloadPatterns: {
          'product': ['https://cdn.example.com/logo.png', 'https://cdn.example.com/header.jpg'],
          'profile': ['https://cdn.example.com/avatar.png']
        }
      }
    }
  };

  // Mock configuration service
  const configService = {
    getConfig: vi.fn().mockReturnValue(mockConfig)
  } as unknown as ConfigurationService;

  // Instance to test
  let performanceManager: CachePerformanceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    performanceManager = new CachePerformanceManager(logger, configService);
  });

  describe('addResourceHints', () => {
    it('should add preconnect hints to HTML responses', () => {
      // Create a test HTML response
      const response = new Response('<html></html>', {
        headers: { 'Content-Type': 'text/html' }
      });
      
      const request = new Request('https://example.com/test.html');
      
      // Call the method
      const result = performanceManager.addResourceHints(response, request);
      
      // Check that Link header contains preconnect entries
      const linkHeader = result.headers.get('Link');
      expect(linkHeader).toBeDefined();
      expect(linkHeader).toContain('<https://cdn1.example.com>; rel=preconnect');
      expect(linkHeader).toContain('<https://cdn2.example.com>; rel=preconnect');
    });
    
    it('should not add hints to non-HTML responses', () => {
      // Create a test JSON response
      const response = new Response('{"test": true}', {
        headers: { 'Content-Type': 'application/json' }
      });
      
      const request = new Request('https://example.com/api/data.json');
      
      // Call the method
      const result = performanceManager.addResourceHints(response, request);
      
      // Check that Link header was not added
      expect(result.headers.has('Link')).toBe(false);
    });
    
    it('should add preload hints based on path patterns', () => {
      // Create a test HTML response
      const response = new Response('<html></html>', {
        headers: { 'Content-Type': 'text/html' }
      });
      
      const request = new Request('https://example.com/product/123');
      
      // Create storage result with path that will match preload pattern
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'text/html',
        size: 1000,
        path: '/product/123.html',
      };
      
      // Call the method
      const result = performanceManager.addResourceHints(response, request, undefined, storageResult);
      
      // Check that Link header contains both preconnect and preload entries
      const linkHeader = result.headers.get('Link');
      expect(linkHeader).toBeDefined();
      expect(linkHeader).toContain('<https://cdn.example.com/logo.png>; rel=preload; as=image');
      expect(linkHeader).toContain('<https://cdn.example.com/header.jpg>; rel=preload; as=image');
    });
  });
  
  describe('recordCacheMetric', () => {
    it('should log cache metrics with appropriate bucketing', async () => {
      // Create a test response with cache status
      const response = new Response('test', {
        headers: { 'X-Cache-Status': 'HIT' }
      });
      
      const request = new Request('https://example.com/products/category/item.jpg');
      
      // Call the method
      await performanceManager.recordCacheMetric(request, response);
      
      // Verify that the logger was called with the expected values
      expect(logger.debug).toHaveBeenCalledWith('Cache metric', expect.objectContaining({
        url: 'https://example.com/products/category/item.jpg',
        cacheStatus: 'HIT',
        pathBucket: '/products/category',
        metricKey: 'cache_HIT_/products/category'
      }));
    });
    
    it('should use "unknown" for missing cache status', async () => {
      // Create a test response without cache status
      const response = new Response('test');
      
      const request = new Request('https://example.com/test.jpg');
      
      // Call the method
      await performanceManager.recordCacheMetric(request, response);
      
      // Verify logger was called with "unknown" cache status
      expect(logger.debug).toHaveBeenCalledWith('Cache metric', expect.objectContaining({
        cacheStatus: 'unknown',
        metricKey: 'cache_unknown_/test.jpg'
      }));
    });
  });
});