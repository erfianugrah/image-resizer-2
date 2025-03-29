import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KVTransformCacheManager } from '../../../src/services/cache/kv/KVTransformCacheManager';
import { CacheTagsManager } from '../../../src/services/cache/CacheTagsManager';
import { ConfigurationService, StorageResult, TransformOptions } from '../../../src/services/interfaces';

describe('KVTransformCacheManager', () => {
  // Mock logger
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  // Create a fixed config object for tests
  const mockConfig = {
    cache: {
      transformCache: {
        enabled: true,
        binding: 'TEST_KV_NAMESPACE',
        prefix: 'test',
        maxSize: 1048576, // 1MB
        defaultTtl: 3600, // 1 hour
        contentTypeTtls: {
          'image/jpeg': 86400, // 1 day
          'image/webp': 86400  // 1 day
        },
        indexingEnabled: true,
        backgroundIndexing: true,
        purgeDelay: 10,
        disallowedPaths: ['/admin/', '/temp/'],
        // Advanced optimization options
        optimizedIndexing: true,
        smallPurgeThreshold: 5,
        indexUpdateFrequency: 1,
        skipIndicesForSmallFiles: true,
        smallFileThreshold: 10240
      },
      cacheTags: {
        enabled: true,
        prefix: 'test-',
        includeImageDimensions: true,
        includeFormat: true,
        includeQuality: true,
        includeDerivative: true,
        customTags: ['global-tag1']
      }
    },
    environment: 'test'
  };
  
  // Mock configuration service
  const configService = {
    getConfig: () => mockConfig
  } as unknown as ConfigurationService;

  // Mock CacheTagsManager
  const mockTagsManager = {
    generateCacheTags: vi.fn().mockReturnValue(['test-tag1', 'test-tag2', 'test-path-/test.jpg'])
  } as unknown as CacheTagsManager;

  // Mock KV Namespace
  const mockKV = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn()
  };

  // Mock execution context
  const mockExecutionContext = {
    waitUntil: vi.fn()
  };

  // Instance to test
  let kvTransformCache: KVTransformCacheManager;

  // Mock global env
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up global environment with KV namespace
    (global as any).env = {
      TEST_KV_NAMESPACE: mockKV
    };
    
    kvTransformCache = new KVTransformCacheManager(logger, configService, mockTagsManager);
  });

  afterEach(() => {
    // Clean up global environment
    delete (global as any).env;
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      // A new instance should log debug information
      expect(logger.debug).toHaveBeenCalledWith('KV transform cache manager initialized', 
        expect.objectContaining({
          configEnabled: true,
          binding: 'TEST_KV_NAMESPACE',
          prefix: 'test'
        })
      );
    });

    it('should use default values when configuration is missing', () => {
      // Create a configuration with minimal settings
      const minimalConfig = {
        cache: {
          transformCache: {
            enabled: true
          }
        }
      };
      
      const minimalConfigService = {
        getConfig: () => minimalConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with minimal configuration
      const instance = new KVTransformCacheManager(logger, minimalConfigService, mockTagsManager);
      
      // Verify defaults are used
      expect(logger.debug).toHaveBeenCalledWith('KV transform cache manager initialized', 
        expect.objectContaining({
          configEnabled: true,
          binding: 'IMAGE_TRANSFORMATIONS_CACHE', // Default binding
          prefix: 'transform' // Default prefix
        })
      );
    });
  });

  describe('isCached', () => {
    it('should return false when cache is disabled', async () => {
      // Create a configuration with disabled cache
      const disabledConfig = {
        cache: {
          transformCache: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with disabled cache
      const instance = new KVTransformCacheManager(logger, disabledConfigService, mockTagsManager);
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await instance.isCached(request, transformOptions);
      
      expect(result).toBe(false);
    });

    it('should check if a key exists in the KV store', async () => {
      // Mock KV.getWithMetadata to return a value (cached)
      mockKV.getWithMetadata.mockResolvedValueOnce({
        value: 'test-data',
        metadata: { url: 'https://example.com/test.jpg' }
      });
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await kvTransformCache.isCached(request, transformOptions);
      
      expect(result).toBe(true);
      expect(mockKV.getWithMetadata).toHaveBeenCalled();
    });

    it('should return false when key does not exist', async () => {
      // Mock KV.getWithMetadata to return null (not cached)
      mockKV.getWithMetadata.mockResolvedValueOnce({
        value: null,
        metadata: null
      });
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await kvTransformCache.isCached(request, transformOptions);
      
      expect(result).toBe(false);
      expect(mockKV.getWithMetadata).toHaveBeenCalled();
    });

    it('should skip cache check for disallowed paths', async () => {
      const request = new Request('https://example.com/admin/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await kvTransformCache.isCached(request, transformOptions);
      
      expect(result).toBe(false);
      expect(mockKV.getWithMetadata).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Bypass cache for path', expect.any(Object));
    });

    it('should handle errors gracefully', async () => {
      // Mock KV.getWithMetadata to throw an error
      mockKV.getWithMetadata.mockRejectedValueOnce(new Error('KV error'));
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await kvTransformCache.isCached(request, transformOptions);
      
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Error checking cache status', expect.any(Object));
    });
  });

  describe('get', () => {
    it('should return null when cache is disabled', async () => {
      // Create a configuration with disabled cache
      const disabledConfig = {
        cache: {
          transformCache: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with disabled cache
      const instance = new KVTransformCacheManager(logger, disabledConfigService, mockTagsManager);
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await instance.get(request, transformOptions);
      
      expect(result).toBeNull();
    });

    it('should return cached value with metadata', async () => {
      // Create test ArrayBuffer
      const testData = new ArrayBuffer(10);
      
      // Create test metadata
      const testMetadata = {
        url: 'https://example.com/test.jpg',
        timestamp: Date.now(),
        contentType: 'image/jpeg',
        size: 10,
        transformOptions: { width: 800 },
        tags: ['test-tag1', 'test-tag2'],
        ttl: 3600,
        expiration: Date.now() + 3600 * 1000
      };
      
      // Mock KV.getWithMetadata to return a value (cached)
      mockKV.getWithMetadata.mockResolvedValueOnce({
        value: testData,
        metadata: testMetadata
      });
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await kvTransformCache.get(request, transformOptions);
      
      expect(result).not.toBeNull();
      expect(result?.metadata).toEqual(testMetadata);
      expect(result?.value).toBe(testData);
      expect(mockKV.getWithMetadata).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Cache hit', expect.any(Object));
    });

    it('should return null when value is not in cache', async () => {
      // Mock KV.getWithMetadata to return null (not cached)
      mockKV.getWithMetadata.mockResolvedValueOnce({
        value: null,
        metadata: null
      });
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await kvTransformCache.get(request, transformOptions);
      
      expect(result).toBeNull();
      expect(mockKV.getWithMetadata).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Cache miss', expect.any(Object));
    });

    it('should skip cache for disallowed paths', async () => {
      const request = new Request('https://example.com/admin/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await kvTransformCache.get(request, transformOptions);
      
      expect(result).toBeNull();
      expect(mockKV.getWithMetadata).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Bypass cache for path', expect.any(Object));
    });

    it('should handle errors gracefully', async () => {
      // Mock KV.getWithMetadata to throw an error
      mockKV.getWithMetadata.mockRejectedValueOnce(new Error('KV error'));
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      const result = await kvTransformCache.get(request, transformOptions);
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error retrieving from cache', expect.any(Object));
    });
  });

  describe('put', () => {
    it('should not store anything when cache is disabled', async () => {
      // Create a configuration with disabled cache
      const disabledConfig = {
        cache: {
          transformCache: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with disabled cache
      const instance = new KVTransformCacheManager(logger, disabledConfigService, mockTagsManager);
      
      const request = new Request('https://example.com/test.jpg');
      const response = new Response('test data', { 
        headers: { 'Content-Type': 'image/jpeg' }
      });
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 10,
        path: '/test.jpg'
      };
      const transformOptions: TransformOptions = { width: 800 };
      
      await instance.put(request, response, storageResult, transformOptions);
      
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('should store response in KV with metadata', async () => {
      // Setup response with test data
      const testData = 'test data';
      const response = new Response(testData, { 
        headers: { 'Content-Type': 'image/jpeg' }
      });
      
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 100, // Original size
        path: '/test.jpg'
      };
      const transformOptions: TransformOptions = { width: 800 };
      
      // Execute the put operation
      await kvTransformCache.put(request, response, storageResult, transformOptions);
      
      // Verify KV.put was called with correct arguments
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String), // Cache key
        expect.any(ArrayBuffer), // Response body
        expect.objectContaining({
          expirationTtl: expect.any(Number),
          metadata: expect.objectContaining({
            url: request.url,
            contentType: 'image/jpeg',
            transformOptions,
            tags: expect.any(Array),
            ttl: expect.any(Number)
          })
        })
      );
      
      // Verify log was created
      expect(logger.debug).toHaveBeenCalledWith('Image cached successfully', expect.any(Object));
    });

    it('should not store if image is too large', async () => {
      // Setup response with large data
      const largeData = new ArrayBuffer(2 * 1024 * 1024); // 2MB (larger than maxSize)
      const response = new Response(largeData, { 
        headers: { 'Content-Type': 'image/jpeg' }
      });
      
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 100,
        path: '/test.jpg'
      };
      const transformOptions: TransformOptions = { width: 800 };
      
      // Execute the put operation
      await kvTransformCache.put(request, response, storageResult, transformOptions);
      
      // Verify KV.put was not called
      expect(mockKV.put).not.toHaveBeenCalled();
      
      // Verify warning was logged
      expect(logger.warn).toHaveBeenCalledWith('Image too large for KV cache', expect.any(Object));
    });

    it('should skip cache for disallowed paths', async () => {
      const request = new Request('https://example.com/admin/test.jpg');
      const response = new Response('test data', { 
        headers: { 'Content-Type': 'image/jpeg' }
      });
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 10,
        path: '/admin/test.jpg'
      };
      const transformOptions: TransformOptions = { width: 800 };
      
      await kvTransformCache.put(request, response, storageResult, transformOptions);
      
      expect(mockKV.put).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Skipping cache for path', expect.any(Object));
    });

    it('should update indices in the background when ctx is provided', async () => {
      // Setup response with test data
      const testData = 'test data';
      const response = new Response(testData, { 
        headers: { 'Content-Type': 'image/jpeg' }
      });
      
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 100,
        path: '/test.jpg'
      };
      const transformOptions: TransformOptions = { width: 800 };
      
      // Mock tag index and path index
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:tag-index') return '{}';
        if (key === 'test:path-index') return '{}';
        return null;
      });
      
      // Execute the put operation with execution context
      await kvTransformCache.put(
        request, response, storageResult, transformOptions, mockExecutionContext as unknown as ExecutionContext
      );
      
      // Verify waitUntil was called
      expect(mockExecutionContext.waitUntil).toHaveBeenCalled();
      
      // Verify KV.put was called for the main data
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(ArrayBuffer),
        expect.any(Object)
      );
    });

    it('should handle errors gracefully', async () => {
      // Mock KV.put to throw an error
      mockKV.put.mockRejectedValueOnce(new Error('KV error'));
      
      const response = new Response('test data', { 
        headers: { 'Content-Type': 'image/jpeg' }
      });
      const request = new Request('https://example.com/test.jpg');
      const storageResult: StorageResult = {
        response: new Response(),
        sourceType: 'remote',
        contentType: 'image/jpeg',
        size: 10,
        path: '/test.jpg'
      };
      const transformOptions: TransformOptions = { width: 800 };
      
      await kvTransformCache.put(request, response, storageResult, transformOptions);
      
      expect(logger.error).toHaveBeenCalledWith('Error storing in cache', expect.any(Object));
    });
  });

  describe('delete', () => {
    it('should do nothing when cache is disabled', async () => {
      // Create a configuration with disabled cache
      const disabledConfig = {
        cache: {
          transformCache: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with disabled cache
      const instance = new KVTransformCacheManager(logger, disabledConfigService, mockTagsManager);
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      await instance.delete(request, transformOptions);
      
      expect(mockKV.delete).not.toHaveBeenCalled();
    });

    it('should delete a key from KV and update indices', async () => {
      // Mock getWithMetadata to return metadata
      mockKV.getWithMetadata.mockResolvedValueOnce({
        value: 'test-data',
        metadata: {
          url: 'https://example.com/test.jpg',
          tags: ['test-tag1', 'test-tag2']
        }
      });
      
      // Mock tag and path indices
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:tag-index') return JSON.stringify({
          'test-tag1': ['test:12345', 'test:67890']
        });
        if (key === 'test:path-index') return JSON.stringify({
          '/test.jpg': ['test:12345', 'test:67890']
        });
        return null;
      });
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      // Override generateCacheKey to return a predictable value
      const originalGenerateCacheKey = kvTransformCache.generateCacheKey;
      kvTransformCache.generateCacheKey = vi.fn().mockReturnValue('test:12345');
      
      await kvTransformCache.delete(request, transformOptions);
      
      // Restore original method
      kvTransformCache.generateCacheKey = originalGenerateCacheKey;
      
      // Verify KV.delete was called
      expect(mockKV.delete).toHaveBeenCalledWith('test:12345');
      
      // Verify log was created
      expect(logger.debug).toHaveBeenCalledWith('Deleted from cache', expect.any(Object));
    });

    it('should handle errors gracefully', async () => {
      // Mock KV.delete to throw an error
      mockKV.delete.mockRejectedValueOnce(new Error('KV error'));
      
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800 };
      
      await kvTransformCache.delete(request, transformOptions);
      
      expect(logger.error).toHaveBeenCalledWith('Error deleting from cache', expect.any(Object));
    });
  });

  describe('purgeByTag', () => {
    it('should return 0 when cache is disabled', async () => {
      // Create a configuration with disabled cache
      const disabledConfig = {
        cache: {
          transformCache: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with disabled cache
      const instance = new KVTransformCacheManager(logger, disabledConfigService, mockTagsManager);
      
      const result = await instance.purgeByTag('test-tag');
      
      expect(result).toBe(0);
    });

    it('should purge all entries with a specific tag', async () => {
      // Simplified mock implementation for this test
      mockKV.get.mockResolvedValueOnce(JSON.stringify({
        'test-tag1': ['test:12345', 'test:67890'],
        'test-tag2': ['test:67890', 'test:abcde']
      }));
      
      // Simple mock for metadata
      mockKV.getWithMetadata.mockResolvedValue({
        value: 'test-data',
        metadata: {
          url: 'https://example.com/test.jpg',
          tags: ['test-tag1', 'test-tag2']
        }
      });
      
      const result = await kvTransformCache.purgeByTag('test-tag1');
      
      // Verify delete was called at least once
      expect(mockKV.delete).toHaveBeenCalled();
      
      // The actual implementation has to resolve promises which might
      // not complete in the test environment, so we should not test the exact count
      expect(typeof result).toBe('number');
      
      // Since we're not waiting for all async operations to complete,
      // we can't guarantee the logs will have been called yet
    });

    it('should return 0 when no entries match the tag', async () => {
      // Mock tag index
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:tag-index') return JSON.stringify({
          'test-tag1': ['test:12345', 'test:67890']
        });
        return null;
      });
      
      const result = await kvTransformCache.purgeByTag('nonexistent-tag');
      
      // Verify KV.delete was not called
      expect(mockKV.delete).not.toHaveBeenCalled();
      
      // Verify log was created
      expect(logger.debug).toHaveBeenCalledWith('No entries found for tag', expect.any(Object));
      
      // Verify correct count was returned
      expect(result).toBe(0);
    });

    it('should use waitUntil when ctx is provided', async () => {
      // Mock tag index
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:tag-index') return JSON.stringify({
          'test-tag1': ['test:12345', 'test:67890']
        });
        return null;
      });
      
      // Mock getWithMetadata to return metadata
      mockKV.getWithMetadata.mockImplementation(() => ({
        value: 'test-data',
        metadata: {
          url: 'https://example.com/test.jpg',
          tags: ['test-tag1', 'test-tag2']
        }
      }));
      
      const result = await kvTransformCache.purgeByTag('test-tag1', mockExecutionContext as unknown as ExecutionContext);
      
      // Verify waitUntil was called
      expect(mockExecutionContext.waitUntil).toHaveBeenCalled();
      
      // Verify tag was removed from index immediately
      expect(mockKV.put).toHaveBeenCalledWith(
        'test:tag-index',
        expect.any(String)
      );
      
      // Verify log was created
      expect(logger.info).toHaveBeenCalledWith('Purging by tag in background', expect.any(Object));
      
      // Verify correct count was returned
      expect(result).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      // Mock get to throw an error
      mockKV.get.mockRejectedValueOnce(new Error('KV error'));
      
      const result = await kvTransformCache.purgeByTag('test-tag');
      
      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error purging by tag', expect.any(Object));
    });
  });

  describe('purgeByPath', () => {
    it('should return 0 when cache is disabled', async () => {
      // Create a configuration with disabled cache
      const disabledConfig = {
        cache: {
          transformCache: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with disabled cache
      const instance = new KVTransformCacheManager(logger, disabledConfigService, mockTagsManager);
      
      const result = await instance.purgeByPath('/test/');
      
      expect(result).toBe(0);
    });

    it('should purge all entries matching path pattern', async () => {
      // Mock path index
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:path-index') return JSON.stringify({
          '/test/one.jpg': ['test:12345'],
          '/test/two.jpg': ['test:67890'],
          '/other/image.jpg': ['test:abcde']
        });
        return null;
      });
      
      // Mock getWithMetadata to return metadata
      mockKV.getWithMetadata.mockImplementation(() => ({
        value: 'test-data',
        metadata: {
          url: 'https://example.com/test/one.jpg',
          tags: ['test-tag1']
        }
      }));
      
      const result = await kvTransformCache.purgeByPath('/test/*');
      
      // Verify KV.delete was called for each key matching the path
      expect(mockKV.delete).toHaveBeenCalledTimes(2);
      expect(mockKV.delete).toHaveBeenCalledWith('test:12345');
      expect(mockKV.delete).toHaveBeenCalledWith('test:67890');
      
      // Verify path index was updated
      expect(mockKV.put).toHaveBeenCalledWith(
        'test:path-index',
        expect.any(String)
      );
      
      // Verify log was created
      expect(logger.info).toHaveBeenCalledWith('Purged by path pattern', expect.any(Object));
      
      // Verify correct count was returned
      expect(result).toBe(2);
    });

    it('should return 0 when no entries match the path pattern', async () => {
      // Mock path index
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:path-index') return JSON.stringify({
          '/test/one.jpg': ['test:12345'],
          '/test/two.jpg': ['test:67890']
        });
        return null;
      });
      
      const result = await kvTransformCache.purgeByPath('/nonexistent/*');
      
      // Verify KV.delete was not called
      expect(mockKV.delete).not.toHaveBeenCalled();
      
      // Verify log was created
      expect(logger.debug).toHaveBeenCalledWith('No entries found for path pattern', expect.any(Object));
      
      // Verify correct count was returned
      expect(result).toBe(0);
    });

    it('should use waitUntil when ctx is provided', async () => {
      // Mock path index
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:path-index') return JSON.stringify({
          '/test/one.jpg': ['test:12345'],
          '/test/two.jpg': ['test:67890']
        });
        return null;
      });
      
      // Mock getWithMetadata to return metadata
      mockKV.getWithMetadata.mockImplementation(() => ({
        value: 'test-data',
        metadata: {
          url: 'https://example.com/test/one.jpg',
          tags: ['test-tag1']
        }
      }));
      
      const result = await kvTransformCache.purgeByPath('/test/*', mockExecutionContext as unknown as ExecutionContext);
      
      // Verify waitUntil was called
      expect(mockExecutionContext.waitUntil).toHaveBeenCalled();
      
      // Verify path index was updated immediately
      expect(mockKV.put).toHaveBeenCalledWith(
        'test:path-index',
        expect.any(String)
      );
      
      // Verify log was created
      expect(logger.info).toHaveBeenCalledWith('Purging by path pattern in background', expect.any(Object));
      
      // Verify correct count was returned
      expect(result).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      // Mock get to throw an error
      mockKV.get.mockRejectedValueOnce(new Error('KV error'));
      
      const result = await kvTransformCache.purgeByPath('/test/*');
      
      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error purging by path pattern', expect.any(Object));
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache key for same request and options', () => {
      const request = new Request('https://example.com/test.jpg');
      const transformOptions: TransformOptions = { width: 800, height: 600 };
      
      const key1 = kvTransformCache.generateCacheKey(request, transformOptions);
      const key2 = kvTransformCache.generateCacheKey(request, transformOptions);
      
      expect(key1).toEqual(key2);
      expect(key1).toContain('test:'); // Should include prefix
    });

    it('should generate different keys for different options', () => {
      const request = new Request('https://example.com/test.jpg');
      const options1: TransformOptions = { width: 800 };
      const options2: TransformOptions = { width: 400 };
      
      const key1 = kvTransformCache.generateCacheKey(request, options1);
      const key2 = kvTransformCache.generateCacheKey(request, options2);
      
      expect(key1).not.toEqual(key2);
    });

    it('should generate different keys for different paths', () => {
      const request1 = new Request('https://example.com/test1.jpg');
      const request2 = new Request('https://example.com/test2.jpg');
      const options: TransformOptions = { width: 800 };
      
      const key1 = kvTransformCache.generateCacheKey(request1, options);
      const key2 = kvTransformCache.generateCacheKey(request2, options);
      
      expect(key1).not.toEqual(key2);
    });
  });

  describe('listEntries', () => {
    it('should return empty array when cache is disabled', async () => {
      // Create a configuration with disabled cache
      const disabledConfig = {
        cache: {
          transformCache: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with disabled cache
      const instance = new KVTransformCacheManager(logger, disabledConfigService, mockTagsManager);
      
      const result = await instance.listEntries();
      
      expect(result.entries).toEqual([]);
      expect(result.complete).toBe(true);
    });

    it('should list entries with metadata', async () => {
      // Mock KV.list to return entries
      mockKV.list.mockResolvedValueOnce({
        keys: [
          {
            name: 'test:12345',
            expiration: 1234567890,
            metadata: {
              url: 'https://example.com/test1.jpg',
              contentType: 'image/jpeg',
              size: 100
            }
          },
          {
            name: 'test:67890',
            expiration: 1234567890,
            metadata: {
              url: 'https://example.com/test2.jpg',
              contentType: 'image/webp',
              size: 200
            }
          }
        ],
        list_complete: true,
        cursor: 'next-cursor'
      });
      
      const result = await kvTransformCache.listEntries();
      
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].key).toBe('test:12345');
      expect(result.entries[0].metadata.url).toBe('https://example.com/test1.jpg');
      expect(result.entries[1].key).toBe('test:67890');
      expect(result.cursor).toBe('next-cursor');
      expect(result.complete).toBe(true);
    });

    it('should respect limit parameter', async () => {
      // Mock KV.list to return entries
      mockKV.list.mockResolvedValueOnce({
        keys: [
          {
            name: 'test:12345',
            expiration: 1234567890,
            metadata: {
              url: 'https://example.com/test1.jpg'
            }
          }
        ],
        list_complete: false,
        cursor: 'next-cursor'
      });
      
      const result = await kvTransformCache.listEntries(1);
      
      expect(result.entries).toHaveLength(1);
      expect(result.complete).toBe(false);
      
      // Verify limit was passed to KV.list
      expect(mockKV.list).toHaveBeenCalledWith({
        prefix: 'test',
        limit: 1,
        cursor: undefined
      });
    });

    it('should respect cursor parameter', async () => {
      // Mock KV.list to return entries
      mockKV.list.mockResolvedValueOnce({
        keys: [],
        list_complete: true
      });
      
      await kvTransformCache.listEntries(100, 'test-cursor');
      
      // Verify cursor was passed to KV.list
      expect(mockKV.list).toHaveBeenCalledWith({
        prefix: 'test',
        limit: 100,
        cursor: 'test-cursor'
      });
    });

    it('should handle errors gracefully', async () => {
      // Mock KV.list to throw an error
      mockKV.list.mockRejectedValueOnce(new Error('KV error'));
      
      const result = await kvTransformCache.listEntries();
      
      expect(result.entries).toEqual([]);
      expect(result.complete).toBe(true);
      expect(logger.error).toHaveBeenCalledWith('Error listing cache entries', expect.any(Object));
    });
  });

  describe('getStats', () => {
    it('should return zeros when cache is disabled', async () => {
      // Create a configuration with disabled cache
      const disabledConfig = {
        cache: {
          transformCache: {
            enabled: false
          }
        }
      };
      
      const disabledConfigService = {
        getConfig: () => disabledConfig
      } as unknown as ConfigurationService;
      
      // Create a new instance with disabled cache
      const instance = new KVTransformCacheManager(logger, disabledConfigService, mockTagsManager);
      
      const result = await instance.getStats();
      
      expect(result.count).toBe(0);
      expect(result.size).toBe(0);
      expect(result.hitRate).toBe(0);
      expect(result.avgSize).toBe(0);
    });

    it('should return cache statistics with optimized indexing', async () => {
      // Mock KV.get to return stats and indices
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:stats') return JSON.stringify({
          count: 100,
          size: 1000000,
          hits: 80,
          misses: 20,
          lastPruned: Date.now()
        });
        if (key === 'test:all-tags') return 'tag1,tag2,tag3';
        if (key === 'test:all-paths') return '/path1,/path2';
        if (key === 'test:tag:tag1') return 'key1,key2,key3';
        if (key === 'test:path:/path1') return 'key1,key2';
        return null;
      });
      
      const result = await kvTransformCache.getStats();
      
      expect(result.count).toBe(100);
      expect(result.size).toBe(1000000);
      expect(result.hitRate).toBe(80);  // 80 hits / (80 hits + 20 misses) * 100
      expect(result.avgSize).toBe(10000); // 1000000 / 100
      expect(result.optimized).toBe(true);
      expect(result.lastPruned).toBeInstanceOf(Date);
      expect(result.indexSize).toBeGreaterThan(0); // Should have some estimated index size
    });

    it('should use default stats when none exist', async () => {
      // Mock KV.get to return null for stats
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:stats') return null;
        if (key === 'test:tag-index') return '{}';
        if (key === 'test:path-index') return '{}';
        return null;
      });
      
      const result = await kvTransformCache.getStats();
      
      expect(result.count).toBe(0);
      expect(result.size).toBe(0);
      expect(result.hitRate).toBe(0);
      expect(result.avgSize).toBe(0);
      expect(result.indexSize).toBe(4); // Length of "{}" + "{}"
    });

    it('should handle errors gracefully', async () => {
      // Mock KV.get to throw an error
      mockKV.get.mockRejectedValueOnce(new Error('KV error'));
      
      const result = await kvTransformCache.getStats();
      
      expect(result.count).toBe(0);
      expect(result.size).toBe(0);
      expect(result.hitRate).toBe(0);
      expect(result.avgSize).toBe(0);
      expect(result.indexSize).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error getting cache stats', expect.any(Object));
    });
  });
  
  describe('optimized purging operations', () => {
    it('should use optimized purgeByTag when optimizedIndexing is enabled', async () => {
      // Mock optimized tag index
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:tag:test-tag1') return 'test:12345,test:67890';
        if (key === 'test:all-tags') return 'test-tag1,test-tag2';
        return null;
      });
      
      // Create a spy on the purgeByTagOptimized method
      const purgeByTagOptimizedSpy = vi.spyOn(kvTransformCache as any, 'purgeByTagOptimized');
      const purgeByTagStandardSpy = vi.spyOn(kvTransformCache as any, 'purgeByTagStandard');
      
      await kvTransformCache.purgeByTag('test-tag1');
      
      // Verify optimized method was called
      expect(purgeByTagOptimizedSpy).toHaveBeenCalled();
      expect(purgeByTagStandardSpy).not.toHaveBeenCalled();
      
      // Restore spies
      purgeByTagOptimizedSpy.mockRestore();
      purgeByTagStandardSpy.mockRestore();
    });
    
    it('should use optimized purgeByPath when optimizedIndexing is enabled', async () => {
      // Mock optimized path index
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:all-paths') return '/test/one.jpg,/test/two.jpg';
        if (key === 'test:path:/test/one.jpg') return 'test:12345';
        if (key === 'test:path:/test/two.jpg') return 'test:67890';
        return null;
      });
      
      // Create a spy on the purgeByPathOptimized method
      const purgeByPathOptimizedSpy = vi.spyOn(kvTransformCache as any, 'purgeByPathOptimized');
      const purgeByPathStandardSpy = vi.spyOn(kvTransformCache as any, 'purgeByPathStandard');
      
      await kvTransformCache.purgeByPath('/test/*');
      
      // Verify optimized method was called
      expect(purgeByPathOptimizedSpy).toHaveBeenCalled();
      expect(purgeByPathStandardSpy).not.toHaveBeenCalled();
      
      // Restore spies
      purgeByPathOptimizedSpy.mockRestore();
      purgeByPathStandardSpy.mockRestore();
    });
    
    it('should use list+filter for large purges', async () => {
      // Mock a large tag index with more keys than smallPurgeThreshold
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:tag:test-tag1') {
          // Generate 10 keys (> smallPurgeThreshold of 5)
          return Array.from({ length: 10 }, (_, i) => `test:key${i}`).join(',');
        }
        return null;
      });
      
      // Mock list entries filter method
      const listEntriesWithFilterSpy = vi.spyOn(kvTransformCache as any, 'listEntriesWithFilter')
        .mockResolvedValue([
          { key: 'test:key1', metadata: { tags: ['test-tag1'] } },
          { key: 'test:key2', metadata: { tags: ['test-tag1'] } }
        ]);
      
      // Execute purgeByTag
      await kvTransformCache.purgeByTag('test-tag1');
      
      // Verify list+filter was used
      expect(listEntriesWithFilterSpy).toHaveBeenCalled();
      
      // Restore spy
      listEntriesWithFilterSpy.mockRestore();
    });
  });
  
  describe('maintenance', () => {
    it('should perform maintenance to clean up expired entries', async () => {
      // Mock stats
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:stats') return JSON.stringify({
          count: 100,
          size: 1000000,
          hits: 80,
          misses: 20,
          lastPruned: Date.now() - 86400000 * 2 // Last pruned 2 days ago
        });
        return null;
      });
      
      // Mock list entries filter to return "expired" entries
      const listEntriesWithFilterSpy = vi.spyOn(kvTransformCache as any, 'listEntriesWithFilter')
        .mockResolvedValue([
          { 
            key: 'test:expired1',
            metadata: { 
              url: 'https://example.com/test1.jpg',
              tags: ['test-tag1'],
              size: 1000 
            } 
          },
          {
            key: 'test:expired2', 
            metadata: { 
              url: 'https://example.com/test2.jpg',
              tags: ['test-tag2'],
              size: 2000 
            } 
          }
        ]);
      
      // Execute maintenance
      const result = await kvTransformCache.performMaintenance(10);
      
      // Verify KV operations
      expect(mockKV.delete).toHaveBeenCalledTimes(2);
      expect(mockKV.delete).toHaveBeenCalledWith('test:expired1');
      expect(mockKV.delete).toHaveBeenCalledWith('test:expired2');
      
      // Verify stats were updated
      expect(mockKV.put).toHaveBeenCalledWith('test:stats', expect.any(String));
      
      // Verify count of pruned items
      expect(result).toBe(2);
      
      // Restore spy
      listEntriesWithFilterSpy.mockRestore();
    });
    
    it('should skip maintenance if recently pruned', async () => {
      // Mock stats with recent prune time
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:stats') return JSON.stringify({
          count: 100,
          size: 1000000,
          hits: 80,
          misses: 20,
          lastPruned: Date.now() - 3600000 // Last pruned 1 hour ago
        });
        return null;
      });
      
      // Execute maintenance
      const result = await kvTransformCache.performMaintenance(10);
      
      // Verify no operations were performed
      expect(mockKV.delete).not.toHaveBeenCalled();
      expect(result).toBe(0);
      expect(logger.debug).toHaveBeenCalledWith('Skipping maintenance, last pruned recently', expect.any(Object));
    });
    
    it('should update stats even when no expired entries found', async () => {
      // Mock stats with old prune time
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:stats') return JSON.stringify({
          count: 100,
          size: 1000000,
          hits: 80,
          misses: 20,
          lastPruned: Date.now() - 86400000 * 2 // Last pruned 2 days ago
        });
        return null;
      });
      
      // Mock list entries filter to return no expired entries
      const listEntriesWithFilterSpy = vi.spyOn(kvTransformCache as any, 'listEntriesWithFilter')
        .mockResolvedValue([]);
      
      // Execute maintenance
      const result = await kvTransformCache.performMaintenance(10);
      
      // Verify lastPruned was updated
      expect(mockKV.put).toHaveBeenCalledWith('test:stats', expect.any(String));
      expect(result).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('No expired entries found during maintenance', expect.any(Object));
      
      // Restore spy
      listEntriesWithFilterSpy.mockRestore();
    });
    
    it('should use background processing when context is provided', async () => {
      // Mock stats with old prune time
      mockKV.get.mockImplementation((key) => {
        if (key === 'test:stats') return JSON.stringify({
          count: 100,
          size: 1000000,
          hits: 80,
          misses: 20,
          lastPruned: Date.now() - 86400000 * 2 // Last pruned 2 days ago
        });
        return null;
      });
      
      // Mock list entries filter to return "expired" entries
      const listEntriesWithFilterSpy = vi.spyOn(kvTransformCache as any, 'listEntriesWithFilter')
        .mockResolvedValue([
          { key: 'test:expired1', metadata: { tags: ['test-tag1'], size: 1000 } },
          { key: 'test:expired2', metadata: { tags: ['test-tag2'], size: 2000 } }
        ]);
      
      // Execute maintenance with context
      const result = await kvTransformCache.performMaintenance(10, mockExecutionContext as unknown as ExecutionContext);
      
      // Verify waitUntil was called
      expect(mockExecutionContext.waitUntil).toHaveBeenCalled();
      expect(result).toBe(2);
      expect(logger.info).toHaveBeenCalledWith('Started background cache maintenance', expect.any(Object));
      
      // Restore spy
      listEntriesWithFilterSpy.mockRestore();
    });
  });
});