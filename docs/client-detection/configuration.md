# Client Detection Configuration

The Client Detection framework is fully configurable through the standard configuration system. This document explains the available configuration options and provides examples for common scenarios.

## Configuration Schema

The configuration is defined in the `DetectorConfig` interface and is accessed through the main configuration's `detector` property:

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
      priority: number;    // Priority for client hints strategy
      enabled: boolean;    // Enable/disable this strategy
    };
    acceptHeader: {
      priority: number;    // Priority for Accept header strategy
      enabled: boolean;    // Enable/disable this strategy
    };
    userAgent: {
      priority: number;    // Priority for User-Agent strategy
      enabled: boolean;    // Enable/disable this strategy
      maxUALength: number; // Max user agent length to process
    };
    staticData: {
      priority: number;    // Priority for static data strategy
      enabled: boolean;    // Enable/disable this strategy
    };
    defaults: {
      priority: number;    // Priority for default values strategy
      enabled: boolean;    // Enable/disable this strategy
    };
  };
  performanceBudget: {
    quality: {
      low: {
        min: number;       // Minimum quality for low-end devices
        max: number;       // Maximum quality for low-end devices
        target: number;    // Target quality for low-end devices
      };
      medium: {
        min: number;       // Minimum quality for medium devices
        max: number;       // Maximum quality for medium devices
        target: number;    // Target quality for medium devices
      };
      high: {
        min: number;       // Minimum quality for high-end devices
        max: number;       // Maximum quality for high-end devices
        target: number;    // Target quality for high-end devices
      };
    };
    dimensions: {
      maxWidth: {
        low: number;       // Max width for low-end devices
        medium: number;    // Max width for medium devices
        high: number;      // Max width for high-end devices
      };
      maxHeight: {
        low: number;       // Max height for low-end devices
        medium: number;    // Max height for medium devices
        high: number;      // Max height for high-end devices
      };
    };
    preferredFormats: {
      low: string[];       // Ordered list of formats for low-end
      medium: string[];    // Ordered list of formats for medium
      high: string[];      // Ordered list of formats for high-end
    };
  };
  cascade?: {
    // Format selection cascade
    format: {
      enabled: boolean;           // Enable format cascade
      acceptHeaderPriority: number;  // Priority for Accept header detection
      clientHintsPriority: number;   // Priority for client hints detection
      browserDetectionPriority: number; // Priority for browser detection
      fallbackFormat: string;     // Default format when no detection works
    };
    // Quality selection cascade
    quality: {
      enabled: boolean;           // Enable quality cascade 
      saveDataPriority: number;   // Priority for Save-Data header
      networkConditionPriority: number; // Priority for network conditions
      deviceCapabilityPriority: number; // Priority for device capabilities
      dprAdjustmentEnabled: boolean; // Enable DPR-based quality adjustment
      deviceMemoryThresholds: {
        high: number;             // Memory threshold for high quality (in GB)
        low: number;              // Memory threshold for low quality (in GB)
      };
      processorThresholds: {
        high: number;             // CPU cores threshold for high quality
        low: number;              // CPU cores threshold for low quality
      };
      adjustmentFactors: {
        slowNetwork: number;      // Quality adjustment factor for slow networks
        fastNetwork: number;      // Quality adjustment factor for fast networks
        dprAdjustment: number;    // Quality adjustment per DPR point above 1
      };
    };
  };
  deviceClassification: {
    thresholds: {
      lowEnd: number;     // Score below this is low-end
      highEnd: number;    // Score above this is high-end
    };
    platformScores?: {
      [platform: string]: number; // Base score for platforms (deprecated)
    };
  };
  hashAlgorithm: 'simple' | 'fnv1a' | 'md5';  // Configurable hash algorithm
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

## Default Configuration

The system comes with sensible defaults to provide good behavior out of the box:

```typescript
const defaultConfig: DetectorConfig = {
  cache: {
    maxSize: 1000,
    pruneAmount: 100,
    enableCache: true,
    ttl: 3600000 // 1 hour in milliseconds
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
  cascade: {
    format: {
      enabled: true,
      acceptHeaderPriority: 100,
      clientHintsPriority: 80,
      browserDetectionPriority: 60,
      fallbackFormat: 'jpeg'
    },
    quality: {
      enabled: true,
      saveDataPriority: 100,
      networkConditionPriority: 80,
      deviceCapabilityPriority: 60,
      dprAdjustmentEnabled: true,
      deviceMemoryThresholds: {
        high: 8,
        low: 2
      },
      processorThresholds: {
        high: 8,
        low: 2
      },
      adjustmentFactors: {
        slowNetwork: 0.85,
        fastNetwork: 1.1,
        dprAdjustment: 5
      }
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
}
```

## Configuration in wrangler.jsonc

The detector configuration can be set in your wrangler.jsonc file using environment variables:

