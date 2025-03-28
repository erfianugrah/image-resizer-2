# Akamai Advanced Features Implementation Plan

This document outlines the implementation plan for adding advanced Akamai Image Manager compatibility features to the Image Resizer 2 project. It details how complex Akamai transformations are mapped to Cloudflare Image Resizing capabilities.

## Quick Navigation

- [Back to Documentation Home](../../index.md)
- [Akamai Integration](index.md)
- [Basic Features](basic-features.md)
- [Implementation Details](implementation.md)
- [Demos](demos.md)
- [Transformation Guide](../../core/transformation.md)

## Overview

The current Akamai compatibility module supports basic image transformations. This plan outlines the approach to add support for advanced Akamai features like:

- Composite/Watermarking
- Blur effects
- Mirror/Flip operations
- Conditional transformations
- HSL adjustments
- Advanced visual effects

## Implementation Improvements

The following improvements will be implemented to ensure backward compatibility and maintainable code:

### Core Transformations

Implement directly supported Cloudflare transformations:

- Blur effects
- Mirror/flip operations
- Simple visual adjustments

```typescript
// Add to translateAkamaiParams in akamai-compatibility.ts

// Handle blur
const imBlur = url.searchParams.get('im.blur');
if (imBlur) {
  const blurAmount = parseFloat(imBlur);
  if (!isNaN(blurAmount) && blurAmount > 0) {
    // Map Akamai's blur (0-100) to Cloudflare's (0-250)
    cfParams.blur = Math.min(250, Math.max(0, blurAmount * 2.5));
    logger.debug('Set blur parameter', { akamaiBur: blurAmount, cloudflareBlur: cfParams.blur });
  }
}

// Handle mirror (horizontal/vertical flip)
const imMirror = url.searchParams.get('im.mirror');
if (imMirror) {
  if (imMirror === 'horizontal' || imMirror === 'h') {
    cfParams.flip = true;
    logger.debug('Set horizontal mirror/flip');
  } else if (imMirror === 'vertical' || imMirror === 'v') {
    cfParams.flop = true;
    logger.debug('Set vertical mirror/flip');
  }
}
```

### Watermarking/Compositing

Implement Akamai's composite feature using Cloudflare's `draw` array:

```typescript
// Handle composite (watermark)
const imComposite = url.searchParams.get('im.composite');
if (imComposite) {
  try {
    logger.breadcrumb('Processing composite parameter', undefined, { parameter: imComposite });
    // Parse composite parameters
    const compositeParams = parseCompositeParams(imComposite);
    
    // Initialize draw array if needed
    if (!cfParams.draw) cfParams.draw = [];
    
    // Create draw object
    const drawObj: Record<string, any> = {
      url: compositeParams.url,
    };
    
    // Map position parameters
    if (compositeParams.placement) {
      switch (compositeParams.placement) {
        case 'north': drawObj.top = compositeParams.offset || 0; break;
        case 'south': drawObj.bottom = compositeParams.offset || 0; break;
        case 'east': drawObj.right = compositeParams.offset || 0; break;
        case 'west': drawObj.left = compositeParams.offset || 0; break;
        case 'northeast': 
          drawObj.top = compositeParams.offset || 0;
          drawObj.right = compositeParams.offset || 0;
          break;
        // Add other positions...
      }
    }
    
    // Handle opacity
    if (compositeParams.opacity !== undefined) {
      drawObj.opacity = Math.max(0, Math.min(1, compositeParams.opacity / 100));
    }
    
    // Handle tiling
    if (compositeParams.tile === true) {
      drawObj.repeat = true;
    }
    
    // Add to draw array
    cfParams.draw.push(drawObj);
    logger.debug('Added composite/watermark', { drawObject: drawObj });
  } catch (error) {
    logger.error('Failed to parse im.composite parameter', { 
      error: error instanceof Error ? error.message : String(error),
      composite: imComposite 
    });
  }
}

// Helper function to parse composite parameters
function parseCompositeParams(composite: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  // Split by commas, handling quoted values
  const parts = splitParameters(composite);
  
  for (const part of parts) {
    // Check for key:value or key=value format
    const separator = part.includes(':') ? ':' : '=';
    const [key, value] = part.split(separator).map(s => s.trim());
    
    if (key && value !== undefined) {
      // Special handling for url parameter
      if (key === 'url') {
        result.url = value;
      } 
      // Handle placement parameter
      else if (key === 'placement') {
        result.placement = value;
      }
      // Handle opacity parameter (convert to 0-100)
      else if (key === 'opacity') {
        const opacityValue = parseFloat(value);
        if (!isNaN(opacityValue)) {
          result.opacity = opacityValue;
        }
      }
      // Handle tile parameter (boolean)
      else if (key === 'tile') {
        result.tile = value.toLowerCase() === 'true';
      }
      // Handle offset parameter
      else if (key === 'offset') {
        const offsetValue = parseFloat(value);
        if (!isNaN(offsetValue)) {
          result.offset = offsetValue;
        }
      }
      // Other parameters
      else {
        // Convert to appropriate type (number, boolean, string)
        if (value.toLowerCase() === 'true') {
          result[key] = true;
        } else if (value.toLowerCase() === 'false') {
          result[key] = false;
        } else if (!isNaN(Number(value))) {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      }
    }
  }
  
  return result;
}
```

