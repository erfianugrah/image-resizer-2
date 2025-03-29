import { describe, it, expect } from 'vitest';
import { ParameterParserFactory } from '../../src/parameters/ParameterParserFactory';
import { StandardParser } from '../../src/parameters/parsers/StandardParser';
import { CompactParser } from '../../src/parameters/parsers/CompactParser';
import { PathParser } from '../../src/parameters/parsers/PathParser';
import { AkamaiParser } from '../../src/parameters/parsers/AkamaiParser';
import mockLogger from '../mocks/logging';

describe('ParameterParserFactory', () => {
  
  const factory = new ParameterParserFactory(mockLogger);

  describe('getParsers', () => {
    it('should always include the standard parser', () => {
      const request = new Request('https://example.com/images/myimage.jpg');
      const parsers = factory.getParsers(request);
      
      expect(parsers.length).toBe(1);
      expect(parsers[0]).toBeInstanceOf(StandardParser);
    });

    it('should include path parser for URLs with path parameters', () => {
      const request = new Request('https://example.com/images/_width=300/myimage.jpg');
      const parsers = factory.getParsers(request);
      
      const hasPathParser = parsers.some(p => p instanceof PathParser);
      expect(hasPathParser).toBe(true);
    });

    it('should include compact parser for URLs with compact parameters', () => {
      const request = new Request('https://example.com/images/myimage.jpg?w=800&h=600&r=16:9');
      const parsers = factory.getParsers(request);
      
      const hasCompactParser = parsers.some(p => p instanceof CompactParser);
      expect(hasCompactParser).toBe(true);
    });

    it('should include Akamai parser for URLs with Akamai parameters', () => {
      const request = new Request('https://example.com/images/myimage.jpg?im=AspectCrop=(16,9)');
      const parsers = factory.getParsers(request);
      
      const hasAkamaiParser = parsers.some(p => p instanceof AkamaiParser);
      expect(hasAkamaiParser).toBe(true);
    });

    it('should include multiple parsers for complex URLs', () => {
      const request = new Request('https://example.com/images/_width=300/myimage.jpg?w=800&h=600&im=Resize=(400,300)');
      const parsers = factory.getParsers(request);
      
      // Should include StandardParser, PathParser, CompactParser, and AkamaiParser
      expect(parsers.length).toBe(4);
      
      const hasStandardParser = parsers.some(p => p instanceof StandardParser);
      const hasPathParser = parsers.some(p => p instanceof PathParser);
      const hasCompactParser = parsers.some(p => p instanceof CompactParser);
      const hasAkamaiParser = parsers.some(p => p instanceof AkamaiParser);
      
      expect(hasStandardParser).toBe(true);
      expect(hasPathParser).toBe(true);
      expect(hasCompactParser).toBe(true);
      expect(hasAkamaiParser).toBe(true);
    });
  });
});