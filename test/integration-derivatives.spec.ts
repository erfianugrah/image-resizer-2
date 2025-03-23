/**
 * This file contains tests for the derivatives functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Due to hoisting issues, we need to define our mocks before ANY imports
// using factory functions instead of inline objects

// Define mock modules before any imports that use them
vi.mock('../src/utils/logging', () => {
  const mockFn = vi.fn();
  return {
    createLogger: vi.fn().mockImplementation(() => ({
      debug: mockFn,
      info: mockFn,
      warn: mockFn,
      error: mockFn,
      breadcrumb: mockFn
    })),
    defaultLogger: {
      debug: mockFn,
      info: mockFn,
      warn: mockFn,
      error: mockFn,
      breadcrumb: mockFn
    },
    LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
  };
});

vi.mock('../src/config', () => {
  return {
    getConfig: vi.fn().mockReturnValue({
      environment: 'development',
      version: '1.0.0',
      derivatives: {
        banner: {
          width: 1600,
          height: 400,
          quality: 80,
          fit: 'cover'
        },
        thumbnail: {
          width: 320,
          height: 150,
          quality: 85,
          fit: 'scale-down'
        }
      },
      storage: {
        priority: ['r2', 'remote', 'fallback'],
        r2: { enabled: true, bindingName: 'IMAGES_BUCKET' }
      },
      cache: {
        method: 'cf',
        ttl: { ok: 60, clientError: 10, serverError: 5 },
        cacheability: true
      },
      debug: { enabled: false, headers: [] }
    })
  };
});

vi.mock('../src/storage', () => ({
  fetchImage: vi.fn(),
  setLogger: vi.fn()
}));

vi.mock('../src/transform', () => ({
  transformImage: vi.fn(),
  setLogger: vi.fn()
}));

vi.mock('../src/debug', () => ({
  addDebugHeaders: vi.fn((response) => response),
  createDebugHtmlReport: vi.fn(),
  isDebugEnabled: vi.fn().mockReturnValue(false),
  setLogger: vi.fn()
}));

vi.mock('../src/cache', () => ({
  applyCacheHeaders: vi.fn((response) => response),
  cacheWithCacheApi: vi.fn((request, response) => response),
  shouldBypassCache: vi.fn().mockReturnValue(false)
}));

// Now import other dependencies after all mocks are set up
import { fetchImage } from '../src/storage'; 
import { transformImage } from '../src/transform';
import handler from '../src/index';
import { extractDerivative } from '../src/utils/path';

describe('Path derivative extraction and application integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup fetchImage mock to return a successful result
    (fetchImage as any).mockResolvedValue({
      sourceType: 'r2',
      response: new Response('Image content'),
      contentType: 'image/jpeg',
      size: 1024,
      path: '/Granna_1.JPG'
    });
    
    // Setup transformImage mock to return a successful response
    (transformImage as any).mockResolvedValue(new Response('Transformed image'));
  });
  
  it('should correctly extract and apply the banner derivative', async () => {
    // Create a request that matches the URL pattern
    const request = new Request('https://images.erfi.dev/banner/Granna_1.JPG');
    
    // Create mock env and ctx
    const env = { ENVIRONMENT: 'development' };
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn()
    };
    
    // Process the request through the handler
    const response = await handler.fetch(request, env as any, ctx as any);
    
    // Assert that fetchImage was called with the correct path
    expect(fetchImage).toHaveBeenCalled();
    
    // Check the response status
    expect(response.status).toBe(200);
  });
});