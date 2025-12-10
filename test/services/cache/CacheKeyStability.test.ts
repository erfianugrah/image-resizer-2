import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleKVTransformCacheManager } from '../../../src/services/cache/kv/SimpleKVTransformCacheManager';
import { Logger } from '../../../src/utils/logging';
import { KVNamespace } from '@cloudflare/workers-types';

describe('Cache Key Stability', () => {
  let mockKV: KVNamespace;
  let mockLogger: Logger;
  let cacheManager: SimpleKVTransformCacheManager;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    } as any;

    mockKV = {
      get: async () => null,
      getWithMetadata: async () => ({ value: null, metadata: null }),
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true })
    } as any;

    cacheManager = new SimpleKVTransformCacheManager(
      {
        prefix: 'test',
        enabled: true,
        defaultTtl: 3600,
        maxSize: 10485760,
        disallowedPaths: [],
        backgroundIndexing: false,
        purgeDelay: 0,
        memoryCacheSize: 100
      },
      mockKV,
      mockLogger
    );
  });

  it('should generate same cache key regardless of parameter order', () => {
    const request1 = new Request('https://example.com/test.jpg?width=800&height=600');
    const request2 = new Request('https://example.com/test.jpg?height=600&width=800');

    const options1 = { width: 800, height: 600, format: 'webp' as const };
    const options2 = { height: 600, width: 800, format: 'webp' as const };

    const key1 = cacheManager.generateCacheKey(request1, options1);
    const key2 = cacheManager.generateCacheKey(request2, options2);

    expect(key1).toBe(key2);
  });

  it('should generate same cache key with nested object parameter order differences', () => {
    const request1 = new Request('https://example.com/test.jpg');
    const request2 = new Request('https://example.com/test.jpg');

    const options1 = {
      width: 800,
      height: 600,
      gravity: { x: 0.5, y: 0.3 }
    };

    const options2 = {
      height: 600,
      width: 800,
      gravity: { y: 0.3, x: 0.5 }
    };

    const key1 = cacheManager.generateCacheKey(request1, options1 as any);
    const key2 = cacheManager.generateCacheKey(request2, options2 as any);

    expect(key1).toBe(key2);
  });

  it('should generate different cache keys for different parameters', () => {
    const request1 = new Request('https://example.com/test.jpg');
    const request2 = new Request('https://example.com/test.jpg');

    const options1 = { width: 800, height: 600 };
    const options2 = { width: 1024, height: 768 };

    const key1 = cacheManager.generateCacheKey(request1, options1);
    const key2 = cacheManager.generateCacheKey(request2, options2);

    expect(key1).not.toBe(key2);
  });

  it('should ignore internal __ flags in cache key generation', () => {
    const request1 = new Request('https://example.com/test.jpg');
    const request2 = new Request('https://example.com/test.jpg');

    const options1 = { width: 800, __explicitWidth: true };
    const options2 = { width: 800, __explicitWidth: false };

    const key1 = cacheManager.generateCacheKey(request1, options1 as any);
    const key2 = cacheManager.generateCacheKey(request2, options2 as any);

    expect(key1).toBe(key2);
  });

  it('should generate stable cache keys with format parameter', () => {
    const request1 = new Request('https://example.com/test.jpg');
    const request2 = new Request('https://example.com/test.jpg');

    const options1 = { width: 800, format: 'webp' as const };
    const options2 = { format: 'webp' as const, width: 800 };

    const key1 = cacheManager.generateCacheKey(request1, options1);
    const key2 = cacheManager.generateCacheKey(request2, options2);

    expect(key1).toBe(key2);
  });

  it('should handle array parameters deterministically', () => {
    const request = new Request('https://example.com/test.jpg');

    const options = {
      width: 800,
      tags: ['tag1', 'tag2', 'tag3']
    };

    const key1 = cacheManager.generateCacheKey(request, options as any);
    const key2 = cacheManager.generateCacheKey(request, options as any);

    expect(key1).toBe(key2);
  });
});
