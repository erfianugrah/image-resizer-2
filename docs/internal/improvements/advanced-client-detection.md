# Advanced Client Detection Enhancement Plan

## Current State

The current client detection system provides:

- Basic device type detection (mobile, tablet, desktop)
- Client hints parsing for device characteristics
- Format selection based on client capabilities

## Enhancement Goals

1. **Network Quality Estimation**
   - Implement effective connection type (ECT) detection
   - Add bandwidth estimation capabilities
   - Support for save-data header detection

2. **Device Memory Constraints**
   - Detect device memory capabilities 
   - Optimize image size based on memory constraints
   - Add device performance classification

3. **Battery Status Awareness**
   - Detect battery status when possible (via client hints)
   - Adjust processing based on power constraints
   - Implement battery-saving optimizations for low power scenarios

4. **Advanced Format Selection**
   - Enhanced image format compatibility detection
   - Implement Accept header parsing with quality factors
   - Add AVIF and WebP detection improvements

## Implementation Plan

### 1. Network Quality Detection (Phase 1)

```typescript
/**
 * Network quality detection enhancement
 */
interface NetworkQualityInfo {
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
  downlink?: number; // Mbps
  rtt?: number; // ms
  saveBandwidth: boolean;
}

export class NetworkQualityDetector {
  detect(request: Request): NetworkQualityInfo {
    const headers = request.headers;
    
    // Get effective connection type
    const ect = headers.get('ECT') || headers.get('Downlink') || 'unknown';
    
    // Parse downlink if available
    const downlinkStr = headers.get('Downlink');
    const downlink = downlinkStr ? parseFloat(downlinkStr) : undefined;
    
    // Parse RTT if available
    const rttStr = headers.get('RTT');
    const rtt = rttStr ? parseFloat(rttStr) : undefined;
    
    // Check save-data header
    const saveData = headers.get('Save-Data') === 'on';
    
    // Determine effective type based on available data
    let effectiveType: NetworkQualityInfo['effectiveType'] = 'unknown';
    
    if (ect && ['slow-2g', '2g', '3g', '4g'].includes(ect as string)) {
      effectiveType = ect as NetworkQualityInfo['effectiveType'];
    } else if (downlink !== undefined) {
      // Classify based on downlink
      if (downlink < 0.1) effectiveType = 'slow-2g';
      else if (downlink < 0.5) effectiveType = '2g';
      else if (downlink < 2) effectiveType = '3g';
      else effectiveType = '4g';
    }
    
    return {
      effectiveType,
      downlink,
      rtt,
      saveBandwidth: saveData
    };
  }
}
```

### 2. Device Memory Detection (Phase 1)

```typescript
/**
 * Device memory detection enhancement
 */
interface DeviceMemoryInfo {
  memory?: number; // GB
  devicePerformance: 'low' | 'medium' | 'high' | 'unknown';
}

export class DeviceMemoryDetector {
  detect(request: Request): DeviceMemoryInfo {
    const headers = request.headers;
    
    // Parse Device-Memory header if available
    const memoryStr = headers.get('Device-Memory');
    const memory = memoryStr ? parseFloat(memoryStr) : undefined;
    
    // Classify device performance based on memory
    let devicePerformance: DeviceMemoryInfo['devicePerformance'] = 'unknown';
    
    if (memory !== undefined) {
      if (memory < 1) devicePerformance = 'low';
      else if (memory < 4) devicePerformance = 'medium';
      else devicePerformance = 'high';
    }
    
    return {
      memory,
      devicePerformance
    };
  }
}
```

### 3. Battery Status Detection (Phase 2)

