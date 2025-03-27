# Parameter System - Metadata Integration

This document describes how the parameter system integrates with the metadata service to enable intelligent image transformations.

## Two-Phase Transformation Architecture

The image resizer uses a two-phase transformation approach to enable content-aware processing:

1. **Phase 1: Metadata Fetch**
   - A request with `format=json` is made to get the image metadata
   - This returns a JSON object with original dimensions, format, etc.
   - The metadata is used to inform intelligent transformation decisions

2. **Phase 2: Image Transform**
   - A second request is made with parameters informed by the metadata
   - Smart cropping uses the original dimensions to calculate optimal crops
   - Aspect ratio transformations use metadata for intelligent focal points

## Metadata Integration Components

### 1. `createMetadataFetchParameters()` Helper

The parameter system provides a simple helper function to create parameters for a metadata-only request:

```typescript
import { createMetadataFetchParameters } from '../parameters/metadata-fetch';

// Create basic metadata fetch parameters
const metadataParams = createMetadataFetchParameters();
// Result: { format: 'json' }

// Create metadata fetch parameters with EXIF data
const exifParams = createMetadataFetchParameters({ includeExif: true });
// Result: { format: 'json', metadata: 'keep' }
```

This function centralizes the logic for creating metadata-only request parameters, ensuring consistency and preventing mistakes.

### 2. Integration with Content-Aware Processing

Both the `AspectRatioProcessor` and `ContextAwareProcessor` set flags that trigger metadata fetching when needed:

```typescript
// In aspect-processor.ts
// When aspect ratio is specified, content-aware processing is enabled
context.state.contextAware = true;
context.parameters._contextAware = true;

// In context-processor.ts
// When ctx=true is specified, content-aware processing is enabled
if (value === true) {
  context.parameters.ctx = true;
  context.state.contextAware = true;
  context.parameters._contextAware = true;
}
```

### 3. Recursive Metadata Loop Prevention

The system includes measures to prevent recursive metadata fetching:

```typescript
// In CloudflareOptionsBuilder, format=json requests are handled specially
if (params.format === 'json') {
  // Remove parameters that would trigger another metadata fetch
  if (imageOptions.gravity === 'auto') {
    delete imageOptions.gravity;
    this.logger.debug('Removed gravity=auto for format=json request');
  }
}
```

## Example Usage Patterns

### Pattern 1: Standalone Metadata Fetching

```typescript
import { createMetadataFetchParameters } from '../parameters';

// Step 1: Create metadata-only parameters with anti-recursion flags
const metadataParams = createMetadataFetchParameters();
// Result: { format: 'json', _metadata_request: true, _skip_ctx: true }

// Step 2: Fetch metadata using these parameters
const metadataUrl = new URL(imageUrl);
// Add the parameters to the URL
Object.entries(metadataParams).forEach(([key, value]) => {
  metadataUrl.searchParams.set(key, String(value));
});
const metadataResponse = await fetch(metadataUrl.toString());
const metadata = await metadataResponse.json();
// Result: { width: 1440, height: 947, original: { ... } }

// Step 3: Use metadata to inform transformation parameters
const imageParams = {
  width: 800,
  height: Math.round(800 / (metadata.original.width / metadata.original.height))
};
```

#### Preventing Recursive Metadata Loops

The `createMetadataFetchParameters()` function adds special flags to prevent recursive metadata fetching:

```typescript
// Default behavior: Adds anti-recursion flags
const params = createMetadataFetchParameters();
// Result: { format: 'json', _metadata_request: true, _skip_ctx: true }

// Explicitly disable anti-recursion flags (not recommended)
const paramsWithoutProtection = createMetadataFetchParameters({
  skipMetadataRecursion: false
});
// Result: { format: 'json' }
```

These flags tell the system that this is a metadata request and should not trigger another metadata fetch:

1. `_metadata_request: true` - Marks this as a metadata-only request
2. `_skip_ctx: true` - Prevents the context-aware processing flag from being converted to `gravity=auto`, which would trigger another metadata fetch

Together, these flags prevent the 522 Connection Timeout errors caused by recursive metadata loops.

### Pattern 2: Integration with TransformationService

