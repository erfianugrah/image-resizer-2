/**
 * Tests for format:json functionality in the image resizer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transformImage } from '../src/transform';
import { StorageResult } from '../src/storage';
import { dimensionCache } from '../src/utils/dimension-cache';

// Mock dependencies
vi.mock('../src/cache', () => ({
  applyCloudflareCache: vi.fn((options) => options),
  applyCacheHeaders: vi.fn((response) => response)
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Headers
global.Headers = vi.fn(() => ({
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  forEach: vi.fn()
})) as any;

// Mock Response constructor
const mockResponse = {
  headers: {
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn()
  },
  status: 200,
  statusText: 'OK',
  clone: vi.fn(function(this: any) { return this; }),
  ok: true,
  body: ''
};

global.Response = vi.fn(() => mockResponse) as any;

describe('Format:json functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dimensionCache.clear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test directly requesting format:json
  it('should handle explicit format:json requests', async () => {
    // Mock the fetch response for format:json
    const mockJsonResponse = {
      headers: {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn()
      },
      status: 200,
      statusText: 'OK',
      ok: true,
      json: vi.fn().mockResolvedValue({
        metadata: {
          width: 800,
          height: 600,
          format: 'jpeg'
        }
      })
    };

    mockFetch.mockResolvedValue(mockJsonResponse);

    // Create a mock storage result
    const storageResult: StorageResult = {
      response: mockResponse as any,
      sourceType: 'remote',
      contentType: 'image/jpeg',
      size: 12345,
      path: '/image/example.jpg'
    };

    // Create a mock config
    const config = {
      cache: {
        ttl: {
          ok: 86400
        },
        cacheability: true
      },
      derivatives: {},
      responsive: {
        formatQuality: {
          webp: 85,
          avif: 80,
          jpeg: 85
        },
        format: 'auto',
        quality: 85
      }
    };

    // Call transformImage with format:json
    const request = new Request('https://example.com/image/example.jpg?format=json');
    const result = await transformImage(request, storageResult, { format: 'json' }, config as any);

    // Verify that fetch was called with format:json
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1].cf.image.format).toBe('json');
  });

  // Test dimension pre-fetching for crop operations
  it('should pre-fetch dimensions for crop operations', async () => {
    // Mock the format:json response
    const mockJsonResponse = {
      headers: {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn()
      },
      status: 200,
      statusText: 'OK',
      ok: true,
      json: vi.fn().mockResolvedValue({
        metadata: {
          width: 800,
          height: 600,
          format: 'jpeg'
        }
      })
    };

    // Mock the image transformation response
    const mockImageResponse = {
      headers: {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        forEach: vi.fn()
      },
      status: 200,
      statusText: 'OK',
      ok: true,
      body: 'image-data'
    };

    // First call returns JSON, second call returns the transformed image
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse)
      .mockResolvedValueOnce(mockImageResponse);

    // Create a mock storage result without dimensions
    const storageResult: StorageResult = {
      response: mockResponse as any,
      sourceType: 'remote',
      contentType: 'image/jpeg',
      size: 12345,
      path: '/image/example.jpg'
    };

    // Create a mock config
    const config = {
      cache: {
        ttl: {
          ok: 86400
        },
        cacheability: true
      },
      derivatives: {},
      responsive: {
        formatQuality: {
          webp: 85,
          avif: 80,
          jpeg: 85
        },
        format: 'auto',
        quality: 85,
        fit: 'scale-down'
      }
    };

    // Call transformImage with fit:crop and no dimensions
    const request = new Request('https://example.com/image/example.jpg?fit=crop&width=400&height=300');
    const result = await transformImage(
      request, 
      storageResult, 
      { fit: 'crop', width: 400, height: 300 }, 
      config as any
    );

    // Verify that fetch was called with format:json first to get dimensions
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].cf.image.format).toBe('json');
    
    // Verify the second call includes the crop parameters
    expect(mockFetch.mock.calls[1][1].cf.image.fit).toBe('crop');
    expect(mockFetch.mock.calls[1][1].cf.image.width).toBe(400);
    expect(mockFetch.mock.calls[1][1].cf.image.height).toBe(300);
  });

  // Test with explicit _needsImageInfo flag
  it('should pre-fetch dimensions when _needsImageInfo flag is set', async () => {
    // Mock the format:json response
    const mockJsonResponse = {
      headers: {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn()
      },
      status: 200,
      statusText: 'OK',
      ok: true,
      json: vi.fn().mockResolvedValue({
        metadata: {
          width: 1200,
          height: 800,
          format: 'jpeg'
        }
      })
    };

    // Mock the image transformation response
    const mockImageResponse = {
      headers: {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        forEach: vi.fn()
      },
      status: 200,
      statusText: 'OK',
      ok: true,
      body: 'image-data'
    };

    // First call returns JSON, second call returns the transformed image
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse)
      .mockResolvedValueOnce(mockImageResponse);

    // Create a mock storage result without dimensions
    const storageResult: StorageResult = {
      response: mockResponse as any,
      sourceType: 'remote',
      contentType: 'image/jpeg',
      size: 12345,
      path: '/image/example.jpg'
    };

    // Create a mock config
    const config = {
      cache: {
        ttl: {
          ok: 86400
        },
        cacheability: true
      },
      derivatives: {},
      responsive: {
        formatQuality: {
          webp: 85,
          avif: 80,
          jpeg: 85
        },
        format: 'auto',
        quality: 85,
        fit: 'scale-down'
      }
    };

    // Call transformImage with _needsImageInfo flag
    const request = new Request('https://example.com/image/example.jpg?width=500&_needsImageInfo=true');
    const result = await transformImage(
      request, 
      storageResult, 
      { width: 500, _needsImageInfo: true }, 
      config as any
    );

    // Verify that fetch was called with format:json first
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].cf.image.format).toBe('json');
    
    // Verify final fetch has the specified width
    expect(mockFetch.mock.calls[1][1].cf.image.width).toBe(500);
  });

  // Test dimension caching
  it('should cache dimensions and avoid redundant JSON fetches', async () => {
    // Mock the format:json response
    const mockJsonResponse = {
      headers: {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn()
      },
      status: 200,
      statusText: 'OK',
      ok: true,
      json: vi.fn().mockResolvedValue({
        metadata: {
          width: 1000,
          height: 750,
          format: 'jpeg'
        }
      })
    };

    // Mock the image transformation response
    const mockImageResponse = {
      headers: {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        forEach: vi.fn()
      },
      status: 200,
      statusText: 'OK',
      ok: true,
      body: 'image-data'
    };

    // First call returns JSON, subsequent calls return the transformed image
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse)
      .mockResolvedValue(mockImageResponse);

    // Create a mock storage result without dimensions
    const storageResult: StorageResult = {
      response: mockResponse as any,
      sourceType: 'remote',
      contentType: 'image/jpeg',
      size: 12345,
      path: '/image/cache-test.jpg'
    };

    // Create a mock config
    const config = {
      cache: {
        ttl: {
          ok: 86400
        },
        cacheability: true
      },
      derivatives: {},
      responsive: {
        formatQuality: {
          webp: 85,
          avif: 80,
          jpeg: 85
        },
        format: 'auto',
        quality: 85,
        fit: 'scale-down'
      }
    };

    // First call - should fetch dimensions
    const request1 = new Request('https://example.com/image/cache-test.jpg?fit=crop&width=400&height=300');
    await transformImage(
      request1, 
      storageResult, 
      { fit: 'crop', width: 400, height: 300 }, 
      config as any
    );

    // Second call with same image - should use cached dimensions
    const request2 = new Request('https://example.com/image/cache-test.jpg?fit=crop&width=600&height=450');
    await transformImage(
      request2, 
      storageResult, 
      { fit: 'crop', width: 600, height: 450 }, 
      config as any
    );

    // Verify that format:json fetch was only called once
    const jsonFetches = mockFetch.mock.calls.filter(
      call => call[1].cf.image.format === 'json'
    );
    expect(jsonFetches.length).toBe(1);
    
    // Verify total fetch calls (1 json fetch + 2 image fetches)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});