```typescript
/**
 * Battery status detection enhancement
 */
interface BatteryInfo {
  batteryState?: 'charging' | 'discharging' | 'unknown';
  batteryLevel?: number; // 0-1
  batteryConstraints: 'none' | 'low' | 'critical' | 'unknown';
}

export class BatteryStatusDetector {
  detect(request: Request): BatteryInfo {
    const headers = request.headers;
    
    // Battery state isn't commonly available in headers yet,
    // but we can prepare for future adoption
    const batteryState = headers.get('Battery-State') as BatteryInfo['batteryState'] || 'unknown';
    
    // Parse battery level if available
    const levelStr = headers.get('Battery-Level');
    const batteryLevel = levelStr ? parseFloat(levelStr) : undefined;
    
    // Determine battery constraints
    let batteryConstraints: BatteryInfo['batteryConstraints'] = 'unknown';
    
    if (batteryState === 'charging') {
      batteryConstraints = 'none';
    } else if (batteryLevel !== undefined) {
      if (batteryLevel < 0.15) batteryConstraints = 'critical';
      else if (batteryLevel < 0.3) batteryConstraints = 'low';
      else batteryConstraints = 'none';
    }
    
    return {
      batteryState,
      batteryLevel,
      batteryConstraints
    };
  }
}
```

### 4. Enhanced Format Selection (Phase 2)

```typescript
/**
 * Enhanced format selection based on Accept headers
 */
interface FormatPreference {
  format: string;
  quality: number;
}

export class FormatPreferenceDetector {
  detect(request: Request): FormatPreference[] {
    const acceptHeader = request.headers.get('Accept') || '';
    
    // Parse Accept header with quality factors
    const formatPreferences: FormatPreference[] = [];
    
    // Split on commas
    const parts = acceptHeader.split(',').map(p => p.trim());
    
    for (const part of parts) {
      // Check for quality factor
      const [format, qualityPart] = part.split(';').map(p => p.trim());
      let quality = 1.0; // Default quality
      
      if (qualityPart && qualityPart.startsWith('q=')) {
        const qValue = parseFloat(qualityPart.substring(2));
        if (!isNaN(qValue) && qValue >= 0 && qValue <= 1) {
          quality = qValue;
        }
      }
      
      // Map image format from MIME type
      let imageFormat = 'unknown';
      
      if (format === 'image/avif') imageFormat = 'avif';
      else if (format === 'image/webp') imageFormat = 'webp';
      else if (format === 'image/png') imageFormat = 'png';
      else if (format === 'image/jpeg' || format === 'image/jpg') imageFormat = 'jpeg';
      else if (format === 'image/gif') imageFormat = 'gif';
      
      if (imageFormat !== 'unknown') {
        formatPreferences.push({
          format: imageFormat,
          quality
        });
      }
    }
    
    // Sort by quality (descending)
    return formatPreferences.sort((a, b) => b.quality - a.quality);
  }
}
```

### 5. Client Detection Service Enhancement (Phase 3)

```typescript
/**
 * Enhanced client detection service
 */
export class EnhancedClientDetectionService implements ClientDetectionService {
  private networkDetector: NetworkQualityDetector;
  private memoryDetector: DeviceMemoryDetector;
  private batteryDetector: BatteryStatusDetector;
  private formatDetector: FormatPreferenceDetector;
  private logger: Logger;
  
  constructor(logger: Logger) {
    this.networkDetector = new NetworkQualityDetector();
    this.memoryDetector = new DeviceMemoryDetector();
    this.batteryDetector = new BatteryStatusDetector();
    this.formatDetector = new FormatPreferenceDetector();
    this.logger = logger;
  }
  
  async detectClient(request: Request): Promise<ClientInfo> {
    // Get base client information (existing implementation)
    const baseInfo = await this.detectBaseClientInfo(request);
    
    // Get enhanced information
    const networkInfo = this.networkDetector.detect(request);
    const memoryInfo = this.memoryDetector.detect(request);
    const batteryInfo = this.batteryDetector.detect(request);
    const formatPreferences = this.formatDetector.detect(request);
    
    // Log detection results
    this.logger.debug('Enhanced client detection results', {
      networkQuality: networkInfo.effectiveType,
      saveBandwidth: networkInfo.saveBandwidth,
      deviceMemory: memoryInfo.memory,
      devicePerformance: memoryInfo.devicePerformance,
      batteryConstraints: batteryInfo.batteryConstraints,
      preferredFormats: formatPreferences.map(pref => `${pref.format}:${pref.quality}`).join(',')
    });
    
    // Merge with base client info
    return {
      ...baseInfo,
      networkQuality: networkInfo.effectiveType,
      saveBandwidth: networkInfo.saveBandwidth,
      deviceMemory: memoryInfo.memory,
      devicePerformance: memoryInfo.devicePerformance,
      batteryConstraints: batteryInfo.batteryConstraints,
      formatPreferences: formatPreferences
    };
  }
  
  // Other methods...
}
```

