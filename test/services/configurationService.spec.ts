/**
 * Configuration Service Tests
 * 
 * Tests for the ConfigurationService functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultConfigurationService } from '../../src/services/configurationService';
import { ImageResizerConfig, defaultConfig } from '../../src/config';
import { Logger } from '../../src/utils/logging';

// Import mock logger
import { createMockLogger } from '../mocks/logging';

// Create a deeper mock environment with more configuration settings
const mockEnv = {
  ENVIRONMENT: 'development',
  DEBUG: 'true',
  CACHE_METHOD: 'cf',
  CACHE_TTL_OK: '3600',
  ENABLE_AKAMAI_COMPATIBILITY: 'true',
  ENABLE_AKAMAI_ADVANCED_FEATURES: 'false',
  FORMAT_QUALITY_WEBP: '85',
  STORAGE_PRIORITY: 'r2,remote,fallback',
  REMOTE_URL: 'https://example.com/images',
  FALLBACK_URL: 'https://backup.example.com/images',
  IMAGES_BUCKET: {} // Mock R2 bucket binding
};

describe('ConfigurationService', () => {
  let configService: DefaultConfigurationService;
  let mockLogger: Logger;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
    configService = new DefaultConfigurationService(mockLogger, mockEnv as any);
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  it('should initialize with environment settings', () => {
    const config = configService.getConfig();
    
    expect(config).toBeDefined();
    expect(config.environment).toBe('development');
    expect(config.debug.enabled).toBe(true);
    expect(config.cache.method).toBe('cf');
    expect(config.cache.ttl.ok).toBe(3600);
    
    // The logger should be called during initialization
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Configuration service initialized',
      expect.objectContaining({
        environment: 'development'
      })
    );
  });
  
  it('should retrieve the complete configuration object', () => {
    const config = configService.getConfig();
    
    // The config should have all expected sections
    expect(config).toHaveProperty('environment');
    expect(config).toHaveProperty('cache');
    expect(config).toHaveProperty('debug');
    expect(config).toHaveProperty('storage');
    expect(config).toHaveProperty('responsive');
    expect(config).toHaveProperty('features');
    
    // Verify storage settings from mock env
    expect(config.storage.remoteUrl).toBe('https://example.com/images');
    expect(config.storage.fallbackUrl).toBe('https://backup.example.com/images');
  });
  
  it('should retrieve specific configuration sections', () => {
    const cacheConfig = configService.getSection('cache');
    const debugConfig = configService.getSection('debug');
    const storageConfig = configService.getSection('storage');
    
    // Each section should be a valid config section
    expect(cacheConfig).toHaveProperty('method', 'cf');
    expect(cacheConfig).toHaveProperty('ttl');
    expect(cacheConfig.ttl).toHaveProperty('ok', 3600);
    
    expect(debugConfig).toHaveProperty('enabled', true);
    expect(debugConfig).toHaveProperty('headers');
    
    expect(storageConfig).toHaveProperty('priority');
    expect(storageConfig.priority).toEqual(['r2', 'remote', 'fallback']);
  });
  
  it('should retrieve configuration values using dot notation', () => {
    // Test top-level values
    expect(configService.getValue('environment')).toBe('development');
    
    // Test nested values
    expect(configService.getValue('cache.method')).toBe('cf');
    expect(configService.getValue('debug.enabled')).toBe(true);
    expect(configService.getValue('storage.remoteUrl')).toBe('https://example.com/images');
    
    // Test deeply nested values
    expect(configService.getValue('cache.ttl.ok')).toBe(3600);
    expect(configService.getValue('cache.ttl.clientError')).toBeDefined();
    
    // Test array values
    expect(configService.getValue('storage.priority')).toEqual(['r2', 'remote', 'fallback']);
    
    // Test default values for non-existent paths
    expect(configService.getValue('nonexistent.path', 'default')).toBe('default');
    expect(configService.getValue('nonexistent.path.deep.value', 42)).toBe(42);
    expect(configService.getValue('nonexistent')).toBeUndefined();
  });
  
  it('should correctly merge additional configuration', () => {
    const additionalConfig: Partial<ImageResizerConfig> = {
      debug: {
        enabled: false,
        headers: ['test-header'],
        allowedEnvironments: ['test-env'],
        verbose: false,
        includePerformance: false,
        forceDebugHeaders: true,
        prefix: 'Test-'
      },
      cache: {
        method: 'cache-api',
        ttl: {
          ok: 7200
        }
      }
    } as any; // Partial doesn't need all properties
    
    const updatedConfig = configService.mergeConfig(additionalConfig);
    
    // Debug section should be updated
    expect(updatedConfig.debug.enabled).toBe(false);
    expect(updatedConfig.debug.headers).toContain('test-header');
    expect(updatedConfig.debug.allowedEnvironments).toContain('test-env');
    expect(updatedConfig.debug.verbose).toBe(false);
    expect(updatedConfig.debug.prefix).toBe('Test-');
    
    // Cache section should be updated
    expect(updatedConfig.cache.method).toBe('cache-api');
    expect(updatedConfig.cache.ttl.ok).toBe(7200);
    
    // Other cache ttl values should be preserved
    expect(updatedConfig.cache.ttl.clientError).toBe(mockEnv.ENVIRONMENT === 'development' ? 10 : 60);
    
    // Other sections should remain unchanged
    expect(updatedConfig.storage.remoteUrl).toBe('https://example.com/images');
    
    // The logger should be called for the update
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Configuration updated with additional settings',
      expect.objectContaining({
        updatedSections: expect.arrayContaining(['debug', 'cache'])
      })
    );
  });
  
  it('should check if feature flags are enabled', () => {
    // Feature flag is set to true in mock env
    expect(configService.isFeatureEnabled('enableAkamaiCompatibility')).toBe(true);
    
    // Feature flag is set to false in mock env
    expect(configService.isFeatureEnabled('enableAkamaiAdvancedFeatures')).toBe(false);
    
    // Non-existent feature flag should return false
    expect(configService.isFeatureEnabled('nonExistentFeature')).toBe(false);
    
    // Modify the configuration to test feature flag changes
    configService.mergeConfig({
      features: {
        enableAkamaiCompatibility: false,
        enableAkamaiAdvancedFeatures: true,
        newFeature: true
      }
    });
    
    // Check that feature flag states are updated
    expect(configService.isFeatureEnabled('enableAkamaiCompatibility')).toBe(false);
    expect(configService.isFeatureEnabled('enableAkamaiAdvancedFeatures')).toBe(true);
    expect(configService.isFeatureEnabled('newFeature')).toBe(true);
  });
  
  it('should get environment-specific configuration', () => {
    // Set up environment configs in the service first
    // in a real scenario, these would be loaded from config sources
    const envConfigs = {
      development: { debug: { enabled: true } },
      production: { debug: { enabled: false }, cache: { method: 'cf' } },
      staging: { debug: { enabled: true }, cache: { method: 'cache-api' } }
    };
    
    // This is just for testing - accessing private property
    (configService as any).environmentConfigs = envConfigs;
    
    // Test development environment
    const devConfig = configService.getEnvironmentConfig('development');
    expect(devConfig).toBeDefined();
    expect(devConfig.debug?.enabled).toBe(true);
    
    // Test production environment
    const prodConfig = configService.getEnvironmentConfig('production');
    expect(prodConfig).toBeDefined();
    expect(prodConfig.debug?.enabled).toBe(false);
    expect(prodConfig.cache?.method).toBe('cf');
    
    // Test staging environment
    const stagingConfig = configService.getEnvironmentConfig('staging');
    expect(stagingConfig).toBeDefined();
    expect(stagingConfig.debug?.enabled).toBe(true);
    expect(stagingConfig.cache?.method).toBe('cache-api');
    
    // Getting an environment config should not modify the current config
    const currentConfig = configService.getConfig();
    expect(currentConfig.environment).toBe('development');
  });
  
  it('should get the default configuration', () => {
    const defaultConfigCopy = configService.getDefaultConfig();
    
    // The default config should match the imported default config
    expect(defaultConfigCopy).toMatchObject(defaultConfig);
    
    // But it should be a clone, not the same object
    expect(defaultConfigCopy).not.toBe(defaultConfig);
    
    // And it should not be the same as the current config
    expect(defaultConfigCopy).not.toBe(configService.getConfig());
  });
  
  it('should handle deep cloning correctly', () => {
    // Update the config and then check that the original is not modified
    const originalConfig = configService.getConfig();
    const originalCacheMethod = originalConfig.cache.method;
    
    // Create a new object that modifies a nested property
    const additionalConfig: Partial<ImageResizerConfig> = {
      cache: {
        method: 'none'
      }
    } as any;
    
    // Merge the configuration
    const updatedConfig = configService.mergeConfig(additionalConfig);
    
    // The updated config should have the new value
    expect(updatedConfig.cache.method).toBe('none');
    
    // But internal originalConfig should not be modified directly
    expect(originalConfig.cache.method).not.toBe('none');
    expect(originalConfig.cache.method).toBe(originalCacheMethod);
  });
  
  it('should handle array values correctly during merges', () => {
    // Test merging with arrays
    const originalConfig = configService.getConfig();
    const originalBreakpoints = [...originalConfig.responsive.breakpoints];
    
    // Create a new config with modified array
    const additionalConfig: Partial<ImageResizerConfig> = {
      responsive: {
        breakpoints: [100, 200, 300]
      }
    } as any;
    
    // Merge the configuration
    const updatedConfig = configService.mergeConfig(additionalConfig);
    
    // The updated config should have the new breakpoints
    expect(updatedConfig.responsive.breakpoints).toEqual([100, 200, 300]);
    
    // And they should be different from the original
    expect(updatedConfig.responsive.breakpoints).not.toEqual(originalBreakpoints);
  });
  
  it('should reload configuration from environment', () => {
    // First update the configuration with custom values
    configService.mergeConfig({
      cache: {
        method: 'none'
      }
    });
    
    // Verify the update was applied
    expect(configService.getValue('cache.method')).toBe('none');
    
    // Now reload the configuration
    const reloadedConfig = (configService as any).reloadConfig();
    
    // The reloaded config should have the original value from mockEnv
    expect(reloadedConfig.cache.method).toBe('cf');
    
    // The current config should be updated
    expect(configService.getValue('cache.method')).toBe('cf');
    
    // The logger should be called for the reload
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Configuration reloaded from environment',
      expect.objectContaining({
        environment: 'development'
      })
    );
  });
});