# Aspect Ratio Metadata Fetching Fix

## Problem

When using aspect ratio parameters (e.g., `r=1:1`) with focal point (e.g., `p=0.7,0.5`), the system had two critical issues:

1. If client hints were present and providing a width parameter, the system would incorrectly skip metadata fetching or use client-detected dimensions that caused incorrect aspect ratio cropping.

2. The client-detected width was overriding aspect ratio calculations, resulting in distorted images that didn't maintain the requested aspect ratio.

## Solution

Our comprehensive fix addresses both issues with a more radical approach:

1. **For aspect ratio or focal point with client-detected width**:
   - Remove client-detected width completely at the beginning of processing
   - Store the original width for later use
   - Always fetch metadata to calculate proper dimensions based on original image
   - After proper aspect ratio processing, restore client width while maintaining correct proportions

2. **For aspect ratio or focal point with explicit width**:
   - Keep explicit width (no change)
   - Skip metadata fetching for efficiency
   - Calculate height based on aspect ratio

3. **For aspect ratio or focal point with no width**:
   - Fetch metadata (no change) 
   - Calculate dimensions based on original image

## Implementation Details

1. **Remove Client-Detected Width Before Processing**:
   ```typescript
   if (options.width && (options.__clientInfo || options.optimizedWidth)) {
     if (options.aspect || options.focal) {
       (options as any).__originalClientWidth = options.width;
       delete options.width; // Remove width so it doesn't interfere
     }
   }
   ```

2. **Enhanced Metadata Requirements for Special Cases**:
   ```typescript
   // Check if we have a client width stored (width was removed)
   const hasStoredClientWidth = (options as any).__originalClientWidth !== undefined;
   
   if (hasStoredClientWidth && !options.width) {
     // We're in the special case where we removed client-detected width
     return true; // Always require metadata in this case
   }
   ```

3. **Centralized Client Width Restoration After Processing**:
   ```typescript
   // Always scale to client width after all metadata processing
   const originalClientWidth = (options as any).__originalClientWidth;
   if (originalClientWidth && options.width && options.height) {
     const aspectRatio = options.height / options.width;
     options.width = originalClientWidth;
     options.height = Math.round(originalClientWidth * aspectRatio);
   }
   ```

4. **Handling Direct Aspect Ratio Calculations**:
   ```typescript
   // Handle case where we removed width but have no metadata processing result
   else if ((options as any).__originalClientWidth && !options.width && options.aspect) {
     const aspectParts = options.aspect.toString().replace('-', ':').split(':');
     if (aspectParts.length === 2) {
       const [aspectWidth, aspectHeight] = aspectParts.map(v => parseFloat(v));
       const aspectRatio = aspectHeight / aspectWidth;
       
       // Restore client width
       options.width = (options as any).__originalClientWidth;
       // Calculate height to maintain aspect ratio
       options.height = Math.round(options.width * aspectRatio);
     }
   }
   ```

## Why This Approach Works

The key insight is that for aspect ratio or focal point processing, client-detected width should not participate in the initial stage of aspect ratio calculation. Instead:

1. We completely remove client-detected width from the equation initially
2. We perform proper aspect ratio calculations based on original image or parameters
3. We then scale the resulting dimensions to the client width while preserving proportions

This approach ensures:
- Proper aspect ratio is maintained regardless of client hints
- Client detection still influences final image size (for responsive behavior)
- Explicit parameters still take precedence over auto-detected ones
- Metadata is fetched only when needed

## Example Behavior

1. URL with aspect ratio only (`/image.jpg?r=1:1`):
   - With client hints: Gets properly cropped square image at client-appropriate size
   - Without client hints: Gets properly cropped square image at default size

2. URL with aspect ratio + explicit width (`/image.jpg?r=1:1&w=500`):
   - Result: 500×500 square image with proper cropping
   - Explicit width is respected and properly proportioned

3. URL with aspect ratio + focal point (`/image.jpg?r=16:9&p=0.7,0.5`):
   - Result: Properly cropped 16:9 image focused on the specified point, sized for the client

## Testing and Validation

This solution was extensively tested with:
- Chrome browsers with client hints
- Safari browsers without client hints
- Various aspect ratios (1:1, 16:9, 4:3)
- Different focal points
- Multiple combinations of parameters

The fix ensures correct handling of all scenarios while respecting design principles about explicit parameters taking precedence.