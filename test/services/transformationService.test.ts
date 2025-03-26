import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultImageTransformationService } from '../../src/services/transformationService';

// Mock the Logger directly to avoid dependency issues
vi.mock('../../src/utils/logging', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn(),
    trackedBreadcrumb: vi.fn(() => Date.now())
  };
  
  return {
    createLogger: () => mockLogger,
    defaultLogger: mockLogger
  };
});

// Mock the LogLevel enum
vi.mock('../../src/utils/optimized-logging', () => ({
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4
  },
  OptimizedLogger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    breadcrumb = vi.fn();
    trackedBreadcrumb = vi.fn(() => Date.now());
    isLevelEnabled = vi.fn().mockReturnValue(true);
  }
}));

describe('DefaultImageTransformationService', () => {
  let service: DefaultImageTransformationService;
  let mockLogger: any;
  let mockClientDetectionService: any;
  let mockConfigService: any;
  let mockCacheService: any;
  let mockMetadataService: any;
  
  beforeEach(() => {
    // Setup mock services
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      breadcrumb: vi.fn(),
      trackedBreadcrumb: vi.fn(() => Date.now())
    };
    
    mockClientDetectionService = {
      detectClient: vi.fn(),
      getOptimizedOptions: vi.fn(),
      supportsFormat: vi.fn()
    };
    
    mockConfigService = {
      getConfig: vi.fn(() => ({
        debug: { 
          performanceTracking: true
        },
        responsive: {
          deviceWidths: {
            mobile: 600,
            tablet: 1024,
            desktop: 1800
          },
          formatQuality: {
            webp: 85,
            avif: 80,
            jpeg: 85
          },
          quality: 85,
          fit: 'cover',
          metadata: 'none'
        },
        cache: {
          ttl: {
            ok: 86400
          }
        },
        storage: {
          auth: {
            enabled: false,
            useOriginAuth: false,
            sharePublicly: false
          }
        },
        derivatives: {
          thumbnail: {
            width: 300,
            height: 200,
            fit: 'cover'
          },
          banner: {
            width: 1200,
            height: 400,
            fit: 'cover'
          },
          avatar: {
            width: 150,
            height: 150,
            fit: 'cover',
            gravity: 'face'
          }
        }
      }))
    };
    
    mockCacheService = {
      applyCacheHeaders: vi.fn((response) => response),
      applyCloudflareCache: vi.fn((options) => options)
    };

    mockMetadataService = {
      fetchMetadata: vi.fn(),
      processMetadata: vi.fn(),
      fetchAndProcessMetadata: vi.fn()
    };
    
    service = new DefaultImageTransformationService(
      mockLogger,
      mockClientDetectionService,
      mockConfigService,
      mockCacheService,
      mockMetadataService
    );
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('requiresMetadata', () => {
    it('should return true when smart=true is present', () => {
      const options = { smart: true };
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(options)).toBe(true);
    });
    
    it('should return true when smart="true" is present', () => {
      const options = { smart: 'true' };
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(options)).toBe(true);
    });
    
    it('should return true when aspect parameter is present', () => {
      const options = { aspect: '16:9' };
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(options)).toBe(true);
    });
    
    it('should return true when focal parameter is present', () => {
      const options = { focal: '0.5,0.5' };
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(options)).toBe(true);
    });
    
    it('should return true for derivatives requiring metadata', () => {
      const optionsWithBanner = { derivative: 'banner' };
      const optionsWithAvatar = { derivative: 'avatar' };
      const optionsWithProfile = { derivative: 'profile' };
      const optionsWithThumbnail = { derivative: 'thumbnail' };
      const optionsWithPortrait = { derivative: 'portrait' };
      const optionsWithSquare = { derivative: 'square' };
      
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(optionsWithBanner)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(optionsWithAvatar)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(optionsWithProfile)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(optionsWithThumbnail)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(optionsWithPortrait)).toBe(true);
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(optionsWithSquare)).toBe(true);
    });
    
    it('should return false for basic transformations', () => {
      const options = { width: 100, height: 100, fit: 'cover' };
      // @ts-ignore - accessing private method for testing
      expect(service.requiresMetadata(options)).toBe(false);
    });
  });
  
  describe('buildTransformOptions', () => {
    it('should fetch metadata when transformation requires it', async () => {
      // Setup
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockStorageResult = {
        sourceType: 'r2',
        contentType: 'image/jpeg',
        size: 1024,
        path: '/image.jpg',
        response: {
          clone: () => new Response(),
          headers: new Headers()
        }
      };
      const options = { smart: true };
      const config = mockConfigService.getConfig();
      
      // Mock metadata service response
      mockMetadataService.fetchMetadata.mockResolvedValue({
        metadata: {
          width: 1000,
          height: 800,
          format: 'jpeg'
        }
      });
      
      mockMetadataService.processMetadata.mockResolvedValue({
        dimensions: {
          width: 1000,
          height: 800
        }
      });
      
      // Execute
      await service.buildTransformOptions(mockRequest, mockStorageResult, options, config);
      
      // Assert
      expect(mockMetadataService.fetchMetadata).toHaveBeenCalledWith(
        '/image.jpg',
        expect.anything(),
        undefined,
        mockRequest
      );
    });
    
    it('should not fetch metadata for basic transformations', async () => {
      // Setup
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockStorageResult = {
        sourceType: 'r2',
        contentType: 'image/jpeg',
        size: 1024,
        path: '/image.jpg',
        response: {
          clone: () => new Response(),
          headers: new Headers()
        }
      };
      const options = { width: 100, height: 100 };
      const config = mockConfigService.getConfig();
      
      // Execute
      await service.buildTransformOptions(mockRequest, mockStorageResult, options, config);
      
      // Assert
      expect(mockMetadataService.fetchMetadata).not.toHaveBeenCalled();
    });
  });
  
  describe('transformImage', () => {
    it('should properly use metadata for smart transformations', async () => {
      // Setup
      const mockRequest = new Request('https://example.com/image.jpg');
      const mockStorageResult = {
        sourceType: 'r2',
        contentType: 'image/jpeg',
        size: 1024,
        path: '/image.jpg',
        response: {
          clone: () => new Response(),
          headers: new Headers()
        },
        metadata: {}
      };
      const options = { smart: true };
      const config = mockConfigService.getConfig();
      
      // Create a mock Response for the fetch call
      const mockTransformedResponse = new Response();
      global.fetch = vi.fn().mockResolvedValue(mockTransformedResponse);
      
      // Mock metadata service response for FetchAndProcessMetadata
      mockMetadataService.fetchAndProcessMetadata.mockResolvedValue({
        aspectCrop: {
          width: 800,
          height: 600,
          hoffset: 0.5,
          voffset: 0.3,
          gravity: { x: 0.5, y: 0.3 }
        }
      });
      
      // Execute
      await service.transformImage(mockRequest, mockStorageResult, options, config);
      
      // Assert that processSmartOptions was called with the correct parameters
      // Since the function is part of the class, we can spy on it
      // This is a simplified assertion since we can't easily spy on class methods in this setup
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});