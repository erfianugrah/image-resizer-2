# Client Detection Configuration Implementation

This document describes the implementation of configurable client detection for the image resizer.

## Changes Made

1. **Added DetectorConfig Interface**
   - Created a comprehensive configuration schema in `config.ts`
   - Configuration covers cache settings, strategies, performance budgets, device classification, and algorithm settings

2. **Added Environment Configurations**
   - Added default configurations for all environments (development, staging, production)
   - Each environment has customized settings:
     - Development: Smaller cache, longer user agent processing, debug logging
     - Staging: Medium cache, balanced settings, info logging
     - Production: Large cache, efficient algorithms, reduced logging

3. **Implemented Configuration Loading**
   - Added configuration injection in `index.ts`
   - Added logging of configuration during initialization
   - Made all hard-coded values configurable

4. **Added Wrangler Integration**
   - Created a Wrangler configuration loader in `utils/wrangler-config.ts`
   - Added environment variable support for detector configuration
   - Implemented merging of configuration from multiple sources

5. **Created Tests**
   - Added unit tests for detector configuration
   - Added integration tests for index.ts configuration
   - Added tests for Wrangler environment variable loading

## Configuration Options

The detector configuration provides the following options:

### Cache Configuration
```typescript
cache: {
  maxSize: number;       // Maximum cache entries
  pruneAmount: number;   // How many to prune when limit reached
  enableCache: boolean;  // Allow disabling cache entirely
  ttl?: number;          // Optional TTL in milliseconds
};
```

### Strategy Configuration
```typescript
strategies: {
  clientHints: {
    priority: number;
    enabled: boolean;
  };
  acceptHeader: {
    priority: number;
    enabled: boolean;
  };
  userAgent: {
    priority: number;
    enabled: boolean;
    maxUALength: number; // Max user agent length to process
  };
  staticData: {
    priority: number;
    enabled: boolean;
  };
  defaults: {
    priority: number;
    enabled: boolean;
  };
};
```

### Performance Budget
```typescript
performanceBudget: {
  quality: {
    low: {
      min: number;
      max: number;
      target: number;
    };
    medium: {
      min: number;
      max: number;
      target: number;
    };
    high: {
      min: number;
      max: number;
      target: number;
    };
  };
  dimensions: {
    maxWidth: {
      low: number;
      medium: number;
      high: number;
    };
    maxHeight: {
      low: number;
      medium: number;
      high: number;
    };
  };
  preferredFormats: {
    low: string[];    // Ordered list of formats for low-end
    medium: string[]; // Ordered list of formats for medium
    high: string[];   // Ordered list of formats for high-end
  };
};
```

### Device Classification
```typescript
deviceClassification: {
  thresholds: {
    lowEnd: number;   // Score below this is low-end
    highEnd: number;  // Score above this is high-end
  };
  platformScores: {
    [platform: string]: number; // Base score for platforms
  };
};
```

### Algorithm and Logging
```typescript
hashAlgorithm: 'simple' | 'fnv1a' | 'md5';  // Configurable hash algorithm
logLevel: 'debug' | 'info' | 'warn' | 'error';
```

## Wrangler Configuration

The detector can be configured through environment variables in wrangler.jsonc. The configuration is loaded in a type-safe manner, ensuring all required properties are present when a configuration section is used.

### Cache Configuration
- `DETECTOR_CACHE_MAX_SIZE`: Maximum number of cache entries
- `DETECTOR_CACHE_PRUNE_AMOUNT`: Number of entries to prune when cache is full
- `DETECTOR_CACHE_ENABLE`: Enable or disable the cache
- `DETECTOR_CACHE_TTL`: Cache TTL in milliseconds

