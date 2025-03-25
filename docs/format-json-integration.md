# Image Dimension Pre-fetch with Format:JSON

## Problem Statement

Currently, the image resizer makes transformation decisions without necessarily knowing the original image dimensions and aspect ratio. For specific operations like cropping, aspect ratio maintenance, and focal point detection, having this information before transformation would enable better quality results.

## Objectives

1. Leverage Cloudflare's `format: json` option to obtain image metadata when needed
2. Optimize performance by only fetching this data when necessary
3. Cache dimension results to prevent duplicate fetches
4. Enable smarter transformations based on the original image aspect ratio

## Technical Approach

### When to Pre-fetch Image Dimensions

We'll implement a targeted approach that only performs the additional `format: json` request when the transformation actually requires dimension information:

1. **Cropping operations**: When `fit: 'crop'` or `fit: 'cover'` is specified
2. **Aspect ratio transformations**: When derivative templates or transformations specify maintaining aspect ratios
3. **Focal point operations**: When `gravity: 'auto'` or specific focal points are being used
4. **Explicit requests**: When clients include a `_needsImageInfo=true` parameter

### Implementation Details

#### 1. Cache Layer

```typescript
interface ImageDimensionCache {
  // Key: Image path or URL
  // Value: Width, height, aspect ratio, and original format
  get(key: string): Promise<ImageDimensions | null>;
  set(key: string, dimensions: ImageDimensions): Promise<void>;
}

interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  format: string;
  lastFetched: number; // Timestamp
}
```

We'll implement this cache using:
- In-memory cache for immediate performance (with LRU eviction)
- KV for persistence across worker invocations (with reasonable TTL)

#### 2. Transform Process Flow

```
START
  |
  ↓
[Parse Request]
  |
  ↓
[Does transformation need dimensions?] → NO → [Skip to standard transform]
  | YES
  ↓
[Check dimension cache] → HIT → [Use cached dimensions]
  | MISS
  ↓
[Make format:json request]
  |
  ↓
[Store dimensions in cache]
  |
  ↓
[Enhance transform options with dimension data]
  |
  ↓
[Perform final transformation]
  |
  ↓
END
```

#### 3. StorageResult Enhancement

Modify the `StorageResult` interface to include dimension information:

```typescript
interface StorageResult {
  // Existing fields...
  width?: number;
  height?: number;
  aspectRatio?: number;
  originalFormat?: string;
}
```

### Performance Considerations

1. **Targeted application**: Only applying this approach to transformations that truly benefit
2. **Cache strategy**: Aggressive caching to minimize duplicate fetches
3. **Parallel fetching**: When dimensions are needed, fetch simultaneously with other setup operations
4. **Lightweight parsing**: Only extract essential metadata from the JSON response

## Implementation Plan

### Phase 1: Core Implementation ✅

1. ✅ Enhance `StorageResult` interface with dimension fields
2. ✅ Implement simple in-memory dimension cache
3. ✅ Add detection logic for identifying transformations that need dimensions
4. ✅ Implement the `format: json` pre-fetch in the transform function

### Phase 2: Optimization (Future)

1. Expand caching to use KV for persistence
2. Refine heuristics for when to fetch dimensions
3. Add cache invalidation strategies
4. Implement timeout and fallback mechanisms

### Phase 3: Advanced Features (Future)

1. Enable aspect ratio-aware derivative templates
2. Add smart crop positioning based on dimensions
3. Implement responsive transformations that adapt to the original aspect ratio
4. Add client-side hints for dimension awareness

## Usage Examples

### Direct Access to JSON Data

```
https://images.example.com/image.jpg?format=json
```

Returns:
```json
{
  "metadata": {
    "width": 1200,
    "height": 800,
    "format": "jpeg"
  },
  "result": {
    "width": 1200,
    "height": 800,
    "format": "json"
  }
}
```

### Smart Cropping with Dimension Awareness

```
https://images.example.com/image.jpg?fit=crop&width=400&height=400&_needsImageInfo=true
```

This will first fetch the image dimensions, then intelligently crop maintaining the focal content.

### Derivative with Aspect Ratio Maintenance

```
https://images.example.com/image.jpg?derivative=thumbnail
```

If the thumbnail derivative includes aspect ratio constraints, the system will automatically fetch dimensions to ensure proper proportions.

## Testing Strategy

1. **Unit tests**: Verify dimension extraction and caching logic
2. **Integration tests**: Test the full pre-fetch and transform workflow
3. **Performance tests**: Measure impact of dimension pre-fetching on overall response time
4. **Visual quality tests**: Compare transformation quality with and without dimension data

## Monitoring and Metrics

We will track:

1. Dimension cache hit rate
2. Average latency added by format:json fetches
3. Percentage of requests requiring dimension information
4. Error rates for the pre-fetch requests

## Future Enhancements

1. Machine learning-based content detection to inform crop positions
2. Pre-warming the dimension cache for frequently accessed images
3. Client-side optimization suggestions based on image dimensions
4. Batch dimension fetching for collections of images