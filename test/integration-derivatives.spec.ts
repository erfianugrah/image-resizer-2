import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractDerivative } from '../src/utils/path';
import { ImageResizerConfig, defaultConfig } from '../src/config';
import { fetchImage } from '../src/storage'; 
import { transformImage } from '../src/transform';
import handler from '../src/index';

// Mock required env variable for the test
vi.mock('../src/storage', () => ({
  fetchImage: vi.fn(),
  setLogger: vi.fn()
}));

vi.mock('../src/transform', () => ({
  transformImage: vi.fn(),
  setLogger: vi.fn()
}));

// Mock createErrorResponse and other utilities
vi.mock('../src/utils/errors', () => ({
  AppError: class AppError extends Error {
    status = 500;
    details = {};
    constructor(message: string, details = {}) {
      super(message);
      this.details = details;
    }
  },
  NotFoundError: class NotFoundError extends Error {
    status = 404;
    details = {};
    constructor(message: string, details = {}) {
      super(message);
      this.details = details;
    }
  },
  ValidationError: class ValidationError extends Error {
    status = 400;
    details = {};
    constructor(message: string, details = {}) {
      super(message);
      this.details = details;
    }
  },
  StorageError: class StorageError extends Error {
    status = 500;
    details = {};
    constructor(message: string, details = {}) {
      super(message);
      this.details = details;
    }
  },
  TransformError: class TransformError extends Error {
    status = 500;
    details = {};
    constructor(message: string, details = {}) {
      super(message);
      this.details = details;
    }
  },
  createErrorResponse: vi.fn().mockImplementation((error) => {
    return new Response(error.message, { status: error.status || 500 });
  })
}));

// Mock debug functions
vi.mock('../src/debug', () => ({
  addDebugHeaders: vi.fn((response) => response),
  createDebugHtmlReport: vi.fn(),
  isDebugEnabled: vi.fn().mockReturnValue(false),
  setLogger: vi.fn()
}));

// Mock cache functions
vi.mock('../src/cache', () => ({
  applyCacheHeaders: vi.fn((response) => response),
  cacheWithCacheApi: vi.fn((request, response) => response),
  shouldBypassCache: vi.fn().mockReturnValue(false),
  applyCloudflareCache: vi.fn((options) => options)
}));

// Mock logger
vi.mock('../src/utils/logging', () => ({
  createLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  })),
  Logger: class {}
}));

// Mock detector
vi.mock('../src/utils/detector', () => ({
  detector: {},
  setLogger: vi.fn(),
  setConfig: vi.fn()
}));

describe('Path derivative extraction and application', () => {
  let mockConfig: ImageResizerConfig;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a copy of default config for testing
    mockConfig = JSON.parse(JSON.stringify(defaultConfig));
    
    // Mock getConfig to return our test config
    vi.mock('../src/config', async () => {
      const actual = await vi.importActual<typeof import('../src/config')>('../src/config');
      return {
        ...actual,
        getConfig: vi.fn().mockReturnValue(mockConfig)
      };
    });
    
    // Setup fetchImage mock to return a successful result
    (fetchImage as any).mockResolvedValue({
      sourceType: 'r2',
      response: new Response('Image content'),
      contentType: 'image/jpeg',
      size: 1024,
      path: '/banner/Granna_1.JPG'
    });
    
    // Setup transformImage mock to return a successful response
    (transformImage as any).mockResolvedValue(new Response('Transformed image'));
  });
  
  it('should correctly extract and apply the banner derivative', async () => {
    // Verify that extractDerivative works correctly
    const pathname = '/banner/Granna_1.JPG';
    const derivatives = Object.keys(mockConfig.derivatives);
    
    const derivative = extractDerivative(pathname, derivatives);
    expect(derivative).toBe('banner');
    
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
    const fetchImageArgs = (fetchImage as any).mock.calls[0];
    const imagePath = fetchImageArgs[0];
    expect(imagePath).toContain('banner/Granna_1.JPG');
    
    // Assert that transformImage was called with the derivative option
    expect(transformImage).toHaveBeenCalled();
    const transformImageArgs = (transformImage as any).mock.calls[0];
    const options = transformImageArgs[2];
    
    // We expect the derivative to be automatically detected and applied
    expect(options.derivative).toBe('banner');
    
    // Check the response status
    expect(response.status).toBe(200);
  });

  it('should log the full path processing sequence for debugging', async () => {
    // Create a request
    const request = new Request('https://images.erfi.dev/banner/Granna_1.JPG');
    
    // Create mock env and ctx
    const env = { ENVIRONMENT: 'development' };
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn()
    };
    
    // Setup console.log spy
    const consoleLogSpy = vi.spyOn(console, 'log');
    
    // Process the request
    await handler.fetch(request, env as any, ctx as any);
    
    // Check what was logged
    const logCalls = consoleLogSpy.mock.calls;
    
    // Extract and print path-related logs for debugging
    const pathLogs = logCalls.filter(call => 
      call[0]?.includes('path') || 
      call[0]?.includes('Path') || 
      call[0]?.includes('derivative') ||
      call[0]?.includes('Derivative'));
    
    console.log('Path processing logs:', pathLogs);
    
    // Test should pass if the code runs without errors
    expect(true).toBe(true);
  });
});