```jsonc
{
  "vars": {
    /* Detector Configuration */
    /* Cache Settings */
    "DETECTOR_CACHE_MAX_SIZE": "5000",
    "DETECTOR_CACHE_PRUNE_AMOUNT": "500",
    "DETECTOR_CACHE_ENABLE": "true",
    "DETECTOR_CACHE_TTL": "3600000",
    
    /* Strategy Settings */
    "DETECTOR_STRATEGY_CLIENT_HINTS_PRIORITY": "100",
    "DETECTOR_STRATEGY_ACCEPT_HEADER_PRIORITY": "80",
    "DETECTOR_STRATEGY_USER_AGENT_PRIORITY": "60",
    "DETECTOR_STRATEGY_USER_AGENT_MAX_LENGTH": "200",
    "DETECTOR_STRATEGY_STATIC_DATA_PRIORITY": "20",
    
    /* Cascade Configuration */
    "DETECTOR_CASCADE_FORMAT_ENABLED": "true",
    "DETECTOR_CASCADE_FORMAT_ACCEPT_PRIORITY": "100",
    "DETECTOR_CASCADE_FORMAT_CLIENT_HINTS_PRIORITY": "80",
    "DETECTOR_CASCADE_FORMAT_BROWSER_PRIORITY": "60",
    "DETECTOR_CASCADE_FORMAT_FALLBACK": "jpeg",
    "DETECTOR_CASCADE_QUALITY_ENABLED": "true",
    "DETECTOR_CASCADE_QUALITY_SAVEDATA_PRIORITY": "100",
    "DETECTOR_CASCADE_QUALITY_NETWORK_PRIORITY": "80",
    "DETECTOR_CASCADE_QUALITY_DEVICE_PRIORITY": "60",
    "DETECTOR_CASCADE_QUALITY_DPR_ADJUSTMENT": "true",
    "DETECTOR_CASCADE_QUALITY_MEMORY_HIGH": "8",
    "DETECTOR_CASCADE_QUALITY_MEMORY_LOW": "2",
    "DETECTOR_CASCADE_QUALITY_PROCESSORS_HIGH": "8",
    "DETECTOR_CASCADE_QUALITY_PROCESSORS_LOW": "2",
    "DETECTOR_CASCADE_QUALITY_SLOW_NETWORK_FACTOR": "0.85",
    "DETECTOR_CASCADE_QUALITY_FAST_NETWORK_FACTOR": "1.1",
    "DETECTOR_CASCADE_QUALITY_DPR_FACTOR": "5",
    
    /* Performance Budget */
    "DETECTOR_QUALITY_LOW_MIN": "65",
    "DETECTOR_QUALITY_LOW_TARGET": "75",
    "DETECTOR_QUALITY_MEDIUM_TARGET": "80",
    "DETECTOR_QUALITY_HIGH_TARGET": "90",
    "DETECTOR_FORMATS_LOW": "webp,jpeg",
    "DETECTOR_FORMATS_MEDIUM": "webp,avif,jpeg",
    "DETECTOR_FORMATS_HIGH": "avif,webp,jpeg",
    
    /* Core Settings */
    "DETECTOR_HASH_ALGORITHM": "fnv1a",
    "DETECTOR_LOG_LEVEL": "warn"
  }
}
```

## Configuration Examples

### Quality-Focused Configuration

This configuration prioritizes image quality for high-end devices:

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
    },
    "cascade": {
      "quality": {
        "adjustmentFactors": {
          "fastNetwork": 1.2,
          "dprAdjustment": 7
        }
      }
    }
  }
}
```

### Performance-Focused Configuration

This configuration prioritizes performance and smaller file sizes:

```jsonc
{
  "detector": {
    "performanceBudget": {
      "quality": {
        "low": {
          "min": 55,
          "max": 75,
          "target": 65
        },
        "medium": {
          "min": 60,
          "max": 80,
          "target": 70
        },
        "high": {
          "min": 65,
          "max": 85,
          "target": 75
        }
      }
    },
    "cascade": {
      "quality": {
        "adjustmentFactors": {
          "slowNetwork": 0.75,
          "fastNetwork": 1.0,
          "dprAdjustment": 3
        }
      }
    }
  }
}
```

### Low-Memory Environment

Configuration for running in a memory-constrained environment:

```jsonc
{
  "detector": {
    "cache": {
      "maxSize": 100,
      "pruneAmount": 20,
      "ttl": 300000 // 5 minutes
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

## Environment-Specific Configuration

You can set different configurations for different environments:

```jsonc
{
  "env": {
    "development": {
      "vars": {
        "DETECTOR_CACHE_MAX_SIZE": "500",
        "DETECTOR_LOG_LEVEL": "debug"
      }
    },
    "production": {
      "vars": {
        "DETECTOR_CACHE_MAX_SIZE": "5000",
        "DETECTOR_LOG_LEVEL": "warn",
        "DETECTOR_HASH_ALGORITHM": "fnv1a"
      }
    }
  }
}
```

## Runtime Configuration Loading

The configuration is loaded at runtime from the environment variables:

```typescript
function loadDetectorConfigFromEnv(env: Env): Partial<DetectorConfig> {
  // Initialize with basic properties
  const config: Partial<DetectorConfig> = {
    cache: {
      maxSize: getNumberFromEnv(env, 'DETECTOR_CACHE_MAX_SIZE', 1000),
      pruneAmount: getNumberFromEnv(env, 'DETECTOR_CACHE_PRUNE_AMOUNT', 100),
      enableCache: getBooleanFromEnv(env, 'DETECTOR_CACHE_ENABLE', true),
      ttl: getNumberFromEnv(env, 'DETECTOR_CACHE_TTL', 3600000)
    },
    hashAlgorithm: getHashAlgorithmFromEnv(env, 'DETECTOR_HASH_ALGORITHM', 'simple'),
    logLevel: getLogLevelFromEnv(env, 'DETECTOR_LOG_LEVEL', 'info')
  };
  
  // Load cascade configuration
  const cascade = loadCascadeConfigFromEnv(env);
  if (cascade) {
    config.cascade = cascade;
  }
  
  // ... load other configuration sections
  
  return config;
}
```