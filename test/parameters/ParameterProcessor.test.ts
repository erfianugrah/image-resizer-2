import { describe, it, expect } from 'vitest';
import { DefaultParameterProcessor } from '../../src/parameters/ParameterProcessor';
import { TransformParameter } from '../../src/utils/path';
import mockLogger from '../mocks/logging';

describe('DefaultParameterProcessor', () => {
  
  const processor = new DefaultParameterProcessor(mockLogger);

  describe('process', () => {
    it('should process parameters from multiple sources with priority', () => {
      const parameters: TransformParameter[] = [
        {
          name: 'width',
          value: 300,
          source: 'path',
          priority: 80
        },
        {
          name: 'width',
          value: 800,
          source: 'url',
          priority: 70
        }
      ];

      const result = processor.process(parameters);
      
      // Path parameter has higher priority
      expect(result.width).toBe(300);
    });

    it('should validate and convert values', () => {
      const parameters: TransformParameter[] = [
        {
          name: 'quality',
          value: 200, // Out of valid range (1-100)
          source: 'url',
          priority: 70
        }
      ];

      const result = processor.process(parameters);
      
      // Should use default value (85) for invalid quality
      expect(result.quality).toBe(85);
    });

    it('should handle size code conversion', () => {
      const parameters: TransformParameter[] = [
        {
          name: 'f',
          value: 'xl',
          source: 'compact',
          priority: 70
        }
      ];

      const result = processor.process(parameters);
      
      // xl size code maps to 900px width
      expect(result.width).toBe(900);
      expect(result.f).toBeUndefined(); // f parameter should be removed
    });

    it('should normalize aspect ratio format', () => {
      const parameters: TransformParameter[] = [
        {
          name: 'aspect',
          value: '16-9', // Hyphen format
          source: 'url',
          priority: 70
        }
      ];

      const result = processor.process(parameters);
      
      // Should convert to colon format
      expect(result.aspect).toBe('16:9');
      
      // Should add ctx=true when aspect is present
      expect(result.ctx).toBe(true);
    });

    it('should respect explicitly set ctx parameter', () => {
      const parameters: TransformParameter[] = [
        {
          name: 'aspect',
          value: '16:9',
          source: 'url',
          priority: 70
        },
        {
          name: 'ctx',
          value: false,
          source: 'url',
          priority: 80
        }
      ];

      const result = processor.process(parameters);
      
      // ctx parameter has higher priority than auto-derived
      expect(result.ctx).toBe(false);
    });
  });
});