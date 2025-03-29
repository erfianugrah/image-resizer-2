import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheTagsManager } from '../../../src/services/cache/CacheTagsManager';
import { ConfigurationService, StorageResult, TransformOptions } from '../../../src/services/interfaces';

describe('CacheTagsManager', () => {
  // Mock logger
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  // Create a fixed config object to avoid mock implementation issues
  const mockConfig = {
    cache: {
      cacheTags: {
        enabled: true,
        prefix: 'test-',
        includeImageDimensions: true,
        includeFormat: true,
        includeQuality: true,
        includeDerivative: true,
        customTags: ['global-tag1', 'global-tag2'],
        pathBasedTags: {
          '/products/': ['product', 'catalog'],
          '/blog/': ['blog', 'content']
        }
      }
    },
    // Include any other required configuration
    environment: 'test'
  };
  
  // Mock configuration service
  const configService = {
    getConfig: () => mockConfig
  } as unknown as ConfigurationService;

  // Instance to test
  let cacheTagsManager: CacheTagsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheTagsManager = new CacheTagsManager(logger, configService);
  });

  describe('generateCacheTags', () => {
    it('should return empty array when cache tags are disabled', () => {
      // Create a special instance with disabled cache tags
      const disabledConfig = {
        cache: {
          cacheTags: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      const disabledTagsManager = new CacheTagsManager(logger, disabledConfigService);

      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 12345,
        path: '/test.jpg'
      };
      const options: TransformOptions = {};

      const tags = disabledTagsManager.generateCacheTags(request, storageResult, options);

      expect(tags).toEqual([]);
      expect(logger.debug).toHaveBeenCalledWith('Cache tags are disabled');
    });

    it('should generate tags with proper prefix and content information', () => {
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 12345,
        path: '/test.jpg'
      };
      const options: TransformOptions = {
        width: 800,
        height: 600,
        format: 'webp',
        quality: 80
      };

      // Spy on the logger.debug method to see what's happening
      console.log('Mock config:', configService.getConfig());
      
      const tags = cacheTagsManager.generateCacheTags(request, storageResult, options);
      
      // Debug output
      console.log('Generated tags:', tags);
      console.log('Logger debug calls:', logger.debug.mock.calls);

      // Verify path tag is created
      expect(tags).toContain('test-path-/test.jpg');
      
      // Verify content type tags
      expect(tags).toContain('test-type-image');
      expect(tags).toContain('test-content-image-jpeg');
      
      // Verify source type tag
      expect(tags).toContain('test-origin-remote');
      
      // Verify transformation option tags
      expect(tags).toContain('test-format-webp');
      expect(tags).toContain('test-width-800');
      expect(tags).toContain('test-height-600');
      expect(tags).toContain('test-quality-80');
      
      // Verify host tag
      expect(tags).toContain('test-host-example.com');
      
      // Verify size bucket tag
      expect(tags).toContain('test-size-tiny');
      
      // Verify width bucket tag
      expect(tags).toContain('test-width-bucket-medium');
      
      // Verify global tags are included
      expect(tags).toContain('test-global-tag1');
      expect(tags).toContain('test-global-tag2');
    });

    it('should generate path segment tags for hierarchical purging', () => {
      // Create a special config with conditionalTags for this test
      const pathConfig = structuredClone(mockConfig);
      // Add conditionalTags property that's not in the interface but used in our implementation
      (pathConfig.cache.cacheTags as any).conditionalTags = {
        'path:products': ['product', 'catalog']
      };
      
      const pathConfigService = {
        getConfig: () => pathConfig
      } as unknown as ConfigurationService;
      
      const pathTagsManager = new CacheTagsManager(logger, pathConfigService);

      const request = new Request('https://example.com/products/category/item.jpg');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 12345,
        path: '/products/category/item.jpg'
      };
      const options: TransformOptions = {};

      const tags = pathTagsManager.generateCacheTags(request, storageResult, options);
      
      console.log('Path segment tags:', tags);

      // Verify path tags
      expect(tags).toContain('test-path-/products/category/item.jpg');
      expect(tags).toContain('test-segment-0-products');
      expect(tags).toContain('test-segment-1-category');
      expect(tags).toContain('test-segment-2-item.jpg');
      expect(tags).toContain('test-dir-products/category');
      
      // Verify path-based tags are applied using conditionalTags
      expect(tags).toContain('test-product');
      expect(tags).toContain('test-catalog');
    });

    it('should handle feature flags and watermark tags', () => {
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 12345,
        path: '/test.jpg'
      };
      const options: TransformOptions = {
        features: ['responsive', 'high-quality'],
        watermark: 'logo'
      };

      const tags = cacheTagsManager.generateCacheTags(request, storageResult, options);

      // Verify feature tags
      expect(tags).toContain('test-feature-responsive');
      expect(tags).toContain('test-feature-high-quality');
      
      // Verify watermark tags
      expect(tags).toContain('test-watermarked');
      expect(tags).toContain('test-watermark-logo');
    });

    it('should handle query parameters for custom tags', () => {
      const request = new Request('https://example.com/test.jpg?cache-tags=special,featured');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 12345,
        path: '/test.jpg'
      };
      const options: TransformOptions = {};

      const tags = cacheTagsManager.generateCacheTags(request, storageResult, options);

      // Verify custom query tags
      expect(tags).toContain('test-custom-special');
      expect(tags).toContain('test-custom-featured');
    });

    it('should handle tenant tags from options or query parameters', () => {
      const request = new Request('https://example.com/test.jpg?tenant=customer-1');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 12345,
        path: '/test.jpg'
      };
      const options: TransformOptions = {};

      const tags = cacheTagsManager.generateCacheTags(request, storageResult, options);

      // Verify tenant tag from query
      expect(tags).toContain('test-tenant-customer-1');

      // Test with tenant in options
      const request2 = new Request('https://example.com/test.jpg');
      const options2: TransformOptions = {
        tenant: 'customer-2'
      };

      const tags2 = cacheTagsManager.generateCacheTags(request2, storageResult, options2);

      // Verify tenant tag from options
      expect(tags2).toContain('test-tenant-customer-2');
    });

    it('should handle errors gracefully and throw CacheTagGenerationError', () => {
      // Create a request that will cause an error when processing
      const invalidRequest = null as unknown as Request; // Null request to trigger error

      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 12345,
        path: '/test.jpg'
      };
      const options: TransformOptions = {};

      // Use try/catch since vitest's toThrow might not be working as expected
      let errorThrown = false;
      let errorMessage = '';
      
      try {
        cacheTagsManager.generateCacheTags(invalidRequest, storageResult, options);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      
      // Verify error was thrown
      expect(errorThrown).toBe(true);
      expect(errorMessage).toContain('Failed to generate cache tags');

      // Verify error logging
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to generate cache tags',
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });
  });

  describe('getSizeBucket', () => {
    it('should return correct size bucket for different dimensions', () => {
      // Use a private method access technique for testing
      const getSizeBucket = (cacheTagsManager as any).getSizeBucket.bind(cacheTagsManager);
      
      expect(getSizeBucket(50)).toBe('tiny');
      expect(getSizeBucket(200)).toBe('small');
      expect(getSizeBucket(600)).toBe('medium');
      expect(getSizeBucket(1000)).toBe('large');
      expect(getSizeBucket(1500)).toBe('xlarge');
      expect(getSizeBucket(3000)).toBe('huge');
    });
  });

  describe('getFileSizeBucket', () => {
    it('should return correct size bucket for different file sizes', () => {
      // Use a private method access technique for testing
      const getFileSizeBucket = (cacheTagsManager as any).getFileSizeBucket.bind(cacheTagsManager);
      
      expect(getFileSizeBucket(5 * 1024)).toBe('mini');       // 5KB
      expect(getFileSizeBucket(30 * 1024)).toBe('tiny');      // 30KB
      expect(getFileSizeBucket(100 * 1024)).toBe('small');    // 100KB
      expect(getFileSizeBucket(300 * 1024)).toBe('medium');   // 300KB
      expect(getFileSizeBucket(700 * 1024)).toBe('large');    // 700KB
      expect(getFileSizeBucket(3 * 1024 * 1024)).toBe('xlarge'); // 3MB
      expect(getFileSizeBucket(10 * 1024 * 1024)).toBe('huge');  // 10MB
    });
  });

  describe('evaluateCondition', () => {
    it('should correctly evaluate path conditions', () => {
      // Use a private method access technique for testing
      const evaluateCondition = (cacheTagsManager as any).evaluateCondition.bind(cacheTagsManager);
      
      const request = new Request('https://example.com/products/item1.jpg');
      const storageResult: StorageResult = {
        path: '/products/item1.jpg',
        contentType: 'image/jpeg'
      };
      const options: TransformOptions = {};

      expect(evaluateCondition('path:products', request, storageResult, options)).toBe(true);
      expect(evaluateCondition('path:nonexistent', request, storageResult, options)).toBe(false);
    });

    it('should correctly evaluate format conditions', () => {
      // Use a private method access technique for testing
      const evaluateCondition = (cacheTagsManager as any).evaluateCondition.bind(cacheTagsManager);
      
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        path: '/test.jpg',
        contentType: 'image/jpeg'
      };
      const options: TransformOptions = { format: 'webp' };

      expect(evaluateCondition('format:webp', request, storageResult, options)).toBe(true);
      expect(evaluateCondition('format:jpeg', request, storageResult, options)).toBe(false);
    });

    it('should correctly evaluate content type conditions', () => {
      // Use a private method access technique for testing
      const evaluateCondition = (cacheTagsManager as any).evaluateCondition.bind(cacheTagsManager);
      
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        path: '/test.jpg',
        contentType: 'image/jpeg'
      };
      const options: TransformOptions = {};

      expect(evaluateCondition('contentType:image/jpeg', request, storageResult, options)).toBe(true);
      expect(evaluateCondition('contentType:image', request, storageResult, options)).toBe(true);
      expect(evaluateCondition('contentType:video', request, storageResult, options)).toBe(false);
    });

    it('should correctly evaluate host conditions', () => {
      // Use a private method access technique for testing
      const evaluateCondition = (cacheTagsManager as any).evaluateCondition.bind(cacheTagsManager);
      
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        path: '/test.jpg'
      };
      const options: TransformOptions = {};

      expect(evaluateCondition('host:example.com', request, storageResult, options)).toBe(true);
      expect(evaluateCondition('host:example', request, storageResult, options)).toBe(true);
      expect(evaluateCondition('host:otherdomain', request, storageResult, options)).toBe(false);
    });

    it('should correctly evaluate query conditions', () => {
      // Use a private method access technique for testing
      const evaluateCondition = (cacheTagsManager as any).evaluateCondition.bind(cacheTagsManager);
      
      const request = new Request('https://example.com/test.jpg?param1=value&debug=true');
      const storageResult: StorageResult = {
        path: '/test.jpg'
      };
      const options: TransformOptions = {};

      expect(evaluateCondition('query:param1', request, storageResult, options)).toBe(true);
      expect(evaluateCondition('query:debug', request, storageResult, options)).toBe(true);
      expect(evaluateCondition('query:nonexistent', request, storageResult, options)).toBe(false);
    });

    it('should handle errors during condition evaluation', () => {
      // Use a private method access technique for testing
      const evaluateCondition = (cacheTagsManager as any).evaluateCondition.bind(cacheTagsManager);
      
      const invalidRequest = {} as Request; // Invalid request to trigger error
      const storageResult: StorageResult = {
        path: '/test.jpg'
      };
      const options: TransformOptions = {};

      const result = evaluateCondition('host:example.com', invalidRequest, storageResult, options);
      
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error evaluating condition'),
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });
  });
});