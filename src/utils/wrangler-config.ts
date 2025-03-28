/**
 * Wrangler Configuration Utilities
 * 
 * Loads configuration values from wrangler environment variables.
 */

import { Env } from '../types';
import { DetectorConfig } from '../config';

/**
 * Load detector configuration from wrangler environment variables
 * 
 * @param env The wrangler environment variables
 * @returns Partial detector configuration with values from environment variables
 */
export function loadDetectorConfigFromEnv(env: Env): Partial<DetectorConfig> {
  // Initialize with basic properties that have default values
  const config: Partial<DetectorConfig> = {
    // Cache configuration is always included with defaults
    cache: {
      maxSize: getNumberFromEnv(env, 'DETECTOR_CACHE_MAX_SIZE', 1000),
      pruneAmount: getNumberFromEnv(env, 'DETECTOR_CACHE_PRUNE_AMOUNT', 100),
      enableCache: getBooleanFromEnv(env, 'DETECTOR_CACHE_ENABLE', true),
      ttl: getNumberFromEnv(env, 'DETECTOR_CACHE_TTL', 3600000)
    },
    
    // Core settings are always included with defaults
    hashAlgorithm: getHashAlgorithmFromEnv(env, 'DETECTOR_HASH_ALGORITHM', 'simple'),
    logLevel: getLogLevelFromEnv(env, 'DETECTOR_LOG_LEVEL', 'info')
  };

  // Load strategies from environment (helper functions return fully-formed objects)
  const strategies = loadStrategiesFromEnv(env);
  if (strategies) {
    config.strategies = strategies as DetectorConfig['strategies'];
  }
  
  // Load performance budget from environment
  const performanceBudget = loadPerformanceBudgetFromEnv(env);
  if (performanceBudget) {
    config.performanceBudget = performanceBudget as DetectorConfig['performanceBudget'];
  }
  
  // Load cascade configuration from environment
  const cascade = loadCascadeConfigFromEnv(env);
  if (cascade) {
    config.cascade = cascade as DetectorConfig['cascade'];
  }
  
  // Load device classification from environment
  const deviceClassification = loadDeviceClassificationFromEnv(env);
  if (deviceClassification) {
    config.deviceClassification = deviceClassification as DetectorConfig['deviceClassification'];
  }

  // Remove any undefined properties
  return Object.fromEntries(
    Object.entries(config).filter(([_, value]) => value !== undefined)
  ) as Partial<DetectorConfig>;
}

/**
 * Load cascade configuration from environment variables
 *
 * @param env The environment variables
 * @returns Cascade configuration if any variables are found
 */
function loadCascadeConfigFromEnv(env: Env): Partial<DetectorConfig['cascade']> | undefined {
  // Check if any cascade configuration variables exist
  const hasCascadeConfig = Object.keys(env).some(key => key.startsWith('DETECTOR_CASCADE_'));
  
  if (!hasCascadeConfig) {
    return undefined;
  }
  
  // Initialize cascade configuration with formats
  const formatCascade = {
    enabled: getBooleanFromEnv(env, 'DETECTOR_CASCADE_FORMAT_ENABLED', true),
    acceptHeaderPriority: getNumberFromEnv(env, 'DETECTOR_CASCADE_FORMAT_ACCEPT_PRIORITY', 100),
    clientHintsPriority: getNumberFromEnv(env, 'DETECTOR_CASCADE_FORMAT_CLIENT_HINTS_PRIORITY', 80),
    browserDetectionPriority: getNumberFromEnv(env, 'DETECTOR_CASCADE_FORMAT_BROWSER_PRIORITY', 60),
    fallbackFormat: getStringFromEnv(env, 'DETECTOR_CASCADE_FORMAT_FALLBACK', 'jpeg')
  };
  
  // Initialize cascade configuration with quality
  const qualityCascade = {
    enabled: getBooleanFromEnv(env, 'DETECTOR_CASCADE_QUALITY_ENABLED', true),
    saveDataPriority: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_SAVEDATA_PRIORITY', 100),
    networkConditionPriority: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_NETWORK_PRIORITY', 80),
    deviceCapabilityPriority: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_DEVICE_PRIORITY', 60),
    dprAdjustmentEnabled: getBooleanFromEnv(env, 'DETECTOR_CASCADE_QUALITY_DPR_ADJUSTMENT', true),
    deviceMemoryThresholds: {
      high: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_MEMORY_HIGH', 8),
      low: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_MEMORY_LOW', 2)
    },
    processorThresholds: {
      high: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_PROCESSORS_HIGH', 8),
      low: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_PROCESSORS_LOW', 2)
    },
    adjustmentFactors: {
      slowNetwork: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_SLOW_NETWORK_FACTOR', 0.85),
      fastNetwork: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_FAST_NETWORK_FACTOR', 1.1),
      dprAdjustment: getNumberFromEnv(env, 'DETECTOR_CASCADE_QUALITY_DPR_FACTOR', 5)
    }
  };
  
  return {
    format: formatCascade,
    quality: qualityCascade
  };
}

