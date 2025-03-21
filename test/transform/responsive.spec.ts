import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageResizerConfig } from '../../src/config';

// We need to mock the logger to avoid errors
vi.mock('../../src/utils/logging', () => ({
  defaultLogger: {
    debug: vi.fn(),
    breadcrumb: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  Logger: vi.fn()
}));

// Since getResponsiveWidth is a private function, we need to export it for testing
// Temporarily modify transform.ts to export it
import { buildTransformOptions } from '../../src/transform';

// Create a mock of the StorageResult interface
interface MockStorageResult {
  path: string;
  sourceType: string;
  response: Response;
  body?: ReadableStream;
  size?: number;
  contentType?: string;
  width?: number;
  height?: number;
}

// Mock config for testing
const mockConfig: ImageResizerConfig = {
  environment: 'development',
  version: '1.0.0',
  debug: {
    enabled: true,
    headers: ['all'],
    allowedEnvironments: ['development'],
    verbose: true,
    includePerformance: true
  },
  cache: {
    method: 'cf',
    ttl: {
      ok: 60,
      clientError: 10,
      serverError: 5
    },
    cacheability: true,
    cacheTtlByStatus: {}
  },
  responsive: {
    breakpoints: [320, 640, 768, 1024, 1440, 1920],
    deviceWidths: {
      mobile: 480,
      tablet: 768,
      desktop: 1440
    },
    quality: 85,
    fit: 'scale-down',
    format: 'auto',
    metadata: 'none'
  },
  storage: {
    priority: ['r2', 'remote', 'fallback'],
    remoteUrl: 'https://default-origin.example.com',
    r2: {
      enabled: false,
      bindingName: 'IMAGES_BUCKET'
    }
  },
  derivatives: {}
};

// Create mock storage result
const mockStorageResult: MockStorageResult = {
  path: '/test/image.jpg',
  sourceType: 'r2',
  response: new Response('test'),
  size: 12345,
  contentType: 'image/jpeg'
};

describe('Responsive Image Features', () => {
  describe('buildTransformOptions (indirectly testing getResponsiveWidth)', () => {
    it('returns explicitly requested width when provided', () => {
      const options = { width: 500 };
      const request = new Request('https://example.com');
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      expect(result.width).toBe(500);
    });
    
    it('uses mobile width based on CF-Device-Type header', () => {
      const options = {};
      const headers = new Headers({
        'CF-Device-Type': 'mobile'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      expect(result.width).toBe(mockConfig.responsive.deviceWidths.mobile);
    });
    
    it('uses tablet width based on CF-Device-Type header', () => {
      const options = {};
      const headers = new Headers({
        'CF-Device-Type': 'tablet'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      expect(result.width).toBe(mockConfig.responsive.deviceWidths.tablet);
    });
    
    it('uses desktop width based on CF-Device-Type header', () => {
      const options = {};
      const headers = new Headers({
        'CF-Device-Type': 'desktop'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      expect(result.width).toBe(mockConfig.responsive.deviceWidths.desktop);
    });
    
    it('detects mobile device from User-Agent when CF-Device-Type is not available', () => {
      const options = {};
      const headers = new Headers({
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      expect(result.width).toBe(mockConfig.responsive.deviceWidths.mobile);
    });
    
    it('detects tablet device from User-Agent when CF-Device-Type is not available', () => {
      const options = {};
      const headers = new Headers({
        'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      expect(result.width).toBe(mockConfig.responsive.deviceWidths.tablet);
    });
    
    it('calculates width based on viewport width and DPR', () => {
      const options = {};
      const headers = new Headers({
        'Sec-CH-Viewport-Width': '800',
        'Sec-CH-DPR': '2'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      // Expected: closest breakpoint >= 800*2 = 1600
      // In our mock config, that's 1920
      expect(result.width).toBe(1920);
    });
    
    it('handles legacy viewport width and DPR headers', () => {
      const options = {};
      const headers = new Headers({
        'Viewport-Width': '640',
        'DPR': '1.5'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      // Expected: closest breakpoint >= 640*1.5 = 960
      // In our mock config, that's 1024
      expect(result.width).toBe(1024);
    });
    
    it('handles low bandwidth (Save-Data header) for format and quality choices', () => {
      const options = { width: 800 };
      const headers = new Headers({
        'Save-Data': 'on'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      // Should still respect the explicitly requested width
      expect(result.width).toBe(800);
      
      // But quality should be lower than the config default
      expect(result.quality).toBeLessThan(mockConfig.responsive.quality);
    });
    
    it('handles auto width correctly', () => {
      const options = { width: 'auto' as any };
      const headers = new Headers({
        'CF-Device-Type': 'desktop'
      });
      const request = new Request('https://example.com', { headers });
      
      const result = buildTransformOptions(request, mockStorageResult as any, options, mockConfig);
      
      // Auto width should be removed and fallback to responsive width
      expect(result.width).toBe(mockConfig.responsive.deviceWidths.desktop);
    });
  });
});