import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DefaultCacheService } from '../../src/services/cacheService';
import { ConfigurationService } from '../../src/services/interfaces';
import { ImageResizerConfig } from '../../src/config';

describe('CacheService', () => {
  // Mock dependencies
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  
  // Mock configuration
  const mockConfig = {
    environment: 'development',
    version: '1.0.0',
    responsive: {},
    storage: {},
    derivatives: {},
    features: {},
    cache: {
      method: 'cf',
      ttl: {
        ok: 3600,
        clientError: 60,
        serverError: 10
      },
      cacheability: true,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        successThreshold: 2
      }
    }
  } as ImageResizerConfig;
  
  // Mock configuration service
  const mockConfigService = {
    getConfig: () => mockConfig,
    getSection: (section: keyof ImageResizerConfig) => mockConfig[section],
    getValue: () => undefined,
    mergeConfig: () => mockConfig,
    getEnvironmentConfig: () => ({}),
    isFeatureEnabled: () => false,
    getDefaultConfig: () => mockConfig,
    reloadConfig: () => mockConfig,
    getPathTransforms: () => ({}),
    getDerivative: () => null,
    getDerivativeNames: () => [],
    isImmutableContent: () => false,
    shouldBypassForPath: () => false,
    getPathBasedTtl: () => undefined,
    initialize: () => Promise.resolve(),
    shutdown: () => Promise.resolve()
  } as ConfigurationService;
  
  let cacheService: DefaultCacheService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    cacheService = new DefaultCacheService(
      mockLogger as any, 
      mockConfigService as ConfigurationService
    );
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  it('should initialize with circuit breaker settings', async () => {
    // Act
    await cacheService.initialize();
    
    // Assert
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Initializing DefaultCacheService'
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'DefaultCacheService initialization complete'
    );
  });
  
  it('should log circuit breaker state on shutdown', async () => {
    // First initialize to set up state
    await cacheService.initialize();
    
    // Clear mocks
    vi.clearAllMocks();
    
    // Act
    await cacheService.shutdown();
    
    // Assert
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Shutting down DefaultCacheService'
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Cache circuit breaker state at shutdown', 
      expect.objectContaining({
        recentFailures: 0
      })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'DefaultCacheService shutdown complete'
    );
  });
});