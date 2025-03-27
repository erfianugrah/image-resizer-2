# Detector Service

The DetectorService is a key component in the image-resizer architecture that handles client capability detection. It provides a unified, performant framework for detecting browser capabilities, device types, and network conditions to optimize image delivery.

## Overview

The DetectorService is responsible for:

1. Identifying browsers and their versions 
2. Detecting support for modern image formats (WebP, AVIF)
3. Assessing network quality using client hints
4. Determining device capabilities and constraints
5. Providing optimized transformation options based on client properties
6. Caching detection results for performance

## Service Architecture

The DetectorService follows a service-oriented design and implements the `ClientDetectionService` interface from `interfaces.ts`. It's designed with performance in mind and includes:

- A base implementation (`DetectorServiceImpl`)
- An optimized implementation (`OptimizedDetectorService`) with specialized caching
- A factory (`detectorServiceFactory.ts`) that selects the appropriate implementation

### Base Service Implementation

The base `DetectorServiceImpl` provides comprehensive client detection capabilities:

```typescript
class DetectorServiceImpl implements ClientDetectionService {
  // Core detection methods
  async detectClient(request: Request): Promise<ClientInfo>;
  async getOptimizedOptions(request: Request, baseOptions: TransformOptions, config: ImageResizerConfig): Promise<TransformOptions>;
  async supportsFormat(request: Request, format: string): Promise<boolean>;
  async getDeviceClassification(request: Request): Promise<'high-end' | 'mid-range' | 'low-end'>;
  async getNetworkQuality(request: Request): Promise<'fast' | 'medium' | 'slow'>;
  clearCache(): void;
  
  // Helper methods for parsing and analyzing
  private parseClientHints(request: Request): ClientHintsData;
  private detectDeviceType(userAgent: string, clientHints: ClientHintsData): 'mobile' | 'tablet' | 'desktop' | 'unknown';
  // ... and more
}
```

### Optimized Implementation 

The `OptimizedDetectorService` extends the base implementation with specialized caching and optimizations:

```typescript
class OptimizedDetectorService extends DetectorServiceImpl {
  // Specialized format check caching
  private acceptsWebpCache: Map<string, boolean>;
  private acceptsAvifCache: Map<string, boolean>;
  
  override async supportsFormat(request: Request, format: string): Promise<boolean>;
  override clearCache(): void;
}
```

## Usage Examples

### Basic Detection

```typescript
// Get client information
const clientInfo = await detectorService.detectClient(request);

// Check device type
if (clientInfo.deviceType === 'mobile') {
  // Apply mobile-specific handling
}

// Check format support
if (clientInfo.acceptsWebp) {
  // Use WebP format for better compression
}
```

### Optimized Transformations

```typescript
// Get optimized transformation options
const baseOptions = { width: 800, height: 600 };
const optimizedOptions = await detectorService.getOptimizedOptions(
  request,
  baseOptions,
  config
);

// Apply transformations with optimized options
const transformedImage = await transformService.transformImage(
  request,
  storageResult,
  optimizedOptions,
  config
);
```

### Device Classification

```typescript
// Get device classification
const deviceClass = await detectorService.getDeviceClassification(request);

// Adjust quality based on device capabilities
let quality = 80;
if (deviceClass === 'high-end') {
  quality = 90;
} else if (deviceClass === 'low-end') {
  quality = 70;
}
```

## Configuration

The DetectorService is configurable through the standard configuration mechanisms:

```typescript
// Example configuration
const config = {
  detector: {
    cache: {
      maxSize: 1000,       // Maximum cache entries
      pruneAmount: 100,    // How many to prune when full
      enableCache: true,   // Enable caching
      ttl: 300000          // Cache TTL in milliseconds
    },
    // Format detection strategies
    strategies: {
      clientHints: { enabled: true, priority: 100 },
      acceptHeader: { enabled: true, priority: 80 },
      userAgent: { enabled: true, priority: 60 }
    },
    logLevel: 'info'
  },
  performance: {
    optimizedClientDetection: true  // Use optimized implementation
  }
};
```

## Integration

The DetectorService is integrated with the dependency injection system:

```typescript
// Get service from the container
const container = createContainerBuilder(env);
const services = container.createServiceContainer();
const detector = services.detectorService;

// Or directly from the factory
const logger = createLogger(config, 'DetectorService');
const detector = createDetectorService(config, logger);
```

## Browser Format Support

The service includes a comprehensive database of browser support for modern image formats:

- WebP support for all major browsers
- AVIF support for Chrome 85+, Firefox 93+, Safari 16.1+
- Fallback detection for other browsers and environments

## Performance Considerations

- The DetectorService uses an in-memory LRU cache to avoid recomputing results
- Format detection results are cached with specialized data structures
- Cache pruning occurs automatically when the cache exceeds configured limits
- An optimized implementation provides further performance enhancements for high-traffic scenarios

## Migration Guide

The DetectorService is designed to replace the older utility-based approach and provides a more robust, service-oriented architecture. To migrate from the previous approach:

1. Replace direct imports from `utils/detector.ts` with service container usage
2. Update code that uses the detector utility functions to use the service methods
3. For shared services, access the detector through the service container
4. For standalone usage, create an instance using the `createDetectorService` factory

```typescript
// Before
import { detector } from '../utils/detector';
const clientCapabilities = await detector.detect(request);

// After
const clientInfo = await services.detectorService.detectClient(request);
```