# Aspect Crop Metadata Optimization

## Problem Statement

Performance analysis of the image-resizer service reveals that metadata fetching (428ms) is triggered unnecessarily when all transformation parameters are already known.

Specifically, when both:
1. An aspect ratio parameter (`r=21:9`) is specified
2. A width is available (either via `width=` or format code like `f=m` which sets width=700)

The system still performs a full metadata fetch operation, even though it already has all necessary information to calculate the target dimensions.

From the logs:
```
(log) [INFO] ­ƒöÂ BREADCRUMB: Applied custom format size { formatCode: 'm', width: 700 }
(log) [INFO] ­ƒöÂ BREADCRUMB: Applied compact aspect ratio parameter { r: '21:9', aspect: '21:9' }
...
(debug) { time: 1743158152567, level: 20, aspect: '21:9', message: 'Metadata required: aspect ratio parameter detected' }
```

And later:
```
(debug) { time: 1743158152635, level: 20, requestedWidth: 700, calculatedHeight: 300, targetRatio: 2.3333333333333335, ... }
```

The metadata fetch adds ~428ms latency to every such request, despite having all information needed (width and aspect ratio) to calculate the height directly.

## Proposed Solution: Early Parameter Evaluation

We need to optimize the logic that determines when metadata is required, making it aware of the complete set of transformation parameters.

### Implementation Approach

#### 1. Update Metadata Requirement Check

```typescript
/**
 * Determines if metadata is truly required for the current transformation
 */
function isMetadataRequired(options: TransformOptions): boolean {
  // Case: Aspect ratio specified (r= or aspect=)
  if (options.aspect) {
    // Check if we already have width or height
    const hasWidth = options.width !== undefined && options.width !== null;
    const hasHeight = options.height !== undefined && options.height !== null;
    
    // If we have either width or height plus aspect ratio,
    // we can calculate the other dimension without metadata
    if (hasWidth || hasHeight) {
      return false; // No metadata needed
    }
    
    // If we don't have width or height, we still need metadata
    return true;
  }
  
  // Case: Focal point without dimensions
  if (options.focal && !options.width && !options.height) {
    return true;
  }
  
  // Other cases that might need metadata
  // (existing logic for other transformations)
  // ...
  
  // Default - no metadata needed for simple transformations
  return false;
}
```

#### 2. Modify the Transformation Service

```typescript
/**
 * Main transformation options building function
 */
async buildTransformOptions(
  options: TransformOptions,
  imagePath: string,
  config: ImageResizerConfig,
  env: Env,
  request: Request
): Promise<TransformOptions> {
  // Extract and normalize all parameters first
  // This includes parsing format codes like 'f=m' into actual width values
  const normalizedOptions = this.normalizeOptions(options);
  
  // Early check - do we have all the information we need already?
  if (!this.isMetadataRequired(normalizedOptions)) {
    this.logger.debug('Skipping metadata fetch - all required parameters available', {
      hasWidth: !!normalizedOptions.width,
      hasHeight: !!normalizedOptions.height,
      hasAspect: !!normalizedOptions.aspect,
      calculatedDirectly: true
    });
    
    // Calculate any derived dimensions directly
    return this.calculateDimensionsWithoutMetadata(normalizedOptions);
  }
  
  // If we do need metadata, continue with the existing fetch path
  this.logger.debug('Metadata required for transformation', {
    imagePath,
    reason: this.getMetadataRequirementReason(normalizedOptions)
  });
  
  // Existing metadata fetch logic...
  
  return await this.calculateDimensionsWithMetadata(
    normalizedOptions, metadata, imagePath
  );
}

/**
 * Calculate dimensions without needing metadata
 */
private calculateDimensionsWithoutMetadata(
  options: TransformOptions
): TransformOptions {
  const result = { ...options };
  
  // Calculate missing dimension if we have aspect ratio
  if (options.aspect) {
    // Parse aspect ratio (e.g., "21:9")
    const [aspectWidth, aspectHeight] = options.aspect.split(':').map(Number);
    const aspectRatio = aspectWidth / aspectHeight;
    
    // If we have width but not height, calculate height
    if (options.width && !options.height) {
      result.height = Math.round(options.width / aspectRatio);
      this.logger.debug('Calculated height from width and aspect ratio', {
        width: options.width,
        aspectRatio,
        calculatedHeight: result.height
      });
    }
    // If we have height but not width, calculate width
    else if (!options.width && options.height) {
      result.width = Math.round(options.height * aspectRatio);
      this.logger.debug('Calculated width from height and aspect ratio', {
        height: options.height,
        aspectRatio,
        calculatedWidth: result.width
      });
    }
    
    // Set fit to crop for aspect ratio
    result.fit = 'crop';
  }
  
  // Process focal point if provided
  if (options.focal && options.width && options.height) {
    const [x, y] = options.focal.split(',').map(parseFloat);
    result.gravity = { x, y };
  }
  
  return result;
}

/**
 * Get a descriptive reason why metadata is required
 */
private getMetadataRequirementReason(
  options: TransformOptions
): string {
  if (options.aspect && !options.width && !options.height) {
    return 'aspect ratio without dimensions';
  }
  
  if (options.focal && !options.width && !options.height) {
    return 'focal point without dimensions';
  }
  
  // ... other reasons
  
  return 'unknown requirement';
}
```