### Strategy Configuration
- `DETECTOR_STRATEGY_CLIENT_HINTS_PRIORITY`: Priority for client hints strategy (0-100)
- `DETECTOR_STRATEGY_CLIENT_HINTS_ENABLED`: Enable/disable client hints strategy
- `DETECTOR_STRATEGY_ACCEPT_HEADER_PRIORITY`: Priority for accept header strategy (0-100)
- `DETECTOR_STRATEGY_ACCEPT_HEADER_ENABLED`: Enable/disable accept header strategy
- `DETECTOR_STRATEGY_USER_AGENT_PRIORITY`: Priority for user agent strategy (0-100)
- `DETECTOR_STRATEGY_USER_AGENT_ENABLED`: Enable/disable user agent strategy
- `DETECTOR_STRATEGY_USER_AGENT_MAX_LENGTH`: Maximum user agent string length to process
- `DETECTOR_STRATEGY_STATIC_DATA_PRIORITY`: Priority for static data strategy (0-100)
- `DETECTOR_STRATEGY_STATIC_DATA_ENABLED`: Enable/disable static data strategy
- `DETECTOR_STRATEGY_DEFAULTS_PRIORITY`: Priority for default strategy (0-100)
- `DETECTOR_STRATEGY_DEFAULTS_ENABLED`: Enable/disable default strategy

### Performance Budget Configuration
- `DETECTOR_QUALITY_LOW_MIN`: Minimum quality for low-end devices (0-100)
- `DETECTOR_QUALITY_LOW_MAX`: Maximum quality for low-end devices (0-100)
- `DETECTOR_QUALITY_LOW_TARGET`: Target quality for low-end devices (0-100)
- `DETECTOR_QUALITY_MEDIUM_MIN`: Minimum quality for medium-range devices (0-100)
- `DETECTOR_QUALITY_MEDIUM_MAX`: Maximum quality for medium-range devices (0-100)
- `DETECTOR_QUALITY_MEDIUM_TARGET`: Target quality for medium-range devices (0-100)
- `DETECTOR_QUALITY_HIGH_MIN`: Minimum quality for high-end devices (0-100)
- `DETECTOR_QUALITY_HIGH_MAX`: Maximum quality for high-end devices (0-100)
- `DETECTOR_QUALITY_HIGH_TARGET`: Target quality for high-end devices (0-100)
- `DETECTOR_DIMENSIONS_WIDTH_LOW`: Maximum width for low-end devices
- `DETECTOR_DIMENSIONS_WIDTH_MEDIUM`: Maximum width for medium-range devices
- `DETECTOR_DIMENSIONS_WIDTH_HIGH`: Maximum width for high-end devices
- `DETECTOR_DIMENSIONS_HEIGHT_LOW`: Maximum height for low-end devices
- `DETECTOR_DIMENSIONS_HEIGHT_MEDIUM`: Maximum height for medium-range devices
- `DETECTOR_DIMENSIONS_HEIGHT_HIGH`: Maximum height for high-end devices
- `DETECTOR_FORMATS_LOW`: Comma-separated list of preferred formats for low-end devices
- `DETECTOR_FORMATS_MEDIUM`: Comma-separated list of preferred formats for medium-range devices
- `DETECTOR_FORMATS_HIGH`: Comma-separated list of preferred formats for high-end devices

### Device Classification
- `DETECTOR_THRESHOLD_LOW_END`: Score threshold for low-end devices (0-100)
- `DETECTOR_THRESHOLD_HIGH_END`: Score threshold for high-end devices (0-100)
- `DETECTOR_PLATFORM_IOS`: Base score for iOS devices (0-100)
- `DETECTOR_PLATFORM_MACOS`: Base score for macOS devices (0-100)
- `DETECTOR_PLATFORM_WINDOWS`: Base score for Windows devices (0-100)
- `DETECTOR_PLATFORM_ANDROID`: Base score for Android devices (0-100)
- `DETECTOR_PLATFORM_LINUX`: Base score for Linux devices (0-100)
- `DETECTOR_PLATFORM_CHROME_OS`: Base score for Chrome OS devices (0-100)

### Core Configuration
- `DETECTOR_HASH_ALGORITHM`: Hash algorithm to use (simple, fnv1a, md5)
- `DETECTOR_LOG_LEVEL`: Detector logging level (debug, info, warn, error)

## Environment Variable Handling

The wrangler configuration loader (`utils/wrangler-config.ts`) has been implemented with type safety in mind. The key design decisions include:

