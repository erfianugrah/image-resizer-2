# Watermark Implementation in Akamai Compatibility Layer

This document explains the implementation of the watermark/composite functionality in the Akamai compatibility layer for Cloudflare Image Resizing.

## Overview

The Akamai Image Manager provides a feature called `im.composite` (or `im.watermark` as an alias) for adding image overlays to the main image. This feature has been mapped to Cloudflare's `draw` array functionality, which serves a similar purpose.

## Parameter Mapping

The following table shows how Akamai's composite parameters are mapped to Cloudflare's draw array parameters:

| Akamai Parameter | Cloudflare Parameter | Notes |
|-----------------|----------------------|-------|
| `url` | `url` | The URL of the watermark/overlay image |
| `placement` | `top`, `right`, `bottom`, `left` | Maps compass positions to edge distances |
| `opacity` | `opacity` | Converted from 0-100 scale to 0-1 scale |
| `offset` | Value of positioning property | Distance from the specified edge |
| `width` | `width` | Width of the overlay in pixels |
| `height` | `height` | Height of the overlay in pixels |
| `fit` | `fit` | How to resize the overlay (if dimensions provided) |
| `tile` | `repeat` | Enables tiling of the overlay |
| `background` | `background` | Background color (often for transparent PNGs) |
| `rotate` | `rotate` | Rotation angle (normalized to 90/180/270) |

## Placement Mapping

Akamai uses named positions for placement, while Cloudflare uses edge distances. The mapping works as follows:

| Akamai Placement | Cloudflare Properties |
|------------------|----------------------|
| `north` or `top` | `{ top: offset }` |
| `south` or `bottom` | `{ bottom: offset }` |
| `east` or `right` | `{ right: offset }` |
| `west` or `left` | `{ left: offset }` |
| `northeast` or `topright` | `{ top: offset, right: offset }` |
| `northwest` or `topleft` | `{ top: offset, left: offset }` |
| `southeast` or `bottomright` | `{ bottom: offset, right: offset }` |
| `southwest` or `bottomleft` | `{ bottom: offset, left: offset }` |
| `center` | Default (no positioning properties) |

## Example Transformations

### Basic Watermark (Southeast Corner)

```
# Akamai format:
im.composite=url:watermark.png,placement:southeast

# Cloudflare format:
draw=[{
  "url": "watermark.png",
  "bottom": 5,
  "right": 5
}]
```

### Watermark with Opacity and Custom Offset

```
# Akamai format:
im.composite=url:watermark.png,placement:southeast,opacity:80,offset:20

# Cloudflare format:
draw=[{
  "url": "watermark.png",
  "bottom": 20,
  "right": 20,
  "opacity": 0.8
}]
```

### Sized Watermark with Fit Mode

```
# Akamai format:
im.composite=url:watermark.png,width:100,height:50,fit:cover

# Cloudflare format:
draw=[{
  "url": "watermark.png",
  "width": 100,
  "height": 50,
  "fit": "cover"
}]
```

### Tiled/Repeated Watermark

```
# Akamai format:
im.composite=url:watermark.png,tile:true

# Cloudflare format:
draw=[{
  "url": "watermark.png",
  "repeat": true
}]
```

## Implementation Considerations

### Type Handling

The implementation carefully handles different data types:
- Booleans are properly converted (`true`/`false` strings to boolean values)
- Numbers are parsed and validated
- Strings are preserved as appropriate

### Validation

For parameters with specific allowed values:
- Fit values are validated against allowed values (`scale-down`, `contain`, `cover`, `crop`, `pad`)
- Rotation angles are normalized to what Cloudflare supports (90, 180, 270 degrees)
- Opacity values are clamped to the 0-1 range

### Error Handling

The implementation includes comprehensive error handling:
- Missing required parameters (like URL) are detected and reported
- Invalid values are normalized or defaulted when possible
- Detailed logging for troubleshooting

## Feature Flag

The watermark functionality requires the `enableAkamaiAdvancedFeatures` flag to be enabled. This allows administrators to control the availability of these advanced features.

## Testing

A comprehensive test suite is included to verify the correct parameter translation for various watermark configurations, ensuring robust and reliable functionality.

## Usage Examples

See the `WATERMARK_EXAMPLES.md` and `AKAMAI_DEMOS.md` documents for visual examples of the watermark functionality in action.