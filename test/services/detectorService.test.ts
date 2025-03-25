import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DetectorServiceImpl } from '../../src/services/detectorService';
import { OptimizedDetectorService } from '../../src/services/optimizedDetectorService';
import { createDetectorService } from '../../src/services/detectorServiceFactory';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
};

// Mock request with headers
function createMockRequest(headers: Record<string, string> = {}): Request {
  const mockHeaders = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    mockHeaders.append(key, value);
  });
  
  return {
    url: 'https://example.com/image.jpg',
    headers: mockHeaders,
    // Mock other required properties
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
    clone: () => createMockRequest(headers),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('')
  } as Request;
}

// Mock configuration
const mockConfig = {
  detector: {
    cache: {
      maxSize: 100,
      pruneAmount: 10,
      enableCache: true,
      ttl: 60000
    },
    strategies: {
      clientHints: { enabled: true, priority: 100 },
      acceptHeader: { enabled: true, priority: 80 },
      userAgent: { enabled: true, priority: 60, maxUALength: 100 },
      staticData: { enabled: true, priority: 20 },
      defaults: { enabled: true, priority: 0 }
    },
    logLevel: 'debug'
  },
  performance: {
    optimizedClientDetection: false
  }
};

const optimizedConfig = {
  ...mockConfig,
  performance: {
    optimizedClientDetection: true
  }
};

describe('DetectorService', () => {
  let service: DetectorServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DetectorServiceImpl(mockLogger as any);
    service.configure(mockConfig as any);
  });

  it('should detect client type from user-agent', async () => {
    const mobileRequest = createMockRequest({
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    });
    
    const clientInfo = await service.detectClient(mobileRequest);
    expect(clientInfo.deviceType).toBe('mobile');
  });

  it('should detect webp support from Accept header', async () => {
    const request = createMockRequest({
      'Accept': 'image/webp,image/jpeg,image/png'
    });
    
    const clientInfo = await service.detectClient(request);
    expect(clientInfo.acceptsWebp).toBe(true);
  });

  it('should detect avif support from Accept header', async () => {
    const request = createMockRequest({
      'Accept': 'image/avif,image/webp,image/jpeg,image/png'
    });
    
    const clientInfo = await service.detectClient(request);
    expect(clientInfo.acceptsAvif).toBe(true);
  });

  it('should use cache for subsequent requests', async () => {
    const request = createMockRequest({
      'User-Agent': 'Mozilla/5.0 Chrome/91.0.4472.124',
      'Accept': 'image/webp,image/png'
    });
    
    // First request should process and cache
    await service.detectClient(request);
    
    // Spy on internal method
    const parseClientInfoSpy = vi.spyOn(service as any, 'parseClientInfo');
    
    // Second request should use cache
    await service.detectClient(request);
    
    expect(parseClientInfoSpy).not.toHaveBeenCalled();
  });

  it('should optimize options based on client info', async () => {
    const request = createMockRequest({
      'User-Agent': 'Mozilla/5.0 Chrome/91.0.4472.124',
      'Accept': 'image/webp,image/png',
      'Save-Data': 'on'
    });
    
    const baseOptions = { width: 800, height: 600 };
    const optimizedOptions = await service.getOptimizedOptions(request, baseOptions, mockConfig as any);
    
    // Should add format based on client detection
    expect(optimizedOptions.format).toBe('webp');
    
    // Should reduce quality for save-data
    expect(optimizedOptions.quality).toBeLessThan(80);
    expect(optimizedOptions.compression).toBe('fast');
  });
});

describe('OptimizedDetectorService', () => {
  let service: OptimizedDetectorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OptimizedDetectorService(mockLogger as any);
    service.configure(mockConfig as any);
  });

  it('should use specialized caching for format checks', async () => {
    const request = createMockRequest({
      'User-Agent': 'Mozilla/5.0 Chrome/91.0.4472.124'
    });
    
    // First check
    await service.supportsFormat(request, 'webp');
    
    // Spy on parent method
    const parentSpy = vi.spyOn(DetectorServiceImpl.prototype, 'supportsFormat');
    
    // Second check should use specialized cache
    await service.supportsFormat(request, 'webp');
    
    expect(parentSpy).not.toHaveBeenCalled();
  });

  it('should clear all caches including specialized ones', async () => {
    // Setup caches
    const request = createMockRequest({
      'User-Agent': 'Mozilla/5.0 Chrome/91.0.4472.124'
    });
    
    await service.supportsFormat(request, 'webp');
    await service.supportsFormat(request, 'avif');
    
    // Spies on private cache fields using any type
    const webpCacheSpy = vi.spyOn(service as any, 'acceptsWebpCache', 'get').mockReturnValue(new Map([['test', true]]));
    const avifCacheSpy = vi.spyOn(service as any, 'acceptsAvifCache', 'get').mockReturnValue(new Map([['test', true]]));
    
    service.clearCache();
    
    // Check that both specialized caches were cleared
    expect(webpCacheSpy).toHaveBeenCalled();
    expect(avifCacheSpy).toHaveBeenCalled();
  });
});

describe('DetectorServiceFactory', () => {
  it('should create standard detector service when optimized flag is off', () => {
    const service = createDetectorService(mockConfig as any, mockLogger as any);
    expect(service).toBeInstanceOf(DetectorServiceImpl);
    expect(service).not.toBeInstanceOf(OptimizedDetectorService);
  });

  it('should create optimized detector service when optimized flag is on', () => {
    const service = createDetectorService(optimizedConfig as any, mockLogger as any);
    expect(service).toBeInstanceOf(OptimizedDetectorService);
  });
});