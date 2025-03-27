import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PathServiceImpl, createPathService } from '../../src/services/pathService';
import { ImageResizerConfig } from '../../src/config';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
};

describe('PathService', () => {
  let service: PathServiceImpl;
  
  beforeEach(() => {
    vi.clearAllMocks();
    service = new PathServiceImpl(mockLogger as any);
  });
  
  describe('normalizePath', () => {
    it('should handle empty paths', () => {
      expect(service.normalizePath('')).toBe('/');
      expect(service.normalizePath(null as any)).toBe('/');
      expect(service.normalizePath(undefined as any)).toBe('/');
    });
    
    it('should ensure paths start with /', () => {
      expect(service.normalizePath('images/test.jpg')).toBe('/images/test.jpg');
    });
    
    it('should normalize multiple slashes', () => {
      expect(service.normalizePath('/images//test.jpg')).toBe('/images/test.jpg');
      expect(service.normalizePath('//images///test.jpg')).toBe('/images/test.jpg');
    });
    
    it('should remove trailing slashes', () => {
      expect(service.normalizePath('/images/test.jpg/')).toBe('/images/test.jpg');
      expect(service.normalizePath('/images/test/')).toBe('/images/test');
    });
    
    it('should keep the root path as is', () => {
      expect(service.normalizePath('/')).toBe('/');
    });
  });
  
  describe('parseImagePath', () => {
    it('should handle empty paths', () => {
      const result = service.parseImagePath('');
      expect(result.imagePath).toBe('');
      expect(Object.keys(result.options).length).toBe(0);
    });
    
    it('should parse path without options', () => {
      const result = service.parseImagePath('/images/test.jpg');
      expect(result.imagePath).toBe('/images/test.jpg');
      expect(Object.keys(result.options).length).toBe(0);
    });
    
    it('should parse path with inline options', () => {
      const result = service.parseImagePath('/images/_width=800/_quality=80/test.jpg');
      expect(result.imagePath).toBe('/images/test.jpg');
      expect(result.options.width).toBe('800');
      expect(result.options.quality).toBe('80');
    });
    
    it('should handle options in various positions', () => {
      const result = service.parseImagePath('/_width=800/images/test.jpg/_quality=80');
      expect(result.imagePath).toBe('/images/test.jpg');
      expect(result.options.width).toBe('800');
      expect(result.options.quality).toBe('80');
    });
    
    it('should skip segments that are not valid options', () => {
      const result = service.parseImagePath('/images/_width=800/_invalid/test.jpg');
      expect(result.imagePath).toBe('/images/_invalid/test.jpg');
      expect(result.options.width).toBe('800');
    });
  });
  
  describe('extractDerivative', () => {
    it('should return null for empty path or derivatives', () => {
      expect(service.extractDerivative('', [])).toBeNull();
      expect(service.extractDerivative('/images/test.jpg', [])).toBeNull();
      expect(service.extractDerivative('', ['thumbnail'])).toBeNull();
    });
    
    it('should extract derivative from the path', () => {
      const result = service.extractDerivative('/images/thumbnail/test.jpg', ['thumbnail', 'preview']);
      expect(result).not.toBeNull();
      expect(result?.derivative).toBe('thumbnail');
      expect(result?.modifiedPath).toBe('/images/test.jpg');
    });
    
    it('should work with derivatives in any position', () => {
      const result1 = service.extractDerivative('/thumbnail/images/test.jpg', ['thumbnail']);
      expect(result1?.derivative).toBe('thumbnail');
      expect(result1?.modifiedPath).toBe('/images/test.jpg');
      
      const result2 = service.extractDerivative('/images/test.jpg/thumbnail', ['thumbnail']);
      expect(result2?.derivative).toBe('thumbnail');
      expect(result2?.modifiedPath).toBe('/images/test.jpg');
    });
    
    it('should return null if no derivative is found', () => {
      const result = service.extractDerivative('/images/test.jpg', ['thumbnail', 'preview']);
      expect(result).toBeNull();
    });
  });
  
  describe('parseQueryOptions', () => {
    function createSearchParams(queryString: string): URLSearchParams {
      return new URLSearchParams(queryString);
    }
    
    it('should parse numeric parameters', () => {
      const params = createSearchParams('width=800&height=600&quality=75&blur=5');
      const options = service.parseQueryOptions(params);
      
      expect(options.width).toBe(800);
      expect(options.height).toBe(600);
      expect(options.quality).toBe(75);
      expect(options.blur).toBe(5);
    });
    
    it('should handle auto value for supported parameters', () => {
      const params = createSearchParams('width=auto&height=auto&quality=auto');
      const options = service.parseQueryOptions(params);
      
      expect(options.width).toBe('auto');
      expect(options.height).toBe('auto');
      expect(options.quality).toBe('auto');
    });
    
    it('should parse string parameters', () => {
      const params = createSearchParams('format=webp&fit=contain&gravity=auto');
      const options = service.parseQueryOptions(params);
      
      expect(options.format).toBe('webp');
      expect(options.fit).toBe('contain');
      expect(options.gravity).toBe('auto');
    });
    
    it('should handle boolean parameters', () => {
      const params = createSearchParams('anim=true&flop=false&strip=true');
      const options = service.parseQueryOptions(params);
      
      expect(options.anim).toBe(true);
      expect(options.flop).toBe(false);
      expect(options.strip).toBe(true);
    });
    
    it('should parse flip parameter specially', () => {
      expect(service.parseQueryOptions(createSearchParams('flip=true')).flip).toBe(true);
      expect(service.parseQueryOptions(createSearchParams('flip=false')).flip).toBe(false);
      expect(service.parseQueryOptions(createSearchParams('flip=h')).flip).toBe('h');
      expect(service.parseQueryOptions(createSearchParams('flip=v')).flip).toBe('v');
      expect(service.parseQueryOptions(createSearchParams('flip=hv')).flip).toBe('hv');
      expect(service.parseQueryOptions(createSearchParams('flip=invalid')).flip).toBe('h');
    });
    
    it('should parse draw parameter as JSON', () => {
      const drawObject = { url: 'watermark.png', width: 200, opacity: 0.5 };
      const params = createSearchParams(`draw=${JSON.stringify(drawObject)}`);
      const options = service.parseQueryOptions(params);
      
      expect(Array.isArray(options.draw)).toBe(true);
      expect(options.draw[0].url).toBe('watermark.png');
      expect(options.draw[0].width).toBe(200);
      expect(options.draw[0].opacity).toBe(0.5);
    });
    
    it('should handle draw parameter with multiple items', () => {
      const drawArray = [
        { url: 'watermark1.png', width: 200 },
        { url: 'watermark2.png', width: 300 }
      ];
      const params = createSearchParams(`draw=${JSON.stringify(drawArray)}`);
      const options = service.parseQueryOptions(params);
      
      expect(Array.isArray(options.draw)).toBe(true);
      expect(options.draw.length).toBe(2);
      expect(options.draw[0].url).toBe('watermark1.png');
      expect(options.draw[1].url).toBe('watermark2.png');
    });
    
    it('should skip invalid draw parameter', () => {
      const params = createSearchParams('draw=not-json');
      const options = service.parseQueryOptions(params);
      
      expect(options.draw).toBeUndefined();
    });
  });
  
  describe('applyTransformations', () => {
    beforeEach(() => {
      // Create configuration with path transforms
      const config: Partial<ImageResizerConfig> = {
        pathTransforms: {
          'images': {
            prefix: 'cdn',
            removePrefix: true
          },
          'products': {
            prefix: 'store',
            removePrefix: true
          }
        }
      };
      
      service.configure(config as ImageResizerConfig);
    });
    
    it('should return the original path if no transformations match', () => {
      expect(service.applyTransformations('/unknown/test.jpg')).toBe('/unknown/test.jpg');
    });
    
    it('should remove prefix when configured', () => {
      expect(service.applyTransformations('/images/test.jpg')).toBe('/cdn/test.jpg');
      expect(service.applyTransformations('/products/item.jpg')).toBe('/store/item.jpg');
    });
    
    it('should handle paths with multiple segments', () => {
      expect(service.applyTransformations('/images/folder/test.jpg')).toBe('/cdn/folder/test.jpg');
    });
    
    it('should handle custom configuration override', () => {
      const customConfig = {
        pathTransforms: {
          'images': {
            prefix: 'custom',
            removePrefix: true
          }
        }
      };
      
      expect(service.applyTransformations('/images/test.jpg', customConfig))
        .toBe('/custom/test.jpg');
    });
    
    it('should not add prefix if transform has empty prefix', () => {
      const customConfig = {
        pathTransforms: {
          'images': {
            prefix: '',
            removePrefix: true
          }
        }
      };
      
      expect(service.applyTransformations('/images/test.jpg', customConfig))
        .toBe('/test.jpg');
    });
  });
  
  describe('factory function', () => {
    it('should create a configured service', () => {
      const config = {
        pathTransforms: {
          'test': {
            prefix: 'prefix',
            removePrefix: true
          }
        }
      };
      
      const service = createPathService(mockLogger as any, config as any);
      
      expect(service).toBeInstanceOf(PathServiceImpl);
      expect(service.applyTransformations('/test/file.jpg')).toBe('/prefix/file.jpg');
    });
    
    it('should create service without configuration', () => {
      const service = createPathService(mockLogger as any);
      
      expect(service).toBeInstanceOf(PathServiceImpl);
      expect(service.applyTransformations('/test/file.jpg')).toBe('/test/file.jpg');
    });
  });
});