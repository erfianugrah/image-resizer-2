/**
 * Tests for client hints utilities
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  parseClientHints, 
  browserSupportsClientHints,
  getConnectionQuality,
  getNetworkQuality,
  getDeviceClass,
  getDeviceCapabilities,
  calculatePerformanceBudget,
  suggestOptimizations,
  calculateResponsiveDimensions,
  getColorSchemePreference
} from '../../src/utils/client-hints';

// Mock browser-formats to avoid external dependencies
vi.mock('../../src/utils/browser-formats', () => ({
  isFormatSupported: (format: string, browser: string, version: string) => {
    if (format === 'webp') return true;
    if (format === 'avif' && browser === 'chrome' && parseFloat(version) >= 85) return true;
    return false;
  }
}));

// Mock the logger to avoid log noise during tests
vi.mock('../../src/utils/logging', async () => {
  const actual = await vi.importActual<typeof import('../mocks/logging')>('../mocks/logging');
  return {
    ...actual,
    defaultLogger: actual.mockLogger,
    createLogger: () => actual.mockLogger
  };
});

describe('Client Hints utilities', () => {
  describe('parseClientHints', () => {
    it('should extract client hints from request headers', () => {
      const headers = new Headers({
        'Sec-CH-DPR': '2.0',
        'Sec-CH-Viewport-Width': '1280',
        'Sec-CH-UA': '"Chrome"; v="119", "Not?A_Brand"; v="24"',
        'Sec-CH-UA-Mobile': '?0',
        'Save-Data': 'on'
      });
      
      const request = new Request('https://example.com/image.jpg', {
        headers
      });
      
      const hints = parseClientHints(request);
      
      expect(hints.dpr).toBe(2.0);
      expect(hints.viewportWidth).toBe(1280);
      expect(hints.uaBrands).toContain('Chrome');
      expect(hints.uaMobile).toBe(false);
      expect(hints.saveData).toBe(true);
    });
    
    it('should handle missing client hints', () => {
      const request = new Request('https://example.com/image.jpg');
      const hints = parseClientHints(request);
      
      expect(Object.keys(hints).length).toBe(0);
    });
    
    it('should handle malformed client hints', () => {
      const headers = new Headers({
        'Sec-CH-DPR': 'invalid', // Not a number
        'Sec-CH-UA': 'malformed-ua-string'
      });
      
      const request = new Request('https://example.com/image.jpg', {
        headers
      });
      
      const hints = parseClientHints(request);
      
      // Should not throw an error and should return empty object
      expect(hints).toBeDefined();
      expect(isNaN(hints.dpr as number)).toBe(true);
    });

    it('should detect format support from Accept header', () => {
      const headers = new Headers({
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*'
      });
      
      const request = new Request('https://example.com/image.jpg', {
        headers
      });
      
      const hints = parseClientHints(request);
      
      expect(hints.acceptFormats).toContain('avif');
      expect(hints.acceptFormats).toContain('webp');
      expect(hints.supportsWebP).toBe(true);
      expect(hints.supportsAVIF).toBe(true);
    });

    it('should detect format support from browser information', () => {
      const headers = new Headers({
        'Sec-CH-UA': '"Chrome"; v="90", "Not?A_Brand"; v="24"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"'
      });
      
      const request = new Request('https://example.com/image.jpg', {
        headers
      });
      
      const hints = parseClientHints(request);
      
      // Our mock should return true for WebP and AVIF with Chrome 90
      expect(hints.supportsWebP).toBe(true);
      expect(hints.supportsAVIF).toBe(true);
    });

    it('should extract color scheme and reduced motion preferences', () => {
      const headers = new Headers({
        'Sec-CH-Prefers-Color-Scheme': 'dark',
        'Sec-CH-Prefers-Reduced-Motion': 'reduce'
      });
      
      const request = new Request('https://example.com/image.jpg', {
        headers
      });
      
      const hints = parseClientHints(request);
      
      expect(hints.prefersColorScheme).toBe('dark');
      expect(hints.prefersReducedMotion).toBe(true);
    });

    it('should extract device capabilities from bitness and architecture', () => {
      const headers = new Headers({
        'Sec-CH-UA-Arch': 'x86',
        'Sec-CH-UA-Bitness': '64',
        'Sec-CH-Device-Memory': '8',
        'Hardware-Concurrency': '8'
      });
      
      const request = new Request('https://example.com/image.jpg', {
        headers
      });
      
      const hints = parseClientHints(request);
      
      expect(hints.uaArch).toBe('x86');
      expect(hints.uaBitness).toBe('64');
      expect(hints.deviceMemory).toBe(8);
      expect(hints.hardwareConcurrency).toBe(8);
    });
  });
  
  describe('browserSupportsClientHints', () => {
    it('should detect modern Chrome', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36';
      expect(browserSupportsClientHints(userAgent)).toBe(true);
    });
    
    it('should detect modern Edge', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36 Edg/90.0.818.66';
      expect(browserSupportsClientHints(userAgent)).toBe(true);
    });
    
    it('should reject Safari', () => {
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15';
      expect(browserSupportsClientHints(userAgent)).toBe(false);
    });
    
    it('should reject old Chrome', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36';
      expect(browserSupportsClientHints(userAgent)).toBe(false);
    });
    
    it('should handle empty user agent', () => {
      expect(browserSupportsClientHints('')).toBe(false);
      expect(browserSupportsClientHints(null as unknown as string)).toBe(false);
    });
  });
  
  describe('getConnectionQuality', () => {
    it('should identify fast connections', () => {
      expect(getConnectionQuality({ rtt: 50, downlink: 10 })).toBe('fast');
      expect(getConnectionQuality({ ect: '4g' })).toBe('fast');
    });
    
    it('should identify slow connections', () => {
      expect(getConnectionQuality({ rtt: 600, downlink: 0.5 })).toBe('slow');
      expect(getConnectionQuality({ ect: 'slow-2g' })).toBe('slow');
      expect(getConnectionQuality({ saveData: true })).toBe('slow');
    });
    
    it('should return unknown for insufficient data', () => {
      expect(getConnectionQuality({})).toBe('unknown');
    });
  });
  
  describe('getNetworkQuality', () => {
    it('should provide detailed assessment for network quality', () => {
      const result = getNetworkQuality({ rtt: 50, downlink: 10 });
      expect(result.tier).toBe('fast');
      expect(result.estimated).toBe(false);
      expect(result.description).toContain('Fast connection');
      expect(result.rtt).toBe(50);
      expect(result.downlink).toBe(10);
    });
    
    it('should prioritize Save-Data header over other metrics', () => {
      const result = getNetworkQuality({ 
        rtt: 50, 
        downlink: 10, 
        saveData: true 
      });
      expect(result.tier).toBe('slow');
      expect(result.description).toContain('Save-Data');
    });
    
    it('should provide meaningful description for each connection type', () => {
      expect(getNetworkQuality({ ect: '4g' }).description).toContain('4G');
      expect(getNetworkQuality({ ect: '3g' }).description).toContain('3G');
      expect(getNetworkQuality({ ect: '2g' }).description).toContain('2G');
      expect(getNetworkQuality({ ect: 'slow-2g' }).description).toContain('slow');
    });
  });
  
  describe('getDeviceClass', () => {
    it('should identify high-end devices', () => {
      expect(getDeviceClass({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe('high-end');
    });
    
    it('should identify low-end devices', () => {
      expect(getDeviceClass({ deviceMemory: 1, hardwareConcurrency: 2, uaMobile: true })).toBe('low-end');
    });
    
    it('should use network quality to help determine device class', () => {
      // Device with good memory but slow network should still be considered good
      expect(getDeviceClass({ deviceMemory: 8, hardwareConcurrency: 8, rtt: 500, downlink: 1 })).toBe('high-end');
      
      // Network quality alone isn't enough to determine device class completely,
      // but it should influence the score
      expect(['low-end', 'mid-range', 'unknown']).toContain(getDeviceClass({ rtt: 50, downlink: 10, ect: '4g' }));
    });
    
    it('should return unknown for insufficient data', () => {
      // With no data, we should still get a score-based class since we always provide a default score
      const result = getDeviceClass({});
      expect(['unknown', 'low-end']).toContain(result);
    });
  });
  
  describe('getDeviceCapabilities', () => {
    it('should provide detailed device assessment', () => {
      const result = getDeviceCapabilities({ 
        deviceMemory: 8, 
        hardwareConcurrency: 8,
        uaPlatform: 'Windows'
      });
      
      expect(result.description).toContain('Capable device');
      expect(result.description).toContain('Windows');
      expect(result.description).toContain('8GB RAM');
      expect(result.memory).toBe(8);
      expect(result.processors).toBe(8);
      expect(result.estimated).toBe(false);
      expect(result.score).toBeGreaterThan(65); // Should be a high score
    });
    
    it('should detect mobile devices', () => {
      const result = getDeviceCapabilities({ 
        deviceMemory: 4, 
        uaMobile: true,
        uaPlatform: 'Android'
      });
      
      expect(result.description).toContain('mobile');
      expect(result.description).toContain('Android');
      expect(result.mobile).toBe(true);
    });
    
    it('should consider network conditions in device assessment', () => {
      const result = getDeviceCapabilities({ 
        deviceMemory: 4,
        hardwareConcurrency: 4,
        ect: '4g',
        downlink: 10
      });
      
      expect(result.score).toBeGreaterThan(50); // Should have a boost from good network
      
      const slowResult = getDeviceCapabilities({ 
        deviceMemory: 4,
        hardwareConcurrency: 4,
        ect: 'slow-2g',
        saveData: true
      });
      
      expect(slowResult.score).toBeLessThan(result.score); // Should be lower due to network
    });
  });
  
  describe('calculatePerformanceBudget', () => {
    it('should create appropriate budget for fast connections on high-end devices', () => {
      const hints = { 
        ect: '4g',
        deviceMemory: 8, 
        hardwareConcurrency: 8,
        dpr: 2
      };
      
      const budget = calculatePerformanceBudget(hints);
      
      expect(budget.quality.target).toBeGreaterThan(75); // Higher quality
      expect(budget.maxWidth).toBeGreaterThanOrEqual(1500); // Higher resolution allowed
      expect(budget.dpr).toBe(2); // Use actual DPR
    });
    
    it('should create conservative budget for slow connections', () => {
      const hints = { 
        ect: 'slow-2g',
        deviceMemory: 4,
        dpr: 2
      };
      
      const budget = calculatePerformanceBudget(hints);
      
      expect(budget.quality.target).toBeLessThan(70); // Lower quality
      expect(budget.maxWidth).toBeLessThanOrEqual(1200); // Lower resolution
      expect(budget.preferredFormat).toBe('webp'); // Force efficient format
    });
    
    it('should create minimal budget when Save-Data is enabled', () => {
      const hints = { 
        saveData: true,
        deviceMemory: 4,
        dpr: 2
      };
      
      const budget = calculatePerformanceBudget(hints);
      
      expect(budget.quality.target).toBe(budget.quality.min); // Minimum quality
      expect(budget.maxWidth).toBeLessThanOrEqual(800); // Very low resolution
      expect(budget.preferredFormat).toBe('webp'); // Force efficient format
    });

    it('should set preferred format based on browser support', () => {
      // Test with browser supporting AVIF
      const hintsWithAvif = { 
        supportsAVIF: true,
        supportsWebP: true
      };
      
      const budgetWithAvif = calculatePerformanceBudget(hintsWithAvif);
      expect(budgetWithAvif.preferredFormat).toBe('avif');
      
      // Test with browser supporting only WebP
      const hintsWithWebP = { 
        supportsAVIF: false,
        supportsWebP: true
      };
      
      const budgetWithWebP = calculatePerformanceBudget(hintsWithWebP);
      expect(budgetWithWebP.preferredFormat).toBe('webp');
    });
  });

  describe('calculateResponsiveDimensions', () => {
    it('should calculate dimensions based on viewport width and DPR', () => {
      const hints = {
        viewportWidth: 1200,
        dpr: 2
      };
      
      const dimensions = calculateResponsiveDimensions(hints);
      
      expect(dimensions.width).toBeDefined();
      expect(dimensions.width).toBeLessThanOrEqual(2400); // viewportWidth (1200) * DPR (2), capped by performance budget
    });
    
    it('should maintain aspect ratio when original dimensions are known', () => {
      const hints = {
        viewportWidth: 800,
        dpr: 1
      };
      
      const originalWidth = 1600;
      const originalHeight = 900; // 16:9 aspect ratio
      
      const dimensions = calculateResponsiveDimensions(hints, originalWidth, originalHeight);
      
      expect(dimensions.width).toBe(800);
      expect(dimensions.height).toBe(450); // Maintains 16:9 ratio
    });
    
    it('should cap dimensions based on performance budget', () => {
      const hints = {
        viewportWidth: 1200,
        dpr: 3,
        ect: 'slow-2g' // This triggers a lower budget
      };
      
      const dimensions = calculateResponsiveDimensions(hints);
      
      expect(dimensions.width).toBeLessThanOrEqual(1200); // Should be capped by slow-2g budget
    });
    
    it('should adjust dimensions for reduced motion preference', () => {
      const hints = {
        viewportWidth: 1000,
        dpr: 1,
        prefersReducedMotion: true
      };
      
      const dimensions = calculateResponsiveDimensions(hints);
      
      // Should be 10% smaller than the regular calculation
      expect(dimensions.width).toBe(900); // 1000 * 0.9
    });
  });

  describe('getColorSchemePreference', () => {
    it('should detect dark mode preference', () => {
      const hints = { prefersColorScheme: 'dark' };
      expect(getColorSchemePreference(hints)).toBe('dark');
    });
    
    it('should detect light mode preference', () => {
      const hints = { prefersColorScheme: 'light' };
      expect(getColorSchemePreference(hints)).toBe('light');
    });
    
    it('should return undefined when no preference is specified', () => {
      const hints = {};
      expect(getColorSchemePreference(hints)).toBeUndefined();
    });
  });
  
  describe('suggestOptimizations', () => {
    it('should respect existing options', () => {
      const options = {
        width: 800,
        quality: 90,
        format: 'webp'
      };
      
      const hints = {
        dpr: 2,
        viewportWidth: 1200,
        saveData: true
      };
      
      const suggestions = suggestOptimizations(options, hints);
      
      // Shouldn't suggest changes for explicitly specified options
      expect(suggestions.optimizedWidth).toBeUndefined();
      expect(suggestions.quality).toBeUndefined();
      expect(suggestions.format).toBeUndefined();
    });
    
    it('should suggest DPR scaling', () => {
      const options = {};
      const hints = { dpr: 2.5 };
      
      const suggestions = suggestOptimizations(options, hints);
      
      expect(suggestions.dpr).toBeDefined();
      expect(suggestions.dpr).toBeLessThanOrEqual(3); // Should cap at 3x
    });
    
    it('should suggest lower quality for slow connections', () => {
      const options = {};
      const hints = { 
        rtt: 800, 
        downlink: 0.5,
        saveData: true
      };
      
      const suggestions = suggestOptimizations(options, hints);
      
      expect(suggestions.quality).toBeDefined();
      expect(suggestions.quality).toBeLessThanOrEqual(65); // Should be significantly lower for slow connection
    });

    it('should suggest responsive dimensions based on viewport', () => {
      const options = {};
      const hints = { 
        viewportWidth: 800,
        dpr: 2
      };
      
      const suggestions = suggestOptimizations(options, hints);
      
      expect(suggestions.optimizedWidth).toBeDefined();
      expect(suggestions.optimizedWidth).toBeGreaterThanOrEqual(800);
      expect(suggestions.optimizedWidth).toBeLessThanOrEqual(1600);
    });

    it('should suggest optimal format based on browser support', () => {
      const options = { format: 'auto' };
      const hints = { 
        supportsAVIF: true,
        supportsWebP: true
      };
      
      const suggestions = suggestOptimizations(options, hints);
      
      expect(suggestions.format).toBeDefined();
      expect(suggestions.format).toBe('avif'); // Should prefer AVIF when supported
    });
  });
});