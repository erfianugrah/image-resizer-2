import { describe, it, expect, vi } from 'vitest';
import { AkamaiParser } from '../../src/parameters/parsers/AkamaiParser';

// Create a simple mock logger for our tests
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn(),
  setLevel: vi.fn(),
  getLevel: vi.fn().mockReturnValue('INFO')
};

describe('AkamaiParser', () => {
  const parser = new AkamaiParser(mockLogger);
  
  describe('canParse', () => {
    it('should return true for URLs with im parameter', () => {
      const url = new URL('https://example.com/image.jpg?im=AspectCrop=(1,1)');
      expect(parser.canParse(url.searchParams)).toBe(true);
    });
    
    it('should return true for URLs with im.* parameters', () => {
      const url = new URL('https://example.com/image.jpg?im.resize=width:400');
      expect(parser.canParse(url.searchParams)).toBe(true);
    });
    
    it('should return true for URLs with Akamai-specific parameters', () => {
      const url = new URL('https://example.com/image.jpg?imwidth=400&imheight=300');
      expect(parser.canParse(url.searchParams)).toBe(true);
    });
    
    it('should return false for URLs without Akamai parameters', () => {
      const url = new URL('https://example.com/image.jpg?width=400&height=300');
      expect(parser.canParse(url.searchParams)).toBe(false);
    });
  });
  
  describe('parse', () => {
    it('should parse basic Akamai parameters', () => {
      const url = new URL('https://example.com/image.jpg?imwidth=400&imheight=300');
      const params = parser.parse(url.searchParams);
      
      // Check for width and height parameters
      const width = params.find(p => p.name === 'imwidth');
      const height = params.find(p => p.name === 'imheight');
      
      expect(width).toBeDefined();
      expect(width?.value).toBe(400);
      expect(height).toBeDefined();
      expect(height?.value).toBe(300);
    });
    
    it('should parse im=AspectCrop parameters', () => {
      const url = new URL('https://example.com/image.jpg?im=AspectCrop=(16,9)');
      const params = parser.parse(url.searchParams);
      
      // Check for aspect ratio parameter
      const aspect = params.find(p => p.name === 'aspect');
      
      expect(aspect).toBeDefined();
      expect(aspect?.value).toBe('16:9');
    });
    
    it('should parse im.resize parameters', () => {
      const url = new URL('https://example.com/image.jpg?im.resize=width:400');
      const params = parser.parse(url.searchParams);
      
      // Check for width and fit parameters
      const width = params.find(p => p.name === 'width');
      const fit = params.find(p => p.name === 'fit');
      
      expect(width).toBeDefined();
      expect(width?.value).toBe(400);
      expect(fit).toBeDefined();
      expect(fit?.value).toBe('scale-down');
    });
    
    it('should parse im=Composite native syntax', () => {
      const url = new URL('https://example.com/image.jpg?im=Composite,image=(url=https://example.com/watermark.png),placement=southeast');
      const params = parser.parse(url.searchParams);
      
      // The parser should merge overlay and gravity into a draw parameter
      const draw = params.find(p => p.name === 'draw');
      const gravity = params.find(p => p.name === 'gravity');
      
      expect(draw).toBeDefined();
      expect(gravity).toBeDefined();
      expect(gravity?.value).toBe('southeast');
      
      // Verify draw parameter contains correct URL
      if (draw) {
        const drawValue = JSON.parse(draw.value as string);
        expect(Array.isArray(drawValue)).toBe(true);
        expect(drawValue[0].url).toBe('https://example.com/watermark.png');
      }
    });
    
    it('should parse im.composite dot notation syntax', () => {
      const url = new URL('https://example.com/image.jpg?im.composite=placement:southeast,image:https://example.com/watermark.png,opacity:0.8,width:100');
      const params = parser.parse(url.searchParams);
      
      // Check for draw and gravity parameters
      const draw = params.find(p => p.name === 'draw');
      const gravity = params.find(p => p.name === 'gravity');
      
      expect(draw).toBeDefined();
      expect(gravity).toBeDefined();
      expect(gravity?.value).toBe('southeast');
      
      // Verify draw parameter contains correct properties
      if (draw) {
        const drawValue = JSON.parse(draw.value as string);
        expect(Array.isArray(drawValue)).toBe(true);
        expect(drawValue[0].url).toBe('https://example.com/watermark.png');
        expect(drawValue[0].opacity).toBe(0.8);
        expect(drawValue[0].width).toBe(100);
      }
    });
    
    it('should parse placement with gravity formatting', () => {
      const url = new URL('https://example.com/image.jpg?im=Composite,image=(url=https://example.com/watermark.png),placement=southeast');
      const params = parser.parse(url.searchParams);
      
      // Check that placement is parsed as gravity and will be formatted
      const gravity = params.find(p => p.name === 'gravity');
      
      expect(gravity).toBeDefined();
      expect(gravity?.value).toBe('southeast');
      // The formatter would convert this to 'bottom-right' but that happens in the registry later
    });
    
    it('should handle multiple watermark parameters correctly', () => {
      const url = new URL('https://example.com/image.jpg?im=Composite,image=(url=https://example.com/watermark.png),placement=southeast,opacity=0.8,width=200,dx=20,dy=20');
      const params = parser.parse(url.searchParams);
      
      // Check the draw parameter has all properties merged
      const draw = params.find(p => p.name === 'draw');
      
      expect(draw).toBeDefined();
      
      if (draw) {
        const drawValue = JSON.parse(draw.value as string);
        expect(Array.isArray(drawValue)).toBe(true);
        expect(drawValue[0].url).toBe('https://example.com/watermark.png');
        expect(drawValue[0].opacity).toBe(0.8);
        expect(drawValue[0].width).toBe(200);
        expect(drawValue[0].left).toBe(20);
        expect(drawValue[0].top).toBe(20);
      }
    });
    
    it('should handle gravity parameter directly', () => {
      const url = new URL('https://example.com/image.jpg?gravity=southeast');
      const params = parser.parse(url.searchParams);
      
      // Check gravity parameter is parsed directly
      const gravity = params.find(p => p.name === 'gravity');
      
      expect(gravity).toBeDefined();
      expect(gravity?.value).toBe('southeast');
    });
  });
});