```typescript
import { createMetadataFetchParameters } from '../parameters';
import { MetadataService } from '../services/metadataService';

class TransformationService {
  constructor(private metadataService: MetadataService) {}
  
  async transformWithMetadata(imageUrl, transformOptions) {
    // Check if we need metadata for this transformation
    if (this.requiresMetadata(transformOptions)) {
      // Step 1: Create metadata parameters with anti-recursion flags
      const metadataParams = createMetadataFetchParameters({
        includeExif: transformOptions.preserveExif === true
      });
      
      // Step 2: Fetch metadata with anti-recursion protection
      const metadataUrl = new URL(imageUrl);
      Object.entries(metadataParams).forEach(([key, value]) => {
        metadataUrl.searchParams.set(key, String(value));
      });
      
      try {
        const metadataResponse = await fetch(metadataUrl.toString());
        
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          
          // Step 3: Enhance transformation options with metadata
          const enhancedOptions = this.enhanceWithMetadata(
            transformOptions, 
            metadata
          );
          
          // Step 4: Perform actual transformation
          return this.transform(imageUrl, enhancedOptions);
        } else {
          this.logger.warn('Metadata fetch failed, using original options', {
            status: metadataResponse.status,
            url: metadataUrl.toString()
          });
        }
      } catch (error) {
        this.logger.error('Error fetching metadata, using original options', {
          error: error instanceof Error ? error.message : String(error),
          url: metadataUrl.toString()
        });
      }
    }
    
    // No metadata needed or metadata fetch failed, transform directly
    return this.transform(imageUrl, transformOptions);
  }
  
  // Helper to determine if metadata is needed
  private requiresMetadata(options) {
    return options.ctx === true || 
           options.smart === true ||
           options.aspect !== undefined ||
           options.platform !== undefined;
  }
  
  // Helper to enhance options with metadata
  private enhanceWithMetadata(options, metadata) {
    const enhanced = { ...options };
    
    // Use original dimensions from metadata when available
    const originalWidth = metadata.original?.width || metadata.width;
    const originalHeight = metadata.original?.height || metadata.height;
    
    if (originalWidth && originalHeight) {
      enhanced._originalWidth = originalWidth;
      enhanced._originalHeight = originalHeight;
      enhanced._originalAspectRatio = originalWidth / originalHeight;
      
      // If aspect ratio is specified, calculate optimal dimensions
      if (options.aspect) {
        const [targetWidth, targetHeight] = options.aspect.split(':').map(Number);
        const targetRatio = targetWidth / targetHeight;
        const originalRatio = originalWidth / originalHeight;
        
        if (originalRatio > targetRatio) {
          // Original is wider - preserve height
          enhanced.height = options.height || originalHeight;
          enhanced.width = Math.round(enhanced.height * targetRatio);
        } else {
          // Original is taller - preserve width
          enhanced.width = options.width || originalWidth;
          enhanced.height = Math.round(enhanced.width / targetRatio);
        }
      }
    }
    
    return enhanced;
  }
}
```

## Best Practices

1. **Always use the helper function with default options**
   - Use `createMetadataFetchParameters()` with default options
   - This ensures the anti-recursion flags are added automatically
   - Prevents the 522 Connection Timeout errors caused by recursive metadata loops

2. **Use all parameters from the helper**
   - When constructing your URL, include all parameters returned by the helper
   - Don't just extract the `format=json` parameter and ignore others
   - The special flags are critical for preventing recursive loops

3. **Understand the metadata structure**
   - Be aware that Cloudflare's metadata format includes both transformed and original dimensions
   - Use `metadata.original.width` and `metadata.original.height` for aspect ratio calculations
   - Fall back to `metadata.width` and `metadata.height` if original is not available

4. **Separate fetch and transform concerns**
   - Keep metadata fetching logic separate from transformation logic
   - Use a two-phase approach with clean separation between phases

5. **Cache metadata when possible**
   - Metadata rarely changes for static images
   - Consider caching metadata responses to improve performance

6. **Handle metadata fetch failures gracefully**
   - Always have fallback logic if metadata fetching fails
   - Use reasonable defaults when metadata can't be fetched
   - Don't let the entire transformation fail if metadata is unavailable

## Architecture Benefits

This integration approach:

1. **Maintains separation of concerns**
   - Parameter system handles parameter creation and normalization
   - Metadata service handles fetching and processing metadata
   - Transformation service handles applying transformations

2. **Enables intelligent transformations**
   - Content-aware cropping based on original dimensions
   - Aspect ratio transformations with smart focal points
   - Platform-specific optimizations based on image content

3. **Prevents common pitfalls**
   - Avoids recursive metadata fetching loops
   - Prevents 522 Connection Timeout errors
   - Maintains clean code organization