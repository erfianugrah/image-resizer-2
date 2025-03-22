/**
 * Watermark functionality tests for Akamai compatibility layer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateAkamaiParams } from '../src/utils/akamai-compatibility';

describe('Watermark/Composite Parameter Translation', () => {
  let mockLogger: any;

  beforeEach(() => {
    // Create a mock logger to avoid actual logging during tests
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      breadcrumb: vi.fn()
    };

    // Silence logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should translate basic watermark placement correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,placement:southeast');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw).toHaveLength(1);
    expect(result.draw[0].url).toBe('watermark.png');
    expect(result.draw[0].bottom).toBeDefined();
    expect(result.draw[0].right).toBeDefined();
  });
  
  it('should translate opacity correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,opacity:50');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw[0].opacity).toBe(0.5); // 50% converted to 0-1 range
  });
  
  it('should translate tiling correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,tile:true');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw[0].repeat).toBe(true);
  });
  
  it('should translate width and height correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,width:100,height:50');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw[0].width).toBe(100);
    expect(result.draw[0].height).toBe(50);
  });
  
  it('should translate fit parameter correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,fit:cover');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw[0].fit).toBe('cover');
  });
  
  it('should translate background parameter correctly', () => {
    // URL-encoded hex color to avoid the # being treated as a fragment identifier
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,background:%23ff0000');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw[0].background).toBe('#ff0000'); // URL parser decodes the %23 to #
  });
  
  it('should translate rotation parameter correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,rotate:90');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw[0].rotate).toBe(90);
  });
  
  it('should handle multiple placement positions correctly', () => {
    const positions = [
      { input: 'north', expectedProps: { top: 5 } },
      { input: 'top', expectedProps: { top: 5 } },
      { input: 'south', expectedProps: { bottom: 5 } },
      { input: 'bottom', expectedProps: { bottom: 5 } },
      { input: 'east', expectedProps: { right: 5 } },
      { input: 'right', expectedProps: { right: 5 } },
      { input: 'west', expectedProps: { left: 5 } },
      { input: 'left', expectedProps: { left: 5 } },
      { input: 'northeast', expectedProps: { top: 5, right: 5 } },
      { input: 'topright', expectedProps: { top: 5, right: 5 } },
      { input: 'northwest', expectedProps: { top: 5, left: 5 } },
      { input: 'topleft', expectedProps: { top: 5, left: 5 } },
      { input: 'southeast', expectedProps: { bottom: 5, right: 5 } },
      { input: 'bottomright', expectedProps: { bottom: 5, right: 5 } },
      { input: 'southwest', expectedProps: { bottom: 5, left: 5 } },
      { input: 'bottomleft', expectedProps: { bottom: 5, left: 5 } },
      { input: 'center', expectedProps: {} } // Center has no positioning properties
    ];
    
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    positions.forEach(({ input, expectedProps }) => {
      const url = new URL(`https://example.com/image.jpg?im.composite=url:watermark.png,placement:${input}`);
      const result = translateAkamaiParams(url, config);
      
      expect(result.draw).toBeDefined();
      
      // Check each expected property
      Object.entries(expectedProps).forEach(([prop, value]) => {
        expect(result.draw[0][prop]).toBe(value);
      });
      
      // For center position, make sure no positioning properties are set
      if (input === 'center') {
        expect(result.draw[0].top).toBeUndefined();
        expect(result.draw[0].right).toBeUndefined();
        expect(result.draw[0].bottom).toBeUndefined();
        expect(result.draw[0].left).toBeUndefined();
      }
    });
  });
  
  it('should handle custom offsets correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,placement:southeast,offset:20');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw[0].bottom).toBe(20);
    expect(result.draw[0].right).toBe(20);
  });
  
  it('should normalize rotation values to 90, 180, 270 degrees', () => {
    const rotations = [
      { input: 80, expected: 90 },
      { input: 170, expected: 180 },
      { input: 260, expected: 270 },
      { input: 350, expected: undefined }, // Close to 0/360, no rotation
      { input: 10, expected: undefined },  // Close to 0, no rotation
    ];
    
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    rotations.forEach(({ input, expected }) => {
      const url = new URL(`https://example.com/image.jpg?im.composite=url:watermark.png,rotate:${input}`);
      const result = translateAkamaiParams(url, config);
      
      expect(result.draw).toBeDefined();
      
      if (expected === undefined) {
        expect(result.draw[0].rotate).toBeUndefined();
      } else {
        expect(result.draw[0].rotate).toBe(expected);
      }
    });
  });
  
  it('should do nothing when advanced features are disabled', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:watermark.png,placement:southeast');
    const config = { features: { enableAkamaiAdvancedFeatures: false } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeUndefined();
  });

  it('should support both im.composite and im.watermark parameters', () => {
    const urlComposite = new URL('https://example.com/image.jpg?im.composite=url:watermark.png');
    const urlWatermark = new URL('https://example.com/image.jpg?im.watermark=url:watermark.png');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const resultComposite = translateAkamaiParams(urlComposite, config);
    const resultWatermark = translateAkamaiParams(urlWatermark, config);
    
    expect(resultComposite.draw).toBeDefined();
    expect(resultComposite.draw[0].url).toBe('watermark.png');
    
    expect(resultWatermark.draw).toBeDefined();
    expect(resultWatermark.draw[0].url).toBe('watermark.png');
  });
  
  it('should handle complex composite parameter values', () => {
    const url = new URL(
      'https://example.com/image.jpg?im.composite=url:watermark.png,placement:southeast,opacity:80,width:100,height:50,fit:cover,background:transparent,rotate:90,offset:15'
    );
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.draw).toBeDefined();
    expect(result.draw[0]).toMatchObject({
      url: 'watermark.png',
      bottom: 15,
      right: 15,
      opacity: 0.8,
      width: 100,
      height: 50,
      fit: 'cover',
      background: 'transparent',
      rotate: 90
    });
  });
});