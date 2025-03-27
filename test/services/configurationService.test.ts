import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DefaultConfigurationService } from '../../src/services/configurationService';
import { createLogger } from '../../src/utils/logging';

describe('ConfigurationService', () => {
  // Mock logger
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  
  // Mock environment variables
  const mockEnv = {
    ENVIRONMENT: 'development',
    DEBUG: 'true',
    CACHE_METHOD: 'cf'
  };
  
  let configService: DefaultConfigurationService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    configService = new DefaultConfigurationService(mockLogger as any, mockEnv as any);
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  it('should initialize with correct defaults', () => {
    expect(configService).toBeDefined();
    expect(mockLogger.debug).toHaveBeenCalled();
    
    const config = configService.getConfig();
    expect(config.environment).toBe('development');
    expect(config.debug.enabled).toBe(true);
  });
  
  it('should get configuration section', () => {
    const cacheSection = configService.getSection('cache');
    expect(cacheSection).toBeDefined();
    expect(cacheSection.method).toBe('cf');
  });
  
  it('should get configuration value using dot notation', () => {
    const debugEnabled = configService.getValue<boolean>('debug.enabled');
    expect(debugEnabled).toBe(true);
    
    const nonExistentValue = configService.getValue<string>('nonexistent.path', 'default');
    expect(nonExistentValue).toBe('default');
  });
  
  it('should merge configuration values', () => {
    const mergedConfig = configService.mergeConfig({
      debug: { verbose: false }
    });
    
    expect(mergedConfig.debug.verbose).toBe(false);
    expect(mergedConfig.debug.enabled).toBe(true); // Original value preserved
  });
  
  it('should check if a feature is enabled', () => {
    const isAkamaiEnabled = configService.isFeatureEnabled('enableAkamaiCompatibility');
    expect(isAkamaiEnabled).toBe(true); // Development environment enables this
    
    const nonExistentFeature = configService.isFeatureEnabled('nonExistentFeature');
    expect(nonExistentFeature).toBe(false);
  });
  
  it('should get path transforms for specific origins', () => {
    const r2Transforms = configService.getPathTransforms('r2');
    expect(r2Transforms).toBeDefined();
  });
  
  it('should match path patterns correctly', () => {
    // Test exact match
    expect(configService.matchesPathPattern('/test/path', ['/test/path'])).toBe(true);
    
    // Test wildcard match
    expect(configService.matchesPathPattern('/test/path', ['/test/*'])).toBe(true);
    
    // Test no match
    expect(configService.matchesPathPattern('/other/path', ['/test/*'])).toBe(false);
  });
  
  it('should determine if a path should bypass cache', () => {
    // Test with development environment which always bypasses cache
    expect(configService.shouldBypassForPath('/admin/users')).toBe(true);
    expect(configService.shouldBypassForPath('/content/images')).toBe(true);
    
    // Override the development bypass setting for specific test
    const config = configService.getConfig();
    config.environment = 'production';
    config.cache.bypassInDevelopment = false;
    config.cache.bypassPaths = ['/admin/*', '/preview/*'];
    
    expect(configService.shouldBypassForPath('/admin/users')).toBe(true);
    expect(configService.shouldBypassForPath('/content/images')).toBe(false);
  });
  
  it('should check if content is immutable', () => {
    // Access internal config to modify for test
    const config = configService.getConfig();
    
    // Set up immutable content configuration for test
    config.cache.immutableContent = {
      enabled: true,
      paths: ['/static/*', '/assets/*'],
      contentTypes: ['image/svg+xml'],
      derivatives: ['icon', 'logo']
    };
    
    // Now test with our properly configured settings
    expect(configService.isImmutableContent('/static/logo.png')).toBe(true);
    expect(configService.isImmutableContent('/dynamic/banner.jpg')).toBe(false);
    expect(configService.isImmutableContent('/images/file.svg', 'image/svg+xml')).toBe(true);
    expect(configService.isImmutableContent('/images/icon.png', 'image/png', 'icon')).toBe(true);
  });
  
  it('should support lifecycle methods', async () => {
    await configService.initialize();
    await configService.shutdown();
    
    // Both should complete without errors
    expect(true).toBe(true);
  });
});