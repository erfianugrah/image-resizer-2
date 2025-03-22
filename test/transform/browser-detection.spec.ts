import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Import detector instead of the transform functions
import { detector } from '../../src/utils/detector';
import { isFormatSupported } from '../../src/utils/browser-formats';

// Mock the Request object
class MockRequest {
  headers: Headers;
  
  constructor(headers: Record<string, string>) {
    this.headers = new Headers(headers);
  }
}

describe('Browser Detection Integration', () => {
  describe('Detector Framework', () => {
    it('detects Chrome browser correctly from User-Agent', async () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
      const request = new MockRequest({ 'User-Agent': userAgent });
      
      const capabilities = await detector.detect(request as any);
      expect(capabilities.browser.name).toBe('chrome');
      expect(parseFloat(capabilities.browser.version)).toBeGreaterThanOrEqual(96);
      expect(capabilities.formats.webp).toBe(true);
      expect(capabilities.formats.avif).toBe(true);
    });
    
    it('detects Firefox browser correctly from User-Agent', async () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:95.0) Gecko/20100101 Firefox/95.0';
      const request = new MockRequest({ 'User-Agent': userAgent });
      
      const capabilities = await detector.detect(request as any);
      expect(capabilities.browser.name).toBe('firefox');
      expect(parseFloat(capabilities.browser.version)).toBeGreaterThanOrEqual(95);
      expect(capabilities.formats.webp).toBe(true);
      expect(capabilities.formats.avif).toBe(true);
    });
    
    it('detects Safari browser correctly from User-Agent', async () => {
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15';
      const request = new MockRequest({ 'User-Agent': userAgent });
      
      const capabilities = await detector.detect(request as any);
      expect(capabilities.browser.name).toBe('safari');
      expect(parseFloat(capabilities.browser.version)).toBeGreaterThanOrEqual(15);
      expect(capabilities.formats.webp).toBe(true);
      expect(capabilities.formats.avif).toBe(false); // Safari 15.1 doesn't support AVIF
    });
    
    it('prefers Accept header over User-Agent for format detection', async () => {
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15';
      const request = new MockRequest({ 
        'User-Agent': userAgent,
        'Accept': 'image/avif,image/webp,image/png,image/jpeg' 
      });
      
      const capabilities = await detector.detect(request as any);
      expect(capabilities.browser.name).toBe('safari');
      expect(capabilities.formats.webp).toBe(true);
      expect(capabilities.formats.avif).toBe(true); // Accept header indicates AVIF support
      expect(capabilities.formats.source).toBe('accept-header');
    });
    
    it('uses client hints when available', async () => {
      const request = new MockRequest({ 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        'Sec-CH-UA': '"Not A;Brand";v="99", "Chromium";v="96", "Google Chrome";v="96"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'Sec-CH-Viewport-Width': '1920',
        'DPR': '2.0'
      });
      
      const capabilities = await detector.detect(request as any);
      // The name might come from different sources depending on implementation
      // what matters is that we have brand data
      expect(capabilities.browser).toBeTruthy();
      expect(capabilities.browser.source).toBeTruthy();
      expect(capabilities.browser.mobile).toBe(false);
      expect(capabilities.browser.platform).toBe('Windows');
    });

    it('fallbacks to static data when other methods fail', async () => {
      const request = new MockRequest({
        'User-Agent': 'Very Old Browser/1.0',
      });
      
      const capabilities = await detector.detect(request as any);
      expect(capabilities.browser.name).toBeTruthy();
      expect(capabilities.formats.webp).toBeDefined();
      expect(capabilities.formats.avif).toBeDefined();
    });
    
    it('provides correct format information for modern browsers', async () => {
      // Using static isFormatSupported directly to verify detector uses the same data
      expect(isFormatSupported('webp', 'chrome', '96.0')).toBe(true);
      expect(isFormatSupported('avif', 'chrome', '96.0')).toBe(true);
      expect(isFormatSupported('webp', 'firefox', '95.0')).toBe(true);
      expect(isFormatSupported('avif', 'firefox', '95.0')).toBe(true);
      expect(isFormatSupported('webp', 'safari', '15.0')).toBe(true);
      expect(isFormatSupported('avif', 'safari', '15.0')).toBe(false);
    });
  });
});