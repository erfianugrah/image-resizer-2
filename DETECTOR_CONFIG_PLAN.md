# Detector Configuration Plan

This document outlines the plan for making the Client Detection framework fully configurable through the standard configuration system.

## Current Status

The Client Detector framework contains several hard-coded values and thresholds that should be configurable. These include:

1. Cache size limits
2. String processing thresholds
3. Strategy priorities and behavior
4. Performance budget calculations
5. Quality and format selection parameters

## Configuration Design

### Schema Design

The proposed configuration schema extends the existing `ImageResizerConfig` with a new `detector` section:

```typescript
export interface DetectorConfig {
  cache: {
    maxSize: number;       // Maximum cache entries
    pruneAmount: number;   // How many to prune when limit reached
    enableCache: boolean;  // Allow disabling cache entirely
    ttl?: number;          // Optional TTL in milliseconds
  };
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
  deviceClassification: {
    thresholds: {
      lowEnd: number;   // Score below this is low-end
      highEnd: number;  // Score above this is high-end
    };
    platformScores: {
      [platform: string]: number; // Base score for platforms
    };
  };
  hashAlgorithm: 'simple' | 'fnv1a' | 'md5';  // Configurable hash algorithm
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

### Default Configuration

Sensible defaults will be provided to maintain backward compatibility:

```typescript
const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  cache: {
    maxSize: 1000,
    pruneAmount: 100,
    enableCache: true
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
    },
    platformScores: {
      'iOS': 70,
      'macOS': 70,
      'Windows': 50,
      'Android': 40,
      'Linux': 60,
      'Chrome OS': 50
    }
  },
  hashAlgorithm: 'simple',
  logLevel: 'info'
}
```

## Implementation Plan

### Phase 1: Configuration Infrastructure

1. **Update Configuration Schema**
   - Add `DetectorConfig` interface
   - Add `detector` property to main config
   - Set up default values

2. **Create Config Consumer**
   - Update detector constructor to accept config
   - Implement config merging with defaults
   - Add validation for config values
   - Add debug logging for configuration

### Phase 2: Refactor Hard-coded Values

1. **Cache Management**
   - Replace hard-coded max size and prune amount
   - Make cache behavior configurable
   - Add support for TTL-based cache

2. **Strategy Management**
   - Make strategy priorities configurable
   - Enable/disable individual strategies
   - Configure string processing limits

3. **Performance Budget Calculation**
   - Make quality thresholds configurable
   - Implement configurable dimension limits
   - Add preferred format ordering

### Phase 3: Advanced Configuration

1. **Device Classification**
   - Add configurable scoring system
   - Make device class thresholds configurable
   - Allow platform-specific scoring

2. **Hashing Algorithms**
   - Support multiple hashing algorithms
   - Allow selection based on performance needs

3. **Optimization Rules**
   - Enable conditional format selection rules
   - Add network type-specific configurations
   - Support custom quality adjustments

## Configuration Examples

### Minimal Configuration

```jsonc
{
  "detector": {
    "cache": {
      "maxSize": 2000 // Only override cache size
    }
  }
}
```

### Aggressive Caching

```jsonc
{
  "detector": {
    "cache": {
      "maxSize": 5000,
      "pruneAmount": 500,
      "ttl": 3600000 // 1 hour TTL
    },
    "strategies": {
      "userAgent": {
        "maxUALength": 200 // Process longer UAs
      }
    }
  }
}
```

### Low Memory Environment

```jsonc
{
  "detector": {
    "cache": {
      "maxSize": 100,
      "pruneAmount": 20
    },
    "strategies": {
      "userAgent": {
        "maxUALength": 50 // Only process first 50 chars
      },
      "staticData": {
        "enabled": false // Disable to save memory
      }
    },
    "hashAlgorithm": "simple" // Use simplest hashing
  }
}
```

### Quality-Focused Configuration

```jsonc
{
  "detector": {
    "performanceBudget": {
      "quality": {
        "low": {
          "min": 70,
          "max": 85,
          "target": 75
        },
        "medium": {
          "min": 75,
          "max": 90,
          "target": 85
        },
        "high": {
          "min": 80,
          "max": 95,
          "target": 90
        }
      }
    }
  }
}
```

## Testing Plan

1. **Unit Tests**
   - Test config merging with defaults
   - Verify override behavior
   - Test validation of invalid configs

2. **Integration Tests**
   - Verify config propagates through system
   - Test different config combinations
   - Measure performance impact of configs

3. **Documentation Updates**
   - Add configuration section to README
   - Document each configuration option
   - Provide example configurations for common scenarios

## Migration Path

Existing implementations will continue to work without changes as the system will use sensible defaults when no configuration is provided. This allows for a gradual transition to more customized configurations.

## Timeline

- Phase 1: Configuration Infrastructure - 1 day
- Phase 2: Refactor Hard-coded Values - 2 days
- Phase 3: Advanced Configuration - 2 days
- Testing & Documentation - 1 day

Total estimated effort: 6 developer days