### Conditional Transformations

Implement conditional transformations like `im.if-dimension`:

```typescript
// Handle conditional transformations
const imIfDimension = url.searchParams.get('im.if-dimension');
if (imIfDimension) {
  try {
    logger.breadcrumb('Processing if-dimension condition', undefined, { condition: imIfDimension });
    
    // Store condition in metadata for processing during transformation
    cfParams._conditions = cfParams._conditions || [];
    cfParams._conditions.push({
      type: 'dimension',
      condition: imIfDimension
    });
    
    logger.debug('Added dimension condition for processing', { condition: imIfDimension });
  } catch (error) {
    logger.error('Failed to parse im.if-dimension parameter', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}
```

Add condition processing to transform.ts:

```typescript
// Add to buildTransformOptions
if (options._conditions) {
  // Process conditions based on image properties
  for (const condition of options._conditions) {
    if (condition.type === 'dimension') {
      // Parse and apply condition
      const dimensionResult = applyDimensionCondition(condition.condition, storageResult);
      // Merge resulting options
      Object.assign(result, dimensionResult);
    }
  }
  // Remove condition metadata
  delete result._conditions;
}

// Function to apply dimension conditions
function applyDimensionCondition(condition: string, storageResult: StorageResult): TransformOptions {
  // Format: width>500,im.resize=width:300
  const [conditionPart, transformPart] = condition.split(',', 2);
  
  // Parse condition
  const match = conditionPart.match(/^(width|height|ratio|format)([<>=]+)([0-9.]+)$/);
  if (!match) return {};
  
  const [_, property, operator, valueStr] = match;
  const value = parseFloat(valueStr);
  
  // Get image dimensions from headers or metadata
  let width = 0;
  let height = 0;
  
  // Get width and height from image (implementation depends on available metadata)
  // For now, assume we have width and height available in storageResult
  
  // Check condition
  let conditionMet = false;
  if (property === 'width') {
    conditionMet = evaluateCondition(width, operator, value);
  } else if (property === 'height') {
    conditionMet = evaluateCondition(height, operator, value);
  } else if (property === 'ratio') {
    if (width > 0 && height > 0) {
      const ratio = width / height;
      conditionMet = evaluateCondition(ratio, operator, value);
    }
  }
  
  // If condition is met, parse and apply the transformation
  if (conditionMet && transformPart) {
    // Create a mock URL to parse Akamai parameters
    const mockUrl = new URL(`https://example.com/?${transformPart.replace('im.', 'im.')}`);
    return translateAkamaiParams(mockUrl);
  }
  
  return {};
}

// Helper to evaluate comparison conditions
function evaluateCondition(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case '>': return actual > expected;
    case '>=': return actual >= expected;
    case '<': return actual < expected;
    case '<=': return actual <= expected;
    case '=':
    case '==': return actual === expected;
    default: return false;
  }
}
```

### Advanced Effects

For features without direct Cloudflare equivalents:

```typescript
// Handle HSL adjustments
const imHsl = url.searchParams.get('im.hsl');
if (imHsl) {
  try {
    // Parse HSL parameters
    const hslParams = parseHslParams(imHsl);
    
    // Apply saturation (Cloudflare native)
    if (hslParams.saturation !== undefined) {
      // Map from Akamai range (typically 0-200, where 100 is normal)
      // to Cloudflare range (0-2, where 1 is normal)
      cfParams.saturation = hslParams.saturation / 100;
    }
    
    // Apply brightness (Cloudflare native)
    if (hslParams.lightness !== undefined) {
      // Map from Akamai range to Cloudflare range
      cfParams.brightness = hslParams.lightness / 100;
    }
    
    // Hue can't be directly mapped to a Cloudflare parameter
    // Store for potential future implementation
    if (hslParams.hue !== undefined) {
      cfParams._customEffects = cfParams._customEffects || [];
      cfParams._customEffects.push({
        type: 'hue',
        value: hslParams.hue
      });
    }
  } catch (error) {
    logger.error('Failed to parse im.hsl parameter', { 
      error: error instanceof Error ? error.message : String(error),
      hsl: imHsl
    });
  }
}

