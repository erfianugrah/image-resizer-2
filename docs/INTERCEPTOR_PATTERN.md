# Cloudflare Image Resizing Interceptor Pattern

This document explains the interceptor pattern implementation in the Image Resizer, how it works with Cloudflare's Image Resizing service, and how it helps prevent 524 timeout errors.

## What is the Interceptor Pattern?

The interceptor pattern implemented in this project is a specialized solution for correctly handling Cloudflare's two-stage image processing system:

1. **Initial Request**: When a user requests an image with transformation parameters, your Worker receives the request.
2. **Transformation Request**: Cloudflare's Image Resizing service makes a subrequest to fetch the original image.
3. **Subrequest Detection**: Your Worker identifies these subrequests through the "via: image-resizing" header.
4. **Direct Image Service**: For subrequests, your Worker serves the original image directly without additional transformations.
5. **Final Response**: The end user receives the properly transformed image.

## Why is this Pattern Necessary?

Without the interceptor pattern, Cloudflare Workers using Image Resizing can experience a circular request flow that leads to 524 timeout errors:

1. Worker receives request for image with transformation parameters
2. Worker uses `cf.image` to apply transformations
3. Cloudflare Image Resizing service attempts to fetch the original image by making a subrequest to your Worker
4. Without detecting this is a subrequest, your Worker applies transformations again
5. This creates an infinite loop that eventually times out (524 error)

The problem is particularly evident with large images (13MB+) where processing times are longer. Our live demo examples at images.erfi.dev/Granna_1.JPG showcase the successful handling of a 13MB+ image.

## Implementation Details

The interceptor pattern is implemented in two key locations:

### 1. In `transform.ts`:

```typescript
// Check if this is an image-resizing subrequest - if so, we shouldn't transform
const via = request.headers.get('via') || '';
if (via.includes('image-resizing')) {
  logger.debug('Detected image-resizing subrequest, skipping transformation', {
    path: storageResult.path,
    via,
    sourceType: storageResult.sourceType,
    storageOrder: config.storage.priority.join(',')
  });
  return storageResult.response;
}
```

This code in the `transformImage` function detects if the current request is a subrequest from Cloudflare Image Resizing. If so, it returns the original image directly without applying additional transformations.

### 2. In `storage.ts`:

```typescript
// First, check the request type to determine if this is a Cloudflare Image Resizing subrequest
const via = request?.headers.get('via') || '';
const isImageResizingSubrequest = via.includes('image-resizing');

// Special handling for Image Resizing subrequests
if (isImageResizingSubrequest) {
  logger.breadcrumb('Detected image-resizing subrequest', undefined, { path });
  
  // Special handling for R2 storage and path transformations for subrequests...
  // ...
}
```

The `fetchImage` function contains additional logic for handling subrequests, with special consideration for R2 storage and path transformations.

## How to Verify the Pattern is Working

You can verify the interceptor pattern is working correctly by checking:

1. **Request Logs**: Look for log entries containing "Detected image-resizing subrequest"
2. **Performance Metrics**: Large images should transform without timeout errors
3. **Debug Headers**: Enable debug mode with `?debug=true` and look for headers indicating subrequest handling

Example log patterns when working correctly:
```
[INFO] [Transform] 🔶 BREADCRUMB: Detected image-resizing subrequest, skipping transformation
[INFO] [Storage] 🔶 BREADCRUMB: Using R2 for image-resizing subrequest
```

## Path Transformations with Subrequests

The interceptor pattern includes special handling for path transformations in subrequests:

1. When Cloudflare makes a subrequest, we apply configured path transformations to find the correct file in R2.
2. If the transformed path doesn't match a file, we fall back to the normalized path.
3. This ensures proper integration with directory structure mappings in your configuration.

Example path transformation configuration:
```javascript
"pathTransforms": {
  "assets": {
    "removePrefix": true,
    "prefix": "img/"
  }
}
```

With this configuration, a request for `/assets/logo.png` would be transformed to `/img/logo.png` for storage lookup.

### Cross-Origin Path Transformations

Path transformations are now applied to all storage origins (R2, remote URLs, and fallback URLs) with origin-specific customization options. This allows you to customize how paths are mapped across different storage backends:

```javascript
"pathTransforms": {
  "assets": {
    // Default transform used if no origin-specific transform exists
    "removePrefix": true,
    "prefix": "img/",
    
    // Origin-specific transforms
    "r2": {
      "removePrefix": true,
      "prefix": "img/"
    },
    "remote": {
      "removePrefix": true,
      "prefix": "images/"
    },
    "fallback": {
      "removePrefix": true,
      "prefix": "content/"
    }
  }
}
```

With this configuration, a request for `/assets/logo.png` would transform to:
- R2: `/img/logo.png` 
- Remote: `/images/logo.png`
- Fallback: `/content/logo.png`

This provides flexibility for complex multi-origin scenarios where the same logical path maps to different physical paths across different storage origins.

## Troubleshooting

If you're experiencing 524 timeout errors despite the interceptor pattern:

1. **Check Debug Headers**: Enable debug mode with `?debug=true` to view detailed processing information.
2. **Verify Via Header Parsing**: Ensure the code is correctly identifying "via: image-resizing" headers.
3. **Inspect Breadcrumb Logs**: Look for missing or incomplete logs in the subrequest handling sequence.
4. **Test with Different Image Sizes**: Try images of various sizes to identify size-related thresholds.
5. **Check for Config Issues**: Verify that your Image Resizing configuration options aren't creating excessive complexity.

For detailed error diagnosis, see [DIAGNOSING_TIMEOUTS.md](./DIAGNOSING_TIMEOUTS.md).

## Best Practices with the Interceptor Pattern

To optimize your implementation of the interceptor pattern:

1. **Keep Original Images Available**: Ensure original images are accessible in your storage
2. **Configure Path Transformations Carefully**: Map URL paths to storage paths correctly
3. **Add Detailed Logging**: Include breadcrumb logging around subrequest processing
4. **Test with Large Images**: Verify the pattern works with various image sizes
5. **Monitor Cache Headers**: Ensure proper caching for both original and transformed images
6. **Consider Storage Priority**: Configure your storage priority order to optimize for your specific use case

## Related Documentation

- [DIAGNOSING_TIMEOUTS.md](./DIAGNOSING_TIMEOUTS.md): Detailed information on diagnosing 524 timeout errors
- [STORAGE.md](./STORAGE.md): Storage configuration and priority system
- [TRANSFORMATION.md](./TRANSFORMATION.md): Image transformation options and best practices