/**
 * Get a string from environment variables with a default fallback
 *
 * @param env The environment variables
 * @param key The variable key to look for
 * @param defaultValue The default value if not found
 * @returns The value from environment or default
 */
function getStringFromEnv(env: Env, key: keyof Env, defaultValue: string): string {
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return String(value);
}

/**
 * Load strategies configuration from environment variables
 * 
 * @param env The wrangler environment variables
 * @returns Strategies configuration or undefined if no env vars set
 */
function loadStrategiesFromEnv(env: Env): Partial<DetectorConfig['strategies']> | undefined {
  // Check if any strategy config exists
  const hasStrategyConfig = Object.keys(env).some(key => 
    key.startsWith('DETECTOR_STRATEGY_')
  );
  
  if (!hasStrategyConfig) {
    return undefined;
  }
  
  // Always build a complete strategies object with defaults
  const strategies: Partial<DetectorConfig['strategies']> = {
    // Client Hints Strategy
    clientHints: {
      priority: getNumberFromEnv(env, 'DETECTOR_STRATEGY_CLIENT_HINTS_PRIORITY', 100),
      enabled: getBooleanFromEnv(env, 'DETECTOR_STRATEGY_CLIENT_HINTS_ENABLED', true)
    },
    
    // Accept Header Strategy
    acceptHeader: {
      priority: getNumberFromEnv(env, 'DETECTOR_STRATEGY_ACCEPT_HEADER_PRIORITY', 80),
      enabled: getBooleanFromEnv(env, 'DETECTOR_STRATEGY_ACCEPT_HEADER_ENABLED', true)
    },
    
    // User Agent Strategy
    userAgent: {
      priority: getNumberFromEnv(env, 'DETECTOR_STRATEGY_USER_AGENT_PRIORITY', 60),
      enabled: getBooleanFromEnv(env, 'DETECTOR_STRATEGY_USER_AGENT_ENABLED', true),
      maxUALength: getNumberFromEnv(env, 'DETECTOR_STRATEGY_USER_AGENT_MAX_LENGTH', 100)
    },
    
    // Static Data Strategy
    staticData: {
      priority: getNumberFromEnv(env, 'DETECTOR_STRATEGY_STATIC_DATA_PRIORITY', 20),
      enabled: getBooleanFromEnv(env, 'DETECTOR_STRATEGY_STATIC_DATA_ENABLED', true)
    },
    
    // Defaults Strategy
    defaults: {
      priority: getNumberFromEnv(env, 'DETECTOR_STRATEGY_DEFAULTS_PRIORITY', 0),
      enabled: getBooleanFromEnv(env, 'DETECTOR_STRATEGY_DEFAULTS_ENABLED', true)
    }
  };
  
  return strategies;
}

/**
 * Load performance budget from environment variables
 * 
 * @param env The wrangler environment variables
 * @returns Performance budget configuration or undefined if no env vars set
 */