// Helper function to parse HSL parameters
function parseHslParams(hsl: string): Record<string, number> {
  const result: Record<string, number> = {};
  
  // Split by commas
  const parts = hsl.split(',');
  
  for (const part of parts) {
    // Check for key:value or key=value format
    const separator = part.includes(':') ? ':' : '=';
    const [key, value] = part.split(separator).map(s => s.trim());
    
    if (key && value) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        result[key] = numValue;
      }
    }
  }
  
  return result;
}
```

## Configuration Updates

We'll add a new environment variable to enable advanced features:

```json
// wrangler.jsonc
"vars": {
  "ENABLE_AKAMAI_COMPATIBILITY": "true",
  "ENABLE_AKAMAI_ADVANCED_FEATURES": "true" 
}
```

In config.ts:

```typescript
// Add to ImageResizerConfig interface
features: {
  enableAkamaiCompatibility: boolean;
  enableAkamaiAdvancedFeatures?: boolean;
}

// Update getConfig function
const config: ImageResizerConfig = {
  // Other config
  features: {
    enableAkamaiCompatibility: env.ENABLE_AKAMAI_COMPATIBILITY === 'true',
    enableAkamaiAdvancedFeatures: env.ENABLE_AKAMAI_ADVANCED_FEATURES === 'true'
  }
};
```

## Testing Strategy

### Unit Tests

For each new feature:

1. Create test cases in `akamai-compatibility.spec.ts`
2. Test basic functionality
3. Test edge cases
4. Test error handling

Example:

```typescript
// In akamai-compatibility.spec.ts
describe('composite parameters', () => {
  it('translates basic watermark parameters', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:https://example.com/logo.png,placement:southeast');
    const result = translateAkamaiParams(url);
    
    expect(result.draw).toBeDefined();
    expect(Array.isArray(result.draw)).toBe(true);
    expect(result.draw[0].url).toBe('https://example.com/logo.png');
    expect(result.draw[0].right).toBeDefined();
    expect(result.draw[0].bottom).toBeDefined();
  });
  
  it('handles opacity parameter', () => {
    const url = new URL('https://example.com/image.jpg?im.composite=url:https://example.com/logo.png,opacity:50');
    const result = translateAkamaiParams(url);
    
    expect(result.draw[0].opacity).toBe(0.5);
  });
  
  // Additional tests...
});
```

### Visual Testing

For each feature, create visual test cases:

1. Create test images
2. Apply transformations with both Akamai and Cloudflare parameters
3. Compare visual results
4. Document in examples section

## Performance Considerations

1. Measure performance impact of each new feature
2. Avoid excessive computation in parameter parsing
3. Use proper error handling to prevent crashes
4. Add appropriate logging for debugging
5. Consider caching for expensive operations

## Documentation

Update the following documents:

1. `AKAMAI_COMPATIBILITY.md` - Add new parameters and examples
2. `AKAMAI_IMPLEMENTATION.md` - Document implementation details
3. Create visual examples for each feature
4. Add debugging tips specific to new features

## Implementation Process

1. Develop in feature branches
2. Create comprehensive tests
3. Deploy to staging environment
4. Conduct performance testing
5. Use feature flag (`ENABLE_AKAMAI_ADVANCED_FEATURES`) for controlled rollout


## Troubleshooting

### Feature Flag Issues

If advanced features aren't working as expected:

1. Verify `ENABLE_AKAMAI_ADVANCED_FEATURES` is set to `true` in your configuration
2. Check logs for any errors during parameter translation
3. Enable debug mode to see detailed information about the translation process
4. Compare your parameter usage against the demo examples
5. Test with a minimal example to isolate the issue

### Compatibility Limitations

When encountering compatibility limitations:

1. Review the feature mapping tables to understand what is supported
2. Consider alternative approaches using supported features
3. Check if the feature requires specific Cloudflare capabilities
4. Test with simpler parameter combinations
5. Consult the implementation documentation for workarounds

## Related Resources

- [Basic Features](basic-features.md) - Fundamental Akamai parameter support
- [Implementation Details](implementation.md) - Technical implementation details
- [Demos](demos.md) - Live examples of advanced Akamai features
- [Transformation Guide](../../core/transformation.md) - Native Cloudflare transformation options
- [Core Architecture: Akamai Compatibility](../../core/architecture.md#9-akamai-compatibility-utilsakamai-compatibilityts) - Architectural overview
- [Akamai Image Manager Documentation](https://techdocs.akamai.com/imaging/docs/image-manager) - Original Akamai documentation

---

*Last Updated: March 22, 2025*