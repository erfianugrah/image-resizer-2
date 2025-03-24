/**
 * Debug Service Tests
 * 
 * Tests for the enhanced DebugService functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultDebugService } from '../../src/services/debugService';
import { ImageResizerConfig } from '../../src/config';
import { StorageResult, ClientInfo } from '../../src/services/interfaces';
import { TransformOptions } from '../../src/transform';
import { PerformanceMetrics } from '../../src/debug';
import { Logger } from '../../src/utils/logging';

// Import mock logger
import { createMockLogger } from '../mocks/logging';

// Create a mock config with debug settings
const mockConfig: Partial<ImageResizerConfig> = {
  environment: 'development',
  version: '1.0.0',
  debug: {
    enabled: true,
    headers: ['ir', 'cache', 'mode', 'client-hints'],
    allowedEnvironments: ['development', 'staging'],
    verbose: true,
    includePerformance: true,
    forceDebugHeaders: false,
    prefix: 'X-',
    specialHeaders: {
      'x-processing-mode': true,
      'x-size-source': true
    },
    headerNames: {
      debugEnabled: 'X-Debug-Enabled',
      version: 'X-Image-Resizer-Version',
      environment: 'X-Environment',
      processingMode: 'X-Processing-Mode',
      storageType: 'X-Storage-Type',
      originalContentType: 'X-Original-Content-Type',
      originalSize: 'X-Original-Size'
    }
  }
} as any;

// Mock storage result
const mockStorageResult: StorageResult = {
  response: new Response('Test image content', {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': '1000'
    }
  }),
  sourceType: 'r2',
  contentType: 'image/jpeg',
  size: 1000,
  metadata: {
    'width': '1920',
    'height': '1080',
    'x-meta-caption': 'Test image'
  },
  originalUrl: 'https://example.com/original.jpg',
  path: '/path/to/image.jpg',
  width: 1920,
  height: 1080
};

// Mock transform options
const mockOptions: TransformOptions = {
  width: 800,
  height: 600,
  format: 'webp',
  quality: 85,
  fit: 'cover',
  gravity: 'center'
};

// Mock performance metrics
const mockMetrics: PerformanceMetrics = {
  start: 1000,
  storageStart: 1100,
  storageEnd: 1200,
  transformStart: 1300,
  transformEnd: 1500,
  end: 1600,
  detectionStart: 1050,
  detectionEnd: 1080
};

// Mock client info
const mockClientInfo: ClientInfo = {
  viewportWidth: 1920,
  devicePixelRatio: 2,
  saveData: false,
  acceptsWebp: true,
  acceptsAvif: true,
  deviceType: 'desktop'
};

describe('DebugService', () => {
  let debugService: DefaultDebugService;
  let mockLogger: Logger;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
    debugService = new DefaultDebugService(mockLogger);
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  it('should check if debug is enabled', () => {
    // Create requests with different debug parameters
    const requestWithDebugTrue = new Request('https://example.com/image.jpg?debug=true');
    const requestWithDebugOn = new Request('https://example.com/image.jpg?debug=on');
    const requestWithDebugFalse = new Request('https://example.com/image.jpg?debug=false');
    const requestWithNoDebug = new Request('https://example.com/image.jpg');
    
    // Debug should be enabled when explicitly requested
    expect(debugService.isDebugEnabled(requestWithDebugTrue, mockConfig as ImageResizerConfig)).toBe(true);
    expect(debugService.isDebugEnabled(requestWithDebugOn, mockConfig as ImageResizerConfig)).toBe(true);
    
    // Debug should be disabled when explicitly disabled or not specified
    expect(debugService.isDebugEnabled(requestWithDebugFalse, mockConfig as ImageResizerConfig)).toBe(false);
    expect(debugService.isDebugEnabled(requestWithNoDebug, mockConfig as ImageResizerConfig)).toBe(false);
    
    // Test with debug disabled in config
    const configWithDebugDisabled = {
      ...mockConfig,
      debug: {
        ...mockConfig.debug,
        enabled: false
      }
    };
    
    // Debug should be disabled regardless of request parameter
    expect(debugService.isDebugEnabled(requestWithDebugTrue, configWithDebugDisabled as ImageResizerConfig)).toBe(false);
    
    // Test with debug forced in config
    const configWithDebugForced = {
      ...mockConfig,
      debug: {
        ...mockConfig.debug,
        forceDebugHeaders: true
      }
    };
    
    // Debug should be enabled even without request parameter
    expect(debugService.isDebugEnabled(requestWithNoDebug, configWithDebugForced as ImageResizerConfig)).toBe(true);
    
    // Test with production environment
    const configWithProductionEnv = {
      ...mockConfig,
      environment: 'production'
    };
    
    // Debug should be disabled in production when not explicitly allowed
    expect(debugService.isDebugEnabled(requestWithDebugTrue, configWithProductionEnv as ImageResizerConfig)).toBe(false);
  });
  
  it('should add debug headers to response', () => {
    const request = new Request('https://example.com/image.jpg?debug=true');
    const response = new Response('Test content', {
      headers: {
        'Content-Type': 'image/webp'
      }
    });
    
    const url = new URL(request.url);
    
    const debuggedResponse = debugService.addDebugHeaders(
      response,
      request,
      mockStorageResult,
      mockOptions,
      mockConfig as ImageResizerConfig,
      mockMetrics,
      url
    );
    
    // The response should have debug headers
    expect(debuggedResponse.headers.get('X-Debug-Enabled')).toBe('true');
    expect(debuggedResponse.headers.get('X-Image-Resizer-Version')).toBe('1.0.0');
    expect(debuggedResponse.headers.get('X-Environment')).toBe('development');
    expect(debuggedResponse.headers.get('X-Storage-Type')).toBe('r2');
    expect(debuggedResponse.headers.get('X-Original-Content-Type')).toBe('image/jpeg');
    expect(debuggedResponse.headers.get('X-Original-Size')).toBe('1000');
    expect(debuggedResponse.headers.get('X-Processing-Mode')).not.toBeNull();
    
    // Performance metrics should be included
    expect(debuggedResponse.headers.get('X-Storage-Time')).toBe('100');
    expect(debuggedResponse.headers.get('X-Transform-Time')).toBe('200');
    expect(debuggedResponse.headers.get('X-Total-Time')).toBe('600');
    
    // Image parameters should be included
    expect(debuggedResponse.headers.get('X-Image-Width')).toBe('800');
    expect(debuggedResponse.headers.get('X-Image-Height')).toBe('600');
    expect(debuggedResponse.headers.get('X-Image-Format')).toBe('webp');
    expect(debuggedResponse.headers.get('X-Image-Quality')).toBe('85');
    expect(debuggedResponse.headers.get('X-Image-Fit')).toBe('cover');
  });
  
  it('should get detailed debug information', () => {
    const request = new Request('https://example.com/image.jpg?debug=true');
    
    const debugInfo = debugService.getDebugInfo(
      request,
      mockStorageResult,
      mockOptions,
      mockConfig as ImageResizerConfig,
      mockMetrics
    );
    
    // Debug info should include all expected sections
    expect(debugInfo).toHaveProperty('request');
    expect(debugInfo).toHaveProperty('storage');
    expect(debugInfo).toHaveProperty('transformation');
    expect(debugInfo).toHaveProperty('performance');
    expect(debugInfo).toHaveProperty('config');
    
    // Check some specific properties
    expect(debugInfo.request).toHaveProperty('url', 'https://example.com/image.jpg?debug=true');
    expect(debugInfo.storage).toHaveProperty('sourceType', 'r2');
    expect(debugInfo.storage).toHaveProperty('contentType', 'image/jpeg');
    expect(debugInfo.storage).toHaveProperty('size', 1000);
    expect(debugInfo.transformation).toHaveProperty('width', 800);
    expect(debugInfo.transformation).toHaveProperty('format', 'webp');
    expect(debugInfo.performance).toHaveProperty('storageTime', 100);
    expect(debugInfo.performance).toHaveProperty('transformTime', 200);
    expect(debugInfo.performance).toHaveProperty('totalTime', 600);
    expect(debugInfo.config).toHaveProperty('environment', 'development');
  });
  
  it('should create a debug HTML report', () => {
    const request = new Request('https://example.com/image.jpg?debug=true');
    
    const htmlReport = debugService.createDebugHtmlReport(
      request,
      mockStorageResult,
      mockOptions,
      mockConfig as ImageResizerConfig,
      mockMetrics,
      mockClientInfo
    );
    
    // The response should be an HTML document
    expect(htmlReport).toBeInstanceOf(Response);
    expect(htmlReport.headers.get('Content-Type')).toBe('text/html');
    
    // We can't easily check the content of the HTML, but we can verify
    // that it's a complete HTML document with minimum expected sections
    return htmlReport.text().then(html => {
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</html>');
      
      // Should contain debug information
      expect(html).toContain('Debug Report');
      expect(html).toContain('Image Resizer');
      
      // Should contain performance section
      expect(html).toContain('Performance');
      
      // Should contain transformation section
      expect(html).toContain('Transformation');
      
      // Should contain client info section when provided
      expect(html).toContain('Client Information');
      expect(html).toContain('Desktop');
      expect(html).toContain('1920px');
      expect(html).toContain('2x');
    });
  });
  
  it('should handle missing client info in debug report', () => {
    const request = new Request('https://example.com/image.jpg?debug=true');
    
    const htmlReport = debugService.createDebugHtmlReport(
      request,
      mockStorageResult,
      mockOptions,
      mockConfig as ImageResizerConfig,
      mockMetrics,
      undefined // No client info
    );
    
    // The report should still be generated without client info
    expect(htmlReport).toBeInstanceOf(Response);
    expect(htmlReport.headers.get('Content-Type')).toBe('text/html');
  });
});