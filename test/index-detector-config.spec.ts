/**
 * Test for detector configuration integration in the main index.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Env } from '../src/types';

// Mock all dependencies
vi.mock('../src/config', () => ({
  getConfig: vi.fn().mockReturnValue({
    environment: 'development',
    detector: {
      cache: {
        maxSize: 1000,
        pruneAmount: 100,
        enableCache: true,
        ttl: 3600000
      },
      strategies: {
        clientHints: { priority: 100, enabled: true },
        acceptHeader: { priority: 80, enabled: true },
        userAgent: { priority: 60, enabled: true, maxUALength: 100 },
        staticData: { priority: 20, enabled: true },
        defaults: { priority: 0, enabled: true }
      },
      performanceBudget: {
        quality: {
          low: { min: 60, max: 80, target: 70 },
          medium: { min: 65, max: 85, target: 75 },
          high: { min: 70, max: 95, target: 85 }
        },
        dimensions: {
          maxWidth: { low: 1000, medium: 1500, high: 2500 },
          maxHeight: { low: 1000, medium: 1500, high: 2500 }
        },
        preferredFormats: {
          low: ['webp', 'jpeg'],
          medium: ['webp', 'avif', 'jpeg'],
          high: ['avif', 'webp', 'jpeg']
        }
      },
      deviceClassification: {
        thresholds: { lowEnd: 30, highEnd: 70 },
        platformScores: {
          'iOS': 70, 'macOS': 70, 'Windows': 50,
          'Android': 40, 'Linux': 60, 'Chrome OS': 50
        }
      },
      hashAlgorithm: 'simple',
      logLevel: 'info'
    },
    logging: {
      level: 'debug'
    }
  })
}));

vi.mock('../src/storage', () => ({
  fetchImage: vi.fn(),
  setLogger: vi.fn()
}));

vi.mock('../src/transform', () => ({
  transformImage: vi.fn(),
  setLogger: vi.fn()
}));

vi.mock('../src/cache', () => ({
  applyCacheHeaders: vi.fn(response => response),
  cacheWithCacheApi: vi.fn(request => request),
  shouldBypassCache: vi.fn().mockReturnValue(false)
}));

vi.mock('../src/debug', () => ({
  addDebugHeaders: vi.fn(response => response),
  createDebugHtmlReport: vi.fn(),
  isDebugEnabled: vi.fn().mockReturnValue(false),
  setLogger: vi.fn()
}));

vi.mock('../src/utils/path', () => ({
  parseImagePath: vi.fn().mockReturnValue({ imagePath: '/test.jpg', options: {} }),
  parseQueryOptions: vi.fn().mockReturnValue({}),
  extractDerivative: vi.fn(),
  applyPathTransforms: vi.fn(path => path)
}));

vi.mock('../src/utils/errors', () => ({
  AppError: class AppError extends Error {},
  NotFoundError: class NotFoundError extends Error {},
  ValidationError: class ValidationError extends Error {},
  StorageError: class StorageError extends Error {},
  TransformError: class TransformError extends Error {},
  createErrorResponse: vi.fn().mockReturnValue(new Response('Error', { status: 500 }))
}));

vi.mock('../src/utils/akamai-compatibility', () => ({
  isAkamaiFormat: vi.fn().mockReturnValue(false),
  convertToCloudflareUrl: vi.fn(),
  translateAkamaiParams: vi.fn(),
  setLogger: vi.fn()
}));

vi.mock('../src/utils/logging', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  })
}));

// Mock the detector specifically to check if setConfig is called
vi.mock('../src/utils/detector', () => ({
  setConfig: vi.fn(),
  detector: {},
  setLogger: vi.fn()
}));

// Import our worker handler after all mocks are in place
import handler from '../src/index';
import { setConfig as setDetectorConfig } from '../src/utils/detector';

describe('Detector Configuration Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize detector with configuration from config', async () => {
    // Create mock environment and context
    const env = {} as Env;
    const ctx = {
      waitUntil: vi.fn()
    } as unknown as ExecutionContext;

    // Create a test request
    const request = new Request('https://example.com/test.jpg');

    // Execute the handler
    await handler.fetch(request, env, ctx);

    // Check if the detector config was set
    expect(setDetectorConfig).toHaveBeenCalled();
    
    // The detector config should match what was in the config
    const configArg = vi.mocked(setDetectorConfig).mock.calls[0][0];
    expect(configArg).toBeDefined();
    expect(configArg.cache.maxSize).toBe(1000);
    expect(configArg.strategies.clientHints.enabled).toBe(true);
    expect(configArg.hashAlgorithm).toBe('simple');
  });
});