import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('../../src/utils/logging', () => ({
  defaultLogger: {
    debug: vi.fn(),
    breadcrumb: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  Logger: vi.fn()
}));

vi.mock('../../src/utils/detector', () => {
  return {
    detector: {
      detect: vi.fn().mockResolvedValue({
        browser: { 
          name: 'chrome', 
          version: '96.0', 
          mobile: false,
          source: 'user-agent'
        },
        formats: { 
          webp: true, 
          avif: true, 
          source: 'user-agent'
        },
        network: {
          tier: 'high',
          description: 'Fast connection',
          estimated: false
        },
        device: {
          class: 'high-end',
          description: 'Desktop device',
          estimated: false
        },
        performance: {
          quality: {
            min: 75,
            max: 95,
            target: 85
          },
          maxWidth: 2400,
          maxHeight: 2400,
          preferredFormat: 'avif',
          dpr: 2
        },
        clientHints: {
          dpr: 2,
          viewportWidth: 1920
        },
        detectionTime: 5
      }),
      getOptimizedOptions: vi.fn().mockImplementation((request, options) => {
        return Promise.resolve({
          ...options,
          format: 'avif',
          quality: 85,
          optimizedWidth: options.width || 1200,
          __detectionMetrics: {
            browser: 'chrome 96.0',
            deviceClass: 'high-end',
            networkQuality: 'high',
            detectionTime: 5,
            source: {
              browser: 'user-agent',
              formats: 'user-agent'
            }
          }
        });
      }),
      setLogger: vi.fn()
    },
    setLogger: vi.fn()
  };
});

vi.mock('../../src/cache', () => ({
  applyCloudflareCache: vi.fn().mockImplementation((options) => options)
}));

// Import transform code that uses the detector
import { buildTransformOptions } from '../../src/transform';
import { detector } from '../../src/utils/detector';

// Create mock objects for testing
const mockRequest = {
  url: 'https://example.com/image.jpg',
  headers: new Headers({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/png,image/jpeg',
    'DPR': '2.0'
  })
};

const mockStorageResult = {
  path: '/image.jpg',
  contentType: 'image/jpeg',
  size: 1024 * 1024, // 1MB image
  sourceType: 'storage',
  response: new Response(new ArrayBuffer(1024), {
    headers: {
      'Content-Type': 'image/jpeg'
    }
  })
};

const mockConfig = {
  responsive: {
    deviceWidths: {
      mobile: 500,
      tablet: 800,
      desktop: 1200
    },
    breakpoints: [320, 640, 1024, 1280, 1600, 1920],
    format: 'jpeg',
    quality: 80,
    fit: 'cover',
    metadata: 'none',
    formatQuality: {
      jpeg: 80,
      webp: 85,
      avif: 80
    },
    deviceDetection: {
      mobileRegex: 'Mobile|Android|iPhone|iPad|iPod',
      tabletRegex: 'iPad|Android(?!.*Mobile)'
    }
  },
  derivatives: {
    'thumbnail': {
      width: 300,
      height: 300,
      fit: 'cover',
      quality: 85,
    }
  },
  storage: {
    priority: ['r2', 'http'],
    auth: {
      enabled: false,
      useOriginAuth: false,
      sharePublicly: false
    }
  },
  cache: {
    ttl: {
      ok: 86400
    }
  }
};

describe('Transform Integration with Detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses detector in buildTransformOptions', async () => {
    const options = { width: 800, format: 'auto' };
    
    const result = await buildTransformOptions(
      mockRequest as any,
      mockStorageResult as any,
      options,
      mockConfig as any
    );
    
    // Verify detector was used
    expect(detector.getOptimizedOptions).toHaveBeenCalledWith(
      mockRequest,
      expect.objectContaining({ width: 800, format: 'auto' })
    );
    
    // Check that the detector's suggestions were applied
    expect(result.format).toBe('avif');
    expect(result.quality).toBe(85);
    
    // Ensure metrics aren't included in the result
    expect(result.__detectionMetrics).toBeUndefined();
  });
  
  it('applies detector results when format is auto', async () => {
    const options = { format: 'auto' };
    
    const result = await buildTransformOptions(
      mockRequest as any,
      mockStorageResult as any,
      options,
      mockConfig as any
    );
    
    // Verify format from detector was used
    expect(result.format).toBe('avif');
  });
  
  it('respects explicitly set options over detector suggestions', async () => {
    // Update the mock to respect explicit options
    vi.mocked(detector.getOptimizedOptions).mockImplementationOnce((request, options) => {
      return Promise.resolve({
        ...options, // Keep original options
        __detectionMetrics: {
          browser: 'chrome 96.0',
          deviceClass: 'high-end',
          networkQuality: 'high',
          detectionTime: 5,
          source: {
            browser: 'user-agent',
            formats: 'user-agent'
          }
        }
      });
    });
    
    const options = {
      width: 400,
      format: 'webp', // Explicitly request webp
      quality: 50
    };
    
    const result = await buildTransformOptions(
      mockRequest as any,
      mockStorageResult as any,
      options,
      mockConfig as any
    );
    
    // The detector was called
    expect(detector.getOptimizedOptions).toHaveBeenCalled();
    
    // But explicit options should be preserved
    expect(result.format).toBe('webp'); // Not overridden by detector
    expect(result.quality).toBe(50); // Not overridden by detector
    expect(result.width).toBe(400); // Not overridden by detector
  });
  
  it('handles empty options correctly', async () => {
    const options = {};
    
    const result = await buildTransformOptions(
      mockRequest as any,
      mockStorageResult as any,
      options,
      mockConfig as any
    );
    
    // Default options should be applied
    expect(result.format).toBe('avif'); // From detector
    expect(result.quality).toBe(85); // From detector
  });
  
  it('correctly handles derivative options', async () => {
    const options = {
      derivative: 'thumbnail',
      format: 'auto'
    };
    
    const result = await buildTransformOptions(
      mockRequest as any,
      mockStorageResult as any,
      options,
      mockConfig as any
    );
    
    // Derivative options should be applied before detector
    expect(result.width).toBe(300); // From derivative
    expect(result.height).toBe(300); // From derivative
    expect(result.fit).toBe('cover'); // From derivative
    
    // But format should come from detector since it's 'auto'
    expect(result.format).toBe('avif'); // From detector
  });
});