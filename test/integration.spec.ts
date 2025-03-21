import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src';

// Mock the R2 bucket for testing
const mockR2Bucket = {
  get: vi.fn().mockImplementation(async (key) => {
    // Return a mock object for 'test.jpg', 'thumbnail/test.jpg', or any key that contains 'test.jpg'
    if (key === 'test.jpg' || key.includes('test.jpg')) {
      return {
        body: new ReadableStream(),
        httpMetadata: { contentType: 'image/jpeg' },
        size: 12345,
        httpEtag: '"etag123"',
        uploaded: new Date(),
        writeHttpMetadata: vi.fn((headers) => {
          headers.set('Content-Type', 'image/jpeg');
          headers.set('Content-Length', '12345');
          headers.set('ETag', '"etag123"');
          headers.set('Last-Modified', new Date().toUTCString());
        })
      };
    }
    return null;
  })
};

// Mock environment for testing
const mockEnv = {
  ENVIRONMENT: 'development',
  DEBUG: 'true',
  REMOTE_URL: 'https://example.com/images',
  FALLBACK_URL: 'https://placehold.co',
  ENABLE_AKAMAI_COMPATIBILITY: 'true',
  IMAGES_BUCKET: mockR2Bucket
};

// Mock fetch for Cloudflare image transform
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = vi.fn().mockImplementation(async (url, options) => {
    if (options?.cf?.image) {
      // This is a Cloudflare image transformation request
      return new Response('Transformed Image', {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // For other fetch requests (remote or fallback)
    return new Response('Remote Image', {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': '5000'
      }
    });
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.resetAllMocks();
});

describe('End-to-End Integration Tests', () => {
  it('processes full transformation pipeline correctly', async () => {
    // Request with multiple transformations
    const request = new Request('http://example.com/test.jpg?width=800&height=600&format=webp&quality=85&blur=10&flip=h');
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, mockEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    // Verify transformation was applied
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    
    // Verify fetch was called with correct transformation options
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchCall = global.fetch.mock.calls[0];
    const cfOptions = fetchCall[1]?.cf?.image;
    
    expect(cfOptions).toMatchObject({
      width: 800,
      height: 600,
      format: 'webp',
      quality: 85,
      blur: 10,
      flip: 'h'
    });
  });
  
  it('follows correct fallback chain when image is not in R2', async () => {
    // Reset mocks
    mockR2Bucket.get.mockReset();
    mockR2Bucket.get.mockResolvedValue(null);
    
    // Setup specific response for remote fallback
    global.fetch.mockImplementation(async (url, options) => {
      // For image transformations
      if (options?.cf?.image) {
        return new Response('Transformed Remote Image', {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      }
      
      // For remote origin requests
      if (url.toString().includes('example.com/images')) {
        return new Response('Remote Origin Image', {
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': '5000'
          }
        });
      }
      
      // For fallback requests
      return new Response('Fallback Image', {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': '2000'
        }
      });
    });
    
    const request = new Request('http://example.com/missing.jpg?width=800');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, mockEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    // Should try R2 first
    expect(mockR2Bucket.get).toHaveBeenCalledWith('missing.jpg', expect.anything());
    
    // Then fall back to remote origin
    expect(global.fetch).toHaveBeenCalled();
    
    // Verify the response is successful
    expect(response.status).toBe(200);
    
    // Verify transformation was applied to the remote image
    expect(global.fetch).toHaveBeenCalledTimes(2); // Once for remote origin, once for transformation
  });
  
  it('correctly processes Akamai-style parameters', async () => {
    // Reset mocks
    global.fetch.mockReset();
    
    // Mock fetch to return a transformed image response
    global.fetch.mockImplementation(async (url, options) => {
      // This is a Cloudflare image transformation request
      if (options?.cf?.image) {
        return new Response('Transformed Image', {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      }
      
      // For other fetch requests (remote or fallback)
      return new Response('Remote Image', {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': '5000'
        }
      });
    });
    
    // Request with Akamai-style parameters
    const request = new Request('http://example.com/test.jpg?im.resize=width:800,height:600&im.quality=85&im.format=webp');
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, mockEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    // Verify transformation was applied
    expect(response.status).toBe(200);
    
    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalled();
    
    // Find the call with cf.image parameters
    const transformCall = global.fetch.mock.calls.find(call => call[1]?.cf?.image);
    expect(transformCall).toBeDefined();
    
    const cfOptions = transformCall[1].cf.image;
    
    // Akamai parameters should be converted to Cloudflare format
    expect(cfOptions).toMatchObject({
      width: 800,
      height: 600,
      quality: 85,
      format: 'webp'
    });
  });
  
  it('applies derivative templates correctly', async () => {
    // Reset mocks
    global.fetch.mockReset();
    
    // Mock fetch to return a transformed image response
    global.fetch.mockImplementation(async (url, options) => {
      // This is a Cloudflare image transformation request
      if (options?.cf?.image) {
        return new Response('Transformed Image', {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      }
      
      // For other fetch requests (remote or fallback)
      return new Response('Remote Image', {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': '5000'
        }
      });
    });
    
    // Request using a derivative (thumbnail)
    const request = new Request('http://example.com/thumbnail/test.jpg');
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, mockEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    // Verify transformation was applied
    expect(response.status).toBe(200);
    
    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalled();
    
    // Response should indicate successful transformation
    const responseText = await response.text();
    expect(responseText).toBe('Transformed Image');
  });
});