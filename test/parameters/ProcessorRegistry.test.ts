import { describe, it, expect } from 'vitest';
import { ProcessorRegistry } from '../../src/parameters/ProcessorRegistry';
import mockLogger from '../mocks/logging';
import { TransformParameter } from '../../src/utils/path';

describe('ProcessorRegistry', () => {
  const registry = new ProcessorRegistry(mockLogger);
  
  describe('processParameter', () => {
    it('should process size code parameters', () => {
      const param: TransformParameter = {
        name: 'f',
        value: 'm',
        source: 'compact',
        priority: 60
      };
      
      const result: Record<string, unknown> = {};
      registry.processParameter(param, result);
      
      expect(result.width).toBe(700);
    });
    
    it('should process aspect ratio parameters', () => {
      const param: TransformParameter = {
        name: 'aspect',
        value: '16-9',
        source: 'url',
        priority: 70
      };
      
      const result: Record<string, unknown> = {};
      registry.processParameter(param, result);
      
      expect(result.aspect).toBe('16:9');
      expect(result.ctx).toBe(true);
    });
    
    it('should process draw parameters', () => {
      const param: TransformParameter = {
        name: 'draw',
        value: JSON.stringify([
          {
            url: 'https://example.com/watermark.png',
            width: 100,
            height: 50,
            opacity: 0.5
          }
        ]),
        source: 'url',
        priority: 70
      };
      
      const result: Record<string, unknown> = {};
      registry.processParameter(param, result);
      
      expect(result.draw).toBeInstanceOf(Array);
      expect((result.draw as any[])[0].url).toBe('https://example.com/watermark.png');
      expect((result.draw as any[])[0].width).toBe(100);
      expect((result.draw as any[])[0].height).toBe(50);
      expect((result.draw as any[])[0].opacity).toBe(0.5);
    });
    
    it('should handle regular parameters', () => {
      const param: TransformParameter = {
        name: 'width',
        value: 800,
        source: 'url',
        priority: 70
      };
      
      const result: Record<string, unknown> = {};
      registry.processParameter(param, result);
      
      expect(result.width).toBe(800);
    });
  });
});