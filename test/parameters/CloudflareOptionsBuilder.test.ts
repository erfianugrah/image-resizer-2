import { describe, it, expect } from 'vitest';
import { CloudflareOptionsBuilder } from '../../src/parameters/CloudflareOptionsBuilder';
import mockLogger from '../mocks/logging';

describe('CloudflareOptionsBuilder', () => {
  const builder = new CloudflareOptionsBuilder(mockLogger);
  
  describe('buildFetchOptions', () => {
    it('should build basic Cloudflare fetch options', () => {
      const params = {
        width: 800,
        height: 600,
        fit: 'cover',
        quality: 85
      };
      
      const fetchOptions = builder.buildFetchOptions(params);
      
      expect(fetchOptions.method).toBe('GET');
      expect((fetchOptions.cf as any).polish).toBe('off');
      expect((fetchOptions.cf as any).mirage).toBe(false);
      
      const imageOptions = (fetchOptions.cf as any).image;
      expect(imageOptions.width).toBe(800);
      expect(imageOptions.height).toBe(600);
      expect(imageOptions.fit).toBe('cover');
      expect(imageOptions.quality).toBe(85);
    });
    
    it('should handle blur parameter within range', () => {
      const params = {
        blur: 50
      };
      
      const fetchOptions = builder.buildFetchOptions(params);
      const imageOptions = (fetchOptions.cf as any).image;
      
      expect(imageOptions.blur).toBe(50);
    });
    
    it('should constrain blur parameter to valid range', () => {
      const params = {
        blur: 500 // Out of range
      };
      
      const fetchOptions = builder.buildFetchOptions(params);
      const imageOptions = (fetchOptions.cf as any).image;
      
      expect(imageOptions.blur).toBe(250); // Constrained to max
    });
    
    it('should apply cache options when provided', () => {
      const params = {
        width: 800
      };
      
      const options = {
        cacheOptions: {
          cacheEverything: true,
          cacheTtl: 86400
        }
      };
      
      const fetchOptions = builder.buildFetchOptions(params, options);
      
      expect((fetchOptions.cf as any).cacheEverything).toBe(true);
      expect((fetchOptions.cf as any).cacheTtl).toBe(86400);
    });
    
    it('should normalize rotate parameter to 0, 90, 180, or 270', () => {
      const params = {
        rotate: 85 // Close to 90
      };
      
      const fetchOptions = builder.buildFetchOptions(params);
      const imageOptions = (fetchOptions.cf as any).image;
      
      expect(imageOptions.rotate).toBe(90); // Normalized to nearest 90 degrees
    });
    
    it('should handle format parameter', () => {
      const params = {
        format: 'webp'
      };
      
      const fetchOptions = builder.buildFetchOptions(params);
      const imageOptions = (fetchOptions.cf as any).image;
      
      expect(imageOptions.format).toBe('webp');
    });
    
    it('should set format to auto for invalid formats', () => {
      const params = {
        format: 'invalid-format'
      };
      
      const fetchOptions = builder.buildFetchOptions(params);
      const imageOptions = (fetchOptions.cf as any).image;
      
      expect(imageOptions.format).toBe('auto');
    });
  });
});