import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPathService } from '../../src/services/pathService';
import { createDetectorService } from '../../src/services/detectorServiceFactory';
import { ImageResizerConfig } from '../../src/config';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
};

describe('Service Integration Tests', () => {
  // Create our services
  const pathService = createPathService(mockLogger as any);
  const detectorService = createDetectorService({} as ImageResizerConfig, mockLogger as any);
  
  // Helper to create mock requests
  function createMockRequest(headers: Record<string, string> = {}, url: string = 'https://example.com/image.jpg'): Request {
    const mockHeaders = new Headers();
    Object.entries(headers).forEach(([key, value]) => {
      mockHeaders.append(key, value);
    });
    
    return {
      url,
      headers: mockHeaders,
      method: 'GET',
      bodyUsed: false,
      body: null,
      cache: 'default',
      credentials: 'same-origin',
      destination: '',
      integrity: '',
      keepalive: false,
      mode: 'cors',
      redirect: 'follow',
      referrer: '',
      referrerPolicy: '',
      signal: new AbortController().signal,
      clone: () => createMockRequest(headers, url),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('')
    } as Request;
  }
  
  describe('Path and Detector Services Together', () => {
    it('should process a request with both services', async () => {
      // Create a request with specific headers
      const request = createMockRequest({
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Accept': 'image/webp,image/jpeg,*/*'
      }, 'https://example.com/images/_width=800/product/photo.jpg');
      
      // 1. Parse the path with PathService
      const url = new URL(request.url);
      const parsedPath = pathService.parseImagePath(url.pathname);
      
      // 2. Get client information with DetectorService
      const clientInfo = await detectorService.detectClient(request);
      
      // 3. Create transformation options based on path and client info
      const baseOptions = {
        // Include options from path
        width: parseInt(parsedPath.options.width || '0', 10) || undefined,
        
        // Add options from query parameters
        ...pathService.parseQueryOptions(url.searchParams)
      };
      
      // 4. Get optimized options based on client detection
      const optimizedOptions = await detectorService.getOptimizedOptions(
        request,
        baseOptions,
        {} as ImageResizerConfig
      );
      
      // Verify results
      expect(parsedPath.imagePath).toBe('/images/product/photo.jpg');
      expect(parsedPath.options.width).toBe('800');
      
      expect(clientInfo.deviceType).toBe('mobile');
      expect(clientInfo.acceptsWebp).toBe(true);
      
      // Check that optimized options include both path options and client-specific optimizations
      expect(optimizedOptions.width).toBe(800);
      expect(optimizedOptions.format).toBeDefined();
      
      // Format should be optimized for client
      if (clientInfo.acceptsWebp) {
        expect(optimizedOptions.format).toBe('webp');
      }
    });
    
    it('should handle derivatives and device classification', async () => {
      // Create a request with specific headers
      const request = createMockRequest({
        'User-Agent': 'Mozilla/5.0 Chrome/90.0.4430.212',
        'Accept': 'image/webp,image/jpeg,*/*',
        'Save-Data': 'on'
      }, 'https://example.com/images/thumbnail/product/photo.jpg');
      
      // 1. Parse the path with PathService
      const url = new URL(request.url);
      const derivatives = ['thumbnail', 'preview', 'large'];
      const derivativeResult = pathService.extractDerivative(url.pathname, derivatives);
      
      // 2. Get device classification with DetectorService
      const deviceClass = await detectorService.getDeviceClassification(request);
      const networkQuality = await detectorService.getNetworkQuality(request);
      
      // Verify results
      expect(derivativeResult).not.toBeNull();
      expect(derivativeResult?.derivative).toBe('thumbnail');
      expect(derivativeResult?.modifiedPath).toBe('/images/product/photo.jpg');
      
      // Device class should be defined
      expect(deviceClass).toBeDefined();
      
      // Network quality should be slow due to Save-Data header
      expect(networkQuality).toBe('slow');
    });
    
    it('should apply path transformations and format selection together', async () => {
      // Setup path service with transformations
      const configuredPathService = createPathService(mockLogger as any, {
        pathTransforms: {
          'images': {
            prefix: 'cdn',
            removePrefix: true
          }
        }
      } as any);
      
      // Create a request
      const request = createMockRequest({
        'User-Agent': 'Mozilla/5.0 Chrome/90.0.4430.212',
        'Accept': 'image/avif,image/webp,image/jpeg,*/*'
      }, 'https://example.com/images/product/photo.jpg');
      
      // 1. Apply path transformation
      const url = new URL(request.url);
      const transformedPath = configuredPathService.applyTransformations(url.pathname);
      
      // 2. Check format support with detector service
      const supportsAvif = await detectorService.supportsFormat(request, 'avif');
      const supportsWebp = await detectorService.supportsFormat(request, 'webp');
      
      // 3. Select best format based on support
      let selectedFormat = 'jpeg'; // Default fallback
      if (supportsAvif) {
        selectedFormat = 'avif';
      } else if (supportsWebp) {
        selectedFormat = 'webp';
      }
      
      // Verify results
      expect(transformedPath).toBe('/cdn/product/photo.jpg');
      expect(supportsWebp).toBe(true);
      expect(selectedFormat).toMatch(/^(avif|webp)$/); // Should be either avif or webp
    });
  });
});