import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src';

// Mock the R2 bucket for testing
const mockR2Bucket = {
  get: vi.fn().mockImplementation(async (key) => {
    if (key === 'large-image.jpg') {
      return {
        body: new ReadableStream(),
        httpMetadata: { contentType: 'image/jpeg' },
        size: 15 * 1024 * 1024, // 15MB
        httpEtag: '"etag123"',
        uploaded: new Date(),
        writeHttpMetadata: vi.fn((headers) => {
          headers.set('Content-Type', 'image/jpeg');
          headers.set('Content-Length', (15 * 1024 * 1024).toString());
          headers.set('ETag', '"etag123"');
          headers.set('Last-Modified', new Date().toUTCString());
        })
      };
    } else if (key === 'test.jpg') {
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
      // Check for timeout on large images
      if (url.toString().includes('large-image.jpg')) {
        // For the timeout test, delay and then return a 524 response
        if (options.cf.image.width > 5000) {
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to simulate timeout
          return new Response('Timed out', { status: 524 });
        }
      }
      
      // Check for malformed parameters
      if (url.toString().includes('malformed-params')) {
        // For malformed parameters, still return a successful response
        return new Response('Transformed with malformed params', {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      }
      
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
});

describe('Edge Cases', () => {
  it('handles extremely large images gracefully', async () => {
    // Request a very large image (15MB) with a reasonable width
    const request = new Request('http://example.com/large-image.jpg?width=1200');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, mockEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    // Should still return a 200 OK response
    expect(response.status).toBe(200);
    
    // Should have tried to transform it
    expect(mockR2Bucket.get).toHaveBeenCalledWith('large-image.jpg', expect.anything());
    expect(global.fetch).toHaveBeenCalled();
  });
  
  it('handles transformation errors by falling back to original image', async () => {
    // Request a large image with a width that will trigger a timeout
    const request = new Request('http://example.com/large-image.jpg?width=6000');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, mockEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    // Should still return a 200 OK response (falling back to original)
    expect(response.status).toBe(200);
    
    // Should have tried to transform it
    expect(mockR2Bucket.get).toHaveBeenCalledWith('large-image.jpg', expect.anything());
    expect(global.fetch).toHaveBeenCalled();
  });
  
  it('handles malformed transformation parameters', async () => {
    // Use malformed parameters
    const request = new Request('http://example.com/test.jpg?width=invalid&height=abc&blur=xyz');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, mockEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    // Should still return a 200 OK response
    expect(response.status).toBe(200);
    
    // Transformation should still be attempted
    expect(mockR2Bucket.get).toHaveBeenCalledWith('test.jpg', expect.anything());
    expect(global.fetch).toHaveBeenCalled();
  });
  
  it('handles concurrent transformations', async () => {
    // Reset mock call counts
    mockR2Bucket.get.mockClear();
    global.fetch.mockClear();
    
    // Create an array of identical requests
    const requests = Array(3).fill(0).map(() => 
      new Request('http://example.com/test.jpg?width=800')
    );
    
    // Process all requests concurrently
    const ctx = createExecutionContext();
    const responses = await Promise.all(
      requests.map(req => worker.fetch(req, mockEnv, ctx))
    );
    await waitOnExecutionContext(ctx);
    
    // All should have succeeded
    expect(responses.every(r => r.status === 200)).toBe(true);
    
    // R2 bucket should have been called for each request
    expect(mockR2Bucket.get).toHaveBeenCalledTimes(3);
    
    // Fetch should have been called at least once for the transformations
    expect(global.fetch).toHaveBeenCalled();
  });
});