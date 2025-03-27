/**
 * Test helper utilities
 * 
 * This module provides helper functions and mocks for testing
 */

import { vi } from 'vitest';

// Mock logger for testing
export const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  getLevel: vi.fn().mockReturnValue(0), // DEBUG level
  isLevelEnabled: vi.fn().mockReturnValue(true),
  breadcrumb: vi.fn()
});

// Mock response for testing
export const createMockResponse = (status = 200, headers = {}) => {
  return {
    status,
    headers: new Headers(headers),
    body: null,
    json: () => Promise.resolve({ success: true })
  };
};

// Mock URL for testing
export const createMockUrl = (path: string, params = {}) => {
  const url = new URL(`https://example.com${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url;
};

// Mock request for testing
export const createMockRequest = (path: string, params = {}, options = {}) => {
  const url = createMockUrl(path, params);
  return new Request(url.toString(), options);
};

// Mock fetch for testing
export const createMockFetch = (response = createMockResponse()) => {
  return vi.fn().mockResolvedValue(response);
};

// Mock environment for testing
export const createMockEnv = () => ({});

// Mock configuration service for testing
export const createMockConfigService = (config = {}) => ({
  getConfig: vi.fn().mockReturnValue(config),
  getSection: vi.fn(),
  getValue: vi.fn(),
  mergeConfig: vi.fn(),
  getEnvironmentConfig: vi.fn(),
  isFeatureEnabled: vi.fn(),
  getDefaultConfig: vi.fn(),
  reloadConfig: vi.fn(),
  getPathTransforms: vi.fn(),
  getDerivative: vi.fn(),
  getDerivativeNames: vi.fn(),
  isImmutableContent: vi.fn(),
  shouldBypassForPath: vi.fn(),
  getPathBasedTtl: vi.fn(),
  initialize: vi.fn(),
  shutdown: vi.fn()
});

// Mock storage service for testing
export const createMockStorageService = (response = createMockResponse()) => ({
  fetchImage: vi.fn().mockResolvedValue({
    response,
    sourceType: 'remote',
    contentType: 'image/jpeg',
    size: 1024,
    metadata: {}
  }),
  initialize: vi.fn(),
  shutdown: vi.fn()
});

// Mock cache service for testing
export const createMockCacheService = () => ({
  applyCacheHeaders: vi.fn(response => response),
  cacheWithCacheApi: vi.fn(),
  shouldBypassCache: vi.fn().mockReturnValue(false),
  generateCacheTags: vi.fn().mockReturnValue([]),
  applyCloudflareCache: vi.fn(request => request),
  calculateTtl: vi.fn().mockReturnValue(3600),
  cacheWithFallback: vi.fn(),
  initialize: vi.fn(),
  shutdown: vi.fn()
});

// Mock metadata service for testing
export const createMockMetadataService = (metadata = { width: 1200, height: 800 }) => ({
  fetchMetadata: vi.fn().mockResolvedValue({
    metadata: {
      width: metadata.width,
      height: metadata.height,
      format: 'jpeg'
    }
  }),
  processMetadata: vi.fn().mockReturnValue({
    aspectCrop: {
      width: 16,
      height: 9,
      hoffset: 0.5,
      voffset: 0.33,
      allowExpansion: false
    },
    dimensions: {
      width: metadata.width > 1200 ? 1200 : metadata.width
    },
    quality: 80,
    originalMetadata: {
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: 'jpeg'
      }
    }
  }),
  fetchAndProcessMetadata: vi.fn().mockResolvedValue({
    aspectCrop: {
      width: 16,
      height: 9,
      hoffset: 0.5,
      voffset: 0.33,
      allowExpansion: false
    },
    dimensions: {
      width: metadata.width > 1200 ? 1200 : metadata.width
    },
    quality: 80,
    originalMetadata: {
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: 'jpeg'
      }
    }
  }),
  initialize: vi.fn(),
  shutdown: vi.fn()
});