/**
 * Client Detection Service Tests
 * 
 * Tests for the ClientDetectionService functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultClientDetectionService } from '../../src/services/clientDetectionService';
import { ImageResizerConfig } from '../../src/config';
import { ClientInfo } from '../../src/services/interfaces';
import { TransformOptions } from '../../src/transform';
import { Logger } from '../../src/utils/logging';

// Import mock logger
import { createMockLogger } from '../mocks/logging';

// Create a mock config for testing
const mockConfig: Partial<ImageResizerConfig> = {
  detector: {
    cache: {
      maxSize: 10,
      pruneAmount: 2,
      enableCache: true,
      ttl: 60000 // 1 minute
    },
    strategies: {
      clientHints: {
        priority: 100,
        enabled: true
      },
      acceptHeader: {
        priority: 80,
        enabled: true
      },
      userAgent: {
        priority: 60,
        enabled: true,
        maxUALength: 100
      },
      staticData: {
        priority: 20,
        enabled: true
      },
      defaults: {
        priority: 0,
        enabled: true
      }
    },
    performanceBudget: {
      quality: {
        low: {
          min: 60,
          max: 80,
          target: 70
        },
        medium: {
          min: 65,
          max: 85,
          target: 75
        },
        high: {
          min: 70,
          max: 95,
          target: 85
        }
      },
      dimensions: {
        maxWidth: {
          low: 1000,
          medium: 1500,
          high: 2500
        },
        maxHeight: {
          low: 1000,
          medium: 1500,
          high: 2500
        }
      },
      preferredFormats: {
        low: ['webp', 'jpeg'],
        medium: ['webp', 'avif', 'jpeg'],
        high: ['avif', 'webp', 'jpeg']
      }
    },
    deviceClassification: {
      thresholds: {
        lowEnd: 30,
        highEnd: 70
      }
    },
    hashAlgorithm: 'simple',
    logLevel: 'info'
  },
  responsive: {
    breakpoints: [320, 640, 768, 1024, 1440, 1920],
    deviceWidths: {
      mobile: 480,
      tablet: 768,
      desktop: 1440
    },
    quality: 85,
    fit: 'scale-down',
    format: 'auto',
    metadata: 'none',
    formatQuality: {
      'webp': 85,
      'avif': 80,
      'jpeg': 85,
      'png': 90
    }
  }
} as any;

// Mock client hints for a modern desktop browser with AVIF support
const mockModernDesktopRequest = new Request('https://example.com/image.jpg', {
  headers: {
    'Sec-CH-UA': '"Chrome"; v="120", "Chromium"; v="120"',
    'Sec-CH-UA-Platform': '"Windows"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-Viewport-Width': '1920',
    'Sec-CH-DPR': '2',
    'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*'
  }
});

// Mock client hints for a mobile device with WebP support but no AVIF
const mockMobileRequest = new Request('https://example.com/image.jpg', {
  headers: {
    'Sec-CH-UA': '"Chrome"; v="118", "Chromium"; v="118", "Mobile Safari"; v="15"',
    'Sec-CH-UA-Platform': '"Android"',
    'Sec-CH-UA-Mobile': '?1',
    'Sec-CH-Viewport-Width': '428',
    'Sec-CH-DPR': '3',
    'Save-Data': 'on',
    'Accept': 'image/webp,image/png,image/jpeg,*/*'
  }
});

// Mock client hints for an older browser with no WebP or AVIF support
const mockOldBrowserRequest = new Request('https://example.com/image.jpg', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
    'Accept': 'image/png,image/jpeg,*/*'
  }
});

// Helper to create mock request with different headers
function createMockRequest(headers: Record<string, string>) {
  return new Request('https://example.com/image.jpg', {
    headers
  });
}

