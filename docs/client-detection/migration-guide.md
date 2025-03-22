# Migration Guide: Scoring to Cascade System

This guide helps you migrate from the previous device scoring system to the new cascade-based client detection framework.

## Overview of Changes

The client detection system has evolved from a scoring-based approach to a more reliable cascade-based system:

### Previous Scoring System

- Used a numerical scoring system (0-100)
- Combined multiple signals into a single score
- Based device class on score thresholds
- Made decisions based on device class
- Used platform-based scoring as a major factor

### New Cascade System

- Uses prioritized detection methods
- Considers signals separately for different decisions
- Makes format and quality decisions independently
- Prioritizes explicit signals over inferred ones
- Provides better transparency in decision-making

## Core Differences

| Aspect | Scoring System | Cascade System |
|--------|---------------|----------------|
| Decision Model | Single score → device class → decisions | Multiple signals → independent decisions |
| Priority Mechanism | Weighted scoring | Explicit priority order |
| Configurability | Limited to thresholds | Fully configurable priorities and parameters |
| Transparency | Difficult to trace why decisions were made | Clear breadcrumb logs of decision process |
| Fallback Logic | Implicit in scoring | Explicit in cascade configuration |
| Browser Compatibility | Sometimes unreliable for Firefox | Reliable across all browsers |

## Backward Compatibility

The cascade system maintains backward compatibility in several ways:

1. **Device Scoring Preserved**: The `device.score` property is still calculated and available
2. **Device Class API**: The `device.class` property maps to same class thresholds
3. **Format Selection**: Yields the same results for most browsers
4. **Quality Selection**: Maintains similar quality levels for each device class

## Configuration Migration

### Converting Scoring Configuration to Cascade Configuration

If you have custom scoring configuration, here's how to migrate it:

#### Previous Configuration:

```jsonc
{
  "detector": {
    "deviceClassification": {
      "thresholds": {
        "lowEnd": 30,
        "highEnd": 70
      },
      "platformScores": {
        "iOS": 70,
        "macOS": 70,
        "Windows": 50,
        "Android": 40,
        "Linux": 60,
        "Chrome OS": 50
      }
    }
  }
}
```

#### New Cascade Configuration:

```jsonc
{
  "detector": {
    // Keep the device classification for backward compatibility
    "deviceClassification": {
      "thresholds": {
        "lowEnd": 30,
        "highEnd": 70
      }
    },
    // Add cascade configuration
    "cascade": {
      "format": {
        "enabled": true,
        "acceptHeaderPriority": 100,
        "clientHintsPriority": 80,
        "browserDetectionPriority": 60,
        "fallbackFormat": "jpeg"
      },
      "quality": {
        "enabled": true,
        "saveDataPriority": 100,
        "networkConditionPriority": 80,
        "deviceCapabilityPriority": 60,
        "dprAdjustmentEnabled": true,
        "deviceMemoryThresholds": {
          "high": 8,
          "low": 2
        },
        "processorThresholds": {
          "high": 8,
          "low": 2
        },
        "adjustmentFactors": {
          "slowNetwork": 0.85,
          "fastNetwork": 1.1,
          "dprAdjustment": 5
        }
      }
    }
  }
}
```

## Code Migration Examples

### Accessing Device Information

#### Before:

```typescript
const detector = new ClientDetector(request);
const info = detector.detect();

// Using device class for decisions
if (info.device.class === 'high') {
  // Use high quality settings
} else if (info.device.class === 'low') {
  // Use low quality settings
} else {
  // Use medium quality settings
}
```

#### After:

```typescript
const detector = new ClientDetector(request, config.detector);
const info = detector.detect();

// Direct quality and format decisions
const format = detector.getOptimalFormat(originalFormat, {
  auto: true,
  userPreference: requestedFormat
});

const quality = detector.getOptimalQuality(format, {
  auto: true,
  userPreference: requestedQuality,
  defaultQuality: 80
});

// Device class still available for backward compatibility
if (info.device.class === 'high') {
  // Still works as before
}
```

### Format Selection

#### Before:

```typescript
function getFormat(info, requestedFormat) {
  if (requestedFormat && requestedFormat !== 'auto') {
    return requestedFormat;
  }
  
  // Class-based decision
  if (info.device.class === 'high' && info.formats.avif) {
    return 'avif';
  } else if (info.formats.webp) {
    return 'webp';
  } else {
    return 'jpeg';
  }
}
```

#### After:

```typescript
// Let the cascade system handle it
const format = detector.getOptimalFormat(originalFormat, {
  auto: true,
  userPreference: requestedFormat
});
```

### Quality Selection

#### Before:

```typescript
function getQuality(info, format, requestedQuality) {
  if (requestedQuality && requestedQuality !== 'auto') {
    return requestedQuality;
  }
  
  // Class and format based quality
  if (info.device.class === 'high') {
    return format === 'avif' ? 75 : 85;
  } else if (info.device.class === 'low') {
    return format === 'avif' ? 65 : 75;
  } else {
    return format === 'avif' ? 70 : 80;
  }
}
```

#### After:

```typescript
// Let the cascade system handle it
const quality = detector.getOptimalQuality(format, {
  auto: true,
  userPreference: requestedQuality
});
```

## Testing Your Migration

To verify that your migration to the cascade system works correctly:

1. **Compare Results**: Run both systems side by side and compare the results
2. **Check Logs**: Review the breadcrumb logs to understand cascade decisions
3. **Test Edge Cases**: Specifically test with Firefox (which has limited client hint support)
4. **Verify Performance**: Ensure detection performance remains acceptable

### Testing Script

```javascript
// Testing migration
const oldDetector = createLegacyDetector(request);
const newDetector = new ClientDetector(request, config.detector);

const oldResult = oldDetector.detect();
const newResult = newDetector.detect();

console.log('Old System Format:', oldResult.getOptimalFormat());
console.log('New System Format:', newDetector.getOptimalFormat());

console.log('Old System Quality:', oldResult.getOptimalQuality('webp'));
console.log('New System Quality:', newDetector.getOptimalQuality('webp'));

console.log('Old Device Class:', oldResult.device.class);
console.log('New Device Class:', newResult.device.class);

console.log('Old Device Score:', oldResult.device.score);
console.log('New Device Score:', newResult.device.score);
```

## Benefits of Migration

By migrating to the cascade system, you gain:

1. **Better Browser Support**: More reliable format detection, especially for Firefox
2. **Network Awareness**: Quality adjustments based on network conditions
3. **Save-Data Respect**: Proper handling of the Save-Data header
4. **Improved Debugging**: Clear breadcrumb logs of decision process
5. **Better Configurability**: Fine-grained control over detection priorities
6. **More Transparent Decisions**: Easier to understand why a specific format or quality was chosen

## Common Issues and Solutions

### Issue: Format selection differs from previous system

**Solution**: Check the cascade priorities and browser detection. The cascade system might be making a better decision based on more accurate browser capability detection.

### Issue: Quality values differ from previous system

**Solution**: The cascade system considers more factors (network, memory, DPR). Adjust the quality adjustment factors and thresholds to match your desired behavior.

### Issue: Performance impact of the new system

**Solution**: Ensure caching is enabled and configured properly. The cascade system caches detection results for improved performance.

### Issue: Debugging cascade decisions

**Solution**: Enable debug mode and check the breadcrumb logs. The cascade system provides detailed logging of its decision process.