1. **Complete Objects**: When a configuration section is requested (strategies, performance budget, device classification), the loader ensures all properties of that section are included with appropriate defaults. This guarantees type safety and prevents TypeScript errors from partial objects.

2. **Config Presence Detection**: The loader checks for the presence of relevant environment variables before adding a configuration section. This allows for minimal configuration with sensible defaults.

3. **Type Coercion**: Environment variables are properly converted to their expected types (numbers, booleans, arrays) with validation to ensure correctness.

4. **Test Coverage**: Unit tests verify the correct loading of configurations from environment variables with various test cases.

## Usage Example

In `index.ts`, the detector is now initialized with configuration:

```typescript
// Initialize detector with configuration if available
if (config.detector) {
  setDetectorConfig(config.detector);
  mainLogger.info('Client detector initialized with configuration', {
    cacheSize: config.detector.cache.maxSize,
    strategies: Object.keys(config.detector.strategies)
      .filter(key => {
        const strategy = config.detector?.strategies[key as keyof typeof config.detector.strategies];
        return strategy?.enabled;
      })
      .join(', '),
    hashAlgorithm: config.detector.hashAlgorithm || 'simple'
  });
}
```

## Wrangler Configuration Example

Below is an example of a rich detector configuration in `wrangler.jsonc`:

```jsonc
{
  "name": "image-resizer",
  "compatibility_date": "2023-05-18",
  "env": {
    "development": {
      "vars": {
        // Cache settings for development (smaller cache)
        "DETECTOR_CACHE_MAX_SIZE": "500",
        "DETECTOR_CACHE_PRUNE_AMOUNT": "50",
        "DETECTOR_CACHE_TTL": "300000", // 5 minutes

        // Strategy priorities for development
        "DETECTOR_STRATEGY_CLIENT_HINTS_PRIORITY": "100",
        "DETECTOR_STRATEGY_ACCEPT_HEADER_PRIORITY": "80",
        "DETECTOR_STRATEGY_USER_AGENT_PRIORITY": "60",
        "DETECTOR_STRATEGY_USER_AGENT_MAX_LENGTH": "200", // Process longer UAs in dev
        
        // Debug settings for development
        "DETECTOR_LOG_LEVEL": "debug",
        "DETECTOR_HASH_ALGORITHM": "simple"
      }
    },
    "staging": {
      "vars": {
        // Cache settings for staging (medium cache)
        "DETECTOR_CACHE_MAX_SIZE": "1000",
        "DETECTOR_CACHE_PRUNE_AMOUNT": "100",
        "DETECTOR_CACHE_TTL": "1800000", // 30 minutes
        
        // Quality settings for testing
        "DETECTOR_QUALITY_LOW_MIN": "65",
        "DETECTOR_QUALITY_LOW_TARGET": "75",
        "DETECTOR_QUALITY_MEDIUM_TARGET": "80",
        "DETECTOR_QUALITY_HIGH_TARGET": "90",
        
        // Format preferences for testing
        "DETECTOR_FORMATS_HIGH": "avif,webp,jpeg",
        
        // Log level for staging
        "DETECTOR_LOG_LEVEL": "info"
      }
    },
    "production": {
      "vars": {
        // Cache settings for production (larger cache)
        "DETECTOR_CACHE_MAX_SIZE": "2000",
        "DETECTOR_CACHE_PRUNE_AMOUNT": "200",
        "DETECTOR_CACHE_TTL": "3600000", // 1 hour
        
        // Limit UA processing length in production for performance
        "DETECTOR_STRATEGY_USER_AGENT_MAX_LENGTH": "100",
        
        // More efficient hash algorithm for production
        "DETECTOR_HASH_ALGORITHM": "fnv1a",
        
        // Dimensions limits for production
        "DETECTOR_DIMENSIONS_WIDTH_HIGH": "2000",
        "DETECTOR_DIMENSIONS_HEIGHT_HIGH": "2000",
        
        // Reduce logging in production
        "DETECTOR_LOG_LEVEL": "warn"
      }
    }
  }
}
```