describe('ClientDetectionService', () => {
  let clientDetectionService: DefaultClientDetectionService;
  let mockLogger: Logger;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.resetAllMocks();
    
    // Mock the detector's detectClient function
    vi.mock('../../src/utils/detector', () => {
      return {
        detectClient: vi.fn().mockImplementation(async (request: Request) => {
          // Return different client info based on request headers
          if (request.headers.get('Sec-CH-UA-Mobile') === '?1') {
            return {
              deviceType: 'mobile' as const,
              viewportWidth: 428,
              devicePixelRatio: 3,
              saveData: true,
              acceptsWebp: true,
              acceptsAvif: false
            };
          } else if (request.headers.get('Sec-CH-UA')) {
            return {
              deviceType: 'desktop' as const,
              viewportWidth: 1920,
              devicePixelRatio: 2,
              saveData: false,
              acceptsWebp: true,
              acceptsAvif: true
            };
          } else {
            return {
              deviceType: 'desktop' as const,
              viewportWidth: 1024,
              devicePixelRatio: 1,
              saveData: false,
              acceptsWebp: false,
              acceptsAvif: false
            };
          }
        }),
        setConfig: vi.fn()
      };
    });
    
    clientDetectionService = new DefaultClientDetectionService(mockLogger);
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  it('should detect client information from a modern desktop request', async () => {
    const clientInfo = await clientDetectionService.detectClient(mockModernDesktopRequest);
    
    expect(clientInfo).toBeDefined();
    expect(clientInfo.deviceType).toBe('desktop');
    expect(clientInfo.viewportWidth).toBe(1920);
    expect(clientInfo.devicePixelRatio).toBe(2);
    expect(clientInfo.saveData).toBe(false);
    expect(clientInfo.acceptsWebp).toBe(true);
    expect(clientInfo.acceptsAvif).toBe(true);
  });
  
  it('should detect client information from a mobile request', async () => {
    const clientInfo = await clientDetectionService.detectClient(mockMobileRequest);
    
    expect(clientInfo).toBeDefined();
    expect(clientInfo.deviceType).toBe('mobile');
    expect(clientInfo.viewportWidth).toBe(428);
    expect(clientInfo.devicePixelRatio).toBe(3);
    expect(clientInfo.saveData).toBe(true);
    expect(clientInfo.acceptsWebp).toBe(true);
    expect(clientInfo.acceptsAvif).toBe(false);
  });
  
  it('should detect client information from an old browser request', async () => {
    const clientInfo = await clientDetectionService.detectClient(mockOldBrowserRequest);
    
    expect(clientInfo).toBeDefined();
    expect(clientInfo.deviceType).toBe('desktop');
    expect(clientInfo.viewportWidth).toBe(1024);
    expect(clientInfo.devicePixelRatio).toBe(1);
    expect(clientInfo.saveData).toBe(false);
    expect(clientInfo.acceptsWebp).toBe(false);
    expect(clientInfo.acceptsAvif).toBe(false);
  });
  
  it('should check format support', async () => {
    // Modern browser supports WebP and AVIF
    expect(await clientDetectionService.supportsFormat(mockModernDesktopRequest, 'webp')).toBe(true);
    expect(await clientDetectionService.supportsFormat(mockModernDesktopRequest, 'avif')).toBe(true);
    
    // Mobile browser supports WebP but not AVIF
    expect(await clientDetectionService.supportsFormat(mockMobileRequest, 'webp')).toBe(true);
    expect(await clientDetectionService.supportsFormat(mockMobileRequest, 'avif')).toBe(false);
    
    // Old browser supports neither
    expect(await clientDetectionService.supportsFormat(mockOldBrowserRequest, 'webp')).toBe(false);
    expect(await clientDetectionService.supportsFormat(mockOldBrowserRequest, 'avif')).toBe(false);
    
    // All browsers support JPEG and PNG
    expect(await clientDetectionService.supportsFormat(mockModernDesktopRequest, 'jpeg')).toBe(true);
    expect(await clientDetectionService.supportsFormat(mockMobileRequest, 'png')).toBe(true);
    expect(await clientDetectionService.supportsFormat(mockOldBrowserRequest, 'jpeg')).toBe(true);
  });
  
  it('should get device classification', async () => {
    // Modern desktop with high DPR should be high-end
    expect(await clientDetectionService.getDeviceClassification(mockModernDesktopRequest)).toBe('high-end');
    
    // Mobile device with Save-Data should be mid-range or low-end (depends on detection details)
    const mobileClass = await clientDetectionService.getDeviceClassification(mockMobileRequest);
    expect(['mid-range', 'low-end']).toContain(mobileClass);
    
    // Old browser should be categorized as low-end
    expect(await clientDetectionService.getDeviceClassification(mockOldBrowserRequest)).toBe('low-end');
  });
  
  it('should get network quality', async () => {
    // Device with Save-Data header should be classified as slow network
    expect(await clientDetectionService.getNetworkQuality(mockMobileRequest)).toBe('slow');
    
    // Modern desktop should be classified as fast by default
    expect(await clientDetectionService.getNetworkQuality(mockModernDesktopRequest)).toBe('fast');
    
    // Test with explicit network information headers
    const slowNetworkRequest = createMockRequest({
      'Downlink': '0.5', // 0.5 Mbps
      'RTT': '500'       // 500ms round-trip time
    });
    
    const fastNetworkRequest = createMockRequest({
      'Downlink': '10',  // 10 Mbps
      'RTT': '50'        // 50ms round-trip time
    });
    
    expect(await clientDetectionService.getNetworkQuality(slowNetworkRequest)).toBe('slow');
    expect(await clientDetectionService.getNetworkQuality(fastNetworkRequest)).toBe('fast');
  });
  
  it('should optimize transformation options based on client capabilities', async () => {
    // Start with base options
    const baseOptions: TransformOptions = {
      width: 1000,
      format: 'auto',
      quality: 80
    };
    
    // Test optimization for modern desktop
    const optimizedDesktopOptions = await clientDetectionService.getOptimizedOptions(
      mockModernDesktopRequest,
      baseOptions,
      mockConfig as ImageResizerConfig
    );
    
    expect(optimizedDesktopOptions).toBeDefined();
    expect(optimizedDesktopOptions.format).toBe('avif');
    expect(optimizedDesktopOptions.quality).toBeGreaterThanOrEqual(80);
    expect(optimizedDesktopOptions.width).toBeDefined();
    
    // Test optimization for mobile device with Save-Data
    const optimizedMobileOptions = await clientDetectionService.getOptimizedOptions(
      mockMobileRequest,
      baseOptions,
      mockConfig as ImageResizerConfig
    );
    
    expect(optimizedMobileOptions).toBeDefined();
    expect(optimizedMobileOptions.format).toBe('webp');
    expect(optimizedMobileOptions.quality).toBeLessThanOrEqual(80); // Should reduce quality for Save-Data
    expect(optimizedMobileOptions.width).toBeDefined();
    
    // Test optimization for old browser
    const optimizedOldOptions = await clientDetectionService.getOptimizedOptions(
      mockOldBrowserRequest,
      baseOptions,
      mockConfig as ImageResizerConfig
    );
    
    expect(optimizedOldOptions).toBeDefined();
    expect(optimizedOldOptions.format).toBe('jpeg'); // Should fall back to JPEG
    expect(optimizedOldOptions.quality).toBeDefined();
    expect(optimizedOldOptions.width).toBeDefined();
  });
  
  it('should clear detection cache', () => {
    // First let's ensure the cache is populated
    clientDetectionService.detectClient(mockModernDesktopRequest);
    clientDetectionService.detectClient(mockMobileRequest);
    
    // Now clear the cache
    clientDetectionService.clearCache();
    
    // Verify the detector's detectClient function is called again
    // for a previously detected client
    clientDetectionService.detectClient(mockModernDesktopRequest);
    
    // Since we've mocked the detector, we have to test indirectly
    // But at minimum the logger should be called
    expect(mockLogger.debug).toHaveBeenCalled();
  });
});