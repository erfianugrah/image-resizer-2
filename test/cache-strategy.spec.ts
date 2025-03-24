/**
 * Tests for the enhanced cache strategy implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultCacheService } from '../src/services/cacheService';
import { DefaultConfigurationService } from '../src/services/configurationService';
import { createLogger } from '../src/utils/logging';
import { TransformOptions } from '../src/transform';
import { StorageResult } from '../src/services/interfaces';

// Test environment setup
const mockEnv = {
  IMAGE_RESIZER_VERSION: '2.0.0',
};

// Mock configuration
const mockConfig = {
  environment: 'test',
  debug: { enabled: true },
  cache: {
    method: 'cache-api',
    cacheability: true,
    ttl: {
      ok: 86400,
      clientError: 300,
      serverError: 60
    },
    enableStaleWhileRevalidate: true,
    immutableContent: {
      enabled: true,
      contentTypes: ['image/svg+xml', 'font/'],
      paths: ['/static/', '/assets/'],
      derivatives: ['logo', 'icon']
    },
    cacheTags: {
      enabled: true,
      prefix: 'img-',
    },
    varyOnClientHints: true,
    enableResourceHints: true,
    pathBasedTtl: {
      '/blog/': 3600,
      '/news/': 1800,
      '/static/': 604800
    },
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
  responsive: {
    format: 'auto',
    quality: 85,
    fit: 'scale-down',
    metadata: 'none'
  },
  storage: {},
  derivatives: {
    thumbnail: {
      width: 200,
      height: 200,
      fit: 'cover'
    },
    banner: {
      width: 1200,
      height: 400,
      fit: 'cover',
      quality: 90
    },
    icon: {
      width: 32,
      height: 32
    }
  },
  features: {
    enableEnhancedCaching: true
  },
  logging: {
    level: 'debug'
  }
};

// Mock logger
const mockLogger = createLogger({
  ...mockConfig,
  logging: { level: 'none' }
}, 'CacheTest');

// Mock request
const createMockRequest = (url = 'https://example.com/image.jpg', headers = {}) => {
  return new Request(url, {
    headers: new Headers(headers)
  });
};

// Mock response
const createMockResponse = (status = 200, contentType = 'image/jpeg', body = 'test-image-data') => {
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Length': String(body.length)
  });
  return new Response(body, { status, headers });
};

// Mock storage result
const createMockStorageResult = (options: Partial<StorageResult> = {}): StorageResult => {
  const defaults: StorageResult = {
    response: createMockResponse(),
    sourceType: 'remote',
    contentType: 'image/jpeg',
    size: 12345,
    path: '/image.jpg'
  };
  return { ...defaults, ...options };
};

// Mock execution context
const createMockExecutionContext = () => {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn()
  };
};

describe('Enhanced Cache Strategy', () => {
  let configService: DefaultConfigurationService;
  let cacheService: DefaultCacheService;
  let mockCaches: any;
  
  beforeEach(() => {
    // Mock the global caches object
    mockCaches = {
      default: {
        match: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      }
    };
    
    global.caches = mockCaches as any;
    
    // Create the config service
    configService = new DefaultConfigurationService(mockLogger, mockEnv as any);
    
    // Mock the config service getConfig method
    vi.spyOn(configService, 'getConfig').mockReturnValue(mockConfig as any);
    
    // Create the cache service
    cacheService = new DefaultCacheService(mockLogger, configService);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    delete global.caches;
  });

  describe('applyCacheHeaders', () => {
    it('should apply base cache headers to a response', () => {
      const response = createMockResponse();
      
      const result = cacheService.applyCacheHeaders(response);
      
      expect(result.headers.get('Cache-Control')).toContain('public');
      expect(result.headers.get('Cache-Control')).toContain(`max-age=${mockConfig.cache.ttl.ok}`);
    });
    
    it('should use intelligent TTL based on content type', () => {
      const storageResult = createMockStorageResult({
        contentType: 'image/svg+xml',
        path: '/assets/logo.svg'
      });
      
      const response = createMockResponse(200, 'image/svg+xml');
      const options: TransformOptions = {};
      
      const result = cacheService.applyCacheHeaders(response, options, storageResult);
      
      // SVG files should have a longer TTL
      expect(result.headers.get('Cache-Control')).toContain('immutable');
    });
    
    it('should add Vary headers correctly', () => {
      const response = createMockResponse();
      
      const result = cacheService.applyCacheHeaders(response);
      
      expect(result.headers.get('Vary')).toContain('Accept');
      // Should include client hints as configured
      expect(result.headers.get('Vary')).toContain('DPR');
    });
    
    it('should apply stale-while-revalidate for successful responses', () => {
      const response = createMockResponse(200);
      
      const result = cacheService.applyCacheHeaders(response);
      
      expect(result.headers.get('Cache-Control')).toContain('stale-while-revalidate');
    });
    
    it('should apply different cache settings for error responses', () => {
      const clientErrorResponse = createMockResponse(404, 'text/plain', 'Not Found');
      const serverErrorResponse = createMockResponse(500, 'text/plain', 'Server Error');
      
      const clientErrorResult = cacheService.applyCacheHeaders(clientErrorResponse);
      const serverErrorResult = cacheService.applyCacheHeaders(serverErrorResponse);
      
      expect(clientErrorResult.headers.get('Cache-Control')).toContain(`max-age=${mockConfig.cache.ttl.clientError}`);
      expect(serverErrorResult.headers.get('Cache-Control')).toContain(`max-age=${mockConfig.cache.ttl.serverError}`);
    });
    
    it('should recognize derivative-specific caching requirements', () => {
      const storageResult = createMockStorageResult();
      const response = createMockResponse();
      const options: TransformOptions = {
        derivative: 'icon',
        width: 32,
        height: 32
      };
      
      const result = cacheService.applyCacheHeaders(response, options, storageResult);
      
      // Icons should have immutable caching
      expect(result.headers.get('Cache-Control')).toContain('immutable');
    });
  });

  describe('calculateTtl', () => {
    it('should calculate appropriate TTL based on content type and response status', () => {
      const response = createMockResponse(200, 'image/jpeg');
      const options: TransformOptions = {};
      
      const ttl = cacheService.calculateTtl(response, options);
      
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toEqual(mockConfig.cache.ttl.ok);
    });
    
    it('should increase TTL for static assets', () => {
      const response = createMockResponse(200, 'image/svg+xml');
      const options: TransformOptions = {};
      const storageResult = createMockStorageResult({
        contentType: 'image/svg+xml',
        path: '/static/logo.svg'
      });
      
      const ttl = cacheService.calculateTtl(response, options, storageResult);
      
      // Static SVGs should get a longer TTL
      expect(ttl).toBeGreaterThan(mockConfig.cache.ttl.ok);
    });
    
    it('should decrease TTL for frequently changing content', () => {
      const response = createMockResponse(200, 'image/jpeg');
      const options: TransformOptions = {};
      const storageResult = createMockStorageResult({
        path: '/news/latest-update.jpg'
      });
      
      const ttl = cacheService.calculateTtl(response, options, storageResult);
      
      // News content should have shorter TTL
      expect(ttl).toBeLessThan(mockConfig.cache.ttl.ok);
      expect(ttl).toEqual(1800); // From pathBasedTtl config
    });
    
    it('should apply path-based TTL correctly', () => {
      const response = createMockResponse();
      const options: TransformOptions = {};
      
      // Test with different paths
      const blogResult = createMockStorageResult({ path: '/blog/article.jpg' });
      const staticResult = createMockStorageResult({ path: '/static/logo.jpg' });
      
      const blogTtl = cacheService.calculateTtl(response, options, blogResult);
      const staticTtl = cacheService.calculateTtl(response, options, staticResult);
      
      expect(blogTtl).toEqual(3600); // From pathBasedTtl config
      expect(staticTtl).toBeGreaterThan(mockConfig.cache.ttl.ok); // Static assets should have longer TTL
    });
  });

  describe('shouldBypassCache', () => {
    it('should bypass cache for requests with cache control headers', () => {
      const request = createMockRequest('https://example.com/image.jpg', {
        'Cache-Control': 'no-cache'
      });
      
      const result = cacheService.shouldBypassCache(request);
      
      expect(result).toBe(true);
    });
    
    it('should bypass cache for debug requests', () => {
      const request = createMockRequest('https://example.com/image.jpg?debug=true');
      
      const result = cacheService.shouldBypassCache(request);
      
      expect(result).toBe(true);
    });
    
    it('should bypass cache for refresh requests', () => {
      const request = createMockRequest('https://example.com/image.jpg?refresh=1');
      
      const result = cacheService.shouldBypassCache(request);
      
      expect(result).toBe(true);
    });
    
    it('should not bypass cache for normal requests', () => {
      const request = createMockRequest();
      
      const result = cacheService.shouldBypassCache(request);
      
      expect(result).toBe(false);
    });
    
    it('should consider format-specific bypass settings', () => {
      const request = createMockRequest();
      const options: TransformOptions = {
        format: 'avif'
      };
      
      // Set bypassFormats in the config
      const configWithBypass = {
        ...mockConfig,
        cache: {
          ...mockConfig.cache,
          bypassFormats: ['avif'] // Bypass AVIF for testing
        }
      };
      
      vi.spyOn(configService, 'getConfig').mockReturnValueOnce(configWithBypass as any);
      
      const result = cacheService.shouldBypassCache(request, options);
      
      expect(result).toBe(true);
    });
  });

  describe('generateCacheTags', () => {
    it('should generate appropriate cache tags for an image', () => {
      const request = createMockRequest('https://example.com/products/shoes.jpg');
      const storageResult = createMockStorageResult({
        path: '/products/shoes.jpg',
        contentType: 'image/jpeg',
        width: 800,
        height: 600
      });
      const options: TransformOptions = {
        width: 400,
        height: 300,
        format: 'webp',
        quality: 80
      };
      
      const tags = cacheService.generateCacheTags(request, storageResult, options);
      
      // Check for path-based tags - in our implementation, path tags format may vary
      expect(tags.some(tag => tag.includes('path'))).toBe(true);
      
      // Check for format-based tags
      expect(tags).toContain('img-imgfmt-jpeg');
      expect(tags).toContain('img-mime-image');
      
      // Check for dimension category tags
      expect(tags).toContain('img-aspect-landscape');
      
      // Check for transformation tags
      expect(tags.some(tag => tag.includes('width'))).toBe(true);
      expect(tags.some(tag => tag.includes('format'))).toBe(true);
    });
    
    it('should include derivative information in tags if available', () => {
      const request = createMockRequest();
      const storageResult = createMockStorageResult();
      const options: TransformOptions = {
        derivative: 'thumbnail',
        width: 200,
        height: 200
      };
      
      const tags = cacheService.generateCacheTags(request, storageResult, options);
      
      expect(tags.some(tag => tag.includes('thumbnail'))).toBe(true);
    });
    
    it('should handle missing information gracefully', () => {
      const request = createMockRequest();
      const storageResult = createMockStorageResult({
        contentType: null,
        width: undefined,
        height: undefined
      });
      const options: TransformOptions = {};
      
      const tags = cacheService.generateCacheTags(request, storageResult, options);
      
      // Should still generate basic tags even with missing info
      expect(tags.length).toBeGreaterThan(0);
    });
  });

  describe('cacheWithFallback', () => {
    it('should cache successfully with Cache API', async () => {
      const request = createMockRequest();
      const response = createMockResponse();
      const ctx = createMockExecutionContext();
      
      // Mock successful cache put
      mockCaches.default.put.mockResolvedValueOnce(undefined);
      
      const result = await cacheService.cacheWithFallback(request, response, ctx);
      
      expect(mockCaches.default.put).toHaveBeenCalledWith(expect.anything(), expect.anything());
      expect(result.status).toBe(200);
    });
    
    it('should apply stale-while-revalidate pattern when configured', async () => {
      const request = createMockRequest();
      const response = createMockResponse();
      const ctx = createMockExecutionContext();
      const staleResponse = createMockResponse();
      
      // Add stale headers to simulate a stale response
      const staleHeaders = new Headers(staleResponse.headers);
      staleHeaders.set('Date', new Date(Date.now() - 100000).toUTCString());
      staleHeaders.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      
      const modifiedStaleResponse = new Response(staleResponse.body, {
        status: staleResponse.status,
        headers: staleHeaders
      });
      
      // Mock cache match to return a stale response
      mockCaches.default.match.mockResolvedValueOnce(modifiedStaleResponse);
      
      const result = await cacheService.cacheWithFallback(request, response, ctx);
      
      // Should still return a response
      expect(result.status).toBe(200);
      
      // Should have called waitUntil for background revalidation
      expect(ctx.waitUntil).toHaveBeenCalled();
    });
    
    it('should bypass cache when configured', async () => {
      const request = createMockRequest('https://example.com/image.jpg?nocache=1');
      const response = createMockResponse();
      const ctx = createMockExecutionContext();
      
      const result = await cacheService.cacheWithFallback(request, response, ctx);
      
      // Should not attempt to use cache
      expect(mockCaches.default.match).not.toHaveBeenCalled();
      expect(mockCaches.default.put).not.toHaveBeenCalled();
      
      // Should still return the response
      expect(result.status).toBe(200);
    });
    
    it('should fall back to cache headers only when Cache API fails', async () => {
      const request = createMockRequest();
      const response = createMockResponse();
      const ctx = createMockExecutionContext();
      
      // Make Cache API throw an error
      mockCaches.default.put.mockRejectedValueOnce(new Error('Cache API error'));
      
      const result = await cacheService.cacheWithFallback(request, response, ctx);
      
      // Should still return a valid response
      expect(result.status).toBe(200);
      expect(result.headers.get('Cache-Control')).toBeDefined();
    });
  });
});