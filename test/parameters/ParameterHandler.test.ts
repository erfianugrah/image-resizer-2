import { describe, it, expect } from 'vitest';
import { ParameterHandler } from '../../src/parameters/ParameterHandler';
import mockLogger from '../mocks/logging';

describe('ParameterHandler', () => {
  
  const parameterHandler = new ParameterHandler(mockLogger);

  describe('handleRequest', () => {
    it('should handle standard URL parameters', async () => {
      const request = new Request('https://example.com/images/myimage.jpg?width=800&height=600&quality=90');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.quality).toBe(90);
    });

    it('should handle path parameters', async () => {
      const request = new Request('https://example.com/images/_width=300/_quality=80/myimage.jpg');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.width).toBe(300);
      expect(result.quality).toBe(80);
    });

    it('should handle compact parameters', async () => {
      const request = new Request('https://example.com/images/myimage.jpg?w=800&h=600&r=16:9');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.aspect).toBe('16:9');
    });

    it('should handle size code parameters', async () => {
      const request = new Request('https://example.com/images/myimage.jpg?f=m');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.width).toBe(700); // m size code is 700px width
    });

    it('should handle Akamai parameters', async () => {
      const request = new Request('https://example.com/images/myimage.jpg?im=AspectCrop=(16,9)');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.aspect).toBe('16:9');
      expect(result.ctx).toBe(true);
    });

    it('should handle multiple parameter formats in the same request', async () => {
      const request = new Request('https://example.com/images/_width=300/myimage.jpg?quality=80&aspect=16:9&f=m');
      const result = await parameterHandler.handleRequest(request);
      
      // Path parameter has higher priority than query parameter, so width=300 should win over f=m (700px)
      expect(result.width).toBe(300);
      expect(result.quality).toBe(80);
      expect(result.aspect).toBe('16:9');
    });

    it('should handle the ctx parameter (new name for smart)', async () => {
      const request = new Request('https://example.com/images/myimage.jpg?ctx=true');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.ctx).toBe(true);
    });

    it('should handle the s parameter (compact form for ctx/smart)', async () => {
      const request = new Request('https://example.com/images/myimage.jpg?s=true');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.ctx).toBe(true);
    });

    it('should handle the legacy smart parameter', async () => {
      const request = new Request('https://example.com/images/myimage.jpg?smart=true');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.ctx).toBe(true);
    });

    it('should automatically set ctx=true when aspect is specified', async () => {
      const request = new Request('https://example.com/images/myimage.jpg?aspect=16:9');
      const result = await parameterHandler.handleRequest(request);
      
      expect(result.aspect).toBe('16:9');
      expect(result.ctx).toBe(true);
    });
  });
});