### 6. Transformation Optimization (Phase 3)

```typescript
/**
 * Enhanced transformation option generation based on client detection
 */
export function generateOptimizedOptions(
  clientInfo: ClientInfo,
  baseOptions: TransformOptions,
  config: Config
): TransformOptions {
  const options = { ...baseOptions };
  
  // Apply network quality optimizations
  if (clientInfo.networkQuality === 'slow-2g' || clientInfo.networkQuality === '2g' || clientInfo.saveBandwidth) {
    // For very slow connections, reduce quality and dimensions
    options.quality = Math.min(options.quality || 80, 60);
    options.width = Math.min(options.width || 2000, 1000);
    options.height = Math.min(options.height || 2000, 1000);
    
    // Prefer more efficient formats
    if (!options.format || options.format === 'auto') {
      options.format = 'webp';
    }
  } else if (clientInfo.networkQuality === '3g') {
    // For medium connections, slightly reduce quality
    options.quality = Math.min(options.quality || 80, 70);
  }
  
  // Apply device memory optimizations
  if (clientInfo.devicePerformance === 'low') {
    // For low-memory devices, limit dimensions
    options.width = Math.min(options.width || 2000, 1200);
    options.height = Math.min(options.height || 2000, 1200);
  }
  
  // Apply battery optimizations
  if (clientInfo.batteryConstraints === 'critical' || clientInfo.batteryConstraints === 'low') {
    // For low battery, prioritize efficiency over quality
    options.quality = Math.min(options.quality || 80, 65);
    
    // Prefer more efficient formats
    if (!options.format || options.format === 'auto') {
      options.format = 'webp';
    }
  }
  
  // Apply format preferences
  if ((!options.format || options.format === 'auto') && clientInfo.formatPreferences?.length > 0) {
    // Use the highest quality supported format
    options.format = clientInfo.formatPreferences[0].format;
  }
  
  return options;
}
```

## Testing Strategy

1. **Unit Tests**
   - Test individual detectors with mocked request headers
   - Verify correct parsing of various header formats
   - Test edge cases and fallback behavior

2. **Integration Tests**
   - Test the enhanced client detection service with realistic requests
   - Verify optimization function produces correct transformations
   - Test integration with transformation service

3. **Performance Tests**
   - Measure overhead of enhanced detection
   - Verify detection doesn't impact response time significantly
   - Test with high request volumes

## Implementation Roadmap

### Phase 1 (1-2 weeks)
- Implement NetworkQualityDetector and DeviceMemoryDetector
- Update ClientInfo interface
- Add basic optimizations based on network quality

### Phase 2 (2-3 weeks)
- Add BatteryStatusDetector
- Implement FormatPreferenceDetector
- Enhance ClientDetectionService

### Phase 3 (2-3 weeks)
- Implement advanced optimization strategies
- Create comprehensive test suite
- Measure impact on image quality and performance

This advanced client detection enhancement plan will significantly improve the image resizer's ability to adapt to different client capabilities, network conditions, and device constraints, resulting in a better user experience across a wide range of devices and network conditions.