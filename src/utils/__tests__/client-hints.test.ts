/**
 * Tests for client hints utilities
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  parseClientHints, 
  browserSupportsClientHints,
  getConnectionQuality,
  getDeviceClass,
  suggestOptimizations
} from '../client-hints';

// Mock the logger to avoid log noise during tests
vi.mock('../logging', () => ({
  defaultLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  },
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  })
}));

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
  
  describe('getDeviceClass', () => {
    it('should identify high-end devices', () => {
      expect(getDeviceClass({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe('high-end');
    });
    
    it('should identify low-end devices', () => {
      expect(getDeviceClass({ deviceMemory: 1, hardwareConcurrency: 2, uaMobile: true })).toBe('low-end');
    });
    
    it('should return unknown for insufficient data', () => {
      expect(getDeviceClass({})).toBe('unknown');
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
  });
});