#### 3. Normalize Parameters Early

Ensure format codes and other indirect parameters are processed early:

```typescript
/**
 * Normalize all parameters to explicit values
 */
private normalizeOptions(options: TransformOptions): TransformOptions {
  const normalized = { ...options };
  
  // Process format codes into width values
  if (options.formatCode) {
    const width = this.getWidthFromFormatCode(options.formatCode);
    if (width && !normalized.width) {
      normalized.width = width;
      this.logger.debug('Applied width from format code', {
        formatCode: options.formatCode,
        width
      });
    }
  }
  
  // Process compact parameters
  if (options.r && !normalized.aspect) {
    normalized.aspect = options.r;
  }
  
  if (options.p && !normalized.focal) {
    normalized.focal = options.p;
  }
  
  // ... other normalizations
  
  return normalized;
}
```

## Safety and Functionality Considerations

This optimization requires careful implementation to ensure safety:

### 1. Parameter Order Independence

The solution must work regardless of the order in which parameters appear in the URL:
- If `f=m` comes before `r=21:9` in parsing
- If `r=21:9` comes before `f=m` in parsing
- If either parameter is specified via another mechanism

Solution: Normalize all parameters before making metadata decisions.

### 2. Complete Parameter Collection

Ensure all ways of specifying dimensions are considered:
- Direct parameters (`width=`, `height=`)
- Format codes (`f=m` → width=700)
- Derivative presets (`/thumbnail/image.jpg` → predefined dimensions)
- Device-specific dimensions

Solution: Comprehensive normalization in a single place before evaluating metadata requirements.

### 3. Backwards Compatibility

Maintain exact same visual results:
- The calculated dimensions must match what would have been used with metadata
- Edge cases must be handled consistently

Solution: Thoroughly test with various parameter combinations.

### 4. Proper Logging

Add detailed logs to:
- Track when metadata fetching is skipped
- Record dimension calculations
- Enable monitoring of the optimization's effectiveness

### 5. Graceful Degradation

If any issues occur with parameter processing:
- Fall back to the metadata fetching path
- Ensure visual results are correct even at the cost of performance
- Log issues for further investigation

## Expected Performance Benefits

| Scenario | Current | Optimized | Improvement |
|----------|---------|-----------|-------------|
| `?r=21:9&f=m` | 519ms | ~90ms | 83% |
| `?r=16:9&width=800` | 519ms | ~90ms | 83% |
| `?r=4:3&height=600` | 519ms | ~90ms | 83% |
| `?r=1:1` (no dimensions) | 519ms | 519ms | 0% (still needs metadata) |

Based on request patterns in production, we estimate this optimization would affect:
- 40-60% of aspect ratio requests
- 15-25% of all image requests
- Resulting in an overall average latency reduction of 15-20%

## Implementation Plan

### Phase 1: Analysis and Instrumentation (1 day)

1. Add detailed logging around metadata requirement decisions
2. Analyze the percentage of requests that could skip metadata
3. Verify parameter normalization is correct and comprehensive

### Phase 2: Safe Implementation (2 days)

1. Create the enhanced parameter normalization function
2. Implement the improved metadata requirement check
3. Add the direct dimension calculation function
4. Update the main transformation logic to use these new functions

### Phase 3: Testing and Validation (2 days)

1. Unit tests covering all parameter combinations
2. Visual regression tests to verify identical output
3. Performance testing to quantify latency improvements
4. Monitoring setup to track optimization effectiveness

## Monitoring and Validation

After deployment, we should monitor:

1. **Metadata Skipping Rate**: Percentage of requests avoiding metadata fetch
2. **Performance Impact**: Latency reduction for affected requests
3. **Error Rate Changes**: Any correlation between the change and errors
4. **Visual Comparison**: Sample request before/after to verify identical output

## Conclusion

This targeted optimization addresses a specific but common performance bottleneck in the image-resizer service. By eliminating unnecessary metadata fetching when aspect ratios are used with explicit dimensions, we can significantly reduce latency for many requests.

The approach prioritizes safety and compatibility while delivering substantial performance improvements. With proper implementation and monitoring, we can achieve a balance between optimal performance and robust functionality.