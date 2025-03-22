# Client Detection Enhancement Plan

This document outlines the plan for enhancing client detection in the image-resizer-2 project with better browser compatibility data and client hints support.

## Goals

- Improve browser format support detection accuracy
- Add comprehensive client hints support
- Maintain full backward compatibility
- Consolidate detection logic in reusable modules
- Optimize image delivery based on device capabilities

## Phase 1: Enhanced Browser Compatibility Data ✅

- [x] Replace caniuse-db with @mdn/browser-compat-data 
- [x] Update browser-formats.ts generation script
- [x] Maintain backwards compatibility with existing API
- [x] Ensure typechecking passes
- [x] Test with various browser user agents

## Phase 2: Client Hints Integration ✅

- [x] Create `client-hints.ts` utility module
- [x] Implement basic client hint parsing (DPR, Viewport-Width)
- [x] Add browser support detection for client hints
- [x] Create header application utility for responses
- [x] Integrate with existing User-Agent detection as fallback
- [x] Update transform.ts to check client hints before User-Agent

## Phase 3: Network and Device Awareness ✅

- [x] Implement network quality detection (Downlink, RTT, ECT)
- [x] Add connection-aware quality adjustments
- [x] Create adaptive transform pipeline based on network conditions
- [x] Implement Save-Data preference handling
- [x] Add device memory and hardware concurrency detection
- [x] Create performance budget calculations based on device capabilities

## Phase 4: Advanced Format and Experience Optimization ✅

- [x] Implement format support detection from client hints
- [x] Add responsive image dimension calculation
- [x] Create viewport-aware resizing strategies
- [x] Implement color scheme preference detection
- [x] Add reduced motion preference support for animations
- [x] Create device-capability-aware quality presets

## Phase 5: Consolidation and Optimization ✅

- [x] Create unified browser detection flow
- [x] Implement detection strategy pattern
- [x] Cache detection results when possible 
- [x] Add detection metrics to debug output
- [x] Optimize detection performance
- [x] Integrate detector framework with transform pipeline

## Integration Points

### transform.ts ✅
- [x] Replace direct client hints usage with unified detector
- [x] Update `getFormat()` to use detector for format support
- [x] Integrate metrics collection for performance monitoring
- [x] Replace manual browser detection with strategy pattern
- [x] Maintain backward compatibility with existing functionality

### index.ts
- Add client hint request headers
- Apply client hint headers to responses
- Pass client hint data to transform function

### cache.ts
- Add cache variations based on client capabilities
- Consider Vary header for client hints

## Client Hints to Implement

1. **Core Rendering Capabilities**
   - `DPR` - Device Pixel Ratio for resolution adjustment
   - `Viewport-Width` - For responsive sizing
   - `Width` - For specific width constraints
   - `Sec-CH-Prefers-Color-Scheme` - User color scheme preference
   - `Sec-CH-Prefers-Reduced-Motion` - Motion preference

2. **Browser Identification**
   - `Sec-CH-UA` - Browser brand and version information
   - `Sec-CH-UA-Mobile` - Mobile device detection
   - `Sec-CH-UA-Platform` - Operating system
   - `Sec-CH-UA-Arch` - CPU architecture
   - `Sec-CH-UA-Bitness` - CPU architecture bitness

3. **Network and Preferences**
   - `Save-Data` - User preference for reduced data
   - `ECT` - Effective Connection Type (4g, 3g, 2g, slow-2g)
   - `Downlink` - Approximate bandwidth in Mbps
   - `RTT` - Round-trip time in milliseconds (latency)

4. **Device Capabilities**
   - `Device-Memory` - Approximate RAM in GB
   - `Hardware-Concurrency` - Number of logical processors
   - `Sec-CH-Width` - Physical screen width
   - `Sec-CH-Device-Memory` - Device memory
   - `Sec-CH-Viewport-Height` - Viewport height

## Fallback Strategy

1. Check for client hint support and use when available
2. Fall back to Accept headers for format support
3. Use User-Agent string as tertiary detection method
4. Use static browser compatibility data as final fallback
5. Apply sensible defaults when no detection is possible

## Success Metrics

- Improved format selection accuracy
- Reduced average image size
- Better responsive behavior
- Maintained or improved performance
- Full backward compatibility

## Optimization Strategies

### Network-Aware Optimizations
- Low RTT: Prioritize quality and format fidelity
- High RTT: Aggressive compression, reduced dimensions
- Low Downlink: Smaller file sizes, lower quality settings
- Save-Data: Honor user preference with minimal viable quality

### Device-Aware Optimizations
- Low Memory: Avoid complex transforms, limit dimensions
- Mobile Devices: Optimize for both screen size and bandwidth
- High-DPR Displays: Balance quality and file size
- CPU Architecture: Consider decoding/rendering capabilities

### Format Selection Matrix by Capability Score
| Priority | High Score (65+) | Medium Score (35-64) | Low Score (<35) |
|----------|----------------|-----------------|----------------|
| 1 | AVIF (high quality) | WebP (medium quality) | WebP (low quality) |
| 2 | WebP (high quality) | WebP (low quality) | JPEG (low quality) |
| 3 | JPEG (high quality) | JPEG (medium quality) | GIF (static only) |

### Quality Adjustment Signals
- Memory: More memory = higher quality and more complex formats
- CPU Cores: More cores = better ability to decode complex formats
- Network Quality: Better network = higher quality images
- DPR: Higher DPR = higher base quality needed
- Viewport: Smaller viewport = lower quality acceptable
- Save-Data: Enable = lowest acceptable quality
- RTT: Higher latency = more aggressive optimization