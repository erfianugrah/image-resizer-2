# Metadata Service

The Metadata Service provides capabilities for fetching and processing image metadata, enabling advanced transformations based on image characteristics.

## Overview

The Metadata Service is a core component of the Image Resizer that enhances transformation capabilities by accessing and analyzing image metadata. This service enables "smart" transformations that automatically adapt to image content, dimensions, and other properties.

## Key Concepts

### Image Metadata

Image metadata refers to information about an image's properties, such as:

- Dimensions (width and height)
- Format (JPEG, PNG, WebP, etc.)
- Orientation
- EXIF data (when available)
- Content information

The Metadata Service fetches this information using Cloudflare's Image Resizing API with `format=json` parameter, which provides detailed image properties without requiring the full image to be downloaded.

### Smart Transformations

Smart transformations use metadata to optimize image processing based on the original image's characteristics:

- **Smart Cropping**: Automatically crop images to desired aspect ratios while preserving important content
- **Smart Formatting**: Choose optimal output formats based on image content (like preserving transparency)
- **Smart Quality**: Adjust quality settings based on image content complexity
- **Focal Point Preservation**: Ensure important subjects remain visible when cropping

### Aspect Ratio Processing

One of the primary capabilities of the Metadata Service is calculating optimal crop dimensions when converting images to specific aspect ratios:

- Determines whether to crop horizontally or vertically
- Calculates optimal crop offsets based on focal points
- Preserves as much relevant content as possible
- Handles special cases for social media platforms

## Service Interface

The Metadata Service implements the `MetadataFetchingService` interface:

```typescript
interface MetadataFetchingService {
  fetchMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<ImageMetadata>;
  
  processMetadata(
    metadata: ImageMetadata,
    targetAspect?: { width: number, height: number },
    options?: MetadataProcessingOptions
  ): TransformationResult;
  
  fetchAndProcessMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request,
    targetAspect?: { width: number, height: number },
    options?: MetadataProcessingOptions
  ): Promise<TransformationResult>;
  
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

## Implementation Details

### Request Coalescing

The service implements a request coalescing mechanism to prevent duplicate concurrent requests for the same metadata. When multiple transformations request metadata for the same image simultaneously, only one actual request is made, and the result is shared among all requesters.

Benefits:
- Reduces load on the Image Resizing API
- Improves performance for pages with multiple instances of the same image
- Prevents race conditions and unnecessary duplication

### Metadata Caching

The service implements in-memory caching of metadata to improve performance:

- Recently accessed metadata is stored in a memory cache
- Subsequent requests for the same image use cached metadata
- Eliminates redundant network requests

### Metadata Extraction Process

1. The service first attempts to extract basic information about the image from the storage service
2. It then makes a request to the Cloudflare Image Resizing API with `format=json`
3. The JSON response contains detailed image properties, including original dimensions
4. The service parses this information and structures it into a standardized `ImageMetadata` object

### Aspect Ratio Processing

When processing metadata for aspect ratio transformations, the service:

1. Compares the original image's aspect ratio with the target aspect ratio
2. Determines whether to crop horizontally or vertically
3. Calculates optimal crop dimensions and offsets
4. Adjusts crop position based on focal point information (if provided)
5. Applies device-specific constraints if required
6. Handles platform-specific requirements (e.g., Instagram's 4:5 portrait constraint)

## Configuration

The Metadata Service is configured through the following configuration parameters:

```json
{
  "metadata": {
    "enabled": true,
    "cacheSize": 500,
    "requestTimeout": 5000,
    "maxConcurrentRequests": 50,
    "platformSpecificAspectRatios": {
      "twitter": { "width": 16, "height": 9 },
      "facebook": { "width": 1.91, "height": 1 },
      "instagram": { "width": 1, "height": 1 }
    }
  }
}
```

## Usage Examples

### Basic Metadata Fetching

```typescript
// Within a service or handler
const metadata = await metadataService.fetchMetadata(
  imagePath,
  config,
  env,
  request
);

console.log(`Image dimensions: ${metadata.properties.width}x${metadata.properties.height}`);
```

### Smart Cropping with Aspect Ratio

```typescript
// Define target aspect ratio (16:9 widescreen)
const targetAspect = { width: 16, height: 9 };

// Process metadata with target aspect ratio
const transformResult = await metadataService.fetchAndProcessMetadata(
  imagePath,
  config,
  env,
  request,
  targetAspect,
  { focalPoint: { x: 0.5, y: 0.3 } }
);

// Use transformation result to create crop parameters
if (transformResult.aspectCrop) {
  const { width, height, hoffset, voffset } = transformResult.aspectCrop;
  // Apply crop using these dimensions
}
```

### Using with Transformation Service

The Metadata Service is used by the Transformation Service when the `smart=true` parameter is provided in transformation options:

```
https://image-resizer.example.com/image.jpg?smart=true&aspect=16:9
```

This automatically:
1. Fetches metadata for the image
2. Calculates optimal crop dimensions for the 16:9 aspect ratio
3. Applies the crop with intelligent positioning

## Best Practices

- **Enable Metadata Caching**: Ensure metadata caching is enabled for optimal performance
- **Use Smart Transformations**: Use the `smart=true` parameter for aspect ratio transformations
- **Provide Focal Points**: When possible, include focal point information with `p=x,y` parameter
- **Consider Cache Implications**: Remember that metadata requests bypass the cache, so use sparingly

## Troubleshooting

### Common Issues

#### Metadata Fetch Failures

If metadata fetching fails, the service will return a minimal result with default values. Common causes include:

- Image is inaccessible at the source
- Image format isn't supported by the metadata extraction process
- Network issues preventing metadata API access

#### Incorrect Aspect Ratio Results

If aspect ratio calculations don't produce expected results:

- Verify the image dimensions are being correctly detected
- Check that the focal point (if provided) is within valid range (0-1 for both x and y)
- Confirm the target aspect ratio values are reasonable and properly formatted

## See Also

- [Transformation Service](transformation.md)
- [Image Handler](../handlers/image-handler.md)
- [Smart Transformations](../features/smart-transformations.md)
- [Format JSON Usage](../features/format-json-usage.md)

---

*Last updated: 2025-05-02*