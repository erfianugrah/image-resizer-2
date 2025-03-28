# Client Detection Architecture

The Client Detection framework uses a modular, strategy-based architecture to determine browser capabilities, device characteristics, and network conditions.

## System Overview

The system consists of several key components:

```
┌───────────────────────────────────────────────────────────┐
│                    Client Detector                        │
├───────────────┬───────────────────────┬──────────────────┤
│ Detection     │ Cascade Decision      │ Performance      │
│ Strategies    │ System                │ Budget           │
├───────────────┼───────────────────────┼──────────────────┤
│ Cache         │ Device Classification │ Format Support   │
│ Manager       │ System                │ Database         │
└───────────────┴───────────────────────┴──────────────────┘
```

### Key Components

1. **Client Detector**: Main entry point that coordinates all detection activities
2. **Detection Strategies**: Pluggable strategies for different detection methods
3. **Cascade Decision System**: Priority-based decision making system
4. **Performance Budget**: Quality and dimension constraints based on device class
5. **Cache Manager**: Caches detection results for performance
6. **Device Classification**: Categorizes devices into capability tiers
7. **Format Support Database**: Browser compatibility data for image formats

## Detection Strategy Pattern

The system uses a strategy pattern to support multiple detection methods:

```typescript
interface DetectionStrategy {
  priority: number;
  name: string;
  detect(request: Request, options?: DetectionOptions): Promise<DetectionResult>;
  isAvailable(request: Request): boolean;
}
```

Implemented strategies include:

- **ClientHintsStrategy**: Uses Client Hints headers
- **AcceptHeaderStrategy**: Uses Accept headers
- **UserAgentStrategy**: Uses User-Agent header
- **StaticDataStrategy**: Uses static browser compatibility data
- **DefaultsStrategy**: Provides fallback defaults

Strategies are executed in priority order, with higher numbers indicating higher priority.

## Cascade Decision System

The cascade system makes format and quality decisions based on multiple inputs:

```typescript
interface CascadeConfig {
  format: {
    enabled: boolean;
    acceptHeaderPriority: number;
    clientHintsPriority: number; 
    browserDetectionPriority: number;
    fallbackFormat: string;
  };
  quality: {
    enabled: boolean;
    saveDataPriority: number;
    networkConditionPriority: number;
    deviceCapabilityPriority: number;
    dprAdjustmentEnabled: boolean;
    deviceMemoryThresholds: {
      high: number;
      low: number;
    };
    processorThresholds: {
      high: number;
      low: number;
    };
    adjustmentFactors: {
      slowNetwork: number;
      fastNetwork: number;
      dprAdjustment: number;
    };
  };
}
```

## Data Flow

The diagram below illustrates the data flow through the system:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│   HTTP      │    │  Detection  │    │    Cascade      │
│  Request    ├───►│ Strategies  ├───►│   Decision      │
└─────────────┘    └─────────────┘    │    System       │
                                      └────────┬────────┘
                                               │
┌─────────────┐    ┌─────────────┐    ┌────────▼────────┐
│ Transformed │    │   Image     │◄───┤  Format and     │
│  Response   │◄───┤ Transformer │    │ Quality Decision│
└─────────────┘    └─────────────┘    └─────────────────┘
```

## Caching Architecture

Detection results are cached for performance:

```typescript
interface CacheConfig {
  maxSize: number;     // Maximum cache entries
  pruneAmount: number; // How many to prune when limit reached
  enableCache: boolean; // Allow disabling cache entirely
  ttl?: number;        // Optional TTL in milliseconds
}
```

The cache uses request properties as keys and has an LRU (Least Recently Used) eviction policy.

## Device Classification

Devices are classified into three tiers:

1. **Low**: Limited capabilities, optimization for size and performance
2. **Medium**: Standard capabilities, balanced optimization
3. **High**: Advanced capabilities, optimization for quality

Classification is based on:
- Device memory
- Processor cores
- Browser capabilities
- Platform information

## Format Support Database

The format support database provides information about which browsers support which image formats:

```typescript
interface FormatSupport {
  avif: boolean;
  webp: boolean;
  webpLossless?: boolean;
  webpAlpha?: boolean;
  jpeg2000?: boolean;
  jpegXl?: boolean;
}
```

The database is generated from the @mdn/browser-compat-data package to ensure up-to-date information.

## Integration with Transform Pipeline

The detector integrates with the image transformation pipeline:

```typescript
// In transform.ts
export async function transformImage(request: Request, imageData: ArrayBuffer, options?: TransformOptions) {
  // Initialize detector with configuration
  const detector = new ClientDetector(request, config.detector);
  
  // Detect client capabilities
  const detection = await detector.detect();
  
  // Use detector for format selection
  const format = options.format === 'auto' 
    ? detector.getOptimalFormat(originalFormat) 
    : options.format;
    
  // Use detector for quality selection
  const quality = options.quality === 'auto'
    ? detector.getOptimalQuality(format)
    : options.quality;
    
  // Apply other transformations
  // ...
}
```

## Performance Considerations

The system includes several optimizations:

1. **Caching**: Results are cached to avoid repeated detection
2. **Lazy Loading**: Strategies are loaded only when needed
3. **Early Returns**: Higher priority methods can skip lower priority ones
4. **Configurable Limits**: Parsing limits to avoid excessive CPU usage

## Error Handling

The system uses a fallback approach for error handling:

1. If a strategy fails, it logs the error and returns null
2. The detector moves to the next strategy in priority order
3. If all strategies fail, default values are used
4. Errors are included in logs for debugging

## Debugging and Logging

The system includes comprehensive logging:

```
BREADCRUMB: Initial optimizations from client hints
Data: {
  hasFormat: false,
  hasQuality: false,
  hasDpr: false,
  hasWidth: false,
  hasHeight: false,
  optimizedParams: "networkQuality,deviceCapabilities,performanceBudget"
}

BREADCRUMB: Determining optimized format using cascading priority
Data: {
  autoFormat: true,
  cascadeEnabled: true,
  acceptHeaderSource: false,
  browserSource: "user-agent",
  avifSupport: true,
  webpSupport: true
}
```

Debug information is available through:
1. Console logs (controlled by log level)
2. Debug HTTP headers (when debug mode is enabled)
3. Breadcrumb traces in logs