function loadPerformanceBudgetFromEnv(env: Env): Partial<DetectorConfig['performanceBudget']> | undefined {
  // Check if any performance budget config exists
  const hasPerformanceBudgetConfig = Object.keys(env).some(key => 
    key.startsWith('DETECTOR_QUALITY_') || 
    key.startsWith('DETECTOR_DIMENSIONS_') ||
    key.startsWith('DETECTOR_FORMATS_')
  );
  
  if (!hasPerformanceBudgetConfig) {
    return undefined;
  }
  
  // Always return a complete performance budget with defaults
  const performanceBudget: DetectorConfig['performanceBudget'] = {
    // Quality settings
    quality: {
      low: {
        min: getNumberFromEnv(env, 'DETECTOR_QUALITY_LOW_MIN', 60),
        max: getNumberFromEnv(env, 'DETECTOR_QUALITY_LOW_MAX', 80),
        target: getNumberFromEnv(env, 'DETECTOR_QUALITY_LOW_TARGET', 70)
      },
      medium: {
        min: getNumberFromEnv(env, 'DETECTOR_QUALITY_MEDIUM_MIN', 65),
        max: getNumberFromEnv(env, 'DETECTOR_QUALITY_MEDIUM_MAX', 85),
        target: getNumberFromEnv(env, 'DETECTOR_QUALITY_MEDIUM_TARGET', 75)
      },
      high: {
        min: getNumberFromEnv(env, 'DETECTOR_QUALITY_HIGH_MIN', 70),
        max: getNumberFromEnv(env, 'DETECTOR_QUALITY_HIGH_MAX', 95),
        target: getNumberFromEnv(env, 'DETECTOR_QUALITY_HIGH_TARGET', 85)
      }
    },
    
    // Dimensions settings
    dimensions: {
      maxWidth: {
        low: getNumberFromEnv(env, 'DETECTOR_DIMENSIONS_WIDTH_LOW', 1000),
        medium: getNumberFromEnv(env, 'DETECTOR_DIMENSIONS_WIDTH_MEDIUM', 1500),
        high: getNumberFromEnv(env, 'DETECTOR_DIMENSIONS_WIDTH_HIGH', 2500)
      },
      maxHeight: {
        low: getNumberFromEnv(env, 'DETECTOR_DIMENSIONS_HEIGHT_LOW', 1000),
        medium: getNumberFromEnv(env, 'DETECTOR_DIMENSIONS_HEIGHT_MEDIUM', 1500),
        high: getNumberFromEnv(env, 'DETECTOR_DIMENSIONS_HEIGHT_HIGH', 2500)
      }
    },
    
    // Preferred formats
    preferredFormats: {
      low: getStringArrayFromEnv(env, 'DETECTOR_FORMATS_LOW', ['webp', 'jpeg']),
      medium: getStringArrayFromEnv(env, 'DETECTOR_FORMATS_MEDIUM', ['webp', 'avif', 'jpeg']),
      high: getStringArrayFromEnv(env, 'DETECTOR_FORMATS_HIGH', ['avif', 'webp', 'jpeg'])
    }
  };
  
  return performanceBudget;
}

/**
 * Load device classification from environment variables
 * 
 * @param env The wrangler environment variables
 * @returns Device classification configuration or undefined if no env vars set
 */
function loadDeviceClassificationFromEnv(env: Env): Partial<DetectorConfig['deviceClassification']> | undefined {
  // Check if any device classification config exists
  const hasDeviceConfig = Object.keys(env).some(key => 
    key.startsWith('DETECTOR_THRESHOLD_') || 
    key.startsWith('DETECTOR_PLATFORM_')
  );
  
  if (!hasDeviceConfig) {
    return undefined;
  }
  
  // Always return a complete device classification with defaults
  const deviceClassification: DetectorConfig['deviceClassification'] = {
    // Thresholds
    thresholds: {
      lowEnd: getNumberFromEnv(env, 'DETECTOR_THRESHOLD_LOW_END', 30),
      highEnd: getNumberFromEnv(env, 'DETECTOR_THRESHOLD_HIGH_END', 70)
    },
    
    // Platform scores 
    platformScores: {
      'iOS': getNumberFromEnv(env, 'DETECTOR_PLATFORM_IOS', 70),
      'macOS': getNumberFromEnv(env, 'DETECTOR_PLATFORM_MACOS', 70),
      'Windows': getNumberFromEnv(env, 'DETECTOR_PLATFORM_WINDOWS', 50),
      'Android': getNumberFromEnv(env, 'DETECTOR_PLATFORM_ANDROID', 40),
      'Linux': getNumberFromEnv(env, 'DETECTOR_PLATFORM_LINUX', 60),
      'Chrome OS': getNumberFromEnv(env, 'DETECTOR_PLATFORM_CHROME_OS', 50)
    }
  };
  
  return deviceClassification;
}

