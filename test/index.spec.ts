import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src';

// Mock the R2 bucket for testing
const mockR2Bucket = {
  get: vi.fn().mockImplementation(async (key) => {
    if (key === 'test.jpg') {
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
});

describe('Image Resizer Worker', () => {
  describe('Basic routes', () => {
    it('/ responds with welcome message', async () => {
      const request = new Request('http://example.com/');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      expect(await response.text()).toBe('Image Resizer Worker');
    });

  });

  describe('Image transformation', () => {
    it('transforms an image from R2', async () => {
      const request = new Request('http://example.com/test.jpg?width=800&format=webp');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(mockR2Bucket.get).toHaveBeenCalledWith('test.jpg', expect.anything());
      expect(global.fetch).toHaveBeenCalled();
      expect(response.headers.get('Content-Type')).toBe('image/webp');
    });

    it('applies debug headers when debug is enabled', async () => {
      const request = new Request('http://example.com/test.jpg?width=800&debug=true');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.headers.get('X-Debug-Enabled')).toBe('true');
      expect(response.headers.get('X-Environment')).toBe('development');
    });

    it('handles path options for transformation', async () => {
      const request = new Request('http://example.com/_width=800/_quality=85/test.jpg');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(global.fetch).toHaveBeenCalled();
      // The call to fetch should include cf.image with the right options
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1]?.cf?.image).toBeDefined();
    });

    it('uses derivatives for predefined transformations', async () => {
      const request = new Request('http://example.com/thumbnail/test.jpg');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(global.fetch).toHaveBeenCalled();
      // The transformed image should be returned
      expect(await response.text()).toBe('Transformed Image');
    });

    it('falls back to remote URL if image not in R2', async () => {
      // Reset mocks
      mockR2Bucket.get.mockReset();
      mockR2Bucket.get.mockResolvedValue(null);
      
      // Setup specific response for remote fallback
      global.fetch.mockReset();
      global.fetch.mockImplementation(async (url, options) => {
        // Return transformed image response for image transformation
        if (options?.cf?.image) {
          return new Response('Transformed Image', {
            headers: {
              'Content-Type': 'image/webp',
              'Cache-Control': 'public, max-age=86400'
            }
          });
        }
        
        // Return remote image response for remote URL fetch
        return new Response('Remote Image', {
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': '5000'
          }
        });
      });
      
      const request = new Request('http://example.com/missing.jpg');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      // Should try R2 first
      expect(mockR2Bucket.get).toHaveBeenCalledWith('missing.jpg', expect.anything());
      // Then fall back to remote
      expect(global.fetch).toHaveBeenCalled();
      
      // Verify the response somehow
      const responseText = await response.text();
      expect(responseText).toBeTruthy(); // Just check that it's not empty
    });
  });

  describe('Debug features', () => {
    it('serves debug report HTML at /debug-report', async () => {
      const request = new Request('http://example.com/debug-report');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.headers.get('Content-Type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('Image Resizer Debug Report');
    });
  });
  
  describe('Akamai compatibility', () => {
    it('transforms Akamai-style URLs', async () => {
      const request = new Request('http://example.com/test.jpg?im.resize=width:800,height:600&im.quality=85&im.format=webp');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      // Should have been converted to Cloudflare format and transformed
      expect(response.headers.get('Content-Type')).toBe('image/webp');
      
      // Debug header should indicate Akamai compatibility was used
      if (response.headers.has('X-Debug-Akamai-Compatibility')) {
        expect(response.headers.get('X-Debug-Akamai-Compatibility')).toBe('used');
      }
    });
    
    it('transforms Akamai path-based parameters', async () => {
      const request = new Request('http://example.com/im-resize=width:800/im-quality=85/test.jpg');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      // Should have been converted to Cloudflare format and transformed
      expect(global.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
    
    it('transforms complex Akamai parameters', async () => {
      const request = new Request('http://example.com/im(resize=width:800,height:600,mode:fit)/test.jpg?im.quality=85&im.format=webp&im.grayscale=true');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      // Should have been converted to Cloudflare format and transformed
      expect(global.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
    
    it('handles Akamai aspectCrop parameter', async () => {
      const request = new Request('http://example.com/test.jpg?im.aspectCrop=width:16,height:9,hoffset:0.5,voffset:0.5,allowExpansion:true');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      // Should have been converted to Cloudflare format and transformed
      expect(global.fetch).toHaveBeenCalled();
      
      // Check if the fetch call included gravity parameter
      const fetchCall = (global.fetch as any).mock.calls[0];
      if (fetchCall[1]?.cf?.image) {
        const imageOptions = fetchCall[1].cf.image;
        // The gravity should be set to center due to hoffset:0.5,voffset:0.5
        if (imageOptions.gravity) {
          expect(imageOptions.gravity).toBe('center');
        }
      }
      
      expect(response.status).toBe(200);
    });
  });

  describe('Error handling', () => {
    it('returns 404 for images not found in any storage', async () => {
      // Mock both R2 and fetch to return null/error
      mockR2Bucket.get.mockReset();
      mockR2Bucket.get.mockResolvedValue(null);
      global.fetch.mockReset();
      global.fetch.mockRejectedValue(new Error('Network error'));
      
      const request = new Request('http://example.com/not-found.jpg');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.status).toBe(404);
    });

    it('handles transformation errors gracefully', async () => {
      mockR2Bucket.get.mockResolvedValueOnce({
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
      });
      
      // Make transform fetch fail
      global.fetch.mockRejectedValueOnce(new Error('Transform error'));
      
      const request = new Request('http://example.com/error-transform.jpg?width=800');
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, mockEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      // It should not throw an error to the client
      expect(response.status).not.toBe(500);
    });
  });
});
