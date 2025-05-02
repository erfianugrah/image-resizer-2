/**
 * Path Pattern TTL Calculator Tests
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { PathPatternTTLCalculator } from '../../../src/services/cache/PathPatternTTLCalculator';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
} as any;

// Mock config service
const mockConfigService = {
  getConfig: vi.fn()
} as any;

// Mock RequestContext module
vi.mock('../../../src/utils/requestContext', () => {
  return {
    getCurrentContext: vi.fn(() => null),
    addBreadcrumb: vi.fn()
  };
});

describe('PathPatternTTLCalculator', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();
    
    // Setup default configuration
    mockConfigService.getConfig.mockReturnValue({
      cache: {
        ttl: {
          ok: 300,
          clientError: 60,
          serverError: 10
        },
        pathPatterns: [
          {
            name: 'default',
            matcher: '.*',
            ttl: {
              ok: 300,
              redirects: 120,
              clientError: 60,
              serverError: 10
            },
            priority: 0,
            description: 'Default pattern'
          },
          {
            name: 'static-assets',
            matcher: '/(static|assets)/',
            ttl: {
              ok: 86400,
              redirects: 3600,
              clientError: 60,
              serverError: 10
            },
            priority: 10,
            description: 'Static assets'
          },
          {
            name: 'temporary',
            matcher: '/(temp|preview)/',
            ttl: {
              ok: 60,
              redirects: 30,
              clientError: 10,
              serverError: 5
            },
            priority: 20,
            description: 'Temporary content'
          }
        ],
        derivativeTTLs: {
          'thumbnail': 86400,
          'preview': 600
        }
      }
    });
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  test('initializes with proper configuration', () => {
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Verify logger was called with initialization info
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('initialized'),
      expect.objectContaining({
        patternCount: 3
      })
    );
  });
  
  test('uses default pattern when no specific match is found', () => {
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Create a mock response and options
    const response = new Response('test', { status: 200 });
    const options = { path: '/random/path/image.jpg' };
    
    // Calculate TTL
    const ttl = calculator.calculateTtl(response, options);
    
    // Should use default pattern TTL
    expect(ttl).toBe(300);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Using default path pattern TTL'),
      expect.any(Object)
    );
  });
  
  test('matches static assets pattern correctly', () => {
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Create a mock response and options for static assets
    const response = new Response('test', { status: 200 });
    const options = { path: '/static/images/logo.png' };
    
    // Calculate TTL
    const ttl = calculator.calculateTtl(response, options);
    
    // Should use static-assets pattern TTL
    expect(ttl).toBe(86400);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Using TTL from specific path pattern'),
      expect.objectContaining({
        patternName: 'static-assets'
      })
    );
  });
  
  test('respects pattern priority', () => {
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Create a mock response and options that could match multiple patterns
    // This path contains both 'static' and 'preview' - 'preview' has higher priority
    const response = new Response('test', { status: 200 });
    const options = { path: '/preview/static/image.jpg' };
    
    // Calculate TTL
    const ttl = calculator.calculateTtl(response, options);
    
    // Should use temporary pattern TTL due to higher priority
    expect(ttl).toBe(60);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Using TTL from specific path pattern'),
      expect.objectContaining({
        patternName: 'temporary'
      })
    );
  });
  
  test('adjusts TTL based on response status code', () => {
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Test different status codes
    const options = { path: '/static/image.jpg' };
    
    // Success response (200)
    const successResponse = new Response('success', { status: 200 });
    expect(calculator.calculateTtl(successResponse, options)).toBe(86400);
    
    // Redirect response (301)
    const redirectResponse = new Response('redirect', { status: 301 });
    expect(calculator.calculateTtl(redirectResponse, options)).toBe(3600);
    
    // Client error response (404)
    const clientErrorResponse = new Response('not found', { status: 404 });
    expect(calculator.calculateTtl(clientErrorResponse, options)).toBe(60);
    
    // Server error response (500)
    const serverErrorResponse = new Response('server error', { status: 500 });
    expect(calculator.calculateTtl(serverErrorResponse, options)).toBe(10);
  });
  
  test('applies derivative-specific TTL adjustments', () => {
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Create a mock response and options with derivative
    const response = new Response('test', { status: 200 });
    const options = { 
      path: '/content/image.jpg',
      derivative: 'thumbnail' 
    };
    
    // Calculate TTL
    const ttl = calculator.calculateTtl(response, options);
    
    // Should use derivative-specific TTL
    expect(ttl).toBe(86400);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Applied derivative-specific TTL'),
      expect.objectContaining({
        derivative: 'thumbnail'
      })
    );
  });
  
  test('adjusts TTL based on content type', () => {
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Create options
    const options = { path: '/random/image.svg' };
    
    // Test different content types
    const makeResponse = (contentType: string) => {
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      return new Response('test', { status: 200, headers });
    };
    
    // SVG should get longer TTL
    const svgResponse = makeResponse('image/svg+xml');
    const svgTTL = calculator.calculateTtl(svgResponse, options);
    expect(svgTTL).toBeGreaterThan(300); // Default TTL
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Adjusted TTL based on content type'),
      expect.objectContaining({
        contentType: 'image/svg+xml'
      })
    );
    
    // Modern formats should get longer TTL
    const webpResponse = makeResponse('image/webp');
    const webpTTL = calculator.calculateTtl(webpResponse, options);
    expect(webpTTL).toBeGreaterThan(300); // Default TTL
  });
  
  test('falls back to hardcoded defaults if no configuration exists', () => {
    // Mock empty configuration
    mockConfigService.getConfig.mockReturnValue({
      cache: {
        ttl: {}
      }
    });
    
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Create a mock response and options
    const response = new Response('test', { status: 200 });
    const options = { path: '/random/path/image.jpg' };
    
    // Calculate TTL
    const ttl = calculator.calculateTtl(response, options);
    
    // Should use hardcoded defaults
    expect(ttl).toBe(300); // Default hardcoded value for success
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('using hardcoded defaults'),
      expect.any(Object)
    );
  });
  
  test('handles patterns with invalid regex', () => {
    // Setup configuration with an invalid regex
    mockConfigService.getConfig.mockReturnValue({
      cache: {
        ttl: {
          ok: 300
        },
        pathPatterns: [
          {
            name: 'default',
            matcher: '.*',
            ttl: { ok: 300 },
            priority: 0
          },
          {
            name: 'invalid',
            matcher: '(/[', // Invalid regex
            ttl: { ok: 3600 },
            priority: 10
          }
        ]
      }
    });
    
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Create a mock response and options
    const response = new Response('test', { status: 200 });
    const options = { path: '/invalid/test.jpg' };
    
    // Calculate TTL
    const ttl = calculator.calculateTtl(response, options);
    
    // Should skip invalid pattern and use default
    expect(ttl).toBe(300);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid regex in path pattern'),
      expect.objectContaining({
        patternName: 'invalid'
      })
    );
  });
  
  test('allows updating patterns dynamically', () => {
    // Create calculator
    const calculator = new PathPatternTTLCalculator(mockLogger, mockConfigService);
    
    // Create a mock response and options
    const response = new Response('test', { status: 200 });
    const options = { path: '/test/image.jpg' };
    
    // Calculate TTL with original patterns
    const originalTTL = calculator.calculateTtl(response, options);
    expect(originalTTL).toBe(300); // Default pattern
    
    // Update patterns
    calculator.updatePatterns([
      {
        name: 'default',
        matcher: '.*',
        ttl: { ok: 300 },
        priority: 0
      },
      {
        name: 'test',
        matcher: '/test/',
        ttl: { ok: 9999 },
        priority: 50
      }
    ]);
    
    // Calculate TTL with updated patterns
    const updatedTTL = calculator.calculateTtl(response, options);
    expect(updatedTTL).toBe(9999); // New test pattern
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Updated path pattern TTL calculator'),
      expect.any(Object)
    );
  });
});