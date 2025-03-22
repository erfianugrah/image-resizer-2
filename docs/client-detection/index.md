# Client Detection Framework

The Client Detection Framework is a key component of the Image Resizer that enables intelligent format and quality selection based on browser capabilities, device characteristics, and network conditions.

## In This Section

- [Architecture](architecture.md) - Technical architecture of the cascade system
- [Configuration](configuration.md) - Configuration options and examples
- [Cascade System](cascade-system.md) - Detailed explanation of the cascade decision process
- [Browser Compatibility](browser-compatibility.md) - Browser support information
- [Migration Guide](migration-guide.md) - Migrating from the scoring system to the cascade system

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Core Architecture](../core/architecture.md)
- [Transformation Guide](../core/transformation.md)
- [Configuration Reference](../core/configuration-reference.md)

## Overview

This system uses a cascading priority approach to determine the optimal image format and quality settings for each request. It analyzes information from multiple sources in a prioritized manner:

1. Client Hints (when available)
2. Accept Headers (for format support)
3. User-Agent detection (as fallback)
4. Configuration defaults (when no other information is available)

## Key Features

- **Format Selection Cascade**: Prioritizes the most reliable signals for format selection
- **Quality Selection Cascade**: Uses network conditions and device capabilities to determine optimal quality
- **Device Capability Detection**: Analyzes device memory, processors, and screen characteristics
- **Network Quality Assessment**: Evaluates network conditions for appropriate optimizations
- **Configurable Priority System**: All cascade priorities and thresholds are configurable
- **Comprehensive Logging**: Detailed breadcrumb logs of all detection and decision steps

## Benefits

- **Better Browser Support**: Works correctly with browsers that have limited client hint support (e.g., Firefox)
- **Network-Aware Optimization**: Adjusts image quality based on network conditions
- **Device-Aware Optimization**: Considers device capabilities for format and quality selection
- **Transparent Decision Process**: Logs why specific formats and quality settings were chosen
- **Full Configurability**: All aspects of the detection and decision process can be configured

## Documentation Sections

- [Architecture](architecture.md) - Technical architecture of the cascade system
- [Configuration](configuration.md) - Configuration options and examples
- [Cascade System](cascade-system.md) - Detailed explanation of the cascade decision process
- [Browser Compatibility](browser-compatibility.md) - Browser support information
- [Migration Guide](migration-guide.md) - Migrating from the scoring system to the cascade system

## Integration Points

The Client Detection Framework integrates with the main image resizer through:

1. The transform pipeline, which uses the detector for format and quality decisions
2. The debug system, which displays detection results in debug headers
3. The configuration system, which allows customization of all detection parameters

## Usage Examples

```typescript
// Basic usage in transform.ts
const detector = new ClientDetector(request, config.detector);
const deviceInfo = detector.detect();

// Using the cascade system for format selection
const format = detector.getOptimalFormat(originalFormat, {
  auto: true,
  userPreference: requestedFormat
});

// Using the cascade system for quality selection
const quality = detector.getOptimalQuality(format, {
  auto: true,
  userPreference: requestedQuality,
  defaultQuality: 80
});
```

## Related Resources

- [Core Architecture: Client Detection](../core/architecture.md#6-image-transformation-transformts)
- [Transformation Guide](../core/transformation.md)
- [Configuration Reference: Client Detection](../core/configuration-reference.md)
- [Debug Headers](../debugging/debug-headers.md)
- [Performance Optimization](../debugging/diagnosing-timeouts.md)

---

*Last Updated: March 22, 2025*