import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import { translateAkamaiParams, setLogger, convertToCloudflareUrl } from '../../src/utils/akamai-compatibility';

// Mock the logging module
vi.mock('../../src/utils/logging', () => {
  return {
    defaultLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      breadcrumb: vi.fn(),
      startTime: vi.fn()
    },
    createLogger: vi.fn()
  };
});

describe('Size Code Parameters', () => {
  beforeEach(() => {
    // Set up logger for akamai module
    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      breadcrumb: vi.fn(),
      startTime: vi.fn()
    };
    setLogger(mockLogger);
  });

  describe('f parameter', () => {
    it('should handle the f parameter with size codes', () => {
      const url = new URL('https://example.com/image.jpg?f=m');
      const params = translateAkamaiParams(url);
      
      expect(params.width).toBe(700);
    });

    it('should not override explicit width parameter', () => {
      const url = new URL('https://example.com/image.jpg?f=m&width=500');
      const params = translateAkamaiParams(url);
      
      expect(params.width).toBe(500);
    });

    it('should handle all defined size codes', () => {
      const sizeMap = {
        'xxu': 40,
        'xu': 80,
        'u': 160,
        'xxxs': 300,
        'xxs': 400,
        'xs': 500,
        's': 600,
        'm': 700,
        'l': 750,
        'xl': 900,
        'xxl': 1100,
        'xxxl': 1400,
        'sg': 1600,
        'g': 2000,
        'xg': 3000,
        'xxg': 4000
      };

      for (const [code, expectedWidth] of Object.entries(sizeMap)) {
        const url = new URL(`https://example.com/image.jpg?f=${code}`);
        const params = translateAkamaiParams(url);
        
        expect(params.width).toBe(expectedWidth);
      }
    });

    it('should ignore undefined size codes', () => {
      const url = new URL('https://example.com/image.jpg?f=undefined_code');
      const params = translateAkamaiParams(url);
      
      expect(params.width).toBeUndefined();
    });
  });

  describe('imwidth parameter', () => {
    it('should handle the imwidth parameter with size codes', () => {
      const url = new URL('https://example.com/image.jpg?imwidth=m');
      const params = translateAkamaiParams(url);
      
      expect(params.width).toBe(700);
    });

    it('should not override explicit width parameter', () => {
      const url = new URL('https://example.com/image.jpg?imwidth=m&width=500');
      const params = translateAkamaiParams(url);
      
      expect(params.width).toBe(500);
    });

    it('should handle all defined size codes in imwidth parameter', () => {
      const sizeMap = {
        'xxu': 40,
        'xu': 80,
        'u': 160,
        'xxxs': 300,
        'xxs': 400,
        'xs': 500,
        's': 600,
        'm': 700,
        'l': 750,
        'xl': 900,
        'xxl': 1100,
        'xxxl': 1400,
        'sg': 1600,
        'g': 2000,
        'xg': 3000,
        'xxg': 4000
      };

      for (const [code, expectedWidth] of Object.entries(sizeMap)) {
        const url = new URL(`https://example.com/image.jpg?imwidth=${code}`);
        const params = translateAkamaiParams(url);
        
        expect(params.width).toBe(expectedWidth);
      }
    });

    it('should handle numeric imwidth values', () => {
      const url = new URL('https://example.com/image.jpg?imwidth=850');
      const params = translateAkamaiParams(url);
      
      expect(params.width).toBe(850);
    });

    it('should prioritize f parameter over imwidth when both are present', () => {
      const url = new URL('https://example.com/image.jpg?f=m&imwidth=l');
      const params = translateAkamaiParams(url);
      
      // The f parameter should be applied first and should prevent 
      // the imwidth parameter from being used
      expect(params.width).toBe(700);
    });

    it('should ignore undefined size codes in imwidth', () => {
      const url = new URL('https://example.com/image.jpg?imwidth=undefined_code');
      const params = translateAkamaiParams(url);
      
      expect(params.width).toBeUndefined();
    });
  });

  describe('Integration with Cloudflare URL converter', () => {
    it('should convert f parameter size codes to width in Cloudflare URLs', () => {
      // Create a URL with an Akamai size code
      const url = new URL('https://example.com/image.jpg?f=xl');
      
      // Convert to Cloudflare URL format
      const cfUrl = convertToCloudflareUrl(url);
      
      // The f parameter should be removed and replaced with width
      expect(cfUrl.searchParams.has('f')).toBe(false);
      expect(cfUrl.searchParams.get('width')).toBe('900');
    });

    it('should convert imwidth parameter size codes to width in Cloudflare URLs', () => {
      // Create a URL with an Akamai imwidth parameter
      const url = new URL('https://example.com/image.jpg?imwidth=l');
      
      // Convert to Cloudflare URL format
      const cfUrl = convertToCloudflareUrl(url);
      
      // The imwidth parameter should be removed and replaced with width
      expect(cfUrl.searchParams.has('imwidth')).toBe(false);
      expect(cfUrl.searchParams.get('width')).toBe('750');
    });

    it('should extract imwidth from within im=AspectCrop parameters', () => {
      // Create a URL with imwidth inside AspectCrop params
      const url = new URL('https://example.com/image.jpg?im=AspectCrop=(21,9),xPosition=.5,yPosition=.5,imwidth=1000,AllowExpansion=true');
      
      // Convert to Cloudflare URL format
      const cfUrl = convertToCloudflareUrl(url);
      
      // The im parameter should be removed and replaced with Cloudflare parameters
      expect(cfUrl.searchParams.has('im')).toBe(false);
      // Width should be extracted and applied
      expect(cfUrl.searchParams.get('width')).toBe('1000');
      // Other parameters should also be preserved
      expect(cfUrl.searchParams.get('aspect')).toBe('21:9');
      expect(cfUrl.searchParams.get('allowExpansion')).toBe('true');
    });
  });
});