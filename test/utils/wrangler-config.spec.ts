/**
 * Tests for wrangler environment variable configuration loading
 */

import { describe, it, expect } from 'vitest';
import { loadDetectorConfigFromEnv } from '../../src/utils/wrangler-config';

describe('Wrangler Config Loader', () => {
  describe('loadDetectorConfigFromEnv', () => {
    it('should load defaults when no environment variables are set', () => {
      const env = {} as any;
      const config = loadDetectorConfigFromEnv(env);
      
      expect(config.cache).toBeDefined();
      expect(config.cache?.maxSize).toBe(1000);
      expect(config.cache?.pruneAmount).toBe(100);
      expect(config.cache?.enableCache).toBe(true);
      expect(config.hashAlgorithm).toBe('simple');
      expect(config.logLevel).toBe('info');
    });
    
    it('should load values from environment variables when set', () => {
      const env = {
        DETECTOR_CACHE_MAX_SIZE: '2000',
        DETECTOR_CACHE_PRUNE_AMOUNT: '200',
        DETECTOR_CACHE_ENABLE: 'false',
        DETECTOR_CACHE_TTL: '60000',
        DETECTOR_HASH_ALGORITHM: 'fnv1a',
        DETECTOR_LOG_LEVEL: 'warn'
      } as any;
      
      const config = loadDetectorConfigFromEnv(env);
      
      expect(config.cache).toBeDefined();
      expect(config.cache?.maxSize).toBe(2000);
      expect(config.cache?.pruneAmount).toBe(200);
      expect(config.cache?.enableCache).toBe(false);
      expect(config.cache?.ttl).toBe(60000);
      expect(config.hashAlgorithm).toBe('fnv1a');
      expect(config.logLevel).toBe('warn');
    });
    
  it('should load strategies configuration from environment variables', () => {
    const env = {
      DETECTOR_STRATEGY_CLIENT_HINTS_PRIORITY: '90',
      DETECTOR_STRATEGY_CLIENT_HINTS_ENABLED: 'false',
      DETECTOR_STRATEGY_USER_AGENT_MAX_LENGTH: '50'
    } as any;
    
    const config = loadDetectorConfigFromEnv(env);
    
    expect(config.strategies).toBeDefined();
    expect(config.strategies?.clientHints?.priority).toBe(90);
    expect(config.strategies?.clientHints?.enabled).toBe(false);
    expect(config.strategies?.userAgent?.maxUALength).toBe(50);
  });
  
  it('should load performance budget configuration from environment variables', () => {
    const env = {
      DETECTOR_QUALITY_LOW_MIN: '65',
      DETECTOR_QUALITY_HIGH_TARGET: '90',
      DETECTOR_DIMENSIONS_WIDTH_MEDIUM: '1600',
      DETECTOR_FORMATS_LOW: 'webp,jpeg'
    } as any;
    
    const config = loadDetectorConfigFromEnv(env);
    
    expect(config.performanceBudget).toBeDefined();
    expect(config.performanceBudget?.quality?.low?.min).toBe(65);
    expect(config.performanceBudget?.quality?.high?.target).toBe(90);
    expect(config.performanceBudget?.dimensions?.maxWidth?.medium).toBe(1600);
    expect(config.performanceBudget?.preferredFormats?.low).toEqual(['webp', 'jpeg']);
  });
  
  it('should load device classification configuration from environment variables', () => {
    const env = {
      DETECTOR_THRESHOLD_LOW_END: '25',
      DETECTOR_THRESHOLD_HIGH_END: '75',
      DETECTOR_PLATFORM_IOS: '75',
      DETECTOR_PLATFORM_ANDROID: '45'
    } as any;
    
    const config = loadDetectorConfigFromEnv(env);
    
    expect(config.deviceClassification).toBeDefined();
    expect(config.deviceClassification?.thresholds?.lowEnd).toBe(25);
    expect(config.deviceClassification?.thresholds?.highEnd).toBe(75);
    expect(config.deviceClassification?.platformScores?.['iOS']).toBe(75);
    expect(config.deviceClassification?.platformScores?.['Android']).toBe(45);
  });
  
  it('should always return complete objects for each configuration section', () => {
    const env = {
      DETECTOR_STRATEGY_CLIENT_HINTS_PRIORITY: '90',
      DETECTOR_QUALITY_LOW_MIN: '65',
      DETECTOR_THRESHOLD_LOW_END: '25'
    } as any;
    
    const config = loadDetectorConfigFromEnv(env);
    
    // Strategies should be complete
    expect(config.strategies).toBeDefined();
    expect(config.strategies?.clientHints?.priority).toBe(90);
    expect(config.strategies?.acceptHeader).toBeDefined();
    expect(config.strategies?.userAgent).toBeDefined();
    expect(config.strategies?.staticData).toBeDefined();
    expect(config.strategies?.defaults).toBeDefined();
    
    // Performance budget should be complete
    expect(config.performanceBudget).toBeDefined();
    expect(config.performanceBudget?.quality?.low?.min).toBe(65);
    expect(config.performanceBudget?.dimensions).toBeDefined();
    expect(config.performanceBudget?.preferredFormats).toBeDefined();
    
    // Device classification should be complete
    expect(config.deviceClassification).toBeDefined();
    expect(config.deviceClassification?.thresholds?.lowEnd).toBe(25);
    expect(config.deviceClassification?.platformScores).toBeDefined();
  });
    
    it('should handle invalid values gracefully', () => {
      const env = {
        DETECTOR_CACHE_MAX_SIZE: 'not-a-number',
        DETECTOR_CACHE_PRUNE_AMOUNT: '200',
        DETECTOR_HASH_ALGORITHM: 'invalid-algorithm',
        DETECTOR_LOG_LEVEL: 'invalid-level'
      } as any;
      
      const config = loadDetectorConfigFromEnv(env);
      
      // Should use default for invalid number
      expect(config.cache?.maxSize).toBe(1000);
      
      // Should use provided valid value
      expect(config.cache?.pruneAmount).toBe(200);
      
      // Should use default for invalid algorithm
      expect(config.hashAlgorithm).toBe('simple');
      
      // Should use default for invalid log level
      expect(config.logLevel).toBe('info');
    });
    
    it('should handle boolean values correctly', () => {
      // Test various boolean formats
      const envTrue = {
        DETECTOR_CACHE_ENABLE: 'true'
      } as any;
      
      const envYes = {
        DETECTOR_CACHE_ENABLE: 'yes'
      } as any;
      
      const env1 = {
        DETECTOR_CACHE_ENABLE: '1'
      } as any;
      
      const envFalse = {
        DETECTOR_CACHE_ENABLE: 'false'
      } as any;
      
      expect(loadDetectorConfigFromEnv(envTrue).cache?.enableCache).toBe(true);
      expect(loadDetectorConfigFromEnv(envYes).cache?.enableCache).toBe(true);
      expect(loadDetectorConfigFromEnv(env1).cache?.enableCache).toBe(true);
      expect(loadDetectorConfigFromEnv(envFalse).cache?.enableCache).toBe(false);
    });
  });
});