/**
 * Check if any environment variables with the given prefix exist
 * This function is kept for future use but is currently unused
 * 
 * @param env The wrangler environment variables
 * @param prefix The prefix to check for
 * @returns True if any environment variables with the prefix exist
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function hasEnvPrefix(env: Env, prefix: string): boolean {
  return Object.keys(env).some(key => key.startsWith(prefix));
}

/**
 * Get a string array from environment variable
 * 
 * @param env The wrangler environment variables
 * @param key The environment variable key
 * @param defaultValue The default value if the key is not found
 * @returns The string array value from environment or default
 */
function getStringArrayFromEnv(env: Env, key: keyof Env, defaultValue: string[]): string[] {
  const value = env[key];
  if (value !== undefined) {
    const strValue = String(value);
    return strValue.split(',').map(s => s.trim());
  }
  return defaultValue;
}

/**
 * Get a number from environment variable
 * 
 * @param env The wrangler environment variables
 * @param key The environment variable key
 * @param defaultValue The default value if the key is not found
 * @returns The number value from environment or default
 */
function getNumberFromEnv(env: Env, key: keyof Env, defaultValue: number): number {
  const value = env[key];
  if (value !== undefined) {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }
  return defaultValue;
}

/**
 * Get a boolean from environment variable
 * 
 * @param env The wrangler environment variables
 * @param key The environment variable key
 * @param defaultValue The default value if the key is not found
 * @returns The boolean value from environment or default
 */
function getBooleanFromEnv(env: Env, key: keyof Env, defaultValue: boolean): boolean {
  const value = env[key];
  if (value !== undefined) {
    const strValue = String(value).toLowerCase();
    return strValue === 'true' || strValue === '1' || strValue === 'yes';
  }
  return defaultValue;
}

/**
 * Get hash algorithm from environment variable
 * 
 * @param env The wrangler environment variables
 * @param key The environment variable key
 * @param defaultValue The default algorithm if not found
 * @returns The hash algorithm
 */
function getHashAlgorithmFromEnv(
  env: Env, 
  key: keyof Env, 
  defaultValue: 'simple' | 'fnv1a' | 'md5'
): 'simple' | 'fnv1a' | 'md5' {
  const value = env[key];
  if (value !== undefined) {
    const strValue = String(value).toLowerCase();
    if (strValue === 'simple' || strValue === 'fnv1a' || strValue === 'md5') {
      return strValue as 'simple' | 'fnv1a' | 'md5';
    }
  }
  return defaultValue;
}

/**
 * Get log level from environment variable
 * 
 * @param env The wrangler environment variables
 * @param key The environment variable key
 * @param defaultValue The default log level if not found
 * @returns The log level
 */
function getLogLevelFromEnv(
  env: Env, 
  key: keyof Env, 
  defaultValue: 'debug' | 'info' | 'warn' | 'error'
): 'debug' | 'info' | 'warn' | 'error' {
  const value = env[key];
  if (value !== undefined) {
    const strValue = String(value).toLowerCase();
    if (strValue === 'debug' || strValue === 'info' || strValue === 'warn' || strValue === 'error') {
      return strValue as 'debug' | 'info' | 'warn' | 'error';
    }
  }
  return defaultValue;
}